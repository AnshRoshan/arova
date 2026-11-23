# 52 — Voice input

**Status: SHIPPED 2026-11-23 (route + composer mic; a live round-trip needs the transcription
provider env — the refusal states exactly what is missing).**

**Problem.** Duet ships voice; Arova's board was text-only at the input.

**Scope shipped.**
- `POST /api/transcribe`: workspace-scoped, rate-limited, ≤15 MB audio, forwarded to an env-driven
  Whisper-compatible endpoint (`TRANSCRIBE_BASE_URL` / `TRANSCRIBE_API_KEY` / `TRANSCRIBE_MODEL` —
  the same env-edit pattern as every provider). The audio is **forwarded and never stored**.
- The composer gains a mic: MediaRecorder → transcribe → the text lands **in the draft box for
  review** — the microphone never sends anything to a seat by itself. Without a provider (or in a
  browser without the API), the button refuses with exactly what is missing.

**Acceptance met.** The no-provider refusal names the exact env vars to set (route predicate, and
the drive in the final sweep hits it); the with-provider path is typed end to end; nothing is
stored server-side beyond the transcript text in the HTTP response.

**Honest boundary.** No push-to-talk latency tuning, no streaming transcription; the quality is
the provider's.
