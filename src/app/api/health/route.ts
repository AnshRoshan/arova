import { db } from "@/db";
import { jobs } from "@/db/schema";
import { sql } from "drizzle-orm";
import { workerState } from "../board/route";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    // Spec 16e: an operator asking "is it alive" gets the worker's liveness too — a stale
    // heartbeat means queued work is waiting, and the answer says so rather than a bare ok.
    const worker = await workerState().catch(() => null);
    return Response.json({ ok: true, worker });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
