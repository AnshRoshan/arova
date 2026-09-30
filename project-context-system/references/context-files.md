# Context Files - per-file content spec

Everything in `context/` is what the coding agent reads before it does anything. This is how it stays consistent across every session, commit, and unit of the build. The files travel with the project for its entire life.

## overview.md
What the product is, who it's for, every page/screen and the full user flow, what's complex, and **explicitly what is in scope AND what is deliberately out of scope**. The out-of-scope list is "telling the agent: don't even think about them". No scope creep.

## architecture.md
Tech stack plus the *role* of each tool (so the agent doesn't invent a custom websocket implementation when Liveblocks is already in the stack). Folder structure, system boundaries, data flow, DB schemas. And the invariants: "rules that the system must never violate" - e.g. "API routes contain no UI logic. Components contain no DB logic. Agent code in /agents never imports from components or actions. Server actions never call agents."

## build-plan.md
Every feature defined, scoped, and sequenced: "N total features across M phases", numbered "Phase 1 Feature 01...". The agent never has to decide what comes next. Keep scope separate from tech: the plan says *what*; the stack is its own decision, so "your plan doesn't rot the day you change the tool". New ideas get appended as new phases/features during the build.

## code-standards.md
TypeScript rules, naming conventions, framework-version conventions, file/folder naming, component structure, error handling, server actions patterns.

## workflow-rules.md
How the agent behaves: one feature unit at a time, stay in your lane, what to do when something needs a decision (stop and ask), the error protocol, the recording obligations. This is the discipline layer - copy the template verbatim.

## library-docs.md
Project-specific usage per third-party library, with the rule: "before using any library, check if an MCP server or skill is configured for it, read that, and only then act." Updated whenever a library integration decision is made (versions, config paths, env var names).

## ui-tokens.md (UI projects)
Every color, spacing, radius, typography value as CSS variables. No hardcoded hex anywhere in code.

## ui-rules.md (UI projects)
Full design-system behavior: fonts, layout, cards, buttons, badges, states. Generate from Figma via MCP when available. Include anti-AI-ish bans (gradients, oversized hero sections) if they don't fit the product.

## ui-registry.md (UI projects)
Living component catalog, starts empty. Rule: "before building any UI, check if a similar component exists. If yes, match its exact classes. If no, build it following ui-rules and ui-tokens, then add it here."

## decisions.md
The decision log. One entry per hard technical decision, format in recording-workflows.md. "That's not buried in code. It's written down where you can see it and overrule it."

## progress-tracker.md
"The only file that actually updates constantly throughout the build." Current phase, current goal, in progress, completed, up next, session notes with concrete details (tool versions, "Prisma config uses prisma/ and not some other path", "database URL reads from .env"). Starts intentionally empty - "it reflects the actual state of the project: nothing has been built yet." States stay mutually exclusive: nothing is both current and completed. Recovery promise: "if we come back 2 months later, it'll know it's using shadcn, Tailwind v4, dark theme only, and all the architectural decisions."

## current-issues.md
The bug queue. Gitignored - pasted errors have leaked JWTs into public repos. Numbered issues: symptom + suspected file + fix direction + definition of success. Cleared/archived before merges.

## feature-specs/
One file per unit of work, `NN-kebab-case.md`, zero-padded sequence = build order. ~20-30 specs for a full production app is normal. Each spec contains: goal (concrete, measurable), files it touches, exclusions ("do NOT add X, Y, or Z yet - that's the keyword right here"), and a verification checklist ("all components import without errors, no default light styling, build passes, no hardcoded colors"). Backend and UI are separate specs; big features split into 2-3 independent specs that together complete the experience.

## designs/ and screenshots/
`designs/`: a visual reference per page (landing-page.png, dashboard.png) - "when the agent builds UI, it's not inventing, it's matching what's already there." `screenshots/`: ongoing visual feedback for corrective prompts.

## Portability
Same folder works across Claude Code, Codex, Copilot, Cursor. Hand the folder to another developer and their agent continues from there. Start slow, keep adding as you go; reuse and slightly adapt the same files for future projects.
