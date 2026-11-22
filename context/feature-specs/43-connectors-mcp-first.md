# 43 — Connectors, MCP-first (retire the fake catalogue)

**Status: SHIPPED 2026-11-23.**

**Problem.** The Connectors tab was decorative fiction — hardcoded cards (Gmail, Slack, Notion…)
that stated "nothing is authorised" — while the real integration surface (MCP server bindings,
delivery channels, Slack apps, inbound triggers) hid in other tabs. Competitors win the connector
story by default; a fake catalogue is worse than none.

**Scope shipped.**
- The fake catalogue is deleted. The Connectors tab renders only live rows from the payload:
  an MCP binding on a seat, a channel (delivered/failed counts, last delivery), a Slack app
  (listening, last event), an inbound trigger (fires, token preview, last fire).
- Each card carries one health fact and one verb's destination (Discover in MCP tab, Channels tab,
  Automations → Goals). The empty state says what to create first.
- OAuth apps stay out until a real OAuth client exists; the tab states that in one line — when the
  client exists, only that line changes.
- Connectors count in the sidepanel is the count of live rows.

**Acceptance met.** Zero decorative cards; every card answers from a stored row or shows its
refusal; tsc clean; verified against the board payload (channels/triggers/slackConnections are the
same rows the live drives created).

**Honest boundary.** No OAuth flow; no connector marketplace; connectors do not multiplex — each
kind keeps its own surface.
