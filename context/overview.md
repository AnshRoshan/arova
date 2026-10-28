# Arova — project overview

Arova is a fullstack AI-agent workspace built with Next.js App Router, PostgreSQL, Drizzle ORM, Tailwind CSS, and a provider-neutral Chat Completions gateway. It is a product workspace, not a static landing page.

## Current experience

The default screen is **Overview**: a warm, editorial command center with a live workspace pulse, agent roster, upcoming routines, and activity previews. Selecting an agent opens its persisted chat thread and settings. The left navigation also opens Automations (routines, runs, evals, 24/7), Integrations (connectors, local tools, channels, MCP), and Settings (workspace, models, agent registry, deployment limits). The right activity feed prints actual stored events, runs, and approvals; sample records are explicitly labeled. The responsive sidebar and activity feed open as drawers on narrower screens.

## Current slice (2026-10-28)

- **Channels** (Integrations → Channels): a generic HTTPS webhook (Slack incoming webhooks work as-is), an inbound token for an organisation channel, a 60 s inbound cooldown, and a delivery ledger. The target is a credential and only its host is sent to the browser.
- **Evals** (Automations → Evals): one prompt, one expected fragment, a case-insensitive substring score; `SKIPPED` and `ERROR` are stored states, not passes; every attempt is a real run.
- **Agent registry** (Settings → Agent registry): every seat with team/manager, provider, tool count, permission mode, last run/status and exact run/pending/routine counts. Read-only; no health score.
- **Local OS sandbox** (Integrations → Sandbox, opt-in): `AROVA_SANDBOX_PROVIDER=local-os` enables shell/files execution through `@anthropic-ai/sandbox-runtime`. It is fail-closed until the host is provisioned, has no GUI stream/snapshot/takeover, and records every command as a real run. Spec 19, D-23.
- **Read-only tool loop** (Agent → Capabilities, opt-in): the model may call its granted local tools, `web_fetch`, and `web_search` when a provider is configured; the loop is bounded, audited, and returns numbered sources. Spec 21, D-25.
- **Market brief rev 2** (`context/feature-parity.md`): thirteen products/agents, dated source tiers, pricing, reliability evidence, demand/security, substitutes, self-host-first positioning (D-19) and kill criteria.

## Data and behavior

`src/app/api/board/route.ts` owns workspace initialization, board serialization, streaming chat, agent/team/org actions, routines, execution, approvals, usage, workspace renaming, and tool-connection boundaries. `src/db/schema.ts` defines PostgreSQL storage; `src/lib/` holds model routing, orchestration, markdown, scheduler, tools, skills, and identity logic. Board `overview` totals are derived server-side from workspace-scoped stored rows. Completed-run and pending-approval totals exclude seeded samples. Workspace renaming is a persistent audited action.

Without a configured provider key, chat shows an explicit local-mode notice. Tool connectors and computer sessions require deployment credentials/runtime and must never pretend to have executed. Schedules execute through the in-process worker (on by default) or an outside clock calling `/api/cron`; board reads also tick due routines. When no driver is actually beating, the UI says so — never imply background execution or fabricated outcomes.

## Design direction

Studio Edition: deep aubergine navigation, warm off-white canvas, lilac hero and soft identity colors, generous card spacing, and compact honest status labels. The dashboard is a working index into existing features, not decoration. Keep keyboard search, streaming reply cancellation, provenance, explicit sample labels, and accessible button names intact.

## Shell (three in-flow columns)

1. **Icon rail** (68px): Overview, Agents, Organisation, Automations, Integrations, Settings, plus panel toggle and model status. Re-clicking the active icon folds the panel.
2. **Section panel** (276px, dark, never overlays): header + segmented **tabs** + search, with its own scroll. Agents: All/Active/Paused. Organisation: Teams/Bench. Automations: Routines/Runs. Integrations: Connectors/MCP. Settings: Workspace / Models & usage / Deployment limits. Overview: quick actions and status.
3. **Workspace**: the selected agent thread, org manager, or pane. The activity feed is a fourth column on wide screens and a drawer below 1250px. On phones the panel becomes a full-width step before the content.

## Organisation management

Backend actions in `/api/board`: `createEmptyTeam`, `updateTeam`, `deleteTeam` (agents are kept, moved to the bench), `assignAgent` (team + manager; rejects self-management, cross-team managers and reporting loops). The Organisation pane edits team name/brief, shows the chart, sets each seat's "Reports to", adds/removes seats, places benched agents, and can hand off to an agent to draft a full organisation.
