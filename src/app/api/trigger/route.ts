import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { agents, events, messages, runs, teams, triggers } from "@/db/schema";
import { resolveLead } from "@/lib/channel";
import { runBrief } from "@/lib/brief-runner";

export const dynamic = "force-dynamic";

/** Two fires a minute apart from one misconfigured webhook would spend the day's budget. */
const COOLDOWN_MS = 60_000;

/**
 * An event outside the app briefing one organisation.
 *
 * `POST /api/trigger` with `Authorization: Bearer <token>` and `{"text":"…"}`. The work starts when
 * something calls in, it runs to completion inside the request, and the answer is posted in that
 * org's channel with the trigger named as its author. The token is scoped to one org and revocable.
 */
export async function POST(request: NextRequest) {
  // The token is a credential: it is read from the Authorization header only, never from a query
  // string, because query strings land in access logs and browser history.
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Missing bearer token. Send Authorization: Bearer <trigger token>." }, { status: 401 });

  const [trigger] = await db.select().from(triggers).where(eq(triggers.token, token)).limit(1);
  if (!trigger || !trigger.enabled) return NextResponse.json({ error: "Unknown or revoked trigger token." }, { status: 404 });

  const parsed = await request.json().catch(() => null);
  const input = z.object({ text: z.string().trim().min(3).max(4000) }).safeParse(parsed ?? {});
  if (!input.success) return NextResponse.json({ error: 'The body needs {"text": "what this organisation should work on"}.' }, { status: 400 });

  // A retry with the same key is answered from the run that already exists, even after the
  // cooldown has passed. Without this, one failed HTTP response becomes two briefs.
  const idempotencyKey = (request.headers.get("idempotency-key") ?? `trigger:${createHash("sha256").update(token + "\n" + input.data.text).digest("hex")}`).slice(0, 200);
  const [existing] = await db.select().from(runs).where(and(eq(runs.workspaceId, trigger.workspaceId), eq(runs.idempotencyKey, idempotencyKey))).limit(1);
  if (existing) {
    return NextResponse.json({ ok: existing.status === "COMPLETED", org: null, lead: null, trigger: trigger.label, runId: existing.id, status: existing.status, summary: existing.summary, deduplicated: true, channel: "This request already ran; the answer below is the stored outcome." }, { status: existing.status === "COMPLETED" ? 200 : 502 });
  }

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
  // above, and only the one whose UPDATE matches the pre-cooldown window may run the brief.
  const cutoff = new Date(Date.now() - COOLDOWN_MS);
  const [claimed] = await db.update(triggers)
    .set({ lastFiredAt: new Date(), hits: sql`${triggers.hits} + 1` })
    .where(and(eq(triggers.id, trigger.id), or(isNull(triggers.lastFiredAt), lt(triggers.lastFiredAt, cutoff))))
    .returning({ id: triggers.id });
  if (!claimed) return NextResponse.json({ error: `This trigger fired ${Math.round((Date.now() - new Date(trigger.lastFiredAt ?? 0).getTime()) / 1000)}s ago; the cooldown is ${COOLDOWN_MS / 1000}s.` }, { status: 429 });

  // The trigger is the author of the ask, and the record says so — not "you".
  await db.insert(messages).values({ workspaceId: trigger.workspaceId, teamId: team.id, role: "user", content: input.data.text, kind: "message", metadata: { viaTrigger: trigger.label, triggerId: trigger.id } });
  await db.insert(events).values({ workspaceId: trigger.workspaceId, agentId: leadRow.id, type: "trigger.fired", detail: `${trigger.label} → ${team.name}: ${input.data.text.slice(0, 120)}` });

  const outcome = await runBrief(trigger.workspaceId, team, leadRow, input.data.text, () => {}, () => false, "trigger", undefined, idempotencyKey);
  // The cooldown runs from the end of the work, not its start: a brief with two summons can take a
  // minute on its own, and measuring from the call would let a hammering webhook straight through it.
  await db.update(triggers).set({ lastFiredAt: new Date() }).where(eq(triggers.id, trigger.id));
  return NextResponse.json({
    ok: outcome.status === "COMPLETED",
    org: team.name,
    lead: leadRow.name,
    trigger: trigger.label,
    runId: outcome.runId,
    status: outcome.status,
    summary: outcome.summary,
    channel: `The report is posted in ${team.name}'s channel.`,
  }, { status: outcome.status === "COMPLETED" ? 200 : 502 });
}

/** A small status line so an operator can tell a live token from a dead one without firing it. */
export async function GET(request: NextRequest) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const [trigger] = token ? await db.select().from(triggers).where(eq(triggers.token, token)).limit(1) : [];
  if (!trigger) return NextResponse.json({ error: "Unknown token." }, { status: 404 });
  const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, trigger.teamId)).limit(1);
  const [last] = await db.select({ createdAt: events.createdAt, detail: events.detail }).from(events)
    .where(and(eq(events.workspaceId, trigger.workspaceId), eq(events.type, "trigger.fired"))).orderBy(desc(events.createdAt)).limit(1);
  return NextResponse.json({ org: team?.name ?? null, label: trigger.label, hits: trigger.hits, lastFiredAt: trigger.lastFiredAt, lastEvent: last ?? null });
}
