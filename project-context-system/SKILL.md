---
name: project-context-system
description: Drop-in engineering system for any coding agent (Claude Code, Codex, Cursor, Copilot, Qoder). Use at the START of any project, or when a project lacks AGENTS.md / context/ / memory files, to scaffold the complete file system - AGENTS.md entry point, CLAUDE.md, .claude/ settings, rules, local overrides, context/ folder with architecture, build plan, feature specs, progress tracker, decision log, issue log, memory.md handoff, .gitignore - and to run the daily session protocol that records every decision and piece of progress. Also use when the user asks to "set up" agent files, restore state in a new session, sync context files with reality, or hand a project to another agent.
---

# Project Context System

Four laws, from the source methodology:

1. **Decide what to build first.** A line changed in a plan is free; a decision already spread through the codebase is a rewrite.
2. **Make the hard calls on purpose.** Every addition gets an explicit cost recorded.
3. **Keep the state in files.** The agent updates them as it works, every session.
4. **Never let the AI decide something important without telling the human.**

Project knowledge lives in files, not in a chat that vanishes. A fresh session, a teammate, or a different AI tool reads the files and picks up with zero re-explaining.

## Mode detection

- Project root has no `AGENTS.md` + `context/` → **SET UP** (run the Bootstrap below).
- They exist, user starts working → **RUN** (Session Protocol in `references/session-protocol.md`).
- Docs disagree with the repo, or work resumed after a break → **SYNC** (Sync pass below).

## Bootstrap - scaffold every file and folder

Do this in order. Run the planning conversation first; never generate context files from guesses.

1. **Planning conversation (~10 min, before touching any tool).** Human + a *planning AI* (a chat separate from the coding agent) = the architect; the coding agent is the implementation engine. Establish and push back until clear: what does this thing actually do, who uses it, what are the core flows, where are the complex patterns, what could go wrong, what is in version one and what waits. Pick a build shape: **facade** (UI shell first), **journey** (one full user path), **skateboard** (thin slice through everything), or **tracer bullet** (one end-to-end risky path). Goals must be concrete and measurable, never "build a good canvas". The context files below are the organized output of that conversation.
2. **Create the dot folders and files.** Copy every template from `assets/` into the project, preserving structure:

```
project-root/
├── AGENTS.md                        <- assets/AGENTS.md.template (master file for every agent)
├── CLAUDE.md                        <- assets/CLAUDE.md.template (thin wrapper; first line @AGENTS.md imports it at launch)
├── CLAUDE.local.md                  <- assets/claude-local.md.template (personal, never committed)
├── memory.md                        <- assets/memory.md.template
├── .gitignore                       <- merge assets/gitignore.append (do not overwrite existing)
├── .claude/
│   ├── settings.json                <- assets/settings.json.template (adjust commands to the real stack)
│   └── rules/                       <- optional path-scoped rule splits, see references/agents-md-rules.md
└── context/
    ├── overview.md                  <- assets/overview.md.template
    ├── architecture.md              <- assets/architecture.md.template
    ├── build-plan.md                <- assets/build-plan.template
    ├── code-standards.md            <- assets/code-standards.md.template
    ├── workflow-rules.md            <- assets/workflow-rules.md.template (copy verbatim, it is the discipline layer)
    ├── library-docs.md              <- assets/library-docs.md.template
    ├── ui-tokens.md                 <- assets/ui-tokens.md.template   (UI projects only; delete others)
    ├── ui-rules.md                  <- assets/ui-rules.md.template    (UI projects only)
    ├── ui-registry.md               <- assets/ui-registry.md.template (UI projects only; starts empty on purpose)
    ├── decisions.md                 <- assets/decisions.md.template
    ├── progress-tracker.md          <- assets/progress-tracker.md.template (starts empty: nothing is built yet)
    ├── current-issues.md            <- assets/current-issues.md.template
    ├── feature-specs/               <- empty; specs added one per unit as .md, NN-kebab-case.md
    ├── designs/                     <- page mockups when available
    └── screenshots/                 <- visual feedback for the agent
```

3. **Fill the templates from the planning conversation.** Replace every `{{PLACEHOLDER}}`. Facts the agent cannot discover from the code go in (package manager, dev/test/build commands, schema locations, design rules). Facts it can read from package.json do not. Delete template sections that do not apply; an honest 30-line file beats a padded 200-line one.
4. **Non-greenfield?** Audit first: read the real project and write down how it actually works before planning any new slice. Scope must account for what is already built and plan the next slice on top of reality - reuse, not regenerate.
5. **Monorepo?** Keep the root AGENTS.md for what is true everywhere, then add a nested `AGENTS.md` next to each package with only its local rules (see `assets/nested-AGENTS.md.template`). The agent only pulls the instructions for the area it is working in.
6. **Name every tool in the stack, then install its agent skill / fresh-docs MCP** before speccing (Clerk, Prisma, Liveblocks, Trigger.dev, Stripe...). This stops the agent inventing a websocket layer when a library is already chosen. **Stack-selection criterion: prefer agent-native tools** — ones that ship an official skill or MCP server, so the agent reads live state (schema, config, docs) instead of guessing from stale training data. Record installs in `context/library-docs.md`.
7. **Verify the scaffold:** check what actually loads (`/context`, `/memory` on Claude Code; confirm the `@AGENTS.md` import resolves), confirm `.gitignore` covers `current-issues.md` and `CLAUDE.local.md`, confirm the deny rule for `.env*` actually works by attempting a read. Verify like code.
8. **First session prompt** (give this to the human to paste):

> Read AGENTS.md. Read the always-on context files and load the task-touched ones per its tiered reading order. Read memory.md. Confirm once you are ready to build Feature 01.

Detailed authoring rules for every file: `references/context-files.md` and `references/agents-md-rules.md`.

## The recording table (hard rules, enforced every task)

The agent records *while* working, not at the end:

| Event | Record |
|---|---|
| Starting a unit | progress-tracker.md: move unit to In Progress |
| Finishing + verifying a unit | progress-tracker.md: move to Complete with concrete details (versions, config paths, env var names) |
| Any hard technical decision | context/decisions.md entry (see template) - never buried in code or chat |
| A shortcut taken under pressure | flagged-assumption entry on that feature, visible until properly decided |
| A gap found in context files | edit the context file itself during the build |
| New component built | ui-registry.md: check for a similar one first; if new, add it after building |
| A bug appears | context/current-issues.md: symptom + suspected file + fix direction + definition of success |
| End of every session | memory.md: current state, exact next step, open questions |
| Feature/phase complete | changelog + PR description from the **actual diff**, not from the agent's memory |
| Periodic / before handoff | sync pass (below) |

**Decision record format** (also in `assets/decisions.md.template`):

```markdown
## D-NN: <title> - <date>
Trigger: what forced this decision
Options considered: A / B / C
Chosen: <option>, because <reason>
Lost alternative: <option>, honest reason it lost
Cost paid: new moving part / per-request latency / tolerated incorrectness / money
Reversibility: easy | painful (what a rollback costs)
Correctness policy: what is now ALLOWED to be slightly wrong (and what never is)
```

## Session protocol (summary - full version in references/session-protocol.md)

1. One fresh chat/session per feature unit. Context rot is real: degradation starts near 50k tokens even in a 200k window. Clear on anything new; compact only to continue the same work. When compacting, always preserve: current unit, full list of modified files, test/build commands, open questions.
2. **Tiered reading** — never preload the whole folder: always read overview + workflow-rules + progress-tracker + memory.md; then read on demand — the spec for the unit being built, code-standards before writing code, architecture + library-docs before touching that subsystem, ui-* files only for UI units, decisions.md before repeating any decision.
3. Prompt = "Read [spec NN]. Mark it in progress. Implement exactly as specified **without going beyond scope**." Short prompts: no stack, no folders, no UI rules - the files carry that.
4. Clarify before approve: the agent asks up to 5 targeted questions about underspecified areas of the spec, one at a time (confirming shared terminology as it goes), answers written back into the spec. Then it saves its plan. Human spends 5-10 minutes reading every plan before approving; a weak plan ("add database, update storefront") gets rejected. Run a read-only consistency check (spec ↔ plan ↔ task coverage) before implementing.
5. One boundary per unit; backend and UI are separate specs. UI first with mock data, logic second. Logic-bearing code ships its failing test first (RED-GREEN-REFACTOR) — no test-after.
6. Review against the spec's verification checklist, then converge (re-check until no gaps remain, appending only new tasks). Out-of-scope edits get reverted with a focused corrective prompt: file references + screenshots, every issue one by one, and exactly what done looks like.
7. Research the main thread does not need goes to parallel subagents: "return current behavior, relevant files, constraints, recommended approach; do not implement."
8. Push to git at every phase boundary. Per feature: push → PR → AI code review → fix findings → merge. Findings come back ranked critical/important/minor and are **never auto-fixed** — the human names which to resolve. Deferred findings get written down; nothing is silently ignored.
9. Completion = four separate jobs: verify (drive the real app), test (senior-grade suite), review (a different model than the one that wrote it), document (changelog from the real diff). Scale to risk.

## Sync pass (keeps month-three docs describing the real app)

Run at phase boundaries, before handing the project to another agent, or when docs and code seem to disagree:
- Re-read every context file against what the repo actually shows now.
- Code disagrees with a doc: flag the conflict, let the human decide. Never silently overwrite docs or code.
- Human-written edits are preserved; the sync only fills gaps and removes lines that are no longer true.
- Audit the instruction files against each other: AGENTS.md vs CLAUDE.md vs .claude/rules vs skills — flag contradictory or stale instructions (on Claude Code: `/doctor prompt-audit`). Delete legacy config that shadows the system: `.cursorrules`, `.windsurfrules`, singular `AGENT.md` (first-match loaders like Zed silently shadow AGENTS.md).
- Respect loader budgets: Codex concatenates nested AGENTS.md root-down with a 32 KiB `project_doc_max_bytes` cap — keep nested files tiny.
- Update AGENTS.md only because the project made a real decision worth remembering.
- Clear or archive current-issues.md before merges.

## Interop with per-change SDLC packs

Pipeline skill packs (e.g. ai-sdlc-style: explore→plan→design→apply→verify→archive per change) overlap with this system's session protocol. Keep them separate and map artifacts, never fork: this system owns per-project state (context/, decisions.md, progress-tracker, memory.md); the pipeline owns per-change docs. If one is installed, route its artifacts INTO context/feature-specs/ (its status/approval fields become fields of the spec), make context/decisions.md the single sink for its per-stage decisions, and forbid a parallel spec tree. Two sources of truth for "the spec of Feature 03" is the failure mode.

## Safety guardrails (never delegated to the agent)

- Humans create and manage `.env` / `.env.local`. Secrets never enter chat, ever.
- `.claude/settings.json`: deny beats ask beats allow. Deny reads of `.env*`; ask before `git push`, deletions, and deploys.
- `context/current-issues.md` is gitignored (pasted errors leak tokens) and cleared before merges.
- Instruction files are advisory; **hooks are the enforcement layer**. For rules that must never be skipped (re-inject the reading order on SessionStart including after compaction; block session end when progress-tracker/memory.md weren't touched), configure hooks in `.claude/settings.json` — see references/safety-permissions.md.
- Tool auto-memory (Claude's learned memory) is scratch: the system of record is always memory.md + context/; the sync pass resolves conflicts in favor of the files.
- Before installing any MCP/tool that writes into AGENTS.md: copy AGENTS.md somewhere safe, merge custom content back on top afterwards. Both need to be there; neither replaces the other.
- Vet third-party skills/plugins before installing: they contain executable scripts, not just markdown.

## Architecture defaults (seed in workflow-rules.md)

Start with a monolith; relational database by default; paginate every list; rate-limit every public endpoint; never keep secrets in code. Escalation ladder: bigger server before splitting → free checks before clever ones (a missing index looks exactly like a capacity problem; check it first) → reads (replicas, cache) before writes → queue before new infra → sharding strictly last. One technology in many roles beats a new system per need. Load-balanced components keep zero per-user state in-process. Do not couple the user-facing path to external services: answer fast, queue the slow work; "done now" means promised, not finished; background jobs get retries + dead-letter + human review. Before building, run the **value-source gate**: list every value the feature shows or computes and where it comes from; any value with no source is a decision nobody made - stop and ask. Correctness is a recorded policy per field: follower counts may be 30s stale; balances never. Outsource the typing, never the decision-making.

## References & assets

- `references/agents-md-rules.md` - inclusion test, size, hierarchy, rules splitting, growth discipline
- `references/context-files.md` - per-file content spec for all 12 context files
- `references/session-protocol.md` - full loop: plan mode, spec loop, error protocol, corrective prompts, subagents, git flow
- `references/recording-workflows.md` - templates for issues/decisions/memory/changelog + sync checklist
- `references/architecture-decisions.md` - cost ritual, escalation ladder, correctness policy detail
- `references/safety-permissions.md` - settings.json policy, hooks enforcement, secrets handling, review flow
- `references/claude-code-commands.md` - tool-specific mechanics: CLI flags (-p/-c/--resume), modes, keybindings, skills/plugins, billing, data policy
- `assets/*` - starter templates for every scaffolded file (copy verbatim, replace `{{PLACEHOLDER}}`s)
