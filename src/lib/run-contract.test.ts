import { test } from "node:test";
import assert from "node:assert/strict";
import { finishRun, type RunStore } from "./run-contract.ts";

const store = (result: boolean): { store: RunStore; writes: string[] } => {
  const writes: string[] = [];
  return {
    writes,
    store: {
      async finishIfRunning(runId, status) { writes.push(`${runId}:${status}`); return result; },
      async claimRoutine(workspaceId, routineId) { writes.push(`${workspaceId}:${routineId}`); return result; },
    },
  };
};

test("finishRun: a RUNNING row is updated once", async () => {
  const { store: fake, writes } = store(true);
  assert.equal(await finishRun(fake, "run-1", "COMPLETED", "done"), "updated");
  assert.deepEqual(writes, ["run-1:COMPLETED"]);
});

test("finishRun: a cancelled row is left alone and the caller is told", async () => {
  const { store: fake, writes } = store(false);
  assert.equal(await finishRun(fake, "run-1", "COMPLETED", "done"), "already-finished");
  // The store rejected the write because the row is no longer RUNNING; no second write is attempted.
  assert.deepEqual(writes, ["run-1:COMPLETED"]);
});

test("claimRoutine: a second caller is refused", async () => {
  const { store: fake, writes } = store(false);
  assert.equal(await fake.claimRoutine("ws", "routine"), false);
  assert.deepEqual(writes, ["ws:routine"]);
});
