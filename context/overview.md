# Overview
Arova is a personal AI teammate workspace. Users create named agents with roles, instructions and a model preference; chat with persistent history; propose and save routines; review run requests and approval decisions.

Core journey: open demo workspace → select/create teammate → choose a model provider → chat and watch the reply stream in → inspect a routine proposal → create a routine → it executes on schedule when the workspace is next opened, and the answer lands in that agent's thread.

Providers are configuration, not code: xAI (Grok) and OpenAI are built in, and any server that answers `POST {base}/chat/completions` is added by naming it in `PROVIDERS` with its own `_BASE_URL` / `_MODEL` / `_API_KEY`. Replies stream over SSE, retries are bounded, history is cut to the endpoint's context window, and a daily per-workspace call budget limits spend.

The demo has no login, OAuth connectors or computer sandbox, and no background process — schedules execute when the workspace is read, not while it is closed. Those UI surfaces explicitly explain their unconfigured state. Do not claim actual automation or external actions.
