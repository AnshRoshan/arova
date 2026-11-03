import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { agents, approvals, delegations, messages } from "@/db/schema";
import { completionMessage, completionText, estimateTokens, loadProfiles, readSseText, requestCompletion, resolveForAgent, usageFromJson, type ModelMessage, type ProviderProfile } from "@/lib/model-gateway";
import { loadSearchProfile } from "@/lib/web-search";
import { READONLY_TOOL_IDS, runToolLoop, toolDefinitions } from "@/lib/tool-loop";
import { ORG_SYSTEM, buildPeerPrompt, decollide, extractJsonObject, extractRoster, fallbackRoster, isOrgIntent, isTeamIntent, mentionConsult, parseRouting, parseTurn, resolvePeer, routingPrompt, type Roster, type Routing } from "@/lib/orchestration";
import { allowsAction, normaliseCapabilities, planBlocks, resolveTools, tokenBudgetFor } from "@/lib/tools";
import { decollideOrg, normaliseOrg, orgTemplate, type Org } from "@/lib/org";
import { requestedOrgName, summonCeiling, denialBreaker, type ApprovalOutcome } from "@/lib/channel";
import { splitReasoning } from "@/lib/markdown";
import { audit } from "@/lib/audit";
import { overQuota, recordUsage } from "@/lib/budget";
import { workerEnabled, schedulerIntervalSeconds } from "@/lib/worker-config";
import { board } from "@/lib/board-payload";
import { chatMessages, failureReply, maxDelegations, notifyChannels, peersOf, quotaReply, recentTurns, recallMemories, requestTimeoutMs, requireBudget, QuotaExceeded, streamTimeoutMs, type ChatAgent, type Peer, type Reply, type Turn } from "@/lib/board-core";

const ROUTINE_INTENT = /every day|every morning|every week|weekday|daily|weekly|each morning|every monday|every friday|schedule|remind me/;

const LOCAL_REPLY: Reply = { content: "I can help organize this workspace, but live AI chat needs a configured model provider on the server. You can create agents and routines here now. I have not accessed any external tools or websites.", kind: "message", metadata: { provider: "local" } };

function routineProposal(content: string): Reply {
  const name = /inbox|email/.test(content) ? "Inbox briefing" : /news|industry|research/.test(content) ? "Research digest" : /week|priority/.test(content) ? "Weekly check-in" : "New routine";
  const schedule = /weekday/.test(content) ? "Weekdays at 8:00 AM" : /friday/.test(content) ? "Every Friday at 4:00 PM" : /monday|weekly|every week/.test(content) ? "Every Monday at 9:00 AM" : "Every day at 8:00 AM";
  // The confirm path already states the worker truth; the proposal must not contradict it.
  const workerNote = workerEnabled()
    ? `The always-on scheduler checks for due routines every ${schedulerIntervalSeconds()} seconds while this server is running.`
    : "The in-process scheduler is switched off on this server, so a routine fires only when an outside clock calls /api/cron or when you open the workspace.";
  return { content: `I can set that up as a routine. Review the schedule and confirm when you're ready. ${workerNote}`, kind: "routine_proposal", metadata: { name, description: content, schedule } };
}

const ROSTER_SYSTEM = `You design small teams of AI teammates for a workspace. Reply with ONLY a JSON object, no prose, shaped exactly like:
{"team":"<name>","agents":[{"name":"<first name>","role":"<speciality>","instructions":"<what it should do>"}]}
Give 2 to 4 agents, each with a distinct speciality that the others do not cover, names that are not already taken, and instructions written as duties. No markdown fences.`;

function teamProposalReply(roster: Roster): Reply {
  const names = roster.agents.map(a => a.name).join(", ");
  return {
    content: `I would put together ${roster.team}: ${names}. Nothing has been created yet — review the roster and confirm, and I will add them to your workspace.`,
    kind: "team_proposal",
    metadata: { team: roster.team, agents: roster.agents },
  };
}

function orgProposalReply(org: Org): Reply {
  const root = org.members.find(m => !m.reportsTo) ?? org.members[0];
  const levels = org.members.some(m => m.reportsTo && org.members.some(x => x.reportsTo === m.name)) ? 3 : org.members.some(m => m.reportsTo) ? 2 : 1;
  return {
    content: `${org.team} is drawn below: ${org.members.length} seats across ${levels} levels, all reporting up to ${root.name}. Nothing exists yet — the chart is a proposal, and every seat is created only when you confirm it.`,
    kind: "org_proposal",
    metadata: { team: org.team, brief: org.brief, agents: org.members },
  };
}

/** One model call to design the org; the reviewed template if the model will not produce valid JSON. */
async function proposeOrg(prompt: string, profile: ProviderProfile, workspaceId: string): Promise<Org | null> {
  // L-11: the name the human typed — quoted or spoken — is theirs, not the model's to invent.
  const requested = requestedOrgName(prompt);
  if (profile.configured) {
    try {
      const response = await requestCompletion({ profile, messages: [{ role: "system", content: ORG_SYSTEM }, { role: "user", content: prompt.slice(0, 1500) }], maxTokens: 1400, stream: false, timeoutMs: requestTimeoutMs() });
      const body = await response.json();
      const text = completionText(body);
      const counted = usageFromJson(body);
      await recordUsage(workspaceId, profile.name, counted?.input ?? estimateTokens(prompt), counted?.output ?? estimateTokens(text), Boolean(counted));
      const org = normaliseOrg(extractJsonObject(splitReasoning(text).rest) ?? {});
      if (org && org.members.length >= 2) return requested ? { ...org, team: requested } : org;
    } catch (error) {
      console.error("Org proposal failed", error instanceof Error ? error.message : "unknown error");
    }
  }
  return orgTemplate(requested ?? "", prompt.slice(0, 300));
}

/** One model call to design the roster; a deterministic family if no key or bad output. */
async function proposeRoster(prompt: string, profile: ProviderProfile, workspaceId: string): Promise<Roster | null> {
  const taken = (await db.select({ name: agents.name }).from(agents).where(and(eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt)))).map(r => r.name);
  const takenNames = taken;
  if (profile.configured) {
    try {
      const response = await requestCompletion({ profile, messages: [{ role: "system", content: ROSTER_SYSTEM }, { role: "user", content: `Design a team for: ${prompt.slice(0, 1500)}
Names already in use, avoid them: ${takenNames.join(", ") || "none"}` }], maxTokens: 700, stream: false, timeoutMs: requestTimeoutMs() });
      const body = await response.json();
      const text = completionText(body);
      const counted = usageFromJson(body);
      await recordUsage(workspaceId, profile.name, counted?.input ?? estimateTokens(prompt), counted?.output ?? estimateTokens(text), Boolean(counted));
      const roster = extractRoster(splitReasoning(text).rest);
      if (roster) return roster;
    } catch (error) {
      console.error("Roster proposal failed", error instanceof Error ? error.message : "unknown error");
    }
  }
  return fallbackRoster(prompt);
}

/**
 * The decision that both reply paths share: propose a routine, stay honest in local mode,
 * respect the daily budget, or hand back the payload for a real vendor call.
 */
export async function planReply(workspaceId: string, agent: ChatAgent, history: Turn[]) {
  const last = history[history.length - 1];
  const prompt = last?.role === "user" ? last.content : "";
  // An organisation is checked before a flat team: the hierarchy is the part that would be lost.
  const capsForIntent = normaliseCapabilities(agent.capabilities);
  if (prompt && isOrgIntent(prompt) && resolveTools(capsForIntent, { hasTeam: true }).includes("build_org") && !planBlocks("build_org", capsForIntent.permissionMode)) {
    const wantedForOrg = resolveForAgent(agent.provider, loadProfiles());
    const takenForOrg = (await db.select({ name: agents.name }).from(agents).where(and(eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt)))).map(r => r.name);
    const org = await proposeOrg(prompt, wantedForOrg, workspaceId);
    if (org) return { kind: "reply" as const, reply: orgProposalReply(decollideOrg(org, takenForOrg)) };
  }
  // Team intent is checked next: "build me a team that runs every monday" is about the team.
  if (prompt && isTeamIntent(prompt)) {
    const wanted = resolveForAgent(agent.provider, loadProfiles());
    const takenNames = (await db.select({ name: agents.name }).from(agents).where(and(eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt)))).map(r => r.name);
    const roster = await proposeRoster(prompt, wanted, workspaceId);
    if (roster) return { kind: "reply" as const, reply: teamProposalReply(decollide(roster, takenNames)) };
    return { kind: "reply" as const, reply: { content: "I could not put a roster together for that just now, so nothing was created. Ask me again with the specialities you want, or add teammates yourself from the + button.", kind: "provider_error", metadata: { teamIntent: true } } };
  }
  if (prompt && ROUTINE_INTENT.test(prompt)) return { kind: "reply" as const, reply: routineProposal(prompt) };

  const profile = resolveForAgent(agent.provider, loadProfiles());
  if (profile.name === "local") return { kind: "reply" as const, reply: LOCAL_REPLY };
  // Selected but unusable: save the config notice, never a pretend reply, never a request.
  if (!profile.configured) {
    return { kind: "reply" as const, reply: { content: `${profile.label} is selected for this teammate but is not configured on this server. It needs its API key${profile.builtIn ? "" : ", base URL and model"}. No model call was made.`, kind: "provider_error", metadata: { provider: profile.name, unconfigured: true } } };
  }
  if (await overQuota(workspaceId, profile)) return { kind: "reply" as const, reply: quotaReply(profile) };

  const caps = normaliseCapabilities(agent.capabilities);
  const allPeers = await peersOf(workspaceId, agent);
  const granted = resolveTools(caps, { hasTeam: allPeers.length > 0 });
  // The seat's own turn ceiling is part of the plan, so every reply path honours it — a seat allowed
  // one turn has no summons, and the capabilities slider is not decoration.
  const ceiling = summonCeiling({ envMax: maxDelegations(), seatMaxTurns: caps.maxTurns });
  const consultPeers = ceiling > 0 && granted.includes("consult_teammate") ? allPeers.filter(p => allowsAction(caps, "consult_teammate", p.id)) : [];
  const handoffPeers = granted.includes("handoff") ? allPeers.filter(p => allowsAction(caps, "handoff", p.id)) : [];
  const allowed = {
    consult: consultPeers.length > 0,
    handoff: handoffPeers.length > 0,
    approval: granted.includes("request_approval") && !planBlocks("request_approval", caps.permissionMode),
    build: granted.includes("build_org") && !planBlocks("build_org", caps.permissionMode),
  };
  // What the org already recorded about this, scoped to the actor's own team.
  const memory = await recallMemories(workspaceId, agent.teamId, prompt);
  const chat = chatMessages(agent, history, profile, consultPeers, undefined, memory.block || undefined, caps.toolLoop);
  // The tool loop is opt-in and read-only. Search is offered only when the operator configured a
  // provider and this seat already holds web_fetch; the model never gets a shell from this path.
  const searchProfile = loadSearchProfile();
  const toolIds = caps.toolLoop ? [
    ...granted.filter(id => (READONLY_TOOL_IDS as readonly string[]).includes(id)),
    ...(searchProfile.configured && granted.includes("web_fetch") ? ["web_search"] : []),
  ] : [];
  const tools = toolDefinitions(toolIds, searchProfile.configured);
  return { kind: "model" as const, profile, chat, caps, ceiling, allowed, consultPeers, handoffPeers, memory: memory.provenance, inputTokens: estimateTokens(chat.map(m => m.content ?? "").join("")), toolLoop: caps.toolLoop, toolIds, tools, searchProfile };
}

/** Stream a provider reply straight to the client, returning the text and why it ended. */
/**
 * Ask the cheap routing pass what to do. `allowed` carries only the actions the agent is
 * actually granted, so removing a capability in the UI removes the option from the model
 * rather than asking the model politely to ignore a tool it still has.
 */
export async function routeDecision(question: string, peers: Peer[], profile: ProviderProfile, workspaceId: string, allowed: { consult: boolean; handoff: boolean; approval: boolean; build: boolean }, signal?: AbortSignal): Promise<Routing> {
  if (!allowed.consult && !allowed.handoff && !allowed.approval && !allowed.build) return { action: "none" };
  try {
    await requireBudget(workspaceId, profile);
    const response = await requestCompletion({
      profile,
      messages: [{ role: "system", content: "You are a router. Reply with only the JSON object requested. No prose, no explanation." }, { role: "user", content: routingPrompt(question, peers, allowed) }],
      maxTokens: 1600,
      stream: false,
      timeoutMs: requestTimeoutMs(),
      signal,
    });
    const body = await response.json();
    const text = completionText(body);
    // The router is a real vendor call, so it is counted like one. Left uncounted it would quietly
    // spend the daily budget the brief is supposed to respect.
    const counted = usageFromJson(body);
    await recordUsage(workspaceId, profile.name, counted?.input ?? estimateTokens(question), counted?.output ?? estimateTokens(text), Boolean(counted));
    return parseRouting(text);
  } catch (error) {
    // A failed router must not cost the user their answer: fall through to a direct reply.
    console.error("Routing pass failed", error instanceof Error ? error.message : "unknown error");
    return { action: "none" };
  }
}

/**
 * One hop of a chain. The peer answers with its own role and provider, is counted, and — if the
 * budget allows and its own seat grants it — may pull in someone below or beside it first. That
 * recursion is what turns a panel of assistants into an organisation: work goes down, answers
 * come back up, and every hop in between is a row in `delegations`.
 */
export async function consultPeer(
  workspaceId: string,
  asker: { id: string; name: string },
  peer: Peer,
  question: string,
  chain: { depth: number; visited: string[]; send: (payload: Record<string, unknown>) => void; signal?: AbortSignal },
): Promise<string> {
  const profile = resolveForAgent(peer.provider, loadProfiles());
  if (!profile.configured) throw new Error(`${peer.name} uses ${profile.label}, which has no key on this server`);
  const caps = normaliseCapabilities(peer.capabilities);
  let gathered = "";
  // Each seat's own turn ceiling bounds how far it may reach; a seat allowed one turn answers alone.
  if (chain.depth < summonCeiling({ envMax: maxDelegations(), seatMaxTurns: caps.maxTurns }) && resolveTools(caps, { hasTeam: true }).includes("consult_teammate") && !planBlocks("consult_teammate", caps.permissionMode)) {
    const below = (await peersOf(workspaceId, { id: peer.id, teamId: peer.teamId ?? null }))
      .filter(p => !chain.visited.includes(p.id) && allowsAction(caps, "consult_teammate", p.id));
    if (below.length) {
      let decision = await routeDecision(question, below, profile, workspaceId, { consult: true, handoff: false, approval: false, build: false }, chain.signal);
      if (decision.action === "none") {
        const named = mentionConsult(question, below, peer.id);
        if (named) decision = { action: "consult", agent: named.agent, question: named.question };
      }
      const sub = decision.action === "consult" && decision.question ? resolvePeer(decision.agent ?? "", below, peer.id) : null;
      if (sub && decision.question) {
        chain.send({ type: "consult", from: peer.name, to: sub.name, role: sub.role, question: decision.question });
        const subAnswer = await consultPeer(workspaceId, { id: peer.id, name: peer.name }, sub, decision.question, { depth: chain.depth + 1, visited: [...chain.visited, sub.id], send: chain.send, signal: chain.signal });
        gathered = `${String.fromCharCode(10)}${String.fromCharCode(10)}${sub.name} (${sub.role}) was asked "${decision.question}" and answered: ${subAnswer}. Weigh that against your own seat and disagree if it is wrong.`;
        await db.insert(delegations).values({ workspaceId, fromAgentId: peer.id, toAgentId: sub.id, question: decision.question, answer: subAnswer, model: profile.model, inputTokens: estimateTokens(question), outputTokens: estimateTokens(subAnswer) });
      }
    }
  }
  await requireBudget(workspaceId, profile);
  const response = await requestCompletion({ profile, messages: [{ role: "system", content: buildPeerPrompt({ name: peer.name, role: peer.role, instructions: peer.instructions }, question, asker.name) + gathered }], maxTokens: 700, stream: false, timeoutMs: requestTimeoutMs(), signal: chain.signal });
  const body = await response.json();
  const answer = completionText(body);
  const counted = usageFromJson(body);
  await recordUsage(workspaceId, profile.name, counted?.input ?? estimateTokens(question), counted?.output ?? estimateTokens(answer), Boolean(counted));
  return answer;
}

/** The peer's answer arrives as context the asking agent must weigh, not text to copy. */
export function integrateMessages(chat: { role: string; content: string }[], peer: Peer, question: string, answer: string) {
  const NL = String.fromCharCode(10);
  return [
    ...chat,
    { role: "user", content: `You asked ${peer.name} (${peer.role}): ${question}${NL}${peer.name} answered: ${answer}${NL}${NL}Now answer the user yourself, weighing what ${peer.name} contributed. Do not paste their reply wholesale, and do not claim any action neither of you performed.` },
  ];
}

/**
 * Raise an action for the human — or hold, when they have already said no enough times.
 * Both reply paths use this, so a seat cannot ask around the breaker by which client asked it.
 */
export async function approvalReply(workspaceId: string, agent: ChatAgent, title: string, detail: string): Promise<Reply> {
  const decided = await db.select({ status: approvals.status }).from(approvals)
    .where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.agentId, agent.id), sql`${approvals.status} <> 'PENDING'`))
    .orderBy(desc(approvals.createdAt)).limit(50);
  const breaker = denialBreaker(decided.map(r => r.status as ApprovalOutcome));
  if (breaker.tripped) {
    await audit(workspaceId, agent.id, "approval.withheld", `${title}: ${breaker.reason ?? "denial breaker"}`);
    return { content: `I stopped short of asking again: ${breaker.reason}, so I have not raised “${title}”. Nothing was done and nothing is waiting on you. Ask me directly when you want me to propose something.`, kind: "approval_withheld", metadata: { consecutive: breaker.consecutive, denials: breaker.denials, considered: breaker.considered, title } };
  }
  const [approval] = await db.insert(approvals).values({ workspaceId, agentId: agent.id, title, detail, risk: "WRITE" }).returning();
  await audit(workspaceId, agent.id, "approval.requested", title);
  void notifyChannels(workspaceId, agent.teamId, { kind: "approval", title, status: "PENDING", summary: detail, agentName: agent.name, approvalId: approval.id });
  return { content: `I stopped and raised this for you to decide: ${title}. Nothing was done, and I will not act on it until you approve it.`, kind: "approval_request", metadata: { approvalId: approval.id, title, detail } };
}

export type ModelPlan = Extract<Awaited<ReturnType<typeof planReply>>, { kind: "model" }>;

/**
 * The opt-in read-only tool loop. The model can call the seat's granted local tools, web_fetch and
 * web_search (when configured); it cannot call a shell. Each model turn is counted; each tool call is
 * audited. The final answer is returned to the caller, which streams it as one delta.
 */
async function runAgentToolLoop(workspaceId: string, agent: ChatAgent, plan: ModelPlan, messages: ModelMessage[], send: (payload: Record<string, unknown>) => void, control: { signal?: AbortSignal; shouldStop?: () => boolean } = {}) {
  let inputTokens = 0, outputTokens = 0, countedAny = false;
  const result = await runToolLoop({
    messages,
    tools: plan.tools,
    allowed: plan.toolIds,
    deps: { searchProfile: plan.searchProfile },
    maxSteps: 4,
    shouldStop: control.shouldStop,
    onEvent: event => send({ type: "tool", name: event.name, status: event.status, ...(event.detail ? { detail: event.detail } : {}) }),
    audit: detail => { void audit(workspaceId, agent.id, "tool.called", detail); },
    complete: async (turnMessages, tools) => {
      await requireBudget(workspaceId, plan.profile);
      const response = await requestCompletion({ profile: plan.profile, messages: turnMessages, maxTokens: tokenBudgetFor(plan.caps), stream: false, timeoutMs: requestTimeoutMs(), tools, signal: control.signal });
      const body = await response.json();
      const message = completionMessage(body);
      const counted = usageFromJson(body);
      const inTokens = counted?.input ?? estimateTokens(turnMessages.map(m => m.content ?? "").join(""));
      const outTokens = counted?.output ?? estimateTokens(message.content);
      await recordUsage(workspaceId, plan.profile.name, inTokens, outTokens, Boolean(counted));
      if (counted) countedAny = true;
      inputTokens += inTokens;
      outputTokens += outTokens;
      return { content: message.content, toolCalls: message.toolCalls };
    },
  });
  return { ...result, usage: { input: inputTokens, output: outputTokens, counted: countedAny } };
}

/**
 * What a tool-loop reply records about itself. The citation report rides along so the reader can
 * see a number the model invented rather than a tidy source list implying every claim was checked.
 */
function toolLoopMetadata(result: Awaited<ReturnType<typeof runAgentToolLoop>>, profile: { name: string; model: string }, hop: { peer: { name: string }; question: string } | null) {
  return {
    provider: profile.name,
    model: profile.model,
    ...(result.used.length ? { toolsUsed: result.used } : {}),
    ...(result.sources.length ? { sources: result.sources } : {}),
    citations: result.citations,
    ...(result.stopped ? { incomplete: true, stopped: true } : result.partial ? { incomplete: true, ...(result.stepLimit ? { stepLimit: true } : { truncated: true }) } : {}),
    ...(hop ? { consulted: [{ name: hop.peer.name, question: hop.question }] } : {}),
  };
}

/** Unary reply: used when a client asks for a plain JSON response (stream === false). */
export async function buildReply(workspaceId: string, agent: ChatAgent, history: Turn[]): Promise<Reply> {
  const plan = await planReply(workspaceId, agent, history);
  if (plan.kind === "reply") return plan.reply;
  try {
    const asked = history[history.length - 1]?.content ?? "";
    const decision = await routeDecision(asked, plan.consultPeers, plan.profile, workspaceId, plan.allowed);
    // The unary path must reach the same decisions the streaming path can, or the same message
    // behaves differently depending on which client asked.
    if (decision.action === "build" && plan.allowed.build && decision.org) {
      const org = { ...decision.org, team: requestedOrgName(asked) ?? decision.org.team };
      return { content: `I sketched ${org.team} for you: ${org.agents.length} seats with reporting lines. Nothing exists until you confirm the chart below.`, kind: "org_proposal", metadata: { team: org.team, brief: org.brief, agents: org.agents } };
    }
    if (decision.action === "approval" && plan.allowed.approval) {
      return approvalReply(workspaceId, agent, decision.title ?? "Action needs your approval", decision.detail ?? `${agent.name} did not describe what it wanted to do.`);
    }
    const peer = decision.action === "consult" ? resolvePeer(decision.agent ?? "", plan.consultPeers, agent.id) : null;
    let chat = plan.chat;
    let hop: { peer: Peer; question: string; answer: string } | null = null;
    if (peer && decision.action === "consult" && decision.question) {
      hop = { peer, question: decision.question, answer: await consultPeer(workspaceId, agent, peer, decision.question, { depth: 1, visited: [agent.id, peer.id], send: () => {} }) };
      chat = integrateMessages(plan.chat, peer, hop.question, hop.answer);
    }
    if (plan.toolLoop && plan.tools.length) {
      const result = await runAgentToolLoop(workspaceId, agent, plan, chat, () => {});
      return { content: result.content, kind: "message", metadata: toolLoopMetadata(result, plan.profile, hop) };
    }
    await requireBudget(workspaceId, plan.profile);
    const response = await requestCompletion({ profile: plan.profile, messages: chat, maxTokens: tokenBudgetFor(plan.caps), stream: false, timeoutMs: requestTimeoutMs() });
    const replyBody = await response.json();
    const rawContent = completionText(replyBody);
    const counted = usageFromJson(replyBody);
    await recordUsage(workspaceId, plan.profile.name, counted?.input ?? plan.inputTokens, counted?.output ?? estimateTokens(rawContent), Boolean(counted));
    const stripped = parseTurn(rawContent);
    const content = stripped.text || (stripped.consult ? `I asked ${stripped.consult.agent}: ${stripped.consult.question}` : rawContent);
    return { content, kind: "message", metadata: { provider: plan.profile.name, model: plan.profile.model, ...(hop ? { consulted: [{ name: hop.peer.name, question: hop.question }] } : {}), ...(plan.memory.count ? { memory: plan.memory } : {}) } };
  } catch (error) {
    if (error instanceof QuotaExceeded) return quotaReply(error.profile);
    return failureReply(plan.profile, error);
  }
}

/**
 * Streams vendor deltas to the browser and persists exactly one assistant row: the finished
 * reply, a partial reply flagged `incomplete`, or the failure notice. A stream that already
 * began is never retried — replaying it would duplicate text the user has watched arrive.
 */
export function streamReply(workspaceId: string, agent: ChatAgent, agentId: string, clientSignal?: AbortSignal) {
  const encoder = new TextEncoder();
  let closed = false;
  // The reader's Stop aborts this, so a model call already in flight stops spending tokens rather
  // than completing into a stream nobody is reading. Two sources: the request itself (a client that
  // disconnects) and the stream's cancel().
  const stop = new AbortController();
  const leave = () => { closed = true; stop.abort(); };
  if (clientSignal) {
    if (clientSignal.aborted) leave();
    else clientSignal.addEventListener("abort", leave, { once: true });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: Record<string, unknown>) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)); } catch { closed = true; }
      };

      void (async () => {
        let profile: ProviderProfile | null = null;
        try {
          const history = await recentTurns(workspaceId, agentId);
          const plan = await planReply(workspaceId, agent, history);
          if (plan.kind === "reply") {
            await db.insert(messages).values({ workspaceId, agentId, role: "assistant", ...plan.reply });
            send({ type: "reply", reply: plan.reply });
            return;
          }

          profile = plan.profile;
          send({ type: "start", provider: profile.name, label: profile.label, model: profile.model });
          let answer = "", finish = "", streamedUsage: { input: number; output: number } | null = null, handedUsage: { input: number; output: number } | null = null;
          // A handoff is billed to whoever actually answered, not to the agent that was addressed.
          const persist = async (reply: Reply, chargedTo: string = profile!.name, counted?: { input: number; output: number } | null, record = true) => {
            const [row] = await db.insert(messages).values({ workspaceId, agentId, role: "assistant", ...reply }).returning();
            if (record) await recordUsage(workspaceId, chargedTo, counted?.input ?? plan.inputTokens, counted?.output ?? estimateTokens(reply.content), Boolean(counted));
            send({ type: "reply", reply });
            return row;
          };
          // A tool-loop reply exists only when the loop finishes, so a reader who leaves gets no
          // answer — and the record says the stop happened rather than looking like a lost message.
          const noteStopped = () => audit(workspaceId, agent.id, "chat.stopped", "Stopped by the reader before the tool loop finished; no answer was stored.");

          // Route first, answer second: whatever the agent is granted decides what can happen.
          const asked = history[history.length - 1]?.content ?? "";
          let decision = await routeDecision(asked, plan.consultPeers, profile, workspaceId, plan.allowed, stop.signal);
          // A reasoning router can spend its whole budget thinking and emit no JSON. Naming one
          // teammate in the message is unambiguous, so that route does not depend on the model.
          if (decision.action === "none" && plan.allowed.consult) {
            const named = mentionConsult(asked, plan.consultPeers, agent.id);
            if (named) decision = { action: "consult", agent: named.agent, question: named.question };
          }

          if (decision.action === "build" && plan.allowed.build && decision.org) {
            // L-11 again: the name the asker typed is theirs, whatever the model called it.
            const org = { ...decision.org, team: requestedOrgName(asked) ?? decision.org.team };
            await persist({ content: `I sketched ${org.team} for you: ${org.agents.length} seats with reporting lines. Nothing exists until you confirm the chart below.`, kind: "org_proposal", metadata: { team: org.team, brief: org.brief, agents: org.agents } });
            await audit(workspaceId, agent.id, "org.proposed", org.team);
            return;
          }

          if (decision.action === "approval" && plan.allowed.approval) {
            const reply = await approvalReply(workspaceId, agent, decision.title ?? "Action needs your approval", decision.detail ?? `${agent.name} did not describe what it wanted to do.`);
            await persist(reply);
            return;
          }

          if (decision.action === "handoff" && plan.allowed.handoff) {
            const target = resolvePeer(decision.agent ?? "", plan.handoffPeers, agent.id);
            if (target) {
              const reason = decision.reason ?? "the asker judged it their call";
              send({ type: "handoff", from: agent.name, to: target.name, reason });
              const targetProfile = resolveForAgent(target.provider, loadProfiles());
              const handoffChat = [
                { role: "system", content: `${agent.name} handed this turn to you. Their reason: ${reason}` },
                ...chatMessages(target, history, targetProfile, []),
              ];
              if (targetProfile.configured) {
                if (await overQuota(workspaceId, targetProfile)) {
                  await persist(quotaReply(targetProfile), targetProfile.name, null, false);
                  return;
                }
                let handed: Awaited<ReturnType<typeof readSseText>>;
                try {
                  const hResponse = await requestCompletion({ profile: targetProfile, messages: handoffChat, maxTokens: tokenBudgetFor(normaliseCapabilities(target.capabilities)), stream: true, timeoutMs: streamTimeoutMs(), signal: stop.signal });
                  handed = await readSseText(hResponse, text => send({ type: "delta", text }), () => closed);
                } catch (error) {
                  if (closed) {
                    await audit(workspaceId, agent.id, "chat.stopped", `Stopped during a handoff to ${target.name}; no answer was stored.`);
                    return;
                  }
                  await persist(failureReply(targetProfile, error), targetProfile.name, null, false);
                  return;
                }
                answer = handed.text; finish = handed.finish; handedUsage = handed.usage;
                // A reader that went away makes readSseText return early, not throw. A partial answer
                // is stored as incomplete/stopped; with no text there is nothing to store at all.
                if (closed) {
                  if (answer.trim()) await persist({ content: answer.trim(), kind: "message", metadata: { provider: targetProfile.name, model: targetProfile.model, authoredBy: target.id, authoredByName: target.name, handoffFrom: agent.name, incomplete: true, stopped: true } });
                  else await audit(workspaceId, agent.id, "chat.stopped", `Stopped during a handoff to ${target.name} before any text arrived; no answer was stored.`);
                  return;
                }
              }
              // "Not configured" is true only when the target really has no key. An empty or stopped
              // reply is a different event and is named as one, never blamed on the wrong cause.
              const text = targetProfile.configured
                ? answer.trim() || `${target.name} received the handoff, but ${targetProfile.label} returned no text. Nothing further was sent.`
                : `${agent.name} handed this to ${target.name}, but ${targetProfile.label} is not configured on this server, so no answer was produced.`;
              const row = await persist({ content: text, kind: targetProfile.configured && !answer.trim() ? "provider_error" : "message", metadata: { provider: targetProfile.name, model: targetProfile.model, authoredBy: target.id, authoredByName: target.name, handoffFrom: agent.name, reason, ...(targetProfile.configured ? {} : { unconfigured: true }), ...(finish === "length" ? { incomplete: true, truncated: true } : {}) } }, targetProfile.name, handedUsage, Boolean(handedUsage));
              await db.insert(delegations).values({ workspaceId, messageId: row.id, fromAgentId: agent.id, toAgentId: target.id, mode: "handoff", question: asked.slice(0, 2000), answer: answer.trim(), model: targetProfile.model, inputTokens: estimateTokens(asked), outputTokens: estimateTokens(answer) });
              return;
            }
          }

          const peer = decision.action === "consult" ? resolvePeer(decision.agent ?? "", plan.consultPeers, agent.id) : null;
          let hop: { peer: Peer; question: string; answer: string } | null = null;
          if (peer && decision.action === "consult" && decision.question) {
            send({ type: "consult", from: agent.name, to: peer.name, role: peer.role, question: decision.question });
            hop = { peer, question: decision.question, answer: await consultPeer(workspaceId, agent, peer, decision.question, { depth: 1, visited: [agent.id, peer.id], send: () => {}, signal: stop.signal }) };
          }

          const finalMessages = hop ? integrateMessages(plan.chat, hop.peer, hop.question, hop.answer) : plan.chat;
          if (plan.toolLoop && plan.tools.length) {
            try {
              const result = await runAgentToolLoop(workspaceId, agent, plan, finalMessages, send, { signal: stop.signal, shouldStop: () => closed });
              if (result.stopped || closed) {
                await noteStopped();
                return;
              }
              if (!result.content.trim()) throw new Error("The tool loop returned no text.");
              send({ type: "delta", text: result.content });
              await persist({ content: result.content, kind: "message", metadata: toolLoopMetadata(result, profile, hop) }, profile.name, null, false);
              return;
            } catch (error) {
              // The abort is the reader's own action, not a provider failure worth storing.
              if (closed) {
                await noteStopped();
                return;
              }
              if (error instanceof QuotaExceeded) {
                await persist(quotaReply(error.profile), error.profile.name, null, false);
                return;
              }
              await persist(failureReply(profile, error));
              return;
            }
          }
          if (await overQuota(workspaceId, profile)) {
            await persist(quotaReply(profile), profile.name, null, false);
            return;
          }
          const response = await requestCompletion({
            profile,
            messages: finalMessages,
            maxTokens: tokenBudgetFor(plan.caps),
            stream: true,
            timeoutMs: streamTimeoutMs(),
            signal: stop.signal,
          });
          try {
            const streamed = await readSseText(response, text => send({ type: "delta", text }), () => closed);
            answer = streamed.text; finish = streamed.finish; streamedUsage = streamed.usage;
          } catch (error) {
            await persist(answer.trim()
              ? { content: answer.trim(), kind: "message", metadata: { provider: profile.name, model: profile.model, incomplete: true, detail: error instanceof Error ? error.message : "stream error" } }
              : failureReply(profile, error));
            return;
          }
          if (closed && answer.trim()) {
            await persist({ content: answer.trim(), kind: "message", metadata: { provider: profile.name, model: profile.model, incomplete: true, stopped: true, ...(hop ? { consulted: [{ name: hop.peer.name, question: hop.question }] } : {}) } });
            return;
          }
          // "length" is the provider saying it stopped because the output budget ran out.
          // That budget is ours (effort / maxTokens), so the row must not read as a finished answer.
          const truncated = finish === "length";
          if (!answer.trim()) throw new Error("Provider returned no text");
          // Belt and braces: if a model still emits a directive, show what it said around it
          // rather than a raw JSON blob.
          const cleaned = parseTurn(answer.trim());
          const finalText = (cleaned.text || (cleaned.consult ? `I asked ${cleaned.consult.agent}: ${cleaned.consult.question}` : "")).trim();
          if (!finalText) throw new Error("Provider returned no text");
          const row = await persist({ content: finalText, kind: "message", metadata: { provider: profile.name, model: profile.model, ...(hop ? { consulted: [{ name: hop.peer.name, question: hop.question }] } : {}), ...(plan.memory.count ? { memory: plan.memory } : {}), ...(truncated ? { incomplete: true, truncated: true } : {}) } }, profile.name, streamedUsage);
          if (hop) await db.insert(delegations).values({ workspaceId, messageId: row.id, fromAgentId: agent.id, toAgentId: hop.peer.id, question: hop.question, answer: hop.answer, model: profile.model, inputTokens: estimateTokens(hop.question), outputTokens: estimateTokens(hop.answer) });
        } catch (error) {
          if (closed) {
            // A reader who left mid-flight caused the abort; storing "provider error" would blame
            // the model for the human's own Stop.
          } else if (profile) {
            const notice = failureReply(profile, error);
            await db.insert(messages).values({ workspaceId, agentId, role: "assistant", ...notice });
            send({ type: "reply", reply: notice });
          } else {
            console.error("Chat stream failed before a provider was chosen", agent.name, error instanceof Error ? error.message : "unknown error");
            send({ type: "error", error: error instanceof Error ? error.message : "unknown error" });
          }
        } finally {
          try { send({ type: "end", board: await board(workspaceId) }); } catch { /* client already gone */ }
          closed = true;
          // The machinery closes the controller itself when the reader aborts, so a
          // second close() here would reject the enclosing async body.
          try { controller.close(); } catch { /* already closed */ }
        }
      })();
    },
    cancel() { leave(); },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
