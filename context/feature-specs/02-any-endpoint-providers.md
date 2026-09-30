# Feature 02 — Any OpenAI-compatible endpoint, streamed and budgeted

Goal: an operator points a teammate at any Chat-Completions-compatible server (example: `https://inference.dahl.global/v1` with model `MiniMaxAI/MiniMax-M2.7`) using only `.env.local`, sees replies stream in, and cannot exceed a daily model-call budget.

## Configuration contract
`PROVIDERS` lists short names. For each name, `<NAME>_BASE_URL`, `<NAME>_MODEL`, `<NAME>_API_KEY`, optional `<NAME>_MAX_CONTEXT`. xAI and OpenAI stay built in. Keys are read server-side only; a profile object never carries a key or the base URL.

Acceptance checks:
- A new provider appears in the create-agent modal and the agent Settings picker with no code change, and survives reload.
- `*_BASE_URL` accepts either an API root (`…/v1`) or a full completions URL; exactly one `/chat/completions` is requested.
- Non-http(s) base URLs are refused before any request, so a bearer key cannot be sent to `file:` or other transports.
- An explicitly selected provider that lacks key/base/model persists a `provider_error` diagnostic naming it, and issues no request.
- Replies stream token-by-token; the persisted assistant row equals the concatenated stream; refreshing the page shows the same text.
- A 503/429/network failure is retried with bounded backoff before the first byte; a stream that already began is never retried — it persists as `incomplete` and says so.
- History is cut by the endpoint's context window in whole newest turns, not a fixed message count; the vendor receives far fewer messages than the thread holds.
- `DAILY_MODEL_CALLS_LIMIT` blocks the next call per workspace + provider + UTC day and records nothing; `0` disables. Local-mode chats are never counted.
- Settings shows each provider's configured state, calls today and estimated tokens; client payloads contain no keys, base URLs or upstream error text beyond the notice.

Out of scope: real authentication, tool/connector execution, scheduler, non-Chat-Completions APIs (Responses/Anthropic/Gemini shapes), exact cost accounting, per-provider rate limiting beyond the workspace daily budget.

## Flagged assumptions
- Token counts are **estimated** at ~4 chars/token and labelled "estimated" in the UI. Many compatible endpoints omit `usage`; a real tokenizer was not added. Correctness policy: the budget is a guardrail, not a bill.
- Retry backoff waits are fixed (600ms, 1800ms) and honour `Retry-After` up to 8s; no full exponential+jitter scheme.
