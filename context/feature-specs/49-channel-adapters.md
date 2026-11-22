# 49 — Channel adapters pack (Teams, Telegram, delivery retry)

**Status: SHIPPED 2026-11-23 (Teams + Telegram + durable retry; email deferred with its bar
recorded).**

**Problem.** Slack shipped in the earlier pass; Teams, Telegram and email were the remaining
distribution surfaces, and a failed delivery had only its ledger row — no second chance.

**Scope shipped.**
- **Teams**: an incoming-webhook kind beside Slack and generic — same text payload, same SSRF
  target policy.
- **Telegram**: outbound via the bot API with the bot token resolved from the **vault at call
  time** (the row stores only the credential label; the target is a chat id, so no URL policy);
  inbound at `/api/channels/telegram` verifying Telegram's own secret-token header against the
  channel's inbound token, chat id → row mapping, and the same durable `trigger_brief` job the
  other doors use, idempotent on Telegram's update_id.
- **Durable delivery retry**: a failed outbound delivery enqueues a `channel_retry` job — the
  queue owns the backoff, every attempt is a ledger row, and a dead-letter surfaces in the digest.

**Acceptance met.** Each kind is validated at creation; retries are durable and recorded; the
drive in this pass confirmed the whole delivery path against the webhook family (verified live
earlier) and the kinds now pass typecheck/tests (361/361).

**Honest boundary.** **Email is deferred, not forgotten**: honest inbound requires IMAP/SMTP or a
provider webhook plus sender authorization (Hermes' default is the bar), which needs a dependency
the owner has not chosen. Teams/Telegram verified against their published payload shapes; a live
Teams/Telegram round-trip needs real webhooks to point here.
