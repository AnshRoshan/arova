# Deep dive — coding agents, workflow engines and agent frameworks

Research date: **2026-10-20**. Primary sources: vendor docs and GitHub. Labels: VERIFIED / DOCUMENTED / INFERRED / UNVERIFIED.

## Products reviewed

- Cursor Cloud Agents — https://cursor.com/docs/cloud-agent/security · https://cursor.com/docs/cloud-agent/self-hosted
- GitHub Copilot coding agent — https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent
- OpenAI Codex Cloud — https://developers.openai.com/codex/cloud
- Google Jules — https://jules.google
- LangSmith Deployment (formerly LangGraph Platform) — https://docs.langchain.com/langsmith/agent-server-overview
- CrewAI checkpointing/capabilities — https://docs.crewai.com/en/concepts/checkpointing.md · https://docs.crewai.com/en/concepts/agent-capabilities.md
- n8n queue mode/pricing — https://docs.n8n.io/hosting/scaling/queue-mode/ · https://n8n.io/pricing/
- Microsoft Agent Framework Harness — https://learn.microsoft.com/en-us/agent-framework/concepts/harness
- Cline — https://docs.cline.bot/features/auto-approve.md · https://docs.cline.bot/features/plan-and-act.md · https://docs.cline.bot/features/checkpoints.md
- Roo Code — https://docs.roocode.com/basic-usage/using-modes
- Zapier MCP/agent skills — https://docs.zapier.com/llms.txt · https://docs.zapier.com/mcp/manage/skills.md
- Copilot pricing/billing — https://docs.github.com/en/copilot/concepts/billing/copilot-requests
- Codex pricing — https://developers.openai.com/codex/pricing/
- Relevance pricing — https://relevanceai.com/pricing

## Execution patterns that matter

- **Cursor:** Firecracker microVM per agent; state machine Start → Provision → Run → Persist → Handoff → Recycle; artifacts persist and idle sessions hibernate/delete. Self-hosted machines keep Cursor's planning but delegate file edits, terminal, computer use and local MCP to the customer worker. VERIFIED.
- **GitHub Copilot:** ephemeral Actions environment, hard 59-minute cap, one branch/PR per task, repo-scoped, timeout in setup steps, rulesets can block unless bypass. VERIFIED.
- **Codex Cloud:** published environment reused, each task gets isolated workspace; network secrets and egress allow-list. VERIFIED.
- **Jules:** VM clone → plan → diff approval → PR; concurrency is priced. VERIFIED.
- **LangSmith Deployment:** assistants/threads/runs; background run polling; cancel as **interrupt vs rollback**; crons create fresh threads; per-resource auth, TTLs, custom store/checkpointer. VERIFIED.
- **CrewAI:** event-driven checkpoints, lineage ID and forking, completed tasks skipped on restore. VERIFIED.
- **n8n:** main creates execution; Redis hands IDs; worker rereads workflow from Postgres, writes result/completion; shared encryption key; binary data belongs in S3. VERIFIED.
- **Microsoft Agent Framework:** archived AutoGen successor; planning/todo, context compaction, per-call persistence, approval middleware with don't-ask-again, bounded iteration, observability. VERIFIED.
- **Cline:** per-category approvals; workspace/outside and safe/all split; plan mode structurally cannot write/execute; shadow Git checkpoints. VERIFIED.
- **Roo:** mode bundles persona + capability + access level, model persists per mode. VERIFIED.

## Tool/MCP consensus

VERIFIED: streamable HTTP is the preferred transport, SSE is legacy, stdio is local. Cline, Cursor and GitHub converge here. Zapier exposes the same integration surface as skill + npm module + CLI + stdio MCP, with agentic vs managed modes.

Arova decision: spec 17 HTTP-first MCP transport is correct. Do not invent a new transport. Later expose selected Arova capabilities as a streamable-HTTP MCP server, subject to the same policy gateway.

## Pricing signal

VERIFIED/DOCUMENTED:
- Jules sells concurrency/tasks per day.
- Codex gates higher usage, code reviews, VM size and enterprise controls.
- Copilot has per-session premium request units and agent-specific SKUs.
- Cursor gates cloud agents/automations at plan tiers.
- n8n charges by execution while users/workflows are unlimited.
- Relevance sells unlimited agents/users with custom credits and enterprise controls.

Signal: users pay for **throughput in understandable units** (task, execution, session, concurrency), not opaque token counts. Arova should expose both estimated token cost and a human-facing "task/run" count, while keeping raw accounting internally.

## Direct competition vs component supply

Direct competitors for Arova's seat: none of the coding-agent products combine organization structure, durable channel, org memory and BYOK. They compete for delegated software work.

Components/patterns to draw from:
- LangSmith Deployment → thread/run/checkpoint/cancel grammar.
- n8n → execution as billing/operations primitive.
- CrewAI → checkpoint lineage/fork.
- Microsoft Agent Framework → approval middleware and todo/compaction.
- Cline/Roo → permission and mode bundles.
- Zapier → connector/MCP packaging.
- E2B/Modal/Daytona/Namespace → execution substrate partners.
- LangGraph/CrewAI/MAF → frameworks, not consumer competitors.

## Concrete decisions now available for the specs

### Spec 16
Keep the Postgres `FOR UPDATE SKIP LOCKED` queue. Redis/BullMQ is not needed at current scale and would make the audit trail a broker side effect.

Add:
1. `cancel_mode`: `interrupt` (keep completed writes) or `rollback` (reverse run-owned writes). Default: interrupt; rollback only for idempotent writes.
2. `parent_run_id` / `attempt_of` lineage: retry creates a child attempt or linked run; do not mutate history.
3. A named terminal `TIMED_OUT` failure class and published wall-clock policy.
4. Lease reclaim boundary should be a **step checkpoint**, not only between whole runs. This determines whether retry wastes an entire model call.

Reject: pure in-process scheduler, Redis-first, and retry-as-mutation.

### Spec 17
Adopt Microsoft/Cline shape:
1. Approval policy is middleware over the tool pipeline.
2. Seat-scoped "don't ask again" can be a v1.1 release, but every approval is tool + target + effect scoped and revocable.
3. Hard invariant: **access inherited, never widened.** A tool call can reach only what the triggering human/member/role is allowed to reach.
4. Read/write split is accepted market granularity.
5. Do not make Composio a required dependency. It may be an adapter behind the gateway, but the product should remain Postgres/MCP/BYOK-native.

Reject: policy DSL and arbitrary host/network access.

### Spec 19
Add to observability:
1. `run_artifacts` as first-class rows: links, diffs, files, screenshots, test outputs, tool results. Cursor/Codex/Copilot prove trust comes from reviewable artifacts, not logs.
2. Cost panel: estimated tokens + run/task counts + per-seat/provider rollups.
3. Failure taxonomy: provider error, timeout, policy denied, lease lost, budget reached, tool error, cancellation.
4. No external OTel vendor in v1. Postgres trace tree first.

### Spec 20
Copy CrewAI's clean split:
- **Memory = what to know.**
- **Skills = how to work.**
- Do not merge into one table.

Add TTL/store semantics for memory expiry/decay. Keep review-before-save and per-scope isolation. Ship pgvector only when extension is available, with keyword fallback and transparent mode.

### Spec 23
Decide format: store the payload as **markdown + frontmatter** inside the database, compatible with SKILL.md/agentskills.io conventions. This gives free import/export across agent ecosystems and avoids a bespoke step DSL.

Adopt Roo/Cursor mode idea: a skill's tool grants intersect with both seat capability and permission mode. A plan-mode seat cannot execute a write-bearing skill merely because the skill grants it.

## Open decisions the research sharpened

1. Checkpoint at model step or every tool step.
2. Whether rollback is possible for message writes; likely keep assistant partial, mark cancelled.
3. Maximum wall-clock per job (suggest 15 min chat-like work, configurable long tasks later).
4. Human cost unit: "runs today" + estimated tokens, not credits.
5. Whether "don't ask again" is available at all in v1.
6. Whether Arova exposes itself as an MCP server in v1 (recommend later, after gateway).
