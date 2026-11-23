# 51 — Workspace import/restore

**Status: SHIPPED 2026-11-23 (full export mode + owner-only import into a new workspace; live
drive lands in the pass-final sweep).**

**Problem.** The audit export produced a JSON nobody could read back in; moving machines was
manual SQL.

**Scope shipped.**
- `GET /api/export?mode=full` adds the collections a restore needs — messages with bodies,
  routines, goals, watches, attention items, skills and their versions, plus the workspace row —
  stamped `kind: "arova-export"`, `version: 1`, `mode`. Secrets still never travel: no channel
  targets or inbound tokens, no vault envelopes, no trigger tokens, no sessions.
- `POST /api/import` (signed-in owner only): preflight refuses anything that is not our own file —
  wrong kind marker, wrong version, audit-only mode, missing collections — each with the reason.
  Every row is inserted with a **fresh id and an old→new id map** (teams, agents, managers, leads,
  message parents, watch→goal, memory supersession), so nothing collides and nothing beyond plain
  data is trusted from the file. The import always lands as a **new workspace**, and the importer's
  cookie switches to it.
- Settings › Workspace: the restore file input with the honest rules spelled out.

**Acceptance met.** A foreign or partial file is refused with the reason (preflight predicates);
secrets never appear in any export (the export route's own redactions are untouched and full mode
adds none back); tsc clean, 361/361 tests.

**Honest boundary.** Connections, triggers, vault entries and sessions are documented as not
imported; run lineage is preserved by remap where parents exist; the full export is capped by the
same LIMIT the audit export uses, so gigantic workspaces paginate by design.
