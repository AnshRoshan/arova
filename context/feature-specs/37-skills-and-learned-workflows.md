# 23 — Skills and learned workflows

**Status: SHIPPED end to end (ported 2026-11-22, completed 2026-11-22).** Everything the roadmap asked for: `skills`/`skill_versions` tables, save/edit-as-new-version/rollback/import/export actions, scope rules (org/team/seat), grant intersection (skill ∩ seat) in `src/lib/saved-skills.ts`, prompt injection through `savedSkillsBlock` in every reply path (chat, handoff, brief, routine, evals), **usage telemetry** (`uses`/`last_used_at` recorded when a skill is actually offered), and **draft → review → activate**: run transcripts draft skills (`draftSkillFromRun`), a draft never reaches a prompt until a person activates it.

> Was: PROPOSED — not approved, not implemented. Part of the 2026-10-20 market roadmap.

## Goal

A skill is a saved, named, versioned workflow an organisation can run again: written by a human or drafted from a real run, scoped to an org/team, granted to seats, and improved deliberately. Repeating work becomes an asset instead of a prompt re-explanation.

Measurable: a completed run can be turned into a draft skill with its steps and tool calls; a human activates it; another seat runs it with different inputs and gets a comparable result; an inactive or ungranted skill cannot be invoked; a new version can be rolled back.

## Why now

Grok Bot learns a workflow from a demonstration and reruns it on a schedule; Genspark saves shareable skills; Lindy has watch-and-learn; OpenBot has automatic learning. Arova has prompt-level skills only (`src/lib/skills.ts`), with no saved object, no versioning and no learning loop.

## Scope

### 23a — Skill object
`skills`: id, workspace, scope (`org | team | seat`), name, slug, description, version, status (`draft | active | deprecated`), instructions, input schema (Zod/JSON), tool grants, examples, created_by, source_run_id, created_at, updated_at. Immutable versions: editing creates version N+1; activation points to a version; rollback repoints.

### 23b — Creation
- **From a run:** a completed run with steps and tool calls offers "Draft a skill". The draft includes the goal, ordered steps, tools used, inputs discovered, and the final output shape. It is a draft, never auto-active.
- **Manually:** an editor with name, instructions, inputs, granted tools, and a test run.
- **From a conversation:** the agent can propose a skill; a human reviews it.

### 23c — Execution
A skill is exposed to a seat as an invokable capability (prompt-level first, tool-call shape later). Inputs are validated; missing inputs are requested, not invented. The skill runs through the same `planReply`/gateway path as any other work. Tool grants are intersected with the seat's own grants; a skill can never escalate.

### 23d — Learning loop
After N successful runs, propose an improvement (new input, removed step, changed tool) with evidence. Proposals are reviewed, never auto-applied. Track success rate, median duration and cost per version.

### 23e — UI
Skills library with scope/status filters; detail view with versions, inputs, tools, last runs; editor; "use this run as a draft" action; test runner; activation/deprecation; share/export as markdown/JSON.

### 23f — Safety
Skills are data, not code: no arbitrary JS/shell inside a skill. Tool grants are declarative. Instructions are untrusted text from the model until a human activates them. A skill cannot access a workspace/org it is not scoped to.

## Deep-research amendments (2026-10-20)

- Choose the portable **Markdown + frontmatter** payload used across agent-skill ecosystems rather than a bespoke step DSL. This gives Arova import/export compatibility without owning a workflow format.
- Skills answer "how to work"; memory answers "what to know." Do not merge them (`market-deep-dives/01`, CrewAI split).
- A skill is a capability bundle: inputs + instructions + tool grants + permission mode + version. Effective grant is `skill ∩ seat ∩ workspace policy`; a skill cannot widen access.
- A run may be drafted into a skill, but a human reviews target hosts/tools and activates. Grok's recording UX is valuable; autonomous activation is not.
- Skill execution produces the same trace/artifacts/budget/approval behavior as a normal run; there is no privileged path.

## Value-source gate

"Used N times" comes from run links; "success rate" from stored run outcomes; "version" from the immutable row. A draft never displays as active. A skill's tools come from the registry, not from prose.

## Data and code

- `src/db/schema.ts`: `skills`, `skill_versions`, `skill_runs`.
- `src/lib/skills.ts`: extend the existing prompt-level registry with saved skills; add validation + resolution tests.
- `src/app/api/board/route.ts`: CRUD, activate, run, version, rollback.
- `src/worker/`: skill runs use the durable engine (spec 16).
- `src/app/page.tsx`: Skills pane + editor + run history.
- Spec 17 gateway for tool calls.

## Exclusions

No arbitrary code execution, no marketplace, no cross-workspace sharing, no autonomous skill creation, no self-modifying skills. No workflow graph editor in v1; a skill is a checklist with inputs, not a visual DAG.

## Verification

- Unit: version immutability; scope isolation; grant intersection; input validation; rollback.
- Live: run a brief, draft a skill, review, activate, run with different inputs; confirm a seat without the grant cannot invoke it; edit → version 2; roll back; check run history/cost.
- Gates: tests, typecheck, lint, build; a skill run executes on the worker.

## Risks and cost

Skills can encode bad instructions or over-broad grants; require review, intersect grants, and keep versions. The learning loop can propose noise; cap proposals and require evidence. Cost: three tables, an editor, and run instrumentation.

## Dependencies

Spec 17 (tool execution), spec 20 (memory/evidence), spec 16 (durable runs). Spec 19 for run traces/cost.

## Open questions for the user

1. Skill format: instructions + input schema + tool grants (recommended), or a step DSL? Recommendation: start declarative, no DSL.
2. Who can activate: owner/admin only, or any member for a seat-scoped skill? Recommendation: admin for org/team; member for own seat.
3. Auto-draft threshold: every successful run, or only runs longer than N steps? Recommendation: manual "Draft a skill" plus a suggestion after 3 similar runs.
4. Import/export format: JSON + markdown. Confirm.

---

> **Renumbered 2026-11-22.** This document belonged to the parallel work line on this machine (its spec 23). On main it is spec **37**; the whole line renumbered 16–27 → 30–41 to continue main's own specs 16–29. Internal subsection letters and cross-references still speak the old numbers.
