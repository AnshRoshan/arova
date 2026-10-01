# Arova — project overview

Arova is a fullstack AI-agent workspace built with Next.js App Router, PostgreSQL, Drizzle ORM, Tailwind CSS, and a provider-neutral Chat Completions gateway. It is a product workspace, not a static landing page.

## Current experience

The default screen is **Overview**: a warm, editorial command center with a live workspace pulse, agent roster, upcoming routines, and activity previews. Selecting an agent opens its persisted chat thread and settings. The left navigation also opens Automations (scheduler and runs), Integrations (tools and MCP), and Settings. The right activity feed prints actual stored events, runs, and approvals; sample records are explicitly labeled. The responsive sidebar and activity feed open as drawers on narrower screens.

## Data and behavior

`src/app/api/board/route.ts` owns workspace initialization, board serialization, streaming chat, agent/team/org actions, routines, execution, approvals, usage, workspace renaming, and tool-connection boundaries. `src/db/schema.ts` defines PostgreSQL storage; `src/lib/` holds model routing, orchestration, markdown, scheduler, tools, skills, and identity logic. Board `overview` totals are derived server-side from workspace-scoped stored rows. Completed-run and pending-approval totals exclude seeded samples. Workspace renaming is a persistent audited action.

Without a configured provider key, chat shows an explicit local-mode notice. Tool connectors and computer sessions require deployment credentials/runtime and must never pretend to have executed. Schedules run on workspace read rather than through a continuously running worker. Do not imply background execution or fabricated outcomes.

## Design direction

Studio Edition: deep aubergine navigation, warm off-white canvas, lilac hero and soft identity colors, generous card spacing, and compact honest status labels. The dashboard is a working index into existing features, not decoration. Keep keyboard search, streaming reply cancellation, provenance, explicit sample labels, and accessible button names intact.

## Shell (three in-flow columns)

1. **Icon rail** (68px): Overview, Agents, Organisation, Automations, Integrations, Settings, plus panel toggle and model status. Re-clicking the active icon folds the panel.
2. **Section panel** (276px, dark, never overlays): header + segmented **tabs** + search, with its own scroll. Agents: All/Active/Paused. Organisation: Teams/Bench. Automations: Routines/Runs. Integrations: Connectors/MCP. Settings: Workspace / Models & usage / Deployment limits. Overview: quick actions and status.
3. **Workspace**: the selected agent thread, org manager, or pane. The activity feed is a fourth column on wide screens and a drawer below 1250px. On phones the panel becomes a full-width step before the content.

## Organisation management

Backend actions in `/api/board`: `createEmptyTeam`, `updateTeam`, `deleteTeam` (agents are kept, moved to the bench), `assignAgent` (team + manager; rejects self-management, cross-team managers and reporting loops). The Organisation pane edits team name/brief, shows the chart, sets each seat's "Reports to", adds/removes seats, places benched agents, and can hand off to an agent to draft a full organisation.
