# Arova

Arova is an agent workspace built with Next.js, PostgreSQL, Drizzle ORM, and Tailwind CSS.

## Run locally

1. Set `DATABASE_URL` in `.env` to a PostgreSQL database.
2. Run `npm install` and `npx drizzle-kit push`.
3. Run `npm run dev` and open `http://localhost:3000`.

The app creates a personal **demo workspace** on first visit, with three sample agents, sample routines, and clearly labeled sample activity. Agent creation/editing/pausing/deletion, persisted chat, natural-language routine proposals, routine creation/toggling/deletion, manual run requests, run cancellation, approval decisions, timezone changes, and audit events are backed by PostgreSQL.

## Model providers (Grok, OpenAI, or any compatible endpoint)

Every provider is the same thing: a server that answers `POST {base}/chat/completions`. Grok/xAI and OpenAI ship as built-ins; anything else is configuration, not code.

```bash
PROVIDERS=dahl
DAHL_BASE_URL=https://inference.dahl.global/v1   # API root, or the full completions URL
DAHL_MODEL=MiniMaxAI/MiniMax-M2.7
DAHL_API_KEY=...                                  # server-side only; never sent to the browser
DAHL_MAX_CONTEXT=32000                            # optional: caps history per request
```

`PROVIDERS` takes space- or comma-separated names; a name's variables use its uppercased form (`ollama-local` → `OLLAMA_LOCAL_*`). Set `DAILY_MODEL_CALLS_LIMIT` for a per-workspace, per-provider, per-day budget (`0` disables; absent is 60).

### Runbook: add an endpoint

1. `cp .env.example .env.local` if you have no `.env.local` yet. Next.js loads `.env.local` automatically and git keeps it out of commits.
2. Open `.env.local` and append the four lines above with your real values.
3. Restart the server — env vars are read at request time, but the running process captured the ones it started with. `npm run dev` picks them up on the next request; a production `npm start` needs a real restart.
4. Open any agent → **Settings** → *Chat model*. The new provider is in the dropdown. If it is missing, `PROVIDERS` does not contain its name (check the spelling and that the prefix matches). If it shows "· not configured", the `<NAME>_API_KEY` is absent or misnamed.
5. Select it, save, and send a message. Reply text should appear gradually, then stick after a page refresh.
6. If the reply instead says the provider is not configured, run `node -e "console.log(Object.keys(process.env).filter(k=>k.includes('_API_KEY')))"` in the same shell you start the app from, and confirm your variable appears.
7. A reply saying "I couldn't get an answer from …" is the saved failure diagnostic, and it quotes the upstream status. `401` means the key; `404` usually means `BASE_URL` already includes `/chat/completions` twice or the path root is wrong; a timeout means the endpoint never answered within `MODEL_TIMEOUT_MS`.

Keys never reach the browser: the board payload carries only `{name, label, model, configured}` per provider — no key, no base URL. Plain `http://` is allowed only for a trusted LAN endpoint; use https anywhere a key would cross a network.

Without any configured provider, chat saves your message and returns an explicit local-mode notice. Routine proposals work with no key at all. The model is never given browser, connector, or computer tools.

This app uses xAI's currently supported Chat Completions endpoint for a shared adapter. xAI recommends its Responses API for new agentic capabilities; migrate before adding native search or code tools.

Project guidance and handoff live in `AGENTS.md`, `memory.md`, and `context/`, scaffolded from [project-context-system](https://github.com/AnshRoshan/project-context-system).

## Agent capabilities

Each agent has a **Capabilities** tab in its settings: which tools it holds, its permission mode, which teammates it may consult or hand off to, its effort and output budget, and any MCP servers it is configured with.

The tool list is a registry, not a wish list. Four tools genuinely run today — consult a teammate, hand off, propose a routine, request approval. Ten more are listed and greyed out with the reason they cannot run (no sandbox, no OAuth, no network policy), and **granting one of those to an agent cannot make it exist**. Removing a capability also removes it from the routing decision the model is shown, so an agent that lost `handoff` cannot hand off even when you tell it to.

`permissionMode: plan` lets an agent advise and delegate but refuses its write actions with a message naming the switch to change. MCP servers are stored and displayed honestly as "no transport wired" until a client exists.

## Teams and delegation

Ask an agent to build a team — "create a product agency for a fitness app" — and it proposes a roster of 2-4 named specialists. **Nothing is created until you press Create team.** The roster comes from the configured model, or from a built-in set of team shapes when no key is configured, and name clashes with existing agents are resolved by renaming rather than dropping.

Once agents share a team, the one answering you can consult a teammate. A separate routing pass decides, before the answer is written, whether a teammate's specialism beats the asker's own; if you name a teammate, that request wins. When it consults, you see a "Meridian consulted Scout" card with the exact question asked and the teammate's full answer, and the reply is recorded in `delegations`.

A consulted answer costs three model calls — routing, the peer, then the integrating answer — so `MAX_DELEGATIONS` caps hops (default 1, `0` turns delegation off). Every call counts against the daily budget.

Delegation is model-to-model. It is not a connector: no agent here can read your inbox, open a browser, or write to another system.

## Infrastructure boundaries

- **Authentication:** The demo uses a random, HTTP-only workspace cookie for separation. This is **not production authentication**. Add Google/GitHub OAuth, authenticated user-to-workspace membership, CSRF protection, and session rotation before a public deployment.
- **Tools:** The catalog is present, but OAuth providers are not configured. Connect buttons fail safely and do not pretend to connect accounts.
- **Scheduling:** Routines execute. A due routine runs the next time the workspace is opened — there is no background daemon in this deployment, so a routine that fell due while the machine was off fires once on the next open and is marked late. Each execution creates a real run with steps and posts the answer into that agent's thread, under the same daily model-call budget as chat.
- **Runs:** Run Now and the scheduler both execute the agent and record the outcome. A run still cannot touch anything outside the workspace, because no browser, files or connectors exist here. Existing sample runs are labeled as sample activity.
- **Computer:** `SandboxProvider` is defined in `src/lib/sandbox.ts`. The default `UnconfiguredSandboxProvider` deliberately rejects start and execute requests. It does not execute host commands or pretend to provide a browser. Integrate an isolated Docker/Playwright or hosted provider through this contract before enabling it.
- **Approvals:** The initial request is sample data. Resolving it records a decision only; it does not trigger an external write.

## Operational checklist before production

Add authenticated OAuth accounts, durable scheduler/worker, provider-specific connector adapters, sandbox isolation, encrypted secrets, action-level policy enforcement, usage quotas, provider contract tests, observability, backups, and deployment-specific security controls. Do not expose this demo directly as a multi-tenant public SaaS.
