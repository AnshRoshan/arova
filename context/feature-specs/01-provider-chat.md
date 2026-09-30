# Feature 01 — Provider-aware teammate chat
Goal: An agent can choose auto, Grok/xAI, OpenAI or local mode; send a message; see a persisted reply or an honest provider failure.

Acceptance checks:
- Create/edit agent model selection survives reload.
- Configured model receives instructions and up to 16 recent messages for its agent only.
- Missing credentials never appear as a successful remote reply.
- Keys are read only by the server; tool/browser execution is not claimed.
- Existing routines, run requests, approvals and demo workspace remain operational.

Out of scope: streaming, OAuth, scheduler, actual sandbox, public authentication.
