import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { agents, events, jobs, messages, runs, teams, triggers } from "@/db/schema";
import { resolveLead } from "@/lib/channel";
import { hashToken, tokenPreview } from "@/lib/policy";
import { enqueueJob, queueWorkerIsLive } from "@/lib/work-queue";

export const dynamic = "force-dynamic";

/** Two fires a minute apart from one misconfigured webhook would spend the day's budget. */
const COOLDOWN_MS = 60_000;

/**
 * An event outside the app briefing one organisation.
 *
 * `POST /api/trigger` with `Authorization: Bearer <token>` and `{"text":"…"}`. The request only
 * enqueues a durable `trigger_brief` job and answers 202 (spec 30c): the worker claims it with a
 * lease and executes the same brief path a browser uses, so a slow brief can no longer hold the
 * HTTP request open and a crashed server cannot lose the ask. The token is scoped to one org,
 * stored as a digest (spec 40), and revocable.
 */
export async function POST(request: NextRequest) {
  // The token is a credential: it is read from the Authorization header only, never from a query
  // string, because query strings land in access logs and browser history.
  const raw = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!raw) return NextResponse.json({ error: "Missing bearer token. Send Authorization: Bearer <trigger token>." }, { status: 401 });
  // Compared as a digest, never as a secret: a leaked triggers row must not hand back a working token.
  const token = hashToken(raw);

  const [trigger] = await db.select().from(triggers).where(eq(triggers.token, token)).limit(1);
  if (!trigger || !trigger.enabled) return NextResponse.json({ error: "Unknown or revoked trigger token." }, { status: 404 });

  const parsed = await request.json().catch(() => null);
  const input = z.object({ text: z.string().trim().min(3).max(4000) }).safeParse(parsed ?? {});
  if (!input.success) return NextResponse.json({ error: 'The body needs {"text": "what this organisation should work on"}.' }, { status: 400 });

  // A retry with the same key is answered from the job that already exists, even after the
  // cooldown has passed. Without this, one failed HTTP response becomes two briefs.
  const idempotencyKey = (request.headers.get("idempotency-key") ?? `trigger:${createHash("sha256").update(raw + "\n" + input.data.text).digest("hex")}`).slice(0, 200);

  if (trigger.lastFiredAt && Date.now() - new Date(trigger.lastFiredAt).getTime() < COOLDOWN_MS) {
    return NextResponse.json({ error: `This trigger fired ${Math.round((Date.now() - new Date(trigger.lastFiredAt).getTime()) / 1000)}s ago; the cooldown is ${COOLDOWN_MS / 1000}s.` }, { status: 429 });
  }

  const [team] = await db.select().from(teams).where(eq(teams.id, trigger.teamId)).limit(1);
  if (!team) return NextResponse.json({ error: "The organisation this trigger belonged to no longer exists. Revoke it." }, { status: 410 });
  const seats = await db.select().from(agents).where(and(eq(agents.workspaceId, trigger.workspaceId), eq(agents.teamId, team.id), isNull(agents.deletedAt))).orderBy(agents.createdAt);
  const leadRow = resolveLead(seats, team.leadAgentId);
  if (!leadRow) return NextResponse.json({ error: `${team.name} has no seats, so there is nobody to brief.` }, { status: 409 });
  if (leadRow.status !== "ACTIVE") return NextResponse.json({ error: `${leadRow.name} is paused, so ${team.name} cannot be briefed. Resume the lead.` }, { status: 409 });

  // The cooldown is claimed atomically: two webhooks arriving together both pass the cheap check
  // above, and only the one whose UPDATE matches the pre-cooldown window may enqueue the brief.
  const cutoff = new Date(Date.now() - COOLDOWN_MS);
  const [claimed] = await db.update(triggers)
    .set({ lastFiredAt: new Date(), hits: sql`${triggers.hits} + 1` })
    .where(and(eq(triggers.id, trigger.id), or(isNull(triggers.lastFiredAt), lt(triggers.lastFiredAt, cutoff))))
    .returning({ id: triggers.id });
  if (!claimed) return NextResponse.json({ error: `This trigger fired ${Math.round((Date.now() - new Date(trigger.lastFiredAt ?? 0).getTime()) / 1000)}s ago; the cooldown is ${COOLDOWN_MS / 1000}s.` }, { status: 429 });

  // The trigger is the author of the ask, and the record says so — not "you".
  await db.insert(messages).values({ workspaceId: trigger.workspaceId, teamId: team.id, role: "user", content: input.data.text, kind: "message", metadata: { viaTrigger: trigger.label, triggerId: trigger.id } });
  await db.insert(events).values({ workspaceId: trigger.workspaceId, agentId: leadRow.id, type: "trigger.fired", detail: `${trigger.label} → ${team.name}: ${input.data.text.slice(0, 120)}` });

  const enqueued = await enqueueJob({
    workspaceId: trigger.workspaceId,
    kind: "trigger_brief",
    subjectId: trigger.id,
    payload: { triggerId: trigger.id, teamId: team.id, label: trigger.label, text: input.data.text, key: idempotencyKey },
    idempotencyKey,
    createdBy: "trigger",
  });

  if (enqueued.deduplicated) {
    return NextResponse.json({ ok: true, org: team.name, lead: leadRow.name, trigger: trigger.label, jobId: enqueued.id, status: "QUEUED", deduplicated: true, channel: "This request already has a job on record; nothing was enqueued twice." }, { status: 202 });
  }
  return NextResponse.json({
    ok: true,
    org: team.name,
    lead: leadRow.name,
    trigger: trigger.label,
    jobId: enqueued.id,
    status: "QUEUED",
    workerLive: await queueWorkerIsLive(),
    channel: `The brief is queued as job ${enqueued.id.slice(0, 8)} and will run when the worker claims it; the report lands in ${team.name}'s channel.`,
    poll: "GET /api/trigger with the same bearer token returns the job's outcome.",
  }, { status: 202 });
}

/** A small status line so an operator can tell a live token from a dead one without firing it. */
export async function GET(request: NextRequest) {
  const raw = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!raw) return NextResponse.json({ error: "Unknown token." }, { status: 404 });
  const [trigger] = await db.select().from(triggers).where(eq(triggers.token, hashToken(raw))).limit(1);
  if (!trigger) return NextResponse.json({ error: "Unknown token." }, { status: 404 });
  const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, trigger.teamId)).limit(1);
  const [last] = await db.select({ createdAt: events.createdAt, detail: events.detail }).from(events)
    .where(and(eq(events.workspaceId, trigger.workspaceId), eq(events.type, "trigger.fired"))).orderBy(desc(events.createdAt)).limit(1);
  // The newest job this trigger enqueued carries the honest state: QUEUED, RUNNING (with the run
  // it started once the worker claims it), SUCCEEDED, or FAILED with the worker's own reason.
  const [job] = await db.select({ id: jobs.id, status: jobs.status, runId: jobs.runId, lastError: jobs.lastError, updatedAt: jobs.updatedAt })
    .from(jobs)
    .where(and(eq(jobs.workspaceId, trigger.workspaceId), eq(jobs.kind, "trigger_brief"), sql`${jobs.subjectId} = ${trigger.id}`))
    .orderBy(desc(jobs.createdAt)).limit(1);
  let run: { id: string; status: string; summary: string } | null = null;
  if (job?.runId) {
    const [runRow] = await db.select({ id: runs.id, status: runs.status, summary: runs.summary }).from(runs).where(eq(runs.id, job.runId)).limit(1);
    run = runRow ?? null;
  }
  return NextResponse.json({ org: team?.name ?? null, label: trigger.label, tokenPreview: tokenPreview(raw), hits: trigger.hits, lastFiredAt: trigger.lastFiredAt, lastEvent: last ?? null, job: job ?? null, run, workerLive: await queueWorkerIsLive() });
}
