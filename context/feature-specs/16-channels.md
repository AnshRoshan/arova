# Feature 16 — External channels

## The problem

Arova can record a run but cannot tell anyone outside the browser that it happened. The market brief
(§8) ranks this as the first distribution gap: every hosted competitor has Slack/Teams/WhatsApp/voice,
and every self-host competitor has 20–50 adapters. A colleague who only reads Slack never sees the
result of a routine.

The first slice is deliberately a **contract**, not an OAuth project: an HTTPS webhook that Slack's
incoming-webhook URL already satisfies, plus an inbound token for an organisation. That covers "post
the result somewhere" and "start work from outside" without inventing per-vendor OAuth.

## Data model

- `channels`: `id`, `workspace_id`, `team_id NULL`, `name`, `kind` (`webhook` | `slack`), `target`
  (server-only), `token`, `enabled`, `last_delivery_at`, `last_status`, `last_error`, `delivered`,
  `failed`, `last_inbound_at`, `created_at`. Unique token; workspace and team indexes.
- `channel_deliveries`: `id`, `workspace_id`, `channel_id`, `direction` (`out` | `in`), `event`,
  `status` (`DELIVERED` | `FAILED` | `REFUSED`), `detail`, `run_id NULL`, `created_at`. Every attempt is
  a row, so "the post failed" is evidence.

`target` is a credential (a Slack incoming webhook can post). It is never returned to the browser; the
board returns `targetHost` (hostname plus `/…`) and the inbound `token` only.

## Server behaviour

- **Create** (`createChannel`): name, kind, target URL, optional team. The target is checked with the
  same SSRF policy as `web_fetch`: https, port 443, no credentials in the URL, DNS resolved and every
  answer public. A team-attached channel is gated by `mayRemember` (a seat cannot wire someone else's
  org). Audit `channel.created`.
- **Test** (`testChannel`): one delivery, recorded, returned to the caller.
- **Update / delete**: enable/disable, rename, delete. Delete removes its delivery history by cascade.
- **Outbound**: `notifyChannels(workspaceId, teamId, event)` posts to workspace-wide channels always,
  plus the event's team when present. Events: a routine finishing (any status, including paused/no-key
  failures), an org brief finishing, and an approval being requested. Delivery is best-effort and never
  throws into the run; a failure is a delivery row and a `lastError`, not a silent success.
- **Inbound** (`POST /api/channels/:token`): JSON `{text}` or form `text`; token scoped to one row;
  a channel with no team is outbound-only and says so; a 60 s cooldown is claimed atomically and
  measured from the end of the work; the ask is stored as a `user` message with `viaChannel`, the run
  is `initiator:"trigger"`, and the report lands in the org channel. `GET` returns a status line.

## UI

Integrations → Channels: add form (name, kind, target, optional org), configured rows with host,
delivery/failure counts, last status, test/disable/delete, and the recent delivery ledger. The inbound
URL is copyable after creation. Empty and failed states say what is true; no "connected" claim without
a delivery.

## Constraints that survive

- The target URL never enters the browser payload, a log line, or an error sentence.
- The SSRF policy is the product: https, 443, public addresses, no credentials, no redirect.
- A failed delivery is never reported as delivered; the run's own status is unchanged by a channel
  failure.
- Inbound is a brief, not an arbitrary write: it reaches one org's lead through `runBrief`, with the
  same budget and same refusal sentences.
- No new colour or shell: the panel uses the existing `.block`, `.field`, `.row` vocabulary.

## Out of scope (recorded, not implied)

Slack Events API / OAuth install, Teams, Telegram, email, WhatsApp, retry queues, per-channel
formatting templates, attachments, two-way threading. Those are adapters behind this contract.

## Verification (2026-10-28)

- `src/lib/channels.test.ts` 11/11: text shape, Slack-only `text`, redacted target, token shape,
  non-https refused before fetch, 200 delivered, 5xx retried once then delivered, 4xx not retried,
  persistent 5xx fails after the stated attempts, thrown fetch contained. Delivery retries only
  network/5xx (two attempts by default); a 4xx is a refusal and is not repeated.
- Live: created a webhook channel; `testChannel` to httpbin.org returned **DELIVERED**; to
  example.com returned **FAILED: example.com answered 405** and both are rows in `channel_deliveries`.
- Live inbound: created an org channel, posted `{"text":…}` → the lead ran (local provider) and returned
  `FAILED` with "No provider was configured for the lead"; the second immediate post returned **429**.
- UI: Integrations → Channels rendered the configured row and delivery ledger; test/disable/delete
  present; no console errors in the live snapshot.
