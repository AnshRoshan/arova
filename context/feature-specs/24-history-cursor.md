# Feature 24 — A history cursor that survives tied timestamps

## The problem
The windowed board loads the newest 200 messages and **Load earlier** asks for rows *before* the
oldest loaded timestamp: `created_at < before`. On its own that is not a cursor. Rows written in one
statement share `created_at` (a seed batch, a multi-row insert), so at a page boundary every other row
in the tied group is invisible: the page returns nothing, the thread silently truncates, and the button
looks broken. The window query also ordered by `created_at` alone, so ties could shuffle between reads.

## The fix
- **One cursor, two parts:** `(created_at, id)`. The window and the pager both order by
  `created_at DESC, id DESC`; the pager's predicate is
  `created_at < before OR (created_at = before AND id < beforeId)`.
- `loadEarlier` accepts an optional `beforeId` (uuid); without it the old timestamp-only path still
  works, so an older client is not broken.
- The client computes the oldest row with the same tie-break and sends both parts.

UUID text ordering matches Postgres uuid ordering (both byte-wise over the canonical lowercase form), so
the client's comparison and the SQL agree.

## Verification (2026-10-28)
`.impeccable/paging-proof.mjs`: a fresh workspace, a throwaway seat, then 250 messages inserted in one
statement with the same `created_at`. Result: the window is 200, the timestamp-only cursor returns **0**
rows (the old bug, reproduced), the `(createdAt, id)` cursor returns **50**, no overlaps, and the union
is 250 — every message reachable. The workspace is deleted afterwards. `npm test`, `tsc`, build green.

## Related sweep fix
The search adapter accepted a plain-`http` remote endpoint and would send `SEARCH_API_KEY` as a Bearer
header over it. `buildUrl` now refuses `http` for any non-local host (local still needs
`SEARCH_ALLOW_LOCAL=1`, as before); a test proves the request is refused before `fetch` is called.
