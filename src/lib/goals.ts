/**
 * Spec 22 — the watch loop's pure core. A watch observes through the web_fetch policy; what
 * happens after the observation is decided here: did it change, is it worth an item, has failure
 * earned a pause. The database owns atomicity; this file owns the meaning.
 */
import { createHash } from "node:crypto";

export type WatchCondition = "changed" | "contains" | "not_contains";

export function observationHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Evaluate one observation against one watch. `lastHash === null` is the baseline: the first check
 * records the hash and says nothing — a watch that alerted on day one would be noise, not signal.
 */
export function evaluateCondition(condition: string, comparator: string, observation: string, lastHash: string | null): { met: boolean; hash: string } {
  const hash = observationHash(observation);
  let met = false;
  if (condition === "changed") met = lastHash !== null && hash !== lastHash;
  else if (condition === "contains") met = comparator.length > 0 && observation.includes(comparator);
  else if (condition === "not_contains") met = comparator.length > 0 && !observation.includes(comparator);
  return { met, hash };
}

/** One key per (watch, condition, observation): a repeated observation bumps, a new one alerts. */
export function watchDedupeKey(watchId: string, condition: string, observationHashHex: string): string {
  return `${watchId}:${condition}:${observationHashHex}`;
}

export const WATCH_PAUSE_AFTER = 3;

/**
 * The failure ladder: one message on the first failure (the only one a human should need),
 * silence through the streak, pause on the third — mirroring the routine fatigue rule's shape.
 */
export function watchFailure(previousStreak: number): { streak: number; pause: boolean; message: "first" | "none" | "final" } {
  const streak = previousStreak + 1;
  if (streak === 1) return { streak, pause: false, message: "first" };
  if (streak >= WATCH_PAUSE_AFTER) return { streak, pause: true, message: previousStreak < WATCH_PAUSE_AFTER ? "final" : "none" };
  return { streak, pause: false, message: "none" };
}

export type AttentionStatus = "open" | "seen" | "snoozed" | "dismissed" | "resolved";

/**
 * Insert or bump? A key we have never seen inserts; an open or snoozed twin just gets its
 * last_seen refreshed (that is the dedupe); what a human dismissed or resolved may return as a
 * genuinely new event.
 */
export function attentionDecision(existing: { status: AttentionStatus } | undefined): "insert" | "bump" {
  if (!existing) return "insert";
  return existing.status === "open" || existing.status === "snoozed" || existing.status === "seen" ? "bump" : "insert";
}
