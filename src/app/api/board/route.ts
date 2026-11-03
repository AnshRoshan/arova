import { after, NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { audit } from "@/lib/audit";
import { allowWrite, sameOrigin, type Bucket } from "@/lib/write-guard";
import { readActor } from "@/lib/auth-sessions";
import { reapStuckRuns, tickSchedules } from "@/lib/routine-runner";
import { board } from "@/lib/board-payload";
import { cookieName } from "@/lib/board-core";
import { dispatchAction } from "@/lib/board-actions";

export const dynamic = "force-dynamic";
/** An eval run is one synchronous model call; a slow reasoning model can take the whole ceiling. */
export const maxDuration = 300;
const uuid = z.string().uuid();

/**
 * The board route authenticates, parses and dispatches (spec 26). The run contract lives in
 * `run-contract.ts` / `run-contract-drizzle.ts`; the scheduler in `routine-runner.ts`; the sandbox
 * console in `sandbox-run.ts`; the chat reply in `chat-runner.ts`; the org brief in
 * `brief-runner.ts`; the payload the client renders in `board-payload.ts`; and every named action
 * in `board-actions.ts`. Nothing here knows how a run is finished — only who is asking.
 */

/** The per-process write budget, one bucket per workspace (write-guard.ts states its honest
 * scope). Pinned to globalThis so a dev-mode recompile of this module cannot hand every request
 * a fresh full bucket; in production there is one instance anyway. */
const writeBuckets: Map<string, Bucket> = ((globalThis as { __arovaWriteBuckets?: Map<string, Bucket> }).__arovaWriteBuckets ??= new Map());

async function initialize() {
  // A live session outranks the anonymous cookie: the workspace it names is the one it belongs to.
  const actor = await readActor();
  if (actor) {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, actor.workspaceId)).limit(1);
    if (workspace) return { workspace, isNew: false };
  }
  const existing = (await cookies()).get(cookieName)?.value;
  if (existing && uuid.safeParse(existing).success) {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, existing)).limit(1);
    if (workspace) return { workspace, isNew: false };
  }
  const [workspace] = await db.insert(workspaces).values({ name: "My workspace" }).returning();
  await audit(workspace.id, null, "workspace.created", "Workspace created empty");
  // Sample content lives in seed/fixtures.json and is inserted by `node seed/seed-demo.ts`. A first
  // visit is deliberately empty, so the counters and the bench show your own work, not staged data.
  return { workspace, isNew: true };
}

export async function GET() {
  try {
    const { workspace, isNew } = await initialize();
    // after() runs once the response is flushed: the page load is not held hostage by a model call,
    // and the work is not dropped the way a floating promise is when the request ends.
    after(async () => {
      try { await reapStuckRuns(); await tickSchedules(workspace.id); } catch (error) { console.error("Scheduler tick failed", error instanceof Error ? error.message : "unknown error"); }
    });
    const response = NextResponse.json(await board(workspace.id));
    if (isNew) response.cookies.set(cookieName, workspace.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
    return response;
  } catch (error) {
    console.error("Board load failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Could not load your workspace." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request.headers.get("origin"), request.nextUrl.host)) return NextResponse.json({ error: "Cross-origin writes are refused." }, { status: 403 });
    const actor = await readActor();
    const workspaceId = actor?.workspaceId ?? (await cookies()).get(cookieName)?.value;
    if (!workspaceId || !uuid.safeParse(workspaceId).success) return NextResponse.json({ error: "Workspace session missing. Refresh the page." }, { status: 401 });
    const budget = allowWrite(writeBuckets, workspaceId, { burst: 40, perMinute: 600 });
    if (!budget.ok) return NextResponse.json({ error: `That is a lot of actions at once — try again in ${budget.retrySeconds}s.` }, { status: 429 });
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 401 });
    const body = (await request.json()) as Record<string, unknown>;
    const { response, result = {} } = await dispatchAction({ workspace, actor, body, request });
    if (response) return response;
    return NextResponse.json({ ok: true, ...result, board: await board(workspaceId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
