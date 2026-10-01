import { test } from "node:test";
import assert from "node:assert/strict";
import { nextFatigue } from "./fatigue.ts";

/**
 * The fatigue rule, read from OpenBot's routines doc and adopted deliberately: a failing routine
 * posts exactly ONE message — the first failure after a success — and ten consecutive failures
 * switch it off with a final message. Between those, silence. This answers "is this routine worth
 * firing at all", not "retry this attempt"; retries belong to whatever dispatches.
 */

test("success resets the streak and says nothing — recovery is silent", () => {
  assert.deepEqual(nextFatigue("COMPLETED", 4, true), { streak: 0, off: false, message: "none" });
  assert.deepEqual(nextFatigue("COMPLETED", 0, true), { streak: 0, off: false, message: "none" });
});

test("the first failure after a success is the only one that posts", () => {
  const first = nextFatigue("FAILED", 0, true);
  assert.deepEqual(first, { streak: 1, off: false, message: "first" });
  assert.equal(first.off, false, "one failure never switches anything off");
});

test("failures two through nine are silent — they still count", () => {
  for (const prev of [1, 2, 5, 8]) {
    const r = nextFatigue("FAILED", prev, true);
    assert.equal(r.streak, prev + 1, `streak ${prev} increments`);
    assert.equal(r.message, "none", `failure #${prev + 1} posts nothing`);
    assert.equal(r.off, false);
  }
});

test("ten consecutive failures switch the routine off, once, with the final message", () => {
  assert.deepEqual(nextFatigue("FAILED", 9, true), { streak: 10, off: true, message: "final" });
  // A routine already switched off never re-announces itself.
  assert.deepEqual(nextFatigue("FAILED", 10, false), { streak: 11, off: false, message: "none" });
});

test("a budget wait counts as a failure to produce — the expired-token case fires cleanly every night", () => {
  assert.equal(nextFatigue("WAITING_FOR_TOOL", 0, true).message, "first");
  assert.equal(nextFatigue("WAITING_FOR_TOOL", 9, true).off, true);
});
