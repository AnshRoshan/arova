# Recording Workflows - templates and timing

The root cause of project decay: "no plan the agent remembers, no record of the decisions, nothing making it build with what already exists instead of just piling more." These templates are the cure. Write at the moment of the event, never batch it to the end.

Enforcement: every rule in this file is advisory as prose. The deterministic layer is hooks (see safety-permissions.md): a SessionStart hook re-injects the reading order (also after compaction), a Stop hook refuses session-end when code changed but progress-tracker.md / memory.md did not. Custom compaction instruction goes in the instruction files: "When compacting, always preserve the full list of modified files, the current unit, test/build commands, and open questions."

## 1. Decision record (context/decisions.md)

```markdown
## D-07: Realtime transport - 2026-09-29
Trigger: two-tab collaborative editing must stay in sync without a custom websocket layer
Options considered: raw websockets / Liveblocks / Ably
Chosen: Liveblocks - presence + threads + webhooks in one dependency
Lost alternative: raw websockets - we would own scaling, reconnects, and presence typing
Cost paid: new SaaS moving part + per-room pricing; vendor lock on presence semantics
Reversibility: painful - transport abstraction would need writing first
Correctness policy: cursor presence may lag 200ms; document state may not lag at all
```

Rules: options and the honest losing alternative are mandatory ("the one who gets hired says why they would pick one over the other and what it costs"). Cost always named in one of: new moving part / single point of failure, per-request latency tax, tolerated incorrectness, money. Reversibility stated, because "going back is its own painful migration".

## 2. Flagged assumption (per feature, tracker + decisions)

Taken when building under pressure with an undecided value source:

```markdown
FLAGGED: order total uses the cached price, not the price at checkout time.
Assumed acceptable to ship Feature 12. Nobody has decided this. Needs a real call.
```

"You can override and build anyway, but the moment you do, the assumption gets written down and flagged on that feature until it's properly decided. So even the corner you cut is visible, sitting in a file instead of being lost in the chat forever."

## 3. Issue entry (context/current-issues.md)

```markdown
## Issue 3 - pending verification
Symptom: after 100% zoom, header still says "profile needs attention"
Suspected file: src/components/Header.tsx
Fix direction: completion % is derived, not stored; the label condition reads stale state
Definition of success: at 100% the header shows "complete"; no other label changes; build passes
```

Statuses: `open` → `analyzing` → `approved` → `fixing` → `pending verification` → `resolved`.

**Error protocol** (mandatory, prevents "the spiral of trying to fix its own bugs while breaking 10 other things"):
1. "Explore the current-issues file and deeply analyze the problem."
2. Return the analysis plus the intended fix **and wait for the green light before executing.**
3. Reproduce reliably first - a bug you can't reproduce on command is a bug you can't prove you fixed.
4. Form one theory about root cause; test that one thing before touching anything else. Wrong? Throw the change away - no dead edits left behind.
5. Fix the cause, not the symptom. Don't clamp a null; find out why it was null.
6. Write a test that fails without the fix and passes with it.
7. Hunt for the same mistake hiding elsewhere in the code.
8. If the bug is a bad decision, say so and send it back to the plan instead of papering over it with a patch.

## 4. Session handoff (memory.md)

```markdown
# Memory
_Last updated: 2026-09-29, end of session 4_

## Current state
Homepage fully implemented and matches context/designs/landing-page.png.
Auth works with Better Auth; sessions verified in incognito.
Build, lint, typecheck all clean.

## Next step
Start Feature 02 of Phase 1: authentication - see context/feature-specs/02-auth.md.
Begin in plan mode; DB schema change is involved.

## Open questions (carried forward, unresolved)
- Rate limit for the public job search: 10/min or 30/min? (D-05 pending)
- Do we need soft deletes for applications? Never decided.
```

Write it at the end of every session. Open questions must survive across sessions; the whole point is that nothing quietly evaporates.

## 5. Changelog / PR description
Generated from the **actual diff**, not from the agent's memory of what it thinks it changed. Per feature or phase: what changed, why, files touched, how it was verified, what is still open.

## 6. Sync pass checklist
Run at phase boundaries, before handing off to another agent or human, or when docs and code seem to disagree:
- [ ] Re-read each context file against what the repo actually shows now.
- [ ] Code disagrees with a doc → flag the conflict for the human; never silently overwrite docs or code.
- [ ] Preserve human-written edits; only fill gaps and remove lines no longer true.
- [ ] Verify progress-tracker states are mutually exclusive (reviewers have caught features listed as both current and complete).
- [ ] Verify decision records cover every tool/library now in the stack; add missing ones.
- [ ] Clear/archive current-issues.md before a merge.
- [ ] Update AGENTS.md only for decisions worth remembering in every session.
- [ ] Confirm every context file's claims are still checkable (paths exist, commands run).

"So the context you read in month three still describes the app you actually have."

## 7. In-app agent logging (agents that run autonomously)
When the product itself calls an agent, log its paper trail in the database, not just the console:
- `agent_runs` - one row per run: inputs, items found, start/complete times, status.
- `agent_logs` - one row per step: level (info/success/warning/error), message, timestamps.

Errors get diagnosed from these tables. "A job you dropped in a queue and never checked on is a job that you're quietly not doing."

## 8. Registry hygiene (UI)
Before building a component: check `ui-registry.md` for a similar one. Match its exact classes if found. Otherwise build to ui-rules + ui-tokens, then append it to the registry with its file path and variant list. The registry is what stops the fifth card component from existing.
