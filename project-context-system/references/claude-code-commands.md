# Claude Code Operating Commands & Mechanics

Everything from the Claude Code course that is tool-specific but worth recording. Other tools have equivalents; the habits transfer.

## CLI
- `claude` interactive · `claude "task"` start with a task · `claude -p "q"` one-off headless, exits (pipeable: `tail -n 200 app.log | claude -p "find anything unusual"`) — use for automation/CI.
- `claude -c` continue the most recent session · `claude --resume` pick an older session. This is how a memory.md handoff gets resumed without starting blind.
- Subscription billing for interactive work; API billing for automation/CI.

## In-session
- Modes: manual → auto-accept edits → plan → auto. **Shift+Tab** cycles; `/plan` jumps to plan mode. Auto mode behaves as soft-allow/soft-deny.
- **Esc** interrupts mid-run to correct a wrong assumption. **Ctrl+C twice** stops. **Ctrl+G** opens the current plan in a markdown editor for direct pre-approval editing.
- `/init` generates CLAUDE.md from the codebase — read the result, delete what it inferred from package.json, add what it couldn't know.
- `/context`, `/context all` show what fills the window; `/memory` lists loaded memory files; `/permissions` inspects the rules; `/help`, `/model`.
- Verify the deny rule by attempting a real `.env` read — verify like code.

## Model choice by task
Fast model: routine dev, small fixes. Strong reasoning model: architecture, hard debugging, large refactors, multi-system changes. `/model` switches mid-session.

## Watching the agent
Don't only read the final answer — watch which tools it uses (Read/Glob/Grep/Edit/Bash/WebSearch). Tool choices reveal wrong assumptions before the summary hides them.

## Auto-memory coexistence
CLAUDE.md is what you intentionally tell the agent; auto-memory is what the agent learns about you (per-project memory folder, first ~200 lines / 25KB loaded). In this system: **treat tool auto-memory as scratch — the system of record is memory.md + context/**. Never let learned auto-memories contradict the files; the sync pass resolves in favor of the files.

## Skills (mechanics beyond SKILL.md)
- `$ARGUMENTS` in a SKILL.md body: the skill carries the process, the human only describes the feature.
- Project skills: `.claude/skills/<name>/` · global: `~/.claude/skills/`.
- skill-creator: builds and tests skills with eval cases (with/without the skill). skill-doctor: shows loaded skills that are unused and costing context.
- Plugin = package of skills + MCP + other capabilities (`claude plugin install stripe@claude-plugins-official`, `/plugin`). More trust surface than a skill — vet harder.

## Security completeness caveat
A deny-rule stopped the agent reading a secret, but nothing checked the secret was STRONG. Guardrails check access, not quality: reject default/short secrets, generate with `openssl rand -base64 32`.

## Data policy
Local file search does not mean data stays local — file contents are sent to the model. Check account/company data policy before pointing an agent at proprietary repos.
