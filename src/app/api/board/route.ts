import { after, NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, desc, eq, gt, lte, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { agents, approvals, connections, delegations, events, messages, modelUsage, routines, runs, runSteps, sandboxes, teams, workspaces } from "@/db/schema";
import { sandboxProvider } from "@/lib/sandbox";
import { skillPrompt } from "@/lib/skills";
import { DEFAULT_RESERVE_TOKENS, completionText, estimateTokens, finishReason, loadProfiles, requestCompletion, resolveForAgent, sseDelta, trimToTokenBudget, usageFromJson, usageFromSseLine, type ProviderProfile } from "@/lib/model-gateway";
import { ORG_SYSTEM, buildPeerPrompt, decollide, extractJsonObject, extractRoster, fallbackRoster, isOrgIntent, mentionConsult, isTeamIntent, normaliseRoster, parseRouting, parseTurn, resolvePeer, routingPrompt, type Roster, type Routing } from "@/lib/orchestration";
import { DEFAULT_CAPABILITIES, allowsAction, mcpSummary, normaliseCapabilities, planBlocks, resolveTools, tokenBudgetFor, type Capabilities } from "@/lib/tools";
import { MAX_MEMBERS, decollideOrg, normaliseOrg, orgTemplate, reachableFor, type Org } from "@/lib/org";
import { nextRunAt } from "@/lib/scheduler";
import { splitReasoning } from "@/lib/markdown";

export const dynamic = "force-dynamic";
const cookieName = "arova_workspace";
const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(4000);

const num = (value: string | undefined, fallback: number) => (value === undefined || value === "" || Number.isNaN(Number(value)) ? fallback : Number(value));
const maxOutputTokens = () => num(process.env.MODEL_MAX_TOKENS, 800);
const requestTimeoutMs = () => num(process.env.MODEL_TIMEOUT_MS, 45000);
/** A stream is slow by design, so it gets its own ceiling rather than the unary one. */
const streamTimeoutMs = () => Math.max(requestTimeoutMs(), num(process.env.MODEL_STREAM_TIMEOUT_MS, 120000));
/** Absent = 60 calls/workspace/provider/day; 0 = unlimited. Counts only calls that reached a vendor. */
const dailyCallLimit = () => num(process.env.DAILY_MODEL_CALLS_LIMIT, 60);
const utcDay = () => new Date().toISOString().slice(0, 10);
/** Peer hops one reply may spend. Each hop is extra model calls, so the ceiling is explicit. */
const maxDelegations = () => num(process.env.MAX_DELEGATIONS, 2);

async function audit(workspaceId: string, agentId: string | null, type: string, detail = "") {
  await db.insert(events).values({ workspaceId, agentId, type, detail });
}

/** Atomic increment: a read-modify-write here would undercount concurrent chats. */
/**
 * `exact` is true only when the server itself reported the counts. A day that mixes an estimated
 * call with an exact one stays flagged, because the figure on screen is then only partly real.
 */
async function recordUsage(workspaceId: string, provider: string, inputTokens: number, outputTokens: number, exact = false) {
  await db.insert(modelUsage).values({ workspaceId, provider, day: utcDay(), calls: 1, inputTokens, outputTokens, estimated: !exact })
    .onConflictDoUpdate({
      target: [modelUsage.workspaceId, modelUsage.provider, modelUsage.day],
      set: { calls: sql`${modelUsage.calls} + 1`, inputTokens: sql`${modelUsage.inputTokens} + ${inputTokens}`, outputTokens: sql`${modelUsage.outputTokens} + ${outputTokens}`, estimated: sql`${modelUsage.estimated} OR ${!exact}` },
    });
}

async function usageToday(workspaceId: string) {
  const rows = await db.select().from(modelUsage).where(and(eq(modelUsage.workspaceId, workspaceId), eq(modelUsage.day, utcDay())));
  return rows.map(r => ({ provider: r.provider, calls: r.calls, inputTokens: r.inputTokens, outputTokens: r.outputTokens, estimated: r.estimated }));
}

async function initialize() {
  const existing = (await cookies()).get(cookieName)?.value;
  if (existing && uuid.safeParse(existing).success) {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, existing)).limit(1);
    if (workspace) return { workspace, isNew: false };
  }
  const [workspace] = await db.insert(workspaces).values({ name: "My workspace" }).returning();
  const seeded = await db.insert(agents).values([
    { workspaceId: workspace.id, name: "Nova", role: "Personal assistant", instructions: "A thoughtful, organized assistant that helps manage everyday work and keeps things moving.", avatar: "sparkles", color: "violet" },
    { workspaceId: workspace.id, name: "Atlas", role: "Research analyst", instructions: "Find reliable information, compare sources, and turn research into clear takeaways.", avatar: "globe", color: "blue" },
    { workspaceId: workspace.id, name: "Pixel", role: "Creative partner", instructions: "Help brainstorm, write, and refine creative ideas with a fresh perspective.", avatar: "palette", color: "peach" },
  ]).returning();
  await db.insert(messages).values([
    { workspaceId: workspace.id, agentId: seeded[0].id, role: "assistant", content: "Hey! I’m Nova, your personal assistant. Tell me what’s on your mind, or ask me to set up a routine for you." },
    { workspaceId: workspace.id, agentId: seeded[1].id, role: "assistant", content: "Hi, I’m Atlas. Give me a topic to explore, and I’ll help turn the details into a clear picture." },
    { workspaceId: workspace.id, agentId: seeded[2].id, role: "assistant", content: "Hello! I’m Pixel. Let’s make something great together." },
  ]);
  const demoRoutines = await db.insert(routines).values([
    { workspaceId: workspace.id, agentId: seeded[0].id, name: "Morning briefing", description: "Prepare a summary of the day ahead", schedule: "Weekdays at 8:00 AM", timezone: workspace.timezone, icon: "sun" },
    { workspaceId: workspace.id, agentId: seeded[1].id, name: "Industry pulse", description: "Keep an eye on industry news and trends", schedule: "Every Monday at 9:00 AM", timezone: workspace.timezone, icon: "globe" },
    { workspaceId: workspace.id, agentId: seeded[0].id, name: "Weekly reset", description: "Review priorities and plan the next week", schedule: "Every Friday at 4:00 PM", timezone: workspace.timezone, icon: "calendar" },
  ]).returning();
  const sampleRuns = await db.insert(runs).values([
    { workspaceId: workspace.id, agentId: seeded[0].id, routineId: demoRoutines[0].id, title: "Morning briefing", status: "COMPLETED", summary: "Sample run: a morning briefing was prepared.", startedAt: new Date(Date.now() - 2 * 3600000), completedAt: new Date(Date.now() - 2 * 3600000 + 12000) },
    { workspaceId: workspace.id, agentId: seeded[1].id, routineId: demoRoutines[1].id, title: "Industry pulse", status: "COMPLETED", summary: "Sample run: a research summary was prepared.", startedAt: new Date(Date.now() - 25 * 3600000), completedAt: new Date(Date.now() - 25 * 3600000 + 19000) },
    { workspaceId: workspace.id, agentId: seeded[0].id, routineId: demoRoutines[2].id, title: "Weekly reset", status: "COMPLETED", summary: "Sample run: weekly priorities were reviewed.", startedAt: new Date(Date.now() - 73 * 3600000), completedAt: new Date(Date.now() - 73 * 3600000 + 8000) },
  ]).returning();
  await db.insert(runSteps).values(sampleRuns.flatMap(run => [
    { workspaceId: workspace.id, runId: run.id, title: "Run started", detail: "Sample activity for your new workspace" },
    { workspaceId: workspace.id, runId: run.id, title: "Task completed", detail: run.summary },
  ]));
  await db.insert(approvals).values({ workspaceId: workspace.id, agentId: seeded[0].id, title: "Send weekly summary", detail: "Sample approval request · Review before sharing a summary outside your workspace.", risk: "WRITE" });
  await audit(workspace.id, null, "workspace.created", "Demo workspace initialized with sample activity");
  return { workspace, isNew: true };
}

/** What the browser may know about a provider: never the key, and never the raw base URL. */
function publicProfiles(profiles: ProviderProfile[]) {
  return profiles.map(p => ({ name: p.name, label: p.label, model: p.model, configured: p.configured, builtIn: p.builtIn, maxContextTokens: p.maxContextTokens }));
}

async function board(workspaceId: string) {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const profiles = loadProfiles();
  const [agentList, messageList, routineList, runList, stepList, approvalList, connectionList, sandboxList, eventList, usage, teamList] = await Promise.all([
    db.select().from(agents).where(and(eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt))).orderBy(agents.createdAt),
    db.select().from(messages).where(eq(messages.workspaceId, workspaceId)).orderBy(messages.createdAt),
    db.select().from(routines).where(eq(routines.workspaceId, workspaceId)).orderBy(desc(routines.createdAt)),
    db.select().from(runs).where(eq(runs.workspaceId, workspaceId)).orderBy(desc(runs.startedAt)),
    db.select().from(runSteps).where(eq(runSteps.workspaceId, workspaceId)).orderBy(runSteps.createdAt),
    db.select().from(approvals).where(eq(approvals.workspaceId, workspaceId)).orderBy(desc(approvals.createdAt)),
    db.select().from(connections).where(eq(connections.workspaceId, workspaceId)),
    db.select().from(sandboxes).where(eq(sandboxes.workspaceId, workspaceId)),
    db.select().from(events).where(eq(events.workspaceId, workspaceId)).orderBy(desc(events.createdAt)).limit(30),
    usageToday(workspaceId),
    db.select().from(teams).where(eq(teams.workspaceId, workspaceId)).orderBy(teams.createdAt),
  ]);
  // A consult card must still show the peer's answer the day after it happened. The day window is
  // there to keep the index's "today" list small — it was never meant to erase stored evidence.
  const startOfUtcDay = new Date(new Date().toISOString().slice(0, 10));
  const consultedMessageIds = messageList.filter(m => Array.isArray((m.metadata as Record<string, unknown> | null)?.consulted)).map(m => m.id);
  const delegationList = await db.select().from(delegations)
    .where(and(eq(delegations.workspaceId, workspaceId), or(gte(delegations.createdAt, startOfUtcDay), consultedMessageIds.length ? inArray(delegations.messageId, consultedMessageIds) : sql`false`)))
    .orderBy(desc(delegations.createdAt)).limit(80);
  return {
    workspace,
    agents: agentList.map(a => ({ ...a, capabilities: normaliseCapabilities(a.capabilities) })), messages: messageList, routines: routineList, runs: runList, steps: stepList, approvals: approvalList, connections: connectionList, sandboxes: sandboxList, events: eventList,
    sandboxProvider: sandboxProvider.name,
    profiles: publicProfiles(profiles),
    providers: Object.fromEntries(profiles.map(p => [p.name, p.configured])) as Record<string, boolean>,
    modelConfigured: profiles.some(p => p.configured),
    teams: teamList,
    delegations: delegationList,
    limits: { dailyModelCalls: dailyCallLimit(), usage, maxDelegations: maxDelegations() },
    demo: true,
  };
}

/** Routines currently executing in this process, so one tick cannot start the same run twice. */
const inFlight = new Set<string>();

/**
 * The scheduler tick. There is no daemon in this deployment, so due work is claimed when the
 * workspace is read — and the UI says so rather than implying a background service.
 */
async function tickSchedules(workspaceId: string) {
  const now = new Date();
  const [ws] = await db.select({ timezone: workspaces.timezone }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  // Routines saved before this feature have no due time; give them one rather than showing "not scheduled".
  const unanchored = await db.select().from(routines).where(and(eq(routines.workspaceId, workspaceId), eq(routines.enabled, true), isNull(routines.nextRunAt))).limit(10);
  for (const row of unanchored) {
    const first = nextRunAt(row.schedule, row.timezone || ws?.timezone || "UTC", now);
    if (first) await db.update(routines).set({ nextRunAt: first }).where(eq(routines.id, row.id));
  }
  const due = await db.select().from(routines)
    .where(and(eq(routines.workspaceId, workspaceId), eq(routines.enabled, true), lte(routines.nextRunAt, now), sql`${routines.nextRunAt} IS NOT NULL`))
    .orderBy(routines.nextRunAt).limit(2);
  for (const routine of due) {
    if (inFlight.has(routine.id)) continue;
    // Claim by predicate, not by the value we read. Postgres re-checks the WHERE clause after the
    // row lock, so a second tab that races us finds it no longer due and skips. Comparing the
    // timestamp itself would never match: the column keeps microseconds, a JS Date keeps milliseconds.
    const next = nextRunAt(routine.schedule, ws?.timezone ?? "UTC", now);
    const [claimed] = await db.update(routines)
      .set({ lastRunAt: now, nextRunAt: next, lastStatus: "RUNNING" })
      .where(and(eq(routines.id, routine.id), lte(routines.nextRunAt, now)))
      .returning();
    if (!claimed) continue;
    inFlight.add(routine.id);
    void executeRoutine(workspaceId, routine, now, claimed.nextRunAt).finally(() => inFlight.delete(routine.id));
  }
}

/** One scheduled execution: a real run, real steps, and the answer posted into the agent's thread. */
async function executeRoutine(workspaceId: string, routine: typeof routines.$inferSelect, startedAt: Date, nextRun: Date | null) {
  const [run] = await db.insert(runs).values({ workspaceId, agentId: routine.agentId, routineId: routine.id, title: routine.name, status: "RUNNING", summary: `Scheduled for ${startedAt.toISOString()}`, startedAt }).returning();
  const step = (title: string, detail = "") => db.insert(runSteps).values({ workspaceId, runId: run.id, title, detail });
  const finish = async (status: string, summary: string) => {
    await db.update(runs).set({ status, summary, completedAt: new Date() }).where(eq(runs.id, run.id));
    await db.update(routines).set({ lastStatus: status, nextRunAt: nextRun ?? routine.nextRunAt }).where(eq(routines.id, routine.id));
    await audit(workspaceId, routine.agentId, "routine.ran", `${routine.name}: ${status.toLowerCase()}`);
  };
  await step("Claimed", `${routine.schedule} · ${routine.timezone}`);
  try {
    const agent = await ownedAgent(workspaceId, routine.agentId);
    if (agent.status !== "ACTIVE") return finish("FAILED", `${agent.name} is paused, so the schedule did not run. Resume the agent to continue.`);
    const profile = resolveForAgent(agent.provider, loadProfiles());
    if (!profile.configured) return finish("FAILED", `${profile.label} has no key on this server, so nothing was executed.`);
    if (await overQuota(workspaceId, profile)) return finish("WAITING_FOR_TOOL", `The daily model budget was reached, so this run waited instead of spending more.`);
    const history = await recentTurns(workspaceId, routine.agentId);
    const caps = normaliseCapabilities(agent.capabilities);
    const task = `${routine.description}

(This is a scheduled run of "${routine.name}", not a message from the user. Answer it directly; state anything you could not verify.)`;
    const response = await requestCompletion({ profile, messages: [{ role: "system", content: systemPrompt(agent, await peersOf(workspaceId, agent)) }, ...history.filter(m => m.role === "user" || m.role === "assistant").slice(-8).map(m => ({ role: m.role, content: m.content })), { role: "user", content: task }], maxTokens: tokenBudgetFor(caps), stream: false, timeoutMs: requestTimeoutMs() });
    const body = await response.json();
    const answer = completionText(body).trim();
    if (!answer) return finish("FAILED", "The model returned no text.");
    const counted = usageFromJson(body);
    await recordUsage(workspaceId, profile.name, counted?.input ?? estimateTokens(task), counted?.output ?? estimateTokens(answer), Boolean(counted));
    const said = splitReasoning(answer).answer;
    await step("Answered", `${said.length} characters from ${profile.model}`);
    await db.insert(messages).values({ workspaceId, agentId: routine.agentId, role: "assistant", content: answer, kind: "message", metadata: { provider: profile.name, model: profile.model, scheduled: true, routineId: routine.id, runId: run.id } });
    await finish("COMPLETED", said ? said.slice(0, 280) : "The model returned reasoning only, so there is no answer to show. The stored message keeps exactly what it produced.");
  } catch (error) {
    await step("Failed", error instanceof Error ? error.message.slice(0, 200) : "unknown error");
    await finish("FAILED", error instanceof Error ? error.message.slice(0, 280) : "The scheduled run failed.");
  }
}

export async function GET() {
  try {
    const { workspace, isNew } = await initialize();
    // after() runs once the response is flushed: the page load is not held hostage by a model call,
    // and the work is not dropped the way a floating promise is when the request ends.
    after(() => tickSchedules(workspace.id).catch(error => console.error("Scheduler tick failed", error instanceof Error ? error.message : "unknown error")));
    const response = NextResponse.json(await board(workspace.id));
    if (isNew) response.cookies.set(cookieName, workspace.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
    return response;
  } catch (error) {
    console.error("Board load failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Could not load your workspace." }, { status: 500 });
  }
}

async function ownedAgent(workspaceId: string, agentId: string) {
  if (!uuid.safeParse(agentId).success) throw new Error("Invalid agent");
  const [agent] = await db.select().from(agents).where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt))).limit(1);
  if (!agent) throw new Error("Agent not found");
  return agent;
}

type Reply = { content: string; kind: string; metadata: Record<string, unknown> };
type Turn = { role: string; content: string; kind?: string };
type ChatAgent = typeof agents.$inferSelect;

const ROUTINE_INTENT = /every day|every morning|every week|weekday|daily|weekly|each morning|every monday|every friday|schedule|remind me/;

const LOCAL_REPLY: Reply = { content: "I can help organize this workspace, but live AI chat needs a configured model provider on the server. You can create agents and routines here now. I have not accessed any external tools or websites.", kind: "message", metadata: { provider: "local" } };

function routineProposal(content: string): Reply {
  const name = /inbox|email/.test(content) ? "Inbox briefing" : /news|industry|research/.test(content) ? "Research digest" : /week|priority/.test(content) ? "Weekly check-in" : "New routine";
  const schedule = /weekday/.test(content) ? "Weekdays at 8:00 AM" : /friday/.test(content) ? "Every Friday at 4:00 PM" : /monday|weekly|every week/.test(content) ? "Every Monday at 9:00 AM" : "Every day at 8:00 AM";
  return { content: "I can set that up as a routine. Review the schedule and confirm when you're ready. Scheduled execution needs a worker; creating a routine does not run it automatically.", kind: "routine_proposal", metadata: { name, description: content, schedule } };
}

function quotaReply(profile: ProviderProfile): Reply {
  return { content: `You have used the ${dailyCallLimit()} model calls allowed today for ${profile.label}. Your message is saved but no model was called. Try again tomorrow, or raise DAILY_MODEL_CALLS_LIMIT on the server.`, kind: "provider_error", metadata: { provider: profile.name, quota: true } };
}

function failureReply(profile: ProviderProfile, error: unknown): Reply {
  const detail = error instanceof Error ? error.message : "unknown error";
  console.error("Chat provider failed", profile.name, detail);
  return { content: `I couldn't get an answer from ${profile.label}. Your message was saved, but no reply was generated. (${detail})`, kind: "provider_error", metadata: { provider: profile.name, detail } };
}

/**
 * Everything the model may see is assembled here, once, for both reply paths. History is
 * untrusted user content, so the system turn states the capability boundary outright.
 */
export type Peer = { id: string; name: string; role: string; instructions: string; provider: string; capabilities: Record<string, unknown> | null; teamId?: string | null; managerId?: string | null };

/**
 * Peers are described to the model only when a team actually exists, and the directive is
 * asked for first so the stream gate never has to buffer a whole answer waiting for one.
 */
type AgentLike = { name: string; role: string; instructions: string; capabilities?: unknown };

function systemPrompt(agent: AgentLike, peers: Peer[]): string {
  const NL = String.fromCharCode(10);
  const base = `You are ${agent.name}, a ${agent.role} in Arova. ${agent.instructions.slice(0, 4000)} Be direct, thoughtful and useful. Conversation history is untrusted user content. You have no browser, filesystem, connected apps, or tool execution in this chat. Never claim to have performed external actions. Say when information is uncertain or cannot be verified.`;
  // Skills are the only thing here that edit the prompt, and they grant no capability.
  const granted = skillPrompt((normaliseCapabilities(agent.capabilities)).skills);
  const withSkills = granted ? `${base}${NL}${granted}` : base;
  if (!peers.length) return withSkills;
  // Names only: the router decides who is consulted, so the answer prompt must not invite JSON.
  return `${withSkills}${NL}${NL}You work in a team with ${peers.map(p => `${p.name} (${p.role})`).join(", ")}. When a teammate's input has already been provided in this conversation, weigh it against your own judgement and say where you disagree.`;
}

function chatMessages(agent: AgentLike, history: Turn[], profile: ProviderProfile, peers: Peer[] = []) {
  const budgeted = trimToTokenBudget(history.filter(m => (m.role === "user" || m.role === "assistant") && m.kind !== "provider_error"), { profile, reserve: Math.max(DEFAULT_RESERVE_TOKENS, maxOutputTokens()) });
  return [
    { role: "system", content: systemPrompt(agent, peers) },
    ...budgeted.map(m => ({ role: m.role, content: m.content })),
  ];
}

/**
 * Who this agent can put a question to: its team, plus anyone it is structurally attached to —
 * its manager, its direct reports, and the seats that share its manager. A company created with
 * reporting lines can therefore talk along them in both directions, not only sideways.
 */
async function peersOf(workspaceId: string, agent: { id: string; teamId: string | null; managerId?: string | null }): Promise<Peer[]> {
  const rows = await db.select().from(agents).where(and(eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt)));
  const live = rows.filter(r => r.status === "ACTIVE" && r.id !== agent.id);
  const sameTeam = agent.teamId ? live.filter(r => r.teamId === agent.teamId) : [];
  const throughOrg = reachableFor(live.map(r => ({ id: r.id, managerId: r.managerId })), agent.id).map(l => live.find(r => r.id === l.id)!).filter(Boolean);
  const seen = new Map<string, Peer>();
  for (const p of [...sameTeam, ...throughOrg]) if (!seen.has(p.id)) seen.set(p.id, { id: p.id, name: p.name, role: p.role, instructions: p.instructions, provider: p.provider, capabilities: p.capabilities, teamId: p.teamId, managerId: p.managerId });
  return [...seen.values()];
}

async function recentTurns(workspaceId: string, agentId: string): Promise<Turn[]> {
  const rows = await db.select({ role: messages.role, content: messages.content, kind: messages.kind }).from(messages)
    .where(and(eq(messages.workspaceId, workspaceId), eq(messages.agentId, agentId))).orderBy(desc(messages.createdAt)).limit(64);
  return rows.reverse();
}

async function overQuota(workspaceId: string, profile: ProviderProfile) {
  const limit = dailyCallLimit();
  if (!limit) return false;
  const rows = await usageToday(workspaceId);
  return (rows.find(r => r.provider === profile.name)?.calls ?? 0) >= limit;
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
  if (profile.configured) {
    try {
      const response = await requestCompletion({ profile, messages: [{ role: "system", content: ORG_SYSTEM }, { role: "user", content: prompt.slice(0, 1500) }], maxTokens: 1400, stream: false, timeoutMs: requestTimeoutMs() });
      const body = await response.json();
      const text = completionText(body);
      const counted = usageFromJson(body);
      await recordUsage(workspaceId, profile.name, counted?.input ?? estimateTokens(prompt), counted?.output ?? estimateTokens(text), Boolean(counted));
      const org = normaliseOrg(extractJsonObject(text) ?? {});
      if (org && org.members.length >= 2) return org;
    } catch (error) {
      console.error("Org proposal failed", error instanceof Error ? error.message : "unknown error");
    }
  }
  // A named company in the ask becomes the company name; otherwise the template's own.
  const named = /["“']([^"”']{2,40})["”']/.exec(prompt)?.[1];
  return orgTemplate(named ?? "", prompt.slice(0, 300));
}

/** One model call to design the roster; a deterministic family if no key or bad output. */
async function proposeRoster(prompt: string, profile: ProviderProfile, workspaceId: string): Promise<Roster | null> {
  const taken = (await db.select({ name: agents.name }).from(agents).where(and(eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt)))).map(r => r.name);
  if (profile.configured) {
    try {
      const response = await requestCompletion({ profile, messages: [{ role: "system", content: ROSTER_SYSTEM }, { role: "user", content: `Design a team for: ${prompt.slice(0, 1500)}
Names already in use, avoid them: ${taken.join(", ") || "none"}` }], maxTokens: 700, stream: false, timeoutMs: requestTimeoutMs() });
      const body = await response.json();
      const text = completionText(body);
      const counted = usageFromJson(body);
      await recordUsage(workspaceId, profile.name, counted?.input ?? estimateTokens(prompt), counted?.output ?? estimateTokens(text), Boolean(counted));
      const roster = extractRoster(text);
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
async function planReply(workspaceId: string, agent: ChatAgent, history: Turn[]) {
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
  const consultPeers = granted.includes("consult_teammate") ? allPeers.filter(p => allowsAction(caps, "consult_teammate", p.id)) : [];
  const handoffPeers = granted.includes("handoff") ? allPeers.filter(p => allowsAction(caps, "handoff", p.id)) : [];
  const allowed = {
    consult: consultPeers.length > 0,
    handoff: handoffPeers.length > 0,
    approval: granted.includes("request_approval") && !planBlocks("request_approval", caps.permissionMode),
    build: granted.includes("build_org") && !planBlocks("build_org", caps.permissionMode),
  };
  const chat = chatMessages(agent, history, profile, consultPeers);
  return { kind: "model" as const, profile, chat, caps, allowed, consultPeers, handoffPeers, inputTokens: estimateTokens(chat.map(m => m.content).join("")) };
}

/** Stream a provider reply straight to the client, returning the text and why it ended. */
async function streamText(response: Response, onText: (chunk: string) => void, shouldStop?: () => boolean): Promise<{ text: string; finish: string; usage: { input: number; output: number } | null }> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Provider returned an empty stream");
  const decoder = new TextDecoder();
  let raw = "", answer = "", finish = "";
  let usage: { input: number; output: number } | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
    const lines = raw.split(String.fromCharCode(10));
    raw = lines.pop() ?? "";
    for (const line of lines) {
      const reason = finishReason(line);
      if (reason) finish = reason;
      const counted = usageFromSseLine(line);
      if (counted) usage = counted;
      const delta = sseDelta(line);
      if (!delta) continue;
      answer += delta;
      onText(delta);
    }
    if (shouldStop?.()) break;
  }
  if (raw) { const tail = sseDelta(raw); if (tail) { answer += tail; onText(tail); } const t = finishReason(raw); if (t) finish = t; const u = usageFromSseLine(raw); if (u) usage = u; }
  return { text: answer, finish, usage };
}

/**
 * Ask the cheap routing pass what to do. `allowed` carries only the actions the agent is
 * actually granted, so removing a capability in the UI removes the option from the model
 * rather than asking the model politely to ignore a tool it still has.
 */
async function routeDecision(question: string, peers: Peer[], profile: ProviderProfile, workspaceId: string, allowed: { consult: boolean; handoff: boolean; approval: boolean; build: boolean }): Promise<Routing> {
  if (!allowed.consult && !allowed.handoff && !allowed.approval && !allowed.build) return { action: "none" };
  try {
    const response = await requestCompletion({
      profile,
      messages: [{ role: "system", content: "You are a router. Reply with only the JSON object requested. No prose, no explanation." }, { role: "user", content: routingPrompt(question, peers, allowed) }],
      maxTokens: 1600,
      stream: false,
      timeoutMs: requestTimeoutMs(),
    });
    return parseRouting(completionText(await response.json()));
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
async function consultPeer(
  workspaceId: string,
  asker: { id: string; name: string },
  peer: Peer,
  question: string,
  chain: { depth: number; visited: string[]; send: (payload: Record<string, unknown>) => void },
): Promise<string> {
  const profile = resolveForAgent(peer.provider, loadProfiles());
  if (!profile.configured) throw new Error(`${peer.name} uses ${profile.label}, which has no key on this server`);
  const caps = normaliseCapabilities(peer.capabilities);
  let gathered = "";
  if (chain.depth < maxDelegations() && resolveTools(caps, { hasTeam: true }).includes("consult_teammate") && !planBlocks("consult_teammate", caps.permissionMode)) {
    const below = (await peersOf(workspaceId, { id: peer.id, teamId: peer.teamId ?? null, managerId: peer.managerId ?? null }))
      .filter(p => !chain.visited.includes(p.id) && allowsAction(caps, "consult_teammate", p.id));
    if (below.length) {
      let decision = await routeDecision(question, below, profile, workspaceId, { consult: true, handoff: false, approval: false, build: false });
      if (decision.action === "none") {
        const named = mentionConsult(question, below, peer.id);
        if (named) decision = { action: "consult", agent: named.agent, question: named.question };
      }
      const sub = decision.action === "consult" && decision.question ? resolvePeer(decision.agent ?? "", below, peer.id) : null;
      if (sub && decision.question) {
        chain.send({ type: "consult", from: peer.name, to: sub.name, role: sub.role, question: decision.question });
        const subAnswer = await consultPeer(workspaceId, { id: peer.id, name: peer.name }, sub, decision.question, { depth: chain.depth + 1, visited: [...chain.visited, sub.id], send: chain.send });
        gathered = `${String.fromCharCode(10)}${String.fromCharCode(10)}${sub.name} (${sub.role}) was asked "${decision.question}" and answered: ${subAnswer}. Weigh that against your own seat and disagree if it is wrong.`;
        await db.insert(delegations).values({ workspaceId, fromAgentId: peer.id, toAgentId: sub.id, question: decision.question, answer: subAnswer, model: profile.model, inputTokens: estimateTokens(question), outputTokens: estimateTokens(subAnswer) });
      }
    }
  }
  const response = await requestCompletion({ profile, messages: [{ role: "system", content: buildPeerPrompt({ name: peer.name, role: peer.role, instructions: peer.instructions }, question, asker.name) + gathered }], maxTokens: 700, stream: false, timeoutMs: requestTimeoutMs() });
  const body = await response.json();
  const answer = completionText(body);
  const counted = usageFromJson(body);
  await recordUsage(workspaceId, profile.name, counted?.input ?? estimateTokens(question), counted?.output ?? estimateTokens(answer), Boolean(counted));
  return answer;
}

/** The peer's answer arrives as context the asking agent must weigh, not text to copy. */
function integrateMessages(chat: { role: string; content: string }[], peer: Peer, question: string, answer: string) {
  const NL = String.fromCharCode(10);
  return [
    ...chat,
    { role: "user", content: `You asked ${peer.name} (${peer.role}): ${question}${NL}${peer.name} answered: ${answer}${NL}${NL}Now answer the user yourself, weighing what ${peer.name} contributed. Do not paste their reply wholesale, and do not claim any action neither of you performed.` },
  ];
}

/** Unary reply: used when a client asks for a plain JSON response (stream === false). */
async function buildReply(workspaceId: string, agent: ChatAgent, history: Turn[]): Promise<Reply> {
  const plan = await planReply(workspaceId, agent, history);
  if (plan.kind === "reply") return plan.reply;
  try {
    const asked = history[history.length - 1]?.content ?? "";
    const decision = await routeDecision(asked, plan.consultPeers, plan.profile, workspaceId, plan.allowed);
    const peer = decision.action === "consult" ? resolvePeer(decision.agent ?? "", plan.consultPeers, agent.id) : null;
    let chat = plan.chat;
    let hop: { peer: Peer; question: string; answer: string } | null = null;
    if (peer && decision.action === "consult" && decision.question) {
      hop = { peer, question: decision.question, answer: await consultPeer(workspaceId, agent, peer, decision.question, { depth: 1, visited: [agent.id, peer.id], send: () => {} }) };
      chat = integrateMessages(plan.chat, peer, hop.question, hop.answer);
    }
    const response = await requestCompletion({ profile: plan.profile, messages: chat, maxTokens: tokenBudgetFor(plan.caps), stream: false, timeoutMs: requestTimeoutMs() });
    const replyBody = await response.json();
    const rawContent = completionText(replyBody);
    const counted = usageFromJson(replyBody);
    await recordUsage(workspaceId, plan.profile.name, counted?.input ?? plan.inputTokens, counted?.output ?? estimateTokens(rawContent), Boolean(counted));
    const stripped = parseTurn(rawContent);
    const content = stripped.text || (stripped.consult ? `I asked ${stripped.consult.agent}: ${stripped.consult.question}` : rawContent);
    return { content, kind: "message", metadata: { provider: plan.profile.name, model: plan.profile.model, ...(hop ? { consulted: [{ name: hop.peer.name, question: hop.question }] } : {}) } };
  } catch (error) {
    return failureReply(plan.profile, error);
  }
}

/**
 * Streams vendor deltas to the browser and persists exactly one assistant row: the finished
 * reply, a partial reply flagged `incomplete`, or the failure notice. A stream that already
 * began is never retried — replaying it would duplicate text the user has watched arrive.
 */
function streamReply(workspaceId: string, agent: ChatAgent, agentId: string) {
  const encoder = new TextEncoder();
  // pull() is a token, not an event: counting them means a demand granted before the
  // producer is listening is not lost, which is what made a slow reader hang forever.
  let demandTokens = 0;
  let waiting: (() => void) | null = null;
  let closed = false;
  const grantDemand = () => { demandTokens++; const wake = waiting; waiting = null; wake?.(); };
  const awaitDemand = () => (demandTokens > 0 ? (demandTokens--, Promise.resolve()) : new Promise<void>(resolve => { waiting = resolve; }));

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
          const persist = async (reply: Reply, chargedTo: string = profile!.name, counted?: { input: number; output: number } | null) => {
            const [row] = await db.insert(messages).values({ workspaceId, agentId, role: "assistant", ...reply }).returning();
            await recordUsage(workspaceId, chargedTo, counted?.input ?? plan.inputTokens, counted?.output ?? estimateTokens(reply.content), Boolean(counted));
            send({ type: "reply", reply });
            return row;
          };

          // Route first, answer second: whatever the agent is granted decides what can happen.
          const asked = history[history.length - 1]?.content ?? "";
          let decision = await routeDecision(asked, plan.consultPeers, profile, workspaceId, plan.allowed);
          // A reasoning router can spend its whole budget thinking and emit no JSON. Naming one
          // teammate in the message is unambiguous, so that route does not depend on the model.
          if (decision.action === "none" && plan.allowed.consult) {
            const named = mentionConsult(asked, plan.consultPeers, agent.id);
            if (named) decision = { action: "consult", agent: named.agent, question: named.question };
          }

          if (decision.action === "build" && plan.allowed.build && decision.org) {
            const org = decision.org;
            await persist({ content: `I sketched ${org.team} for you: ${org.agents.length} seats with reporting lines. Nothing exists until you confirm the chart below.`, kind: "org_proposal", metadata: { team: org.team, brief: org.brief, agents: org.agents } });
            await audit(workspaceId, agent.id, "org.proposed", org.team);
            return;
          }

          if (decision.action === "approval") {
            const title = decision.title ?? "Action needs your approval";
            const detail = decision.detail ?? `${agent.name} did not describe what it wanted to do.`;
            const [approval] = await db.insert(approvals).values({ workspaceId, agentId: agent.id, title, detail, risk: "WRITE" }).returning();
            const reply: Reply = { content: `I stopped and raised this for you to decide: ${title}. Nothing was done, and I will not act on it until you approve it.`, kind: "approval_request", metadata: { approvalId: approval.id, title, detail } };
            await persist(reply);
            await audit(workspaceId, agent.id, "approval.requested", title);
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
                const hResponse = await requestCompletion({ profile: targetProfile, messages: handoffChat, maxTokens: tokenBudgetFor(normaliseCapabilities(target.capabilities)), stream: true, timeoutMs: streamTimeoutMs() });
                const handed = await streamText(hResponse, text => send({ type: "delta", text }), () => closed);
                answer = handed.text; finish = handed.finish; handedUsage = handed.usage;
                // A reader that went away makes streamText return early, not throw. Without this
                // check a cut-off answer would be stored as though the model had finished it.
                if (closed && answer.trim()) {
                  await persist({ content: answer.trim(), kind: "message", metadata: { provider: targetProfile.name, model: targetProfile.model, authoredBy: target.id, authoredByName: target.name, handoffFrom: agent.name, incomplete: true, stopped: true } });
                  return;
                }
              }
              const text = answer.trim() || `${agent.name} handed this to ${target.name}, but ${targetProfile.label} is not configured on this server, so no answer was produced.`;
              const row = await persist({ content: text, kind: "message", metadata: { provider: targetProfile.name, model: targetProfile.model, authoredBy: target.id, authoredByName: target.name, handoffFrom: agent.name, reason, ...(finish === "length" ? { incomplete: true, truncated: true } : {}) } }, targetProfile.name);
              await db.insert(delegations).values({ workspaceId, messageId: row.id, fromAgentId: agent.id, toAgentId: target.id, mode: "handoff", question: asked.slice(0, 2000), answer: text, model: targetProfile.model, inputTokens: estimateTokens(asked), outputTokens: estimateTokens(text) });
              return;
            }
          }

          const peer = decision.action === "consult" ? resolvePeer(decision.agent ?? "", plan.consultPeers, agent.id) : null;
          let hop: { peer: Peer; question: string; answer: string } | null = null;
          if (peer && decision.action === "consult" && decision.question) {
            send({ type: "consult", from: agent.name, to: peer.name, role: peer.role, question: decision.question });
            hop = { peer, question: decision.question, answer: await consultPeer(workspaceId, agent, peer, decision.question, { depth: 1, visited: [agent.id, peer.id], send: () => {} }) };
          }

          const response = await requestCompletion({
            profile,
            messages: hop ? integrateMessages(plan.chat, hop.peer, hop.question, hop.answer) : plan.chat,
            maxTokens: tokenBudgetFor(plan.caps),
            stream: true,
            timeoutMs: streamTimeoutMs(),
          });
          try {
            const streamed = await streamText(response, text => send({ type: "delta", text }), () => closed);
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
          const row = await persist({ content: finalText, kind: "message", metadata: { provider: profile.name, model: profile.model, ...(hop ? { consulted: [{ name: hop.peer.name, question: hop.question }] } : {}), ...(truncated ? { incomplete: true, truncated: true } : {}) } }, profile.name, streamedUsage);
          if (hop) await db.insert(delegations).values({ workspaceId, messageId: row.id, fromAgentId: agent.id, toAgentId: hop.peer.id, question: hop.question, answer: hop.answer, model: profile.model, inputTokens: estimateTokens(hop.question), outputTokens: estimateTokens(hop.answer) });
        } catch (error) {
          if (profile) {
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
    pull() { grantDemand(); },
    cancel() { closed = true; grantDemand(); },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}

export async function POST(request: NextRequest) {
  try {
    const workspaceId = (await cookies()).get(cookieName)?.value;
    if (!workspaceId || !uuid.safeParse(workspaceId).success) return NextResponse.json({ error: "Workspace session missing. Refresh the page." }, { status: 401 });
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 401 });
    const body = await request.json();
    const action = z.string().parse(body.action);
    const providerChoice = z.string().trim().min(1).max(40);
    const knownProvider = (name: string) => ["auto", "local", "xai", "openai", ...loadProfiles().map(p => p.name)].includes(name);
    let result: Record<string, unknown> = {};

    if (action === "createAgent") {
      const input = z.object({ name: z.string().trim().min(1).max(40), role: z.string().trim().min(1).max(80), instructions: z.string().max(4000).default(""), avatar: z.string().max(30).default("sparkles"), color: z.string().max(30).default("violet"), provider: providerChoice.default("auto"), capabilities: z.unknown().optional() }).parse(body);
      if (!knownProvider(input.provider)) throw new Error(`Unknown model "${input.provider}". List it in PROVIDERS first.`);
      const [agent] = await db.insert(agents).values({ workspaceId, ...input, capabilities: normaliseCapabilities(input.capabilities) }).returning();
      await db.insert(messages).values({ workspaceId, agentId: agent.id, role: "assistant", content: `Hey, I’m ${agent.name}. What would you like to work on together?` });
      await audit(workspaceId, agent.id, "agent.created", agent.name);
      result = { agentId: agent.id };
    } else if (action === "updateAgent") {
      const agent = await ownedAgent(workspaceId, body.agentId);
      const input = z.object({ name: z.string().trim().min(1).max(40).optional(), role: z.string().trim().min(1).max(80).optional(), instructions: z.string().max(4000).optional(), status: z.enum(["ACTIVE", "PAUSED"]).optional(), provider: providerChoice.optional(), capabilities: z.unknown().optional() }).parse(body);
      const { capabilities: rawCaps, ...fields } = input;
      const patch = { ...fields, ...(rawCaps !== undefined ? { capabilities: normaliseCapabilities(rawCaps) } : {}) };
      if (input.provider && !knownProvider(input.provider)) throw new Error(`Unknown model "${input.provider}". List it in PROVIDERS first.`);
      await db.update(agents).set(patch).where(and(eq(agents.id, agent.id), eq(agents.workspaceId, workspaceId)));
      if (patch.status === "PAUSED") await db.update(routines).set({ enabled: false }).where(and(eq(routines.agentId, agent.id), eq(routines.workspaceId, workspaceId)));
      await audit(workspaceId, agent.id, "agent.updated", JSON.stringify({ ...patch, capabilities: patch.capabilities ? "updated" : undefined }));
    } else if (action === "deleteAgent") {
      const agent = await ownedAgent(workspaceId, body.agentId);
      await db.update(agents).set({ deletedAt: new Date(), status: "PAUSED" }).where(and(eq(agents.id, agent.id), eq(agents.workspaceId, workspaceId)));
      await db.update(routines).set({ enabled: false }).where(and(eq(routines.agentId, agent.id), eq(routines.workspaceId, workspaceId)));
      await audit(workspaceId, agent.id, "agent.deleted", agent.name);
    } else if (action === "sendMessage") {
      const agent = await ownedAgent(workspaceId, body.agentId);
      if (agent.status === "PAUSED") throw new Error("Resume this agent before chatting.");
      const content = text.parse(body.content);
      await db.insert(messages).values({ workspaceId, agentId: agent.id, role: "user", content });
      await audit(workspaceId, agent.id, "chat.message", "Message exchanged");
      if (body.stream !== false) return streamReply(workspaceId, agent, agent.id);
      const reply = await buildReply(workspaceId, agent, await recentTurns(workspaceId, agent.id));
      await db.insert(messages).values({ workspaceId, agentId: agent.id, role: "assistant", ...reply });
      result = { reply };
    } else if (action === "createTeam") {
      const input = z.object({
        team: z.string().trim().min(1).max(60),
        brief: z.string().max(300).default(""),
        provider: providerChoice.default("auto"),
        agents: z.array(z.object({ name: z.string().trim().min(1).max(40), role: z.string().trim().min(1).max(80), instructions: z.string().max(2000).default("") })).min(2).max(6),
      }).parse(body);
      if (!knownProvider(input.provider)) throw new Error(`Unknown model "${input.provider}". List it in PROVIDERS first.`);
      // Re-normalise from the payload: a client could have edited the proposal into anything.
      let roster = normaliseRoster({ team: input.team, agents: input.agents });
      if (!roster) throw new Error("A team needs at least two agents, each with a name and a role.");
      const existing = (await db.select({ name: agents.name }).from(agents).where(and(eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt)))).map(r => r.name);
      const clashes = new Set(existing.map(n => n.toLowerCase()));
      if (roster.agents.some(a => clashes.has(a.name.toLowerCase()))) roster = decollide(roster, existing);
      const takenTeams = await db.select({ name: teams.name }).from(teams).where(eq(teams.workspaceId, workspaceId));
      const names = new Set(takenTeams.map(t => t.name.toLowerCase()));
      let teamName = roster.team;
      for (let n = 2; names.has(teamName.toLowerCase()); n++) teamName = `${roster.team} ${n}`;
      const [team] = await db.insert(teams).values({ workspaceId, name: teamName, brief: input.brief || `${roster.agents.length} teammates created as one team` }).returning();
      const palette = ["sparkles", "globe", "palette", "sun", "bot", "zap"];
      const created = await db.insert(agents).values(roster.agents.map((a, i) => ({ workspaceId, teamId: team.id, name: a.name, role: a.role, instructions: a.instructions, provider: input.provider, avatar: palette[i % palette.length] }))).returning();
      await db.insert(messages).values(created.map(a => ({ workspaceId, agentId: a.id, role: "assistant", content: `I'm ${a.name}, ${a.role.toLowerCase()}. I work alongside ${created.filter(c => c.id !== a.id).map(c => c.name).join(" and ")}, so ask and I will bring them in when it helps.` })));
      await audit(workspaceId, null, "team.created", `${team.name}: ${created.map(c => c.name).join(", ")}`);
      result = { teamId: team.id, agentIds: created.map(c => c.id) };
    } else if (action === "createOrg") {
      const input = z.object({
        team: z.string().trim().min(1).max(60),
        brief: z.string().max(400).default(""),
        provider: providerChoice.default("auto"),
        managerId: z.string().uuid().optional(),
        members: z.array(z.object({ name: z.string().trim().min(1).max(40), role: z.string().trim().min(1).max(80), instructions: z.string().max(4000).default(""), reportsTo: z.string().max(40).nullable().default(null) })).min(1).max(MAX_MEMBERS),
      }).parse(body);
      if (!knownProvider(input.provider)) throw new Error(`Unknown model "${input.provider}". List it in PROVIDERS first.`);
      const org = normaliseOrg({ team: input.team, brief: input.brief, members: input.members });
      if (!org) throw new Error("The organisation needs at least one seat with a name and a role.");
      if (input.managerId) await ownedAgent(workspaceId, input.managerId);
      const taken = (await db.select({ name: agents.name }).from(agents).where(and(eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt)))).map(r => r.name);
      const members = decollideOrg(org, taken).members;
      const takenTeams = await db.select({ name: teams.name }).from(teams).where(eq(teams.workspaceId, workspaceId));
      const teamNames = new Set(takenTeams.map(t => t.name.toLowerCase()));
      let teamName = org.team;
      for (let n = 2; teamNames.has(teamName.toLowerCase()); n++) teamName = `${org.team} ${n}`;
      const [team] = await db.insert(teams).values({ workspaceId, name: teamName, brief: org.brief || `${members.length} seats created as one organisation` }).returning();
      const palette = ["sparkles", "globe", "palette", "sun", "bot", "zap"];
      const byIdName = new Map<string, string>();
      const created: { id: string; name: string; role: string }[] = [];
      for (const [i, member] of members.entries()) {
        const managerId = member.reportsTo ? byIdName.get(member.reportsTo.toLowerCase()) ?? input.managerId ?? null : input.managerId ?? null;
        const [row] = await db.insert(agents).values({ workspaceId, teamId: team.id, managerId: managerId ?? null, name: member.name, role: member.role, instructions: member.instructions, provider: input.provider, avatar: palette[i % palette.length], capabilities: { ...DEFAULT_CAPABILITIES, canConsult: "*", canHandoffTo: [] } }).returning();
        byIdName.set(member.name.toLowerCase(), row.id);
        created.push({ id: row.id, name: row.name, role: row.role });
      }
      await db.insert(messages).values(created.map((c, i) => {
        const reports = members.filter(mm => mm.reportsTo?.toLowerCase() === members[i].name.toLowerCase()).map(mm => mm.name);
        const boss = members[i].reportsTo;
        return { workspaceId, agentId: c.id, role: "assistant" as const, content: `I'm ${c.name} — ${c.role.toLowerCase()} at ${teamName}. ${boss ? `I report to ${boss}.` : "I own this organisation."} ${reports.length ? `My reports: ${reports.join(", ")}.` : ""} Ask me and I will pull the right seat in when the work needs it.` };
      }));
      await audit(workspaceId, input.managerId ?? null, "org.created", `${teamName}: ${created.map(c => c.name).join(", ")}`);
      result = { teamId: team.id, agentIds: created.map(c => c.id) };
    } else if (action === "createRoutine") {
      const agent = await ownedAgent(workspaceId, body.agentId);
      if (planBlocks("create_routine", normaliseCapabilities(agent.capabilities).permissionMode)) throw new Error(`${agent.name} is in plan mode: it can advise and propose, but not save routines. Switch its permission mode to act.`);
      const input = z.object({ name: z.string().trim().min(1).max(100), description: text, schedule: z.string().trim().min(1).max(120) }).parse(body);
      const [routine] = await db.insert(routines).values({ workspaceId, agentId: agent.id, ...input, timezone: workspace.timezone, nextRunAt: nextRunAt(input.schedule, workspace.timezone, new Date()) }).returning();
      await db.insert(messages).values({ workspaceId, agentId: agent.id, role: "assistant", content: `Done — “${routine.name}” is on your schedule. This workspace does not have a scheduler worker configured, so scheduled execution is not active yet. You can still use Run Now to inspect readiness.` });
      await audit(workspaceId, agent.id, "routine.created", routine.name);
    } else if (["toggleRoutine", "deleteRoutine", "runRoutine"].includes(action)) {
      const routineId = uuid.parse(body.routineId);
      const [routine] = await db.select().from(routines).where(and(eq(routines.id, routineId), eq(routines.workspaceId, workspaceId))).limit(1);
      if (!routine) throw new Error("Routine not found");
      await ownedAgent(workspaceId, routine.agentId);
      if (action === "toggleRoutine") {
        // Resuming recomputes the next occurrence: a routine paused for a week must not fire 40 times.
        const resume = !routine.enabled;
        await db.update(routines).set({ enabled: resume, nextRunAt: resume ? nextRunAt(routine.schedule, routine.timezone, new Date()) : null }).where(eq(routines.id, routine.id));
        await audit(workspaceId, routine.agentId, "routine.toggled", routine.name);
      }
      if (action === "deleteRoutine") { await db.delete(routines).where(and(eq(routines.id, routine.id), eq(routines.workspaceId, workspaceId))); await audit(workspaceId, routine.agentId, "routine.deleted", routine.name); }
      if (action === "runRoutine") {
        const key = request.headers.get("Idempotency-Key") || crypto.randomUUID();
        const [existing] = await db.select().from(runs).where(and(eq(runs.workspaceId, workspaceId), eq(runs.idempotencyKey, key))).limit(1);
        if (existing) result = { runId: existing.id };
        else {
          const [run] = await db.insert(runs).values({ workspaceId, agentId: routine.agentId, routineId: routine.id, title: routine.name, status: "WAITING_FOR_TOOL", summary: "Execution needs a configured workflow worker and any required tool connections. No external actions were performed.", idempotencyKey: key }).returning();
          await db.insert(runSteps).values([{ workspaceId, runId: run.id, title: "Run requested", detail: `Manual run of ${routine.name}` }, { workspaceId, runId: run.id, title: "Waiting for runtime", detail: "Connect the required tools and configure a workflow worker before execution.", status: "WAITING_FOR_TOOL" }]);
          await db.insert(messages).values({ workspaceId, agentId: routine.agentId, role: "assistant", content: `I received the Run Now request for “${routine.name}”. It’s waiting for a configured workflow runtime and tools; I haven’t performed any external actions. Check Runs for details.`, kind: "execution_result" });
          await audit(workspaceId, routine.agentId, "routine.run.requested", routine.name);
          result = { runId: run.id };
        }
      }
    } else if (action === "cancelRun") {
      const runId = uuid.parse(body.runId);
      const [run] = await db.select().from(runs).where(and(eq(runs.id, runId), eq(runs.workspaceId, workspaceId))).limit(1);
      if (!run) throw new Error("Run not found");
      if (["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(run.status)) throw new Error("This run has already finished.");
      await db.update(runs).set({ status: "CANCELLED", completedAt: new Date(), summary: "Cancelled by user. No external actions were performed." }).where(eq(runs.id, run.id));
      await db.insert(runSteps).values({ workspaceId, runId: run.id, title: "Run cancelled", detail: "Cancelled by user", status: "CANCELLED" });
      await audit(workspaceId, run.agentId, "run.cancelled", run.title);
    } else if (action === "decideApproval") {
      const approvalId = uuid.parse(body.approvalId);
      const decision = z.enum(["APPROVED", "REJECTED"]).parse(body.decision);
      const [approval] = await db.select().from(approvals).where(and(eq(approvals.id, approvalId), eq(approvals.workspaceId, workspaceId))).limit(1);
      if (!approval || approval.status !== "PENDING") throw new Error("Approval is no longer pending");
      await db.update(approvals).set({ status: decision }).where(eq(approvals.id, approval.id));
      await audit(workspaceId, approval.agentId, `approval.${decision.toLowerCase()}`, approval.title);
    } else if (action === "updateWorkspace") {
      const timezone = z.string().min(1).max(100).parse(body.timezone);
      try { Intl.DateTimeFormat(undefined, { timeZone: timezone }); } catch { throw new Error("Invalid timezone"); }
      await db.update(workspaces).set({ timezone }).where(eq(workspaces.id, workspaceId));
      await audit(workspaceId, null, "workspace.updated", `Timezone: ${timezone}`);
    } else if (action === "sandboxAction") {
      await ownedAgent(workspaceId, body.agentId);
      throw new Error("Computer runtime is not configured. No sandbox was started. Configure a provider before using computer tasks.");
    } else if (action === "connectTool") {
      await ownedAgent(workspaceId, body.agentId);
      throw new Error("OAuth is not configured in this deployment. No account was connected. Add provider credentials to enable this integration.");
    } else {
      throw new Error("Unknown action");
    }
    return NextResponse.json({ ok: true, ...result, board: await board(workspaceId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
