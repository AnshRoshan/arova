/**
 * Runs once when the Next.js server boots. This is where "the bot runs 24/7" starts: a loop inside the
 * server process that claims due routines every SCHEDULER_INTERVAL_SECONDS (default 30), whether or not
 * anyone has the app open. It lives exactly as long as the server process does — host the server
 * somewhere that stays up (see docs/ALWAYS-ON.md), or add an outside clock that calls /api/cron.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as typeof globalThis & { __arovaWorkerStarted?: boolean };
  if (g.__arovaWorkerStarted) return; // dev hot reloads call register() again; one loop is enough
  const { workerEnabled, schedulerIntervalSeconds } = await import("./lib/worker-config");
  if (!workerEnabled()) { console.log("[arova] scheduler worker is off (SCHEDULER_WORKER=off)"); return; }
  if (!process.env.DATABASE_URL) { console.warn("[arova] scheduler worker not started: DATABASE_URL is not set"); return; }
  g.__arovaWorkerStarted = true;
  const { createLoop } = await import("./lib/worker");
  const { tickAllWorkspaces, markWorkerStarted } = await import("./lib/routine-runner");
  await markWorkerStarted().catch(error => console.warn("[arova] could not record worker start:", error instanceof Error ? error.message : "unknown error"));
  createLoop(() => tickAllWorkspaces("worker"), () => schedulerIntervalSeconds() * 1000);
  console.log(`[arova] scheduler worker started — checking for due routines every ${schedulerIntervalSeconds()}s`);
}
