# Feature 11 — The org channel

## The problem
Every message belongs to exactly one agent (`messages.agent_id` is NOT NULL; 0 rows carry a team), so when one seat consults another the work has no home. It renders as a `.consult` card inside the asker's reply and a `delegations` row, then disappears from the shared record. The human briefs a lead, the lead does real coordination, and none of that coordination is legible anywhere except as a fold in someone else's thread.

This is not primarily a chat feature. It is **the durable record of agent-to-agent work**, and the channel is the place that record lives.

## What already works — do not rebuild it
- **Peer-to-peer reach.** `peersOf` (route.ts:293) already returns the whole team plus everyone reachable through reporting lines. Product Owner can consult Chief Technology directly today. Reporting lines gate nothing.
- **The hop is already audited.** Every consult writes a `delegations` row with both agents, the question, the answer, the model and token counts.
- **Per-seat run state already exists.** `runs` + `run_steps` are real and the activity board prints them.

## Decisions (user, 2026-09-30)
1. **Fan-out: lead + 2 summons.** One brief produces at most two peer consults and one report back. Keeps `MAX_DELEGATIONS=2` as the ceiling; ~3–7 model calls per brief against a daily budget of 60. No cascading, no autonomous queue.
2. **Channel shows who is working; clicking drills into the run.** In-flight posts link to that seat's `runs`/`run_steps`. No step-by-step streaming into the channel.
3. **Hermetic organisations.** An agent may consult only seats in its own org, and channel history is scoped to that org. This **removes** cross-org reach that works today — deliberate.
4. **Godfather founds, lead staffs.** One designated creator seat may found organisations; no other seat may. An org's lead may add seats inside its own org only.

## Data model
- `messages.team_id uuid NULL REFERENCES teams(id) ON DELETE CASCADE`, plus `messages.agentId` becoming **nullable** (a channel post is authored by a seat, but the row's subject is the org). Keep one of `agent_id` / `team_id` NOT NULL via a check constraint.
- `teams.creator_agent_id uuid NULL` — the Godfather seat, set at creation.
- `teams.lead_agent_id uuid NULL` — the seat the human briefs.
- No new table for the loop. A brief is a channel message; the summons are `delegations` rows carrying `messageId` = that channel message; the report is another channel message with `metadata.fromDelegation`.

## Server behaviour
- `postToChannel(teamId, agentId, content, metadata)` — the single write path for channel rows, so every post is attributable.
- A brief to the lead runs the existing routing pass; consults it triggers **post into the channel** as their own rows instead of nesting. The lead's synthesis post names which peer posts it used.
- `peersOf` gains a hard `teamId` filter (decision 3). Cross-org reach returns nothing.
- Creation guard (decision 4): `createOrg` requires the acting agent to be the workspace's designated creator; `createTeam`/`addSeat` requires the acting agent to be that org's lead and the target org to be its own. Refusals name the rule, per the existing plan-mode precedent.

## UI
- The section panel gains a channel entry per org; opening it shows the org's thread of posts, each attributed to its seat with the existing identity tile.
- An in-flight post shows the same live affordance as a reply (caret, Stop is **not** offered mid-hop — the brief is one turn) and links to the run.
- The activity board keeps its job: it prints stored rows. Channel posts are rows, so a new post appears there too.

## Constraints that must survive
- **Never imply an action the server did not record.** A post that was cancelled says so; a peer that was asked but never answered is shown as asked, not as done.
- Every number on a channel post traces to the board payload; token figures keep "(est.)" unless reported.
- Model output renders only through `src/lib/markdown.ts` into React nodes.
- Cool graphite tokens, one azure, semantics reserved for stored state. No new colours for channel roles.
- Budget exhaustion mid-brief must post a visible "stopped at the daily budget" row naming which peers were never asked. Silence here would be the worst possible failure of this feature.

## Out of scope (recorded, not implied)
- Cascading or autonomous multi-turn loops; a background worker; per-org memory as a stored knowledge base (decision 3 scopes *reach and history*, not a new memory system); cross-org collaboration; retention or pagination (see L-06).

## Verification checklist
- Brief the lead; assert ≥1 peer post exists as its own channel row with a `delegations` row pointing at it.
- Assert the lead's synthesis post names the peer posts it used.
- Ask an agent to consult a seat in **another** org; assert refusal and no delegation row.
- Ask a non-creator seat to found an org; assert refusal naming the rule.
- Set `DAILY_MODEL_CALLS_LIMIT` one call below a brief's cost; assert the visible stopped row names the un-asked peers.
- Reload mid-brief; assert no duplicate post and no replay.
- Drive it live against the configured endpoint at 1440×900 and 390×844.

## Also fix while here (L-11)
An org named by the user was created as "Nexus Labs". Thread the requested name into the `org_proposal` card and the `orgTemplate()` fallback, and make a repeated `createOrg` for an existing org name refuse rather than stack seats.

## Status: built and verified (2026-10-01)
Gates: `npx next typegen`, `tsc --noEmit`, `npm test` (127/127), `npm run build`, `/api/health` — all green. Schema pushed to `arova_demo` (the database this project owns) with 0 rows violating the new one-subject check.

Checklist, run against the live app — an API driver against a brand-new workspace, then the same channel in a real browser against the configured `dahl` endpoint:

| Check | Result |
| --- | --- |
| A summon is its own channel row, authored by that seat | pass — `agent_id` null, `team_id` set, `metadata.authoredBy` = UX Researcher |
| Its `delegations` row points at that post | pass — `messageId` is the channel row's id |
| The report names the posts it built on | pass — `metadata.usedPeers`, and the first line of the stored content |
| Cross-org reach refused | pass — a rival org's lead produced 0 posts and 0 fresh hops when told to consult hex-aq's seat |
| Non-creator founding refused | pass — 400: "Product Owner is not this workspace's creator seat… Only Nova…" |
| Duplicate org name refused | pass — 400 "already exists", and no second team row (L-11's stacking half) |
| The requested name survives (L-11) | pass — `teams.name = hex-aq` from an unquoted "with name hex-aq" |
| Budget exhaustion leaves a visible row | pass — with `DAILY_MODEL_CALLS_LIMIT=2`: "…Research was asked and answered. Compliance, Numbers were never asked, so nothing was done on their side…", run `WAITING_FOR_TOOL` |
| Reload mid-brief: no duplicate, no replay | pass — aborted at the 12th delta: 1 human row, 1 peer post, 1 partial report row (`stopped` + `incomplete`), run `CANCELLED`, no duplicate kinds |
| Live at 1440×900 and 390×844 | pass — `.impeccable/cdp-channel.cjs`: 4 distinct growing stream frames, stream and settled captures byte-different, the run dialog showing Brief received → UX Researcher asked → Report posted, `CONSOLE: []`, no horizontal overflow in the document *or* in `.sheet-body` |

Found while verifying, and fixed: the routing pass was spending unbilled calls (see D-15); a closed reasoning block in the middle of a report leaked its tags into what the reader was shown as the answer; the channel pane left the section panel blank; `.post-foot` and `.entry-head` overflowed the column at 390px; the live row kept saying "asking X" after the peer had answered, which also hid Stop; and a brief's run summary printed the model's raw reasoning block on the activity board.
