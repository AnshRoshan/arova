/**
 * Spec 45 — the regression gate (`npm run evals`). Runs every suite (or `-- --suite <name>`)
 * outside Next through the same runner the board uses, records a `suite_runs` row with
 * `trigger: "ci"`, and exits non-zero when the scored pass rate falls below EVAL_GATE_MIN_PASS
 * (default 0.9). A server with no configured model skips honestly and exits 0 — a gate that
 * cannot run should say so, not silently pass or fail the build.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, evalTasks, evalSuites, suiteRuns } from "@/db/schema";
import { runSuiteTasks } from "@/lib/suite";
import { executeEvalTask } from "@/lib/eval-runner";
import { systemPromptFor } from "@/lib/board-core";
import { resolveForAgent, loadProfiles } from "@/lib/model-gateway";

const args = process.argv.slice(2);
const suiteNameIndex = args.indexOf("--suite");
const wanted = suiteNameIndex >= 0 ? args[suiteNameIndex + 1] : undefined;
const threshold = Number.isFinite(Number(process.env.EVAL_GATE_MIN_PASS)) ? Number(process.env.EVAL_GATE_MIN_PASS) : 0.9;

const suites = await db.select().from(evalSuites).where(wanted ? eq(evalSuites.name, wanted) : undefined);
if (wanted && !suites.length) {
  console.error(`eval-gate: no suite named "${wanted}".`);
  process.exitCode = 2;
} else if (!suites.length) {
  console.log("eval-gate: no suites exist yet — nothing to gate.");
  process.exitCode = 0;
} else {
  let failedSuites = 0;
  for (const suite of suites) {
    const [agent] = await db.select().from(agents).where(eq(agents.id, suite.agentId)).limit(1);
    const tasks = (await db.select().from(evalTasks).where(and(eq(evalTasks.workspaceId, suite.workspaceId), eq(evalTasks.agentId, suite.agentId))))
      .filter(t => suite.taskIds.includes(t.id))
      .sort((a, b) => suite.taskIds.indexOf(a.id) - suite.taskIds.indexOf(b.id));
    const startedAt = new Date();
    let counts = { passed: 0, failed: 0, skipped: 0, errored: 0, modelCalls: 0 };
    let status = "COMPLETE";
    const profile = agent ? resolveForAgent(agent.provider, loadProfiles()) : null;
    if (!agent || !profile || !tasks.length || profile.name === "local" || !profile.configured) {
      status = "SKIPPED";
      counts = { ...counts, skipped: tasks.length };
      console.log(`eval-gate: "${suite.name}" SKIPPED (${tasks.length} task(s), ${profile?.configured ? "local model" : agent ? "no model key" : "agent gone"}) — a gate that cannot run says so.`);
    } else {
      const system = await systemPromptFor(suite.workspaceId, agent, []);
      const outcome = await runSuiteTasks(tasks, suite.callCeiling, task => executeEvalTask({ workspaceId: suite.workspaceId, task, agent, profile, system }).then(a => a.outcome));
      counts = outcome.counts;
      status = outcome.status;
    }
    const scored = counts.passed + counts.failed;
    const passRate = scored ? counts.passed / scored : null;
    await db.insert(suiteRuns).values({ workspaceId: suite.workspaceId, suiteId: suite.id, status, ...counts, trigger: "ci", startedAt, finishedAt: new Date() });
    if (status === "SKIPPED") continue;
    const verdict = passRate !== null && passRate >= threshold ? "PASS" : "FAIL";
    console.log(`eval-gate: "${suite.name}" ${status} · ${counts.passed}/${scored} passed (${Math.round((passRate ?? 0) * 100)}%) · ${counts.modelCalls} call(s) · gate ≥ ${Math.round(threshold * 100)}% → ${verdict}`);
    if (verdict === "FAIL") failedSuites++;
  }
  if (failedSuites > 0) {
    console.error(`eval-gate: ${failedSuites} suite(s) below the gate.`);
    process.exitCode = 1;
  } else {
    console.log("eval-gate: all scored suites at or above the gate.");
  }
}
