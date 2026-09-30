# Feature 07 — Organisations, skills, and a navigation that matches the product

Asked for directly: *"create product owner agent and create a company with all the roles as various agents… the bot cannot talk between the bots and neither handle other bot under it, and no hierarchy"*, plus *"tools and mcp and skill are to be in there, run will go under scheduler, approval will be out, and sidebar need a redesign"*.

## What an agent can now do
- **Create an organisation.** `build_org` is a real, grantable tool. Ask Nova for a company and the reply is an `org_proposal` row: a chart of seats with reporting lines, nothing created until you confirm. Two paths produce it — the model router (`{"build":{…}}`) and, when the ask is clearly an org, a dedicated design call. If the model will not produce valid JSON, `orgTemplate()` supplies a reviewed 10-seat product company instead of failing.
- **Reporting lines are stored.** `agents.manager_id`, self-referencing. `normaliseOrg` accepts a `reportsTo` only for a seat listed **above** it, which makes a cycle impossible by construction — no visited-set dance, and a model cannot invent a loop.
- **Bots talk down and up the line.** `peersOf` = same team **plus** manager, direct reports, and siblings. `consultPeer` is recursive: a consulted seat may consult one of its own, and the answer rolls up. `MAX_DELEGATIONS` default 1 → 2 (a chained reply costs up to 4 model calls; `0` still disables delegation entirely).

## Capability surface (one place, three groups)
`src/lib/skills.ts` — six instruction-pack skills that genuinely change the system prompt, plus four listed-unavailable with a reason (web research, durable memory, skill import, self-authored tools). **A skill grants no tool**; `skillPrompt()` output is the only text it can add, and the server drops any name that is not in the registry. MCP servers are now editable per agent (add/remove/rename, stdio|http) with the no-transport note still on the surface. The effort control shows the resulting token budget, because that budget is why reasoning models were returning empty answers.

## Navigation
Runs moved under **Scheduler** (routines then runs, one pane). **Approvals left the sidebar**: a pending approval is acted on where it appears — inline in the thread row and on the margin slip — and the decided history lives in Settings. Nothing became unreachable.

## Sidebar
Workspace name under the wordmark, agents grouped by team, a live **Organisation** tree (indented, subtree counts, click to open any seat), a **Delegations today** list, then pinned navigation and the model/calls status. The tree only appears when someone actually reports to someone.

## Verified live (dahl / MiniMax-M2.7)
- `createOrg` with six seats → 11 agents, one team, chart in the sidebar (`Chief Executive@10px → Product Owner@25px → Chief Technology@25px(sub 2) → Developer@40px → QA@40px`).
- Chief Technology asked "ask your Developer…" → SSE consult event, a `delegations` row `Chief Technology → Developer [consult]`, a consult card in the thread, and an answer that weighs the Developer's estimate.
- Company request through chat → `org_proposal` card with 10 seats and a working Create action.
- 101/101 unit tests, tsc, typegen, production build clean.

## Out of scope
Agents spawning agents without confirmation, cross-workspace orgs, an org chart canvas, run execution, and any skill that pretends to be a tool.
