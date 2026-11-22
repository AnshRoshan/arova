import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { channels, messages, teams } from "@/db/schema";
import { enqueueJob } from "@/lib/work-queue";

export const dynamic = "force-dynamic";

/**
 * Spec 49 — Telegram ingress. Telegram's webhook secret token header is compared against the
 * channel's own inbound token; the chat id maps the update to the row; the text becomes the same
 * durable trigger_brief job the other doors use. Idempotency is Telegram's update_id on the job's
 * idempotency key, so a redelivered webhook is a no-op, not a second brief.
 */
function tokenMatches(a: string, b: string | null): boolean {
  if (!b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const payload = await request.json().catch(() => null) as { update_id?: number; message?: { chat?: { id?: number }; text?: string; from?: { id?: number } } } | null;
  const chatId = payload?.message?.chat?.id;
  if (!payload || chatId === undefined) return NextResponse.json({ ok: true, ignored: true });
  const [channel] = await db.select().from(channels)
    .where(and(eq(channels.kind, "telegram"), eq(channels.target, String(chatId)), eq(channels.enabled, true))).limit(1);
  if (!channel) return NextResponse.json({ ok: true, ignored: "No enabled Telegram channel is mapped to this chat id." }, { status: 404 });
  if (!tokenMatches(secret, channel.token)) return NextResponse.json({ error: "The secret token did not verify." }, { status: 401 });
  const text = String(payload.message?.text ?? "").replace(/^\/+/, "").trim();
  if (!text) return NextResponse.json({ ok: true, ignored: true });

  const [team] = await db.select().from(teams).where(eq(teams.id, channel.teamId ?? "")).limit(1);
  if (!team) return NextResponse.json({ ok: true, refused: "The channel maps to no organisation yet." });

  await db.insert(messages).values({ workspaceId: channel.workspaceId, teamId: team.id, role: "user", content: text.slice(0, 4000), kind: "message", metadata: { viaTelegram: channel.name, chatId } });
  const enqueued = await enqueueJob({
    workspaceId: channel.workspaceId,
    kind: "trigger_brief",
    subjectId: channel.id,
    payload: { teamId: team.id, label: `telegram:${channel.name}`, text: text.slice(0, 4000), key: `telegram:${payload.update_id ?? Date.now()}` },
    idempotencyKey: `telegram:${channel.id}:${payload.update_id ?? Date.now()}`,
    createdBy: "telegram",
  });
  return NextResponse.json({ ok: true, queued: !enqueued.deduplicated, jobId: enqueued.id }, { status: 202 });
}
