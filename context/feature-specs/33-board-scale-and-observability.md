# 19 — Board scale, retention and observability

**Status: APPROVED (D-22 sequence) — first slice shipped and live-verified 2026-10-26 (D-28): bounded board lists with SQL-count overview integrity, keyset cursor pagination with a live page endpoint (zero duplicates, fail-closed refusals), client load-more, the four composite indexes (pushed), single-instance rate limits on mutations and the trigger, and the opt-in retention sweep. Deferred (D-28): per-thread client cursor state, route-level tests on a disposable DB (19f), diagnostics pane + per-run cost rollups (19d), failure taxonomy, archive/export.** Part of the 2026-10-20 market roadmap.

## Goal

The board stays bounded as a workspace grows: threads and channels paginate, old data has a retention policy, the queries have the right indexes, every run has a trace and a cost, and the public routes have basic abuse controls. A workspace with 10,000 messages loads as fast as one with 100.

Measurable: a board read returns a bounded page (default 50 messages per open thread, 50 channel posts), not every row; a 10k-message workspace loads under the agreed budget; retention removes/archives per policy; the diagnostics pane shows queue depth, worker heartbeat, run latency and cost.

## Why now

Every reviewed product operates at real volume; Arova currently returns every message, memory and trigger row per workspace. The 2026-10-20 sync already flagged pagination as the first thing that will hurt a real workspace. Observability is also how Arova proves its accountability claim.

## Scope

### 19a — Pagination
Cursor-based, newest-first, stable under inserts:
- Seat thread: `GET /api/board?agentId=<id>&before=<cursor>&limit=50`.
- Org channel: same with `teamId`.
- Runs/events/usage: server-side limits with "load more".
The initial board payload carries summaries + the first page only. The client keeps a cursor per open thread and merges without duplicates.

### 19b — Retention
Per-workspace settings: messages, channel posts, events, runs, usage. Soft-delete/archive first; hard-delete after a grace period. Export before delete. Retention jobs run on the worker (spec 16) and write an audit row. Defaults are conservative and documented.

### 19c — Indexes and query shape
Indexes: `(workspace_id, agent_id, created_at)`, `(workspace_id, team_id, created_at)`, `(workspace_id, created_at)` for events/runs, `(status, run_at)` for jobs, `(workspace_id, provider, day)` for usage. Avoid N+1 reads in `board()`. Measure with `EXPLAIN` on a seeded 10k workspace.

### 19d — Observability
- `model_calls` / `tool_calls` traces: workspace, seat, run, provider/model, latency, input/output tokens (reported vs estimated), cost estimate, error class.
- Per-run cost rollup; per-seat/day budget already exists.
- `/api/health`: DB, worker heartbeat, queue depth, oldest queued job.
- Diagnostics pane: last errors, retry counts, dead-letter jobs, slowest routes.
- Keep the existing `events` audit stream; do not replace it.

### 19e — Limits
Per-IP and per-workspace rate limits on auth, board mutations, trigger and public routes; request size caps; CSV/PDF upload caps when those arrive. CSRF is spec 18. A simple Postgres/Redis-free limiter is acceptable for a single instance; document the limitation.

### 19f — Tests
Route-level tests against a disposable database for pagination, retention and role checks; a browser harness for the golden chat path. This closes the current "pure lib only" gap.

## Deep-research amendments (2026-10-20)

- Promote `run_artifacts` to first-class observability, alongside traces. Cursor/Codex/Copilot show that trust comes from reviewable links, diffs, files and outputs, not log lines alone.
- Cost UI should show human-legible "runs/tasks today" and per-run estimated tokens/cost. Do not create a proprietary credit unit (`market-deep-dives/01` pricing signal).
- Add a terminal failure taxonomy: provider error, timeout, policy denied, budget reached, lease lost, tool error, cancelled, artifact delivery failed.
- Include TTL/store semantics for memory and observation retention rather than ad-hoc deletion.
- Keep traces in Postgres in v1. External OTel/APM can come after the trace shape is proven.
- Route tests must cover parent/child cancellation and artifact links from spec 26, not only CRUD.

## Value-source gate

Every number in diagnostics comes from a stored row or a live count: queue depth from `jobs`, latency from traces, cost from usage rows, worker health from heartbeat. No synthetic percentages or "healthy" badges without evidence.

## Data and code

- `src/db/schema.ts`: new trace tables if needed; indexes.
- `src/app/api/board/route.ts`: cursor parsing, bounded queries, summary payload.
- `src/app/page.tsx`: load-more controls, diagnostics pane.
- New `src/lib/pagination.ts`, `src/lib/limits.ts` (+ tests).
- `src/app/api/health/route.ts`: worker/queue details.
- Retention job in `src/worker/`.

## Exclusions

No data warehouse, external APM, OpenTelemetry vendor, or real-time analytics UI. No cross-workspace analytics. No hard-delete by default. No pagination of model prompt history beyond the existing token budget.

## Verification

- Unit: cursor encode/decode; stable page boundaries; retention selection; rate-limit windows.
- Live: seed 10k messages; open a thread; confirm first page + load-more; confirm no duplicate/missing rows across inserts; run retention; confirm counts; kill the worker and see stale health; inspect a run's trace/cost.
- Gates: tests (including route tests), typecheck, lint, build.

## Risks and cost

Pagination changes every read path and the client's state handling; do it once, with cursors, not offsets. Retention can destroy data if misconfigured; default to archive + export, and require confirmation. Observability adds write volume; sample/aggregate if needed.

## Dependencies

Spec 16 for retention jobs and queue depth. Pagination can start before the worker.

## Open questions for the user

1. Default page size: 50 or 100? Recommendation: 50.
2. Retention defaults: keep messages forever, archive events after 90 days, runs after 180? Recommendation: messages forever until the user sets a policy; events 90 days; usage 400 days.
3. Is a single-instance in-memory limiter acceptable for v1, or must it be shared across instances? Recommendation: single-instance + documented; move to Postgres/Redis when multi-instance.
4. Which trace backend: in-Postgres tables only, or OpenTelemetry export? Recommendation: Postgres first, export later.

---

> **Renumbered 2026-11-22.** This document belonged to the parallel work line on this machine (its spec 19). On main it is spec **33**; the whole line renumbered 16–27 → 30–41 to continue main's own specs 16–29. Internal subsection letters and cross-references still speak the old numbers.
