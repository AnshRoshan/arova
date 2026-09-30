# project-context-system

A drop-in engineering system for coding agents (Claude Code, Codex, Cursor, Copilot, Qoder). At project start it scaffolds the complete state-in-files layer — `AGENTS.md` + `CLAUDE.md` (importing `@AGENTS.md`), a `context/` folder (overview, architecture, build-plan, code-standards, workflow-rules, library-docs, UI tokens/rules/registry, decisions log, progress tracker, current issues, numbered feature specs, designs, screenshots), `memory.md` session handoff, `.claude/` settings, rules and `CLAUDE.local.md` — then runs the session protocol that records every decision, bug and piece of progress while the agent works, so any future agent or teammate picks up with zero re-explaining.

## Install

Claude Code (personal):
```bash
cp -r project-context-system ~/.claude/skills/
```

Qoder CLI (personal):
```bash
cp -r project-context-system ~/.qoder/skills/
```

Project-level (any tool that reads `skills/*/SKILL.md`, AgentSkills layout):
```bash
cp -r project-context-system <your-project>/.claude/skills/
```

## Use

1. Start a project and say **"set up the project context system"** (or `/project-context-system`).
2. Answer the ~10-minute planning conversation — the skill builds every file from your answers, never from guesses.
3. Work per spec with one fresh session per feature unit; the agent updates tracker, decisions, issues and memory automatically as it works.
4. `gitignore` what the installer tells you (`context/current-issues.md`, `CLAUDE.local.md`).

## Layout

| Path | Purpose |
|---|---|
| `SKILL.md` | Bootstrap, recording table, session protocol, sync pass, safety, interop |
| `references/` | Deep docs loaded on demand (authoring rules, context-file spec, session protocol, recording workflows, architecture decisions, safety/permissions/hooks, Claude Code commands) |
| `assets/` | 20 starter templates for every scaffolded project file |

Built by distilling five senior-engineer AI-build courses plus a golden-standard audit against Anthropic docs, the agents.md standard, OpenAI Codex guidance, GitHub Spec Kit, obra/superpowers and Anthropic's context-engineering posts.

MIT-style: copy, adapt, reuse in your own projects.
