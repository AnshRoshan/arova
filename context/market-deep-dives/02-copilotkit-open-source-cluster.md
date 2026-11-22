# Deep dive — CopilotKit and local-first agent cluster

Research date: **2026-10-20**. Labels: **VERIFIED** = read from current source/repository; **DOCUMENTED** = official docs summarized; **INFERRED** = analyst read; **UNVERIFIED** = could not confirm.

## Products

- OpenBot — https://github.com/CopilotKit/OpenBot · https://github.com/CopilotKit/OpenBot/blob/main/docs/architecture.md · https://github.com/CopilotKit/OpenBot/blob/main/docs/routines.md · https://github.com/CopilotKit/OpenBot/blob/main/docs/deployment.md
- OpenDots — https://github.com/CopilotKit/OpenDots · https://github.com/CopilotKit/OpenDots/blob/main/docs/SETUP.md
- OpenMuse — https://github.com/CopilotKit/OpenMuse · https://github.com/CopilotKit/OpenMuse/blob/main/docs/VERIFICATION.md · https://github.com/CopilotKit/OpenMuse/blob/main/docs/COMPUTER.md
- OpenClaw — https://github.com/openclaw/openclaw · https://github.com/openclaw/openclaw/blob/main/docs/concepts/architecture.md · https://github.com/openclaw/openclaw/blob/main/docs/start/teams.md

## Architecture reality

### OpenBot
VERIFIED service map: app 3010 · Hono server 3001 · agent computer 4100 · proof-of-concept Bot 4200 · LangGraph Bot 4201 · harness 4202 · supervisor 4500→4300 · Postgres + pgvector 5432. Durable product state is Postgres; threads/memory are delegated to CopilotKit Intelligence.

Queue VERIFIED: one `work_items` table, claimed with `SELECT … FOR UPDATE SKIP LOCKED`, DB-clock leases and attempt cap. The same mechanism serves routine sweeps, idle-computer culling and Bot handoffs.

Isolation VERIFIED: Postgres sits on a separate Docker network because a Bot shell can otherwise reach the database through the host gateway. This is the correct threat model.

Policy gateway VERIFIED: server resolves target from a server-held snapshot, evaluates CEL policy, writes audit, calls computer only if forwarded, writes a second audit row if forwarded action fails. Missing policy permits nothing; broken deny denies; malformed policy stops startup. `initiator_kind` distinguishes person/deployment/routine/responsibility/memory/handoff and is signed by deployment, not relabelable by the Bot. CSV export caps at 5,000 rows, prefixes formula injection, and audits the export itself.

Auth VERIFIED: Better Auth; Google/Microsoft/Okta plus admin-registered SAML/OIDC. `OPENBOT_SINGLE_USER=true` admits every request as one admin, and deployment refuses to start if paired with a public URL. Provider client secrets are encrypted via a storage-adapter wrapper because the upstream plugin stores plaintext JSON.

Momentum/status: MIT, alpha, ~6.8k stars; memory measured 409 MB idle / 548 MB after snapshot; minimum 2 GB, recommended 4 GB. VERIFIED.

**Critical correction:** routines are implemented in code and local start script, but docs say the shipped image does not run the worker: a stored routine computes next run and appears in UI, "and it never fires." VERIFIED. This is the same product failure mode as Arova's tick-on-GET scheduler.

### OpenDots
VERIFIED: React/Vite + Node API, browser service and supervisor. Uses SQLite for Spaces/page/thread bindings; conversations have **no local store** and require CopilotKit Intelligence. Reuses OpenBot computer services pinned to a revision.

Setup/status VERIFIED: live Intelligence/model/page chat and voice verified; Slack and spoken compute delegation unverified; cloud schedules/skill delivery unconfigured. MIT template, ~5.7k stars.

### OpenMuse
VERIFIED: Hono API, Expo web, Playwright browser worker in its own container; task worker in-process by default. PGlite is the default store and cannot be shared across processes; separate-worker deployment requires PostgreSQL. Render deployment was documented as needing more than 512 MB after an OOM failure.

Verification honesty VERIFIED: local Chromium/Docker computer smoke and 154 tests pass; live Google OAuth, Intelligence Rich-Threads replay, live-model acceptance and Android device install are explicitly not done. Multi-user auth, push, voice, multi-tenant identity and full VM isolation are roadmap.

### OpenClaw
VERIFIED: one long-lived gateway per host is a WS control plane on `127.0.0.1:18789`; clients/nodes share it. State is SQLite plus Markdown memory; no Postgres requirement and no queue. One gateway is one trust domain; team mode is configuration. Sandboxing is off by default; elevated exec is outside the sandbox and docs state it is not a perfect boundary.

Momentum/security VERIFIED: ~392.7k stars; advisories include GHSA-2qj5-gwg2-xwc4 (unsanitized CWD prompt injection, High) and GHSA-74xj-763f-264w (ACP resource link, Moderate).

## Intelligence licensing trap

VERIFIED: CopilotKit self-hosted Intelligence requires a paid Team-self-hosted/Enterprise license, Helm/Kubernetes, Postgres, Redis ≥7, OIDC, ingress/cert-manager. Free hosted/local evaluation is limited. Thus an MIT application can sit on a licensed, non-MIT state plane.

Arova decision: **do not import this dependency shape.** Postgres must remain the single durable source of truth.

## Memory and skills details

- OpenBot VERIFIED: recall is delegated to Intelligence; local rows keep provenance/review/per-Bot visibility and are applied after Intelligence returns. Scope is user-level; project scope is dropped. pgvector runs in compose, but the local memory schema has no vector column; its vector role is inferred to be knowledge/embedding, not memory recall.
- OpenClaw VERIFIED: memory is explicit Markdown (`USER.md`, `MEMORY.md`, dated memory, `DREAMS.md`), with hybrid BM25+embedding search on SQLite; Postgres hybrid search is experimental and requires `unaccent`, `pg_trgm`, `vector`.
- OpenBot skills VERIFIED: skills are instructions, not capability grants. A declaration grants nothing and is intersected with existing grants; narrowing fails open.

## Channels/surfaces

VERIFIED: OpenClaw has 40+ channels including WhatsApp, Telegram, Signal, iMessage, Teams, Slack, Discord, Matrix, LINE, Feishu, QQ, WeChat, SMS and Nostr, plus native desktop/mobile and device nodes. OpenDots uses a managed Slack adapter and WebRTC calls. OpenBot supports voice via delegation and desktop/mobile workspaces. OpenMuse is iOS/Android/web without push/voice.

## Operational traps

VERIFIED from OpenBot deployment docs:
- migrations run through `scripts/migrate.ts`, not the dev-only Drizzle CLI;
- entrypoint ordering is load-bearing or a second server can boot before migration;
- mounting only `/var/lib/postgresql/data` rather than the parent can make initdb fail behind a successful platform state;
- abandoned uploads cap at 32 files per person until a cull sweep runs.

Secondary production logs document ~8 ops-hours/week, $4,920/month at 47k tasks, memory leaks and severity drift after ~200 tasks for OpenClaw-style local deployments. Grade: DOCUMENTED/secondary, not independently reproduced.

## Decisions for Arova

### Adopt directly
1. Single-table job/work-item queue with `FOR UPDATE SKIP LOCKED`, DB-clock lease and attempt cap (refines spec 16).
2. Typed `initiator` plus a "nobody watching" audit view; Arova already stores initiator but must expose and enforce it.
3. Fail-closed policy semantics for spec 17: missing denies, broken deny denies, malformed config refuses startup.
4. Two audit rows per forwarded action and self-audited CSV export with formula-injection protection.
5. Per-seat provider/BYOK accounting as an explicit ownership fact rather than a UI convenience.

### Integrate rather than build
1. AG-UI-style event contract for agent-to-UI state, but keep Arova's existing SSE semantics rather than adopt the whole dependency graph.
2. OpenBot's `agent-computer`/supervisor pattern (or a pinned service) for spec 24 instead of building Chromium/container infrastructure.
3. Better Auth for spec 18 with encrypted storage-adapter wrapping for provider secrets.
4. Existing MCP + Playwright/browser standards for spec 17/24.

### Anti-patterns to reject
1. MIT application code whose durable conversations depend on a licensed external control plane. Arova must remain Postgres-native.
2. Treating ownership or visibility columns as isolation. Org/reporting lines are structure, not a security boundary; real authorization must be role/policy enforced.
3. Showing a scheduled routine as active when nothing can fire it. The current Arova tick-on-GET/Run Now stub is the same class of dishonesty, even when labelled.

## Corrected matrix read

The first pass was too generous:
- OpenBot always-on should be **◐ with a deployment caveat**, not assumed production-ready.
- OpenMuse task worker is **◐** by default: local task worker exists but PGlite cannot run a separate worker without Postgres.
- OpenDots always-on is **◐**; several key channel/learning paths are unverified.
- OpenClaw is genuinely always-on locally but has **no durable queue** and a weak documented security boundary; the channel score remains ●, security score must be lowered.
