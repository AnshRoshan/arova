/**
 * Spec 30 — the durable work engine's database half. `jobs.ts` owns the pure rules; this module
 * owns the two things callers in the request path need: enqueue (idempotent by occurrence key) and
 * the answer to "is a queue worker actually alive?". The claim SQL lives with the worker, because
 * claiming is the worker's own act.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, workerHeartbeats } from "@/db/schema";
import { occurrenceKey, workerIsStale, type JobKind } from "@/lib/jobs";

/**
 * The newest heartbeat decides. Stale by the same window the UI uses (jobs.ts), so the tick's
 * fallback decision and the board's claim agree about what "live" means.
 */
export async function queueWorkerIsLive(now = new Date()): Promise<boolean> {
  const [beat] = await db.select({ lastSeenAt: workerHeartbeats.lastSeenAt }).from(workerHeartbeats).orderBy(desc(workerHeartbeats.lastSeenAt)).limit(1);
  return !workerIsStale(beat?.lastSeenAt ?? null, now);
}

/**
 * One row per scheduled occurrence: a repeated enqueue with the same key returns the job already
 * on record (`deduplicated: true`) instead of a second one. Callers that key off a request (Run
 * now, a trigger webhook) pass their own idempotency key; the tick passes the occurrence instant.
 */
export async function enqueueJob(input: { workspaceId: string; kind: JobKind; subjectId?: string | null; payload?: Record<string, unknown>; idempotencyKey?: string | null; createdBy?: string | null; runAt?: Date }): Promise<{ id: string; deduplicated: boolean }> {
  const key = (input.idempotencyKey ?? occurrenceKey(input.kind, input.subjectId ?? input.workspaceId, input.runAt ?? new Date())).slice(0, 200);
  const [inserted] = await db.insert(jobs).values({
    workspaceId: input.workspaceId,
    kind: input.kind,
    subjectId: input.subjectId ?? null,
    payload: input.payload ?? {},
    idempotencyKey: key,
    createdBy: input.createdBy ?? null,
    ...(input.runAt ? { runAt: input.runAt } : {}),
  }).onConflictDoNothing({ target: [jobs.workspaceId, jobs.idempotencyKey] }).returning({ id: jobs.id });
  if (inserted) return { id: inserted.id, deduplicated: false };
  const [existing] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.workspaceId, input.workspaceId), eq(jobs.idempotencyKey, key))).limit(1);
  return { id: existing?.id ?? "", deduplicated: true };
}
