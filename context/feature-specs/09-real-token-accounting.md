# Feature 09 — Real token accounting where the server offers it

The figures on screen were `~4 chars/token` guesses. Compatible servers already report real counts; we were throwing the response body away.

- `usageFromJson(body)` and `usageFromSseLine(line)` read `prompt_tokens` / `completion_tokens`; `completionPayload` asks streams for the final usage frame via `stream_options: { include_usage: true }`, and a server that rejects that field is retried once without it rather than failing the message.
- Every call site now records reported counts when present: unary chat, streamed chat (both the direct and handoff paths), peer consults, scheduled runs, roster and org proposals.
- `model_usage.estimated` is a per-day flag that only ever widens: one estimated call makes the day partly estimated, and Settings then says `est.` instead of `reported`.

Verified: a fresh workspace's first call stored `in=140 out=66 estimated=false`, while the endpoint's raw unary body shows `prompt_tokens: 48, completion_tokens: 64` for a shorter prompt — the numbers come from the server, not from character counts. 116/116 tests.

Honest limit: an estimate is still an estimate. Input counts from a server include everything it sent, so they will not match our own character estimate, and a server that reports nothing keeps the `est.` label forever.
