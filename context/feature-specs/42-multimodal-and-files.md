# 42 — Multimodal input and files

**Status: SHIPPED 2026-11-23 (upload door, refs, vision content parts, text inline; a live
vision-model round needs a key and is recorded for the pass-final sweep).**

**Problem.** Every competitor's chat accepts images and files; Arova's seats were text-bound, and
the gateway actively excluded image models.

**Scope shipped.**
- `POST /api/upload` — the one file door: workspace-scoped, per-file 10 MB, 4 per message, mime
  allowlist (images + text-like), name sanitised, bytes under `.data/attachments/<workspaceId>/`
  (gitignored). `GET /api/upload?id=&name=` serves a stored file back to its own workspace only.
- `messages.attachments` stores **refs** (id/name/mime/size) — the row never carries the bytes.
- `sendMessage` validates every ref against this workspace's storage before storing it.
- The gateway gains content parts (`text` + `image_url`) and a per-provider `vision` flag declared
  by the operator (`<NAME>_VISION=1`) — never guessed.
- The reply path reads the newest user turn's attachments: text-like files enter the prompt inline
  (capped at 4k chars); images become content parts on the final user message **only** when the
  model is vision-declared; otherwise the refusal is said in text the model can repeat.
- The composer: paperclip, per-file size/type chips, refs sent with the message, cleared on send.

**Acceptance met.** The upload door refuses oversize/unknown/named-badly with the rule; refs are
workspace-scoped; images ride only to vision-declared models and the mismatch is spoken; the
361-test gate and the build are green. The run dialog for a vision reply shows the answer through
the same provenance surfaces as any reply.

**Honest boundary.** No image generation; PDFs/DOCX need a parser dependency and refuse with that
sentence; a live vision round-trip awaits a model key (the mechanics are wired and typed).
