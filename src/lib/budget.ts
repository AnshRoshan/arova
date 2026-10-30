import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { modelUsage } from "@/db/schema";

export const num = (value: string | undefined, fallback: number) => (value === undefined || value === "" || Number.isNaN(Number(value)) ? fallback : Number(value));
export const dailyCallLimit = () => num(process.env.DAILY_MODEL_CALLS_LIMIT, 60);
export const utcDay = () => new Date().toISOString().slice(0, 10);

/** Atomic increment: a read-modify-write here would undercount concurrent chats. */
export async function recordUsage(workspaceId: string, provider: string, inputTokens: number, outputTokens: number, exact = false) {
  await db.insert(modelUsage).values({ workspaceId, provider, day: utcDay(), calls: 1, inputTokens, outputTokens, estimated: !exact })
    .onConflictDoUpdate({
      target: [modelUsage.workspaceId, modelUsage.provider, modelUsage.day],
      set: { calls: sql`${modelUsage.calls} + 1`, inputTokens: sql`${modelUsage.inputTokens} + ${inputTokens}`, outputTokens: sql`${modelUsage.outputTokens} + ${outputTokens}`, estimated: sql`${modelUsage.estimated} OR ${!exact}` },
    });
}

/** `exact` is true only when the server itself reported the counts. A day that mixes an estimated
 * call with an exact one stays flagged, because the figure on screen is then only partly real. */
export async function usageToday(workspaceId: string) {
  const rows = await db.select().from(modelUsage).where(and(eq(modelUsage.workspaceId, workspaceId), eq(modelUsage.day, utcDay())));
  return rows.map(r => ({ provider: r.provider, calls: r.calls, inputTokens: r.inputTokens, outputTokens: r.outputTokens, estimated: r.estimated }));
}

export async function overQuota(workspaceId: string, profile: { name: string }) {
  const limit = dailyCallLimit();
  if (!limit) return false;
  const rows = await usageToday(workspaceId);
  return (rows.find(r => r.provider === profile.name)?.calls ?? 0) >= limit;
}
