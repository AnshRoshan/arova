/**
 * The effects ledger's decision, separated from SQL for tests. An effect is written before it is
 * attempted; the same idempotency key never re-runs a succeeded or uncertain effect, and a pending
 * one is treated as already in flight. Only an explicit `failed` row may be retried.
 */

export type EffectStatus = "pending" | "succeeded" | "failed" | "uncertain";
export type EffectKind = "sandbox_command" | "outbound_message" | "payment" | "connector_call" | "model_shell";

export type EffectRecord = { id: string; status: EffectStatus };

export type EffectInput = {
  workspaceId: string;
  runId: string | null;
  agentVersionId: string | null;
  idempotencyKey: string;
  kind: EffectKind;
  metadata: Record<string, unknown>;
};

export type EffectStore = {
  insertIfAbsent(input: EffectInput): Promise<{ row: EffectRecord; created: boolean }>;
  updateStatus(id: string, status: EffectStatus): Promise<void>;
};

/** A brand-new row may run. An existing one only when its last attempt is known to have failed. */
export function mayExecute(row: EffectRecord, created: boolean): boolean {
  return created || row.status === "failed";
}

export async function beginEffect(store: EffectStore, input: EffectInput): Promise<{ row: EffectRecord; run: boolean }> {
  const { row, created } = await store.insertIfAbsent(input);
  return { row, run: mayExecute(row, created) };
}

export function finishEffect(store: EffectStore, id: string, status: EffectStatus): Promise<void> {
  return store.updateStatus(id, status);
}

/** A timeout or an abort is not evidence that nothing happened; it is evidence we cannot tell. */
export function effectStatusForError(error: unknown): EffectStatus {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  return /timeout|timed out|abort|etimedout|unknown/.test(message) ? "uncertain" : "failed";
}
