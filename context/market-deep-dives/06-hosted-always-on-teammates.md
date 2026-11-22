# Deep dive — hosted always-on teammate cluster

Research date: **2026-10-20**. Labels: **D** documented from vendor source · **I** inferred · **U** could not verify. Numeric usage caps and some plan pages were not fully public.

## Grok Bot

- Access is bundled across Cursor paid plans and selected X Premium/Super/Ultra subscriptions; linked plans are usage grants, non-stacking, "whichever grants more." Enterprise access is AE-mediated. D https://cursor.com/help/grok-bot/plans
- One persistent cloud computer is shared per user, not one per Bot: common `/workspace`, browser cookies and CLI credentials. Each Bot has its own screen and one computer-use task per screen. Firecracker microVMs, US-only, no BYO model/image, no on-prem. D https://docs.x.ai/grok-bot/computer-and-apps · https://docs.x.ai/grok-bot/security-faq
- Takeover covers password/2FA/CAPTCHA/payment; Update/Recover/Reset, with reset returning to last snapshot. D
- Memory is per Bot plus Team Bot shared memory, with private notes promotable by owner/manager. A personal-memory view/edit/delete UI is not documented. Approvals/Auto Review do not review memory writes. D/I
- Skills are saved from tasks or browser-recording "Teach a task" (≤10 min, no mic); output is a draft. All Bots share one private skill library. Routines can run on schedule or events including Slack/GitHub. D
- Allow once / always allow / deny; independent Auto Review model; unattended approvals expire around 10 minutes. Enterprise controls: org enable, network controls, team secrets, action recording (90 days), OTel, MCP allowlist, audit, SCIM, admin computer kill. ISO 27001/42001 claimed; default residency is US. D
- No Grok Bot API/BYOK; only connectors/MCP allowlist. I

**Correction to first pass:** the market's headline agent computer is not necessarily one computer per agent. Grok Bot explicitly shares one computer across a user's Bots and warns about it. Arova's per-seat isolation is therefore a genuine differentiator—if it exists. **Do not copy:** gating real controls behind enterprise plans.

## OpenAI Dots

- Access on Pro 100/200/500 outside EEA/UK/CH, Business Premium, Enterprise off by default. First dot plus an allowance for deeper work is documented, numeric cap is U. D https://learn.chatgpt.com/docs/dots.md
- Dot owns a cloud computer with files, software and browser state across uses; take over/return; credentials use a private form outside transcript. Optional connected local computer must remain online. D
- Inherits ChatGPT memory and writes its own. Users cannot view/edit/delete individual dot memories—only delete the dot. This is a governance failure. D https://help.openai.com/en/articles/20001529
- Four rule behaviours: act without asking, act if pre-approved, ask, hand off. Admin controls cover dots, channels, local computer, custom rules, browser/network/computer use. Compliance API/audit/analytics exist. D
- Channels: ChatGPT, calls, Slack and Teams with per-channel continuity. D

**Correction:** first pass treated Dots as the clearest memory story. It is the clearest **memory opacity** story: the user is told memory exists but cannot inspect individual facts. **Do not copy:** one personal dot without an explicit per-agent identity.

## Claude Cowork

- Cloud by default on Pro/Max since 2026-10-06; local option removed and migration irreversible. Team/Enterprise cloud is beta and per-org. Pricing: Pro $20, Max from $100, Team $20/$100 seats, Enterprise $20/seat annual with 20-seat minimum and API-rate usage billing. Exact Cowork task caps U. D https://claude.com/pricing · https://support.claude.com/en/articles/15520349 · /13345190
- Each session runs in an ephemeral sandbox destroyed at end; no cross-sandbox state or private network. Egress allowlist is mandatory/non-bypassable. Connector tokens never enter the sandbox; calls are server-side. D https://support.claude.com/en/articles/14479288
- Account memory has view/edit/delete; project memory is scoped and does not leak across projects, with an account-memory toggle. Cleanest documented memory governance in cluster. D
- Three approval modes plus per-connector always allow/needs approval/blocked. Org can forbid Auto and always-allow writes. Read-only exemption applies only when connector annotates it—most custom MCP does not. Enterprise has SSO/SCIM/RBAC, audit, OTel, retention, CMEK, IP allowlist; HIPAA orgs get Cowork off by default. D
- No admin restriction on project creation. D/I gap.

**Correction:** first pass marked Cowork computer ◐. The security model is actually sophisticated despite ephemeral isolation. Keep ◐ because no persistent agent filesystem/computer. **Key design to borrow:** connector actions must declare read/write; if they cannot, default them to gated.

## Manus 2.0

- Free: 300 credits/day, one concurrent task, two automations. Pro from $20 (4k) or $40 (8k): 20 concurrent tasks, 20 automations, 2.0 Max. Team from $20/seat with SSO, training opt-out, analytics, access control. Add-ons never expire; plan credits do not roll. D https://help.manus.im/en/articles/11711111
- Sandbox virtual computer, persistent filesystem, installs software, cloud browser with user logins, local Browser Operator. Separate phone/Cue subscription. D
- No product memory feature documented. Context is Project master instruction + file knowledge base applied to tasks. D https://manus.im/docs/features/projects.md · /llms.txt
- Automations: scheduled, event-triggered (GitHub PR, Shopify refund, invoice email), natural-language beta. API, MCP/custom MCP, Slack, Zapier, GitHub. D

**Correction:** first pass marked durable memory ◐. **Manus has no documented agent memory**, only project context. **Lesson:** a shared project instruction + files can be an honest, cheaper substitute for pretending to remember.

## Genspark Super Agent

- Free 100 credits/day but lifetime cap can stop refills. Plus $24.99 (10k, 50GB), Pro $249.99 (125k, 1TB), Team $40/seat (2–150), Enterprise ≥20k credits/seat. Zero-credit standard weekly quota; promos expire 2026-12-31. D https://www.genspark.ai/helpcenter/membership-plans · /team-enterprise-plans
- Dedicated sandbox with real browser, filesystem, execution. Files live for the session unless delivered. 500MB/1GB limits; parallel tasks. No takeover documented U.
- SecondBrain auto-captures projects/notes/email/calendar/Slack/Notion/CRM context; SOC 2 Type II + ISO 27001. Per-item review/edit U.
- Workflows schedule or inbound-email trigger, templates, test run with simulated data, run history and Pending Confirmation. Skills shareable, 100+ public skills. No MCP/API/BYOK documented U/absent. Enterprise governance contract-dependent.

**Correction:** "skills" and scheduled automation are stronger than first pass; model choice/BYOK is absent. **Lesson:** test run + pending confirmation is a low-cost trust loop worth copying.

## Lindy

- Credit $0.01, workspace-pooled, per-seat caps; pause not overbill; top-ups carry over; plan credits do not. Pricing-page plan names conflict with docs ("Team $49.99/5,000" vs Plus/Pro/Max); actual tier prices in billing. Free credits last 7 days. U/D mixed https://docs.lindy.ai/pricing.md · https://www.lindy.ai/pricing
- Computer/browser use on Pro/Max, Chrome extension, hosted artifacts, 1,000+ integrations. MCP public streamable-HTTPS only, auto-import supported tools, per-tool off switches. D
- Memory is a versioned file system with personal/team/system scopes, editable/uploadable and `.skills/` folders. Automatic capture described only as persistent workspace context; no documented semantic recall. This corrects the first pass's ●.
- Guardrails are per integration: always allow, require approval, don't offer. Reads are not guarded; guardrails apply only in shared Slack threads, while DM/web/iMessage are unguarded—an important gap. Enterprise SSO/SCIM/audit/HIPAA BAA, SOC 2 Type II, GDPR/PIPEDA claims.
- Channels: Slack, iMessage/SMS, phone, meetings, email—widest in cluster. No current public API/webhooks page found.

**Lesson:** memory as versioned browsable files is better UX than hidden embeddings. **Mistake to copy:** writes unguarded outside shared channels.

## Devin

- Free/Pro $20/Max $200; Teams $80 minimum plus $40 full seats and free unlimited flex seats on shared on-demand credits, 200-user cap; Enterprise ACU contracts. Up to 10 sessions Pro/Max; Teams/Enterprise unlimited; Windows +9% usage; idle sleep 30 minutes (5–120 enterprise). Per-user/org caps map to IdP groups. D https://docs.devin.ai/admin/billing/self-serve.md · /admin/billing/usage.md · https://devin.ai/pricing
- Session VM with IDE/browser/shell; macOS/Windows/Android emulator VMs; saved browser profiles. Local Hands executes on user machine with approval; Outposts executes on customer infrastructure while cloud does inference; dedicated/VPC/PrivateLink/air-gapped options. D
- Memory is a personal-per-org Git drive of Markdown notes with source/date links, auto-learned, conflict-safe parallel commits, "Updated memory" card and nightly Dreaming consolidation. Automation sessions do not read/write it. Strongest documented memory substrate.
- Security profiles control network/MCP/git; AI guardrails; CMK/IP allowlists; SAML/OIDC/SCIM/RBAC; Terraform-managed automations; SOC 2. Cloud audit-log availability not clearly documented U.
- Full API (304 pages), MCP server, plugin marketplace, Slack/GitHub/Linear triggers.

**Correction:** first pass under-scored Devin's org/enterprise substrate. Its **Git-backed memory with provenance and nightly consolidation** is highly relevant to spec 20. **Mistake to copy:** ACU pricing and per-OS surcharges.

## Decisions extracted

1. Ship **per-seat computer isolation**, not Grok Bot's shared per-user computer, when spec 24 is ever built.
2. Treat memory as reviewable files + provenance, possibly Git-backed, before semantic recall.
3. Every connector/tool must declare read/write; unannotated = gated.
4. Session-scoped credentials; secrets never enter the agent sandbox.
5. Mandatory non-bypassable egress allowlist and kill switch.
6. Approval is mode-aware: act alone / pre-approved / ask / hand off, not a generic yes/no.
7. Unattended approvals must expire (Grok Bot ~10 min is a useful default).
8. Add Test Run + Pending Confirmation before full automation.
9. Do not copy enterprise-only governance. Arova should ship core policy/audit/self-hosted by default.
