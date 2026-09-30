# Safety, Permissions & Secrets

CLAUDE.md/AGENTS.md is guidance, not enforcement: a rule like "never modify migration files manually" will be *followed* but not *blocked*. "For something that absolutely shouldn't happen: permissions, sandboxing, and hooks." Use hooks when something should happen automatically every time.

## Hooks - the deterministic layer
Instruction files are advisory; hooks are the only guarantee. Wire what must never be skipped:
- **SessionStart hook**: re-inject the reading-order reminder at launch *and after every compaction* (this is how long-session systems survive context loss - the bootstrap rides the hook, not the chat).
- **Stop hook**: run a small check script that fails the stop when the session touched code but left progress-tracker.md / memory.md unmodified - the recording table stops being prose-only.
- Keep hook scripts tiny and dependency-free; they run on every session, so their failure mode is your whole workflow breaking. Test them like code before trusting them.

## .claude/settings.json (committed)
Three rule types: allow / ask / deny. When several match, precedence is **deny → ask → allow - deny wins first**.

Policy goals: "remove the boring prompts while keeping control around the things that matter." Don't click "don't ask again" on everything without thinking.

Baseline template (adjust commands to the real stack):
- **allow:** `npm run build`, `npm run test`, `npm run typecheck`, `npm run lint`, `git status`, `git diff`, `git log`
- **ask:** `git push`, `rm`, installs, deploys, migrations
- **deny:** reading `.env*` (all of it), editing migration files

Test deny rules with a real `.env` present - "verify like code." A permission that isn't tested is a permission that isn't there.

## Secrets
- Humans create and manage `.env` / `.env.local`. "We don't want the agent to handle our environment variables."
- "You don't want to paste the secret into the chat... we'll never tell it to Claude." Reference env var *names* in context files, never values.
- `context/current-issues.md` gitignored: a pasted stack trace once exposed a JWT on GitHub and got flagged by the code reviewer. Cleared before merges.
- Production keys swapped only at deploy time; never in any committed file.

## Skills, plugins, MCPs
- Skills: `.claude/skills/<name>/SKILL.md` - the directory name becomes the slash command. Frontmatter `description` states *what it does and when to use it*; "a weak description is the main reason a skill doesn't trigger." Progressive disclosure: metadata always loaded → SKILL.md when relevant → bundled references/scripts on demand.
- `disable-model-invocation: true` on side-effectful skills (deploy, commit) so only the human triggers them.
- "A skill that sounds good isn't necessarily one that works - test it." Don't design the perfect skill on day one: use it, watch where the agent makes mistakes, fix the skill.
- Vet third-party skills/plugins before installing: "they can contain scripts, command executions, tool access - read the SKILL.md and any scripts before installing." Don't install random plugins; they contain much more than markdown. Trust where they come from.
- Before any MCP install that writes into AGENTS.md: back the file up, merge custom content back on top afterwards.
- Library-authored skills beat guesses: install the official skill for each named tool in the stack before speccing its integration.

## Code review flow
Commit + push, then run the scanner (e.g. CodeRabbit) - also locally pre-push via extension. Per finding: real? relevant? fix now? Deferred findings get written down. "What you never want to do is silently ignore it." Hand findings to the agent as "investigate first without modifying anything, confirm, then fix" - not "fix this". Re-scan after every major feature.

## Subagents & delegation safety
Subagent research prompts end with "**Do not implement anything yet.**" Investigation is read-only by default. Built-in explore/plan agents or explicit "use a separate subagent to..." keeps investigation out of the main context.

## Autonomy ramp
"Don't start every project by enabling every feature. Let the problem you have create the reason to use that feature." Good context → small tasks → review what it does → repeated processes become skills → subagents when work can happen separately → "and slowly give the agent more freedom as you understand how it behaves."
