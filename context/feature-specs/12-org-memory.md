# Feature 12 — Organisation memory

## The problem
Arova produces knowledge and keeps none of it. A brief to a lead leaves attributed posts in the channel; the
next brief re-reads the transcript inside the token budget and nothing else. Ask the same question twice and
the org behaves as if it had never worked the first one.

The parity study (`context/feature-parity.md` §4) puts this squarely: Grok has cross-chat memory GA, Dots
"receives memories from ChatGPT and can create its own". Both are *personal-assistant* memory — one human, one
agent, no org boundary. Dots' version is weak in a way we can beat: **you can only delete its memory by
deleting the agent**, and there is no per-note review. So the target is not "have memory" — it is *reviewable,
attributable, org-scoped* memory, which neither product shows.

This is also the one ask from the user's Feature-11 brief that was recorded as deliberately unbuilt: "each
organisation should have its own memory and everything managed properly. It should not lead to other places"
(spec 11, decision 3; build-plan 11d).

## What already works — do not rebuild it
- **The raw material exists.** `messages` rows with `team_id` are already an org-scoped, authored, timestamped
  record, and `delegations` rows link a peer post to the question that produced it.
- **Hermetic scope exists.** `hermeticPeers` and org-scoped channel history already define "inside this org".
  Memory inherits that boundary; it does not invent a new one.
- **The capability seam exists.** `TOOL_REGISTRY` already carries `save_note` marked unavailable with the
  reason "No agent-initiated note tool is wired". This feature is what makes that row available.
- **Provenance printing exists.** `.prov` and `.post-foot` already show what produced an answer; a memory-used
  line is the same mechanism.

## Feasibility, probed not assumed (2026-10-01)
Against the running database: **PostgreSQL 18.3**, `to_tsvector('english', …)` works, `pg_trgm`/`unaccent`/
`pgcrypto` are installable, and **`vector` (pgvector) is NOT available**. Therefore: keyword memory with a GIN
index, zero new npm dependencies, zero new server packages. **No embeddings, and the UI says so** — a
self-hosted demo that implies semantic recall it does not have is exactly the failure this product's honesty
contract forbids.

## Data model
- `memories`: `id`, `workspace_id`, `team_id NOT NULL` (the org owns its memory; a bench seat has none),
  `agent_id NULL` (the seat that wrote it; null = written by the human), `kind` (`note` | `decision` |
  `glossary`), `text`, `source_message_ids jsonb` (the channel posts it stands on), `tsvector` generated
  column + GIN index, `supersedes uuid NULL` (self-FK, so a corrected fact replaces rather than duplicates),
  `pinned bool`, `last_used_at`, `hits int`, `created_at`.
- No new table for retrieval, no cache table, no vector column.

## Server behaviour
- **Write**: `saveMemory` (human or seat) and `forgetMemory`. A seat may write only into its own org — the same
  guard shape as `mayStaffOrg`. `save_note` becomes an available tool behind the existing capability grant, so
  a seat that was denied tools still cannot write.
- **Distil** (opt-in, one click per brief, never automatic): a single model call over the brief's posts that
  proposes 1–3 candidate memories. It lands as a *proposal card* the human confirms — the same pattern
  `org_proposal` and `routine_proposal` already use — and it is counted against the daily budget like any
  other call. Auto-distilling every brief would spend calls nobody asked for.
- **Read**: at reply and brief time, retrieve top-k (k ≤ 4) inside the actor's org with
  `websearch_to_tsquery` + `ts_rank` blended with a recency term, inject as a labelled block, and record which
  ids were used so the answer's provenance can name them. Retrieval is per-org **only** — a cross-org leak is
  the failure mode the user named.

## UI
- A **Memory** section per org in the section panel: each note with its author's tile, kind, the posts it came
  from (linking into the channel), last-used and hit count, and Edit / Forget / Pin.
- A reply that used memory prints `from 2 org memories · last used 12:04` in its provenance line, and the block
  it was given is expandable — so a retrieved claim is never mistaken for something the model knew.
- A stale note (superseded) renders struck through with its replacement linked, rather than disappearing.

## Constraints that must survive
- **Attributable**: every memory names who wrote it and which posts justify it. An unattributed "fact" is
  indistinguishable from a hallucination in a demo whose whole argument is honesty.
- **Reviewable and deletable individually** — the explicit gap in Dots. Deleting an org deletes its memory
  (cascade), and the confirm dialog says so, as it already does for the channel.
- **Hermetic**: scope is `team_id`, enforced in the query, not in the UI.
- **Says what it is**: keyword recall, not understanding. No embeddings, no reranker, no claim of semantic search.
- **Budgeted**: distillation is a real model call and is counted; retrieval is free and adds a token figure to
  the injected block so the estimate on screen stays honest.
- Model output still renders only through `src/lib/markdown.ts`. No new colour: memory kind uses the existing
  identity/state tokens.

## Out of scope (recorded, not implied)
Vector/embedding recall (needs a server package — the user's call); cross-org or global memory; per-seat
private memory; automatic distillation on every turn; retention policy or expiry; export/import; user accounts
and shared membership; anything that requires a background worker.

## Decisions the user should make before this is built
1. **Default write path**: human "remember this" only, or also seat-initiated `save_note` (which turns on a
   tool that has been off since spec 05)?
2. **Distillation**: keep it opt-in per brief (recommended, costs 1 call), or drop it entirely for v1?
3. **k and the blend**: 4 notes at `ts_rank` × recency is a guess; a bigger k eats the token budget the seat
   already has.

## Verification checklist
- Save a memory in org A; brief a seat in org B; assert B's prompt contains no A text and B's provenance names
  zero memories.
- Two notes on the same subject, one superseding: the older renders struck through, the newer is retrieved, and
  retrieval returns one row per subject, not both.
- Ask something the memory answers; assert the reply's provenance names the memory ids and the injected block is
  expandable and matches what the server sent.
- Distil a completed brief; assert the proposal card exists, nothing was written before confirmation, and
  `model_usage.calls` went up by exactly the distillation call.
- A seat whose capabilities deny `save_note` cannot write memory (server-side refusal naming the rule).
- Reload: memory survives, hit counts and `last_used_at` are stored values, not client state.
- Drive it live at 1440×900 and 390×844 with a real brief, using `.impeccable/cdp-channel.cjs`.
- Gates: `node --test` over the new pure module (ranking blend, scope filter, supersede chain, provenance
  shape) written before the code, then typegen / tsc / build / health.

## Status: built and verified (2026-10-01)
The three open decisions were taken by the builder and are recorded in D-16, each reversible in one place:
any in-org seat **and** the human may write; distillation **ships**, opt-in, one counted call, proposals
only; injection is **3 notes / 900 characters**, pinned first.

`src/lib/memory.ts` is the pure half (5 tests, written first and confirmed RED before the module existed):
`memoryScore`, `selectMemories`, `renderMemoryBlock`, `memoryProvenance`. The `memories` table was pushed to
`arova_demo` with a GIN expression index on `to_tsvector('english', text)` — probed against the live server
before the design was committed: PostgreSQL 18.3, `vector` unavailable, `pg_trgm`/`unaccent`/`pgcrypto`
installable, so this is keyword memory and the UI says so.

Verified live, on a brand-new workspace against the configured `dahl` endpoint:

| Check | Result |
| --- | --- |
| A note is saved for one org | pass |
| A seat may record inside its own org | pass |
| A seat cannot write into another org's memory | pass — "…belongs to another organisation, so it cannot touch this one's memory." |
| A brief is shown the memory and says so | pass — reply metadata `{count: 1, chars: 57}`, ids include the note |
| The note records that it was used | pass — `hits` incremented, `last_used_at` set |
| The same question in another org retrieves nothing | pass — no memory used by mem-b's lead |
| A corrected note supersedes rather than competes | pass — the superseded row is excluded from candidates |
| A note can be forgotten on its own | pass |
| Distillation proposes, it does not write | pass — 2 candidates from a channel that decided something; saving one landed a row |
| The panel works in a real browser | pass — kind select, note, `used 0 times · never`, pin and forget; no overflow at 1440×900 or 390×844; `CONSOLE: []` |

Found while verifying, and fixed: distillation timed out because a reasoning model spends its whole budget
before the JSON arrives (the unary call now gets the stream ceiling), and the deeper one — the JSON parsers
were reading a *hypothetical* out of the model's own reasoning block. See spec 13 and D-16.
