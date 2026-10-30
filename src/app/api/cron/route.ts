import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { tickAllWorkspaces } from "../board/route";

export const dynamic = "force-dynamic";
/** Serverless hosts freeze the process after the response, so this call waits for the routines it starts. */
export const maxDuration = 300;

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * An outside clock. Anything that can make an HTTP request on a timetable — Vercel Cron, a GitHub Actions
 * schedule, cron-job.org, a crontab line, a Cloudflare Worker — keeps Arova's routines firing even when this
 * server only wakes up for requests.
 *
 *   curl -X POST https://your-host/api/cron -H "Authorization: Bearer $CRON_SECRET"
 *
 * Vercel Cron sends exactly that header when CRON_SECRET is set in the project's environment.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set on this server, so /api/cron is closed. Set it to a long random string and restart." }, { status: 503 });
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  // Header only. A secret in a query string is written to access logs, proxy logs and history.
  if (!bearer || !same(bearer, secret)) return NextResponse.json({ error: "Wrong or missing cron secret. Send Authorization: Bearer <CRON_SECRET>." }, { status: 401 });
  const started = Date.now();
  const result = await tickAllWorkspaces("cron", { wait: true });
  return NextResponse.json({ ok: true, ...result, tookMs: Date.now() - started, at: new Date().toISOString() });
}

export const GET = handle;
export const POST = handle;
