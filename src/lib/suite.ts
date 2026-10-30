/**
 * A suite is tasks in order plus a call ceiling. This is the pure loop: it stops before starting a
 * task once the ceiling is reached, so the ceiling is a real cost bound, not a post-hoc label.
 */

export type SuiteStatus = "COMPLETE" | "STOPPED_AT_CEILING" | "SKIPPED";
export type TaskOutcome = { status: "PASS" | "FAIL" | "SKIPPED" | "ERROR"; called: boolean; halt?: boolean };
export type SuiteCounts = { passed: number; failed: number; skipped: number; errored: number; modelCalls: number };

export const emptyCounts = (): SuiteCounts => ({ passed: 0, failed: 0, skipped: 0, errored: 0, modelCalls: 0 });

export function addOutcome(counts: SuiteCounts, outcome: TaskOutcome): void {
  if (outcome.status === "PASS") counts.passed++;
  else if (outcome.status === "FAIL") counts.failed++;
  else if (outcome.status === "SKIPPED") counts.skipped++;
  else counts.errored++;
  if (outcome.called) counts.modelCalls++;
}

/** The rate is over scored attempts only; skipped and errored stay out, matching spec 17. */
export function suitePassRate(counts: Pick<SuiteCounts, "passed" | "failed">): number | null {
  const scored = counts.passed + counts.failed;
  return scored ? counts.passed / scored : null;
}

export async function runSuiteTasks<T>(tasks: readonly T[], callCeiling: number, runOne: (task: T) => Promise<TaskOutcome>): Promise<{ counts: SuiteCounts; status: SuiteStatus; ran: number }> {
  const counts = emptyCounts();
  const ceiling = Math.max(0, Math.floor(callCeiling));
  let ran = 0;
  for (const task of tasks) {
    if (counts.modelCalls >= ceiling) return { counts, status: "STOPPED_AT_CEILING", ran };
    const outcome = await runOne(task);
    ran++;
    addOutcome(counts, outcome);
    // A budget stop is a ceiling by another name; nothing after it is started.
    if (outcome.halt) return { counts, status: "STOPPED_AT_CEILING", ran };
  }
  return { counts, status: "COMPLETE", ran };
}
