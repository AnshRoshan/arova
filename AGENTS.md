# Arova agent operating contract

## Session start (tiered reading)
Always read: `context/overview.md`, `context/workflow-rules.md`, `context/progress-tracker.md`, `memory.md`.
Then just-in-time: the unit's spec before implementing; `context/code-standards.md` before writing code; `context/architecture.md` + `context/library-docs.md` before touching that subsystem; `context/ui-*` only for UI units.
Work on one feature unit at a time. Record while working: progress tracker, decisions, current-issues, and memory.md at session end.

## Project facts
- npm. Next.js 16 App Router, React 19, TypeScript 5.9, Drizzle 0.45 + `pg`, PostgreSQL, Tailwind 4, Zod 4.
- One client shell: `src/app/page.tsx`. Routes: `src/app/api/board/route.ts` (87-line dispatcher), `src/app/api/trigger/route.ts` (bearer-token brief → 202 + queued job), `src/app/api/channels/[token]/route.ts` (inbound channel), `src/app/api/auth/*` (OIDC sign-in), `src/app/api/cron/route.ts` (outside clock), `src/app/api/export/route.ts` (audit export), `src/app/api/health/route.ts`.
- Schema: `src/db/schema.ts`; lazy pool: `src/db/index.ts`; domain logic: `src/lib/*.ts`. Use Drizzle for every query.
- Providers are env-driven, not code: `PROVIDERS` plus `<NAME>_BASE_URL` / `_MODEL` / `_API_KEY` / optional `_MAX_CONTEXT`. Adding a vendor must not require editing the gateway or the UI picker.
- Scheduling is two clocks + one durable queue (spec 30, ported and live-verified 2026-10-25 on the parallel line): the in-process scheduler tick and Run Now **enqueue** durable jobs when a queue worker is live, and execute inline when one is not, so the always-on guarantee never depends on the optional second process. The worker (`npm run worker`) claims jobs with `FOR UPDATE SKIP LOCKED` + a lease, retries with backoff, and dead-letters. Watches run only through the queue: without a worker, checks wait and the UI says so.
- The workspace cookie is a demo identity; real sign-in is OIDC (Feature 15) but the demo cookie still exists. Never describe unconfigured OAuth, sandbox execution or scheduling as working.
- Local Postgres is shared across projects and `app_db` belongs to another app. `DATABASE_URL` must point at a database this project owns; `npm run db:check` proves it (spec 39b). Never `drizzle-kit push --force` an unverified database.
- Never read or commit `.env*` values. Reference variable names only; credentials stay server-side. Trigger tokens are stored as sha-256 digests (spec 40); vault secrets are AES-256-GCM envelopes (spec 31e).
- No demo or sample data in `src/`. Sample content lives in `seed/` and is never imported by the app.

## Invariants
- Validate at the API boundary with Zod. Workspace-scope every read and write.
- Never describe unexecuted work as complete. Unavailable tools, MCP transport, sandbox, OAuth, and background work refuse out loud with a reason.
- Model output renders only through `src/lib/markdown.ts` into React nodes; never `dangerouslySetInnerHTML`.
- Styling lives in tokens in `src/app/globals.css`; `DESIGN.md` is the visual authority; no hardcoded colours in JSX.
- The streaming and unary reply paths must reach the same approval/build decisions.
- Adding a model provider or auth provider is an env edit, never a new branch or UI list.
- Logic-bearing code ships its failing test first (`node --test`, pure modules in `src/lib`).

## Commands
- `npm test` — Node's test runner over `src/lib/*.test.ts`
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — `eslint .`
- `npm run build` — compiles without a live database
- `npm run dev` → `http://localhost:3000`; healthcheck `GET /api/health`
- `npm run db:check` — proves `DATABASE_URL` targets a database this project owns (spec 39b)
- `npm run db:start` — cold-starts Arova's dedicated local Postgres (port 5544); the shared instance on 5432 belongs to other projects and is not ours
- `npm run worker` — the durable-job worker (spec 30); needs `DATABASE_URL`
- `npx drizzle-kit push` — only after `npm run db:check` passes

## Verification before "done"
Run tests, typecheck, and production build; drive the real app for UI or behavior changes. Record what was verified — and the honest boundary of what was not — in `context/progress-tracker.md` and `memory.md`.

## Skills
- project-context-system (source: github.com/AnshRoshan/project-context-system): session start, planning, decision logging, sync and handoff. Follow `context/workflow-rules.md`.
