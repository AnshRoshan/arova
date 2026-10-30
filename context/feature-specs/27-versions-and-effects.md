# Feature 27 — Versions and the effects ledger

## The problem

Two OpenDots rules are cheap now and nearly impossible after the first real
side effect or the first desktop:

1. A run must name the instructions it actually used. Today
   `agents.instructions` is edited in place, so a later edit rewrites the past.
2. A side effect is recorded, with an idempotency key, before it is attempted.
   A retry of an unknown outcome does not send again. Today the read-only loop
   executes, then audits. The human sandbox stores the command in
   `runs.summary` before exec and writes the audit after.

This spec does not turn on model writes, shell-from-the-model, or a desktop.

## Versions

- Publishing an instruction change inserts an `agent_versions` row
  (agent id, monotonic version, instructions, capabilities, provider, created at).
- A run stores `agent_version_id` at start.
- The editor can still change the live row. Old runs keep their version id.
- Existing runs, which have no version, stay null and the UI says the
  instructions were not pinned.

## Effects

A new `external_effects` row is inserted **before** any effect that can leave
the workspace: a future send, a payment, a model-initiated shell, a connector
call. Columns: workspace, run, agent version, idempotency key, kind, status
(`pending` | `succeeded` | `failed` | `uncertain`), and a metadata payload that
does not contain secrets or typed desktop input.

Rules:

- The same idempotency key returns the existing row and does not re-execute a
  `succeeded` or `uncertain` effect.
- `uncertain` is a stored state. Nothing retries it automatically.
- Read-only tools (calc, clock, JSON, checksum, fetch, search) do not require
  an effects row. They stay on the audit event they have now.
- The human sandbox console, which already runs, writes the audit event before
  exec and stores the command as metadata that the export can redact. Output
  stays capped. This is the rehearsal for the ledger, on a path a person
  started.

## Computer identity, recorded so it is not skipped later

When a remote sandbox provider is added, attach goes through `find` by
metadata and verifies lifecycle before connect. A stored sandbox id is a cache.
That work waits on root `TASKS.md` 1.3 and 1.4. This spec only forbids wiring
a provider that trusts a stored id.

## Out of scope

Gmail, Slack, MCP, Composio, model-initiated shell, GUI, snapshots, resume.
An append-only token journal. Rewriting chat onto that journal.

## Verification

Tests: a second publish does not change the version id on an in-flight run; a
repeated idempotency key does not call the effect twice; an `uncertain` row
is not retried; a read-only tool call inserts no effects row. No live vendor
call is required.
