# 27 — Reviewable self-modification and feedback loops

**Status: PARTIALLY SHIPPED — core substrate in place via spec 37 (ported 2026-11-22).** Versioned skills with immutable history and rollback are the self-modification core and are live; the full feedback loop (run transcripts proposing skill drafts, human confirmation, telemetry-driven revision) is NOT implemented and remains roadmap.

> Was: PROPOSED — not approved, not implemented. Created from the 2026-10-25 market refresh (`context/market-deep-dives/07-october-refresh-2026-10-25.md`).

## Goal

An agent's own configuration — persona, instructions, skills, schedule, budget, capability grants — becomes **versioned and reviewable**, and the agent can *propose* changes to it through the same approval machinery the org already has. Rejection stops being a dead end: a human review comment on any run or artifact can spawn one bounded follow-up attempt by the same agent.

Measurable: an agent-proposed change exists only as a pending diff until a human clicks approve; every approved change is attributable (who/what/when + the run that proposed it) and reversible; a review comment produces at most one bounded re-run; nothing about the agent's identity changes silently.

## Why now

Three market signals from the 2026-10-25 refresh converge here:

- **Devin (Oct 19):** sessions propose edits to shared plugins/skills **pending admin approval** — self-modification gated on a human is already shipping.
- **Kortix (git-as-company):** agents, skills, memory and connectors live in diffable config; changes reach main only via an approved change request.
- **GitHub Copilot coding agent:** the "Fix with Copilot" loop turns a review comment into a scoped follow-up task on the same artifact — rejection as iteration, not termination.

Arova already has the pieces: approvals with a denial breaker, audit events, provenance, and reviewable memory. But an agent's persona/schedule/budget edits today happen only through the human's direct forms, and the denial breaker refuses bluntly with no path to a corrected retry. This spec extends the org's accountability story from "what did the agent do" to "what did the agent change about itself, and who said yes."

## Scope

### 27a — Change requests

New table `change_requests`: `id`, `workspace_id`, `run_id` (nullable — the run that proposed it), `agent_id`, `target` (`agent_config | routine | skill | capability | budget`), `subject_id`, `before` jsonb, `after` jsonb, `summary` (model-written rationale, stored verbatim), `status` (`PENDING | APPROVED | REJECTED | EXPIRED | SUPERSEDED`), `decided_by`, `decided_at`, timestamps. Constraints:

- A pending request is a **proposal only** — the live config is never read from `change_requests`. The agent keeps operating on the current config until approval.
- One agent has at most **N pending requests per target** (default 3); further proposals are refused with a stated reason (reuses the refusal pattern of the tool registry).
- A request that contradicts a hard boundary (narrowing-only capabilities, budget ceilings, per-seat grant rules) is **auto-rejected at creation** with the violated rule named, not queued for a human to discover.
- Approval applies the diff through the exact same server action the human form uses — no second write path.
- Every decision writes an audit event; the agent is told the outcome in-thread (one message, reusing the fatigue pattern so repeated rejections do not spam).

### 27b — Review comments and bounded re-runs

- Any run row (or its artifacts, once spec 26 lands) accepts a human **review comment** (new `run_comments` table: `run_id`, `author`, `body`, `created_at`).
- A comment may carry an action: "ask the agent to try again." This enqueues one **bounded re-run**: same agent, same originating message, the comment injected as explicit correction context, `maxTurns` and budget inherited and not exceedable, at most one re-run per comment (a comment is consumed, like a single-use approval token).
- The re-run links back to the original run (`runs.parent_run_id`, the lineage seam already created by spec 14's `initiator` and spec 26's task graph). The thread shows both attempts, attributed.
- If the re-run fails the same way, the UI says so; it never chains automatically. Repeated failures on the same target are a fatigue-class signal.

### 27c — Versioned agent config (the diff surface)

- Every mutation of an agent row (instructions, skills, capabilities, provider, schedule, budget) writes an **immutable `agent_revisions` row** (agent_id, revision number, before/after jsonb, author: human | agent + run_id, created_at).
- The agent dialog gains a History tab: list revisions, view a rendered diff of any two, and **revert** to a prior revision (itself a revision, never a destructive rewrite).
- Spec 26's autonomy dial lives here as a first-class agent field once that spec lands.

## Deep-research amendments (2026-10-25)

- Devin's model is the reference: proposals are allowed, application is human-gated, and shared assets (org-level skills) require a higher approval tier than personal ones. Arova's equivalent: changes to the agent's own config need one approval; changes that affect **other seats or the org** (shared skills, budgets that consume shared daily calls) need the tier the org already enforces for founding/staffing.
- Kortix's lesson is the *shape* (diffable config + change request), not the storage: Arova keeps Postgres as source of truth with revision rows, not a git repo. A Git-backed export remains a later option (same stance as spec 20).
- Copilot's fix-loop lesson: bound the retry. One re-run per comment, budget-capped, explicitly linked. No auto-iteration loops.

## Value-source gate

Every diff shown comes from `before`/`after` jsonb on a stored row; every "proposed by" comes from `run_id`; every decision comes from `decided_by`/`decided_at`; a re-run's existence comes from `parent_run_id`. A pending request renders as pending — the UI never previews a change as if it were live.

## Data and code

- `src/db/schema.ts`: `change_requests`, `agent_revisions`, `run_comments`; `runs.parent_run_id`.
- `src/lib/revisions.ts` (pure: diff computation, boundary checks, one-revision-per-mutation helper) — test-first.
- `src/lib/feedback.ts` (pure: comment→re-run eligibility, consumed-comment guard) — test-first.
- `src/app/api/board/route.ts`: propose/decide actions, comment action, history reads; the router may emit a `propose_change` directive parsed like existing routing (spec 04 pattern).
- `src/app/page.tsx`: History tab in the agent dialog, change-request cards in the Needs-attention section, comment affordance on run rows.

## Exclusions

No silent self-modification under any autonomy setting. No agent-proposed changes to workspace-level settings, provider credentials, or other agents' config (spec 07's tiering already reserves those to humans). No automatic retry chains. No general "agent edits the schema" — targets are limited to the five above. No git-backed storage in v1. No approval of an agent's request by another agent.

## Verification

- Unit: diff rendering; auto-reject on boundary violation; pending-per-target cap; revision immutability; comment consumed once; re-run linkage.
- Live: an agent proposes a skill addition → pending card → approve → config changes through the human path with an audit event and a revision row → revert; an agent proposes a forbidden grant → auto-rejected with the rule named; a review comment spawns exactly one bounded re-run that appears as a child run; a second comment on the failed re-run refuses with a reason.
- Gates: `npm test`, typecheck, lint, build; the change-request flow driven in the browser at both breakpoints.

## Risks and cost

The router may over-propose (noise) — the pending cap plus proposal budgeting (proposals cost from the seat's call budget) mitigate it. Diff rendering on jsonb can mislead for large instruction rewrites — cap rendered diff size with a "view full" fallback. Three tables, one directive shape, one UI surface; no new process or dependency.

## Dependencies

Standalone against specs 01–14 (it needs only approvals, runs and audit, which exist). Spec 26's task graph and single-use tokens strengthen 27b but are not prerequisites; spec 23 skills become a richer `target` once they exist.

## Open questions for the user

1. Which targets are agent-proposable in v1: skills only, or also routine schedule and own instructions? Recommendation: own instructions + skills; schedule and budget later.
2. Should proposals cost the seat's daily call budget (deters noise) or be free? Recommendation: free to propose, capped at 3 pending.
3. Expiry for pending requests: 7 days, 30 days, or never? Recommendation: 7 days, `EXPIRED`, with one in-thread notice.
4. Should the human's review comment be visible to the agent verbatim, or summarised? Recommendation: verbatim — it is untrusted content and must be wrapped as data per spec 26f when that lands.

---

> **Renumbered 2026-11-22.** This document belonged to the parallel work line on this machine (its spec 27). On main it is spec **41**; the whole line renumbered 16–27 → 30–41 to continue main's own specs 16–29. Internal subsection letters and cross-references still speak the old numbers.
