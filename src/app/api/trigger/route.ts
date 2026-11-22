import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { agents, events, messages, teams, triggers } from "@/db/schema";
import { resolveLead } from "@/lib/channel";
import { hashToken } from "@/lib/policy";
import { makeRateLimiter } from "@/lib/limits";
import { enqueueJob } from "../board/route";

/** Spec 19e: ten fires per minute per calling IP, on top of the per-token cooldown. */
const ipLimiter = makeRateLimiter(() => Date.now(), { capacity: 10, windowMs: 60_000 });
const callerIp = (request: NextRequest) => request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

export const dynamic = "force-dynamic";

/** Two fires a minute apart from one misconfigured webhook would spend the day's budget. */
const COOLDOWN_MS = 60_000;

/**
 * An event outside the app briefing one organisation.
 *
 * `POST /api/trigger` with `Authorization: Bearer <token>` and `{"text":"…"}`. The request validates,
 * claims the cooldown, records the ask as a channel post, and enqueues a durable `trigger_brief` job
 * (spec 16c) — the worker runs the brief and posts the report with the trigger named as its author.
 * The response is `202` with the job id: the work is accepted, not yet done, and the caller is told
 * exactly that. The token is scoped to one org and revocable.
 */
export async function POST(request: NextRequest) {
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const token = bearer || new URL(request.url).searchParams.get("token") || "";
  if (!token) return NextResponse.json({ error: "Missing bearer token. Send Authorization: Bearer <trigger token>." }, { status: 401 });

  // The row stores a sha-256 digest, so the lookup compares digests: a database read can never be
  // replayed as a credential (spec 26e).
  const [trigger] = await db.select().from(triggers).where(eq(triggers.token, hashToken(token))).limit(1);
  if (!trigger || !trigger.enabled) return NextResponse.json({ error: "Unknown or revoked trigger token." }, { status: 404 });

  const ipWindow = ipLimiter.hit(callerIp(request));
  if (!ipWindow.ok) return NextResponse.json({ error: `Too many calls from this address; retry in ${Math.ceil(ipWindow.retryAfterMs / 1000)}s.` }, { status: 429, headers: { "retry-after": String(Math.ceil(ipWindow.retryAfterMs / 1000)) } });

  const parsed = await request.json().catch(() => null);
  const input = z.object({ text: z.string().trim().min(3).max(4000) }).safeParse(parsed ?? {});
  if (!input.success) return NextResponse.json({ error: 'The body needs {"text": "what this organisation should work on"}.' }, { status: 400 });

  // One statement claims the fire. Read first and write later would let two webhooks arriving in the
  // same instant both pass the cooldown test and both spend a brief: here the cooldown, the stamp and
  // the hit land inside the same row lock, and only one caller can make them land.
  const [claimed] = await db.update(triggers)
    .set({ lastFiredAt: new Date(), hits: sql`${triggers.hits} + 1` })
    .where(and(
      eq(triggers.id, trigger.id),
      eq(triggers.enabled, true),
      or(isNull(triggers.lastFiredAt), sql`${triggers.lastFiredAt} < now() - make_interval(secs => ${COOLDOWN_MS / 1000})`),
    ))
    .returning({ id: triggers.id });
  if (!claimed) {
    // Best-effort: the row is only read again so the refusal can say when it last fired.
    const [current] = await db.select({ lastFiredAt: triggers.lastFiredAt }).from(triggers).where(eq(triggers.id, trigger.id)).limit(1);
    const ago = current?.lastFiredAt ? Math.round((Date.now() - new Date(current.lastFiredAt).getTime()) / 1000) : null;
    return NextResponse.json({ error: ago === null
      ? "This trigger was revoked or switched off as it was claimed, so nothing was briefed."
      : `This trigger fired ${ago}s ago; the cooldown is ${COOLDOWN_MS / 1000}s.` }, { status: 429 });
  }

  const [team] = await db.select().from(teams).where(eq(teams.id, trigger.teamId)).limit(1);
  if (!team) return NextResponse.json({ error: "The organisation this trigger belonged to no longer exists. Revoke it." }, { status: 410 });
  const seats = await db.select().from(agents).where(and(eq(agents.workspaceId, trigger.workspaceId), eq(agents.teamId, team.id), isNull(agents.deletedAt))).orderBy(agents.createdAt);
  const leadRow = resolveLead(seats, team.leadAgentId);
  if (!leadRow) return NextResponse.json({ error: `${team.name} has no seats, so there is nobody to brief.` }, { status: 409 });
  if (leadRow.status !== "ACTIVE") return NextResponse.json({ error: `${leadRow.name} is paused, so ${team.name} cannot be briefed. Resume the lead.` }, { status: 409 });

  // The trigger is the author of the ask, and the record says so — not "you". The claim above already
  // stamped the row, so nothing here writes `lastFiredAt` or `hits` again before the work.
  await db.insert(messages).values({ workspaceId: trigger.workspaceId, teamId: team.id, role: "user", content: input.data.text, kind: "message", metadata: { viaTrigger: trigger.label, triggerId: trigger.id } });
  await db.insert(events).values({ workspaceId: trigger.workspaceId, agentId: leadRow.id, type: "trigger.fired", detail: `${trigger.label} → ${team.name}: ${input.data.text.slice(0, 120)}` });

  // The job carries everything the worker needs to run the same brief path; the worker re-resolves
  // the lead at claim time so a roster change between call and execution is respected. The minute
  // bucket keeps a webhook retrying within the same minute from queueing the brief twice.
  const jobId = await enqueueJob(
    trigger.workspaceId,
    "trigger_brief",
    team.id,
    { triggerId: trigger.id, teamId: team.id, label: trigger.label, text: input.data.text },
    `trigger:${trigger.id}:${new Date().toISOString().slice(0, 16)}`,
    "trigger",
  );
  return NextResponse.json({
    ok: true,
    queued: true,
    jobId,
    org: team.name,
    lead: leadRow.name,
    trigger: trigger.label,
    note: "The brief was accepted and queued for the worker; its report will be posted in the organisation's channel. If no worker is running, the job waits until one starts.",
  }, { status: 202 });
}

/** A small status line so an operator can tell a live token from a dead one without firing it. */
export async function GET(request: NextRequest) {
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const token = bearer || new URL(request.url).searchParams.get("token") || "";
  const [trigger] = token ? await db.select().from(triggers).where(eq(triggers.token, hashToken(token))).limit(1) : [];
  if (!trigger) return NextResponse.json({ error: "Unknown token." }, { status: 404 });
  const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, trigger.teamId)).limit(1);
  const [last] = await db.select({ createdAt: events.createdAt, detail: events.detail }).from(events)
    .where(and(eq(events.workspaceId, trigger.workspaceId), eq(events.type, "trigger.fired"))).orderBy(desc(events.createdAt)).limit(1);
  return NextResponse.json({ org: team?.name ?? null, label: trigger.label, hits: trigger.hits, lastFiredAt: trigger.lastFiredAt, lastEvent: last ?? null });
}
