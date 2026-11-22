# 17 — Tool execution plane, MCP and policy gateway

**Status: APPROVED (D-22 sequence) — core scope complete and live-verified (D-24/D-26/D-27, 2026-10-26): the policy gateway with before/after audit rows; model-initiated tool rounds in both reply paths; `web_fetch` through the SSRF guard and allow-list; the streamable-HTTP MCP transport with discovery-gated, approval-paused writes; the credential vault (sealed at rest, label-only surfaces, Authorization resolved at call time); and the UI status surfaces. All verified against scripted model and MCP servers with zero external keys. Deferred (D-27): per-tool MCP allow-lists, SSE session handling, Record-stream rendering of gateway decisions.** Part of the 2026-10-20 market roadmap (`context/market-comparison.md`).

## Goal

Every tool call made by a seat passes through one server-side gateway that authorizes it, executes it, records it, and returns a typed result. MCP servers become real tools; a small safe first-party set goes live; writes require approval or an explicit grant. **Granting a tool becomes meaningful.**

Measurable: a granted read tool executes and returns data; an ungranted or policy-denied call never reaches the network; every executed call has before/after audit rows; an MCP write pauses for approval; a secret never appears in a board payload.

## Why now

The market treats connectors and MCP as table stakes (OpenDots, OpenBot, OpenClaw, Lindy, Zapier, Claude, Gemini). Arova lists 9 tools with reasons and executes none. Without a policy gateway, adding real tools is unsafe; with one, it becomes Arova's trust differentiator.

## Scope

### 17a — Tool contract
A typed `ToolCall` / `ToolResult` with: tool id, arguments, risk class (`READ | WRITE | EXTERNAL`), timeout, output cap, idempotency key, approval requirement, and a structured error. The registry remains the single source of truth; `available` is computed from a configured adapter, not hardcoded.

### 17b — Policy gateway
One function every call must pass:
1. Resolve actor, workspace, seat and org.
2. Check the seat's capability grant and permission mode (`plan` blocks writes).
3. Check org/workspace policy: allowed hosts, file roots, MCP servers, tool risk class.
4. Check approval state for writes; create an `approvals` row when needed.
5. Write an audit row **before** execution with the decision and rule.
6. Execute through the adapter.
7. Write an audit row **after** with result/error and duration.

A denial names the rule and never executes. The gateway is server-only; the model cannot call an adapter directly.

### 17c — MCP client
Per-workspace MCP server configuration (transport: streamable HTTP first, stdio for local dev), tool discovery, per-seat allow-lists, argument redaction, output truncation, timeouts, cancellation. An MCP server may add tools but can never bypass the gateway. Server credentials are stored encrypted and never returned.

### 17d — First-party tools
- `web_fetch`: allow-listed hosts, SSRF guard (no private IPs/metadata endpoints), size cap, content-type check.
- `read_file` / `write_file`: only inside a workspace volume that exists (spec 24); until then remain unavailable.
- `save_note` is already live; route it through the gateway for uniform audit.
- `consult_teammate` / `handoff` remain prompt-level orchestration, not external tools.
- Shell, browser and commands stay unavailable until spec 24.

### 17e — Credentials
A `credentials` table (workspace, kind, encrypted value, created_by, last_used_at) using AES-GCM with a server-only key. Write-only API; no read endpoint. Rotation and deletion are audited. Never log values.

### 17f — UI
Capabilities show `live / dormant / unavailable` from the real adapter. MCP servers show connection status and discovered tool count. A write tool renders an approval card with the exact arguments before execution. The Record stream shows gateway decisions and tool results without secrets.

## Deep-research amendments (2026-10-20)

- Use OpenBot's fail-closed semantics: missing policy permits nothing, a broken deny denies, malformed configuration refuses startup.
- Approval is middleware over the tool pipeline, not a special case in one reply path.
- Adopt four action modes from the market: act alone, act if pre-approved, ask, hand off. A tool may have only `ask`, which is safer than a fake universal auto-run.
- Hard invariant: **access inherited, never widened.** A tool can only reach what the triggering human/member/role can reach (`market-deep-dives/01`, Cursor).
- Every connector/tool must declare `read | write | destructive`. Unannotated custom MCP defaults to approval, following Claude's safe rule.
- Streamable HTTP is the first MCP transport; stdio is local/dev-only and requires explicit operator trust.
- Do not require Composio. It may be one adapter; Arova's native boundaries remain MCP + Postgres + BYOK.
- "Don't ask again" is scoped to exact tool + target + seat and is a v1.1 decision, not a host-wide permission.
- Exposing Arova as an MCP server is a later differentiation step after its own gateway is solid.

## Value-source gate

Tool state comes from the adapter and registry, not a hardcoded list. "Executed" requires a `tool_calls`/audit row with a result. "Connected" requires a successful handshake. A tool that is configured but unreachable is `dormant`, never green.

## Data and code

- `src/db/schema.ts`: `tool_calls`, `credentials`, `mcp_servers` (or extend `connections`), indexes on `(workspace_id, created_at)`.
- `src/lib/tools.ts`: risk class + adapter availability; `src/lib/policy.ts` (pure decision function + tests); `src/lib/mcp.ts` (client); `src/lib/credentials.ts` (encrypt/decrypt).
- `src/app/api/board/route.ts`: execute through the gateway; approval flow; audit.
- `src/app/page.tsx`: capability/MCP status; approval cards; audit rows.
- Env: `MCP_*`, `CREDENTIAL_ENCRYPTION_KEY`, `TOOL_ALLOWED_HOSTS`.

## Exclusions

No browser automation, terminal or host filesystem (spec 24). No 1,000-connector catalogue; connectors arrive through MCP/OAuth adapters (spec 21 and later). No arbitrary shell. No policy DSL or CEL engine in v1 — a typed function with explicit rules is enough. No third-party key in the browser.

## Verification

- Unit: policy allow/deny matrix; SSRF host checks; output truncation; credential encrypt/decrypt; MCP discovery parsing.
- Live: grant `web_fetch` and fetch an allowed page; deny a private IP and a non-allow-listed host; MCP read executes, MCP write pauses for approval; approve and confirm one execution; revoke and confirm refusal; audit rows before/after; board payload contains no key.
- Gates: tests, typecheck, lint, build; worker runs the call in a job (spec 16).

## Risks and cost

The gateway is a chokepoint: a bug can block all tools while fail-open would be dangerous. Choose fail-closed, with explicit diagnostics. MCP servers are untrusted code/endpoints; discovery must be bounded. Cost is new tables, an encryption key, and adapter maintenance.

## Dependencies

Spec 16 (durable jobs) for long calls; spec 18 for actor identity and role checks.

## Open questions for the user

1. MCP transport first: streamable HTTP, stdio, or both? Recommendation: HTTP first, stdio only for local dev.
2. First-party tools: `web_fetch` only, or also `web_search` through a keyless provider? Recommendation: `web_fetch` only until a search provider is chosen.
3. Approval granularity: every write, or per-tool "always allow this seat"? Recommendation: every write in v1, with a seat-level allow-list later.
4. Credential key: operator-provided `CREDENTIAL_ENCRYPTION_KEY`, or derive from an existing secret? Recommendation: explicit env var, documented in `.env.example`.
