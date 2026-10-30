import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runs, runSteps, sandboxes } from "@/db/schema";
import { sandboxProvider } from "@/lib/sandbox";
import { audit } from "@/lib/audit";
import { finishRun } from "@/lib/run-contract";
import { drizzleRunStore } from "@/lib/run-contract-drizzle";
import { beginEffect, effectStatusForError, finishEffect } from "@/lib/effects";
import { drizzleEffectStore } from "@/lib/effects-drizzle";

export type SandboxCommandResult = {
  ok: boolean;
  output?: string;
  error?: string;
  runId: string;
  provider: string;
  cancelled?: boolean;
};

/**
 * The person-started sandbox console. It owns its own run row, writes a step before the command is
 * executed, and finishes only while the row is still RUNNING — a cancel during exec is not
 * overwritten by the command's eventual success. An effects row is written before the provider is
 * touched, so a retry after a timeout finds "uncertain" and does not run the command again.
 */
export async function runSandboxCommand(input: { workspaceId: string; agentId: string; agentName: string; agentVersionId?: string | null; command: string }): Promise<SandboxCommandResult> {
  const { workspaceId, agentId, agentName, agentVersionId = null, command } = input;
  const [sandboxRun] = await db.insert(runs).values({
    workspaceId, agentId, agentVersionId, title: `Sandbox · ${agentName}`, status: "RUNNING",
    summary: command.slice(0, 240), initiator: "person", startedAt: new Date(),
  }).returning();
  const effect = await beginEffect(drizzleEffectStore, {
    workspaceId, runId: sandboxRun.id, agentVersionId, idempotencyKey: `sandbox:${sandboxRun.id}`,
    kind: "sandbox_command", metadata: { command: command.slice(0, 500) },
  });
  if (!effect.run) {
    return { ok: false, cancelled: true, runId: sandboxRun.id, provider: sandboxProvider.name, error: "This command was already attempted and its outcome is recorded; it was not sent again." };
  }
  const step = (title: string, detail: string, status = "COMPLETED") =>
    db.insert(runSteps).values({ workspaceId, runId: sandboxRun.id, title, detail: detail.slice(0, 4000), status });
  const putSandbox = (status: string) =>
    db.insert(sandboxes).values({ workspaceId, agentId, provider: sandboxProvider.name, status })
      .onConflictDoUpdate({ target: sandboxes.agentId, set: { provider: sandboxProvider.name, status } });

  try {
    // The intent is recorded before the provider is touched, so a cancel at any point after this
    // request starts can name what may have run instead of claiming nothing happened.
    await step("Running the command", command.slice(0, 200));
    await audit(workspaceId, agentId, "sandbox.started", `${agentName}: ${command.slice(0, 120)}`);
    const created = await sandboxProvider.create({ workspaceId, agentId });
    await putSandbox(created.status);
    const executed = await sandboxProvider.execute(agentId, { type: "computer", action: "exec", input: { command } });
    await finishEffect(drizzleEffectStore, effect.row.id, "succeeded");
    await step("Command completed", executed.output);
    if (await finishRun(drizzleRunStore, sandboxRun.id, "COMPLETED", executed.output.slice(0, 240)) === "already-finished") {
      return {
        ok: false, cancelled: true, runId: sandboxRun.id, provider: sandboxProvider.name,
        error: "Cancelled by a person while the command was running. Its output was not recorded against a completed run.",
      };
    }
    await audit(workspaceId, agentId, "sandbox.ran", `${agentName}: ${command.slice(0, 120)}`);
    return { ok: true, output: executed.output, runId: sandboxRun.id, provider: sandboxProvider.name };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The sandbox command failed.";
    await finishEffect(drizzleEffectStore, effect.row.id, effectStatusForError(error));
    await step("Refused", message, "FAILED");
    await finishRun(drizzleRunStore, sandboxRun.id, "FAILED", message.slice(0, 240));
    await putSandbox("ERROR");
    await audit(workspaceId, agentId, "sandbox.refused", message.slice(0, 240));
    return { ok: false, error: message, runId: sandboxRun.id, provider: sandboxProvider.name };
  }
}
