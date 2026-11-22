# 48 — Memory capture loop (from chat)

**Status: SHIPPED 2026-11-23 (per-seat capability; live drive of the proposal path lands in the
pass-final sweep with a model key — the distiller is the channel-proven MEMORY_SYSTEM).**

**Problem.** Mem0's core is capture-with-reconciliation; Arova proposed memories only from org
briefs. Regular conversations — where the real decisions are said — proposed nothing.

**Scope shipped.**
- A per-seat capability, `captureMemory` (default off, toggled in Capabilities next to the tool
  loop).
- When on, after a stored chat reply `maybeProposeMemories` runs **one bounded distiller call**
  (MEMORY_SYSTEM, the same prompt the org-channel salvage uses, budget-checked like any call) over
  the turn pair, parses the JSON candidates, and stores **one proposal row in the seat's own
  thread** — `kind: memory_proposal`, up to three candidates.
- The thread renders the proposals as reviewable cards: Save writes the note into the org's memory
  through the same gated `saveMemory` action; Dismiss deletes only the proposal row (a dedicated
  action that refuses any other kind — stored messages are the record).
- Nothing is auto-written: capture is per-seat opt-in, budget-counted, and every write is a person's
  decision. Failures log, never break the chat.

**Acceptance met by construction.** Org isolation inherited unchanged (`saveMemory`'s own gates);
off-by-default; with no model key the pass refuses before calling and no proposal appears; the
review surface is the thread, not a silent write.

**Honest boundary.** The distiller is verified against the channel path's own usage; the chat-path
proposal itself needs a model key to drive live (recorded for the pass-final sweep). No
reconciliation of duplicates beyond the existing supersede flow; no graph.
