import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { agents, channelDeliveries, channels, events, messages, teams } from "@/db/schema";
import { resolveLead } from "@/lib/channel";
import { runBrief } from "../../board/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Two messages a minute apart from one looping pipeline would spend the day's budget. */
const COOLDOWN_MS = 60_000;

/**
 * Inbound half of a channel.
 *
 * A channel attached to an organisation can receive work from outside: Slack's slash command,
 * a generic webhook, or a pipe. The token is the credential and it is scoped to this one row.
 * The work runs inside the request, exactly like /api/trigger, and the report lands in the org
 * channel. A channel with no team is outbound-only and says so rather than inventing a recipient.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [channel] = await db.select().from(channels).where(eq(channels.token, token)).limit(1);
  if (!channel || !channel.enabled) return NextResponse.json({ error: "Unknown or disabled channel token." }, { status: 404 });
  if (!channel.teamId) return NextResponse.json({ error: "This channel is outbound only. Attach it to an organisation to receive work." }, { status: 400 });

  const contentType = request.headers.get("content-type") ?? "";
  let raw = "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);
    raw = typeof body?.text === "string" ? body.text : "";
  } else {
    const form = await request.formData().catch(() => null);
    raw = typeof form?.get("text") === "string" ? String(form.get("text")) : "";
  }
  const input = z.string().trim().min(3).max(4000).safeParse(raw);
  if (!input.success) return NextResponse.json({ error: 'Send {"text":"..."} or a form field named text.' }, { status: 400 });

  // Claim the cooldown atomically: two arrivals that pass the cheap check together cannot both run.
  const cutoff = new Date(Date.now() - COOLDOWN_MS);
  const [claimed] = await db.update(channels).set({ lastInboundAt: new Date() })
    .where(and(eq(channels.id, channel.id), or(isNull(channels.lastInboundAt), lt(channels.lastInboundAt, cutoff))))
    .returning({ id: channels.id });
  if (!claimed) return NextResponse.json({ error: `This channel received work less than ${COOLDOWN_MS / 1000}s ago.` }, { status: 429 });

  const [team] = await db.select().from(teams).where(eq(teams.id, channel.teamId)).limit(1);
  if (!team) return NextResponse.json({ error: "The organisation this channel belonged to no longer exists." }, { status: 410 });
  const seats = await db.select().from(agents).where(and(eq(agents.workspaceId, channel.workspaceId), eq(agents.teamId, team.id), isNull(agents.deletedAt))).orderBy(agents.createdAt);
  const lead = resolveLead(seats, team.leadAgentId);
  if (!lead) return NextResponse.json({ error: `${team.name} has no seats, so there is nobody to brief.` }, { status: 409 });
  if (lead.status !== "ACTIVE") return NextResponse.json({ error: `${lead.name} is paused, so ${team.name} cannot be briefed.` }, { status: 409 });

  await db.insert(messages).values({ workspaceId: channel.workspaceId, teamId: team.id, role: "user", content: input.data, kind: "message", metadata: { viaChannel: channel.name, channelId: channel.id } });
  await db.insert(events).values({ workspaceId: channel.workspaceId, agentId: lead.id, type: "channel.received", detail: `${channel.name} → ${team.name}: ${input.data.slice(0, 120)}` });

  const outcome = await runBrief(channel.workspaceId, team, lead, input.data, () => {}, () => false, "trigger");
  // Measure the cooldown from the end of the work, not the start: a brief with summons can take a minute.
  await db.update(channels).set({ lastInboundAt: new Date() }).where(eq(channels.id, channel.id));
  await db.insert(channelDeliveries).values({
    workspaceId: channel.workspaceId, channelId: channel.id, direction: "in", event: "inbound",
    status: outcome.status, detail: outcome.summary.slice(0, 500), runId: outcome.runId,
  });

  return NextResponse.json({
    ok: outcome.status === "COMPLETED",
    org: team.name,
    lead: lead.name,
    runId: outcome.runId,
    status: outcome.status,
    summary: outcome.summary,
    channel: `The report is posted in ${team.name}'s channel.`,
  }, { status: outcome.status === "COMPLETED" ? 200 : 502 });
}

/** A status line for an operator: is this token live, and what did it last do? */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [channel] = await db.select().from(channels).where(eq(channels.token, token)).limit(1);
  if (!channel) return NextResponse.json({ error: "Unknown channel token." }, { status: 404 });
  const [team] = channel.teamId ? await db.select({ name: teams.name }).from(teams).where(eq(teams.id, channel.teamId)).limit(1) : [];
  return NextResponse.json({
    name: channel.name,
    org: team?.name ?? null,
    outboundOnly: !channel.teamId,
    enabled: channel.enabled,
    delivered: channel.delivered,
    failed: channel.failed,
    lastStatus: channel.lastStatus,
    lastDeliveryAt: channel.lastDeliveryAt,
    lastInboundAt: channel.lastInboundAt,
  });
}
