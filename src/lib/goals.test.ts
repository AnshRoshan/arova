import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { evaluateCondition, watchDedupeKey, watchFailure, attentionDecision } from "./goals.ts";

/**
 * Spec 22 — the watch loop's pure core. "Changed" requires a different hash AND a baseline;
 * an alert without evidence is a bug; a failing watch backs off and pauses with one message;
 * a repeated observation bumps the existing item instead of spawning spam.
 */

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

test("the first observation is a baseline, not a change — no alert on day one", () => {
  const first = evaluateCondition("changed", "", "page content v1", null);
  assert.equal(first.met, false, "a baseline produces nothing");
  assert.equal(first.hash, hash("page content v1"));
});

test("a changed page fires exactly once per new hash", () => {
  const baseline = hash("page content v1");
  const second = evaluateCondition("changed", "", "page content v2", baseline);
  assert.equal(second.met, true);
  assert.equal(second.hash, hash("page content v2"));
  const same = evaluateCondition("changed", "", "page content v2", second.hash);
  assert.equal(same.met, false, "an unchanged page produces nothing");
});

test("contains fires only when the comparator appears; not_contains inverts", () => {
  assert.equal(evaluateCondition("contains", "Outage", "status: Outage declared", null).met, true);
  assert.equal(evaluateCondition("contains", "Outage", "status: all clear", null).met, false);
  assert.equal(evaluateCondition("not_contains", "all clear", "status: Outage declared", null).met, true);
  assert.equal(evaluateCondition("not_contains", "all clear", "status: all clear", null).met, false);
  assert.equal(evaluateCondition("contains", "", "anything", null).met, false, "an empty comparator never fires");
});

test("the dedupe key pins the watch to its observation, so re-checks bump instead of spamming", () => {
  const key = watchDedupeKey("w1", "changed", hash("v2"));
  assert.equal(key, watchDedupeKey("w1", "changed", hash("v2")));
  assert.notEqual(key, watchDedupeKey("w1", "changed", hash("v3")), "a new observation is a new key");
  assert.notEqual(key, watchDedupeKey("w2", "changed", hash("v2")));
  assert.notEqual(key, watchDedupeKey("w1", "contains", hash("v2")));
});

test("a failing watch: one message on the first failure, silence after, pause on the third", () => {
  assert.deepEqual(watchFailure(0), { streak: 1, pause: false, message: "first" });
  assert.deepEqual(watchFailure(1), { streak: 2, pause: false, message: "none" });
  assert.deepEqual(watchFailure(2), { streak: 3, pause: true, message: "final" }, "the spec's threshold: three consecutive, then pause");
  assert.deepEqual(watchFailure(5), { streak: 6, pause: true, message: "none" }, "an already-paused watch says nothing more");
});

test("attention dedupe: a fresh key inserts; an open twin bumps; a dismissed twin can re-alert", () => {
  assert.equal(attentionDecision(undefined), "insert");
  assert.equal(attentionDecision({ status: "open" }), "bump");
  assert.equal(attentionDecision({ status: "snoozed" }), "bump");
  assert.equal(attentionDecision({ status: "dismissed" }), "insert", "what a human dismissed may return as a new event");
  assert.equal(attentionDecision({ status: "resolved" }), "insert");
});
