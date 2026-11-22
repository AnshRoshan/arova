/**
 * Spec 21b — the Slack adapter's pure core. Signature verification, event parsing, the sender
 * allow-list (the identity boundary until spec 18's members exist) and the API base override
 * that lets the whole gateway be verified against a mock. Outbound posting is a thin fetch at
 * the call site; nothing here trusts a webhook before its signature verifies.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const FRESH_WINDOW_MS = 5 * 60_000;

export function verifySlackSignature(signingSecret: string, headers: { timestamp: string | null; signature: string | null }, body: string, nowMs: number): boolean {
  if (!signingSecret || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(nowMs - ts * 1000) > FRESH_WINDOW_MS) return false;
  const expected = `v0=${createHmac("sha256", signingSecret).update(`v0:${headers.timestamp}:${body}`).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(headers.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type SlackMention = { eventId: string; teamId: string; channelId: string; threadTs: string | null; userId: string; text: string };

/** Only app_mention events become briefs; everything else is another product's business. */
export function parseAppMention(payload: unknown): SlackMention | null {
  const p = (payload ?? {}) as { event_id?: unknown; team_id?: unknown; event?: { type?: unknown; channel?: unknown; thread_ts?: unknown; user?: unknown; text?: unknown } };
  const event = p.event;
  if (!event || event.type !== "app_mention") return null;
  if (typeof p.event_id !== "string" || !p.event_id) return null;
  if (typeof event.channel !== "string" || typeof event.user !== "string") return null;
  const mention = typeof event.user === "string" ? event.user : "";
  const text = typeof event.text === "string" ? event.text.replace(/<@[^>]+>/g, "").trim() : "";
  return {
    eventId: p.event_id,
    teamId: typeof p.team_id === "string" ? p.team_id : "",
    channelId: event.channel,
    threadTs: typeof event.thread_ts === "string" ? event.thread_ts : null,
    userId: mention,
    text,
  };
}

/** The identity boundary until spec 18: a sender not on the connection's list is refused, never briefed. */
export function senderAllowed(allowedSenders: string[], userId: string): boolean {
  return allowedSenders.includes(userId);
}

export function slackApiBase(env: Record<string, string | undefined> = process.env): string {
  return env.SLACK_API_BASE?.trim() || "https://slack.com/api";
}
