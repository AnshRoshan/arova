# Build plan

## Built and committed (2026-10-20)

| # | Spec | Status |
|---|---|---|
| 01 | Provider chat | Complete |
| 02 | Any-endpoint providers + budget | Complete |
| 03 | Chat-first notebook | Complete, superseded by 10 |
| 04 | Teams and one-hop delegation (default 2) | Complete |
| 05 | Capabilities and enforcement (15 tools, 6 live) | Complete |
| 06 | Reading surface | Complete |
| 07 | Organisations and skills | Complete |
| 08 | Schedules that execute | **Partial** — due routines execute on board `GET`; Run Now is a waiting stub; no `missed` status |
| 09 | Real token accounting | Complete |
| 10 | Workbench shell / Graphite | Complete |
| 11 | Organisation channel | Complete |
| 12 | Organisation memory | Complete |
| 13 | Boundary and door (breaker, trigger) | Complete |
| 14 | OpenBot steals (provenance, fatigue, initiator) | Complete |
| 15 | Signed-in people | **Foundation only** — env diagnostics; blocked on credentials |

## Market research — completed as a two-pass study (2026-10-20)

Pass 1 reviewed 15 products from official sources: Grok Bot, OpenAI Dots, OpenDots, OpenBot, OpenMuse, OpenClaw, Manus, Genspark, Claude Cowork, Devin, OpenHands, Microsoft Copilot Studio / Agent 365, Gemini Enterprise, Lindy and Zapier Agents.

Pass 2 ran six dedicated clusters: hosted teammates, CopilotKit/OpenClaw architecture, enterprise platforms, coding/workflow frameworks, memory/execution rails, and demand signals. The main product is `context/market-comparison.md`; raw evidence is under `context/market-deep-dives/`.

**Positioning proposal:** Arova is the **accountable agent organisation** — self-hosted, model-agnostic, with explicit org structure, reviewable memory, approvals, budgets and provenance. It should integrate the substrate rather than try to out-build Grok Bot, Dots or OpenClaw on their own axes.

**Verdict after pass 2:** Arova leads on structure, provenance and BYOK; it trails on always-on execution, real tools, auth, channels, memory and computer. Demand evidence says the most urgent failures are invisible sub-agent work, uncontrolled spend, cosmetic pause, trapped artifacts and credential exposure—so trust controls move alongside the worker, not after it.

## Roadmap — twelve proposed specs (none implemented)

| Spec | Feature | Phase | Depends on |
|---|---|---|---|
| [25](feature-specs/25-local-development-bootstrap.md) | Safe local development bootstrap | Wave 0 | — **In progress** — code complete (D-21), live steps blocked on the user's `DATABASE_URL` |
| [16](feature-specs/16-durable-work-engine.md) | Durable work engine + real Run Now | P0 | 25 — **code complete** (D-22): queue, worker, 202 trigger, Run Now real; live execution unverified until a database exists |
| [17](feature-specs/17-tool-execution-plane.md) | Tool execution plane + MCP + policy gateway | P0 | 16 — **core complete + live-verified** (D-24/D-26/D-27: gateway, tool loop, web_fetch, MCP transport, vault, UI surfaces) |
| [26](feature-specs/26-trust-cost-and-artifact-controls.md) | Spend, pause/kill, task lineage, artifacts, credential boundary | P0 | 16 — **first slice shipped** (D-23: token hashing, pause/kill, approval-token rules); rest lands with 17 |
| [18](feature-specs/18-auth-and-membership.md) | Auth, sessions, membership, roles | P0 | — |
| [19](feature-specs/19-board-scale-and-observability.md) | Pagination, retention, indexes, traces, cost | P0 | 16, 26 — **first slice shipped + live-verified** (D-28: bounded board, cursors, limits, indexes, retention sweep) |
| [20](feature-specs/20-org-memory-v2.md) | Reviewable memory substrate + hybrid retrieval | P1 | 16, 19 — **first slice shipped + live-verified** (D-29: hybrid pg_trgm recall, temporal validity) |
| [21](feature-specs/21-channel-gateway.md) | Slack + email channel gateway | P1 | 16, 18, 26 — **Slack-first slice shipped + live-verified** (D-30); email adapter deferred pending provider choice |
| [22](feature-specs/22-goals-and-proactive-attention.md) | Goals, watches, attention inbox | P1 | 16, 21, 26 — **first slice shipped + live-verified** (D-31: URL watches, attention dedupe, failure ladder) |
| [23](feature-specs/23-skills-and-learned-workflows.md) | Portable Markdown skills + learned workflows | P1 | 17, 20, 26 |
| [24](feature-specs/24-agent-computer.md) | Agent computer via provider contract | P2 | 17, 18, 26 |
| [27](feature-specs/27-self-modification-and-feedback.md) | Reviewable self-modification + feedback loops | P1 | none hard; strengthened by 26, 23 |

All twelve are marked **PROPOSED — not approved, not implemented**. Implementing one requires the user to approve that spec first.

### Status audit (2026-10-25)

Every status row above was re-verified against `src/` by a read-only code audit. Result: the table is accurate — 01–07 and 09–14 complete, 08 partial (Run Now stub; `missedIntervalMs` exists in `scheduler.ts` but is imported by no production code), 15 foundation-only, 16–26 absent from the code. New findings recorded in `current-issues.md`: `triggers.token` is stored **plaintext** (hashing belongs to spec 26); the `connections` and `sandboxes` tables are dead (never written by any action); `cancelRun` (single-run cancel) exists but no spec 01–15 claims it; `u.local.cjs` is an orphan verification utility. Specs 16, 20 and 26 gained dated deep-research amendments from the pass-3 market refresh; spec 27 is new.

## Recommended sequence

**Wave 0 — local credibility (25).** A verified project database, ownership check, schema push, health and empty workspace. The user explicitly wants local development first; this is the prerequisite for every later feature.

**Wave 1 — substrate and trust (16 → 26/17 → 18).** A Postgres worker, real Run Now, policy/tool plane, and the trust layer that proves spend/pause/artifacts/credentials. Auth can run in parallel because it is a separate boundary, but no external channel or computer should precede it.

**Wave 2 — scale and memory (19, 20).** Bound the board and add traces/cost, then build a reviewable memory substrate before pursuing hybrid retrieval.

**Wave 3 — reach and proactivity (21, 22).** Slack/email and bounded watches, both constrained by budgets and approval tokens.

**Wave 4 — compounding and substrate (23, 24).** Portable skills; then a policy-gated agent computer if and only if the preceding trust layer passes.

## Explicit non-goals

- Building 1,000+ connectors in-house. Use MCP and a small set of deeply correct OAuth/channel adapters.
- Making Composio, CopilotKit Intelligence, Mem0, Zep, Letta or Redis a core dependency before Arova's Postgres boundary is exhausted.
- Owning a browser engine or a VM fleet. Integrate a sandbox/browser provider behind `SandboxProvider`.
- A native mobile app before the web product is credible.
- A general visual workflow builder. Skills are the narrower, better-shaped answer.
- Autonomous purchases/payments, health/bank/social connectors, or any execution the policy gateway cannot audit.
- Proprietary credits, invisible sub-agents, cosmetic pause, shared-user sandboxes, or unannotated external writes.
- Claiming always-on, semantic memory, OAuth, channels, or a computer before the corresponding spec is live and verified.

## Historical candidates, folded into the roadmap

The earlier list (Run Now execution, pagination, per-seat live view, worker, connectors, citations, sign-in) is now covered by specs 16, 19, 21 and 18 respectively. The per-seat live view can ride on the worker/run traces in 16 + 19 and does not need its own spec yet.
