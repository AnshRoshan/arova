/**
 * A self-rescheduling loop. It waits for one pass to finish before arming the next, so a slow model
 * call can never stack passes on top of each other, and a pass that throws is logged and survived —
 * the whole point of a 24/7 worker is that one bad tick does not end it.
 */
export type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };

const real: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) };

export function createLoop(tick: () => Promise<unknown>, intervalMs: () => number, firstDelayMs = 2000, timers: Timers = real, log: (message: string) => void = m => console.error(m)) {
  let stopped = false;
  let handle: unknown = null;
  let running = false;
  const run = async () => {
    if (stopped || running) return;
    running = true;
    try { await tick(); }
    catch (error) { log(`Scheduler worker pass failed: ${error instanceof Error ? error.message : "unknown error"}`); }
    finally {
      running = false;
      if (!stopped) handle = timers.set(run, intervalMs());
    }
  };
  handle = timers.set(run, firstDelayMs);
  return { stop() { stopped = true; timers.clear(handle); }, get running() { return running; } };
}
