# AGENTS.md / CLAUDE.md Authoring Rules

## Purpose
The agent won't automatically remember that you use npm, or that the same mistake was already corrected twice. AGENTS.md is the file that tells the agent how the project actually works: the stack, the commands, the conventions. Without it, every new session opens blind and guesses. It is loaded automatically at session start. AGENTS.md is the cross-tool standard (Codex, Cursor, Copilot, Zed, Jules...); Claude Code reads CLAUDE.md, and reads AGENTS.md only when no CLAUDE.md exists - so keep the real content in AGENTS.md and make CLAUDE.md a thin wrapper whose first line is the import `@AGENTS.md` (imports load into context at launch; a prose pointer is one skippable Read away). When both files exist Claude reads CLAUDE.md only, so duplicated rules across the two filenames drift - one source of truth.

## Mental model
The context files are the knowledge; AGENTS.md is the instruction manual that tells the agent how to use that knowledge. Without it the agent skips a file, reads them in the wrong order, or misses a rule. With it, every session starts exactly the same way. Its job is wiring, not content.

## The three sections

1. **Tiered reading order** - not "read everything always"; every session pays a token bill for the full folder otherwise. Split it: **always read** overview.md + workflow-rules.md + progress-tracker.md + memory.md. **Read when the task touches it**: the unit's spec before implementing, code-standards before writing code, architecture.md + library-docs before that subsystem, ui-* files only for UI units, decisions.md before making or repeating a decision. Same principle as skills: lightweight identifiers up front, full content loaded just-in-time. Then: update the progress tracker after every change. Reading the small always-set costs far under the tenth of the tokens it saves in back-and-forth, mistakes, and bug-fixing.
2. **Invariant rules** - facts and rules true every session: package manager, `npm run dev`, test/typecheck/build commands, "use Drizzle for all database access; schema lives in src/db/schema; never write raw SQL unless specifically requested", "no hard-coded hex values", "load the library skill before touching any third-party library", "work on one feature unit at a time - never combine unrelated system boundaries in one implementation step". That last rule alone prevents most agent-caused failures.
3. **Skill index** - every installed skill/command and exactly when to use it.

## Inclusion test
"If removing this instruction would probably make the agent assume the wrong thing, keep it. Otherwise ask whether it really needs to be in every session." Never put something in just because the agent might need it one day. Don't dump the entire project structure or huge API documentation.

## Specificity
Vague imperatives tell the agent nothing: "write high-quality code", "follow best practices", "make the UI beautiful", "keep everything clean". Replace with behavior-changing facts:
- "format code properly" → "use two-space indentation"
- "test your work" → "run npm test before finishing the task"
- "keep API organized" → "API handlers live in src/api/handlers"
- design rules: "editorial, product-focused, reuse the design system, no dashboard-style UI, no purple gradients"

The more specific, the less the agent has to guess.

## Size
Well under 200 lines, but don't treat 200 as a target. If everything useful fits in 30-40 lines, that is better. Each line spends the attention budget.

## Hierarchy
1. Personal `~/.claude/CLAUDE.md` - true across all your projects.
2. Project root AGENTS.md (+ CLAUDE.md wrapper importing `@AGENTS.md`) - commit to git so everyone gives the agent the same instructions.
3. `CLAUDE.local.md` (project root, gitignored) - personal per-project overrides (local test accounts, sandbox URLs); Claude appends it after CLAUDE.md per directory. Never committed.
4. Nested AGENTS.md - monorepos: one lean root file for what is true everywhere, separate files next to the parts with their own rules. The closest AGENTS.md wins (OpenAI's own repo runs ~88 nested files). The agent only pulls the instructions relevant to the area it is actually working on. Budget: Codex concatenates nested files root-down with a 32 KiB `project_doc_max_bytes` cap and honors `AGENTS.override.md` - keep nested files tiny. Delete legacy shadowing config: `.cursorrules`, `.windsurfrules`, singular `AGENT.md` (first-match loaders like Zed silently shadow AGENTS.md).

## Rules splitting
When AGENTS.md grows, split into `.claude/rules/` - `testing.md`, `database.md`, `security.md`, `storefront.md` - each with a path scope, so the agent loads them only when working in matching files.

## Growth discipline
- Grow only because the project made a real decision worth remembering ("this is exactly how AGENTS.md should grow - not because you want a bigger file").
- Keep it updated; remove things that aren't true anymore. Sometimes the right change is deleting.
- "If the agent keeps making the same wrong assumption every time, that is a sign your project instructions are missing or wrong."
- AGENTS.md is guidance, not enforcement. Hard blocks live in permissions/hooks, not prose.
- Facts go in AGENTS.md. Repeatable processes become skills. One-time tasks you just ask.
- Keep tool-generated preamble that helps (e.g. Next.js's "training data may be outdated, read the install docs before writing code" note).
- If an external MCP/tool rewrites AGENTS.md: back the file up first, then merge your custom content back on top. Both need to be there; neither replaces the other.
