import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { channelConnections, channelEvents } from "@/db/schema";
import { parseAppMention, senderAllowed, verifySlackSignature } from "@/lib/channels/slack";
import { decryptSecret } from "@/lib/credentials";
import { enqueueJob } from "@/lib/work-queue";

export const dynamic = "force-dynamic";

/**
 * Spec 21b — the Slack Events API ingress. Every request is untrusted until its signature verifies
 * against the mapped connection's own secret; the event id is the idempotency key (a duplicate is
 * acknowledged, never re-briefed); the sender allow-list is the identity boundary; and the brief it
 * enqueues is the same durable trigger_brief job the token door uses. The org channel stays the
 * record — Slack receives an acknowledgement and, later, the report as a projection.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "The body is not JSON." }, { status: 400 });
  }

  // Slack's url_verification handshake answers before anything else, but still only for a signed body.
  const [candidate] = payload.team_id
    ? await db.select().from(channelConnections).where(and(eq(channelConnections.kind, "slack"), eq(channelConnections.externalId, String(payload.team_id)))).limit(1)
    : [];
  if (!candidate || !candidate.enabled) return NextResponse.json({ error: "No enabled Slack connection is mapped to this workspace id." }, { status: 404 });

  let signingSecret = "";
  let botToken = "";
  try {
    const sealed = JSON.parse(decryptSecret(candidate.envelope, process.env.CREDENTIAL_ENCRYPTION_KEY)) as { botToken?: string; signingSecret?: string };
    signingSecret = sealed.signingSecret ?? "";
    botToken = sealed.botToken ?? "";
  } catch {
    return NextResponse.json({ error: "The connection's credentials could not be opened." }, { status: 500 });
  }
  const verified = verifySlackSignature(signingSecret, {
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signature: request.headers.get("x-slack-signature"),
  }, body, Date.now());
  if (!verified) return NextResponse.json({ error: "The request signature did not verify." }, { status: 401 });

  if (payload.type === "url_verification" && typeof payload.challenge === "string") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  const mention = parseAppMention(payload);
  if (!mention) return NextResponse.json({ ok: true, ignored: true });
  if (!candidate.teamId) return NextResponse.json({ ok: true, refused: "The connection maps to no organisation yet." });

  // Idempotency by event id: the unique insert is the claim, so a redelivered webhook is a
  // no-op even if the first delivery's brief is still queued.
  const payloadHash = createHash("sha256").update(body).digest("hex");
  const [claimed] = await db.insert(channelEvents)
    .values({ connectionId: candidate.id, externalId: mention.eventId, payloadHash, status: "RECEIVED" })
    .onConflictDoNothing({ target: [channelEvents.connectionId, channelEvents.externalId] })
    .returning({ id: channelEvents.id });
  if (!claimed) return NextResponse.json({ ok: true, duplicate: true });

  if (!senderAllowed(candidate.allowedSenders, mention.userId)) {
    await db.update(channelEvents).set({ status: "REFUSED" }).where(eq(channelEvents.id, claimed.id));
    return NextResponse.json({ ok: true, refused: "The sender is not on this connection's allow-list." });
  }

  const enqueued = await enqueueJob({ workspaceId: candidate.workspaceId, kind: "trigger_brief", subjectId: candidate.teamId, payload: { teamId: candidate.teamId, label: `slack:${mention.userId}`, text: mention.text, slack: { connectionId: candidate.id, channel: mention.channelId, threadTs: mention.threadTs } }, createdBy: "slack" });
  const jobId = enqueued.id;
  await db.update(channelEvents).set({ status: "QUEUED" }).where(eq(channelEvents.id, claimed.id));
  await db.update(channelConnections).set({ lastEventAt: new Date() }).where(eq(channelConnections.id, candidate.id));
  return NextResponse.json({ ok: true, queued: true, jobId }, { status: 202 });
}
