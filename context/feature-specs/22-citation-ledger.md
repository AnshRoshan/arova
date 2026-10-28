# Feature 22 — The citation ledger

## The problem
The tool loop learned to search and to carry `sources` back to the UI (spec 21), but the numbering was
computed twice, independently:

- each `web_search` call formatted its own results from `[1]` (spec 21's `formatSearchResults`);
- the UI re-numbered the deduped source list from `[1]` again.

So the moment a seat searched twice, every citation in the answer pointed at a different page than the
one the model had read. A page the model fetched with `web_fetch` was not a source at all — it could
inform the answer and never appear in the list of what the answer stood on. And an invented `[9]` rendered
as cleanly as a real one. This is the honesty contract's exact failure mode: a tidy source list implying
verification that never happened.

## What was built
### `src/lib/citations.ts` — the pure half (7 tests, written first and confirmed RED)
- `createLedger(limit = 12)`, `addSource(ledger, {title,url})`: one number per unique URL, assigned on
  first sight and never reassigned; a fragment (`#section`) is the same page; past the cap a source is
  returned as `null` so nothing can be numbered that is not in the list.
- `citationReport(answer, sources)`: `{ cited, unresolved, uncited }`. It reads `[n]` markers from the
  **answer** only, ignores `[0]` and anything inside inline code or a fence (an array index is not a
  citation), and reports invented numbers instead of dropping them.

### The loop (`src/lib/tool-loop.ts`)
- One ledger per `runToolLoop`; `executeToolCall` takes it, so search text and source list share the
  numbering. `formatSearchResults` accepts the ledger's numbers and prints `[-]` for a result the budget
  could not index.
- `web_fetch` now returns the final URL and the page title, so a fetched page is numbered and cited; its
  output is prefixed with `[n]`.
- `ToolLoopResult` carries `sources: {index,title,url}[]` and `citations`; the report runs on
  `splitReasoning(content).answer`, so a number mentioned while thinking is not a claim.

### Stored and shown
- Both reply paths record the report via one `toolLoopMetadata()` helper (`citations` alongside
  `toolsUsed` / `sources`).
- The message renders `[n]` from the source's own index (not list position) and adds, in the waiting
  colour: *“Cited [9] but no tool returned that number — those claims are not backed by anything this
  seat retrieved.”*
- The system prompt now says the numbers are fixed for the whole reply, to reuse a page's number after a
  later search, and to say so instead of citing when no tool returned it.

## Constraints that survive
- Source numbers are stable, unique and bounded; no citation can point past the list.
- An unverified claim is visible as unverified; the UI never presents the source list as proof of every
  sentence.
- No new colour, no new dependency, no change to what the model is allowed to call.
- Read-only loop, opt-in per seat (D-25) unchanged.

## Verification (2026-10-28)
- `npm test` 241/241 (7 new citation tests + two loop tests: two searches keep one numbering; a fetched
  page becomes a numbered source), `tsc --noEmit` clean.
- Live, against the local fixture (no vendor key): two searches where the second repeats one URL and the
  answer cites `[1]`, `[3]` and invents `[9]` → stored metadata `sources` indices `[1,2,3]` with URLs
  a/b/c in discovery order, `citations {cited:[1,3], unresolved:[9], uncited:[2]}`, both tool calls
  audited, report survives reload. Script: `.impeccable/citation-proof.mjs`.
- Real Chrome, 1440×900 and 390×844: `Sources: [1] Arova docs · [2] Arova notes · [3] Arova pricing`,
  the `[9]` warning in `rgb(232,178,92)` (the waiting token), no horizontal overflow, `CONSOLE: []`.
  Script: `.impeccable/cdp-citations.mjs`.
- A real search provider and a vendor model remain unverified here (no key), exactly as spec 21 records.

## Out of scope (recorded, not implied)
Checking that a cited page actually contains the claim (needs a reader/reranker); resolving citations in
reasoning; a citation editor; numbered sources for non-tool replies.
