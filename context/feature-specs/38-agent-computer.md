# 24 — Agent computer: browser, files and terminal via a provider contract

**Status: SUPERSEDED by main's spec 19 (local OS sandbox, shipped 2026-10-28).** The sandbox substrate this spec asked for exists: `src/lib/sandbox.ts` + the WSL/bubblewrap provider (live-verified) + the per-seat console. Full desktop control remains unimplemented and is tracked in that spec's own open items.

> Was: PROPOSED — not implemented. This is the largest substrate gap and the highest-risk unit. It should follow the worker, tool plane and auth. Part of the 2026-10-20 market roadmap.

## Goal

A seat can use a browser, a workspace filesystem and a terminal inside an isolated environment, through the existing `SandboxProvider` contract, with every action passing the policy gateway and a human able to take over. **Nothing executes on the host.**

Measurable: a seat opens an allowed page, takes a screenshot, saves a file, and reads it back; a blocked domain or path is refused with the rule named; a human takeover URL opens the same live session; a kill switch stops the environment; every action has audit rows; no host command can run.

## Why now

The market treats a per-agent computer as the defining capability: Grok Bot, OpenAI Dots, OpenMuse, OpenBot, OpenDots, Genspark, Claude Cowork (files/Chrome), Devin/OpenHands (dev sandboxes). Arova's `sandbox.ts` deliberately refuses; that is honest but it caps the product at conversation and prompt-level tools. This spec closes the gap without building a browser or a VM fleet.

## Scope

### 24a — Provider contract
Extend `SandboxProvider`:
`create(workspace, seat, limits) · start/stop/destroy · status · exec(command, timeout) · readFile/writeFile/list · browser.navigate/screenshot/click/type/scroll · browser.takeoverUrl · usage()`.
Capabilities are declared per provider (some support only browser, some browser+files+terminal). The UI reflects what the provider actually supports.

### 24b — Adapters
- **Dev/local:** Docker container with Chromium + a workspace volume, one per seat, resource caps, TTL.
- **Production:** choose one first — E2B (sandbox), Browserbase (browser), or Daytona. Implement adapter tests against the contract; no vendor-specific code leaks into the UI or agent.
- Env-driven selection (`SANDBOX_PROVIDER`, `SANDBOX_API_KEY`, `SANDBOX_BASE_URL`), matching the provider doctrine.

### 24c — Policy
Per-seat permissions: browser/file/shell. Domain allow-list; file roots; command allow-list or deny-list; per-action approval for writes, downloads, uploads and shell. Every call goes through the spec 17 gateway. SSRF/private-network blocks; no access to host mounts, metadata endpoints or secrets. A `computer_actions` audit row before/after.

### 24d — Human takeover
The live browser view is a stream or a short-lived signed URL. "Take control" pauses the agent, opens the same session, and hands back on release. No screen recording stored by default; optional snapshots with retention.

### 24e — Cost and limits
Per-run minutes, concurrent sandboxes, disk, bandwidth; a hard kill switch per workspace and globally. Usage is recorded and shown; a run that exceeds the limit stops with an honest message. Idle sandboxes are destroyed on a TTL.

### 24f — UI
Computer panel with live screen, browser URL, files, terminal output, activity feed, take-control, stop/restart. A "computer not configured" state explains the env vars. Actions appear inline in the thread as they happen; no hidden work.

## Deep-research amendments (2026-10-20)

- Market computers are not one design: Grok shares one per user, Cowork is ephemeral per session, OpenBot uses one per Bot, Cursor/E2B use microVMs, Browserbase supplies managed takeover. Arova must name its isolation model explicitly.
- **Never use Grok Bot's shared user-wide browser/files as the target model.** Use one session per workspace+seat, with an isolated profile, TTL and no inherited credentials by default.
- Local adapter: Docker container with browser + files; shell off by default.
- Production adapter: E2B for terminal/files, Browserbase only when managed browser/takeover is required. Daytona's OSS repository is archived, so keep it contract-fallback only.
- Connector authentication stays server-side; tokens never enter the sandbox. Mandatory egress allow-list and private-network denial are startup requirements.
- Takeover must pause the agent and refuse its actions while a human drives (OpenBot pattern).
- Sandbox state can expire; artifacts must survive through spec 26.
- No browser/terminal is enabled until specs 17, 18 and 26 exist and pass their gates.

## Value-source gate

"Live" requires a provider session id and a fresh frame; "running" requires a heartbeat. A screenshot is stored only if it exists. "Take control" requires a signed URL from the provider. If the provider is unconfigured, the UI says so and the tool stays unavailable.

## Data and code

- `src/lib/sandbox.ts`: extend the contract + a contract test suite.
- `src/lib/sandbox/providers/{docker,e2b,browserbase}.ts` (choose one production adapter first).
- `src/lib/policy.ts`: browser/file/shell rules.
- `src/db/schema.ts`: `computer_sessions`, `computer_actions`.
- `src/worker/`: long-running session lifecycle; `src/app/api/board/route.ts`: start/stop/takeover.
- `src/app/page.tsx`: computer panel.
- Env: `SANDBOX_PROVIDER`, `SANDBOX_API_KEY`, `SANDBOX_BASE_URL`, `SANDBOX_MAX_MINUTES`.

## Exclusions

No host execution, no graphical desktop, no autonomous checkout/payments, no VM fleet management, no arbitrary binary uploads, no cross-workspace file access. No browser extension or personal-profile login. Do not claim a computer exists when only a contract placeholder is configured.

## Verification

- Contract tests: every adapter implements the same behavior; timeouts; destroy; capability reporting.
- Policy: blocked domain, private IP, path escape, shell denial, write approval.
- Live: open an allowed page, screenshot, download/read a file, run an allowed command; attempt a blocked action; take control; kill switch; audit rows; no host access.
- Gates: tests, typecheck, lint, build; worker/sandbox health.

## Risks and cost

This is the highest-risk feature: arbitrary execution, browser sessions with credentials, data exfiltration, cost runaway, and vendor lock-in. Mitigations: no host execution, per-action policy, allow-lists, TTLs, hard budget caps, kill switch, audit. Cost: provider fees, engineering time, operational on-call, and a security review before exposing it to members.

## Dependencies

Spec 16 (worker/lifecycle), spec 17 (policy gateway), spec 18 (identity/roles). Spec 19 for cost/traces. Spec 23 skills can then call computer tools.

## Open questions for the user

1. Which provider first: E2B (general sandbox), Browserbase (browser specialist), or local Docker (dev only)? Recommendation: local Docker in dev + Browserbase or E2B for production, chosen after a cost/security comparison.
2. Are terminal commands required in v1, or browser + files only? Recommendation: browser + files first; shell behind an admin-only flag.
3. Who may use a computer: all members, or admin-approved seats? Recommendation: admin-approved seats with a per-seat budget.
4. Data retention for screenshots/files: session-only by default? Recommendation: session-only, with explicit export.
5. Is this the right next investment, or should channels/skills come first? Recommendation: solve 16–18 first; revisit after the first paid user.

---

> **Renumbered 2026-11-22.** This document belonged to the parallel work line on this machine (its spec 24). On main it is spec **38**; the whole line renumbered 16–27 → 30–41 to continue main's own specs 16–29. Internal subsection letters and cross-references still speak the old numbers.
