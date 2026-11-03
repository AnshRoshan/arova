import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { agents, approvals, channels, evalSuites, evalTasks, memories, messages, researchFindings, researchProjects, researchSources, routines, runs, runSteps, sandboxes, teams, triggers, workspaces } from "@/db/schema";
import { sandboxProvider } from "@/lib/sandbox";
import { deliverToChannel, isChannelKind, newChannelToken, redactTarget, validateChannelTarget, type ChannelEvent } from "@/lib/channels";
import { completionText, ensureServedModel, estimateTokens, loadProfiles, requestCompletion, resolveForAgent, usageFromJson } from "@/lib/model-gateway";
import { DEFAULT_CAPABILITIES, TOOL_REGISTRY, normaliseCapabilities, planBlocks, resolveTools } from "@/lib/tools";
import { decollide, extractJsonObject, normaliseRoster } from "@/lib/orchestration";
import { MAX_MEMBERS, decollideOrg, normaliseOrg } from "@/lib/org";
import { nextRunAt } from "@/lib/scheduler";
import { schedulerIntervalSeconds, workerEnabled } from "@/lib/worker-config";
import { removePerson, setPersonRole, type Actor } from "@/lib/auth-sessions";
import { runSandboxCommand } from "@/lib/sandbox-run";
import { webFetch } from "@/lib/web-fetch";
import { runLocalTool } from "@/lib/local-tools";
import { executeEvalTask } from "@/lib/eval-runner";
import { runSuiteTasks, suitePassRate } from "@/lib/suite";
import { collectResearchSource } from "@/lib/research-store";
import { splitReasoning } from "@/lib/markdown";
import type { MemoryKind } from "@/lib/memory";
import { audit } from "@/lib/audit";
import { finishRun } from "@/lib/run-contract";
import { drizzleRunStore } from "@/lib/run-contract-drizzle";
import { executeRoutine, inFlight } from "@/lib/routine-runner";
import { ensureAgentVersion } from "@/lib/versions-drizzle";
import { overQuota, recordUsage } from "@/lib/budget";
import { mayFoundOrg, mayStaffOrg, resolveLead } from "@/lib/channel";
import { ownedAgent, postToChannel, ownMemory, quotaReply, recentTurns, streamTimeoutMs, systemPrompt, recordDelivery, MEMORY_SYSTEM } from "@/lib/board-core";
import { buildReply, streamReply } from "@/lib/chat-runner";
import { streamBrief } from "@/lib/brief-runner";

const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(4000);

export type ActionContext = {
  workspace: typeof workspaces.$inferSelect;
  actor: Actor | null;
  /** Parsed JSON; every field is validated field-by-field with zod, so the loose type mirrors request.json(). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  request: NextRequest;
};

export type ActionResult = { result?: Record<string, unknown>; response?: Response };

/**
 * The action dispatcher. `POST` authenticates, parses and dispatches (spec 26); everything here
 * is one workspace's mutation and throws a sentence on refusal, which the route turns into a 400.
 * Two actions answer with a stream instead of a result — `sendMessage` and `briefOrg` — and the
 * route returns that response untouched.
 */
export async function dispatchAction({ workspace, actor, body, request }: ActionContext): Promise<ActionResult> {
  const workspaceId = workspace.id;
  const action = z.string().parse(body.action);
  const providerChoice = z.string().trim().min(1).max(40);
  const knownProvider = (name: string) => ["auto", "local", "xai", "openai", ...loadProfiles().map(p => p.name)].includes(name);
  let result: Record<string, unknown> = {};

  /**
   * The bench's own rules (D-15.4), checked server-side whenever a request is made on behalf of a
   * seat. `onBehalfOf` is deliberately not `agentId`: in these payloads `agentId` is the seat being
   * acted upon. It is absent when the human acts through the panel, and no tier is in force until a
   * creator seat is designated — either case keeps the pre-Feature-11 behaviour.
   */
  const actorSeat = async () => {
    const raw = (body as { onBehalfOf?: unknown }).onBehalfOf;
    if (!raw || !workspace.creatorAgentId) return null;
    const seat = await ownedAgent(workspaceId, String(raw));
    const [creator] = await db.select({ id: agents.id, name: agents.name }).from(agents).where(eq(agents.id, workspace.creatorAgentId)).limit(1);
    return { seat, creator, isCreator: seat.id === workspace.creatorAgentId };
  };
  /** Founding an organisation belongs to the designated creator seat, and to nobody else. */
  const mayFound = async () => {
    const actor = await actorSeat();
    if (!actor) return;
    const verdict = mayFoundOrg({ id: actor.seat.id, name: actor.seat.name, teamId: actor.seat.teamId, isCreator: actor.isCreator }, actor.creator);
    if (!verdict.ok) throw new Error(verdict.why);
  };
  /** Only an org's lead staffs its own bench — and only the creator may staff someone else's. Returns the acting seat, when a seat is the one asking. */
  const mayStaff = async (targetTeamId: string) => {
    const actor = await actorSeat();
    if (!actor) return null;
    const [row] = await db.select({ leadAgentId: teams.leadAgentId }).from(teams).where(eq(teams.id, targetTeamId)).limit(1);
    const verdict = mayStaffOrg({ id: actor.seat.id, name: actor.seat.name, teamId: actor.seat.teamId, isCreator: actor.isCreator, isLead: row?.leadAgentId === actor.seat.id }, targetTeamId);
    if (!verdict.ok) throw new Error(verdict.why);
    return actor.seat;
  };
  /**
   * Memory is org-scoped absolutely, not only when a creator tier is in force: a seat may never
   * write into, read out of, or forget another company's record. Returns the writing seat, if a
   * seat is the one writing — a human acting through the panel is not subject to it.
   */
  const mayRemember = async (targetTeamId: string) => {
    const raw = (body as { onBehalfOf?: unknown }).onBehalfOf;
    if (!raw) return null;
    const seat = await ownedAgent(workspaceId, String(raw));
    if (seat.teamId !== targetTeamId) throw new Error(`${seat.name} belongs to ${seat.teamId ? "another organisation" : "no organisation"}, so it cannot touch this one's memory. What a company recorded stays inside it.`);
    return seat;
  };

  if (action === "createAgent") {
    const input = z.object({ name: z.string().trim().min(1).max(40), role: z.string().trim().min(1).max(80), instructions: z.string().max(4000).default(""), avatar: z.string().max(30).default("sparkles"), color: z.string().max(30).default("violet"), provider: providerChoice.default("auto"), capabilities: z.unknown().optional(), teamId: uuid.optional(), managerId: uuid.optional() }).parse(body);
    if (!knownProvider(input.provider)) throw new Error(`Unknown model "${input.provider}". List it in PROVIDERS first.`);
    // A seat adding a teammate is staffing, which belongs to that org's lead (or the creator seat).
    // A human acting through the panel sends no `onBehalfOf`, so nothing is gated.
    const addedBy = input.teamId ? await mayStaff(input.teamId) : null;
    const { capabilities: rawCaps, teamId: newTeamId, managerId: askedManagerId, ...fields } = input;
    let newManagerId: string | null = null;
    if (newTeamId && askedManagerId) {
      const boss = await ownedAgent(workspaceId, askedManagerId);
      if (boss.teamId !== newTeamId) throw new Error("A manager must already belong to this organisation.");
      newManagerId = boss.id;
    }
    const [agent] = await db.insert(agents).values({ workspaceId, ...fields, teamId: newTeamId ?? null, managerId: newManagerId, capabilities: normaliseCapabilities(rawCaps) }).returning();
    await ensureAgentVersion(agent);
    await db.insert(messages).values({ workspaceId, agentId: agent.id, role: "assistant", content: newTeamId ? `I'm ${agent.name}, ${agent.role.toLowerCase()}. I was added to this organisation, so ask me something and I will bring the right seat in when the work needs it.` : `Hey, I’m ${agent.name}. What would you like to work on together?` });
    if (newTeamId) {
      const [joined] = await db.select().from(teams).where(and(eq(teams.id, newTeamId), eq(teams.workspaceId, workspaceId))).limit(1);
      if (joined) {
        const bossName = newManagerId ? (await db.select({ name: agents.name }).from(agents).where(eq(agents.id, newManagerId)).limit(1))[0]?.name : null;
        await postToChannel(workspaceId, joined.id, "assistant", { content: `${agent.name} — ${agent.role.toLowerCase()} — joins ${joined.name}${bossName ? `, reporting to ${bossName}` : ""}. Added by ${addedBy?.name ?? "you"}, so ${agent.name} is inside this organisation only: it can be asked and can ask here, and it reaches no seat in another company.`, kind: "channel_seat", metadata: { seatId: agent.id, addedBySeatId: addedBy?.id ?? null } }, addedBy ? { id: addedBy.id, name: addedBy.name } : null);
      }
    }
    await audit(workspaceId, agent.id, "agent.created", newTeamId ? `${agent.name} → team` : agent.name);
    result = { agentId: agent.id };
  } else if (action === "updateAgent") {
    const agent = await ownedAgent(workspaceId, body.agentId);
    const input = z.object({ name: z.string().trim().min(1).max(40).optional(), role: z.string().trim().min(1).max(80).optional(), instructions: z.string().max(4000).optional(), status: z.enum(["ACTIVE", "PAUSED"]).optional(), provider: providerChoice.optional(), capabilities: z.unknown().optional() }).parse(body);
    const { capabilities: rawCaps, ...fields } = input;
    const patch = { ...fields, ...(rawCaps !== undefined ? { capabilities: normaliseCapabilities(rawCaps) } : {}) };
    if (input.provider && !knownProvider(input.provider)) throw new Error(`Unknown model "${input.provider}". List it in PROVIDERS first.`);
    await db.update(agents).set(patch).where(and(eq(agents.id, agent.id), eq(agents.workspaceId, workspaceId)));
    // Publishing happens here: the live row moves, and the snapshot a later run pins is written.
    await ensureAgentVersion({ ...agent, ...patch });
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
    if (body.stream !== false) return { response: streamReply(workspaceId, agent, agent.id, request.signal) };
    const reply = await buildReply(workspaceId, agent, await recentTurns(workspaceId, agent.id));
    await db.insert(messages).values({ workspaceId, agentId: agent.id, role: "assistant", ...reply });
    result = { reply };
  } else if (action === "briefOrg") {
    const input = z.object({ teamId: uuid, content: text }).parse(body);
    const [team] = await db.select().from(teams).where(and(eq(teams.id, input.teamId), eq(teams.workspaceId, workspaceId))).limit(1);
    if (!team) throw new Error("Organisation not found");
    const seats = await db.select().from(agents).where(and(eq(agents.workspaceId, workspaceId), eq(agents.teamId, team.id), isNull(agents.deletedAt))).orderBy(agents.createdAt);
    const leadRow = resolveLead(seats, team.leadAgentId);
    if (!leadRow) throw new Error(`${team.name} has no seats, so there is nobody to brief.`);
    const lead = await ownedAgent(workspaceId, leadRow.id);
    if (lead.status !== "ACTIVE") throw new Error(`${lead.name} is paused. Resume the lead before briefing ${team.name}.`);
    // The brief is a channel row before anything is asked, so the record starts with who wanted what.
    await postToChannel(workspaceId, team.id, "user", { content: input.content, kind: "message", metadata: {} });
    await audit(workspaceId, lead.id, "org.briefed", `${team.name}: ${input.content.slice(0, 120)}`);
    return { response: streamBrief(workspaceId, team, lead, input.content, request.signal) };
  } else if (action === "assignOrgLead") {
    const input = z.object({ teamId: uuid, agentId: uuid }).parse(body);
    const [team] = await db.select().from(teams).where(and(eq(teams.id, input.teamId), eq(teams.workspaceId, workspaceId))).limit(1);
    if (!team) throw new Error("Organisation not found");
    const seat = await ownedAgent(workspaceId, input.agentId);
    if (seat.teamId !== team.id) throw new Error("A lead must be a seat inside this organisation.");
    await db.update(teams).set({ leadAgentId: seat.id }).where(eq(teams.id, team.id));
    await postToChannel(workspaceId, team.id, "assistant", { content: `${seat.name} is now the lead of ${team.name}. Briefs posted here go to that seat, and its reports name the teammates it pulled in.`, kind: "channel_lead", metadata: {} }, { id: seat.id, name: seat.name });
    await audit(workspaceId, seat.id, "org.lead", `${team.name}: ${seat.name}`);
    result = { teamId: team.id, leadAgentId: seat.id };
  } else if (action === "assignCreator") {
    const input = z.object({ agentId: uuid.nullable() }).parse(body);
    if (input.agentId) await ownedAgent(workspaceId, input.agentId);
    await db.update(workspaces).set({ creatorAgentId: input.agentId }).where(eq(workspaces.id, workspaceId));
    await audit(workspaceId, input.agentId, "workspace.creator", input.agentId ? "designated the creator seat" : "cleared the creator designation");
    result = { creatorAgentId: input.agentId };
  } else if (action === "saveMemory") {
    const input = z.object({ teamId: uuid, text: z.string().trim().min(3).max(1200), kind: z.enum(["note", "decision", "glossary"]).default("note"), sourceIds: z.array(uuid).default([]), supersedes: uuid.nullable().default(null), pinned: z.boolean().default(false) }).parse(body);
    const writer = await mayRemember(input.teamId);
    if (writer) {
      // A seat recording memory is a write, so it is gated like one: the grant, then plan mode.
      const wcaps = normaliseCapabilities(writer.capabilities);
      if (!resolveTools(wcaps, { hasTeam: true }).includes("save_note")) throw new Error(`${writer.name} is not granted "Record org memory". Turn it on in ${writer.name} › Capabilities.`);
      if (planBlocks("save_note", wcaps.permissionMode)) throw new Error(`${writer.name} is in plan mode: it can advise and propose, but not record memory. Switch its permission mode to act.`);
    }
    if (input.supersedes) await ownMemory(workspaceId, input.supersedes, input.teamId);
    const [row] = await db.insert(memories).values({ workspaceId, teamId: input.teamId, agentId: writer?.id ?? null, kind: input.kind, text: input.text, sourceIds: input.sourceIds, supersedes: input.supersedes, pinned: input.pinned }).returning();
    if (writer) {
      const [t] = await db.select().from(teams).where(and(eq(teams.id, input.teamId), eq(teams.workspaceId, workspaceId))).limit(1);
      if (t) await postToChannel(workspaceId, t.id, "assistant", { content: `${writer.name} recorded a ${row.kind} for ${t.name}: “${row.text}”${row.supersedes ? " — it replaces an earlier note" : ""}. It is in this organisation's memory only: no seat outside ${t.name} will be shown it.`, kind: "channel_memory", metadata: { memoryId: row.id } }, { id: writer.id, name: writer.name });
    }
    await audit(workspaceId, writer?.id ?? null, "memory.saved", row.text.slice(0, 120));
    result = { memoryId: row.id };
  } else if (action === "updateMemory") {
    const input = z.object({ memoryId: uuid, text: z.string().trim().min(3).max(1200).optional(), pinned: z.boolean().optional(), kind: z.enum(["note", "decision", "glossary"]).optional() }).parse(body);
    const row = await ownMemory(workspaceId, input.memoryId);
    await mayRemember(row.teamId);
    await db.update(memories).set({ ...(input.text ? { text: input.text } : {}), ...(input.pinned !== undefined ? { pinned: input.pinned } : {}), ...(input.kind ? { kind: input.kind } : {}) }).where(eq(memories.id, row.id));
    await audit(workspaceId, null, "memory.updated", (input.text ?? row.text).slice(0, 120));
  } else if (action === "deleteMemory") {
    const input = z.object({ memoryId: uuid }).parse(body);
    const row = await ownMemory(workspaceId, input.memoryId);
    await mayRemember(row.teamId);
    await db.delete(memories).where(eq(memories.id, row.id));
    await audit(workspaceId, null, "memory.forgotten", row.text.slice(0, 120));
  } else if (action === "distilMemory") {
    // Propose, never write: a distilled sentence the human has not read is a rumour with a timestamp.
    const input = z.object({ teamId: uuid }).parse(body);
    const [t] = await db.select().from(teams).where(and(eq(teams.id, input.teamId), eq(teams.workspaceId, workspaceId))).limit(1);
    if (!t) throw new Error("Organisation not found");
    await mayRemember(input.teamId);
    const posts = await db.select().from(messages).where(and(eq(messages.workspaceId, workspaceId), eq(messages.teamId, t.id), eq(messages.role, "assistant"))).orderBy(desc(messages.createdAt)).limit(12);
    if (posts.length < 2) throw new Error(`${t.name}'s channel has too little in it to distil yet. Brief the lead and try again — nothing was called.`);
    const seats = await db.select().from(agents).where(and(eq(agents.workspaceId, workspaceId), eq(agents.teamId, t.id), isNull(agents.deletedAt))).orderBy(agents.createdAt);
    const leadRow = resolveLead(seats, t.leadAgentId);
    const profile = resolveForAgent(leadRow?.provider ?? "auto", loadProfiles());
    if (!profile.configured) throw new Error(`${profile.label} is not configured on this server, so nothing could be distilled. No model call was made.`);
    if (await overQuota(workspaceId, profile)) throw new Error(quotaReply(profile).content);
    const nameOf = (m: typeof messages.$inferSelect) => m.metadata?.authoredByName ? String(m.metadata.authoredByName) : (seats.find(s => s.id === m.agentId)?.name ?? "the channel");
    const transcript = posts.slice().reverse().map(m => `${nameOf(m)} (${m.kind}): ${splitReasoning(m.content).answer.slice(0, 400)}`).join(String.fromCharCode(10));
    // A reasoning model spends its whole budget before the JSON arrives, so this unary call gets
    // the stream ceiling rather than the 45s default that a plain answer fits inside.
    const response = await requestCompletion({ profile, messages: [{ role: "system", content: MEMORY_SYSTEM }, { role: "user", content: transcript.slice(0, 6000) }], maxTokens: 700, stream: false, timeoutMs: streamTimeoutMs() });
    const distilBody = await response.json();
    const distilText = completionText(distilBody);
    const counted = usageFromJson(distilBody);
    await recordUsage(workspaceId, profile.name, counted?.input ?? estimateTokens(transcript), counted?.output ?? estimateTokens(distilText), Boolean(counted));
    const raw = (extractJsonObject(splitReasoning(distilText).rest) as { memories?: unknown } | null)?.memories;
    const candidates = (Array.isArray(raw) ? raw : []).map(entry => {
      const e = entry as { kind?: unknown; text?: unknown };
      const text = typeof e.text === "string" ? e.text.trim().slice(0, 240) : "";
      const kind = e.kind === "decision" || e.kind === "glossary" ? e.kind : "note";
      return text.length >= 3 ? { kind, text } : null;
    }).filter((c): c is { kind: MemoryKind; text: string } => !!c).slice(0, 3);
    await audit(workspaceId, leadRow?.id ?? null, "memory.distilled", `${t.name}: ${candidates.length} proposal(s)`);
    result = { candidates };
  } else if (action === "createTrigger") {
    const input = z.object({ teamId: uuid, label: z.string().trim().min(2).max(60) }).parse(body);
    const [t] = await db.select().from(teams).where(and(eq(teams.id, input.teamId), eq(teams.workspaceId, workspaceId))).limit(1);
    if (!t) throw new Error("Organisation not found");
    // Wiring a webhook for someone else's org is the same leak as writing their memory.
    await mayRemember(input.teamId);
    const token = `arova-${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
    const [row] = await db.insert(triggers).values({ workspaceId, teamId: t.id, token, label: input.label }).returning();
    await audit(workspaceId, null, "trigger.created", `${t.name}: ${input.label}`);
    result = { triggerId: row.id, token };
  } else if (action === "revokeTrigger") {
    const input = z.object({ triggerId: uuid }).parse(body);
    const [row] = await db.select().from(triggers).where(and(eq(triggers.id, input.triggerId), eq(triggers.workspaceId, workspaceId))).limit(1);
    if (!row) throw new Error("Trigger not found");
    await db.delete(triggers).where(eq(triggers.id, row.id));
    await audit(workspaceId, null, "trigger.revoked", `${row.label} (${row.hits} fire(s))`);
  } else if (action === "createChannel") {
    const input = z.object({ name: z.string().trim().min(1).max(60), kind: z.enum(["webhook", "slack"]), target: z.string().trim().url().max(2000), teamId: uuid.optional() }).parse(body);
    if (!isChannelKind(input.kind)) throw new Error("Unknown channel kind.");
    if (input.teamId) {
      const [team] = await db.select().from(teams).where(and(eq(teams.id, input.teamId), eq(teams.workspaceId, workspaceId))).limit(1);
      if (!team) throw new Error("Organisation not found");
      await mayRemember(input.teamId);
    }
    // The same SSRF policy as web_fetch: https, 443, public address, no credentials in the URL.
    const target = await validateChannelTarget(input.target);
    if ("error" in target) throw new Error(target.error);
    const [row] = await db.insert(channels).values({ workspaceId, teamId: input.teamId ?? null, name: input.name, kind: input.kind, target: input.target, token: newChannelToken() }).returning();
    await audit(workspaceId, null, "channel.created", `${row.name} → ${redactTarget(row.target)}`);
    result = { channelId: row.id, token: row.token };
  } else if (action === "updateChannel") {
    const input = z.object({ channelId: uuid, name: z.string().trim().min(1).max(60).optional(), enabled: z.boolean().optional() }).parse(body);
    const [row] = await db.select().from(channels).where(and(eq(channels.id, input.channelId), eq(channels.workspaceId, workspaceId))).limit(1);
    if (!row) throw new Error("Channel not found");
    await db.update(channels).set({ ...(input.name ? { name: input.name } : {}), ...(input.enabled !== undefined ? { enabled: input.enabled } : {}) }).where(eq(channels.id, row.id));
    await audit(workspaceId, null, "channel.updated", `${input.name ?? row.name}: ${input.enabled === false ? "disabled" : input.enabled === true ? "enabled" : "renamed"}`);
  } else if (action === "deleteChannel") {
    const channelId = uuid.parse(body.channelId);
    const [row] = await db.select().from(channels).where(and(eq(channels.id, channelId), eq(channels.workspaceId, workspaceId))).limit(1);
    if (!row) throw new Error("Channel not found");
    await db.delete(channels).where(eq(channels.id, row.id));
    await audit(workspaceId, null, "channel.deleted", row.name);
  } else if (action === "testChannel") {
    const channelId = uuid.parse(body.channelId);
    const [row] = await db.select().from(channels).where(and(eq(channels.id, channelId), eq(channels.workspaceId, workspaceId))).limit(1);
    if (!row) throw new Error("Channel not found");
    const event: ChannelEvent = { kind: "test", title: "Test delivery", status: "TEST", summary: `This is a test from ${workspace.name}. If you can read it, the channel is wired.` };
    const out = await deliverToChannel(row, event);
    await recordDelivery(workspaceId, row, event, out);
    await audit(workspaceId, null, "channel.tested", `${row.name}: ${out.status}`);
    result = { delivered: out };
  } else if (action === "createEvalTask") {
    const input = z.object({ name: z.string().trim().min(1).max(80), agentId: uuid, prompt: z.string().trim().min(3).max(4000), expected: z.string().trim().min(1).max(500) }).parse(body);
    await ownedAgent(workspaceId, input.agentId);
    const [row] = await db.insert(evalTasks).values({ workspaceId, ...input }).returning();
    await audit(workspaceId, input.agentId, "eval.task.created", row.name);
    result = { taskId: row.id };
  } else if (action === "deleteEvalTask") {
    const taskId = uuid.parse(body.taskId);
    const [row] = await db.select().from(evalTasks).where(and(eq(evalTasks.id, taskId), eq(evalTasks.workspaceId, workspaceId))).limit(1);
    if (!row) throw new Error("Eval task not found");
    await db.delete(evalTasks).where(eq(evalTasks.id, row.id));
    await audit(workspaceId, row.agentId, "eval.task.deleted", row.name);
  } else if (action === "runEvalTask") {
    const taskId = uuid.parse(body.taskId);
    const [task] = await db.select().from(evalTasks).where(and(eq(evalTasks.id, taskId), eq(evalTasks.workspaceId, workspaceId))).limit(1);
    if (!task) throw new Error("Eval task not found");
    const agent = await ownedAgent(workspaceId, task.agentId);
    const profile = resolveForAgent(agent.provider, loadProfiles());
    const attempt = await executeEvalTask({ workspaceId, task, agent, profile, system: systemPrompt(agent, []) });
    result = { result: attempt };
  } else if (action === "createSuite") {
    const input = z.object({ name: z.string().trim().min(1).max(80), agentId: uuid, taskIds: z.array(uuid).min(1).max(50), callCeiling: z.number().int().min(1).max(50).default(10) }).parse(body);
    const agent = await ownedAgent(workspaceId, input.agentId);
    const tasks = await db.select().from(evalTasks).where(and(eq(evalTasks.workspaceId, workspaceId), inArray(evalTasks.id, input.taskIds)));
    if (tasks.length !== input.taskIds.length) throw new Error("Every task in a suite must still exist in this workspace.");
    if (tasks.some(t => t.agentId !== agent.id)) throw new Error(`Every task in a suite must belong to ${agent.name}.`);
    const [suite] = await db.insert(evalSuites).values({ workspaceId, agentId: agent.id, name: input.name, taskIds: input.taskIds, callCeiling: input.callCeiling }).returning();
    await audit(workspaceId, agent.id, "suite.created", `${suite.name}: ${tasks.length} task(s), ceiling ${suite.callCeiling}`);
    result = { suiteId: suite.id };
  } else if (action === "runSuite") {
    const suiteId = uuid.parse(body.suiteId);
    const [suite] = await db.select().from(evalSuites).where(and(eq(evalSuites.id, suiteId), eq(evalSuites.workspaceId, workspaceId))).limit(1);
    if (!suite) throw new Error("Suite not found");
    const agent = await ownedAgent(workspaceId, suite.agentId);
    const profile = resolveForAgent(agent.provider, loadProfiles());
    const rows = await db.select().from(evalTasks).where(and(eq(evalTasks.workspaceId, workspaceId), inArray(evalTasks.id, suite.taskIds)));
    const order = new Map(suite.taskIds.map((id, index) => [id, index]));
    const tasks = rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const startedAt = new Date();
    let counts = { passed: 0, failed: 0, skipped: 0, errored: 0, modelCalls: 0 };
    let status: "COMPLETE" | "STOPPED_AT_CEILING" | "SKIPPED" = "COMPLETE";
    if (!tasks.length) {
      status = "SKIPPED";
    } else if (profile.name === "local" || !profile.configured) {
      status = "SKIPPED";
      counts = { ...counts, skipped: tasks.length };
    } else {
      const system = systemPrompt(agent, []);
      const outcome = await runSuiteTasks(tasks, suite.callCeiling, task => executeEvalTask({ workspaceId, task, agent, profile, system }).then(a => a.outcome));
      counts = outcome.counts;
      status = outcome.status;
    }
    const [updated] = await db.update(evalSuites).set({ ...counts, status, startedAt, finishedAt: new Date() }).where(eq(evalSuites.id, suite.id)).returning();
    await audit(workspaceId, agent.id, "suite.ran", `${suite.name}: ${status}, ${counts.modelCalls} call(s)`);
    result = {
      suite: {
        id: updated.id, name: updated.name, status: updated.status, passed: updated.passed, failed: updated.failed,
        skipped: updated.skipped, errored: updated.errored, modelCalls: updated.modelCalls,
        passRate: suitePassRate(updated), callCeiling: updated.callCeiling,
      },
    };
  } else if (action === "deleteSuite") {
    const suiteId = uuid.parse(body.suiteId);
    const [suite] = await db.select().from(evalSuites).where(and(eq(evalSuites.id, suiteId), eq(evalSuites.workspaceId, workspaceId))).limit(1);
    if (!suite) throw new Error("Suite not found");
    await db.delete(evalSuites).where(eq(evalSuites.id, suite.id));
    await audit(workspaceId, null, "suite.deleted", suite.name);
  } else if (action === "createResearchProject") {
    const input = z.object({ name: z.string().trim().min(1).max(80), question: z.string().trim().max(1000).default(""), agentId: uuid.optional(), teamId: uuid.optional() }).parse(body);
    if (input.agentId) await ownedAgent(workspaceId, input.agentId);
    if (input.teamId) {
      const [team] = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.id, input.teamId), eq(teams.workspaceId, workspaceId))).limit(1);
      if (!team) throw new Error("Organisation not found");
    }
    const [project] = await db.insert(researchProjects).values({ workspaceId, name: input.name, question: input.question, agentId: input.agentId ?? null, teamId: input.teamId ?? null }).returning();
    await audit(workspaceId, input.agentId ?? null, "research.project.created", project.name);
    result = { projectId: project.id };
  } else if (action === "updateResearchProject") {
    const input = z.object({
      projectId: uuid, name: z.string().trim().min(1).max(80).optional(), question: z.string().trim().max(1000).optional(),
      status: z.enum(["ACTIVE", "ARCHIVED"]).optional(), agentId: uuid.nullable().optional(), teamId: uuid.nullable().optional(),
    }).parse(body);
    const [project] = await db.select().from(researchProjects).where(and(eq(researchProjects.id, input.projectId), eq(researchProjects.workspaceId, workspaceId))).limit(1);
    if (!project) throw new Error("Research project not found");
    if (input.agentId) await ownedAgent(workspaceId, input.agentId);
    await db.update(researchProjects).set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.question !== undefined ? { question: input.question } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
      ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
      updatedAt: new Date(),
    }).where(eq(researchProjects.id, project.id));
    await audit(workspaceId, project.agentId, "research.project.updated", project.name + (input.status ? `: ${input.status.toLowerCase()}` : ""));
  } else if (action === "deleteResearchProject") {
    const projectId = uuid.parse(body.projectId);
    const [project] = await db.select().from(researchProjects).where(and(eq(researchProjects.id, projectId), eq(researchProjects.workspaceId, workspaceId))).limit(1);
    if (!project) throw new Error("Research project not found");
    await db.delete(researchProjects).where(eq(researchProjects.id, project.id));
    await audit(workspaceId, project.agentId, "research.project.deleted", project.name);
  } else if (action === "addResearchSource") {
    const input = z.object({
      projectId: uuid, url: z.string().trim().max(2000).optional(), text: z.string().max(20_000).optional(),
      title: z.string().trim().max(300).optional(), note: z.string().max(600).optional(), tag: z.string().trim().max(40).optional(),
    }).parse(body);
    const [project] = await db.select().from(researchProjects).where(and(eq(researchProjects.id, input.projectId), eq(researchProjects.workspaceId, workspaceId))).limit(1);
    if (!project) throw new Error("Research project not found");
    const collected = await collectResearchSource({ ...input, workspaceId });
    if (!collected.ok) throw new Error(collected.error);
    await db.update(researchProjects).set({ updatedAt: new Date() }).where(eq(researchProjects.id, project.id));
    await audit(workspaceId, project.agentId, "research.source.added", `${project.name}: ${collected.source.title || collected.source.host || "pasted note"}`);
    result = { sourceId: collected.source.id, kind: collected.kind };
  } else if (action === "updateResearchSource") {
    const input = z.object({ sourceId: uuid, pinned: z.boolean().optional(), note: z.string().max(600).optional(), tag: z.string().trim().max(40).optional() }).parse(body);
    const [source] = await db.select().from(researchSources).where(and(eq(researchSources.id, input.sourceId), eq(researchSources.workspaceId, workspaceId))).limit(1);
    if (!source) throw new Error("Source not found");
    await db.update(researchSources).set({
      ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
      ...(input.note !== undefined ? { note: input.note.trim() } : {}),
      ...(input.tag !== undefined ? { tag: input.tag } : {}),
    }).where(eq(researchSources.id, source.id));
    await audit(workspaceId, null, "research.source.updated", source.title || source.url || "pasted note");
  } else if (action === "deleteResearchSource") {
    const sourceId = uuid.parse(body.sourceId);
    const [source] = await db.select().from(researchSources).where(and(eq(researchSources.id, sourceId), eq(researchSources.workspaceId, workspaceId))).limit(1);
    if (!source) throw new Error("Source not found");
    await db.delete(researchSources).where(eq(researchSources.id, source.id));
    await audit(workspaceId, null, "research.source.deleted", source.title || source.url || "pasted note");
  } else if (action === "saveResearchFinding") {
    const input = z.object({ projectId: uuid, text: z.string().trim().min(3).max(2000), sourceIds: z.array(uuid).max(30).default([]) }).parse(body);
    const [project] = await db.select().from(researchProjects).where(and(eq(researchProjects.id, input.projectId), eq(researchProjects.workspaceId, workspaceId))).limit(1);
    if (!project) throw new Error("Research project not found");
    const owned = input.sourceIds.length ? await db.select({ id: researchSources.id }).from(researchSources)
      .where(and(eq(researchSources.projectId, project.id), inArray(researchSources.id, input.sourceIds))) : [];
    if (owned.length !== input.sourceIds.length) throw new Error("A finding may cite only sources inside its project.");
    await db.insert(researchFindings).values({ workspaceId, projectId: project.id, text: input.text, sourceIds: input.sourceIds });
    await db.update(researchProjects).set({ updatedAt: new Date() }).where(eq(researchProjects.id, project.id));
    await audit(workspaceId, project.agentId, "research.finding.saved", `${project.name}: ${input.text.slice(0, 120)}`);
  } else if (action === "deleteResearchFinding") {
    const findingId = uuid.parse(body.findingId);
    const [finding] = await db.select().from(researchFindings).where(and(eq(researchFindings.id, findingId), eq(researchFindings.workspaceId, workspaceId))).limit(1);
    if (!finding) throw new Error("Finding not found");
    await db.delete(researchFindings).where(eq(researchFindings.id, finding.id));
    await audit(workspaceId, null, "research.finding.deleted", finding.text.slice(0, 120));
  } else if (action === "createTeam") {
    const input = z.object({
      team: z.string().trim().min(1).max(60),
      brief: z.string().max(300).default(""),
      provider: providerChoice.default("auto"),
      agents: z.array(z.object({ name: z.string().trim().min(1).max(40), role: z.string().trim().min(1).max(80), instructions: z.string().max(2000).default("") })).min(2).max(6),
    }).parse(body);
    if (!knownProvider(input.provider)) throw new Error(`Unknown model "${input.provider}". List it in PROVIDERS first.`);
    await mayFound();
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
    await mayFound();
    const org = normaliseOrg({ team: input.team, brief: input.brief, members: input.members });
    if (!org) throw new Error("The organisation needs at least one seat with a name and a role.");
    if (input.managerId) await ownedAgent(workspaceId, input.managerId);
    const taken = (await db.select({ name: agents.name }).from(agents).where(and(eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt)))).map(r => r.name);
    const members = decollideOrg(org, taken).members;
    const takenTeams = await db.select({ name: teams.name }).from(teams).where(eq(teams.workspaceId, workspaceId));
    // L-11: confirming the same company twice used to create "hex-aq 2" and stack a second set of
    // seats beside the first. The name is the organisation, so a clash is refused, not suffixed.
    if (takenTeams.some(t => t.name.toLowerCase() === org.team.toLowerCase())) throw new Error(`An organisation called “${org.team}” already exists. Add seats to it from Organisation instead of founding a second one.`);
    const teamName = org.team;
    const [team] = await db.insert(teams).values({ workspaceId, name: teamName, brief: org.brief || `${members.length} seats created as one organisation`, creatorAgentId: workspace.creatorAgentId ?? null }).returning();
    const palette = ["sparkles", "globe", "palette", "sun", "bot", "zap"];
    const byIdName = new Map<string, string>();
    const created: { id: string; name: string; role: string }[] = [];
    for (const [i, member] of members.entries()) {
      const managerId = member.reportsTo ? byIdName.get(member.reportsTo.toLowerCase()) ?? input.managerId ?? null : input.managerId ?? null;
      const [row] = await db.insert(agents).values({ workspaceId, teamId: team.id, managerId: managerId ?? null, name: member.name, role: member.role, instructions: member.instructions, provider: input.provider, avatar: palette[i % palette.length], capabilities: { ...DEFAULT_CAPABILITIES, canConsult: "*", canHandoffTo: [] } }).returning();
      byIdName.set(member.name.toLowerCase(), row.id);
      created.push({ id: row.id, name: row.name, role: row.role });
    }
    // The lead is the seat the human briefs: the top of the chart, the first seat with nobody above
    // it. `resolveLead` applies the same rule when a brief arrives.
    const leadIndex = members.findIndex(m => !m.reportsTo);
    const leadSeat = created[leadIndex >= 0 ? leadIndex : 0];
    await db.update(teams).set({ leadAgentId: leadSeat.id }).where(eq(teams.id, team.id));
    await db.insert(messages).values(created.map((c, i) => {
      const reports = members.filter(mm => mm.reportsTo?.toLowerCase() === members[i].name.toLowerCase()).map(mm => mm.name);
      const boss = members[i].reportsTo;
      return { workspaceId, agentId: c.id, role: "assistant" as const, content: `I'm ${c.name} — ${c.role.toLowerCase()} at ${teamName}. ${boss ? `I report to ${boss}.` : "I own this organisation."} ${reports.length ? `My reports: ${reports.join(", ")}.` : ""} Ask me and I will pull the right seat in when the work needs it.` };
    }));
    await postToChannel(workspaceId, team.id, "assistant", { content: `${teamName} is open with ${created.length} seats that report to one another inside it. ${leadSeat.name} is the lead: brief that seat here and the work lands in this channel, including the answers the lead pulled out of its teammates.`, kind: "channel_opened", metadata: { seatCount: created.length } }, leadSeat);
    await audit(workspaceId, input.managerId ?? null, "org.created", `${teamName}: ${created.map(c => c.name).join(", ")}`);
    result = { teamId: team.id, agentIds: created.map(c => c.id), leadAgentId: leadSeat.id };
  } else if (action === "createEmptyTeam") {
    const input = z.object({ name: z.string().trim().min(1).max(60), brief: z.string().trim().max(400).default("") }).parse(body);
    await mayFound();
    const existing = await db.select({ name: teams.name }).from(teams).where(eq(teams.workspaceId, workspaceId));
    if (existing.some(t => t.name.toLowerCase() === input.name.toLowerCase())) throw new Error(`A team called “${input.name}” already exists.`);
    const [team] = await db.insert(teams).values({ workspaceId, name: input.name, brief: input.brief }).returning();
    await audit(workspaceId, null, "team.created", `${team.name}: empty team`);
    result = { teamId: team.id };
  } else if (action === "updateTeam") {
    const input = z.object({ teamId: uuid, name: z.string().trim().min(1).max(60).optional(), brief: z.string().trim().max(400).optional() }).parse(body);
    const [team] = await db.select().from(teams).where(and(eq(teams.id, input.teamId), eq(teams.workspaceId, workspaceId))).limit(1);
    if (!team) throw new Error("Team not found");
    if (input.name && input.name.toLowerCase() !== team.name.toLowerCase()) {
      const clash = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.workspaceId, workspaceId), sql`lower(${teams.name}) = ${input.name.toLowerCase()}`)).limit(1);
      if (clash.length) throw new Error(`A team called “${input.name}” already exists.`);
    }
    await db.update(teams).set({ ...(input.name ? { name: input.name } : {}), ...(input.brief !== undefined ? { brief: input.brief } : {}) }).where(eq(teams.id, team.id));
    await audit(workspaceId, null, "team.updated", input.name ?? team.name);
  } else if (action === "deleteTeam") {
    const teamId = uuid.parse(body.teamId);
    const [team] = await db.select().from(teams).where(and(eq(teams.id, teamId), eq(teams.workspaceId, workspaceId))).limit(1);
    if (!team) throw new Error("Team not found");
    await db.update(agents).set({ managerId: null }).where(and(eq(agents.teamId, team.id), eq(agents.workspaceId, workspaceId)));
    await db.delete(teams).where(eq(teams.id, team.id));
    await audit(workspaceId, null, "team.deleted", `${team.name}: seats kept, moved to the bench`);
  } else if (action === "assignAgent") {
    const agent = await ownedAgent(workspaceId, body.agentId);
    const teamId = body.teamId ? uuid.parse(body.teamId) : null;
    const managerId = body.managerId ? uuid.parse(body.managerId) : null;
    if (teamId) {
      const [team] = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.id, teamId), eq(teams.workspaceId, workspaceId))).limit(1);
      if (!team) throw new Error("Team not found");
      // Placing a seat into an org is staffing it, which belongs to that org's lead (or the creator).
      await mayStaff(teamId);
    }
    let nextManager: string | null = teamId ? managerId : null;
    if (nextManager) {
      if (nextManager === agent.id) throw new Error("An agent cannot report to itself.");
      const boss = await ownedAgent(workspaceId, nextManager);
      if (boss.teamId !== teamId) throw new Error("A manager must be on the same team.");
      // walk up the proposed chain: if it reaches this agent, the line would loop
      const all = await db.select({ id: agents.id, managerId: agents.managerId }).from(agents).where(and(eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt)));
      const up = new Map(all.map(a => [a.id, a.managerId]));
      for (let cursor: string | null | undefined = nextManager, hops = 0; cursor && hops < 100; cursor = up.get(cursor), hops++) {
        if (cursor === agent.id) throw new Error("That reporting line would loop back on itself.");
      }
    }
    await db.update(agents).set({ teamId, managerId: nextManager }).where(eq(agents.id, agent.id));
    // reports of a seat that leaves its team cannot keep pointing at it
    if (agent.teamId !== teamId) await db.update(agents).set({ managerId: null }).where(and(eq(agents.managerId, agent.id), eq(agents.workspaceId, workspaceId)));
    await audit(workspaceId, agent.id, "agent.assigned", `${agent.name} → ${teamId ? "team" : "bench"}${nextManager ? " with a manager" : ""}`);
  } else if (action === "createRoutine") {
    const agent = await ownedAgent(workspaceId, body.agentId);
    if (planBlocks("create_routine", normaliseCapabilities(agent.capabilities).permissionMode)) throw new Error(`${agent.name} is in plan mode: it can advise and propose, but not save routines. Switch its permission mode to act.`);
    const input = z.object({ name: z.string().trim().min(1).max(100), description: text, schedule: z.string().trim().min(1).max(120) }).parse(body);
    const [routine] = await db.insert(routines).values({ workspaceId, agentId: agent.id, ...input, timezone: workspace.timezone, nextRunAt: nextRunAt(input.schedule, workspace.timezone, new Date()) }).returning();
    await db.insert(messages).values({ workspaceId, agentId: agent.id, role: "assistant", content: `Done — “${routine.name}” is on your schedule (${routine.schedule}). ${workerEnabled() ? "The always-on scheduler checks for due routines every " + schedulerIntervalSeconds() + " seconds while this server is running." : "The in-process scheduler is switched off on this server, so it fires only when an outside clock calls /api/cron or when you open the workspace."} Run now executes it immediately.` });
    await audit(workspaceId, agent.id, "routine.created", routine.name);
  } else if (["toggleRoutine", "deleteRoutine", "runRoutine"].includes(action)) {
    const routineId = uuid.parse(body.routineId);
    const [routine] = await db.select().from(routines).where(and(eq(routines.id, routineId), eq(routines.workspaceId, workspaceId))).limit(1);
    if (!routine) throw new Error("Routine not found");
    await ownedAgent(workspaceId, routine.agentId);
    if (action === "toggleRoutine") {
      // Resuming recomputes the next occurrence: a routine paused for a week must not fire 40 times.
      // It also resets the fatigue streak — a person who switched it back on has just fixed
      // something and gets the full ten-failure silence again before anything re-announces itself.
      const resume = !routine.enabled;
      await db.update(routines).set({ enabled: resume, failStreak: resume ? 0 : routine.failStreak, nextRunAt: resume ? nextRunAt(routine.schedule, routine.timezone, new Date()) : null }).where(eq(routines.id, routine.id));
      await audit(workspaceId, routine.agentId, "routine.toggled", routine.name);
    }
    if (action === "deleteRoutine") { await db.delete(routines).where(and(eq(routines.id, routine.id), eq(routines.workspaceId, workspaceId))); await audit(workspaceId, routine.agentId, "routine.deleted", routine.name); }
    if (action === "runRoutine") {
      const key = request.headers.get("Idempotency-Key") || crypto.randomUUID();
      const [existing] = await db.select().from(runs).where(and(eq(runs.workspaceId, workspaceId), eq(runs.idempotencyKey, key))).limit(1);
      if (existing) result = { runId: existing.id };
      else if (inFlight.has(routine.id)) throw new Error(`${routine.name} is already running. Wait for it to finish.`);
      else {
        // The scheduler claims by setting lastStatus; Run now takes the same claim so a click and a
        // tick, or two clicks in two processes, cannot both execute this routine.
        if (!(await drizzleRunStore.claimRoutine(workspaceId, routine.id))) throw new Error(`${routine.name} is already running. Wait for it to finish.`);
        inFlight.add(routine.id);
        // Real execution: the same code path the scheduler uses, held open until the model answers so the
        // run row, the thread message and the board you get back all show the true outcome.
        try {
          await audit(workspaceId, routine.agentId, "routine.run.requested", routine.name);
          const outcome = await executeRoutine(workspaceId, routine, new Date(), routine.nextRunAt, { idempotencyKey: key });
          result = { runId: outcome.runId, status: outcome.status };
        } finally { inFlight.delete(routine.id); }
      }
    }
  } else if (action === "cancelRun") {
    const runId = uuid.parse(body.runId);
    const [run] = await db.select().from(runs).where(and(eq(runs.id, runId), eq(runs.workspaceId, workspaceId))).limit(1);
    if (!run) throw new Error("Run not found");
    if (["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(run.status)) throw new Error("This run has already finished.");
    // Name what actually happened before the stop. The old sentence claimed nothing external had
    // run even after a model call or a sandbox command had already been made.
    const steps = await db.select({ title: runSteps.title }).from(runSteps).where(eq(runSteps.runId, run.id));
    const began = steps.map(s => s.title).filter(title => !["Claimed", "Started", "Run cancelled", "Missed the scheduled instant"].includes(title));
    const summary = began.length
      ? `Cancelled by user after: ${began.slice(-3).join(", ")}. Nothing further will run; what already ran is in this run's steps.`
      : "Cancelled by user. No external actions were performed.";
    const [cancelled] = await db.update(runs).set({ status: "CANCELLED", completedAt: new Date(), summary })
      .where(and(eq(runs.id, run.id), eq(runs.status, "RUNNING"))).returning();
    if (!cancelled) throw new Error("This run finished before the stop landed. Nothing was left running.");
    await db.insert(runSteps).values({ workspaceId, runId: run.id, title: "Run cancelled", detail: summary, status: "CANCELLED" });
    await audit(workspaceId, run.agentId, "run.cancelled", run.title);
  } else if (action === "decideApproval") {
    const approvalId = uuid.parse(body.approvalId);
    const decision = z.enum(["APPROVED", "REJECTED"]).parse(body.decision);
    const [approval] = await db.select().from(approvals).where(and(eq(approvals.id, approvalId), eq(approvals.workspaceId, workspaceId))).limit(1);
    if (!approval || approval.status !== "PENDING") throw new Error("Approval is no longer pending");
    await db.update(approvals).set({ status: decision }).where(eq(approvals.id, approval.id));
    await audit(workspaceId, approval.agentId, `approval.${decision.toLowerCase()}`, approval.title);
  } else if (action === "renameWorkspace") {
    const name = z.string().trim().min(2).max(60).parse(body.name);
    await db.update(workspaces).set({ name }).where(eq(workspaces.id, workspaceId));
    await audit(workspaceId, null, "workspace.renamed", `Workspace renamed to ${name}`);
  } else if (action === "removePerson") {
    const input = z.object({ userId: uuid }).parse(body);
    if (!actor || actor.role !== "owner") throw new Error("Only the owner can remove people.");
    if (input.userId === actor.userId) throw new Error("You cannot remove yourself. Promote another owner first.");
    const outcome = await removePerson(workspaceId, input.userId);
    if (!outcome.ok) throw new Error(outcome.error ?? "That person could not be removed.");
  } else if (action === "setPersonRole") {
    const input = z.object({ userId: uuid, role: z.enum(["owner", "member"]) }).parse(body);
    if (!actor) throw new Error("Sign in first.");
    const outcome = await setPersonRole(workspaceId, actor, input.userId, input.role);
    if (!outcome.ok) throw new Error(outcome.error ?? "That role could not be set.");
  } else if (action === "loadEarlier") {
    // One page of older history for the windowed board: 100 messages before the oldest loaded.
    // The timestamp alone is not a cursor — rows inserted in one statement share it — so the id
    // breaks the tie and a page boundary can never skip the rest of a tied group.
    const input = z.object({ before: z.string().min(10).max(40), beforeId: z.string().uuid().optional() }).parse(body);
    const beforeDate = new Date(input.before);
    if (Number.isNaN(beforeDate.getTime())) throw new Error("The point in time to page from could not be read.");
    const scope = eq(messages.workspaceId, workspaceId);
    const older = await db.select().from(messages)
      .where(input.beforeId
        ? and(scope, or(lt(messages.createdAt, beforeDate), and(eq(messages.createdAt, beforeDate), lt(messages.id, input.beforeId))))
        : and(scope, lt(messages.createdAt, beforeDate)))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(100);
    result = { earlier: older.reverse() };
  } else if (action === "updateWorkspace") {
    const timezone = z.string().min(1).max(100).parse(body.timezone);
    try { Intl.DateTimeFormat(undefined, { timeZone: timezone }); } catch { throw new Error("Invalid timezone"); }
    await db.update(workspaces).set({ timezone }).where(eq(workspaces.id, workspaceId));
    // Routines arm from the workspace zone when they carry none of their own; clearing the due
    // time makes the next tick re-anchor every schedule to the new clock instead of lying until
    // the stale time passes.
    await db.update(routines).set({ nextRunAt: null }).where(eq(routines.workspaceId, workspaceId));
    await audit(workspaceId, null, "workspace.updated", `Timezone: ${timezone}`);
  } else if (action === "checkProvider") {
    // Ask the gateway what it actually serves instead of trusting a model name from a file. The
    // probe is forced so a model fixed in env is picked up on the next message, not a restart.
    const wanted = typeof body.provider === "string" ? body.provider : "";
    const checked = loadProfiles().filter(p => p.configured && p.name !== "local" && (!wanted || p.name === wanted));
    if (!checked.length) throw new Error("No provider with a key on this server matches that check, so there is nothing to ask.");
    result = {
      providers: await Promise.all(checked.map(async p => {
        const resolved = await ensureServedModel(p, { force: true });
        return {
          name: p.name, label: p.label, model: resolved.profile.model, pinned: Boolean(p.modelPinned),
          reachable: resolved.count !== undefined, served: resolved.served ?? null, auto: resolved.auto,
          count: resolved.count ?? null, suggestion: resolved.suggestion ?? null, error: resolved.error ?? null,
        };
      })),
    };
  } else if (action === "runSandboxCommand") {
    const input = z.object({ agentId: uuid, command: z.string().trim().min(1).max(2000) }).parse(body);
    const agent = await ownedAgent(workspaceId, input.agentId);
    result = { sandbox: await runSandboxCommand({ workspaceId, agentId: agent.id, agentName: agent.name, agentVersionId: await ensureAgentVersion(agent), command: input.command }) };
  } else if (action === "resetSandbox") {
    const agent = await ownedAgent(workspaceId, body.agentId);
    await sandboxProvider.destroy(agent.id);
    await db.delete(sandboxes).where(and(eq(sandboxes.workspaceId, workspaceId), eq(sandboxes.agentId, agent.id)));
    await audit(workspaceId, agent.id, "sandbox.reset", agent.name);
    result = { reset: true };
  } else if (action === "runTool") {
    // A real execution, started by a person, recorded as a real run with a real step.
    // The seat's grant list still decides — a tool a seat was not given cannot be run through it.
    const input = z.object({ agentId: uuid, toolId: z.string().trim().min(1).max(40), toolInput: z.string().min(1).max(20_000) }).parse(body);
    const runner = await ownedAgent(workspaceId, input.agentId);
    const spec = TOOL_REGISTRY.find(t => t.id === input.toolId && t.available && (t.kind === "local" || t.id === "web_fetch"));
    if (!spec) throw new Error(`"${input.toolId}" is not a tool this deployment can genuinely run.`);
    const caps = normaliseCapabilities(runner.capabilities);
    if (!resolveTools(caps, { hasTeam: true }).includes(spec.id)) throw new Error(`${runner.name} is not granted "${spec.label}". Turn it on in ${runner.name} › Capabilities.`);
    const [toolRun] = await db.insert(runs).values({ workspaceId, agentId: runner.id, agentVersionId: await ensureAgentVersion(runner), title: `Tool · ${spec.label}`, status: "RUNNING", summary: input.toolInput.slice(0, 240), initiator: "person", startedAt: new Date() }).returning();
    const executed = spec.id === "web_fetch" ? await webFetch(input.toolInput) : runLocalTool(spec.id, input.toolInput);
    await db.insert(runSteps).values({ workspaceId, runId: toolRun.id, title: executed.ok ? `${spec.label} ran in this process` : `${spec.label} refused`, detail: (executed.ok ? executed.output ?? "" : executed.error ?? "").slice(0, 4000), status: executed.ok ? "COMPLETED" : "FAILED" });
    const toolSummary = executed.ok ? `Ran: ${input.toolInput.slice(0, 100)} → ${String(executed.output).slice(0, 100)}` : `Refused: ${executed.error ?? "unknown"}`;
    if (await finishRun(drizzleRunStore, toolRun.id, executed.ok ? "COMPLETED" : "FAILED", toolSummary.slice(0, 240)) === "updated") {
      await audit(workspaceId, runner.id, "tool.ran", `${spec.label} (${runner.name}): ${executed.ok ? "completed" : "refused"}`);
    }
    result = { tool: { id: spec.id, ...executed }, runId: toolRun.id };
  } else {
    throw new Error("Unknown action");
  }
  return { result };
}
