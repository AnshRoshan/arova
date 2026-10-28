# Feature 18 — Agent registry

## The problem

A governance buyer asks a simple set of questions: who exists, who owns them, what can they do, what
did they last do, and what is waiting on a human? Arova had the rows but no read model. Microsoft sells
Agent 365 at $15/user/mo as an observe/govern/secure layer over agents it did not build; the demand for
this view is already priced by someone else.

The registry is a **read model**, not a new source of truth. It does not score agents, invent health or
copy the board's 60-row window.

## Data model

No new table. The registry is assembled from `agents`, `teams`, `runs`, `approvals` and `routines` with
exact SQL aggregates:

- last run time and status per agent (`max(started_at)` + `array_agg(status order by started_at desc)[1]`),
- run count,
- pending approval count,
- enabled routine count.

`buildRegistry(agents, teams, stats)` is pure and testable; `searchRegistry(rows, query)` filters over
name, role, team, status and provider.

## UI

Settings → Agent registry: a filter, `n of m` seats, and one row per seat with team/manager, provider,
tool count, permission mode, last run/status, run/routine counts, active/paused and pending approvals.
A pending approval is described as a human decision, not a failure.

## Constraints that survive

- Counts are exact aggregates, not the board window.
- A seat with no run says "no run recorded", not a fabricated time.
- No health score and no colour beyond the existing active/paused and waiting tones.
- The registry is a view over data the workspace already exposes to its members; it adds no secret.

## Out of scope (recorded, not implied)

RBAC admin, SSO directory sync, retention/export, agent identity credentials, policy evaluation,
per-agent spend attribution (model usage is per workspace/provider today), cross-workspace registry.

## Verification (2026-10-28)

- `src/lib/registry.test.ts` 4/4: exact stats, missing stats as zero/null, sort order, search fields.
- Live: the board's registry showed Scout (1 run, last FAILED, 0 pending, 0 routines), Ada (1 run,
  last FAILED) and Bo (0 runs); team names resolved; the counts matched the `runs` rows created by the
  eval and inbound tests.
- UI: Settings → Agent registry rendered the filter, counts and rows; no console errors in the live
  snapshot.
