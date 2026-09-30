# Feature 05 — Per-agent capabilities, handoff, and enforcement

Goal: an agent has a real configuration surface — which tools it holds, what it may do, whom it may reach — and removing a capability genuinely removes the behaviour.

Modelled on xAI's `grok-build` `AgentDefinition` (tools, disallowedTools, permissionMode, allowedSubagentTypes, mcpServers, mcpInheritance, effort, maxTurns, isolation) and OpenAI's Agents SDK (`handoffs` as transfer of control vs a subagent called as a tool). Deliberately narrower: only what this deployment can perform.

## Registry (`src/lib/tools.ts`)
14 tools. **Available (4):** `consult_teammate`, `handoff`, `create_routine` (propose-then-confirm), `request_approval`. **Unavailable, listed with a reason (10):** `save_note`, `web_fetch`, `web_search`, `browser`, `run_command`, `read_file`, four connectors. A grant can only narrow the available set — naming an unavailable tool cannot bring it into existence.

## Enforcement
- The routing pass is offered only the actions the agent holds. Removing `handoff` removes the option from the prompt, so the model cannot take it even when told to.
- `canConsult` / `canHandoffTo` are per-target allow-lists; `*` means every teammate; an empty list means nobody; self is never a target.
- `permissionMode: plan` refuses write actions with a message naming the switch to change.
- `effort` and `modelParams.maxTokens` set the real output budget; `maxTurns` is clamped to 25.
- MCP servers are stored, filtered by inheritance and displayed, with an explicit "no MCP transport is wired" note. No MCP entry can create a tool.
- `normaliseCapabilities` rejects escalation: an unknown or bypass permission mode falls back to the default rather than being honoured.

## Verified live
Handoff transferred a turn Meridian→Scout (attribution `authoredBy: Scout`, `handoffFrom: Meridian`, delegation row mode `handoff`). Approval raised a real `approvals` row (1→2) and the reply said nothing was done. Plan mode refused `createRoutine`. Negative test: with `handoff` removed, an explicit instruction to hand off produced a consult instead.

## Out of scope
MCP transport, multi-hop chains, agent-authored notes, any network or host tool, runs executing, and any UI for isolation/worktree (no sandbox exists to isolate).
