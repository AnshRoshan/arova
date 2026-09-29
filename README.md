# Arova

Arova is an agent workspace built with Next.js, PostgreSQL, Drizzle ORM, and Tailwind CSS.

## Run locally

1. Set `DATABASE_URL` in `.env` to a PostgreSQL database.
2. Run `npm install` and `npx drizzle-kit push`.
3. Run `npm run dev` and open `http://localhost:3000`.

The app creates a personal **demo workspace** on first visit, with three sample agents, sample routines, and clearly labeled sample activity. Agent creation/editing/pausing/deletion, persisted chat, natural-language routine proposals, routine creation/toggling/deletion, manual run requests, run cancellation, approval decisions, timezone changes, and audit events are backed by PostgreSQL.

Set `OPENAI_API_KEY` to enable model-generated replies for ordinary chat. `FAST_MODEL` optionally selects the model (default `gpt-4o-mini`). Without a key, chat uses an explicit local fallback; it does not claim to have researched or executed a task.

## Infrastructure boundaries

- **Authentication:** The demo uses a random, HTTP-only workspace cookie for separation. This is **not production authentication**. Add Google/GitHub OAuth, authenticated user-to-workspace membership, CSRF protection, and session rotation before a public deployment.
- **Tools:** The catalog is present, but OAuth providers are not configured. Connect buttons fail safely and do not pretend to connect accounts.
- **Scheduling:** Routine definitions persist. A scheduler/worker is not included in this preview; automatic recurring execution is not active.
- **Runs:** Run Now records an idempotent, auditable request in `WAITING_FOR_TOOL` rather than claiming an external action completed. Existing sample runs are labeled as sample activity.
- **Computer:** `SandboxProvider` is defined in `src/lib/sandbox.ts`. The default `UnconfiguredSandboxProvider` deliberately rejects start and execute requests. It does not execute host commands or pretend to provide a browser. Integrate an isolated Docker/Playwright or hosted provider through this contract before enabling it.
- **Approvals:** The initial request is sample data. Resolving it records a decision only; it does not trigger an external write.

## Operational checklist before production

Add authenticated OAuth accounts, durable scheduler/worker, provider-specific connector adapters, sandbox isolation, encrypted secrets, action-level policy enforcement, usage quotas, provider contract tests, observability, backups, and deployment-specific security controls. Do not expose this demo directly as a multi-tenant public SaaS.
