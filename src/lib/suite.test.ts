import { test } from "node:test";
import assert from "node:assert/strict";
import { runSuiteTasks, suitePassRate } from "./suite.ts";

test("a suite stops at the call ceiling without starting the next task", async () => {
  const started: string[] = [];
  const result = await runSuiteTasks(["a", "b", "c"], 1, async task => {
    started.push(task);
    return { status: "PASS", called: true };
  });
  assert.deepEqual(started, ["a"], "the second task is never started");
  assert.equal(result.status, "STOPPED_AT_CEILING");
  assert.deepEqual(result.counts, { passed: 1, failed: 0, skipped: 0, errored: 0, modelCalls: 1 });
});

test("a suite under its ceiling aggregates every outcome", async () => {
  const outcomes = [
    { status: "PASS" as const, called: true },
    { status: "FAIL" as const, called: true },
    { status: "SKIPPED" as const, called: false },
    { status: "ERROR" as const, called: true },
  ];
  let i = 0;
  const result = await runSuiteTasks([1, 2, 3, 4], 10, async () => outcomes[i++]);
  assert.equal(result.status, "COMPLETE");
  assert.deepEqual(result.counts, { passed: 1, failed: 1, skipped: 1, errored: 1, modelCalls: 3 });
});

test("a halt ends the suite and the remaining tasks are not counted", async () => {
  let calls = 0;
  const result = await runSuiteTasks([1, 2, 3], 10, async () => { calls++; return { status: "SKIPPED", called: false, halt: true }; });
  assert.equal(calls, 1);
  assert.equal(result.status, "STOPPED_AT_CEILING");
  assert.equal(result.counts.skipped, 1);
});

test("the pass rate ignores skipped and errored attempts", () => {
  assert.equal(suitePassRate({ passed: 0, failed: 0 }), null);
  assert.equal(suitePassRate({ passed: 3, failed: 1 }), 0.75);
});

test("a zero ceiling starts nothing", async () => {
  let calls = 0;
  const result = await runSuiteTasks([1, 2], 0, async () => { calls++; return { status: "PASS", called: true }; });
  assert.equal(calls, 0);
  assert.equal(result.status, "STOPPED_AT_CEILING");
  assert.equal(result.counts.modelCalls, 0);
});
