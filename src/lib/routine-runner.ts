import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { messages, routines, runs, runSteps, schedulerHeartbeats, workspaces } from "@/db/schema";
import { audit } from "@/lib/audit";
import { finishRun } from "@/lib/run-contract";
import { drizzleRunStore } from "@/lib/run-contract-drizzle";
import { missedIntervalMs, nextRunAt, parseSchedule } from "@/lib/scheduler";
import { nextFatigue } from "@/lib/fatigue";
import { completionText, estimateTokens, loadProfiles, requestCompletion, resolveForAgent, usageFromJson } from "@/lib/model-gateway";
import { overQuota, recordUsage } from "@/lib/budget";
import { normaliseCapabilities, tokenBudgetFor } from "@/lib/tools";
import { splitReasoning } from "@/lib/markdown";
import { notifyChannels, ownedAgent, peersOf, recentTurns, systemPrompt } from "@/lib/board-core";
import { num } from "@/lib/budget";
import { ensureAgentVersion } from "@/lib/versions-drizzle";

const requestTimeoutMs = () => num(process.env.MODEL_TIMEOUT_MS, 45000);

/** The routine clock and reaper, process-local by design; SQL claims are the cross-process fence. */

/** Routines currently executing in this process, so one tick cannot start the same run twice. */
export const inFlight = new Set<string>();
/** Brief runs this process is still driving, so the reaper never closes a live brief as interrupted. */
export const liveRuns = new Set<string>();

/**
 * The scheduler tick. The in-process worker calls this too. A board read still claims due work
 * so a workspace opened with the worker off does not silently skip. The UI names which clock
 * actually beat.
 */
export async function tickSchedules(workspaceId: string): Promise<Promise<unknown>[]> {
  const now = new Date();
  const started: Promise<unknown>[] = [];
  const [ws] = await db.select({ timezone: workspaces.timezone }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  // Routines saved before this feature have no due time; give them one rather than showing "not scheduled".
  const unanchored = await db.select().from(routines).where(and(eq(routines.workspaceId, workspaceId), eq(routines.enabled, true), isNull(routines.nextRunAt))).limit(10);
  for (const row of unanchored) {
    const first = nextRunAt(row.schedule, row.timezone || ws?.timezone || "UTC", now);
    if (first) await db.update(routines).set({ nextRunAt: first }).where(eq(routines.id, row.id));
  }
  const due = await db.select().from(routines)
    .where(and(eq(routines.workspaceId, workspaceId), eq(routines.enabled, true), lte(routines.nextRunAt, now), sql`${routines.nextRunAt} IS NOT NULL`))
    .orderBy(routines.nextRunAt).limit(20);
  // A cold start used to claim the entire overdue backlog of every workspace at once (measured: 157
  // routines in one tick). The cap above is per workspace; across workspaces the pass below bounds
  // how many are claimed per tick, so a re-armed server drains the backlog in steps, not in a stampede.
  for (const routine of due) {
    if (inFlight.has(routine.id)) continue;
    // Claim by predicate, not by the value we read. Postgres re-checks the WHERE clause after the
    // row lock, so a second tab that races us finds it no longer due and skips. Comparing the
    // timestamp itself would never match: the column keeps microseconds, a JS Date keeps milliseconds.
    const next = nextRunAt(routine.schedule, routine.timezone || ws?.timezone || "UTC", now);
    const schedule = parseSchedule(routine.schedule);
    const missed = schedule && routine.nextRunAt ? missedIntervalMs(schedule, routine.nextRunAt, now) : false;
    const [claimed] = await db.update(routines)
      .set({ lastRunAt: now, nextRunAt: next, lastStatus: "RUNNING" })
      .where(and(eq(routines.id, routine.id), lte(routines.nextRunAt, now)))
      .returning();
    if (!claimed) continue;
    inFlight.add(routine.id);
    started.push(executeRoutine(workspaceId, routine, now, claimed.nextRunAt, undefined, missed).catch(error => console.error("Routine failed", error instanceof Error ? error.message : "unknown error")).finally(() => inFlight.delete(routine.id)));
  }
  return started;
}

/** A run still RUNNING after this long was cut off by a restart or a crash; no model call lasts this long. */
const STUCK_RUN_MS = 15 * 60_000;

/** Close runs that a restart orphaned, so a 24/7 scheduler never shows a routine "running" for days. */
export async function reapStuckRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_RUN_MS);
  const stuck = await db.select().from(runs).where(and(eq(runs.status, "RUNNING"), lte(runs.startedAt, cutoff))).limit(50);
  for (const run of stuck) {
    if (run.routineId ? inFlight.has(run.routineId) : liveRuns.has(run.id)) continue;
    await db.update(runs).set({ status: "FAILED", completedAt: new Date(), summary: "Interrupted: the server restarted or stopped before this run finished. Nothing further was executed." }).where(eq(runs.id, run.id));
    await db.insert(runSteps).values({ workspaceId: run.workspaceId, runId: run.id, title: "Interrupted", detail: "Closed by the scheduler after the server stopped mid-run.", status: "FAILED" });
    if (run.routineId) await db.update(routines).set({ lastStatus: "FAILED" }).where(and(eq(routines.id, run.routineId), eq(routines.lastStatus, "RUNNING")));
    await audit(run.workspaceId, run.agentId, "run.interrupted", run.title);
  }
  return stuck.length;
}

export type TickSource = "worker" | "cron";

/**
 * One pass over every workspace. This is what makes the scheduler always-on: the in-process worker
 * (src/instrumentation.ts) calls it on an interval, and /api/cron calls it for an outside clock.
 * `wait` is for serverless callers whose process may be frozen the moment the response is sent.
 */
export async function tickAllWorkspaces(source: TickSource, options: { wait?: boolean } = {}): Promise<{ workspaces: number; claimed: number; reaped: number }> {
  let claimed = 0, reaped = 0, failure: string | null = null;
  let workspaceCount = 0;
  try {
    reaped = await reapStuckRuns();
    const now = new Date();
    const due = await db.selectDistinct({ workspaceId: routines.workspaceId }).from(routines)
      .where(and(eq(routines.enabled, true), or(isNull(routines.nextRunAt), lte(routines.nextRunAt, now))));
    // One tick never opens an unbounded number of per-workspace passes. Whatever is left waits for
    // the next beat, which is what keeps a restart from firing every overdue routine at once.
    const MAX_TICK_WORKSPACES = 20;
    workspaceCount = due.length;
    const pending: Promise<unknown>[] = [];
    for (const { workspaceId } of due.slice(0, MAX_TICK_WORKSPACES)) {
      try {
        const started = await tickSchedules(workspaceId);
        claimed += started.length;
        pending.push(...started);
      } catch (error) {
        failure = error instanceof Error ? error.message.slice(0, 200) : "unknown error";
        console.error("Scheduler tick failed", failure);
      }
    }
    if (options.wait) await Promise.allSettled(pending);
  } catch (error) {
    failure = error instanceof Error ? error.message.slice(0, 200) : "unknown error";
    console.error("Scheduler pass failed", failure);
  }
  await db.insert(schedulerHeartbeats).values({ source, ticks: 1, lastClaimed: claimed, totalClaimed: claimed, lastError: failure })
    .onConflictDoUpdate({ target: schedulerHeartbeats.source, set: { lastTickAt: new Date(), ticks: sql`${schedulerHeartbeats.ticks} + 1`, lastClaimed: claimed, totalClaimed: sql`${schedulerHeartbeats.totalClaimed} + ${claimed}`, lastError: failure } })
    .catch(error => console.error("Heartbeat write failed", error instanceof Error ? error.message : "unknown error"));
  return { workspaces: workspaceCount, claimed, reaped };
}

/** Called once when the in-process worker boots so the "since" time on screen is this process's start. */
export async function markWorkerStarted() {
  await db.insert(schedulerHeartbeats).values({ source: "worker", ticks: 0 })
    .onConflictDoUpdate({ target: schedulerHeartbeats.source, set: { startedAt: new Date(), lastTickAt: new Date(), ticks: 0, lastClaimed: 0, lastError: null } });
}

/** One scheduled execution: a real run, real steps, and the answer posted into the agent's thread. */
export async function executeRoutine(workspaceId: string, routine: typeof routines.$inferSelect, startedAt: Date, nextRun: Date | null, manual?: { idempotencyKey: string }, missed = false): Promise<{ runId: string; status: string; summary: string }> {
  const [run] = await db.insert(runs).values({ workspaceId, agentId: routine.agentId, routineId: routine.id, title: routine.name, status: "RUNNING", summary: manual ? "Started by you with Run now" : missed ? "The scheduled instant was missed; this is the single catch-up." : `Scheduled for ${startedAt.toISOString()}`, initiator: manual ? "person" : "routine", idempotencyKey: manual?.idempotencyKey, startedAt }).returning();
  let outcome = { runId: run.id, status: "RUNNING", summary: "" };
  let agentName = "";
  let teamId: string | null = null;
  const step = (title: string, detail = "") => db.insert(runSteps).values({ workspaceId, runId: run.id, title, detail });
  const finish = async (status: string, summary: string): Promise<{ runId: string; status: string; summary: string }> => {
    const storedSummary = missed ? `Missed the scheduled slot; caught up once. ${summary}`.slice(0, 280) : summary;
    // A cancel that already landed wins: the run row is only ours while it is still RUNNING.
    const stored = await finishRun(drizzleRunStore, run.id, status, storedSummary);
    if (stored === "already-finished") {
      if (!manual) await db.update(routines).set({ lastStatus: "CANCELLED" }).where(eq(routines.id, routine.id));
      return { runId: run.id, status: "CANCELLED", summary: "Cancelled by a person while this run was in flight. Nothing further was sent; what already ran is in its steps." };
    }
    outcome = { runId: run.id, status, summary: storedSummary };
    void notifyChannels(workspaceId, teamId, { kind: "run", title: routine.name, status, summary: storedSummary, agentName, runId: run.id });
    if (manual) {
      // A person pressing Run now neither moves the schedule nor counts toward the fatigue streak.
      await db.update(routines).set({ lastStatus: status, lastRunAt: new Date() }).where(eq(routines.id, routine.id));
      await audit(workspaceId, routine.agentId, "routine.ran", `${routine.name}: ${status.toLowerCase()} (run now)`);
      return outcome;
    }
    // The fatigue rule: one message on the first failure after a success, silence through the
    // streak, and ten in a row switches the routine off — an expired key fires cleanly forever,
    // and only switching off, and saying so, ends it.
    const f = nextFatigue(status, routine.failStreak, true);
    await db.update(routines).set({ lastStatus: status, nextRunAt: nextRun ?? routine.nextRunAt, failStreak: f.streak, ...(f.off ? { enabled: false } : {}) }).where(eq(routines.id, routine.id));
    await audit(workspaceId, routine.agentId, "routine.ran", `${routine.name}: ${status.toLowerCase()}`);
    if (f.message === "first") {
      await db.insert(messages).values({ workspaceId, agentId: routine.agentId, role: "assistant", content: `${routine.name} did not produce an answer: ${storedSummary} This is the first failure since it last worked, so it is reported once. Nine more in a row and the routine switches itself off.`, kind: "message", metadata: { fatigue: "first", routineId: routine.id, runId: run.id, scheduled: true } });
    }
    if (f.message === "final") {
      await db.insert(messages).values({ workspaceId, agentId: routine.agentId, role: "assistant", content: `${routine.name} has failed ${f.streak} runs in a row, so it is switched off and nothing more will fire. Last failure: ${storedSummary} Fix what it needs — a paused seat, a missing key, the daily budget — then switch it back on.`, kind: "message", metadata: { fatigue: "final", routineId: routine.id, runId: run.id, scheduled: true } });
      await audit(workspaceId, routine.agentId, "routine.fatigued", `${routine.name}: switched off after ${f.streak} consecutive failures`);
    }
    return outcome;
  };
  await step(manual ? "Started" : "Claimed", manual ? "Run now" : `${routine.schedule} · ${routine.timezone}`);
  if (missed) await step("Missed the scheduled instant", "The app was closed long enough that at least one interval went by. This one catch-up stands in for the missed runs; the schedule moves to its next occurrence.");
  try {
    const agent = await ownedAgent(workspaceId, routine.agentId);
    agentName = agent.name;
    teamId = agent.teamId;
    await db.update(runs).set({ agentVersionId: await ensureAgentVersion(agent) }).where(eq(runs.id, run.id));
    if (agent.status !== "ACTIVE") return finish("FAILED", `${agent.name} is paused, so the schedule did not run. Resume the agent to continue.`);
    const profile = resolveForAgent(agent.provider, loadProfiles());
    if (!profile.configured) return finish("FAILED", `${profile.label} has no key on this server, so nothing was executed.`);
    if (await overQuota(workspaceId, profile)) return finish("WAITING_FOR_TOOL", `The daily model budget was reached, so this run waited instead of spending more.`);
    const history = await recentTurns(workspaceId, routine.agentId);
    const caps = normaliseCapabilities(agent.capabilities);
    const task = `${routine.description}

(This is a scheduled run of "${routine.name}", not a message from the user. Answer it directly; state anything you could not verify.)`;
    await step("Calling the model", profile.label);
    const response = await requestCompletion({ profile, messages: [{ role: "system", content: systemPrompt(agent, await peersOf(workspaceId, agent)) }, ...history.filter(m => m.role === "user" || m.role === "assistant").slice(-8).map(m => ({ role: m.role, content: m.content })), { role: "user", content: task }], maxTokens: tokenBudgetFor(caps), stream: false, timeoutMs: requestTimeoutMs() });
    const body = await response.json();
    const answer = completionText(body).trim();
    if (!answer) return finish("FAILED", "The model returned no text.");
    const counted = usageFromJson(body);
    await recordUsage(workspaceId, profile.name, counted?.input ?? estimateTokens(task), counted?.output ?? estimateTokens(answer), Boolean(counted));
    const said = splitReasoning(answer).rest;
    await step("Answered", `${said.length} characters from ${profile.model}`);
    await db.insert(messages).values({ workspaceId, agentId: routine.agentId, role: "assistant", content: answer, kind: "message", metadata: { provider: profile.name, model: profile.model, scheduled: !manual, routineId: routine.id, runId: run.id } });
    await finish("COMPLETED", said ? said.slice(0, 280) : "The model returned reasoning only, so there is no answer to show. The stored message keeps exactly what it produced.");
  } catch (error) {
    await step("Failed", error instanceof Error ? error.message.slice(0, 200) : "unknown error");
    await finish("FAILED", error instanceof Error ? error.message.slice(0, 280) : "The scheduled run failed.");
  }
  return outcome;
}


