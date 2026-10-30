import { test } from "node:test";
import assert from "node:assert/strict";
import { beginEffect, effectStatusForError, finishEffect, mayExecute, type EffectRecord, type EffectStatus, type EffectStore } from "./effects.ts";

function fake(initial: { record: EffectRecord; created: boolean }): { store: EffectStore; writes: EffectStatus[] } {
  const writes: EffectStatus[] = [];
  return {
    writes,
    store: {
      async insertIfAbsent() { return { row: initial.record, created: initial.created }; },
      async updateStatus(_id, status) { writes.push(status); },
    },
  };
}

const input = { workspaceId: "ws", runId: "run", agentVersionId: "v1", idempotencyKey: "k", kind: "sandbox_command" as const, metadata: {} };

test("a repeated key never re-runs a succeeded or uncertain effect", async () => {
  for (const status of ["succeeded", "uncertain", "pending"] as const) {
    const { store } = fake({ record: { id: "e1", status }, created: false });
    assert.equal((await beginEffect(store, input)).run, false, status);
  }
});

test("an explicit failure may be retried", async () => {
  assert.equal(mayExecute({ id: "e1", status: "failed" }, false), true);
});

test("a new row runs and can be finished", async () => {
  const { store, writes } = fake({ record: { id: "e1", status: "pending" }, created: true });
  const begun = await beginEffect(store, input);
  assert.equal(begun.run, true);
  await finishEffect(store, begun.row.id, "succeeded");
  assert.deepEqual(writes, ["succeeded"]);
});

test("a timeout is uncertain; a clean refusal is failed", () => {
  assert.equal(effectStatusForError(new Error("Provider timed out")), "uncertain");
  assert.equal(effectStatusForError(Object.assign(new Error("aborted"), { name: "AbortError" })), "uncertain");
  assert.equal(effectStatusForError(new Error("command not found")), "failed");
});
