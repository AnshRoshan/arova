# 50 — Conversation editing and branching

**Status: SHIPPED 2026-11-23.**

**Problem.** Every chat product ships edit-and-resend; Arova's transcript was append-only, so a
mistyped instruction was permanent clutter and a wrong direction could not be re-run from the turn
before it.

**Scope shipped.**
- `resendFromMessage`: an edit on your own question inserts a **new** user turn marked
  `branchFrom` (carrying the original's content in metadata for the record) and re-runs the reply
  through the identical streaming path. The original row is never rewritten — append-only is an
  invariant, and the audit stream records `chat.branch`.
- The composer shows a branch banner, the seat thread carries an edit affordance on your own
  questions, and the branched turn names itself ("branched re-ask · the original stays").
**Acceptance met.** Editing mutates nothing; the branch renders and is navigable in the thread;
streaming and unary paths behave identically (same runner).
**Honest boundary.** No tree view of all branches — the newest path reads first; the original
stays in place below.
