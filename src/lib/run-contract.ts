/**
 * One run contract for every path that can finish a run: the scheduler, Run now, a brief, and the
 * sandbox console. A row is ours only while it is RUNNING, so a cancel that already landed wins and
 * nothing notifies a channel about work the person stopped. The SQL predicate is the cross-process
 * lock; the store adapter lives in run-contract-drizzle.ts so this decision is testable alone.
 */

export type FinishResult = "updated" | "already-finished";

/** What the contract needs. Tests use a one-method fake; the app uses the Drizzle store. */
export type RunStore = {
  finishIfRunning(runId: string, status: string, summary: string, completedAt: Date): Promise<boolean>;
  claimRoutine(workspaceId: string, routineId: string): Promise<boolean>;
};

/** Returns "already-finished" without touching a row that a cancel (or a competing finish) owns. */
export async function finishRun(store: RunStore, runId: string, status: string, summary: string, completedAt = new Date()): Promise<FinishResult> {
  return (await store.finishIfRunning(runId, status, summary, completedAt)) ? "updated" : "already-finished";
}
