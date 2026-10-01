# Feature 13 — The boundary and the door

Came out of `context/feature-specs/../feature-parity.md` §5 rather than from a new product wish: three
things the parity study said were cheap, real, and already half-present in the code.

## The problem
1. **A refusal went nowhere.** A human could reject an approval, and the seat would simply ask again —
   `approvals` recorded the "no" and nothing read it. Dots interrupts an agent after 3 consecutive
   denials or 10 of the last 50; we collect the same signal and act on none of it.
2. **Nothing outside the browser could start work.** Grok fires an automation from an email; we fire from
   a clock, and only when someone opens the app. There was no way for an event to reach an organisation.
3. **Two controls lied.** `maxTurns` was edited in the capabilities UI, normalised in `tools.ts`, and read
   by no server code. And the unary reply path (`sendMessage` with `stream:false`) silently ignored
   `approval` and `build` routing decisions that the streaming path honoured — so the same message
   behaved differently depending on which client asked.

## What was built
### The boundary — `denialBreaker` (`src/lib/channel.ts`, tested)
A pure function over the seat's *decided* approvals: 3 consecutive refusals, or 10 refusals in the last
50. When it trips, `approvalReply()` returns an `approval_withheld` row instead of inserting an approval,
and audits `approval.withheld`. Both reply paths call the one helper, so a seat cannot ask around the
breaker by which client it was reached from. Unanswered PENDING requests are never counted as denials.

### The door — `POST /api/trigger` (`src/app/api/trigger/route.ts`)
A bearer token, created per organisation (`createTrigger` / `revokeTrigger`, listed in the channel's
**Trigger** panel with a copyable `curl` line), scoped to exactly one org. A call posts the ask into that
channel authored by the trigger (not as "you"), runs the same `runBrief` the browser uses **inside the
request**, and answers with the run id, status and a plain-language summary. Guards: unknown/revoked token
→ 404, no token → 401, missing body → 400, org deleted → 410, paused lead → 409, and a 60-second cooldown
measured from the **end** of the last brief so a hammering webhook cannot spend the day's budget.

This is the honest half of "always-on": the work runs because something called, and the panel's own copy
says nothing continues after the caller hangs up. There is still no worker.

### The two lies removed
- `summonCeiling({ envMax, seatMaxTurns })` now bounds the brief loop, each peer's own recursion, and the
  chat path's consult option — a seat given one turn summons nobody. The channel bar prints the number the
  server will actually apply, and the tooltip names both inputs to it.
- `buildReply` reaches `build` and `approval` decisions like `streamReply` does, through the same helpers.

## Refactor it cost
`streamBrief` became `runBrief(workspaceId, team, lead, asked, send, isClosed)` plus a thin SSE wrapper, so
a caller with no browser can run a brief to completion. Mechanical, verified by re-running the browser pass
rather than trusted.

## Constraints that had to survive
- Nothing may be implied that the server did not record: the withheld row says it withheld; the trigger's
  channel post says which trigger asked; the cooldown refusal quotes the elapsed seconds.
- The trigger token is the only credential and grants exactly one org's brief — no read access, no other
  org, no admin surface.
- No new colour, no new pane: the trigger panel is the same `.memory-panel` treatment as memory.

## Verification (all live, 2026-10-01)
- Breaker: three `approval_request` replies raised and rejected in a seat thread, the fourth attempt
  returned `approval_withheld` — "I stopped short of asking again: the last three were refused in a row…".
- Trigger: created → fired (200, `COMPLETED`, report row in the channel, `metadata.viaTrigger` set) →
  second immediate call 429 → no-token call 401 → revoked token 404.
- Ceiling: a lead set to `maxTurns: 1` produced 0 peer posts and a report reading "completed without a
  teammate"; restored to 8 it summons again.
- Unary parity: `stream:false` now yields `approval_request` rows (it yielded a plain answer before).
- UI: the Trigger panel renders the copyable `curl` line with the real origin and token, the revoke button
  removes the row and toasts "Trigger revoked", no horizontal overflow at 1440×900 or 390×844, `CONSOLE: []`.

## Found while verifying (fixed)
A reasoning model enumerates the routing shapes verbatim inside its `think` block before emitting its real
decision, so `parseTurn` / `parseRouting` / `extractJsonObject` were reading a *hypothetical* as the answer.
`stripReasoning` now removes a closed block before any directive search (an unclosed one is left alone — a
stream cut off mid-thought holds no decision), and `splitReasoning` gained `rest` for exactly this use. Five
parse sites were fixed, including the org and roster proposals, which had the same latent bug. Distillation
also needed the stream timeout: a reasoning model spends its whole budget before the JSON arrives.
