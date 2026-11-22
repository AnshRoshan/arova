# 16 — Durable work engine and real Run Now

**Status: COMPLETE and live-verified 2026-10-25 (D-22/D-25).** Implemented and then verified end to end against the dedicated instance: Run Now → durable job → worker claim → execution → honest failure → retry/backoff → dead-letter; due routine claimed on board GET → keyed job; trigger 202 → worker brief → cooldown restamp; pause/kill observed; worker heartbeat on the board. Implemented: 16a (`jobs` + `worker_heartbeats` in schema), 16b (`src/worker/index.ts` + `npm run worker` with a `@/` alias resolve hook in `scripts/worker-loader.mjs`), 16c (tick and Run Now enqueue; trigger returns 202; cancel closes the job), 16d (backoff/jitter/dead-letter in `src/lib/jobs.ts`, tested), 16e (board payload `jobs` + `worker`, worker strip in Automations, honest copy). Deviations recorded in D-22: the 202 response returns `{jobId}` (no `runId` — the run row is created at claim time); `lastStatus` becomes `QUEUED` at claim, not `RUNNING`; person-initiated runs never move the fatigue streak.

## Goal

Every routine, manual run and inbound trigger becomes a durable job that executes on a worker, survives the HTTP request, retries safely, and can be cancelled. **Run Now executes the agent** instead of inserting a `WAITING_FOR_TOOL` placeholder. A closed browser no longer means no work.

Measurable: with the web app closed, a due routine completes within one job-poll interval; a manual Run Now produces a real reply and a `COMPLETED` run; killing the worker mid-run causes exactly one retry and no duplicate message.

## Why now

Every reviewed always-on product (Grok Bot, OpenAI Dots, Claude Cowork, OpenMuse, OpenBot, OpenHands) continues work outside the request. Arova's scheduler only ticks on `GET /api/board`, and Run Now is a stub. This is the single largest credibility gap and it blocks specs 17, 21, 22 and 24.

## Scope

### 16a — Job store
New table `jobs`: `id`, `workspace_id`, `kind` (`routine | manual_run | trigger_brief | memory_capture | watch_check`), `subject_id`, `payload` jsonb, `status` (`QUEUED | RUNNING | RETRYING | SUCCEEDED | FAILED | CANCELLED`), `attempts`, `max_attempts`, `run_at`, `lease_until`, `worker_id`, `last_error`, `idempotency_key`, `created_by`, timestamps. Unique `(workspace_id, idempotency_key)`.

Claim atomically with `SELECT ... FOR UPDATE SKIP LOCKED` + an `UPDATE` setting `lease_until`. A lease longer than the heartbeat is reclaimable. Terminal states are immutable.

### 16b — Worker
A separate Node process (`npm run worker`) that polls, executes one job at a time (concurrency from env), heartbeats its lease, renews it for long jobs, and shuts down gracefully. It reuses `executeRoutine` / `runBrief`; no business logic is duplicated. A `worker_heartbeats` row (or the jobs table) exposes last-seen time to health/diagnostics.

### 16c — Reroute existing paths
- Scheduled tick: `tickSchedules()` **enqueues** due routines; it no longer calls the model inside the board request.
- Run Now: enqueue a `manual_run`; the worker executes the same path the scheduler uses and posts the answer.
- Trigger: enqueue a `trigger_brief` and return `202 { jobId, runId }`; the endpoint remains authenticated and idempotent.
- Cancellation: `cancelRun` marks the job `CANCELLED`; a running lease observes it at the next step boundary and stops without marking success.

### 16d — Retries and idempotency
Exponential backoff with jitter, max attempts (default 3), a dead-letter state. A retry must not duplicate the assistant message, the run, or the channel post; every write is keyed by the job/run id. Provider errors keep their upstream detail in `last_error`.

### 16e — UI
Run rows read `QUEUED`, `RUNNING (attempt N)`, `RETRYING`, `SUCCEEDED`, `FAILED`, `CANCELLED` from stored rows. The Automations pane shows worker status (last heartbeat, queue depth) and a "worker not running" notice when stale. No invented progress percentages.

## Deep-research amendments (2026-10-20)

- Keep the queue Postgres-native. OpenBot and production queue patterns converge on `FOR UPDATE SKIP LOCKED`, DB-clock leases and one work-item table; Redis adds an infra dependency without improving auditability at this scale.
- Add parent/child task lineage and attempt linkage. A retry is a child attempt or linked run, never a silent mutation of history (`market-deep-dives/01`, CrewAI checkpoints).
- Add `cancel_mode`: `interrupt` (default) or `rollback` only for writes marked reversible (`market-deep-dives/01`, LangSmith). Pause/kill semantics are governed by spec 26.
- Add a named `TIMED_OUT` terminal state and a published wall-clock policy. Copilot's fixed 59-minute class proves timeout needs its own user-visible meaning.
- Reclaim leases at step checkpoints, not merely between full runs. The decision is how much of a model/tool step can be safely retried.
- Expose `npm run worker` as an explicit process and report last heartbeat, queue depth and oldest job. Never show a routine as active when no worker can claim it.
- Local development prerequisite is spec 25.

## Deep-research amendments (2026-10-25)

Market evidence from `market-deep-dives/07-october-refresh-2026-10-25.md` shows long-run reliability is now the category battleground; add these to scope:

- **Recovery provenance for interrupted work.** OpenClaw 10.7 ships "replay-safe session recovery": an interrupted session retains recovery provenance and its unfinished tool outcomes rather than vanishing. When a lease is lost or a worker dies mid-run, the run keeps what happened: completed steps stay, the interrupted step is recorded as interrupted (with any partial model output already streamed to the client), and the retry links to the attempt it replaces instead of silently re-running from scratch.
- **Hung streams must time out.** OpenHands Enterprise 0.76.0 (Oct 2) made hung LLM streams time out instead of stalling. Every job step gets a wall-clock deadline; a step past its deadline is a `TIMED_OUT` terminal state for that attempt (feeding the existing retry policy), never an indefinite lease.
- **Crash recovery by reply.** Devin (Oct 19) lets a crashed session be resumed by replying in the thread. Arova's equivalent: a `FAILED`/`CANCELLED` run exposes a "resume from step N" affordance that enqueues a continuation job carrying the completed-step ids — human-triggered, never automatic.
- **Partial-reply preservation on kill.** A budget stop or kill mid-stream must persist and label what already arrived (the chat path already does this; the worker path must reach the same decision).

## Value-source gate

Every displayed value has a source: job status/attempts from `jobs`; run summary/steps from `runs`/`run_steps`; queue depth from a count; worker health from `last_heartbeat`. If there is no worker, the UI says so rather than showing a fake "running".

## Data and code

- `src/db/schema.ts`: `jobs`, optional `worker_heartbeats`; indexes on `(status, run_at)` and `(workspace_id, created_at)`.
- New `src/lib/jobs.ts` (pure claim/backoff helpers + tests), `src/worker/index.ts` (process entry), `scripts` in `package.json`.
- `src/app/api/board/route.ts`: enqueue instead of inline execute; `src/app/api/trigger/route.ts`: enqueue; cancellation wiring.
- `src/app/page.tsx`: run/worker labels; no new shell.

## Exclusions

Do not add Redis/BullMQ, a hosted queue, cron expressions, multi-region workers, or a distributed scheduler. Postgres + `SKIP LOCKED` is enough until measured otherwise. Do not let the worker execute browser/computer tasks; that is spec 24. Do not change the model gateway in this unit.

## Verification

- Unit: claim is exclusive across two simulated workers; backoff sequence; lease reclaim; terminal-state immutability; idempotent duplicate enqueue.
- Live: close the browser, wait for a due routine, confirm a completed run + thread message; Run Now produces a real reply; kill the worker mid-run, restart, confirm one retry and no duplicate; trigger returns 202 and completes; cancel a queued and a running job.
- Gates: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; health shows worker state.

## Risks and cost

Adds a second process to every deployment and a new failure mode (worker down). Mitigation: explicit stale-worker UI, dead-letter visibility, and a single-command dev script. Cost is one table, one process, and a small amount of operational surface.

## Dependencies

None. Specs 17, 21, 22 and 24 depend on this.

## Open questions for the user

1. Default concurrency per workspace — 1 (safe, predictable) or 2–4 (faster, more spend)? Recommendation: 1 per workspace, configurable.
2. Retry policy — 3 attempts with backoff, or 5 for triggers only? Recommendation: 3 global, 5 for triggers.
3. Should `POST /api/trigger` stay synchronous for one release to avoid breaking callers, returning 202 only when `?async=1`? Recommendation: 202 by default, documented.
4. Should a failed job notify the human in-thread once, or only appear in Runs? Recommendation: one in-thread failure message, then silence (reuse the fatigue rule).
