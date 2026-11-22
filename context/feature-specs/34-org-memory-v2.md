# 20 — Organisation memory v2: hybrid, reviewed, compounding

**Status: APPROVED (D-22 sequence) — first slice shipped and live-verified 2026-10-26 (D-29): hybrid keyword+trigram retrieval on pg_trgm (calibrated threshold, zero-overlap probe proven live), temporal validity excluded by query and selector (proven live both directions), validity settable through updateMemory. Deferred (D-29): scopes 20b, worker capture 20c, evaluation fixtures 20f, Git export.** Builds on Feature 12. Part of the 2026-10-20 market roadmap.

## Goal

An organisation remembers what it decided, what it learned and what it prefers — and gets better at retrieval without inventing facts. Memory becomes hybrid (keyword + embeddings when available), scoped (org / team / seat), captured from real work as reviewable candidates, and always attributable.

Measurable: a query whose wording differs from a stored note still retrieves it (embedding path); every injected note names its source; a candidate is never saved without review; a superseded note is excluded from prompts but still visible; no cross-org retrieval.

## Why now

Memory is table stakes in the reviewed set: Grok Bot, Dots, Claude, OpenMuse, OpenClaw, Gemini Memory Bank, OpenBot (pgvector). Arova's org-scoped, reviewable memory is a differentiator, but keyword-only recall is a visible ceiling and capture is manual.

## Scope

### 20a — Hybrid retrieval
- Keep the existing Postgres full-text index as the always-available path.
- Add an optional embedding path: env-driven embedding provider (OpenAI-compatible `/embeddings` by default), stored as `vector` **only if the extension exists**; otherwise store the vector in a portable form and compute similarity in the app for small orgs, or stay keyword-only. The UI states which mode is active.
- Hybrid score: normalized keyword rank + cosine similarity + pin + recency, with a minimum threshold. Deduplicate near-identical notes.
- Budget remains bounded (notes and characters); what did not fit is counted, not silently dropped.

### 20b — Scopes
`org` (visible to the whole team), `team`, `seat` (private to one agent unless promoted). A seat can read org + its team + its own; it can write only where its role allows. Cross-org reads are impossible by query, not by prompt.

### 20c — Capture
After a brief, run or channel exchange, the worker (spec 16) may propose 0–3 memory candidates: decisions, preferences, lessons, facts. Each candidate carries evidence links (message/run/tool rows), a confidence, and a proposed scope. Candidates land in an inbox; nothing is saved automatically. A human can edit, merge, pin or reject. Rejections are remembered to avoid re-proposing the same note.

### 20d — Conflict and supersede
When a new note contradicts an existing one, the UI shows the pair and asks for supersede/merge/keep-both. Superseded notes stay listed and struck through. Retrieval excludes superseded rows and records which note replaced which.

### 20e — UI
- Memory inbox with filters (pending, mine, org, seat, superseded).
- Per-seat memory tab; org memory panel already exists.
- Each reply's provenance names the notes used and their character cost (already partially built).
- A "why did you use this?" view links a note to the run and evidence.

### 20f — Evaluation
A small fixture set of org questions with expected notes; measure recall@k and false-injection rate. Run it when the retrieval algorithm changes. No claim of "semantic recall" until the embedding path is live and measured.

## Deep-research amendments (2026-10-20)

- **Reviewability comes before semantics.** Dots shows opaque memory is a governance failure; Lindy's versioned files and Devin's Git-backed Markdown prove inspectable provenance is more persuasive than a black-box vector claim.
- Keep memory as "what the org knows"; do not merge with spec 23 skills ("how work is done") (`market-deep-dives/01`).
- Store note revisions and evidence like a mini version-control record: source run, author, valid_from/invalid_at, supersedes, diff/history and one-click forget.
- Optional Git-backed export/mirror is a useful later pattern, but the database remains source of truth.
- pgvector is the only external memory rail worth integrating. Do not adopt Mem0, Zep, Letta or an external vector DB; each adds extraction/ hosting/ lock-in that conflicts with Arova's Postgres/BYOK boundary.
- Hybrid semantic retrieval is optional and mode-visible. A deployment without `vector` must still work via keyword, and the UI must state which mode is running.
- Capture remains proposals + human review by default. Automatic self-editing memory is an anti-pattern for this product.

## Deep-research amendments (2026-10-25)

From `market-deep-dives/07-october-refresh-2026-10-25.md` — a dependency-free middle path exists before any embedding commitment:

- **Postgres-native fusion first.** Mem0's 2026 retrieval is multi-signal: semantic + **BM25 keyword + entity matching**, with temporal ranking. The keyword and entity halves are implementable in Arova's existing Postgres (`to_tsvector` ranking already live; entity matching via extracted names/terms stored on the note, matched with `pg_trgm`, which the server can install). Try **keyword + entity + recency fusion before adding an embeddings provider**; measure with 20f's fixtures and only add the embedding path if the fixture recall is genuinely insufficient. The UI still states which mode is active.
- **Temporal validity on every note.** Graphiti's default — every fact carries a validity window. Extend `memories` with nullable `valid_from` / `valid_to`; retrieval excludes notes whose window has lapsed and provenance states it. This upgrades the existing supersede chain from "a newer note exists" to "this fact stopped being true at T".
- **Extraction cost discipline.** Mem0 moved to single-pass ADD-only extraction (one LLM call, no update/delete decisions by the model). Keep capture to one call that proposes candidates; all correction stays human, which matches 20c as written.

## Value-source gate

"Used N notes" requires ids from the retrieval result. "Semantic" requires a real embedding call; otherwise the UI says keyword. A candidate's confidence comes from the extractor, not a decorative score.

## Data and code

- `src/db/schema.ts`: extend `memories` with scope, embedding (nullable), confidence, evidence ids, rejected-proposal table; optional pgvector index.
- `src/lib/memory.ts`: hybrid score/selection/render + tests; `src/lib/embeddings.ts`.
- `src/app/api/board/route.ts`: capture enqueue, inbox actions, provenance.
- `src/app/page.tsx`: inbox, scope filters, conflict/supersede; per-seat tab.
- `src/worker/`: capture job.

## Exclusions

No external vector database; no autonomous self-editing without review; no cross-org memory; no automatic deletion of human-written notes; no "memory of the user" outside the workspace. Do not claim semantic recall when running keyword-only.

## Verification

- Unit: hybrid scoring; threshold behavior; dedupe; supersede exclusion; scope isolation; rejected-proposal suppression.
- Live: save a note with different wording → retrieve it via embedding; propose a candidate from a brief → review → save; reject and confirm it is not re-proposed; supersede and confirm the old note is excluded; cross-org query returns nothing; provenance links.
- Gates: tests, typecheck, lint, build; evaluation fixture run.

## Risks and cost

Embeddings add a provider dependency, latency and cost; keep the keyword fallback and a per-workspace toggle. Automatic capture can pollute memory; proposals-only and rejection memory mitigate it. Vector availability is environment-dependent; the UI must say what is actually running.

## Dependencies

Spec 16 (capture jobs), spec 19 (trace/evidence references). Spec 17 if capture uses tool results.

## Open questions for the user

1. Embeddings: use the same OpenAI-compatible endpoint as chat, or a separate `EMBEDDINGS_*` provider? Recommendation: separate `EMBEDDINGS_*` with a `MEMORY_RETRIEVAL=keyword|hybrid` switch.
2. Capture cadence: after every brief, or on demand + nightly? Recommendation: after briefs (max 3 candidates) plus a manual "capture from this thread".
3. Seat-private memory in v1, or org-only until requested? Recommendation: org + seat; team is a later refinement.
4. Retention for rejected candidates: 30 days or forever? Recommendation: 90 days, with a count visible.

---

> **Renumbered 2026-11-22.** This document belonged to the parallel work line on this machine (its spec 20). On main it is spec **34**; the whole line renumbered 16–27 → 30–41 to continue main's own specs 16–29. Internal subsection letters and cross-references still speak the old numbers.
