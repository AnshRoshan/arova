# Market comparison — agent workspaces and always-on AI teammates

Research date: **2026-10-20**, completed as a **two-pass study**. Pass 1 mapped 15 products from official pages, docs and repositories. Pass 2 ran six dedicated clusters covering pricing, runtime architecture, enterprise governance, memory/execution rails, framework patterns and real demand signals. Deep evidence lives in `market-deep-dives/01`–`06` and is reflected in the corrections below.

This remains a **documented product read**, not a hands-on benchmark: every material claim comes from a vendor page, repository, official advisory or dated user report. Where a vendor itself labels something alpha, template or roadmap, this document says so. Re-check before citing after a release.

Method: agent-reach Exa search → official product docs/pricing/security pages → GitHub READMEs/architecture/verification docs → Hacker News/GitHub issue/advisory evidence → cross-check against Arova's code-verified inventory in `context/feature-parity.md` §1 and `context/architecture.md`.

---

## 1. Executive verdict

The market has converged on four things Arova does **not** have yet:

1. **An always-on runtime** — work continues when the laptop is closed.
2. **A computer per agent** — browser, files and terminal, often a persistent container with human takeover.
3. **Real connectors** — MCP, OAuth apps, or thousands of integrations, with approvals for writes.
4. **A way to meet the user** — mobile, Slack, email, calls, not only a web tab.

Arova's differentiators are still real and under-served by the market:

- **Explicit organisation structure** — reporting lines, bench, lead staffing, a durable org channel with attributed posts. Most competitors ship "bots" or "coworkers"; almost none ship an org chart with governance over who may found, staff and speak.
- **Accountability by construction** — provenance, stored-run backing, honest refusals, sample labels, denial breaker, per-seat budgets. The market is moving toward governance, but mostly at the enterprise control-plane layer, not inside the agent's own conversation.
- **Provider neutrality and BYOK** — any OpenAI-compatible endpoint per seat. Hosted products lock the model; open-source templates vary. This is a cost and sovereignty advantage.

**Verdict:** Arova should not become a worse clone of Grok Bot or Dots. It should become **the accountable agent organisation**: self-hosted, model-agnostic, with real org structure, durable memory, approvals, budgets and provenance — and it must close the four substrate gaps above to be credible.

Pass 2 sharpened that conclusion: the market's biggest complaints are not weak answers; they are **invisible sub-agent work, uncontrollable spend, fake pause, credential exposure, prompt-injection-driven exfiltration and opaque credits**. Arova can turn accountability from copy into infrastructure: durable work lineage, per-run cost, kill switch, scoped credentials, reviewable memory, and a policy gateway. The strategic sequence is in §8.

---

## 2. The four market archetypes

| Archetype | Products | What wins | What Arova should take |
|---|---|---|---|
| **Hosted always-on teammate** | Grok Bot, OpenAI Dots, Manus, Genspark, Claude Cowork, Lindy | Zero setup, own computer, proactive work, multi-surface | Background work, per-agent computer, proactive attention, channel reach |
| **Self-hosted agent workspace** | OpenDots, OpenBot, OpenMuse, OpenClaw, OpenHands | Control, BYO model, governance, MIT templates, fast iteration | Worker + policy gateway + MCP + channel adapters, not the whole computer stack |
| **Enterprise agent platform** | Microsoft Copilot Studio / Agent 365, Google Gemini Enterprise | Identity, policy, audit, agent registry, observability, SSO | Agent identity, policy-as-code, audit, evaluation, tenancy |
| **Workflow automation agent** | Zapier Agents, Lindy | Connector breadth, triggers, reliability at scale | Connector catalogue via integration, not hand-built |

Arova today is a **self-hosted agent workspace with an org model** — closest to OpenBot/OpenDots in shape, but with a stronger structure and a much weaker substrate.

---

## 3. Product dossiers

### 3.1 Grok Bot (xAI / SpaceXAI) — launched 2026-08-11

**What it is:** Named AI teammates ("Bots") with a persistent cloud computer (browser, filesystem, terminal), reachable on desktop and mobile, included with paid Cursor plans. Bots can run in parallel, message each other, share context in group chats and pass ownership of a task. They learn a workflow from a demonstration and rerun it on a schedule. Memory, files, browser sessions and preferences persist per Bot.

**What it does well:** The most complete expression of "AI teammate" in the market: persistence, computer, coordination, skills-from-demonstration, cross-device, work continues while closed. Named enterprise controls include network controls, 90-day action recording, OTel export, MCP allowlists, SCIM and admin computer kill.

**What to learn:** Bots need a **shared workspace and direct handoffs**, not only a human router. "Learn once, run on a schedule" is a stronger skill model than prompt snippets. Unattended approvals should expire (about 10 minutes is documented).

**Where it is weak:** Hosted and model-locked. One persistent computer is **shared across a user's Bots**, with common files/cookies/credentials, which the vendor itself documents as a warning. Many real controls are enterprise-gated. Team memory promotion exists, but a personal-memory review/delete UI is not documented. Deep dive: `market-deep-dives/06-hosted-always-on-teammates.md`.

### 3.2 OpenAI Dots — announced 2026-09-29

**What it is:** Always-on agents inside ChatGPT, powered by GPT-6 Astra. A dot inherits ChatGPT memory, uses Codex and connected tools, has its own cloud computer, proactively advances a responsibility between conversations, and brings work back for review. Custom Rules, permissions and Auto-review decide what it may do alone vs what needs approval. Web, mobile and desktop.

**What it does well:** Proactivity and trust UX. The dot owns a responsibility, not a prompt. Four rule modes (act alone / pre-approved / ask / hand off) plus Auto-review, Custom Rules, permissions, Compliance API and Slack/Teams/calls are the clearest consumer-grade governance surface in the market.

**What to learn:** **Responsibility ownership** (a goal that persists and progresses) is more compelling than a chat rule. Permissions should be channel-specific and continuous.

**Where it is weak:** Hosted, model-locked, no agent-to-agent org structure. Most importantly, individual dot memories cannot be viewed, edited or deleted; the only control is deleting the whole dot. "Memory exists" is therefore not memory governance. Deep dive in §6.

**Demand correction:** at least one reported dot performed extensive sub-agent work and token spend without a user prompt, and a pause control reportedly did not stop child execution. Treat invisible sub-agents and fake pause as a category-level threat model, not a one-vendor anecdote. Grade B/C sources are recorded in `market-deep-dives/05-demand-signals.md`.

### 3.3 OpenDots (CopilotKit) — repository created 2026-09-29, MIT, alpha

**What it is:** An open-source template for always-on AI coworkers, each with its own computer, available on web and mobile. Built on CopilotKit + AG-UI. Features: Spaces for working documents, specialist Dots with roles/instructions/tools, per-Dot computers (browser profile + files persist, human takeover, terminal output, per-Dot browser/file/shell permissions), review-before-save cards, MCP connections with read-only auto-run and approve-to-run writes, Composio connected apps (Gmail, Calendar), text + realtime calls, and Slack via Channels SDK. Conversations require CopilotKit Intelligence (hosted, local Docker, or licensed self-hosted).

**What it does well:** The closest open-source analogue to Arova's ambition. Per-Dot computer + review cards + MCP + Slack + voice + mobile is a very complete template. It borrows OpenBot's computer supervisor rather than rebuilding it.

**What to learn:** **Review-before-save** is a strong pattern for writes. Per-tool read/write classification (read-only runs, writes pause) is simple and effective. Reuse an existing computer supervisor instead of building one. Slack/voice are not optional in this category.

**Where it is weak:** Template, not a product. Pass 2 verifies that local pages/Spaces use SQLite while conversations have **no local durable store** and require licensed CopilotKit Intelligence. Slack and spoken compute delegation were not verified; Learning cloud schedules/skill delivery are unconfigured. No org chart/reporting lines, no org-scoped reviewable memory, no budget governance per seat. Deep dive: `market-deep-dives/02-copilotkit-open-source-cluster.md`.

### 3.4 OpenBot (CopilotKit) — MIT, alpha

**What it is:** A self-hosted "AI assistant your company can actually own": any AG-UI agent arrives as a coworker with its own channel, its own computer (Chromium + files + logins), and only the tools it is granted. Every tool call returns to a server gateway that resolves the target, evaluates policy, writes an audit row, then forwards or refuses with the rule named. Includes auth/roles/tenants, coworkers, channels, routines worker, credentials, plugins, components and connectors. PostgreSQL with pgvector; CopilotKit Intelligence for durable threads.

**What it does well:** Governance is the product. The **action gateway** is the strongest pattern in the market: policy evaluated before every browser/file/MCP call, two audit rows per action, rules over tool, page, element, command, file and MCP effect. Also: a real routines worker, OIDC sign-in, admin pages, per-Bot computer isolation.

**What to learn:** Build one **policy gateway** through which every tool call passes. Audit before and after. Make the computer a separate service behind a supervisor. Treat auth and tenancy as foundation, not a later feature.

**Where it is weak:** Heavy dependency on Docker + licensed CopilotKit Intelligence; alpha. Pass 2 confirms one Postgres `work_items` queue with `SKIP LOCKED`, DB-clock leases, fail-closed policy, two-row audit, initiator assertions and per-Bot computer isolation—excellent patterns. But deployment docs warn routines may be stored/computed/displayed while the shipped image does not run the worker: "it never fires." It also lacks Arova's explicit org chart, bench, org memory and reviewable org record.

### 3.5 OpenMuse (CopilotKit) — MIT, alpha

**What it is:** A personal agent with a browser, terminal, files and work that keeps going. Runs its own server, task worker and browser worker. Durable task plans with pause/resume/cancel/retry and SQL leases; persistent Chromium + optional Linux workspace; human takeover; Goals & Tracking with recurring checks and deduplicated alerts; documents/PDF workflows; finance; Gmail & Calendar OAuth; personal memories; Rich Threads; iOS/Android/web via React Native.

**What it does well:** The best open-source example of **durable task execution** (leases, retries, receipts, pause/resume) and **proactive goals** (recurring checks, change/price alerts, backoff). Mobile-first polish. Clear separation of API, web, browser worker.

**What to learn:** A worker with leases and receipts is the difference between a demo and a product. Goals/watches are a cheap way to deliver always-on value **without** a full autonomous computer. Personal memory should be editable and visible.

**Where it is weak:** Personal, not organisational; no teams/roles. Pass 2 verifies the task worker is in-process by default and PGlite cannot share state across processes—a separate worker requires Postgres. Its live Google, Rich Threads, model acceptance and Android paths remain explicitly unverified; multi-user auth, push, voice, tenancy and full VM isolation are roadmap. It still depends on CopilotKit Intelligence for threads.

### 3.6 OpenClaw — MIT, open source, 392k GitHub stars on 2026-10-20

**What it is:** A local-first AI assistant that runs on your own computer and meets you in the channels you already use: Discord, iMessage, Slack, Teams, Telegram, WhatsApp, Google Chat, Signal and 20+ more, plus native apps for macOS, iOS, Android, Windows and Linux. One Gateway is the control plane for sessions, tools, events and channel connections; Control UI, CLI and TUI connect to it; models and agent harnesses (Claude, Codex, local models) are swappable plugins. State, memory and credentials live on your hardware.

**What it does well:** Channel reach and local sovereignty. It is the strongest proof that **the channel is the product** for personal assistants. A gateway + plugin architecture + multi-platform apps is a proven shape. No paid tier or hosted lock-in.

**What to learn:** A single gateway for sessions/tools/channels scales from personal to team by configuration. Channel breadth is a distribution strategy, not a feature. Local-first + BYO harness is a real market.

**Where it is weak:** Personal assistant, not an org workspace; no explicit reporting structure, org memory, reviewable per-seat budgets or durable job queue. State is SQLite + Markdown. Sandboxing is off by default, elevated exec runs outside it, and docs admit it is not a perfect boundary. Pass 2 also found real privilege-escalation and prompt-injection advisories; see `market-deep-dives/02-copilotkit-open-source-cluster.md`.

### 3.7 Manus 2.0 — hosted

**What it is:** General-purpose autonomous agent with Chat Mode and Agent Mode (Manus 2.0 Lite/2.0/2.0 Max), credits, 20 concurrent tasks and 20 scheduled automations on Pro, wide/deep research, slide generation, website deployment, team plan.

**What it does well:** Time-to-value and breadth of deliverables. Concurrency and scheduled automations are sold as first-class. The credit model makes cost legible to users.

**What to learn:** **Concurrency** and **scheduled automations** are expected at the paid tier. A visible cost unit (credits) can be better UX than opaque token accounting. Deliverables (slides, sites, research reports) beat raw chat.

**Where it is weak:** Single-agent task execution, no organisational structure, no BYOK, hosted only. Pass 2 corrects the memory read: no product memory feature is documented; durable context is a Project instruction + file knowledge base. Credit pricing has no published per-action table and user reports describe credit burn/expiry anger.

### 3.8 Genspark Super Agent — hosted, new version 2026-09-25

**What it is:** Autonomous assistant that plans and acts across research, content, analysis, design, coding and communication. New version runs in a dedicated sandbox with a real browser, own filesystem and execution; can save any workflow as a reusable, shareable skill; runs several tasks in parallel in one project; supports 500MB–1GB files and SecondBrain context.

**What it does well:** Skills as a first-class, shareable object; parallel tasks; large-file handling; dedicated sandbox. The "turn any workflow into a skill" UX is simple and powerful.

**What to learn:** Skills should be **saved, named, shareable and rerunnable**, not just prompt fragments. Parallel task execution is a visible product capability. A dedicated sandbox is now table stakes for "super agent" claims.

**Where it is weak:** Hosted, model-locked, no org structure or governance depth. Pass 2 found free-tier credit refills can stop at a lifetime cap, sandbox files are session-lived unless explicitly delivered, takeover is not documented, and per-item SecondBrain review is unverified. It also has no documented MCP/API/BYOK. Deep dive: §6 hosted cluster.

### 3.9 Claude Cowork (Anthropic) — cloud since 2026-10-06

**What it is:** Claude's task surface on desktop, web, mobile and the Chrome side panel. Since 2026-10-06, new Cowork tasks on Pro/Max run in the cloud: work continues when the laptop is closed, scheduled tasks run with no device online, sessions/files follow the account across devices. Local folders are reachable only through the desktop app while it is open. Enterprise controls and admin enablement exist.

**What it does well:** Cloud continuation + scheduled tasks + cross-device continuity is exactly the "always-on" expectation. The unified Chat/Cowork experience reduces mode confusion. Enterprise admin controls.

**What to learn:** Users should not have to choose between "chat" and "agent" modes. Cloud execution and scheduled tasks are the baseline. Files/sessions should follow the account.

**Where it is weak:** Model-locked; no agent-to-agent org structure; no BYO model. The sandbox is ephemeral per session and state is destroyed, which is secure but limits persistent agent work. Admins cannot restrict project creation. Cowork is now folded into a unified Claude surface, which reduces mode clarity for users who need explicit delegation.

### 3.10 Devin (Cognition) — software-engineering agent

**What it is:** Cloud/desktop/CLI software-engineering agent with SWE-2, paid tiers ($20 Pro, $200 Max, Teams $80 + $40/seat), frontier model access, SSO/OIDC, centralized admin, dedicated deployment option.

**What it does well:** Deep vertical specialisation, team/admin controls, model access breadth, desktop + CLI + cloud. Pass 2 found especially strong memory substrate: personal-per-org Markdown notes in a Git drive with source/date links, conflict-safe parallel commits, "Updated memory" cards, nightly Dreaming consolidation, and automation sessions barred from reading/writing it. Local Hands, Outposts, dedicated/VPC/private-link and Terraform-managed automations show a real deployment story.

**What to learn:** **Memory as Git-backed Markdown with provenance** is implementable and far more inspectable than hidden embeddings. Approval should distinguish cloud, customer-infra and user-machine execution. Outposts/Local Hands are the model for BYO substrate.

**Where it is weak:** Code-only; not a general workspace or org. Pro/Max concurrency caps, Windows usage surcharge, opaque ACU units, and cloud audit-log availability is not clearly documented. It is still a software agent, not accountable organizational structure.

### 3.11 OpenHands (All Hands AI) — open source + cloud/enterprise

**What it is:** Ecosystem for AI-driven development: Agent Canvas (browser client/control center), Software Agent SDK, Agent Server (REST/WebSocket execution), Automation Server (scheduled/event-driven automation), Sandbox Server (sandbox control plane), Cloud and Enterprise. CLI and local GUI.

**What it does well:** Clean separation of **client / agent server / automation server / sandbox server**. This is the architecture Arova needs for background work and tool execution. Open-source core + commercial cloud/enterprise is a proven business shape.

**What to learn:** Split the worker, the execution API and the sandbox control plane. Make automation a server, not a `after()` hook. Offer self-host and managed from the same core.

**Where it is weak:** Development-focused; no org/reporting/channel model. More infrastructure than product for a non-developer.

### 3.12 Microsoft Copilot Studio + Agent 365

**What it is:** Enterprise platform for building/managing autonomous agents. Agents perceive events, decide and act without a prompt, within scoped permissions, decision boundaries and auditable processes. Agent 365 is the control plane for agents across the organisation. Triggers, instructions, guardrails, least privilege, input authenticity, audit/monitoring.

**What it does well:** Enterprise governance: identity, least privilege, audit, control plane, lifecycle. It normalises "autonomous agent" as a governed organisational actor.

**What to learn:** **Agent identity and audit** should be first-class. Policy should be explicit and inspectable. Trigger authenticity matters (signed/verified events). Enterprise buyers require a control plane.

**Where it is weak:** Microsoft-ecosystem gravity; heavy setup; not a lightweight personal/team workspace. Model choice limited.

### 3.13 Google Gemini Enterprise

**What it is:** End-to-end agent platform: Agent Platform (evolution of Vertex AI), Gemini Enterprise app, partner ecosystem. ADK with graph-based sub-agents, Agent Runtime (persistent), agent-to-agent orchestration (A2A), Memory Bank / Memory Profiles, Agent Identity (cryptographic ID), Agent Gateway, Model Armor (prompt injection/tool poisoning/data leakage), Agent Simulation and Observability.

**What it does well:** The most complete enterprise agent stack: identity, gateway, memory, A2A, evaluation, observability. Treats agents as a fleet with governance and telemetry.

**What to learn:** **Agent identity**, **memory as a platform service**, **A2A**, and **observability/eval** are where the enterprise market is going. Model Armor-style protections will become expected.

**Where it is weak:** Enterprise-only, Google Cloud gravity, complex. Not a personal/team workspace. Model choice is Google-centric.

### 3.14 Lindy — hosted workflow agents

**What it is:** AI workers with Skills (learn once), Memory, Routines, Watch-and-Learn, Meetings, Phone calls, 1,500+ integrations + MCP, Chrome extension, SOC 2 Type II. Ask on Slack, text, voice memo, call or email.

**What it does well:** Connector breadth, channel reach, learn-by-demonstration, phone/meetings, compliance. Pass 2 found its most useful pattern is **versioned file memory** with personal/team/system scopes, `.skills/` folders and editable files—inspectable without semantic black boxes.

**What to learn:** **Watch-and-learn** is a better skill-creation UX than writing a prompt. Phone/meetings are high-value surfaces. Integrations are the product moat for workflow agents. Per-integration guardrails (always allow / require approval / don't offer) are right.

**Where it is weak:** Workflow automation, not an org workspace; no explicit reporting lines or agent-to-agent structure; hosted only. Pass 2 found a serious control gap: guardrails apply only in shared Slack threads, while DM/web/iMessage writes are not guarded; automatic semantic memory is not documented. Pricing plan names and real tier prices are inconsistent across docs.

### 3.15 Zapier Agents — hosted workflow agents

**What it is:** Specialised agents connected to business data and 9,000+ apps, built with Zapier Copilot, monitored, chat when needed, work on the web.

**What it does well:** Unmatched connector catalogue and operational reliability. Agents as a layer on top of an existing automation graph.

**What to learn:** Connector breadth is a distribution moat. Don't rebuild it; integrate with an existing connector graph/MCP.

**Where it is weak:** No computer, no org structure, no deep memory. Workflow-shaped rather than teammate-shaped.

---

## 4. Capability matrix

Legend: **●** strong / shipped as a core capability · **◐** partial, alpha, template-only, or limited scope · **—** absent or explicitly not offered. Judgement based on vendor documentation on 2026-10-20, not a hands-on test.

| Product | Always-on | Agent computer | Connectors | Org structure | Durable memory | Skills / learning | Scheduling | Human oversight | Governance / audit | Auth / tenancy | BYOK / model choice | Surfaces | Self-host |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Arova** | — | — | — | ● | ◐ | ◐ | ◐ | ● | ◐ | — | ● | ◐ web | ● MIT |
| Grok Bot | ● | ◐ shared per user | ● | ● peer/group | ◐ team notes | ● demo | ● | ● | ◐ enterprise-gated | ● | — | ● desktop/mobile/voice | — |
| OpenAI Dots | ● | ● | ● | ◐ | — opaque | ◐ | ● | ● | ● auto-review | ● | — | ● web/mobile/desktop/Slack/Teams | — |
| OpenDots | ◐ | ● | ● MCP/Composio | ◐ specialists | ◐ licensed plane | ◐ | ◐ | ● review cards | ◐ | ◐ owner | ● | ● web/mobile/Slack/voice | ● MIT |
| OpenBot | ◐ shipped worker caveat | ● | ● MCP | ◐ coworkers | ◐ Intelligence | ◐ | ◐ | ● | ● fail-closed gateway | ● OIDC/roles | ● | ◐ web | ● MIT |
| OpenMuse | ◐ in-process default | ● | ◐ Gmail/Calendar | — | ● editable personal | ◐ | ◐ goals | ● | ◐ | ◐ access key | ● | ● mobile/web | ● MIT |
| OpenClaw | ● gateway | ◐ sandbox off by default | ● 40+ channels | ◐ | ● Markdown | ● plugins | ● | ◐ | ◐ advisories | ◐ | ● | ● all platforms | ● MIT |
| Manus 2.0 | ● | ● sandbox | ● API/MCP/Slack/Zapier | — | — project context only | ◐ | ● | ◐ | ◐ | ● | — | ● web/mobile | — |
| Genspark | ● | ● sandbox | ◐ | — | ◐ SecondBrain review U | ● shareable | ● sched/email | ◐ | ◐ contract | ● | — | ● web | — |
| Claude Cowork | ● | ◐ ephemeral per session | ● MCP | — | ● account/project, reviewable | ◐ | ● | ● | ● admin/egress/connector modes | ● | — | ● web/mobile/desktop/Chrome | — |
| Devin | ● | ● session VM/Outposts | ● API/MCP/plugins | — | ● Git-backed provenance | ◐ | ● | ● | ◐/U audit | ● | ◐ | ● web/CLI/desktop | ◐ |
| OpenHands | ● automation server | ● sandbox server | ◐ | ◐ | ◐ | ◐ | ● | ◐ | ◐ | ● cloud | ● | ◐ web/CLI | ● |
| Microsoft Agent 365 | ● | ◐ Power Automate | ● approved MCP/connectors | ◐ multi-agent | ◐ | ◐ | ● | ● | ● Entra ID/registry | ● | — | ● Teams/web | ◐ |
| Gemini Enterprise | ● | ● isolated sessions | ● | ● A2A | ● Memory Bank | ◐ | ● | ● | ● gateway/Model Armor | ● | ◐ | ● web | ◐ |
| Lindy | ● | ◐ | ● 1,000+ MCP | — | ◐ versioned files | ● watch/learn | ● | ◐ channel gap | ◐ SOC2/enterprise | ● | — | ● Slack/email/phone/SMS | — |
| Zapier Agents | ● | — | ● 9,000+ skills/MCP/CLI | — | ◐ | ◐ | ● | ◐ | ◐ | ● | — | ● web/Slack | — |

Reading the matrix after pass 2:

- Arova is still the **only product with a top score in "org structure" and no score in always-on / computer / connectors / auth**. The strategic conclusion survives, but the gap urgency shifts: the market is not only lacking structure; it is failing on **visible spend, real pause, artifact delivery and credential boundaries**.
- "Agent computer" is not one design. Grok Bot shares one per user, Claude Cowork destroys one per session, OpenBot isolates one per Bot, Devin offers local/outpost/dedicated execution. Persistent state is valuable but expands blast radius; Arova should start with scoped execution and artifacts, not a permanent browser profile.
- Memory is becoming a **reviewable file/context substrate**, not automatically a vector database. Devin's Git-backed Markdown and Lindy's versioned files are the most credible documented patterns.
- The open-source cluster is strong on governance but brittle on durable state: OpenDots depends on licensed Intelligence, OpenMuse defaults to a non-shared PGlite/in-process worker, OpenBot's shipped-image worker has a documented firing caveat, and OpenClaw has no durable queue. A Postgres-native worker is still a real Arova advantage.
- Connector breadth is won by MCP, OAuth adapters, channel SDKs and existing integration graphs, not custom code.

---

## 5. Where Arova leads, is at parity, and trails

### Leads
1. **Organisation as a first-class object.** Teams, reporting lines, bench, lead staffing, creator tier, org channel, attributed posts, summons ceiling, budget/no-report stop rows. No reviewed competitor has this combination.
2. **Accountability inside the conversation.** Inline provenance, stored-run links, honest refusals, sample labels, incomplete/stopped/budget states, denial breaker, per-seat daily budgets.
3. **Provider neutrality and cost control.** Any OpenAI-compatible endpoint per seat, keys server-side, secrets never in the browser, daily call budget.
4. **Reviewable org memory.** Attributed, pinnable, supersedable, individually forgettable, with the reply naming which notes it used.
5. **A coherent design system.** Graphite shell, measured identity tints, accessible states — this is real product craft that open-source templates lack.

### At parity
- Persisted threads, streaming with stop/partial semantics, run/step records, audit events, usage estimates, approvals, routine schedules (on read), one-hop delegation.

### Trails
1. **No always-on worker.** Routines tick only on `GET /api/board`; Run Now is a waiting stub.
2. **No real tools.** 6 of 15 tools live; no MCP transport; no OAuth connectors.
3. **No agent computer.** The sandbox contract refuses by design.
4. **No auth or multi-user.** Cookie demo only; no memberships, roles, SSO or CSRF.
5. **No channel reach.** Web only; inbound is a bearer-token HTTP trigger; no Slack/email/voice/mobile.
6. **Memory is keyword-only.** No semantic/hybrid recall, no automatic capture, no per-seat memory.
7. **No skills that are saved objects.** Prompt-level skills only; no learn-by-demonstration, no shareable workflow.
8. **No proactive goals/attention.** Routines are time-based; no watches, no change detection, no attention inbox.
9. **No scale posture.** Board returns every message/memory/trigger; no pagination, retention, rate limits or route tests.
10. **No trust runtime.** Demand evidence shows the market's worst failures are invisible sub-agents, spend without caps, fake pause, credential leakage, prompt-injection exfiltration and trapped artifacts. Arova has provenance in chat but not yet a parent/child task tree, kill switch, single-use approval token, run artifacts, egress allowlist or scoped credential runtime.
11. **No observability/eval.** Events and usage exist, but no traces, per-run cost, eval harness, or agent identity.

---

## 6. Gap ranking

Pass 2 changed the ranking: autonomy must be visible, stoppable, priced and auditable before it becomes broader.

### Wave 0 — local credibility

| # | Gap | Evidence | Spec |
|---|---|---|---|
| 0 | **Safe first-run local environment** | No `DATABASE_URL` in this checkout; health returns 500; Postgres is running but ownership is unverified; Drizzle has an unsafe fallback | 25 |

### P0 — execution and trust substrate

| # | Gap | Evidence from market | Why it matters | Spec |
|---|---|---|---|---|
| 1 | **Durable work engine + real Run Now** | OpenBot `SKIP LOCKED`; LangSmith interrupt/rollback; CrewAI checkpoint lineage; Cursor/Codex persisted sessions | Without durable jobs, background work is request-bound theatre | 16 |
| 2 | **Tool execution plane + MCP + policy gateway** | OpenBot fail-closed gateway; Cline/MAF approval middleware; Claude connector annotations; streamable-HTTP MCP consensus | Real tools need one deny/execute/audit chokepoint | 17 |
| 3 | **Auth, sessions, membership, roles** | OpenBot Better Auth; Cowork/Devin enterprise identity; every hosted team product | No principal means no real team boundary or permission model | 18 |
| 4 | **Spend, pause, kill and artifact controls** | Dots invisible sub-agent spend; pause failures; Manus/Lindy credit complaints; Cursor/Codex/Copilot reviewable outputs | Demand evidence says opaque work and runaway cost destroy trust faster than missing features | 26 |
| 5 | **Board scale: pagination, retention, indexes, route tests** | All production products; Arova returns all rows | The first real workspace will hit payload and memory limits | 19 |

### P1 — parity and compounding value

| # | Gap | Evidence | Why it matters | Spec |
|---|---|---|---|---|
| 6 | **Reviewable memory first, hybrid retrieval second** | Devin Git-backed Markdown; Lindy versioned files; Manus project context; Dots opaque memory anti-pattern; OpenMuse editable personal memory | Users trust inspectable notes more than an unexplained vector claim | 20 |
| 7 | **Channel gateway: Slack + email first** | Dots/OpenDots Slack/Teams; Lindy Slack/email/phone; OpenClaw 40+ channels; Manus Slack/automation | Meeting the user is distribution and thread continuity | 21 |
| 8 | **Goals, watches and an attention inbox** | OpenMuse goals/tracking; Dots responsibility ownership; Manus automations; Genspark test run + pending confirmation | Always-on value can be useful without an autonomous browser/terminal | 22 |
| 9 | **Skills as portable Markdown workflows** | Grok teach-a-task; Genspark shareable skills; CrewAI capability split; agentskills.io/Cline conventions | Turns repeated work into a reusable, importable asset | 23 |

### P2 — integrated substrate, not a first product move

| # | Gap | Evidence | Why it matters | Spec |
|---|---|---|---|---|
| 10 | **Agent computer via provider contract** | Grok shared-user computer, Cowork session sandbox, OpenBot per-Bot container, Cursor/E2B, Browserbase takeover | Table stakes for broad real work, but highest cost/security blast radius | 24 |
| 11 | **Connector catalog via MCP/OAuth** | Zapier/Lindy/Manus/Devin/Genspark and existing connector rails | Breadth is integrable; custom connector building is not the moat | 17 + 21 |
| 12 | **Agent registry, lifecycle and enterprise identity** | Microsoft Entra Agent ID; AWS Agent Registry; ServiceNow kill switch | Needed once multiple principals/published agents exist, not for single-owner local | later |
| 13 | **Mobile/PWA + voice** | Dots/Grok/Lindy/OpenMuse/OpenDots/OpenClaw | Strong reach after trust substrate is credible | later |
| 14 | **Observability and eval beyond traces** | Gemini simulation/AutoRaters; LangSmith feedback; CrewAI tests | Needed to improve quality safely | 19 later |

## 6.1 What Arova must not build

- A second OpenClaw with 40+ channel adapters before auth, policy and pause are safe.
- A browser/VM fleet. Integrate E2B, Browserbase or an OpenBot-style computer service behind `SandboxProvider`.
- An autonomous "employee" narrative with invisible sub-agents. Demand evidence treats this as the core fear.
- A proprietary credit economy. Expose runs/tasks, estimated token cost and hard caps; do not sell opaque credits.
- 1,000 custom connectors. Use MCP/OAuth adapters and choose a small set that is deeply correct.
- Licensed-state-plane lock-in. Postgres remains the durable source of truth; Redis or external thread infrastructure can wait for measured scale.
- Org-chart aesthetics as a substitute for RBAC. Reporting lines are not a security boundary.

---

## 7. Recommended positioning

**"The accountable agent organisation."**

Arova is not the agent with the biggest computer, and should not try to be. It is the workspace where a team of agents has **roles, reporting lines, a durable channel, reviewable memory, explicit permissions and an audit trail** — and where you can bring your own model and run it yourself.

Three moat pillars:
1. **Structure** — org chart, lead/creator tiers, bench, channel, per-seat budgets. Extend with skills, goals and per-seat memory.
2. **Accountability** — policy gateway, approvals, provenance, audit, eval. Make "what did it do, under whose authority, with which model, at what cost" a first-class answer.
3. **Sovereignty** — self-hosted, MIT, any OpenAI-compatible endpoint, secrets server-side. The anti-lock-in alternative to Grok Bot / Dots / Manus.

Things to integrate rather than build:
- **MCP** for tools; OAuth/connector adapters where genuinely needed. Composio may be one optional adapter, not a product dependency.
- **A sandbox/browser provider** (E2B, Browserbase or a pinned OpenBot-style computer) behind the existing `SandboxProvider` contract.
- **A durable queue/worker** (Postgres-backed first; Redis/BullMQ only after measured scale).
- **Channel adapters** (Slack first, then email) rather than native apps or 40 integrations.
- **Existing skill/agent interchange conventions** rather than a bespoke DSL.

The product's core must remain local-first: Postgres for durable state, server-side credentials, explicit policy decisions, traceable runs and artifacts. Open-source templates have proven that MIT app code can still become captive to a licensed thread/observability plane; Arova should avoid that trade.

Explicit non-goals for the next wave:
- 1,000+ connectors built in-house.
- Owning a browser engine or a VM fleet.
- A native iOS/Android app before the web product is credible.
- A general workflow builder; skills are the narrower, better-shaped answer.
- Consumer-style "autonomous checkout/payments" or health/bank connectors.

---

## 8. Roadmap and specifications

Sequence: **local bootstrap → worker → policy/trust → auth → scale → memory → channels → goals → skills → computer.** Pass 2 inserts spec 26 alongside the worker because spend caps, real pause, trace and artifact visibility are what make background execution safe.

| Spec | Feature | Phase | Depends on | Why now |
|---|---|---|---|---|
| [25](feature-specs/25-local-development-bootstrap.md) | Safe local development bootstrap | Wave 0 | — | Current host has Postgres but no project-verified DB/env; health cannot pass |
| [16](feature-specs/16-durable-work-engine.md) | Durable work engine + real Run Now | P0 | 25 | Unblocks everything; makes "always-on" true |
| [17](feature-specs/17-tool-execution-plane.md) | Tool execution plane + MCP + policy gateway | P0 | 16 | Turns capabilities into real work with a trust boundary |
| [26](feature-specs/26-trust-cost-and-artifact-controls.md) | Spend caps, real pause/kill, task lineage, artifacts | P0 | 16 | Demand evidence's most urgent gap: invisible sub-agent spend and cosmetic controls |
| [18](feature-specs/18-auth-and-membership.md) | Auth, sessions, membership, roles | P0 | — | Makes it a team product, not a cookie demo |
| [19](feature-specs/19-board-scale-and-observability.md) | Pagination, retention, indexes, traces, cost | P0 | 16, 26 | Keeps the product usable and observable at real volume |
| [20](feature-specs/20-org-memory-v2.md) | Reviewable memory substrate + hybrid retrieval | P1 | 16, 19 | Turns the memory moat into a real advantage |
| [21](feature-specs/21-channel-gateway.md) | Slack + email channel gateway | P1 | 16, 18 | Meets users where they work |
| [22](feature-specs/22-goals-and-proactive-attention.md) | Goals, watches, attention inbox | P1 | 16, 21, 26 | Always-on value without a full computer |
| [23](feature-specs/23-skills-and-learned-workflows.md) | Saved skills + learn-from-demonstration | P1 | 17, 20 | Compounds org knowledge; matches market |
| [24](feature-specs/24-agent-computer.md) | Agent computer via provider contract | P2 | 17, 18, 26 | Closes the largest remaining substrate gap |

Recommended first implementation order: **25 → 16 → 26/17 → 18 → 19.** Spec 18 can run parallel with 16/17 if capacity allows. Spec 26 and 17 overlap by design: 17 defines the tool chokepoint; 26 defines the human-facing trust guarantees that must hold across worker, tools, channels and computer.

---

## 8.1 Pass 3 — market refresh (2026-10-25)

A third pass re-checked all 15 tracked products for news since 2026-10-01 and scanned the products the first two passes missed. Full evidence and source URLs: `market-deep-dives/07-october-refresh-2026-10-25.md`. Summary of what changed:

**Market direction.**
1. The category is consolidating around **one durable agent per person**: Google collapsed its enterprise agent SKUs into a single "Gemini agent" (Oct 8, private preview) with its own account, permissions and a spend cap; Anthropic dissolved Cowork into chat and **removed local execution** (Oct 6); Zapier dissolved Agents into "AI by Zapier" (Oct 6–7); Dots still cannot delegate dot-to-dot. Arova's named-agent org model is now validated from the other direction by CopilotKit's coworker line and Grok's Team Bots.
2. **Self-hosting became a marketed enterprise feature** — and Arova has its first direct open-source competitor of the same shape.
3. **Governance primitives are table stakes everywhere:** per-agent identity + spend caps (Gemini), approval cards (Dots/OpenDots/Devin), recovery provenance (OpenClaw 10.7), secret redaction and SARIF audit exports (Devin). Arova's approvals/provenance/budgets match the direction exactly.
4. **Memory moved a generation** (Devin cross-session memory with nightly refinement, Oct 9); capture-from-work is now expected, not optional.
5. **Reliability of long-running work is the new battleground** — replay-safe recovery (OpenClaw), crash-recovery-by-reply (Devin), hung-stream timeouts (OpenHands).

**New entrants.**
- **CopilotKit Soar (Oct 22)** — self-hosted AI coworkers (single machine → Kubernetes), Slack/Teams reach, any agent/model, white-label, powered by OpenBot. The most important new entrant: same shape as Arova with far stronger distribution. Arova's remaining unique ground: explicit org chart/reporting lines/bench, reviewable org memory, honest refusals, per-seat budgets, no licensed plane.
- **Kortix (ex-Suna)** — open-source "AI operating system" with **git-as-company**: agent definitions, skills and memory are diffable config reaching main only via approved change requests; per-tool Allow/Ask/Block gates; server-side credential brokering.
- **Sim** — Apache-2.0 agent workspace on Arova's exact stack (Next.js + Drizzle + Postgres + Zod); proof the stack carries the full feature set; 5,400+ actions / 520+ triggers; a `doctor` setup pattern worth copying.
- Also scanned: Dify (license traps), Coze Studio + Coze Loop, AutoGPT (zombie), LangGraph/Flowise, coding agents (Copilot coding agent's review-fix loop, Replit checkpoints + autonomy dial, Jules plan-first gate, Cursor cloud agents), memory/sandbox/MCP-gateway primitives, A2A and AG-UI protocols, n8n/Activepieces/Windmill.

**Effect on the spec list (all amendments dated 2026-10-25 in each spec):**
- Spec 16 gains a **recovery amendment**: interrupted work keeps recovery provenance and unfinished tool outcomes; hung streams time out instead of stalling.
- Spec 20 gains a **Postgres-native fusion amendment**: BM25/keyword + entity matching + temporal validity (`valid_from`/`valid_to`) before any embedding dependency.
- Spec 26 gains **plan-first approval** (the plan is the approval artifact before spend), **checkpoints/rollback** for reversible writes, a **per-agent autonomy dial**, and trigger-token hashing (the 2026-10-25 audit found `triggers.token` stored plaintext).
- New **spec 27 — reviewable self-modification and feedback loops**: agents propose edits to their own config (persona/schedule/budget/skills) as diffable change requests a human approves; threaded review comments spawn bounded re-runs; a per-agent autonomy dial. Independently validated by Devin's shared-skill proposals pending admin approval and Kortix's change-request flow.

Arova's unique ground after pass 3 (unchanged lead, sharpened): org chart/reporting lines/bench, reviewable org memory, honest-substrate refusals, per-seat budgets, provenance, no licensed plane. What got harder: CopilotKit Soar competes head-on for "open-source accountable coworkers" with much better distribution (Slack/Teams/K8s) — reaching spec 21 (channels) and 18 (auth) matters more than it did on 2026-10-20.

---

## 9. Sources

### Pass 1 — official product map (accessed 2026-10-20 via agent-reach)

1. Grok Bot docs — https://docs.x.ai/grok-bot/overview
2. Introducing Grok Bot (2026-08-11) — https://x.ai/news/introducing-grok-bot
3. OpenAI Dots feature page — https://chatgpt.com/features/dots/
4. Introducing dots (2026-09-29) — https://openai.com/index/introducing-dots/
5. OpenDots README — https://github.com/CopilotKit/OpenDots
6. OpenBot README — https://github.com/CopilotKit/openbot
7. OpenBot architecture — https://github.com/CopilotKit/openbot/blob/main/docs/architecture.md
8. OpenMuse README — https://github.com/CopilotKit/OpenMuse
9. OpenClaw README — https://github.com/openclaw/openclaw
10. Manus membership pricing — https://help.manus.im/en/articles/11711111-what-is-the-current-membership-pricing-for-manus
11. Genspark Super Agent — https://www.genspark.ai/helpcenter/super-agent
12. Claude Cowork on web/desktop/mobile — https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile
13. Devin plans and pricing — https://devin.ai/pricing
14. OpenHands introduction — https://docs.openhands.dev/overview/introduction
15. Microsoft Copilot Studio autonomous agents — https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/autonomous-agents
16. Microsoft Copilot Studio / Agent 365 — https://www.microsoft.com/en/microsoft-365-copilot/microsoft-copilot-studio
17. Gemini Enterprise (2026-04-22) — https://cloud.google.com/blog/products/ai-machine-learning/the-new-gemini-enterprise-one-platform-for-agent-development
18. Lindy product — https://www.lindy.ai/product
19. Zapier Agents — https://zapier.com/agents

### Pass 2 — deep-dive dossiers

The expanded evidence is in:
- `market-deep-dives/01-coding-workflow-frameworks.md`
- `market-deep-dives/02-copilotkit-open-source-cluster.md`
- `market-deep-dives/03-enterprise-agent-platforms.md`
- `market-deep-dives/04-memory-and-execution-rails.md`
- `market-deep-dives/05-demand-signals.md`
- `market-deep-dives/06-hosted-always-on-teammates.md`

Key pass-2 primary sources include Grok Bot plans/computer/security docs; OpenAI Dots docs; Claude Cowork architecture/pricing/enterprise pages; Manus/Genspark/Lindy/Devin pricing and feature docs; OpenBot/OpenDots/OpenMuse/OpenClaw README, architecture, setup, verification, deployment and security advisories; Microsoft Agent Registry/Agent 365; Google Agent Platform; AWS AgentCore; Salesforce; ServiceNow; Sierra; Cursor; GitHub Copilot; Codex; Jules; LangSmith; CrewAI; n8n; Microsoft Agent Framework; Cline; Roo; Zapier; Mem0; Zep; Graphiti; Letta; pgvector; E2B; Browserbase; Daytona; Hacker News, GitHub issues/advisories and dated user-review sources. Exact URLs and evidence labels are in each dossier.

GitHub star counts are those returned on the research date and will drift. Pricing and plan names change; treat them as dated facts, not constants. Two OpenAI pages (`chatgpt.com/features/dots/` and `openai.com/index/introducing-dots/`) return 403 to command-line fetches; they were read through the research provider and should be opened in a browser when re-checking.

### Pass 3 — market refresh (2026-10-25)

All pass-3 sources are recorded inline with URLs in `market-deep-dives/07-october-refresh-2026-10-25.md`. Key primary sources: xAI changelog (x.ai/changelog/bot); ChatGPT what's-new (learn.chatgpt.com); OpenDots repo and blog (github.com/CopilotKit/OpenDots, copilotkit.ai/blog/introducing-opendots and /introducing-soar); OpenClaw releases (docs.openclaw.ai/releases, github.com/openclaw/openclaw/releases); Devin release notes (docs.devin.ai/release-notes/overview.md); OpenHands releases and enterprise notes; Google's Gemini at Work 2026 post (cloud.google.com); Microsoft product terms and partner blog; Zapier's "Agents is now AI by Zapier" post; Manus funding coverage (CNBC, Reuters); Kortix (github.com/kortix-ai/suna); Sim (github.com/simstudioai/sim); Jules (jules.google); Replit checkpoint docs; GitHub Copilot coding-agent blog; Mem0/Graphiti repos and comparisons; E2B/Daytona/Modal sandbox comparisons; AG-UI docs (docs.ag-ui.com). Several secondary/aggregator-only items are labelled **[unverified]** in the dossier and must not be cited as fact.
