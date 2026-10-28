# Feature 23 — Stop means stop

## The problem
The composer's Stop button aborted the browser's read of the SSE stream. The server noticed only
indirectly: `send()` no-ops once the stream is cancelled, and `streamText` stops reading a provider
stream when `closed` flips. That is enough for the token-streamed path — the partial is stored and
labelled `stopped`.

The tool loop had no such path. It checks nothing between turns, so a reader who pressed Stop during a
read-only loop kept paying for up to four model turns and every tool call, then **stored a complete
answer** the reader had explicitly cancelled. Reload would show a reply they stopped, and nothing in
the record said a stop had happened. The button promised something the server did not do.

## What was built
### One signal, two sources (`src/app/api/board/route.ts`)
`streamReply` owns an `AbortController`; both `cancel()` (the ResponseStream being cancelled) and
`request.signal` (the client disconnecting) call `leave()`, which marks `closed` and aborts the
controller. The controller is passed to every **unary** model request a stopped reply could leave in
flight: the router call and each tool-loop turn.

### The gateway stops retrying a stop (`src/lib/model-gateway.ts`)
`requestCompletion` accepts an optional `signal`, combines it with the timeout (`AbortSignal.any`), and
treats an aborted caller as final: no retry, no `Retry-After` wait, no second attempt. A stop is not a
transient failure. (A test proves one fetch attempt, then the caller's error.)

### The loop checks the door (`src/lib/tool-loop.ts`)
`runToolLoop` takes `shouldStop`, polled before each model turn and before each tool call. A tool
already under way is finished — half a command is worse than none, and its result is real — but nothing
new starts. The result carries `stopped: true` and `partial: true`.

### Nothing is invented afterwards
When the loop returns stopped, the route writes **no assistant row** and **no provider-error row**
(a cancelled request is not a provider failure). It records one audit event:
`chat.stopped · "Stopped by the reader before the tool loop finished; no answer was stored."` The
outer catch has the same guard, so an abort that surfaces as an exception is not stored as an error.

### The same contract reaches org briefs (`runBrief`)
`streamBrief` owns the same controller (fed by `cancel()` and `request.signal`) and hands its signal to
`runBrief`. The brief polls `stopped()` — `isClosed()` **or** the aborted signal — before the first
summons, before each routing pass, before each seat call, and before the report. The signal reaches the
router, `consultPeer` (and its nested consults) and the summons themselves, so a seat's unary call is
aborted rather than left to finish.

A stopped brief is a stop, not a gap: it writes one `channel_gap` row with `metadata.stopped` saying
when it stopped (before any seat was asked / before any teammate answered / before the report), records
`brief.stopped`, and finishes the run `CANCELLED`. It never writes the "did not answer" gap row and
never a `provider_error` row for the abort. Posts that already landed stay — they are the record of
what was gathered.

### A stopped stream closes its connection
`streamText` became `readSseText` in the gateway. When `shouldStop` flips it now calls
`reader.cancel()` before returning: the text already received is kept (and stored as the `stopped`
partial), but the provider connection is not left reading tokens nobody will see.

### What is deliberately not aborted
The token-streamed reply still returns the partial it already showed instead of aborting and losing it
(“what has already arrived is kept”) — it just stops reading. Tool-call fetches keep their own 10 s
timeout; an abort between turns is enough to stop the loop. A trigger/inbound caller has no reader, so
its brief runs to completion by design.

## Constraints that survive
- A stop is never stored as a model failure.
- No answer is stored that the reader cancelled.
- The record says what happened (`chat.stopped`), rather than a user message with a silent gap.
- Read-only loop, bounded steps, citations and audit are unchanged.

## Verification (2026-10-28)
- Unit: `runToolLoop` stop test (one model turn, the running tool finishes, `stopped` true, no second
  turn); gateway abort test (one fetch attempt despite a retryable AbortError); `readSseText` stop test
  (text kept, stream cancelled).
- Live, tool loop, against `.impeccable/tool-loop-fixture.mjs` (its loop turn waits 1.2 s so a stop has
  a real window; `/stats` counts calls and aborts): reader aborts on the first `tool` event → fixture
  `{calls: 3, delayed: 1, aborted: 1}`, no `delta` ever arrived, the agent has only its greeting (no
  answer, no error row), one `chat.stopped` audit, `calls <= 4`. Script: `.impeccable/stop-proof.mjs`.
- Live, org brief: reader aborts on the `consult` frame → fixture `{calls: 2, delayed: 1, aborted: 1}`,
  one channel row with `metadata.stopped` ("The brief was stopped before any teammate answered…"), no
  peer post, no report, no `provider_error`, run `CANCELLED`, one `brief.stopped` audit. Script:
  `.impeccable/brief-stop-proof.mjs`.
- Both earlier proofs (citation ledger, tool-loop stop) re-run on the updated fixture.
- Real Chrome, driven through the actual composer: send, wait for the tool state, press Stop →
  toast “Stopped before an answer was written. Nothing was stored.”, composer free, only the greeting
  stored, `CONSOLE: []`. Script: `.impeccable/cdp-stop-toast.mjs`.
- `npm test` (244), `next typegen`, `tsc`, `npm run build` green.

## Out of scope (recorded, not implied)
An inbound trigger/channel caller that disconnects (it has no reader to stop); provider-side billing
for tokens already generated before the abort arrived; cancelling a sandbox command a human started.
