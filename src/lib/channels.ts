/**
 * Outbound channels: where a finished run or a pending approval is posted.
 *
 * The delivery target is a credential (a Slack incoming webhook is a URL that can post), so it is
 * never returned to the browser and never printed in an error. The same SSRF policy that guards
 * web_fetch guards this request: https, port 443, public address, no credentials in the URL.
 */

import { randomBytes } from "node:crypto";
import { validateFetchTarget, type FetchPolicy } from "./web-fetch.ts";

export type ChannelKind = "webhook" | "slack";
export const CHANNEL_KINDS: ChannelKind[] = ["webhook", "slack"];

export type ChannelEventKind = "run" | "approval" | "test";
export type ChannelEvent = {
  kind: ChannelEventKind;
  title: string;
  status: string;
  summary: string;
  agentName?: string;
  teamName?: string;
  runId?: string;
  approvalId?: string;
};

export function newChannelToken(): string {
  return `arova-ch-${randomBytes(24).toString("hex")}`;
}

export function isChannelKind(value: string): value is ChannelKind {
  return value === "webhook" || value === "slack";
}

/** What the browser may know about a target: its host, never its path or query. */
export function redactTarget(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.hostname}${url.pathname && url.pathname !== "/" ? "/…" : ""}`;
  } catch {
    return "invalid target";
  }
}

/** One sentence a human can read in Slack without opening Arova. */
export function channelEventText(event: ChannelEvent): string {
  const who = event.agentName ? ` · ${event.agentName}` : "";
  const org = event.teamName ? ` (${event.teamName})` : "";
  if (event.kind === "approval") return `Arova${org} · ${event.title}${who}\nNeeds your decision: ${event.summary}`;
  if (event.kind === "test") return `Arova${org} · test delivery${who}\n${event.summary}`;
  return `Arova${org} · ${event.title}${who}\n${event.status}: ${event.summary}`;
}

/**
 * Slack accepts a `text` field and ignores nothing it does not know; a generic webhook gets the
 * event metadata too, so an operator can route on it without parsing prose.
 */
export function webhookPayload(kind: ChannelKind, event: ChannelEvent): Record<string, unknown> {
  const text = channelEventText(event).slice(0, 3500);
  return kind === "slack"
    ? { text }
    : { text, event: event.kind, title: event.title, status: event.status, runId: event.runId ?? null, approvalId: event.approvalId ?? null };
}

export type DeliveryDeps = FetchPolicy & { fetchImpl?: typeof fetch; timeoutMs?: number; attempts?: number; retryDelayMs?: number };
export type DeliveryResult = { ok: boolean; status: "DELIVERED" | "FAILED" | "REFUSED"; detail: string };

/** Check a target without sending: same policy as delivery, so the form can refuse before saving. */
export async function validateChannelTarget(raw: string, deps: FetchPolicy = {}): Promise<{ url: URL } | { error: string }> {
  return validateFetchTarget(raw, deps);
}

export async function deliverToChannel(
  channel: { name: string; kind: string; target: string },
  event: ChannelEvent,
  deps: DeliveryDeps = {},
): Promise<DeliveryResult> {
  if (!isChannelKind(channel.kind)) return { ok: false, status: "REFUSED", detail: `Unknown channel kind "${channel.kind}".` };
  const target = await validateChannelTarget(channel.target, deps);
  if ("error" in target) return { ok: false, status: "REFUSED", detail: target.error };
  const doFetch = deps.fetchImpl ?? fetch;
  const attempts = Math.max(1, Math.min(3, deps.attempts ?? 2));
  const retryDelayMs = deps.retryDelayMs ?? 400;
  let last: DeliveryResult = { ok: false, status: "FAILED", detail: `${target.url.hostname} did not answer.` };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await doFetch(target.url.toString(), {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/plain, */*" },
        body: JSON.stringify(webhookPayload(channel.kind, event)),
        redirect: "manual",
        signal: AbortSignal.timeout(deps.timeoutMs ?? 8000),
      });
      if (response.ok) return { ok: true, status: "DELIVERED", detail: `Delivered to ${target.url.hostname} on attempt ${attempt}.` };
      last = { ok: false, status: "FAILED", detail: `${target.url.hostname} answered ${response.status}${attempt === attempts ? ` after ${attempts} attempts` : ""}.` };
      // A 4xx is a refusal, not a transient failure: retrying would only repeat it.
      if (response.status < 500 || attempt === attempts) return last;
    } catch (error) {
      last = { ok: false, status: "FAILED", detail: `${target.url.hostname} did not answer (${error instanceof Error ? error.name : "network error"})${attempt === attempts ? ` after ${attempts} attempts` : ""}.` };
      if (attempt === attempts) return last;
    }
    if (retryDelayMs) await new Promise(resolve => setTimeout(resolve, retryDelayMs));
  }
  return last;
}
