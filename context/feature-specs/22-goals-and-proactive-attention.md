# 22 — Goals, watches and an attention inbox

**Status: APPROVED (D-22 sequence) — first slice shipped and live-verified 2026-11-03 (D-31): goals on a cadence, URL watches through the web_fetch policy (SSRF-gated at creation), the deduplicated attention inbox with evidence, and the three-failure pause ladder — all verified live (change → one item; re-check → dedupe; dead path → pause with one urgent item). Deferred (D-31): quiet hours + digest, mcp/email watch sources, agent-proposed goals.** Part of the 2026-10-20 market roadmap.

## Goal

A member can give an agent a goal or a watch — "tell me when this page changes", "watch this inbox", "every Monday check these three sources" — and the product does useful work without a prompt. Changes become deduplicated attention items, not notification spam. No external write happens without approval.

Measurable: a watched page changes → exactly one attention item with evidence; a second check with no change produces nothing; a failing check backs off; a goal shows its last/next check and outcome; quiet hours suppress delivery but not the record.

## Why now

Always-on products differentiate on proactivity: OpenAI Dots owns a responsibility, OpenMuse ships Goals & Tracking with deduplicated alerts and backoff, Grok Bot keeps working while closed. Arova's routines are time-based only; there is no goal, watch or attention surface. This is the cheapest way to deliver "always-on" value before the agent computer (spec 24).

## Scope

### 22a — Goals
`goals`: id, workspace, owner (user/seat/org), title, description, success criteria, cadence, status (`active | paused | achieved | abandoned`), last_checked_at, next_check_at, created_by. A goal can be linked to a routine or a watch; an agent can propose a goal, a human confirms it.

### 22b — Watches
`watches`: id, workspace, goal_id (optional), source kind (`url | mcp_query | email_query`), source config, condition (`changed | contains | not_contains | price_below | price_above`), comparator value, hash of last observation, last_checked_at, next_check_at, fail_streak, last_error. URL watches use the `web_fetch` policy (spec 17): allow-listed hosts, size cap, no private IPs. Email watches use the channel gateway (spec 21).

### 22c — Attention items
`attention_items`: id, workspace, kind (`watch_change | routine_failure | approval | mention | system`), severity (`info | attention | urgent`), title, body, evidence links (run/tool/message ids), dedupe_key, status (`open | seen | snoozed | dismissed | resolved`), created_at, resolved_at. Dedupe by `(workspace, kind, dedupe_key)`; a repeated identical observation updates `last_seen` instead of creating a new item.

### 22d — Scheduling and safety
The worker (spec 16) enqueues due checks. Checks have timeouts, retries and exponential backoff; a failing watch increments `fail_streak` and is paused after a threshold, with one message. Quiet hours are per workspace. A watch never writes to an external system; if a goal needs a write, it creates an approval request.

### 22e — UI
- Goals pane: active/achieved, cadence, last/next check, evidence, pause/resume.
- Watch builder: source, condition, cadence, preview of the current value, test check.
- Attention inbox: grouped by severity, open/seen/snooze/dismiss, deep links to evidence.
- A badge in the rail; no toast spam. The channel can post one digest per day, configurable.

## Deep-research amendments (2026-10-20)

- Copy Genspark's two cheap trust controls: **Test Run** with simulated/preview state and **Pending Confirmation** before a workflow becomes autonomous.
- A goal gets its own budget and can be paused/killed; background checks are unattended and therefore cannot use a higher cap than an interactive run (spec 26).
- Demand evidence rejects proactive swarms before the pause and audit story exists. A watch performs a read/observation; any external write requires an approval.
- Alerts must include source evidence and a link to the run, not just a natural-language claim.
- Dedupe, backoff and quiet hours remain, but cost/stop controls are P0 rather than later polish.

## Value-source gate

"Changed" requires a different observation hash plus stored evidence. "Last checked" comes from `last_checked_at`. "Next check" comes from `next_check_at`. An alert without evidence is a bug, not a notification.

## Data and code

- `src/db/schema.ts`: goals, watches, attention_items, observation snapshots (hash + excerpt).
- New `src/lib/goals.ts` (condition evaluation, dedupe, backoff) + tests; `src/lib/attention.ts`.
- `src/worker/`: watch-check job; `src/app/api/board/route.ts`: CRUD + inbox actions.
- `src/app/page.tsx`: Goals/Watch UI + attention inbox + rail badge.
- Env: cadence limits, quiet hours defaults.

## Exclusions

No push notifications, native mobile, SMS or voice in v1. No autonomous purchases, bookings or external writes. No arbitrary JS scraping; only fetch + parse conditions. No cross-workspace watches. No "AI decides to create unlimited goals" without human confirmation.

## Verification

- Unit: condition evaluation; dedupe keys; backoff/fail-streak; quiet hours; evidence linking.
- Live: create a URL watch against a test page; change the page; confirm one attention item; re-check with no change → no new item; break the URL → backoff and pause; create a goal with a routine; confirm last/next check; dismiss/snooze.
- Gates: tests, typecheck, lint, build; worker runs the checks.

## Risks and cost

Watches can hammer third-party sites; enforce a minimum interval, a per-host rate limit, and a user agent. False positives erode trust; previews and thresholds help. Email watches depend on spec 21. Cost: three tables, a job kind, and notification discipline.

## Dependencies

Spec 16 (worker), spec 21 (email watches/delivery), spec 17 (`web_fetch` policy).

## Open questions for the user

1. Minimum check interval: 15 minutes, 1 hour, or per-source? Recommendation: 1 hour default, 15 minutes minimum for paid workspaces.
2. Where do alerts land in v1: in-app inbox only, or also Slack/email digest? Recommendation: in-app + one daily digest over the configured channel.
3. Should an agent be able to propose goals/watches from a conversation? Recommendation: yes, as a proposal card; human confirms.
4. Pause threshold for failing watches: 3 consecutive failures? Recommendation: 3 with backoff, then pause and one message.
