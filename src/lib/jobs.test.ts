import { test } from "node:test";
import assert from "node:assert/strict";
import { afterFailure, backoffMs, isTerminal, leaseClaimable, leaseUntil, occurrenceKey, retentionCutoff, workerIsStale } from "./jobs.ts";

/**
 * Spec 16 — the queue's decision rules. The worker process and the SQL claim live outside this file;
 * these functions are the parts whose meaning has to be pinned: when a job may be claimed, what a
 * failure becomes, how long a retry waits, and when a worker counts as gone.
 */

test("terminal states are exactly the four that end a job", () => {
  for (const s of ["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"]) assert.equal(isTerminal(s), true, s);
  for (const s of ["QUEUED", "RUNNING", "RETRYING"]) assert.equal(isTerminal(s), false, s);
});

test("backoff grows exponentially and stays inside the jitter window", () => {
  const base = 2000;
  // jitter 0 → the low edge (0.5×); jitter 1 → the high edge (1.5×)
  assert.equal(backoffMs(1, 0), base * 0.5);
  assert.equal(backoffMs(1, 1), base * 1.5);
  assert.equal(backoffMs(2, 0), base * 1);
  assert.equal(backoffMs(3, 0), base * 2);
  // every attempt with any jitter lands between half and 1.5× the nominal delay
  for (let attempt = 1; attempt <= 8; attempt++) {
    const nominal = base * 2 ** (attempt - 1);
    assert.ok(backoffMs(attempt, 0) >= nominal * 0.5 - 1e-9, `low bound attempt ${attempt}`);
    assert.ok(backoffMs(attempt, 1) <= Math.min(nominal * 1.5, 300000) + 1e-9, `high bound attempt ${attempt}`);
  }
});

test("backoff never exceeds the cap, however deep the attempt", () => {
  assert.equal(backoffMs(12, 1), 300000);
  assert.ok(backoffMs(12, 0) <= 300000);
});

test("a failure retries until maxAttempts, then dead-letters as FAILED", () => {
  assert.deepEqual(afterFailure(1, 3), { status: "RETRYING" });
  assert.deepEqual(afterFailure(2, 3), { status: "RETRYING" });
  assert.deepEqual(afterFailure(3, 3), { status: "FAILED" });
  assert.deepEqual(afterFailure(4, 3), { status: "FAILED" });
});

test("a lease is claimable when it has never been set or has expired — never while held", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  assert.equal(leaseClaimable(null, now), true);
  assert.equal(leaseClaimable(new Date("2026-10-25T11:59:59Z"), now), true);
  assert.equal(leaseClaimable(new Date("2026-10-25T12:00:00Z"), now), false, "a lease held at this instant is not stealable");
  assert.equal(leaseClaimable(new Date("2026-10-25T12:00:01Z"), now), false);
});

test("leaseUntil sets the deadline from a wall clock, not from duration math on a read", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  assert.equal(leaseUntil(now, 300000).toISOString(), "2026-10-25T12:05:00.000Z");
});

test("an occurrence key is stable for one scheduled moment and distinct across moments and subjects", () => {
  const when = new Date("2026-10-25T08:00:00Z");
  const key = occurrenceKey("routine", "r1", when);
  assert.equal(key, occurrenceKey("routine", "r1", new Date("2026-10-25T08:00:00Z")));
  assert.notEqual(key, occurrenceKey("routine", "r1", new Date("2026-10-25T09:00:00Z")));
  assert.notEqual(key, occurrenceKey("routine", "r2", when));
  assert.notEqual(key, occurrenceKey("manual_run", "r1", when));
});

test("a worker with no heartbeat is stale; freshness is measured from the caller's clock", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  assert.equal(workerIsStale(null, now), true, "no row means no worker");
  assert.equal(workerIsStale("2026-10-25T11:59:30Z", now), false, "30s old is inside the window");
  assert.equal(workerIsStale("2026-10-25T11:58:30Z", now), true, "90s+ is gone");
});

test("retention is off by default and produces a cutoff only for positive day counts", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  assert.equal(retentionCutoff(now, undefined), null, "unset means keep forever");
  assert.equal(retentionCutoff(now, 0), null);
  assert.equal(retentionCutoff(now, -3), null);
  assert.equal(retentionCutoff(now, 90)?.toISOString(), "2026-07-28T12:00:00.000Z");
});
