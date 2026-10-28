# Arova

Arova is an agent workspace built with Next.js, PostgreSQL, Drizzle ORM, and Tailwind CSS.

## Run locally

1. Copy `.env.example` to `.env.local` and set `DATABASE_URL` to a PostgreSQL database this project owns.
2. Run `npm install` and `npx drizzle-kit push`.
3. Run `npm run dev` and open `http://localhost:3000`.

First visit creates an empty personal workspace. You add the first agent yourself, and every number on the overview is then something you did. Agent creation/editing/pausing/deletion, persisted chat, natural-language routine proposals, routine creation/toggling/deletion, manual run requests, run cancellation, approval decisions, timezone changes, and audit events are backed by PostgreSQL.

## Running 24/7

Routines fire while something is awake: the built-in worker (on by default, `SCHEDULER_WORKER=off` to disable) or an outside clock calling `POST /api/cron` with `Authorization: Bearer $CRON_SECRET`. Docker Compose, systemd and GitHub Actions files live in `deploy/` and `.github/workflows/`; the full guide is [docs/ALWAYS-ON.md](docs/ALWAYS-ON.md).

## Sample content (optional, and never automatic)

A demo, a screenshot session or a walkthrough may want three agents and some history. That content lives in `seed/fixtures.json` and is inserted by a script the app never imports:

```bash
DATABASE_URL=... node seed/seed-demo.ts            # fills the most recent workspace
DATABASE_URL=... node seed/seed-demo.ts --new      # creates "Demo workspace" and fills it
DATABASE_URL=... node seed/seed-demo.ts --list     # show workspaces and their ids
```

It refuses to seed a workspace that already has agents unless you pass `--force`. Seeded runs are labelled as sample activity and are excluded from the overview counters, so a seeded workspace still reports honest numbers about real work.

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

The tool list is a registry, not a wish list. Eleven tools genuinely run today: the delegation and workspace tools (consult a teammate, hand off, propose a routine, request approval, propose an organisation, record org memory), four local tools (calculator, world clock, JSON transform, checksum), and one public `https` fetch behind an SSRF policy. Eight more are listed and greyed out with the reason they cannot run (no sandbox, no OAuth, no search provider, no MCP transport), and **granting one of those to an agent cannot make it exist**. Removing a capability also removes it from the routing decision the model is shown, so an agent that lost `handoff` cannot hand off even when you tell it to. With **Tool loop** off (the default), the model raises no tool calls: the local tools and fetch run when a person presses Run in Integrations → Local tools. With it on, the model may call the granted read-only tools itself — see below.

`permissionMode: plan` lets an agent advise and delegate but refuses its write actions with a message naming the switch to change. MCP servers are stored and displayed honestly as "no transport wired" until a client exists.

## Teams and delegation

Ask an agent to build a team — "create a product agency for a fitness app" — and it proposes a roster of 2-4 named specialists. **Nothing is created until you press Create team.** The roster comes from the configured model, or from a built-in set of team shapes when no key is configured, and name clashes with existing agents are resolved by renaming rather than dropping.

Once agents share a team, the one answering you can consult a teammate. A separate routing pass decides, before the answer is written, whether a teammate's specialism beats the asker's own; if you name a teammate, that request wins. When it consults, you see a "Meridian consulted Scout" card with the exact question asked and the teammate's full answer, and the reply is recorded in `delegations`.

A consulted answer costs three model calls — routing, the peer, then the integrating answer — so `MAX_DELEGATIONS` caps hops (default 1, `0` turns delegation off). Every call counts against the daily budget.

Delegation is model-to-model. It is not a connector: no agent here can read your inbox, open a browser, or write to another system.

## Channels

A finished routine or org brief, and a pending approval, can be posted to a **Slack incoming webhook** or any `https` endpoint. Configure one in **Integrations → Channels**. The target URL is a credential: it is stored server-side and the board only shows its host. Every attempt is recorded in the delivery ledger; a failed post is shown as `FAILED`, never as delivered.

A channel attached to an organisation also accepts inbound work at its token URL (`POST /api/channels/<token>` with `{"text":"…"}` or a form field named `text`). The ask runs the same brief the browser runs, with a 60-second cooldown. A workspace-wide channel is outbound only. Delivery is retried on network errors and 5xx (two attempts by default); a 4xx is a refusal and is not repeated. Native Slack Events/Teams/Telegram/email adapters are not built yet; the generic contract is.

## Local OS sandbox (opt-in)

Set **`AROVA_SANDBOX_PROVIDER=local-os`** and install `@anthropic-ai/sandbox-runtime` (already a dependency) to turn on a shell/files execution tier on the server host. It uses Anthropic's sandbox runtime: macOS Seatbelt, Linux/WSL2 `bubblewrap`, or a dedicated Windows user + WFP filters. There is no Docker, image or VM.

- **Integrations → Sandbox** is the console. It shows the provider's capabilities, runs one command at a time as a selected seat, and stores every attempt as a real run + step + audit event. It refuses with the exact reason instead of pretending. Output is capped at 20,000 characters; the workspace state and recent sandbox runs are listed; Reset deletes only the per-agent workspace (runs/audit stay).
- **Capabilities:** `pty` and a persistent per-agent workspace; **no** graphical desktop, browser stream, snapshot, resume or takeover.
- **Policy:** filesystem writes only to the agent workspace; `.env`, `.env.local`, `~/.ssh`, cloud credential paths denied; network starts with an empty allowlist (`AROVA_SANDBOX_ALLOWED_DOMAINS`).
- **Windows:** run `npx srt windows-install` once (UAC; creates a local `srt-sandbox` user and WFP filters). On a shared machine use `--skip-profile-grant`.
- **Security:** this shares the host kernel. It is not a multi-tenant boundary and the model cannot toggle it. Unset the env var to disable it.

## Tool loop and search

Each agent has a **Tool loop** toggle in **Capabilities**. When on, the model may call the read-only tools it already holds — calculator, world clock, JSON transform, checksum, `web_fetch`, and `web_search` when a search provider is configured. It cannot call a shell, browser, connector or write tool, and every call is bounded (4 steps), counted and audited as `tool.called`.

The answer arrives **after the loop finishes, not token-by-token**; the composer says so. The stored reply carries `toolsUsed` and numbered `sources`, and the thread renders a Sources line with real links.

Search is configuration, not code:

```bash
# SearXNG (JSON API) or any endpoint returning {results:[{title,url,snippet|content}]}
SEARCH_PROVIDER=searxng
SEARCH_BASE_URL=http://localhost:8888
# Brave
SEARCH_PROVIDER=brave
SEARCH_API_KEY=...
# Local endpoints need this; they are refused otherwise.
SEARCH_ALLOW_LOCAL=1
```

`web_search` is offered only when the provider is configured and the seat also holds `web_fetch`. No provider means no search tool, not a fabricated answer.

## Evals

**Automations → Evals** stores one task (seat + prompt + expected fragment) and scores an answer by case-insensitive substring. It is deliberately **not** an LLM judge: one call, one replayable check, no second opinion. A run with no configured provider or no daily budget is stored as `SKIPPED`, never as a pass. Each attempt is also a real run in the audit, so it appears in Runs and on the activity board. The harness measures one prompt at a time; it is not a benchmark suite.

## Agent registry

**Settings → Agent registry** lists every seat with team and manager, provider, tool count, permission mode, last run and status, exact run and routine counts, and pending approvals. The counts are SQL aggregates, not the board's 60-row window; the view does not invent a health score. It is read-only, and it adds no data beyond what the workspace already exposes to its members.

**Export audit JSON** downloads runs, steps, events, approvals, delegations, memory, channel status and sandbox status for this workspace. It deliberately excludes message bodies, channel target URLs/tokens, model keys, session tokens and agent instructions; the file is capped at 5,000 rows per table.

## Infrastructure boundaries

- **Authentication:** The demo uses a random, HTTP-only workspace cookie for separation. This is **not production authentication**. Add Google/GitHub OAuth, authenticated user-to-workspace membership, CSRF protection, and session rotation before a public deployment.
- **Tools:** The catalog is present, but OAuth providers are not configured. Connect buttons fail safely and do not pretend to connect accounts. The local tools and `web_fetch` are real; the model does not call them on its own.
- **Channels:** A webhook target is a credential and is stored server-side. Delivery is best-effort with an 8 s timeout and a ledger row per attempt; a channel failure does not change the run's status. Inbound tokens are per channel and revocable by deleting the channel.
- **Evals:** The scorer is a substring check, not a model judge. `SKIPPED` and `ERROR` are stored states and do not count as passes.
- **Registry:** Read-only view over existing rows with exact SQL aggregates. No health score and no new write path.
- **Scheduling:** Routines execute, and now on their own. A worker started with the server (`src/instrumentation.ts`) claims due routines every 30 s, and `/api/cron` lets any outside clock do the same. Each execution creates a real run with steps and posts the answer into that agent's thread, under the same daily model-call budget as chat. **Run now** executes immediately. The Automations → 24/7 control room shows live whether a worker or an outside clock is really ticking; if the server is off, nothing fires and the app says so. See [docs/ALWAYS-ON.md](docs/ALWAYS-ON.md).
- **Runs:** Run Now and the scheduler both execute the agent and record the outcome. A run still cannot touch anything outside the workspace, because no browser, files or connectors exist here. Runs inserted by the seed script are labelled as sample activity and excluded from the overview counters.
- **Computer:** `SandboxProvider` is defined in `src/lib/sandbox.ts`. The default `UnconfiguredSandboxProvider` rejects start and execute requests. The opt-in `LocalOsSandboxProvider` wraps shell commands with `@anthropic-ai/sandbox-runtime` and reports `graphical:false`; `browser()`/`stream()` refuse. A Docker/Playwright or hosted desktop provider remains the path to a GUI, stream, snapshot and takeover.
- **Search and citations:** Search exists only when `SEARCH_PROVIDER`/`SEARCH_BASE_URL` (and a Brave key) are configured. The model can call it only with **Tool loop** on and `web_fetch` granted; the reply's Sources line names the URLs it actually used. Without a provider, `web_search` stays unavailable and no reply claims a source it did not fetch.
- **Approvals:** A fresh workspace has no pending approvals; one exists only if you seeded sample content. Resolving an approval records a decision; it does not trigger an external write.

## Operational checklist before production

Add authenticated OAuth accounts, provider-specific connector adapters, sandbox isolation, encrypted secrets, action-level policy enforcement, usage quotas, provider contract tests, observability, backups, and deployment-specific security controls. Also: encrypt channel targets at rest or keep them in a secret manager, verify inbound channel tokens at the edge, and treat the eval harness as a smoke test, not a benchmark. (The durable scheduler/worker shipped 2026-10-01; hosting guidance is in docs/ALWAYS-ON.md.) Do not expose this demo directly as a multi-tenant public SaaS.
