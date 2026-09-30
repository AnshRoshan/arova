# Arova agent operating contract
Read context/overview.md, context/workflow-rules.md, context/progress-tracker.md and memory.md first. Then read the relevant feature spec, architecture, decisions, code standards and UI files only when that subsystem is touched.

## Project facts
- npm; Next.js App Router, React, Drizzle ORM, PostgreSQL and Tailwind.
- Database schema: src/db/schema.ts; API: src/app/api/board/route.ts; model routing: src/lib/model-gateway.ts. Use Drizzle for queries.
- Providers are env-driven, not code: `PROVIDERS` plus `<NAME>_BASE_URL`/`_MODEL`/`_API_KEY`. Adding a vendor must not require editing the gateway or the UI picker.
- Commands: `npm test` (node --test over src/lib), `npx next typegen`, `npm exec tsc -- --noEmit`, `npm run build`, `npx drizzle-kit push` after environment bootstrap.
- The local Postgres on this host is shared across many projects and `app_db` belongs to another app; `DATABASE_URL` must point at a database this project owns. Never `drizzle-kit push --force` a database you did not verify is yours.
- Never read or commit .env files. Credentials remain server-side.
- This is a demo workspace using a cookie, **not production authentication**. Never describe unconfigured OAuth, scheduling or sandbox execution as working.

## Skills
- project-context-system (source: github.com/AnshRoshan/project-context-system): session start, planning, decision logging, sync and handoff. Follow context/workflow-rules.md.

## Verification
Check type generation, TypeScript and production build, then run the app healthcheck. Record what was verified in progress-tracker.md and memory.md.
