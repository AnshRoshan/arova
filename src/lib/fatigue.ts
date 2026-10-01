/**
 * Routine fatigue, adopted from OpenBot's routines rule and deliberately NOT a retry policy.
 *
 * A retry answers "did this one attempt hiccup" — a busy queue, a transient dispatch failure.
 * Fatigue answers a different question: *is this routine worth firing at all*. A provider key
 * that died last month fails cleanly, once, every night; no retry of any one night fixes that.
 * So: the first failure after a success posts one message, failures 2–9 stay silent but count,
 * and ten consecutive failures switch the routine off with a final message. Recovery is silent.
 *
 * Pure: no database, no clock. The caller owns the row.
 */

export type FatigueMessage = "none" | "first" | "final";
export type Fatigue = { streak: number; off: boolean; message: FatigueMessage };

/** A run that produced nothing for the thread counts — WAITING_FOR_TOOL is exactly the expired-token case. */
const FAILURE_STATES = new Set(["FAILED", "WAITING_FOR_TOOL"]);

export const FATIGUE_LIMIT = 10;

export function nextFatigue(status: string, prevStreak: number, prevEnabled: boolean): Fatigue {
  if (!FAILURE_STATES.has(status)) return { streak: 0, off: false, message: "none" };
  const streak = prevStreak + 1;
  if (prevEnabled && streak >= FATIGUE_LIMIT) return { streak, off: true, message: "final" };
  if (streak === 1) return { streak, off: false, message: "first" };
  return { streak, off: false, message: "none" };
}
