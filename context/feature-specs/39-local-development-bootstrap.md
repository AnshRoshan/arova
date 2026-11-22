# 25 — Local development bootstrap

**Status: COMPLETE and live-verified 2026-10-25 (D-21/D-25).** 25b/25c implemented and tested; 25a fulfilled by a **dedicated Postgres 18.6 instance** (port 5544, `~/arova-pg/data`, `.env.local` written at the user's delegation — `npm run db:start` cold-starts it); the push sequence, health 200 and empty first visit all verified live. This is the Wave 0 spec: it makes the existing product runnable on this machine before specs 16–24 begin.

## Goal

A fresh developer can get Arova running locally with a database this project owns, pass every gate, create an empty workspace, and verify the real app in a browser without the agent ever reading or creating a secret.

Measurable first-run success:
1. `npm run typecheck`, `npm test`, `npm run lint` and `npm run build` pass.
2. `npx drizzle-kit push` creates exactly Arova's 15 tables in a verified owned database.
3. `GET /api/health` returns 200 `{ok:true}`.
4. Opening `http://localhost:3000` creates one empty workspace and no sample agents.
5. `GET /api/board` returns a workspace with zero agents, messages, routines and runs.
6. The browser console is empty at 1440×900 and 390×844.

## Current machine state (verified 2026-10-20)

- PostgreSQL processes are running and `127.0.0.1:5432` accepts TCP connections.
- PostgreSQL 18 client exists at `C:\Program Files\PostgreSQL\18\bin\psql.exe`; `psql` is not on `PATH`.
- `.env.local` and `.env` do **not** exist in this checkout, and `DATABASE_URL` is absent.
- `npm run dev` starts Next.js, but `GET /api/health` returns 500 because `src/db/index.ts` correctly refuses to query without `DATABASE_URL`.
- `drizzle.config.ts` currently has a hardcoded `postgres:postgres@127.0.0.1:5432/arova_demo` fallback. That fallback is not a valid credential and must not be used for a destructive push.
- This host has shared Postgres databases belonging to other projects, including `app_db`.

## Human-only boundary

The user creates and owns the local database and `.env.local`. The agent must not:
- create, open, copy, or print `.env*` contents;
- guess a superuser password;
- run `drizzle-kit push --force`;
- connect to `app_db` or any unverified database;
- store a credential in `CLAUDE.local.md`, memory, tracker, scripts or chat.

The expected `.env.local` content is one line conceptually:

```dotenv
DATABASE_URL=postgresql://<project-role>:<user-supplied-secret>@127.0.0.1:5432/<project-owned-database>
```

Only variable names are documented here; the user fills the values.

## 25a — Create a project-owned database

A human creates a dedicated role and database, separate from shared `app_db`. Recommended names:
- database: `arova_local`
- role: `arova`
- default schema: `public`

Using the local psql client, from Git Bash:

```bash
"/c/Program Files/PostgreSQL/18/bin/psql.exe" -h 127.0.0.1 -U postgres
```

The human supplies the password in the psql prompt, never in chat. In that session, create the project role/database if absent. This step requires a database administrator decision; the spec deliberately does not embed SQL with credentials.

## 25b — Ownership gate before schema push

Implement `npm run db:check` as a small Node script that connects using `DATABASE_URL` and proves the target is ours **before** push. It must:
1. print `current_database()` and server version;
2. list every public-schema table;
3. classify the database as `empty`, `arova-only`, or `foreign`;
4. exit non-zero for `foreign`.

Expected Arova tables after the existing schema is pushed:
`workspaces`, `teams`, `agents`, `messages`, `routines`, `runs`, `run_steps`, `approvals`, `connections`, `sandboxes`, `events`, `model_usage`, `delegations`, `memories`, `triggers`.

`arova-only` means every existing public table is on that list. `empty` means no public tables. `foreign` means any table outside the list. The script must never run `DROP`, truncate, alter data, or use `--force`.

Commands after the check passes:

```bash
npm run db:check
npx drizzle-kit push
npm run db:check
```

## 25c — Remove the unsafe Drizzle fallback

`drizzle.config.ts` should require `DATABASE_URL` and fail with a named instruction if it is absent, instead of falling back to a guessed localhost credential. Suggested behavior:

```ts
if (!process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL for a database this project owns before running drizzle-kit");
}
```

This prevents the current false sense that `arova_demo` is always available.

## 25d — Local app start

With `.env.local` present:

```bash
npm run dev
curl -s http://localhost:3000/api/health
```

Expected: `{"ok":true}`. Then open `http://localhost:3000`. First visit creates an empty workspace only. The rail should read "Model ready" only if at least one provider key is configured; with only `DATABASE_URL`, chat is local mode and that must be explicit.

If an ambient `OPENAI_API_KEY` exists, start with:

```bash
env -u OPENAI_API_KEY npm run dev
```

so `auto` does not resolve to a broken ambient profile. This is an operator workaround, not product code.

## 25e — Verification sequence

1. Gates: test, typecheck, lint, build.
2. DB: ownership check before and after push.
3. Health endpoint returns 200.
4. Board payload: one workspace, zero agents/messages/routines/runs.
5. Browser desktop and mobile captures through the existing CDP harness or a manual check.
6. Console errors: empty.
7. Horizontal overflow: none.
8. Add one local agent through the UI, send a local-mode message, refresh, confirm the persisted thread and honest provider state.
9. Optional: create one routine and verify it shows a stored `next_run_at`; do not claim execution while the worker spec is unimplemented.

## Acceptance

- A clean checkout plus a user-supplied `DATABASE_URL` reaches a running app in one documented sequence.
- No agent touches `.env*` values.
- Push cannot run against a foreign database.
- Health returns 200 and first visit is empty.
- `context/progress-tracker.md` records exact versions, port, database name, table count and browser result.

## Exclusions

- No Docker setup on this host.
- No cloud database provisioning.
- No model-key setup or provider secret handling by the agent.
- No demo seed by default; `node seed/seed-demo.ts --new` remains an explicit later step only after the seed script has been live-tested.
- No authentication or worker bootstrap yet.
- No migration history yet; `drizzle-kit push` is still the current local schema path until a migration strategy is decided.

## Risks

The main risk is schema push against the wrong shared database. The ownership check and removing the fallback are the controls. The next risk is an ambient env secret outranking local config; document the workaround and check provider state only through the app payload.

## Dependencies

None. This spec precedes specs 16–24 and gives every later feature a safe local target.

## Open questions

1. Should the local database name be `arova_local` or keep `arova_demo`? Recommendation: `arova_local` for a fresh owner, `arova_demo` only if the user confirms that existing database is already owned by this project.
2. Should `npm run setup` orchestrate check → push → typecheck → build? Recommendation: no secret handling; a non-destructive `db:check` plus documented commands is enough first.
3. Do you want the first implementation task to be this local bootstrap spec before spec 16? Recommendation: yes.

---

> **Renumbered 2026-11-22.** This document belonged to the parallel work line on this machine (its spec 25). On main it is spec **39**; the whole line renumbered 16–27 → 30–41 to continue main's own specs 16–29. Internal subsection letters and cross-references still speak the old numbers.
