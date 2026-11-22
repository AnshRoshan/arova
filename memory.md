# Session handoff

## Local database — the environment is live (2026-10-25, D-25)

Arova has its **own dedicated Postgres 18.6 instance**: data at `~/arova-pg/data`, user `arova`, port **5544**, bound to 127.0.0.1 only, started with `npm run db:start`. `.env.local` exists with its `DATABASE_URL` (written by script at the user's delegation; the password never entered chat). The shared instance on 5432 is other projects' and has an unknown password — never target it. Another app holds 127.0.0.1:5433, so 5544 was chosen. Schema is pushed: **19 tables**, `db:check` says AROVA-ONLY. To work with the app: `npm run db:start` → `npm run dev` (+ `env -u OPENAI_API_KEY` if an ambient key exists) → `npm run worker`. No model provider key is configured, so all model calls take their honest failure paths; local-mode chat works.

## Current state (2026-10-25, end of session)

Current state (2026-10-26): **repository on `main` with uncommitted work; Features 01–14 built; 15 foundation-only; the roadmap is rolling (D-22 → D-30): 25 and 16 complete and live-verified; 26 slice 1 live-verified; 17 core complete and live-verified (gateway, tool loop, MCP transport with approval-paused writes, credential vault, UI surfaces); 19 first slice live-verified (bounded board with SQL-count integrity, keyset cursor pagination + page endpoint, client load-more, four composite indexes pushed, single-instance rate limits, opt-in retention sweep); 20 slice 1 live-verified (hybrid keyword+trigram retrieval on pg_trgm with a calibrated 0.2 threshold — the zero-lexical-overlap probe retrieved the right note; temporal validity excluded by query and selector, proven live both directions; pg_trgm installed); 21 Slack-first slice live-verified — the signed webhook (all six rules via scripts/slack-gateway-smoke.mjs), event-id idempotency, allow-list identity, sealed connection credentials, the worker's speak-once thread report, and the Integrations Channels tab, typecheck/lint/build green.** Live-verification harness: `npm run mock-model` + `npm run mock-mcp` (scripted servers; provider `mock`, MCP server `ops` on the Sage seat, `TOOL_ALLOWED_HOSTS=example.com`, `CREDENTIAL_ENCRYPTION_KEY` set — all in `.env.local`; the dev workspace also holds 225 seeded messages used for the pagination verification). The user approved the full roadmap sequence and answered the stack question: **keep Next.js** (no Vite). Issues 01/02/03/13/17 resolved live; 18 (dead tables) and 19 (orphans) still open.

Market position (proposed, D-19/D-20): Arova is the **accountable agent organisation** — self-hosted, model-agnostic, org-native. Pass 3's headline: **CopilotKit Soar (Oct 22) is the first direct open-source competitor of the same shape** (self-hosted coworkers, any model, Slack/Teams, powered by OpenBot) — specs 18 (auth) and 21 (channels) matter more now. The category consolidated around one durable agent per person (Google's single Gemini agent with per-agent account + spend cap; Anthropic killed Cowork's local mode; Zapier dissolved Agents); Devin shipped shared-skill proposals pending admin approval, validating spec 27.

Environment boundary: this checkout has **no `.env`/`.env.local` and no `DATABASE_URL`**, so `GET /api/health` returns 500 `{ok:false}`. Nothing can be verified against a live database until the user supplies the URL. Do not create or edit `.env*` files on their behalf.

## What the app is

Arova is a single-user agent workspace: a Graphite four-column shell (icon rail, section panel, work surface, activity board), cookie-scoped demo workspaces, env-driven OpenAI-compatible providers, persisted agent threads with streaming, teams and one-hop delegation, organisations with a durable channel, org-scoped keyword memory, routines that execute on workspace read, inbound trigger tokens, approvals with a denial breaker, provenance, fatigue handling and per-day model-call accounting. Read `context/overview.md` and `context/architecture.md` first; `context/build-plan.md` has the 26-spec status table plus the 2026-10-25 audit note.

## The one next step

**The next implementation unit: spec 22 (goals/watches/attention inbox — always-on value without a computer, riding the durable queue). Then 23 (skills), 27 (self-modification; needs its four open questions answered), 18 (auth — needs the human's Google OAuth client). Deferred: 17 (per-tool MCP allow-lists, SSE sessions, Record-stream rendering — D-27), 19 (per-thread client cursors, route tests, diagnostics pane, archive/export — D-28), 20 (scopes, worker capture, eval fixtures — D-29), 21 (email adapter pending provider choice, Slack approval buttons, member identity join — D-30). Still owed: a browser pass at 1440×900/390×844 over the new UI. Documentation is uncommitted; do not commit or push without explicit approval.**

## Deep research artifacts (all proposed, none implemented)

- `context/market-comparison.md` — main product review, matrix, §8.1 pass-3 refresh summary.
- `context/market-deep-dives/01`–`06` — the 2026-10-20 clusters.
- `context/market-deep-dives/07-october-refresh-2026-10-25.md` — pass 3: all 15 tracked products' October news + previously-uncovered competitors (Soar, Kortix, Sim, Dify, Coze, coding-agent patterns, memory/sandbox/MCP/protocol primitives).
- specs 16–27 under `context/feature-specs/` (27 new; 16/20/26 amended 2026-10-25).

## Open questions for the user

1. **Positioning (D-19/D-20)**: approve the accountable-organisation direction, or choose full agent-computer parity or personal-assistant direction instead?
2. **First wave**: approve spec 25 local bootstrap, then 16, 26, 17 and 18 in order? Recommendation: yes.
3. **Database name**: `arova_local` (recommended) or confirm an existing `arova_demo` database is safe/owned before schema push?
4. **Run Now**: spec 16 makes it real. Confirm Postgres queue, not Redis/BullMQ, and default worker concurrency 1 per workspace.
5. **Trust controls**: spec 26 should land with worker/tool plane. Approve hard budgets, descendant kill, artifacts and single-use expiring approvals?
6. **Auth model**: one workspace with members (D-17), first person becomes owner. Confirm before spec 18.
7. **Google sign-in credentials**: create the OAuth client and put `AUTH_PROVIDERS=google`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` in `.env.local`; secrets never enter chat.
8. Existing questions remain open: reasoning-in-content (L-04), Nexus Labs org (L-12), and commit hygiene (`.github/`, `LICENSE`, vendored `project-context-system/`, `.pptx`, `vibe_images/`).

## Verified state (recorded)

- `npm test` → 153/153, Node 24.18. Warning: module type not specified in `package.json`; harmless, noisy.
- `npm run typecheck` → clean. `npm run lint` → clean.
- `npm run build` → success (Next 16.2.6, compiled 7.6s, all four routes).
- `GET /api/health` → **500** because no `DATABASE_URL` exists in this environment; the server itself starts. Not a code failure, and not a pass.
- Test coverage is pure `src/lib` logic only. Routes and the client are verified by driving the app, not unit tests.

## Operational notes that still hold

- Local DB is `arova_demo` on a shared Postgres; `app_db` belongs to another project. Never `drizzle-kit push` there. `drizzle.config.ts` reads `process.env.DATABASE_URL`.
- Never read or commit `.env*` values; `.env.example` is the readable template. Verify env through the app's board payload, not by opening the file.
- Start dev with `env -u OPENAI_API_KEY npm run dev` if an ambient `OPENAI_API_KEY` would outrank `.env.local` and make `auto` resolve to a broken OpenAI profile.
- A running Next dev server can serve stale bundles. When the DOM contradicts the source: read `.next/dev/lock` for the pid, `taskkill /PID x /F`, restart, re-check. Next 16 refuses a second dev server in the same directory.
- Browser verification uses `.impeccable/cdp-harness.cjs` and `.impeccable/cdp-channel.cjs`; both delete outputs at start, so a stale frame cannot pass as fresh evidence.
- Shell quoting destroys backslashes and nested quotes in `node -e`; write a temp `.cjs` for anything with regexes or tag literals, then delete it.
- `seed/seed-demo.ts` still has never been executed against a live database. Do not call the seeded path verified.
- The dahl endpoint returns byte-identical replies for a repeated prompt; use a different prompt for a fresh streaming test.

## Known open issues

See `context/current-issues.md` (gitignored). Current: Run Now stub, no `missed` status, tick only on GET, `MODEL_MAX_TOKENS` naming/semantics, reasoning-in-content, Nexus Labs org, unexecuted seed, Feature 15 blocked on credentials, no pagination, no auth/CSRF/rate limits for public deployment, no route/UI tests.
