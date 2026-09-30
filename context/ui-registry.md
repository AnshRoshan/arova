# UI registry
Component inventory of the built Workbench shell (Feature 10). Entries marked **deleted** are gone from the code, not hidden; do not resurrect them.

## Shell
- `Workbench` in src/app/page.tsx: the whole client surface — bench (organisation) · sheet (thread + composer) · board (activity). Reuse it; do not reintroduce a dashboard landing screen or a chat-list-beside-chat-window arrangement.
- `.bench` / `.bench-list` / `.bench-group`: the organisation as navigation. Teams with stored reporting lines render as trees (`SeatBranch`, from `manager_id`); a team without lines renders as a flat roster; unaffiliated seats group under "Bench". `.bench-empty-sheet` is the no-seats invitation.
- `SeatNode` + `SeatBranch` in page.tsx: one seat — hue tile, state dot, name, role/reporting line, stored message count, last-touch time. `--depth` drives the indent; the tree is drawn from stored `manager_id` rows only. `dot` comes from `seatTone` (runs, real pending approvals, due routines) and never from a guess.
- `.node.on` is the selected seat. `.index-foot` + `.pane-link` (with `.count` / `.count.muted` for seeded sample data) are the demoted Scheduler / Tools & MCP / Settings entries. `.foot-status` carries the pulse and "Model ready" / "No model key" — **no provider chip here**; the provider is stated in the header and at the point of action, not three times.
- `.sheet-bar` identity bar: `.ident` (tile + name + role, with the reporting line in words) and `.fact` chips (state, answering profile + model id, stored message count). `.only-narrow` Activity button opens the board as an overlay.

## Thread
- `.entry` row with `.entry-user` / `.entry-assistant` / `.entry-fault` variants; `.rule-day` date rules; `.thread-empty`.
- `RichText` in page.tsx: renders `parseMarkdown` output (`src/lib/markdown.ts`) into React nodes only — `.rich`, `.md-h2/-h3`, `.md-quote`, `.md-rule`, `.inline-code`, and `.code` (the app's only dark surface, with `.code-bar`, `.code-lang`, `.copy-btn`). Never reintroduce `dangerouslySetInnerHTML` for model output.
- `ReasoningFold`: the single renderer for a `think` block, closed or not, with "reasoning only" / "budget reached" states so a truncated reply is never a blank bubble.
- **`.prov` provenance line (new, replaced the evidence margin):** one `<details>` under the last real reply. Summary = state pill + provider + model id + right-floating mono measurement ("N chars · N reasoning · N tokens (est.) · saved H:MM"). The model id absorbs truncation; the provider label never gets chopped. Opening adds one dashed-ruled note stating exactly what happened.
- `pending` echo renders only while the server has not yet stored that message (`threadHasPending` guard) — otherwise a running-work poll refresh makes the user message appear twice.
- `.consult` wash card (one delegation hop), `.consulting` in-flight line, `.team-card` / `.org_proposal` / `.team_proposal` proposal cards with `.org-chart` + `OrgBranch` (proposed charts: rows, not openable seats), `.propose` routine/approval rows.
- `.composer` / `.composer-box` / `.send` / `.stop-btn` / `.composer-bar`; `.jump` pill when the reader has scrolled up. The composer's right-hand line is state-dependent: token estimate while typing, "Stop keeps what has arrived" while streaming, keyboard instruction only when idle and wide.
- Follow-scroll pins `.sheet-body` via `scrollTop = scrollHeight` — not `scrollIntoView`, which can climb to the document scroller and miss.

## Activity board
- `.board` / `.board-head` / `.board-body` / `.board-foot`. Sections appear only when they have rows: **In flight** (live SSE facts this client received, `.bd-row.live` + `.caret-st`), **Needs attention** (real pending approvals with inline Reject/Approve, runs blocked on the absent worker or executing, due routines), **Upcoming** (stored `next_run_at`), **Record** (newest-first stream of stored runs, delegation hops, audit events, decided approvals).
- `.bd-row` grid: state dot · label + note · mono stamp. `recordRows` is assembled in the render body from board payload only; `humanStamps()` reformats an ISO instant embedded in stored prose without touching the words around it.
- `.board-foot` states the deployment limit ("No background worker…") and today's calls against `limits.dailyModelCalls`.
- **Deleted:** `.margin`, `.slip` / `.slip-tab` / `.slip-dl` / `.slip-note` and its tape device, the printed `.key` state legend, the margin-slip scroll-tie, the flat `.tab` agent index, `.hop` index rows, and the agent-config margin slip (the Agent dialog owns that).

## Shared
- `State` / `FaceIcon` / `CopyBtn` / `State` chip helpers. `toneOf(status, sample)` is the only place sample rows are forced to grey.
- `hueOf(id)` / `identity.ts`: agent colour via `--h-*` inline custom properties on `.node`, `.entry`, `.ident`, `.consult`, `.bd-row.live`. Never used for status.
- `.chip` (ran/waiting/fault/idle/azure), `.seg`, `.blank`, `.field`, `.stack` / `.block` / `.kv` / `.meter`, `.rows` / `.row` with `.row-when`, `.pane-h2`, `.mcp-row`, `.tool-row` (available / **dormant** / unavailable), `.reach`, `.caps-*`, `.dialog-tabs`, `.who`.
- Deletion confirmation: the stacked `.scrim .dialog` driven by `askDelete` state, naming what is removed, Keep it / Delete. No `window.confirm()` anywhere in src.
- `CapabilitiesEditor` / `AgentDialog` in page.tsx: per-agent capability form (tool grants, permission mode, consult/handoff allow-lists, effort, max turns, temperature, skills, MCP). Reached from the Agent button. Grants may only narrow `src/lib/tools.ts`.
- Settings pane rows are generated from `board.profiles` plus `board.limits`; per-provider env hints and token figures come from there, not from hardcoded vendor names. Adding a vendor needs no UI edit.
- Nav is Scheduler | Tools & MCP | Settings. Approvals has no pane: pending ones are acted on inline in the thread and on the board's Needs attention rows; decided ones appear in the Record stream and in Settings.
- Scheduler pane header states the no-daemon limitation — never remove it. `.row-when` shows the next occurrence and the human schedule sentence in the workspace zone; the row's `.row-side` chip is `lastStatus` from the server.
