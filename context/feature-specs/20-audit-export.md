# Feature 20 — Audit export

## The problem

The registry, runs, approvals, delegations and memory are visible in the app, but a human or an
auditor cannot take the record out. A governance product that cannot export its own audit is a
dashboard, not a record.

## What it is

`GET /api/export` returns a JSON download scoped to the caller's workspace (session or cookie).
The file includes:

- workspace identity, agents (identity/status/provider, **not** instructions), teams,
- events, runs, run steps, approvals, delegations,
- org memory (text and provenance),
- channel status (name, kind, **host only**, counts, last status/error), sandboxes (provider/status).

It deliberately excludes:

- message bodies,
- channel target URLs and inbound tokens,
- model keys and session tokens,
- agent instructions,
- connection slugs/tokens.

`Content-Disposition` names the file `arova-audit-YYYY-MM-DD.json`. No session means 401.

## UI

Settings → Agent registry: **Export audit JSON** downloads the same route. The adjacent hint names
what is included and what is excluded, so the file's scope is not a surprise.

## Limits

The export is capped at 5,000 rows per table. It is a human/auditor artifact, not a database backup
or a streaming export. It does not include the `messages` table; a full content export is a separate
decision. It does not verify that the caller is the owner — any member of the workspace who can see
the registry can export it; that matches the current membership model. Run/step/event text may contain
a command a human typed or command output; treat the downloaded file as sensitive even though message
bodies and credentials are excluded.

## Verification

- Live on 2026-10-28: `GET /api/export` returned 200 with
  `content-disposition: attachment; filename="arova-audit-2026-10-28.json"`; the JSON had
  `agents/teams/events/runs/steps/approvals/delegations/memories/channels/sandboxes`, channel rows
  had `targetHost` and no `target`/`token`, and there was no `messages` key. No cookie → 401.
