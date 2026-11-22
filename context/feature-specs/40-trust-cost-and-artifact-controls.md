# 26 — Trust, cost and artifact controls

**Status: APPROVED (D-22 sequence) — first slice shipped 2026-10-25 (D-23): 26e trigger-token hashing, 26c pause/kill on the queue, and the pure 26g approval-token/autonomy rules (`src/lib/policy.ts`, 9 tests). The remainder (approval-token table, budget hierarchy rows, task lineage, artifacts, credential vault, egress, trust panel) is sequenced with spec 17, where each rule gets its consumer — see D-23 for the reasoning.** Cross-cutting P0 overlay for specs 16–24. Created from the 2026-10-20 demand and enterprise deep dives.

## Goal

Make delegated agent work safe enough to hand over: the user can see every task and child task, stop it for real, know exactly what it may spend, inspect the artifacts it produced, and prove it never used a credential or destination the acting human did not authorize.

Measurable:
- A parent run displays its full child/task/tool trace and cumulative estimated cost.
- Pause stops new steps within one checkpoint; kill cancels parent and descendants; neither leaves a child running.
- A budget warning appears before spend; a hard cap stops the next tool/model call.
- Every artifact is linked to a run, source step and retention policy.
- An approval authorizes one action, expires, and cannot be reused by a later step.
- A secret never appears in a URL, browser payload, model message, tool output or log.

## Why now

Demand evidence shows users are less angry about imperfect answers than about invisible background spend, fake pause, trapped artifacts, credential exposure and prompt-injection exfiltration. Enterprise platforms are converging on policy + audit + kill switch. Arova cannot add a worker (16), tools (17), channels (21) or a computer (24) without these controls.

## 26a — Task lineage

Extend the job/run model with:
- `task_graph` edges: parent, child, depth, kind, source message/post/run.
- `initiator` already on `runs`; propagate through every delegated subtask.
- `lease_owner`, `cancel_requested_at`, `pause_requested_at`, `budget_id`, `estimated_cost`.
- A subagent summary: model/provider, tool count, tokens, cost estimate, artifact count, current step.

No UI may show "running" unless a claimable job or live lease exists.

## 26b — Budgets and cost

Budget hierarchy:
1. Workspace global cap.
2. Seat/provider/day.
3. Goal/routine.
4. Individual run.

Defaults:
- interactive chat/run may spend its normal call budget.
- unattended routine/watch gets a lower explicit cap and cannot auto-approve.
- every approval card shows estimated calls/tokens before execution.
- hard cap stops before the next call; a partial stream keeps and labels what arrived.

Token figures remain estimates until real tokenizer/usage exists, but the budget is exact by call and can be exact by reported usage.

## 26c — Pause, cancel and kill

Three distinct controls:
- **Pause:** no new steps/jobs/children; in-flight step completes or reaches checkpoint. UI says "pausing" until lease state proves it.
- **Cancel:** stops parent and, by policy, all descendants. `cancel_mode = interrupt | rollback`; rollback only for writes explicitly marked reversible.
- **Kill:** administrator/workspace switch stops all jobs, revokes leases, blocks new claims, and names which runs were killed.

Every control writes an audit event. A cancelled/paused run never displays as completed.

## 26d — Artifacts

New `run_artifacts`:
`id`, `run_id`, `step_id`, `kind` (`file | link | code_diff | screenshot | pdf | csv | tool_result | summary`), `name`, `uri`, `media_type`, `bytes`, `sha256`, `source`, `visibility`, `retention_expires_at`, timestamps.

Rules:
- artifacts belong to the run, not the sandbox session;
- large files go to a provider/workspace volume, not JSON;
- hash and source step are mandatory;
- download URLs are signed and expiring;
- deleting a session does not silently delete a promised artifact;
- Grok-Bot-style "output exists but is trapped in the VM" is treated as failure.

## 26e — Credential and connector boundary

- Store credentials encrypted server-side; only a credential id is passed to an adapter.
- OAuth tokens are short-lived where provider allows; refresh server-side.
- No credential in URL, localStorage, board JSON, SSE frame, model message, tool arguments or audit plaintext.
- External connector calls happen server-side, not inside an agent sandbox.
- Every connector declares `read | write | destructive`; unannotated connectors default to gated writes.
- Scoped test accounts are encouraged; a seat can hold only the credentials of its workspace/org.
- Rotation, deletion and revocation are audited and take effect at next lease/tool claim.

## 26f — Untrusted content and egress

- Email, web pages, Slack messages, PDFs and tool outputs are untrusted instructions. Wrap them as data, never system authority.
- Tool results are truncated and scanned before entering context.
- Browser/computer providers use mandatory non-bypassable egress allow-lists, private-network denial, and explicit host grants.
- A human can see the target, method, destination, argument digest and estimated cost before approval.
- A write to an external account requires current-session human authority or a single-use expiring approval.

## 26g — Approval token

An approval becomes a token with:
`approved_by`, `action`, `tool`, `target`, `arguments_hash`, `workspace/seat`, `max_cost`, `run/step`, `issued_at`, `expires_at`, `consumed_at`.

Rules:
- consumed atomically on first execution;
- replay fails with a sentence naming the consumed approval;
- expiry defaults to 10 minutes for unattended work;
- "always allow" is scoped per target/tool and revocable in one click;
- denial breaker still applies.

This adopts the most useful enterprise pattern (AWS temporal policy) without a rules DSL.

## Deep-research amendments (2026-10-25)

From `market-deep-dives/07-october-refresh-2026-10-25.md`:

- **Plan-first approval.** Jules (Google) writes a plan and executes only after it is approved; the plan is the approval artifact before any spend. Extend 26g: an approval may authorize a **plan** (stored, versioned) rather than a single action — the approved plan bounds the run's steps, and steps outside the approved plan require a fresh approval. Budget is only spent on approved plans, which makes the daily-budget story fairer.
- **Checkpoints and rollback.** Replit (one-click rollback to any checkpoint) and Cursor (checkpoint/rollback of agent changes) make reversible work actually reversible. In Arova's terms: a run checkpoints thread/state at each step boundary; `cancel_mode = rollback` restores the checkpoint taken before the write being rolled back. Applies only to writes spec 17 marks reversible; external writes stay interrupt-only.
- **Per-agent autonomy dial.** Replit exposes user-selectable autonomy (high = long self-correcting runs; low = step-wise confirmation). Add one field to the agent config: `autonomy: low | standard | high`. `high` may chain bounded self-corrections within the run budget; `low` requires confirmation at every step boundary; unattended work is always capped at `standard` regardless of the dial. The dial is agent-config, so it becomes reviewable through spec 27.
- **Trigger-token hardening (audit finding).** The 2026-10-25 code audit found `triggers.token` stored **plaintext** (unique index only). Spec 26's credential boundary must cover it: store a hash, show the token once at creation, refuse plaintext reads. Until this lands, treat the stored token as the honest exception and say so in the UI rather than implying it is protected.

## 26h — Human trace UI

Add one **Run trust panel**:
- task tree with initiator and depth;
- lease/status/pause/kill state;
- model/provider and estimated cost;
- tools with target and decision;
- artifact list;
- approval/decline history and expiry;
- failure class: provider, timeout, policy denied, budget reached, lease lost, cancelled, tool error.

The panel is read-only and assembled from stored rows.

## Value-source gate

Status comes from job lease/state. Cost comes from `model_usage`/reported usage. Artifacts come from `run_artifacts`. Approval state comes from tokens. Egress/connector decisions come from gateway audit. A missing provider response is shown as unknown, never inferred.

## Data and code

- `src/db/schema.ts`: task edges, budgets, approvals token fields, run_artifacts, credential metadata, audit indexes.
- `src/lib/policy.ts`: approval consumption, target validation, egress/host rules.
- `src/lib/jobs.ts`: pause/cancel/kill transitions.
- `src/lib/credentials.ts`: vault boundary.
- `src/lib/artifacts.ts`: hashes, signed URLs, retention.
- `src/app/api/board/route.ts`: actions and payload.
- `src/app/page.tsx`: Run trust panel.
- Spec 17/24 adapters return evidence to this panel; they do not create their own status.

## Exclusions

No proprietary credits. No dashboards before one readable run trace. No external APM in v1. No browser extension that holds user passwords. No self-hosted credential sync across workspaces. No policy DSL. No "always allow everything". No rollback promise for external actions that cannot be reversed.

## Verification

- Unit: approval single-use/expiry; pause/kill descendant cascade; budget hard stop; connector read/write annotation; artifact hashing/signed URL; untrusted-content wrapper.
- Live: parent brief spawns two child runs; pause prevents further child claims; kill cancels tree; budget halts mid-stream; artifact downloads after sandbox deletion; expired approval refuses; wrong-target approval refuses; no secret in board HTML/JSON/log.
- Gates: tests, typecheck, lint, build; browser trace checked at 1440×900 and 390×844.

## Risks and cost

The biggest risk is making pause look real when a provider ignores cancellation. Define capability checks and expose "cannot guarantee mid-call stop" rather than pretending. Artifact storage adds retention obligations. Approval tokens are cryptographic/stateful and must be tested under concurrency. Cost: one table cluster, a panel, and stronger job-state transitions.

## Dependencies

Spec 16. Spec 17 uses this for approval/credential boundary; specs 21/24 depend on it before external reach/computer access.

## Open questions

1. Default unattended run budget: 1 model call, 3 calls, or inherited with a cap? Recommendation: 1 call for watch/goal checks, configurable.
2. Should "always allow" exist in v1? Recommendation: yes, per tool + exact target, not host-wide, and only after three successful manual approvals.
3. Artifact retention: session, 7 days, 30 days? Recommendation: 7 days unless pinned by user/org policy.
4. Is kill switch workspace-only or also global admin? Recommendation: workspace now; global later with auth.
5. Should budget block before or allow finalizing a partial reply? Recommendation: stop new calls, persist partial labelled, never discard text already delivered.

---

> **Renumbered 2026-11-22.** This document belonged to the parallel work line on this machine (its spec 26). On main it is spec **40**; the whole line renumbered 16–27 → 30–41 to continue main's own specs 16–29. Internal subsection letters and cross-references still speak the old numbers.
