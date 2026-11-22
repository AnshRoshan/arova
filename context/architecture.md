# Architecture

## Stack and versions

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 App Router | Node 24 in CI, Node ≥ 22.18 locally (tests use native TS stripping) |
| UI | React 19 + Tailwind 4 + `globals.css` | one client component `Workbench`; fonts via `next/font` |
| Language | TypeScript 5.9 | `allowImportingTsExtensions` is test-only; app imports stay extensionless |
| Data | PostgreSQL + Drizzle 0.45 + `pg` | schema in `src/db/schema.ts`, lazy pool in `src/db/index.ts` |
| Validation | Zod 4 | every action body is parsed at the route boundary |
| Models | OpenAI-compatible Chat Completions | `src/lib/model-gateway.ts`; one adapter for every vendor |
| Icons | `lucide-react` | no other UI dependency |

## Module map

**Server routes**
- `src/app/api/board/route.ts` — the whole product API. `GET` resolves/creates the cookie workspace, returns the serialized board, and schedules `tickSchedules()` with `after()`. `POST` is one Zod-validated action dispatcher: agents, messages (unary or SSE), org briefs (SSE), teams, orgs, routines, runs, approvals, memory, triggers, tools, sandbox actions, workspace settings. Board serialization is the single read model.
- `src/app/api/trigger/route.ts` — per-org bearer token, `{"text"}`, 60s cooldown, runs the same `runBrief` inline. `GET` reports token status; tokens are write-only and revocable.
- `src/app/api/health/route.ts` — `select 1`; 200 `{ok:true}` or 500.

**Domain libraries (`src/lib/`, pure where possible, all unit-tested)**
- `model-gateway.ts` — provider profiles from env, secret-free profiles for the browser, history trimming by context window, unary retry on 429/5xx/network, SSE parsing, usage extraction, stream timeout. Keys are read only by `apiKeyFor()`.
- `orchestration.ts` — intent/routing/roster prompts and parsers, `cleanConsult`, decollision.
- `channel.ts` — lead resolution, hermetic peers, founder/staff gates, denial breaker, budget/no-report stop rows, post summaries.
- `org.ts` — chart normalization (above-only `reportsTo`, cycles impossible), tree/report helpers, 10-seat template.
- `memory.ts` — scoring, selection (≤3 notes / 900 chars), prompt block rendering, provenance.
- `scheduler.ts` — schedule parsing, timezone/DST-aware `nextRunAt`, due checks, `missedIntervalMs`, human schedule text.
- `fatigue.ts` — failure-streak policy for routines.
- `provenance.ts` — the standing name-source / mark-own-knowledge sentence appended after seat instructions.
- `tools.ts` — 15-tool registry (6 live, 9 refused with reasons), capability normalization, `tokenBudgetFor`.
- `skills.ts` — prompt-level skills, 6 live and 4 listed unavailable.
- `markdown.ts` — block/inline parser, fenced code, http(s)-only links, reasoning split.
- `identity.ts` — three measured agent tints; contrast/hue-separation tests.
- `sandbox.ts` — intentionally unconfigured contract; refuses start/execute.
- `auth-providers.ts` — env-driven OIDC diagnostics only; no login flow exists.

**Client** — `src/app/page.tsx` holds `Workbench` (shell, threads, channel, org manager, panels, dialogs, SSE readers). It talks only to `/api/board` and `/api/trigger`. `src/app/layout.tsx` loads fonts and the design contract; `src/app/globals.css` is the single stylesheet.

## Data flow

1. Browser loads `/api/board` → cookie workspace resolved (created empty on first visit) → board payload (`agents`, `teams`, `messages`, `routines`, `runs`, `delegations`, `memories`, `triggers`, `approvals`, `connections`, `events`, `usage`, `profiles`, `limits`, `auth`) → client renders.
2. A mutation is a `POST /api/board` action; server validates, scopes to the workspace, writes, audits where relevant, returns a fresh board. Streaming actions use SSE (`start`/`delta`/`consult`/`post`/`end`) and persist exactly one assistant row per exchange.
3. Model calls go through the gateway. A consulted answer is routing + peer + integration (three counted calls). Usage is recorded per workspace/provider/UTC day against `DAILY_MODEL_CALLS_LIMIT`; the router is counted too.
4. Due routines are claimed atomically on board `GET`, executed inside the request via `after()`, and write a `runs` row, steps, and a thread message.
5. External triggers call `POST /api/trigger`, which runs the same brief path with initiator `trigger`.

## Database (15 tables, `src/db/schema.ts`)

`workspaces` · `teams` (unique workspace+name) · `agents` (team/manager self-FK, provider, capabilities jsonb, soft delete) · `messages` (agent XOR team, enforced by check) · `routines` (`next_run_at`, `fail_streak`) · `runs` (initiator, idempotency key) · `run_steps` · `approvals` · `connections` · `sandboxes` · `events` · `model_usage` (unique workspace+provider+day, `estimated`) · `delegations` · `memories` (team-scoped, GIN full-text index) · `triggers` (unique token).

## Invariants

- **No fabricated execution.** A tool that cannot run is refused; a run with no runtime waits visibly; a partial stream is labelled incomplete; provider failure is a persisted diagnostic.
- **One subject per message row.** `messages.agent_id` XOR `messages.team_id`.
- **Workspace scoping.** Every query filters by workspace; a cross-workspace id is a not-found.
- **Secrets stay server-side.** Provider keys never enter a profile object, board JSON, logs or client props.
- **Two reply paths, one policy.** Streaming and unary reach the same approval, plan-mode and handoff decisions.
- **Derived numbers have a source.** Overview totals and board rows are assembled from stored rows; estimates are labelled; sample rows are excluded from real-work counts.
- **UI has no direct DB access.** Components do not import Drizzle; server logic does not render UI.

## Auth and security boundary

The `arova_workspace` cookie is a random UUID, httpOnly/lax/secure-in-production, one year. There is no signature, login, session rotation, membership or CSRF token. `/api/trigger` uses a scoped bearer token. Public deployment requires real auth, CSRF, rate limits and secret management — none of them are implemented.

## Testing

`npm test` runs `node --test` over `src/lib/*.test.ts` (153 tests as of 2026-10-20). Tests cover pure domain rules: parsing, scheduling, org charts, memory selection, capabilities, identity contrast, fatigue, gateway helpers. Routes and the client are verified by driving the app, not by unit tests; that gap is recorded in `current-issues.md`.
