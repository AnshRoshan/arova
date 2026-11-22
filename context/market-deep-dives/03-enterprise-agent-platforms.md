# Deep dive — enterprise agent platforms

Research date: **2026-10-20**. Primary sources are official docs/pricing/trust pages. Labels: VERIFIED / DOCUMENTED / INFERRED / UNVERIFIED.

## Platforms and material findings

### Microsoft Copilot Studio + Agent 365 + Entra Agent ID
Sources: https://learn.microsoft.com/en-us/microsoft-365/admin/manage/agent-registry · https://learn.microsoft.com/en-us/microsoft-365/admin/manage/agent-requests · https://learn.microsoft.com/en-us/microsoft-copilot-studio/security-and-governance · https://learn.microsoft.com/en-us/entra/agent-id/manage-agent-identities-admin · https://www.microsoft.com/licensing/faqs/122

- Agent Registry tracks Microsoft, partner, org-published and creator-shared agents, including ownerless/unmanaged agents. VERIFIED.
- Entra Agent ID gives agents a distinct identity type with blueprints, Conditional Access, RBAC/ABAC, access packages and sponsor-driven lifecycle. VERIFIED.
- Tenant publication requires admin approval; enforcement is connector/data-policy centric. There is no general runtime rules DSL, and Copilot Studio explicitly lacks a tenant policy to block arbitrary admin-defined subjects. VERIFIED.
- Purview/DLP/eDiscovery/sensitivity controls extend to agents; MCP is streamable HTTP only and BYO MCP servers must be registered/approved. VERIFIED.
- Agent 365 is $15/user/month standalone; M365 E7 $99/user/month; Copilot Studio $200/25k credits. Licensing is user-based, not agent-consumption metered. VERIFIED.
- Governance/audit events are outside Customer Lockbox. VERIFIED.

### Google Gemini Enterprise / Agent Platform / A2A
Sources: https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern · https://docs.cloud.google.com/gemini-enterprise-agent-platform/overview · https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/sandbox · https://cloud.google.com/gemini-enterprise/faq

- Strongest policy architecture in cluster: SPIFFE agent IDs, mTLS/DPoP, Agent Registry, Agent Gateway, default-deny unified access policies, Model Armor scanning prompts **and tool responses**, plain-language semantic governance, custom authorization engines, isolated sandbox sessions, Memory Bank, AutoRaters, online eval, synthetic simulation, unified trace/topology. VERIFIED.
- Business edition starts around $21/seat/month; Standard/Plus add residency/CMEK/VPC-SC/audit/regulatory controls; grounding pricing is explicit. VERIFIED.
- This is a platform stack Arova should study, not become.

### AWS Bedrock AgentCore
Sources: https://aws.amazon.com/bedrock/agentcore/pricing/ · https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry.html · https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a.html

- Policy engine intercepts every gateway tool call **outside** the agent boundary, authored natural-language → Cedar/Dogwood.
- Temporal policies are the standout: require a recorded human approval before consequential action, make approval **single-use** and consumed by one action, cumulative session limits, step ordering, value matching, permission narrowing when human disengages. VERIFIED.
- Agent Registry validates schemas, approval workflow, hybrid search, MCP/IAM/JWT. Memory has STM/LTM actor+session isolation; OTel observability; A2A proxy. Pricing: policy $0.000025/authorization, gateway $0.005/1k invocations, registry first 5k records free then $0.40/1k, LTM $0.75/1k records, microVM $0.0895/vCPU-hour. VERIFIED.

### Salesforce Agentforce
Sources: https://www.salesforce.com/agentforce/script/ · https://www.salesforce.com/agentforce/pricing/ · https://www.salesforce.com/agentforce/news/press-releases/2025-06-23/agentforce-3-announcement/

- Agent Script gives deterministic auditable steps over LLM reasoning, free with Agentforce; simulator, full traces, Testing Center, Command Center, Data Cloud tracing, OTel export. VERIFIED.
- MCP + Heroku managed MCP + MuleSoft A2A; FedRAMP High. VERIFIED.
- Flex credits $500/100k, 20 credits/action = $0.10/action. VERIFIED.
- Agent identity/registry is comparatively weak; permission-set based. INFERRED.

### ServiceNow + Moveworks
Sources: https://www.servicenow.com/products/ai-control-tower.html · https://newsroom.servicenow.com/press-releases/details/2025/ServiceNow-completes-acquisition-of-Moveworks/default.aspx · https://www.servicenow.com/docs/r/intelligent-experiences/ai-native-sku-overview.html

- Moveworks is no longer a separate competitor: acquired, relaunched as EmployeeWorks + Autonomous Workforce. VERIFIED.
- AI Control Tower discovers agents/models/copilots/MCP servers/datasets, CMDB anchor, kill switch, EU AI Act/NIST risk frameworks, Veza least privilege, Traceloop runtime observability, cost/ROI. VERIFIED.
- A2A outbound and MCP Server Console across tiers; short-term shared session memory and `sn_aia_memory` vector LTM; "assist" consumption meter. VERIFIED/DOCUMENTED.

### Sierra
Source: https://sierra.ai/blog/agent-os-2-0 · https://sierra.ai/product/trust-and-reliability

- Journeys, Workspaces, Insights, Agent Data Platform, supervisory models, deterministic system-of-record integrations, PII controls, SOC 2/HIPAA/GDPR/PCI/FedRAMP/ISO. VERIFIED.
- Outcome pricing unpublished. UNVERIFIED.
- Relevant pattern: wrap LLM output in supervisory models and use deterministic record integrations. Not a direct competitor for a general internal workspace.

### Writer
Source: https://writer.com/plans/

- Sells governance/observability/auditability, orchestration/approvals and Knowledge Graph, but is a content-workflow product rather than a general agent control plane. DOCUMENTED.

## 80/20 architecture for Arova

Do **not** adopt the enterprise stack. Adopt the seven minimal primitives:

1. **Agent registry table:** owner, sponsor, state (`draft → requested → published → blocked → retired`), timestamps, counts for ownerless/disabled. No SPIFFE/K8s needed.
2. **Default-deny pre-action gate:** typed rule over `(actor, tool, condition, effect)`, evaluated outside the model loop.
3. **Single-use, expiring approval token:** the highest-leverage AWS insight. An approval must authorize one run step and be consumed, not remain a blanket permission.
4. **Budget policy:** per-run step cap + per-agent daily cost cap + policy-decision events.
5. **Review-before-promote memory:** proposed → human-approved → active.
6. **Append-only audit:** one event per run step with tool, argument digest, policy decision, model/provider, tokens, cost and artifact.
7. **One trace tree:** parent/child tasks, tool calls, approvals, pauses, cancellations, outputs. No dashboards before this is readable.

## Competitive classification

- Rails: AWS AgentCore policy/registry/gateway concepts, Google A2A/MCP interoperability.
- Competitors for the work surface: Microsoft, Google, Salesforce, ServiceNow EmployeeWorks, Writer.
- Separate lane: Sierra (customer-facing CX).
- Prerequisite: none of the enterprise patterns matter without real auth and a principal. Arova's biggest blocker is not policy grammar; it is principal identity.
