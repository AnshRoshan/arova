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

## Organisation channel (Feature 11)
- `pane === "channel"` in `Workbench`: the durable record of one org's briefed work. Reached from `.group-channel` (the channel-count pill in each `.bench-group` label) and from `Channel` in `OrgManager`. The bench panel stays on screen while the channel is open (`section` maps `channel → agents`), because the channel is a view *of* the bench.
- `.channel-head`: the stored `teams.brief` line plus `.channel-seats` → `.seat-chip` (identity tile, name, `lead` marker on the seat a brief actually reaches, `.sp-dot` state from `seatTone`). Clicking a chip opens that seat's own thread.
- `.thread.channel`: `.entry` rows with `.tag` kind labels (`notice`, `teammate post`, `report`) and state tags (`stopped at the budget`, `no answer`, `not answered`, `partial`, `stopped by you`, `budget reached`). A `channel_post` prints its question in a reused `.consult` block ("X asked Y"); `.post-foot` carries the mono provenance (`model · N chars · N reasoning · N tokens (est.)`) and the **Run steps** link that opens the stored `runs` row in the existing `RunDialog`.
- `brief()` in page.tsx: the channel's own SSE reader. Handles `start` (keeps `liveRunId`), `consult`, `post` (appends the landed row before the board refresh), `delta`, `end`. `resolveLead` is imported from `src/lib/channel.ts` — the UI does not restate the rule for who receives a brief.
- `.composer` in channel mode: placeholder "Brief {lead} for {org}", the middle composer note states the summons ceiling ("up to N teammate posts land here"), and Stop renders only while the report streams.
- **Deleted with Feature 10, still absent:** the flat `.hop` delegation list. A hop is now a channel post or a `.consult` card, never an index row.

## Organisation memory and triggers (Features 12, 14)
- `.memory-bar` sits under the channel head with two pills: **Memory** (count of stored notes) and **Trigger** (count of live tokens). Both expand `.memory-panel` in place; neither opens a new pane, because both belong to the org you are already looking at.
- `.memory-panel` (memory): a kind select + one-line input + **Remember**; **Distil from the channel** labelled `1 call`, whose results appear in a dashed `.memory-propose` box with a Save per candidate — nothing is written until a human saves it. Each `.memory-row` shows a `.memory-kind` chip, the note, and a mono line of who/when/`used N times`/`from N post(s)`/`superseded`. `.icon-btn` pin (Pin/PinOff) and forget (Trash2). A superseded note renders `.stale` — struck through, still listed, so a correction reads as a correction.
- `.memory-panel` (triggers): a label input + **Create trigger**, then one row per token with the full copyable `curl` line in `.call-line` (origin filled after mount, never guessed), its fire count and last fire, a Copy button and a revoke. The panel's own copy states there is no worker and nothing continues after the call.
- Provenance carries memory use: `memoryNote()` appends `· from N org memories (X chars)` to the seat thread's `.prov` summary and to the channel's `.post-foot`. It prints only when the server stored `metadata.memory`, so a claim of recall always has a row behind it.
- `AgentDialog` gains the **Add a teammate as {seat}** block (`.dialog-hire`): name, role, who it reports to, and a hint that states which side of the staffing rule the acting seat is on — including the honest third case where no creator seat is designated and nothing is gated yet.
- `approval_withheld` is a thread row kind, not an approval card: the queue does not grow when a seat has been refused three times.

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
