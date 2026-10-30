import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { routines, runs } from "@/db/schema";
import type { RunStore } from "@/lib/run-contract";

/** The production store for the run contract: two guarded writes, nothing else. */
export const drizzleRunStore: RunStore = {
  async finishIfRunning(runId, status, summary, completedAt) {
    const [row] = await db.update(runs).set({ status, summary, completedAt })
      .where(and(eq(runs.id, runId), eq(runs.status, "RUNNING")))
      .returning({ id: runs.id });
    return Boolean(row);
  },
  async claimRoutine(workspaceId, routineId) {
    // The scheduler sets lastStatus in its own claim; Run now takes the same marker, so a click and
    // a tick cannot both execute one routine.
    const [row] = await db.update(routines).set({ lastStatus: "RUNNING" })
      .where(and(
        eq(routines.id, routineId),
        eq(routines.workspaceId, workspaceId),
        sql`${routines.lastStatus} is distinct from 'RUNNING'`,
      ))
      .returning({ id: routines.id });
    return Boolean(row);
  },
};
