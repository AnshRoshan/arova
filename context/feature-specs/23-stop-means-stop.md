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

### What is deliberately not aborted
The token-streamed reply still reads the provider stream and keeps the partial it already showed
(“what has already arrived is kept”) instead of aborting and losing it. Tool-call fetches keep their
own 10 s timeout; an abort between turns is enough to stop the loop.

## Constraints that survive
- A stop is never stored as a model failure.
- No answer is stored that the reader cancelled.
- The record says what happened (`chat.stopped`), rather than a user message with a silent gap.
- Read-only loop, bounded steps, citations and audit are unchanged.

## Verification (2026-10-28)
- Unit: `runToolLoop` stop test (one model turn, the running tool finishes, `stopped` true, no second
  turn); gateway abort test (one fetch attempt despite a retryable AbortError).
- Live, against `.impeccable/tool-loop-fixture.mjs` (its loop turn now waits 1.2 s so a stop has a
  real window; `/stats` counts calls and aborts): reader aborts on the first `tool` event →
  fixture `{calls: 3, delayed: 1, aborted: 1}`, no `delta` ever arrived, the agent has only its
  greeting (no answer, no error row), one `chat.stopped` audit, `calls <= 4`. Script:
  `.impeccable/stop-proof.mjs`.
- `npm test`, `next typegen`, `tsc`, `npm run build` green.

## Out of scope (recorded, not implied)
Aborting the org-brief loop when its browser reader leaves (`runBrief` still only polls `isClosed`
between steps; a trigger caller has no reader to stop); aborting an in-flight consult/handoff stream;
provider-side billing for tokens already generated before the abort arrived.
