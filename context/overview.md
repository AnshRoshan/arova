# Arova — project overview

Arova is a fullstack AI-agent workspace: a person creates named AI teammates, chats with them across persisted threads, forms teams and organisations, briefs an organisation in a durable channel, records organisation memory, runs routines, and reviews what the server actually recorded. It is a working product surface, not a landing page.

Stack: Next.js App Router, React, PostgreSQL, Drizzle ORM, Tailwind, and a provider-neutral OpenAI-compatible gateway. The workspace cookie is a demo identity, not authentication.

## Who it is for

One person working daily with a small set of named agents. Success is opening the app and continuing where they left off, not touring a dashboard. A fresh visit is an empty workspace: the user adds the first agent, and every number afterwards is something they did.

## Current experience (Graphite Edition, four columns)

1. **Icon rail** (68px): Overview, Agents, Organisation, Automations, Integrations, Settings, plus panel toggle and model status. Re-clicking the active icon folds the section panel.
2. **Section panel** (276px, dark, never overlays): context list with tabs and search (Agents: All/Active/Paused; Organisation: Teams/Bench; Automations: Routines/Runs; Integrations: Connectors/MCP; Settings: Workspace / Models & usage / Deployment limits).
3. **Work surface**: the selected agent thread, the organisation manager, the organisation channel, or a settings pane.
4. **Activity board** (320px): a printer of recorded runs, delegation hops, audit events, approvals and stored `next_run_at` values, plus live SSE facts this client actually received. It becomes a drawer below 1250px; the panel becomes a full-width step below 860px.

The app reopens on the last agent (`localStorage["arova.lastAgent"]`). Model output streams token by token with a Stop that keeps what arrived; provenance is printed inline under a reply.

## Core flows

- **Chat**: create an agent → choose a provider (or local mode) → send a message → streamed reply persisted as one assistant row, with token estimates and provider/model provenance.
- **Teams**: ask for a team → a roster is proposed → nothing exists until the user confirms → the answering agent may consult a teammate, and every hop is stored in `delegations`.
- **Organisations**: create an org with reporting lines → brief the lead in the org channel → teammate posts and a lead report land as attributed channel rows, backed by real runs/steps → the brief can be triggered from outside with a bearer token.
- **Memory**: an organisation keeps attributed, keyword-searchable notes; a brief retrieves up to three and prints which ones it used; notes can be pinned, superseded, edited and forgotten; distillation is one counted call that only proposes.
- **Routines**: create/toggle/delete; a due routine is **enqueued** as a durable job and the worker process (`npm run worker`) claims it with a Postgres lease and posts a real answer into the thread, subject to the same daily model-call budget. Run Now enqueues a manual run on the same path. Ten consecutive failures switch a routine off with one message. (Live-verified 2026-10-25: D-25.)
- **Approvals**: an agent requests approval; the human decides; a seat refused three times in a row has its fourth request withheld, not queued.

## Scope

**In scope for the current build:** the flows above; any OpenAI-compatible endpoint by configuration; per-seat capabilities that narrow real behaviour; org-scoped memory and channels; inbound trigger tokens; honest provenance and usage accounting.

**Deliberately out of scope for the current code (do not add without an approved spec):**
- Production authentication, sessions, memberships and multi-tenant sharing. The cookie is a demo. Feature 15's env registry is diagnostics only.
- Real tool execution by the model (the gateway is built and `save_note` routes through it; model-initiated tool calls and MCP transport arrive with spec 17 step 2), browser/computer use, shell or file access, OAuth connectors.
- Semantic/vector memory (the Postgres server has no `vector`), real tokenization, per-provider billing, message pagination/retention, and CSRF/rate-limit hardening for public deployment.

**Proposed roadmap (2026-10-20):** specs 16–26 in `context/build-plan.md` and `context/market-comparison.md` close the substrate gaps: local bootstrap, durable worker, tool/MCP/policy plane, trust/cost/artifact controls, auth, scale, memory v2, channels, proactive goals, portable skills and agent computer. They are **proposals only**; the scope list above stays true until each spec is approved and implemented.

## Design direction

Graphite Edition: one dark world built from six surface steps (`--void` → `--panel` → `--sheet` → `--card` → `--raised` → `--sunken`), one azure interactive accent with a dark glyph, three measured identity tints led by an avatar glyph, self-hosted DM Sans/Manrope/JetBrains Mono, and state colours used only where a stored row produced that state. `DESIGN.md` is the visual authority; `context/ui-tokens.md` and `context/ui-rules.md` govern behavior. The retired warm-ivory/lilac Studio Edition and the paper Notebook must not return.

## Honesty contract

Every claim in the interface must be backed by a stored row or a frame this client received. An unconfigured provider, a waiting run, a partial stream, a stopped stream and a budget cut are each rendered as what they are. Sample/seed rows are labelled and never counted as real work.
