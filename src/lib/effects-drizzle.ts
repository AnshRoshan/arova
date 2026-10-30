import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { externalEffects } from "@/db/schema";
import type { EffectInput, EffectStatus, EffectStore } from "@/lib/effects";

/** The production ledger store. The unique (workspace, key) index is what makes a retry safe. */
export const drizzleEffectStore: EffectStore = {
  async insertIfAbsent(input: EffectInput) {
    const [created] = await db.insert(externalEffects).values({
      workspaceId: input.workspaceId,
      runId: input.runId,
      agentVersionId: input.agentVersionId,
      idempotencyKey: input.idempotencyKey,
      kind: input.kind,
      status: "pending",
      metadata: input.metadata,
    }).onConflictDoNothing({ target: [externalEffects.workspaceId, externalEffects.idempotencyKey] })
      .returning({ id: externalEffects.id, status: externalEffects.status });
    if (created) return { row: { id: created.id, status: created.status as EffectStatus }, created: true };
    const [existing] = await db.select({ id: externalEffects.id, status: externalEffects.status }).from(externalEffects)
      .where(and(eq(externalEffects.workspaceId, input.workspaceId), eq(externalEffects.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (!existing) throw new Error("The effects ledger is unavailable.");
    return { row: { id: existing.id, status: existing.status as EffectStatus }, created: false };
  },
  async updateStatus(id, status) {
    await db.update(externalEffects).set({ status }).where(eq(externalEffects.id, id));
  },
};
