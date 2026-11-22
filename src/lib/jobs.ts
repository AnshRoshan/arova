/**
 * Spec 16 — the durable work queue's decision rules, kept pure so the worker process and the
 * claim SQL stay thin. Nothing here touches the database: the shapes and thresholds are the
 * contract, and jobs.test.ts is where that contract is pinned.
 */

export type JobKind = "routine" | "manual_run" | "trigger_brief" | "watch_check";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRYING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "TIMED_OUT";

/** Terminal states are immutable: a retry is a new attempt of the job, never a rewrite of history. */
export const TERMINAL_STATUSES = ["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"] as const;

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * Exponential backoff with jitter: half to 1.5× the nominal delay, so a failing provider is not
 * hammered in lockstep by two workers recovering at the same instant. Capped so a dead endpoint
 * waits minutes, not hours.
 */
export function backoffMs(attempt: number, jitter = Math.random(), baseMs = 2000, capMs = 300000): number {
  const nominal = baseMs * 2 ** (Math.max(1, attempt) - 1);
  return Math.min(Math.round(nominal * (0.5 + Math.min(1, Math.max(0, jitter)))), capMs);
}

/**
 * What a failed attempt becomes. `attempts` is the number of attempts spent, including this one;
 * reaching `maxAttempts` is a dead letter, not another spin.
 */
export function afterFailure(attempts: number, maxAttempts: number): { status: "RETRYING" | "FAILED" } {
  return attempts < Math.max(1, maxAttempts) ? { status: "RETRYING" } : { status: "FAILED" };
}

export function leaseUntil(now: Date, leaseMs: number): Date {
  return new Date(now.getTime() + leaseMs);
}

/** A held lease is not stealable at the instant it expires — only strictly after. */
export function leaseClaimable(leaseUntil: Date | null, now: Date): boolean {
  return leaseUntil === null || leaseUntil.getTime() < now.getTime();
}

/** One key per scheduled occurrence: the same routine due at the same instant enqueues once, however
 * many workspace reads race the tick. A manual run keys off its own request instead. */
export function occurrenceKey(kind: JobKind, subjectId: string, when: Date): string {
  return `${kind}:${subjectId}:${when.toISOString()}`;
}

/** The board may say "worker running" only inside this window since the last heartbeat. */
export const WORKER_STALE_MS = 90_000;

export function workerIsStale(lastSeenAt: string | Date | null, now: Date, staleMs = WORKER_STALE_MS): boolean {
  if (!lastSeenAt) return true;
  const seen = typeof lastSeenAt === "string" ? new Date(lastSeenAt) : lastSeenAt;
  return Number.isNaN(seen.getTime()) || now.getTime() - seen.getTime() >= staleMs;
}

/** Spec 19b — retention is opt-in per deployment: 0 or unset means keep forever. */
export function retentionCutoff(now: Date, days: number | undefined): Date | null {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return null;
  return new Date(now.getTime() - d * 86_400_000);
}
