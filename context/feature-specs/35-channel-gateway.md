# 21 — Channel gateway: Slack and email

**Status: APPROVED (D-22 sequence) — Slack-first slice shipped and live-verified 2026-11-03 (D-30): the connections model with sealed credentials, the signed webhook with event-id idempotency and an allow-list identity boundary (all six rules proven live via `scripts/slack-gateway-smoke.mjs`), the worker's speak-once thread report (live-verified), and the Integrations Channels tab. Deferred (D-30): the email adapter (21c — needs a provider decision), approval buttons in Slack (need 26g tokens against real tools), member identity mapping (lands with 18).** Part of the 2026-10-20 market roadmap.

## Goal

A member can brief an organisation from Slack or email and receive the result where they asked, with identity, permissions and approvals preserved. The org channel remains the durable record; external channels are adapters over it.

Measurable: a Slack mention of the org's handle creates a channel post and a brief, and the report replies in the same thread; an email to the org's address does the same and threads correctly; an unauthorized sender is refused; an approval card can be approved/declined from the external channel; duplicate events are idempotent.

## Why now

The market meets users where they work: OpenDots ships Slack and calls, OpenClaw ships 20+ channels, Lindy ships Slack/email/phone, Dots notifies across ChatGPT surfaces. Arova's only external ingress is a bearer-token HTTP trigger; a web tab is not a channel strategy.

## Scope

### 21a — Connections model
`channel_connections`: workspace, kind (`slack | email`), encrypted credentials, external id, allowed senders, default org/seat, status, created_by, last_event_at. One org can have multiple connections; one connection maps to one org by default.

### 21b — Slack adapter
- OAuth install (bot scopes: `app_mentions:read`, `chat:write`, `channels:history`, `commands` as needed), per-workspace token.
- Events API: `app_mention`, DM, and optionally a slash command `/arova`.
- Map `(channel, thread_ts)` to an org channel thread; store the external ref on the channel post.
- Post the brief acknowledgement, then the lead report; stream updates as edits or a single final post (choose one and document).
- Approve/decline buttons on approval cards; verify the Slack signing secret and timestamp.
- Idempotency by `event_id`.

### 21c — Email adapter
- Inbound address (`org-<slug>@<domain>`) via a provider webhook (Resend/Postmark/Cloudflare Email Workers — choose one).
- Verify DKIM/SPF and webhook signatures; parse the body, strip quotes/signatures, cap attachments.
- Thread using `Message-ID` / `In-Reply-To`; map to the org channel.
- Outbound replies from the same address, with `References` headers and a plain-text + HTML body.
- Attachments stored per workspace with size/type limits; no executable files.

### 21d — Identity and permissions
Map an external sender to a workspace member (email match for email; Slack user id ↔ member). Unknown senders get a refusal and an invite hint, never a brief. Role gates apply (a member can brief; only admins can create/revoke connections). Every external action records the external actor and the mapped member.

### 21e — UI
Integrations pane: connection status, install/connect, sender allow-list, org mapping, test message, revoke. Channel posts show their source (Slack/email/web) and a link back. Settings explains what is and is not delivered.

## Deep-research amendments (2026-10-20)

- Every external message is untrusted input and must be wrapped/annotated before becoming a prompt (`market-deep-dives/05`, Cowork exfiltration incident).
- Guard writes in **all** surfaces. Lindy's channel-boundary gap—shared Slack guarded while DM/web/SMS are not—is an anti-pattern Arova must not repeat.
- Approval buttons and pause/cancel links are part of the channel adapter, not an afterthought.
- Preserve per-channel thread context and map each external thread to the org channel; Dots/OpenDots prove continuity matters.
- Verify provider signatures and event IDs; store external delivery IDs for idempotency and status.
- Connector tokens are scoped and never sent into a model or browser sandbox.
- Start with Slack + email only. Do not chase OpenClaw's 40-channel breadth before auth and policy are credible.

## Value-source gate

"Connected" requires a successful handshake/token check; "delivered" requires a provider response id stored on the post. No fake "sent" state. The channel remains the source of truth; an external post is a projection, not a second record.

## Data and code

- `src/db/schema.ts`: `channel_connections`, `channel_events` (external id, payload hash, status), attachment refs.
- New `src/lib/channels/slack.ts`, `src/lib/channels/email.ts`, `src/lib/channels/identity.ts` (+ tests).
- `src/app/api/channels/{slack,email}/route.ts` (webhooks), `src/app/api/board/route.ts` (connect/revoke/test).
- `src/app/page.tsx`: Integrations pane + source labels.
- Worker (spec 16) sends outbound messages and retries provider failures.
- Env: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `EMAIL_*`, `CHANNEL_BASE_URL`.

## Exclusions

No WhatsApp/Telegram/Discord/voice in v1. No Slack marketplace listing. No native mobile app. No attachment execution or arbitrary file download. No cross-workspace channel sharing. No inbound email parsing of arbitrary HTML without sanitization.

## Verification

- Unit: signature verification; sender mapping; thread mapping; body cleaning; idempotency.
- Live: install Slack app in a test workspace; mention the org; confirm channel post + brief + threaded reply; approve an action from Slack; duplicate event ignored; unauthorized user refused; send an email, confirm inbound post + threaded reply; attachment limits.
- Gates: tests, typecheck, lint, build; worker retry on provider 5xx.

## Risks and cost

External channels widen the attack surface (webhook spoofing, prompt injection in email, malicious attachments). Verify signatures, sanitize content, allow-list senders, and treat all external text as untrusted input to the model. Cost: two integrations, encrypted credentials, provider accounts, and operational monitoring.

## Dependencies

Spec 16 (outbound jobs/retries), spec 18 (member identity/roles). Spec 17 for approval actions that execute tools.

## Open questions for the user

1. Slack first or email first? Recommendation: Slack first (faster feedback), email second.
2. Email provider: Resend, Postmark, or Cloudflare Email Workers? Recommendation: Resend for speed, with a provider interface.
3. Should external users be able to create a new org, or only brief an existing one? Recommendation: only brief; org creation stays in the app.
4. Delivery style in Slack: one final post, or live edits? Recommendation: one acknowledgement + one final report, with a link to the run; edit only for status.

---

> **Renumbered 2026-11-22.** This document belonged to the parallel work line on this machine (its spec 21). On main it is spec **35**; the whole line renumbered 16–27 → 30–41 to continue main's own specs 16–29. Internal subsection letters and cross-references still speak the old numbers.
