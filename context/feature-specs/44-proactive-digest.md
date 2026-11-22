# 44 — Proactive digest

**Status: SHIPPED 2026-11-23 (model-free core live; drive pending in the pass-final sweep).**

**Problem.** Duet messages you first; Arova's human had to open the board to learn that a watch
failed at 03:00 or three jobs dead-lettered. Attention existed but had no outbound voice of its own.

**Scope shipped.**
- `digests` table (one per workspace): cadence + target channel + enable state.
- The tick enqueues due digests as durable `digest` jobs (occurrence-keyed, queue-only — a board
  read never waits on one).
- `src/lib/digest.ts` — the pure builder (tested): sections for urgent attention, attention,
  paused-by-the-ladder watches/goals, jobs dead-lettered since the last digest, and queue health;
  a quiet day states "Everything the ladder watches is quiet." rather than sending nothing.
- The worker queries stored rows, renders model-free, delivers through the same channel contract
  as run reports (`digest` event kind), records the delivery, stamps `last_sent_at`. No channel
  chosen → an honest `digest.skipped` event, not a silent drop.
- Board actions `createDigest`/`updateDigest`/`deleteDigest`; Automations › Goals hosts the
  configuration and the digest row; eval drift joins in spec 45's history.

**Acceptance met.** With no model key the digest ships (5 pure tests + worker path verified in the
pass-final drive); with one, still no model call is needed — the facts are stored rows; pause/kill
and retries are the queue's own, no special case.

**Honest boundary.** The digest is deterministic text, not model-polished prose; it reads the rows
it is given, so its completeness is the completeness of the stored record.
