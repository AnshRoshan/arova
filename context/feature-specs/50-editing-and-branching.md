# 50 — Conversation editing and branching

**Status: SHIPPED 2026-11-23.**

**Problem.** Every chat product ships edit-and-resend; Arova's transcript was append-only, so a
mistyped instruction was permanent clutter and a wrong direction could not be re-run from the turn
before it.

**Scope shipped.**
- `resendFromMessage`: only a person's own user turn may be re-asked. The **original row is never
  rewritten** (append-only stays an invariant); the edited turn is a new row marked
  `metadata.branchFrom` (carrying the original's text for display), an audit event records the
  re-ask, and the reply runs the same streamed path `sendMessage` uses.
- The seat thread: user turns get an edit affordance ("opens a branch; the original is never
  rewritten"); the branched turn renders with a "branched re-ask · the original stays" chip.
- The composer shows it is re-asking while a branch is open; sending clears it.

**Acceptance met.** Editing never mutates the original row; a branch renders and navigates in the
thread; the audit stream shows the edit as an event; the streaming path is the same one
`sendMessage` uses, so the unary/stream parity invariant holds by construction. 361/361 tests,
tsc clean.

**Honest boundary.** One branch level per re-ask (a branched turn cannot be re-branched — the
button hides on branched rows); no tree-view diff of parallel branches beyond the chips; runs
already keep their own lineage through `runId` metadata.
