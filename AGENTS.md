# Arova agent operating contract

## Session start (tiered reading)
Always read: `context/overview.md`, `context/workflow-rules.md`, `context/progress-tracker.md`, `memory.md`.
Then just-in-time: the unit's spec before implementing; `context/code-standards.md` before writing code; `context/architecture.md` + `context/library-docs.md` before touching that subsystem; `context/ui-*` only for UI units; `context/decisions.md` before repeating a decision.
Work on one feature unit at a time. Record while working: progress tracker, decisions, current-issues, and memory.md at session end.

## Project facts
- npm. Next.js 16 App Router, React 19, TypeScript 5.9, Drizzle 0.45 + `pg`, PostgreSQL, Tailwind 4, Zod 4.
- One client shell: `src/app/page.tsx`. Routes: `src/app/api/board/route.ts` (board + all actions + SSE), `src/app/api/trigger/route.ts` (bearer-token brief), `src/app/api/health/route.ts`.
- Schema: `src/db/schema.ts`; lazy pool: `src/db/index.ts`; domain logic: `src/lib/*.ts`. Use Drizzle for every query.
- Providers are env-driven, not code: `PROVIDERS` plus `<NAME>_BASE_URL` / `_MODEL` / `_API_KEY` / optional `_MAX_CONTEXT`. Adding a vendor must not require editing the gateway or the UI picker.
- Scheduling is queue-backed (spec 16, live-verified 2026-10-25): the board tick and Run Now only **enqueue** durable jobs; the worker (`npm run worker`) claims them with `FOR UPDATE SKIP LOCKED` + a lease and executes. Without a running worker, jobs wait and the UI says so. `POST /api/trigger` returns 202 with a queued job.
- The workspace cookie is a demo identity, **not authentication**. Sign-in is env diagnostics only (Feature 15 foundation); OAuth is not implemented.
- Local Postgres is shared across projects and `app_db` belongs to another app. `DATABASE_URL` must point at a database this project owns; never `drizzle-kit push --force` an unverified database.
- Never read or commit `.env*` values. Reference variable names only; credentials stay server-side.
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
- `npm run db:check` — proves `DATABASE_URL` targets a database this project owns (spec 25)
- `npm run db:start` — cold-starts Arova's dedicated local Postgres (port 5544, `~/arova-pg/data`); the shared instance on 5432 belongs to other projects and is not ours
- `npm run worker` — the durable-job worker (spec 16); needs `DATABASE_URL`
- `npx drizzle-kit push` — only after `npm run db:check` passes

## Verification before "done"
Run tests, typecheck, lint, and production build. Drive the real app for UI or behavior changes. Record what was verified — and the honest boundary of what was not — in `context/progress-tracker.md` and `memory.md`.

## Skills
- project-context-system (source: github.com/AnshRoshan/project-context-system): session start, planning, decision logging, sync and handoff. Follow `context/workflow-rules.md`.
