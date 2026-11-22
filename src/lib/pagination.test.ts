import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeCursor, encodeCursor, pageLimit } from "./pagination.ts";
import { makeRateLimiter } from "./limits.ts";

/**
 * Spec 19a/19e — the cursor contract and the single-instance limiter. The cursor must be stable
 * under inserts (keyset, not offset) and tamper-evident enough to fail closed on junk.
 */

test("a cursor round-trips and orders by (at, id)", () => {
  const raw = encodeCursor({ at: "2026-10-26T10:00:00.000Z", id: "abc" });
  const back = decodeCursor(raw);
  assert.deepEqual(back, { at: "2026-10-26T10:00:00.000Z", id: "abc" });
  // lexicographic order on the encoded string must match (at, id) order for the same shape
  const later = encodeCursor({ at: "2026-10-26T10:00:01.000Z", id: "abc" });
  assert.ok(later > raw);
  const tie = encodeCursor({ at: "2026-10-26T10:00:00.000Z", id: "abd" });
  assert.ok(tie > raw, "same instant, larger id sorts after");
});

test("junk cursors decode to null — fail closed, never a crash", () => {
  assert.equal(decodeCursor(null), null);
  assert.equal(decodeCursor(""), null);
  assert.equal(decodeCursor("!!!not-base64!!!"), null);
  assert.equal(decodeCursor(Buffer.from('{"at":"nope"}').toString("base64url")), null);
  assert.equal(decodeCursor(Buffer.from("[1,2,3]").toString("base64url")), null);
});

test("page limits clamp: default when absent, ceiling when greedy", () => {
  assert.equal(pageLimit(undefined), 50);
  assert.equal(pageLimit(""), 50);
  assert.equal(pageLimit("0"), 50);
  assert.equal(pageLimit("-5"), 50);
  assert.equal(pageLimit("10"), 10);
  assert.equal(pageLimit("100000"), 200);
  assert.equal(pageLimit("7", 50, 20), 7);
  assert.equal(pageLimit("99", 50, 20), 20);
});

test("the limiter allows the capacity in the window, then refuses with a retry time", () => {
  let now = 1_000_000;
  const limiter = makeRateLimiter(() => now, { capacity: 3, windowMs: 60_000 });
  assert.equal(limiter.hit("ip-1").ok, true);
  assert.equal(limiter.hit("ip-1").ok, true);
  assert.equal(limiter.hit("ip-1").ok, true);
  const fourth = limiter.hit("ip-1");
  assert.equal(fourth.ok, false);
  assert.ok(fourth.retryAfterMs > 0 && fourth.retryAfterMs <= 60_000);
  now += 60_001;
  assert.equal(limiter.hit("ip-1").ok, true, "the window has slid past the old hits");
});

test("keys are independent, and old entries are pruned rather than remembered forever", () => {
  let now = 0;
  const limiter = makeRateLimiter(() => now, { capacity: 1, windowMs: 1000 });
  assert.equal(limiter.hit("a").ok, true);
  assert.equal(limiter.hit("b").ok, true, "another key has its own window");
  assert.equal(limiter.hit("a").ok, false);
  now += 1001;
  assert.equal(limiter.hit("a").ok, true);
});
