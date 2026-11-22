/**
 * Spec 16b — the worker (`npm run worker`). A separate Node process that claims durable jobs from
 * the `jobs` table with `FOR UPDATE SKIP LOCKED` plus a DB-clock lease, executes one job at a time,
 * heartbeats its liveness, and shuts down gracefully. It reuses the board route's execution paths
 * (`executeRoutine`, `runBrief`) so no business logic is duplicated; the `@/` alias is resolved by
 * scripts/worker-loader.mjs because this process runs outside Next.
 *
 * Nothing here fabricates progress: a job is RUNNING only while a lease is held, and its final
 * state is written from what the run actually recorded.
 */
import { config as loadEnv } from "dotenv";

// Next.js loads .env.local over .env for the app; this process runs outside Next, so mirror it here.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { agents, attentionItems, channelConnections, events, jobs, modelUsage, routines, teams, triggers, watches, workerHeartbeats } from "@/db/schema";
import { afterFailure, backoffMs, leaseUntil, retentionCutoff, type JobStatus } from "@/lib/jobs";
import { decryptSecret } from "@/lib/credentials";
import { slackApiBase } from "@/lib/channels/slack";
import { assertFetchableUrl, parseAllowlist, truncateOutput } from "@/lib/policy";
import { attentionDecision, evaluateCondition, watchDedupeKey, watchFailure } from "@/lib/goals";
import { extractText, parseFetchCap } from "@/lib/webfetch";
import { nextRunAt } from "@/lib/scheduler";
import { resolveLead } from "@/lib/channel";
import { executeRoutine, runBrief } from "@/app/api/board/route";

const envNum = (name: string, fallback: number) => (process.env[name] === undefined || process.env[name] === "" || Number.isNaN(Number(process.env[name])) ? fallback : Number(process.env[name]));

const workerId = `worker-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
const concurrency = Math.max(1, envNum("WORKER_CONCURRENCY", 1));
const pollMs = Math.max(500, envNum("WORKER_POLL_MS", 5000));
const leaseMs = Math.max(10_000, envNum("WORKER_LEASE_MS", 300_000));

type JobRow = typeof jobs.$inferSelect;

/**
 * The claim returns raw Postgres columns (`RETURNING jobs.*`), so the row is mapped here once —
 * a missed mapping shows up as an undefined workspaceId, which is a NOT NULL violation on the
 * first write, not a silent bug.
 */
type RawJob = { id: string; workspace_id: string; kind: string; subject_id: string | null; payload: Record<string, unknown>; status: string; attempts: number; max_attempts: number; run_at: Date; lease_until: Date | null; worker_id: string | null; run_id: string | null; last_error: string | null; idempotency_key: string | null; created_by: string | null; created_at: Date; updated_at: Date };

const toJob = (r: RawJob): JobRow => ({
  id: r.id, workspaceId: r.workspace_id, kind: r.kind, subjectId: r.subject_id, payload: r.payload,
  status: r.status, attempts: r.attempts, maxAttempts: r.max_attempts, runAt: r.run_at, leaseUntil: r.lease_until,
  workerId: r.worker_id, runId: r.run_id, lastError: r.last_error, idempotencyKey: r.idempotency_key,
  createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});

/**
 * The claim: one UPDATE, one locked subquery. `SKIP LOCKED` means two workers racing for the same
 * job each lock a different row or walk away empty; the lease is DB-clock, so a worker whose process
 * froze cannot hold the job forever — the next poll after expiry reclaims it.
 */
const claimSql = sql`
  UPDATE jobs SET
    status = 'RUNNING',
    attempts = jobs.attempts + 1,
    worker_id = ${workerId},
    lease_until = now() + make_interval(secs => ${leaseMs / 1000}),
    updated_at = now()
  WHERE jobs.id = (
    SELECT jobs.id FROM jobs
    JOIN workspaces ON workspaces.id = jobs.workspace_id AND workspaces.paused_at IS NULL
    WHERE jobs.status IN ('QUEUED', 'RETRYING')
      AND jobs.run_at <= now()
      AND (jobs.lease_until IS NULL OR jobs.lease_until < now())
    ORDER BY jobs.run_at ASC
    LIMIT 1
    FOR UPDATE OF jobs SKIP LOCKED
  )
  RETURNING jobs.*`;

async function heartbeat() {
  await db.insert(workerHeartbeats).values({ id: workerId, pid: process.pid })
    .onConflictDoUpdate({ target: workerHeartbeats.id, set: { lastSeenAt: new Date(), pid: process.pid } });
}

/**
 * Close the job from what the run recorded, never from what was hoped. Only the lease holder may
 * finalize (the `status = 'RUNNING'` predicate), so a reclaimed zombie's late write loses. A budget
 * stop (WAITING_FOR_TOOL) retries with backoff; every other failure follows the retry policy and
 * dead-letters as FAILED once attempts run out. Returns the job's final status so a caller that
 * delivers outward (Slack) can speak once, on the outcome — not once per attempt.
 */
async function finalize(job: JobRow, outcome: { status: string; runId?: string } | null, error?: unknown): Promise<JobStatus> {
  let status: JobStatus;
  let runAt: Date | undefined;
  let lastError: string | undefined;
  if (error) {
    const verdict = afterFailure(job.attempts, job.maxAttempts);
    status = verdict.status;
    if (verdict.status === "RETRYING") runAt = new Date(Date.now() + backoffMs(job.attempts));
    lastError = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  } else if (!outcome) {
    status = "FAILED";
    lastError = "The job produced no outcome.";
  } else if (outcome.status === "COMPLETED") {
    status = "SUCCEEDED";
  } else if (outcome.status === "CANCELLED") {
    status = "CANCELLED";
  } else if (outcome.status === "WAITING_FOR_TOOL") {
    // The daily budget stopped the run; try again later rather than declaring it dead on attempt one.
    const verdict = afterFailure(job.attempts, job.maxAttempts);
    status = verdict.status;
    if (verdict.status === "RETRYING") runAt = new Date(Date.now() + backoffMs(job.attempts));
    lastError = "The daily model budget stopped this run.";
  } else {
    const verdict = afterFailure(job.attempts, job.maxAttempts);
    status = verdict.status;
    if (verdict.status === "RETRYING") runAt = new Date(Date.now() + backoffMs(job.attempts));
    lastError = `The run ended ${outcome.status.toLowerCase()}.`;
  }
  await db.update(jobs).set({
    status,
    ...(runAt ? { runAt } : {}),
    ...(outcome?.runId ? { runId: outcome.runId } : {}),
    ...(lastError !== undefined ? { lastError } : {}),
    leaseUntil: null,
    updatedAt: new Date(),
  }).where(and(eq(jobs.id, job.id), eq(jobs.status, "RUNNING"), eq(jobs.workerId, workerId)));
  if (status !== "SUCCEEDED") console.error(`job ${job.id} (${job.kind}) → ${status}${lastError ? `: ${lastError}` : ""}`);
  return status;
}

async function execute(job: JobRow) {
  try {
    if (job.kind === "routine" || job.kind === "manual_run") {
      const routineId = (job.payload as { routineId?: string }).routineId ?? job.subjectId;
      if (!routineId) throw new Error("The job names no routine.");
      const [routine] = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
      if (!routine) throw new Error("The routine this job was for no longer exists.");
      // Re-read the routine fresh: a schedule edited between enqueue and claim is the one honoured.
      const nextRun = job.kind === "manual_run"
        ? nextRunAt(routine.schedule, routine.timezone, new Date())
        : routine.nextRunAt;
      const outcome = await executeRoutine(job.workspaceId, routine, new Date(), nextRun, job.kind === "manual_run" ? "person" : "routine");
      await finalize(job, outcome);
    } else if (job.kind === "trigger_brief") {
      const payload = job.payload as { triggerId?: string; teamId?: string; label?: string; text?: string; slack?: { connectionId: string; channel: string; threadTs: string | null } };
      if (!payload.teamId || !payload.text) throw new Error("The job is missing its organisation or its text.");
      const [team] = await db.select().from(teams).where(eq(teams.id, payload.teamId)).limit(1);
      if (!team) throw new Error("The organisation this trigger belonged to no longer exists.");
      const seats = await db.select().from(agents).where(and(eq(agents.workspaceId, job.workspaceId), eq(agents.teamId, team.id), eq(agents.status, "ACTIVE")));
      const lead = resolveLead(seats, team.leadAgentId);
      if (!lead) throw new Error(`${team.name} has no active seats, so there is nobody to brief.`);
      const outcome = await runBrief(job.workspaceId, team, lead, payload.text, () => {}, () => false, "trigger");
      // The cooldown runs from the end of the work, not its start — the same rule the request path
      // followed when it ran briefs inline.
      if (payload.triggerId) await db.update(triggers).set({ lastFiredAt: new Date() }).where(eq(triggers.id, payload.triggerId));
      const finalStatus = await finalize(job, outcome);
      // Spec 21b: the report is a projection — ONE final post into the mention's thread, spoken on
      // the terminal outcome only (a RETRYING attempt says nothing; its successor will). A failed
      // delivery is logged, never silently swallowed, and the brief's own record stands either way.
      if (payload.slack && finalStatus !== "RETRYING") {
        try {
          const [connection] = await db.select().from(channelConnections).where(eq(channelConnections.id, payload.slack.connectionId)).limit(1);
          if (connection) {
            const sealed = JSON.parse(decryptSecret(connection.envelope, process.env.CREDENTIAL_ENCRYPTION_KEY)) as { botToken?: string };
            if (sealed.botToken) {
              await fetch(`${slackApiBase()}/chat.postMessage`, {
                method: "POST",
                headers: { "content-type": "application/json", authorization: `Bearer ${sealed.botToken}` },
                body: JSON.stringify({
                  channel: payload.slack.channel,
                  thread_ts: payload.slack.threadTs ?? undefined,
                  text: `${team.name} · ${outcome.status.toLowerCase()} — ${outcome.summary.slice(0, 500)}`,
                }),
                signal: AbortSignal.timeout(10_000),
              });
            }
          }
        } catch (error) {
          console.error(`slack delivery failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } else if (job.kind === "watch_check") {
      // Spec 22: one observation through the web_fetch policy. The watch row carries the outcome —
      // hash, evidence, failure ladder — so the attention item, when one fires, always has evidence.
      const payload = job.payload as { watchId?: string };
      const watchRef = payload.watchId ?? job.subjectId;
      if (!watchRef) throw new Error("The job names no watch.");
      const [watch] = await db.select().from(watches).where(eq(watches.id, watchRef)).limit(1);
      if (!watch || !watch.enabled) {
        await finalize(job, { status: "COMPLETED" });
        return;
      }
      try {
        const url = assertFetchableUrl(watch.url, parseAllowlist(process.env.TOOL_ALLOWED_HOSTS));
        const res = await fetch(url, { headers: { "user-agent": "ArovaWatch/1 (+web_fetch)" }, signal: AbortSignal.timeout(15_000), redirect: "follow" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const contentType = res.headers.get("content-type") ?? "";
        if (!/^(text\/|application\/(json|xml))/.test(contentType)) throw new Error(`refusing content-type ${contentType.split(";")[0] || "unknown"}`);
        const observation = truncateOutput(extractText(await res.text()), parseFetchCap(process.env.TOOL_OUTPUT_CAP));
        const verdict = evaluateCondition(watch.condition, watch.comparator, observation, watch.lastHash);
        await db.update(watches).set({
          lastHash: verdict.hash,
          lastObservation: observation.slice(0, 300),
          lastCheckedAt: new Date(),
          // nextCheckAt was already advanced by the tick's claim; a successful check does not move it.
          failStreak: 0,
          lastError: null,
        }).where(eq(watches.id, watch.id));
        if (verdict.met) {
          const dedupeKey = watchDedupeKey(watch.id, watch.condition, verdict.hash);
          const [existing] = await db.select({ status: attentionItems.status }).from(attentionItems).where(and(eq(attentionItems.workspaceId, job.workspaceId), eq(attentionItems.kind, "watch_change"), eq(attentionItems.dedupeKey, dedupeKey))).limit(1);
          const decision = attentionDecision(existing ? { status: existing.status as "open" } : undefined);
          if (decision === "insert") {
            await db.insert(attentionItems).values({
              workspaceId: job.workspaceId, kind: "watch_change", severity: "attention",
              title: `${watch.title}: ${watch.condition === "changed" ? "the page changed" : `condition met (${watch.condition})`}`,
              body: observation.slice(0, 300),
              evidence: { watchId: watch.id, url: `${url.origin}${url.pathname}`, excerpt: observation.slice(0, 200), jobId: job.id },
              dedupeKey,
            });
            await db.insert(events).values({ workspaceId: job.workspaceId, agentId: null, type: "watch.fired", detail: `${watch.title} (${watch.condition})` });
          } else {
            await db.update(attentionItems).set({ lastSeenAt: new Date() }).where(and(eq(attentionItems.workspaceId, job.workspaceId), eq(attentionItems.kind, "watch_change"), eq(attentionItems.dedupeKey, dedupeKey)));
          }
        }
        await finalize(job, { status: "COMPLETED" });
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        // Spec 22d: the failure ladder lives on the watch, not the job — the schedule re-enqueues;
        // the job records, messages once, and pauses the watch on the third consecutive failure.
        const failure = watchFailure(watch.failStreak);
        await db.update(watches).set({
          lastCheckedAt: new Date(),
          lastError: why.slice(0, 300),
          failStreak: failure.streak,
          nextCheckAt: failure.pause ? null : new Date(Date.now() + backoffMs(failure.streak)),
          enabled: !failure.pause,
        }).where(eq(watches.id, watch.id));
        if (failure.message === "first") {
          await db.insert(attentionItems).values({
            workspaceId: job.workspaceId, kind: "system", severity: "attention",
            title: `${watch.title} is failing`,
            body: `The watch failed for the first time since it last worked: ${why.slice(0, 200)} It retries with backoff; three in a row pause it.`,
            evidence: { watchId: watch.id, url: watch.url, error: why.slice(0, 200), jobId: job.id },
            dedupeKey: `${watch.id}:failure:${new Date().toISOString().slice(0, 10)}`,
          });
        }
        if (failure.message === "final") {
          await db.insert(attentionItems).values({
            workspaceId: job.workspaceId, kind: "system", severity: "urgent",
            title: `${watch.title} is paused after ${failure.streak} failures`,
            body: `Last failure: ${why.slice(0, 200)} Fix what it needs and switch it back on.`,
            evidence: { watchId: watch.id, url: watch.url, error: why.slice(0, 200) },
            dedupeKey: `${watch.id}:paused`,
          });
          await db.insert(events).values({ workspaceId: job.workspaceId, agentId: null, type: "watch.paused", detail: `${watch.title}: paused after ${failure.streak} failures` });
        }
        await finalize(job, { status: "COMPLETED" });
      }
    } else {
      await finalize(job, null, new Error(`Unknown job kind: ${job.kind}`));
    }
  } catch (error) {
    await finalize(job, null, error);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Spec 19b — the retention sweep, opt-in per deployment (0 = off, the default). Events and usage
 * rows older than their policy are deleted; the sweep logs what it removed. It never touches
 * messages, runs or memories: those keep forever until a per-workspace policy exists (spec 19b's
 * archive-first design), because deletion here is irreversible.
 */
async function retentionSweep() {
  const sweepCutoffs: [string, Date, () => Promise<unknown>][] = [];
  const eventCutoff = retentionCutoff(new Date(), envNum("RETENTION_EVENTS_DAYS", 0));
  if (eventCutoff) sweepCutoffs.push(["events", eventCutoff, () => db.delete(events).where(lt(events.createdAt, eventCutoff))]);
  const usageCutoff = retentionCutoff(new Date(), envNum("RETENTION_USAGE_DAYS", 0));
  if (usageCutoff) sweepCutoffs.push(["usage", usageCutoff, () => db.delete(modelUsage).where(lt(modelUsage.day, usageCutoff.toISOString().slice(0, 10)))]);
  for (const [what, cutoff, run] of sweepCutoffs) {
    try {
      const gone = await run();
      console.log(`retention: swept ${what} older than ${cutoff.toISOString()}`);
    } catch (error) {
      console.error(`retention sweep (${what}) failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
let lastSweepAt = 0;

async function loop() {
  while (running) {
    await heartbeat();
    let job: JobRow | undefined;
    try {
      const result = await db.execute(claimSql);
      const raw = (result as unknown as { rows: RawJob[] }).rows[0];
      if (raw) job = toJob(raw);
    } catch (error) {
      console.error(`claim failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!job) {
      if (Date.now() - lastSweepAt >= Math.max(60_000, envNum("RETENTION_SWEEP_MS", 3_600_000))) {
        lastSweepAt = Date.now();
        await retentionSweep();
      }
      await sleep(pollMs);
      continue;
    }
    console.log(`claimed ${job.kind} ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`);
    await execute(job);
  }
}

let running = true;
process.on("SIGINT", () => { running = false; });
process.on("SIGTERM", () => { running = false; });

console.log(`${workerId} polling every ${pollMs}ms, concurrency ${concurrency}, lease ${leaseMs}ms`);
try {
  await heartbeat();
  await Promise.all(Array.from({ length: concurrency }, () => loop()));
  console.log(`${workerId} shut down cleanly`);
} catch (error) {
  console.error(`worker crashed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await heartbeat().catch(() => {});
}
