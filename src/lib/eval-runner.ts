import { db } from "@/db";
import { agents, evalResults, evalTasks, runs } from "@/db/schema";
import { audit } from "@/lib/audit";
import { num, overQuota, recordUsage } from "@/lib/budget";
import { finishRun } from "@/lib/run-contract";
import { drizzleRunStore } from "@/lib/run-contract-drizzle";
import { ensureAgentVersion } from "@/lib/versions-drizzle";
import { completionText, estimateTokens, requestCompletion, usageFromJson, type ProviderProfile } from "@/lib/model-gateway";
import { scoreEval } from "@/lib/evals";
import { normaliseCapabilities, tokenBudgetFor } from "@/lib/tools";
import type { TaskOutcome } from "@/lib/suite";

type TaskRow = typeof evalTasks.$inferSelect;
type AgentRow = typeof agents.$inferSelect;

export type EvalAttempt = {
  id: string;
  status: string;
  score: number;
  detail: string;
  durationMs: number;
  outcome: TaskOutcome;
};

const requestTimeoutMs = () => num(process.env.MODEL_TIMEOUT_MS, 45000);

/**
 * One measured attempt, shared by the single Eval button and a suite. The run is pinned to the
 * seat's current instructions; a cancelled run records no verdict (an empty id means "not scored").
 */
export async function executeEvalTask(input: { workspaceId: string; task: TaskRow; agent: AgentRow; profile: ProviderProfile; system: string }): Promise<EvalAttempt> {
  const { workspaceId, task, agent, profile, system } = input;
  const startedAt = new Date();
  const [evalRun] = await db.insert(runs).values({
    workspaceId, agentId: agent.id, agentVersionId: await ensureAgentVersion(agent),
    title: `Eval · ${task.name}`, status: "RUNNING", summary: task.prompt.slice(0, 240), initiator: "person", startedAt,
  }).returning();
  const finishEval = (status: string, summary: string) => finishRun(drizzleRunStore, evalRun.id, status, summary.slice(0, 240));
  const cancelled = (): EvalAttempt => ({ id: "", status: "SKIPPED", score: 0, detail: "The run was cancelled before a verdict was recorded.", durationMs: 0, outcome: { status: "SKIPPED", called: true, halt: true } });
  const record = async (status: string, score: number, detail: string) => {
    const durationMs = Date.now() - startedAt.getTime();
    const [row] = await db.insert(evalResults).values({ workspaceId, taskId: task.id, agentId: agent.id, runId: evalRun.id, status, score, detail: detail.slice(0, 600), durationMs }).returning();
    return { id: row.id, status: row.status, score: row.score, detail: row.detail, durationMs: row.durationMs };
  };

  if (profile.name === "local" || !profile.configured) {
    const detail = `${profile.label} is not configured on this server, so nothing was called.`;
    if (await finishEval("FAILED", detail) === "already-finished") return cancelled();
    const row = await record("SKIPPED", 0, detail);
    await audit(workspaceId, agent.id, "eval.skipped", `${task.name}: SKIPPED`);
    return { ...row, outcome: { status: "SKIPPED", called: false, halt: true } };
  }
  if (await overQuota(workspaceId, profile)) {
    const detail = "The daily model budget is spent; nothing was called.";
    if (await finishEval("FAILED", detail) === "already-finished") return cancelled();
    const row = await record("SKIPPED", 0, detail);
    await audit(workspaceId, agent.id, "eval.skipped", `${task.name}: SKIPPED`);
    return { ...row, outcome: { status: "SKIPPED", called: false, halt: true } };
  }

  try {
    const caps = normaliseCapabilities(agent.capabilities);
    const response = await requestCompletion({
      profile,
      messages: [{ role: "system", content: system }, { role: "user", content: task.prompt }],
      maxTokens: tokenBudgetFor(caps), stream: false, timeoutMs: requestTimeoutMs(),
    });
    const body = await response.json();
    const answer = completionText(body);
    const counted = usageFromJson(body);
    await recordUsage(workspaceId, profile.name, counted?.input ?? estimateTokens(task.prompt), counted?.output ?? estimateTokens(answer), Boolean(counted));
    const verdict = scoreEval(answer, task.expected);
    if (await finishEval(verdict.passed ? "COMPLETED" : "FAILED", verdict.detail) === "already-finished") return cancelled();
    const row = await record(verdict.passed ? "PASS" : "FAIL", verdict.passed ? 1 : 0, `${verdict.detail} Answer: ${answer.slice(0, 600)}`);
    await audit(workspaceId, agent.id, "eval.ran", `${task.name}: ${row.status}`);
    return { ...row, outcome: { status: verdict.passed ? "PASS" : "FAIL", called: true } };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The eval run failed.";
    if (await finishEval("FAILED", detail) === "already-finished") return cancelled();
    const row = await record("ERROR", 0, detail);
    await audit(workspaceId, agent.id, "eval.errored", `${task.name}: ${detail.slice(0, 120)}`);
    return { ...row, outcome: { status: "ERROR", called: true } };
  }
}
