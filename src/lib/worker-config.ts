/**
 * Always-on scheduler: configuration and the one judgement the UI needs — "is anything actually
 * watching the clock right now?". Pure and clock-injected so it can be tested with fixed dates.
 */

const num = (value: string | undefined, fallback: number) => (value === undefined || value === "" || Number.isNaN(Number(value)) ? fallback : Number(value));

/** The in-process loop is on unless an operator turns it off (SCHEDULER_WORKER=off). */
export const workerEnabled = (env: Record<string, string | undefined> = process.env) => (env.SCHEDULER_WORKER ?? "on").trim().toLowerCase() !== "off";

/** Seconds between worker passes: clamped to 5–600 so a typo cannot hammer the database or sleep for a day. */
export const schedulerIntervalSeconds = (env: Record<string, string | undefined> = process.env) => Math.min(600, Math.max(5, Math.round(num(env.SCHEDULER_INTERVAL_SECONDS, 30))));

export type Beat = { startedAt: string | Date; lastTickAt: string | Date; ticks: number; lastClaimed: number; totalClaimed: number; lastError: string | null };
export type DriverState = "live" | "stale" | "never" | "off";

const ms = (v: string | Date) => new Date(v).getTime();

/**
 * live  — ticked within three intervals (one missed beat is tolerated, two is not)
 * stale — has ticked before, but not recently: the process or the outside clock stopped
 * never — enabled/configured but no beat recorded yet
 * off   — deliberately not in use
 */
export function driverState(beat: Beat | null | undefined, intervalSeconds: number, now: Date, enabled = true): DriverState {
  if (!enabled) return "off";
  if (!beat || beat.ticks === 0) return "never";
  return now.getTime() - ms(beat.lastTickAt) <= intervalSeconds * 3 * 1000 ? "live" : "stale";
}

/** Cron callers are slower than the loop, so "live" means one tick inside the last 20 minutes. */
export const CRON_LIVE_MS = 20 * 60_000;
export function cronState(beat: Beat | null | undefined, configured: boolean, now: Date): DriverState {
  if (!configured) return "off";
  if (!beat || beat.ticks === 0) return "never";
  return now.getTime() - ms(beat.lastTickAt) <= CRON_LIVE_MS ? "live" : "stale";
}

export type Always = "always-on" | "on-open" | "degraded";
/** Headline for the control room: the strongest true statement about 24/7 operation. */
export function alwaysOn(worker: DriverState, cron: DriverState): Always {
  if (worker === "live" || cron === "live") return "always-on";
  if (worker === "stale" || cron === "stale") return "degraded";
  return "on-open";
}
