# 07 — Market refresh: 2026-10-25

Third research pass, five days after the 2026-10-20 two-pass study. Two parallel clusters: (A) news on the 15 tracked products since ~2026-10-01, (B) products and categories the first two passes missed. Method: 25+ web searches plus direct fetches of official changelogs (Devin, OpenClaw, Genspark, CopilotKit, OpenDots). Everything is attributed; single-source or aggregator-only claims are marked **[unverified]**. No vendor account was run; this remains a documented product read.

---

## A. The 15 tracked products — what changed since 2026-10-01

### A.1 Grok Bot (xAI) — active, noisy October

- Oct 22 — changelog v0.75.2: fix for chats whose first message was blocked returning errors after reset (https://x.ai/changelog/bot).
- Oct 16 — coverage of xAI's terms (updated Oct 12) disclaiming liability for "Agentic Actions" including financial-institution interactions, in tension with Musk's earlier "Grok Bot purchase pledge" (https://cellcog.ai/blog/grok-bot-purchase-pledge) — secondary blog, **[unverified against the actual terms]**.
- Oct 3 — Grok 4.7 powers Expert and Fast modes for paid subscribers (https://grok.com/release-notes).
- Late Oct — Grok Build CLI: background goals, workflows, worktree management (https://releasebot.io/updates/xai/grok-build) — aggregator, **[unverified]**.
- Demand: Reddit report of a **decline in multi-agent performance** for a six-specialised-agent research workload (https://www.reddit.com/r/GrokBot/comments/1x49thm/); an outage report dated Oct 23 **[unverified]**.
- Context: Team Bots (shared AI teammates, Sep 28) predates the window (https://x.ai/news/team-bots).

**Read for Arova:** Grok's multi-agent quality-decay complaint is a demand signal for exactly what Arova is building — durable orchestration with per-hop provenance.

### A.2 OpenAI Dots — steady cadence, capability ceilings visible

- Oct 5–9 weekly update: more context from ChatGPT and Codex, faster cloud browsing (https://learn.chatgpt.com/docs/whats-new/october-5-9-2026).
- Oct 6 — reality-check coverage: each user still gets **one primary dot; no dot-to-dot delegation** **[unverified — original article not located]**.
- Oct 22 — Uber to roll ChatGPT Work (with dots) to all employees; a "Decisions API" reportedly GA **[unverified]**.

**Read:** the market leader still has no agent-to-agent structure. Arova's org chart bet is differentiated against the largest product in the category.

### A.3 OpenDots (CopilotKit) — launched Oct 1, then subsumed by Soar

- Oct 1 — released: open-source alternative to Dots; always-on coworkers with own computer/role/permissions, WebRTC calls, Slack, review-before-save cards, per-Dot memory (https://www.copilotkit.ai/blog/introducing-opendots).
- Repo verified by fetch: 6.0k stars, 874 forks, 66 commits, alpha, no formal releases (https://github.com/CopilotKit/OpenDots).
- Oct 22–23 — CopilotKit launched **Soar** (see §C.1) and published "Soar vs OpenAI Dots" positioning; OpenDots' separate identity effectively ends (https://www.copilotkit.ai/blog/introducing-soar).

**Read:** OpenDots independently ships nearly Arova's feature list (named agents, per-agent permissions, approval cards, memory, self-hosted) — the closest open-source comp, now folded into a stronger distribution play.

### A.4 OpenBot (CopilotKit) — quiet in October, became the Soar engine

No October release post. Latest v0.0.5 (Sep 1), ~3.5k stars, added Google Drive and Notion support **[secondhand]**. Soar is "Powered by OpenBot" (https://www.copilotkit.ai/blog).

### A.5 OpenMuse (CopilotKit) — no October product news. Valid finding: no news.

### A.6 OpenClaw — rapid release train, security still the story

- October releases v2026.10.1 → 10.7 (https://docs.openclaw.ai/releases, https://github.com/openclaw/openclaw/releases):
  - 10.1 installed-skill discovery, MCP Apps, full backups; 10.5 **Skill Workshop 2.0**, public conversation links; 10.6 security remediations, Windows setup; **10.7 replay-safe session recovery** — interrupted sessions retain recovery provenance and unfinished tool outcomes.
- Security: no new October CVE surfaced; ongoing criticism — "security nightmare dressed up as a daydream" (https://news.ycombinator.com/item?id=47479962) and a thread citing **63% of 135,000+ publicly exposed instances running with no authentication** (https://news.ycombinator.com/item?id=47628608) **[thread date not verified]**.

**Read:** OpenClaw 10.7's recovery provenance is convergent evolution with Arova's provenance/audit rows — and it validates spec 16's amendment on resumable work. The exposure statistic validates "auth before channels."

### A.7 Manus 2.0 — funding shock; no 2.5 exists

- No "Manus 2.5" exists; latest is 2.0 (Sep 28) (https://cellcog.ai/blog/manus-2-0).
- Oct 8 — Butterfly Effect raised **$500M+** after China ordered the unwind of Meta's ~$2B acquisition (completed by August) (https://www.cnbc.com/2026/08/11/manus-china-meta-acquisition.html, https://www.reuters.com/world/asia-pacific/china-blocks-foreign-acquisition-ai-startup-manus-2026-04-27).
- Pricing (third-party): $20/4,000 credits … $200/40,000 (https://techpilot.ai/tools/manus-ai-agent-multimodal-autonomy) **[not official]**.

### A.8 Genspark — no major October release. Valid finding: no news. (The "Genspark AI Browser" post many feeds surfaced is dated June 2025, verified by fetch: https://www.genspark.ai/blog.)

### A.9 Claude Cowork (Anthropic) — absorbed into chat; local mode removed

- Sep 16 announced merge into "one Claude"; rollout began the week of Oct 1 (https://vantagepoint.io/blog/ai/claude-chat-vs-claude-cowork).
- **Oct 6 — Cowork no longer works locally** per community report; pushback (https://www.reddit.com/r/claude/comments/1wtlbfj) **[official Anthropic statement not located]**.
- Oct 8 — usage policy update covering agentic capabilities (https://www.anthropic.com).

**Read:** a major vendor removing local execution is the sharpest new talking point for Arova's self-hosted positioning.

### A.10 Devin (Cognition) — heaviest October shipping cadence in the set

Verified directly from the official changelog (https://docs.devin.ai/release-notes/overview.md):
- **Oct 9 — cross-session personal memory** with nightly "dreaming" refinement (opt-out); Devin Ultra under zero data retention.
- **Oct 19 — Devin Oncall GA**: triages Slack/Teams/PagerDuty alerts, investigates, posts root causes; sessions can propose edits to shared plugins/skills pending admin approval; crashed sessions recoverable by replying in Teams threads.
- **Oct 21 — Devin Review**: Bitbucket Cloud, SARIF exports; Oncall Lite.
- Oct 2–14: terminal tab in session workspace, notification inbox, observability plugins (Splunk, Elastic, Dynatrace…), plugin previews before install, "more aggressive private key redaction", org-level agent capabilities.

**Read:** Devin shipped cross-session memory, shared-skill proposals gated on admin approval, and observability exports in one month. Shared-skill proposals **pending admin approval** independently validates Arova's new spec 27 (reviewable self-modification).

### A.11 OpenHands — steady releases, Agent Canvas line

Oct 23 v1.33.0 (https://github.com/OpenHands/OpenHands/releases); Agent Canvas 1.26.0 Oct 8 (https://docs.openhands.dev); Enterprise 0.76.0 Oct 2 — **hung LLM streams now time out instead of stalling** (https://docs.openhands.dev/enterprise/release-notes/0.76.0); Sep blog — Scoped Agent Profiles, persistent automations, isolated Docker runtimes (https://www.openhands.dev/blog/new-in-agent-canvas-september-2026).

### A.12 Microsoft Copilot Studio / Agent 365 — licensing expansion, not features

Oct 1 — Agent 365 purchasable by Government Community Cloud customers (https://samexpert.com/microsoft-product-terms-october-2026); Oct 8 — GitHub Copilot harness for Copilot Studio (https://partner.microsoft.com/en-us/blog/article/whats-new-for-partners-q2-fy2027); Copilot split into two billing tracks, app rebuilt around an always-on Home (https://changepilot.cloud/blog/october-2026-microsoft-365-updates-copilot-billing-home-more). Dots announce mentioned "specialist dots to Microsoft Agent 365" — interop forming (https://openai.com/index/introducing-dots/).

### A.13 Google Gemini Enterprise — "one universal agent"

- **Oct 8, Gemini at Work 2026** — the **Gemini agent**: a single universal agent for work, collapsing prior enterprise agent SKUs; operates with **its own account/permissions and a spend cap** for business accounts; private preview as of Oct 12 (https://cloud.google.com/blog/products/ai-machine-learning/welcome-to-gemini-at-work-2026, https://futurumgroup.com/insights/google-collapses-enterprise-ai-into-a-single-gemini-agent-at-gemini-at-work-2026, preview status **[secondary]**).
- Oct 2 release notes: federated query mode, Knowledge Catalog preview (https://docs.cloud.google.com/gemini/enterprise/docs/release-notes).

**Read:** Google's "own account, own permissions, spend cap per agent" maps 1:1 to Arova's per-agent budgets and approvals — per-agent identity + spend cap is now a big-three pattern (Google, Microsoft, OpenAI).

### A.14 Lindy — no October news. Valid finding: no news. (Latest: Gaia voice agent Jun 2026; from $29.99/user/mo: https://www.lindy.ai/pricing.)

### A.15 Zapier Agents — dissolved into "AI by Zapier"

Oct 6–7 — Agents rebranded **"AI by Zapier"**: tool calling, reasoning and autonomous action folded into a single AI step inside the Zap editor; migration guide published (https://zapier.com/blog/zapier-agents-is-now-ai-by-zapier). Third parties call the per-model-tier AI-step pricing a "5× billing trap" **[secondary]** (https://justuse.tech).

---

## B. Market-direction synthesis (pass 3)

1. **The category is consolidating around one durable agent per person.** OpenAI's Dots can't delegate dot-to-dot; Google collapsed its agent SKUs into one Gemini agent; Anthropic dissolved Cowork into chat and killed local mode; Zapier dissolved Agents into a workflow step. The "many small agents" pendulum swung back to "one agent, org-wide permissions." Arova's named-agent org model is now validated in the *other* direction by CopilotKit's multi-coworker line (OpenBot/OpenDots/Soar) and by Grok's Team Bots — but it has a direct, well-funded open-source competitor for the first time (Soar).
2. **Self-hosting became a marketed enterprise feature.** Soar's entire pitch is self-hosted coworkers on your servers; Anthropic removing Cowork's local mode hands that pitch its sharpest talking point. Arova's MIT/sovereignty positioning just got both a tailwind and a competitor.
3. **Governance primitives are table stakes at every vendor:** per-agent accounts/permissions and spend caps (Gemini agent), approval cards (Dots, OpenDots, Devin), recovery provenance for interrupted work (OpenClaw 10.7), secret redaction and SARIF audit exports (Devin). Arova's approvals + provenance + per-seat budgets match the direction exactly.
4. **Memory moved a generation:** Devin's cross-session memory with nightly refinement and OpenDots' per-Dot learning make keyword-only org memory look one generation behind — spec 20's reviewable-first approach remains the right counter, but capture-from-work is now expected, not optional.
5. **Reliability of long-running work is the new battleground:** hung-stream timeouts (OpenHands), replay-safe recovery (OpenClaw), crash-recovery-by-reply (Devin), partial-reply preservation (Devin Oct 14). Spec 16 gets a recovery amendment (below).
6. **Security remained the open flank** (OpenClaw exposure stats, Manus injection research, xAI's agentic-action liability disclaimers) — the accountability wedge is intact.

---

## C. New entrants and previously-uncovered products

### C.1 CopilotKit Soar — the most important new entrant for Arova

Oct 22, 2026. "Self-hosted AI coworkers built for your company": deploy from a single machine to Kubernetes (EKS/AKS/GKE), reaches teams via Slack and Teams, any agent/any model, white-labelable, **setup done by CopilotKit engineers**, powered by OpenBot. Launched with seven comparison posts (vs Grok Bot, Muse, Dots, Claude, Cursor, Hermes Agent, OpenClaw) (https://www.copilotkit.ai/blog/introducing-soar). No pricing surfaced. **[unverified: Hermes Agent identity]**.

**Implication:** Arova now has a direct open-source competitor with the same shape (named coworkers, per-agent permissions, self-hosted, any model) and much stronger distribution (Slack/Teams + white-label + K8s). Arova's remaining unique ground: explicit org chart/reporting lines/bench, reviewable org memory, honest-substrate refusals, per-seat budgets, no licensed plane.

Other CopilotKit October ships: **CLiF** — continual learning from full-stack trajectories (Oct 13); **aimock** — HTTP-200-but-broken-tool-call testing (Oct 12); **Open Intelligent UI** (Oct 9) (https://www.copilotkit.ai/blog).

### C.2 Kortix (formerly Suna) — closest architectural cousin

Open-source "AI Operating System", ~20.3k stars, self-described alternative to Cowork/ChatGPT Work; agents run in isolated sandboxes and produce deliverables; Docker Compose self-host; optional cloud from ~$20/mo (https://github.com/kortix-ai/suna, https://kortix.com). License caveat: Apache 2.0 core, but the white-label license requires Platinum as the exclusive compute provider; stack pulls from Docker Hub — "self-hosted but not fully disconnected."

**Worth stealing:**
- **Git-as-company:** a project is a literal git repo (`kortix.yaml`) holding agents, skills, company memory and connectors — versioned and diffable; each session runs on a branch of a disposable sandbox and reaches main only via an **approved change request**. Extends Arova's reviewable-memory idea into reviewable *agent definitions* (→ spec 27).
- **Per-tool Allow/Ask/Block gates** (not just reply-level approve/deny) plus server-side credential brokering: connector keys never reach the agent runtime.

### C.3 Sim (simstudioai/sim) — the stack existence proof

Apache-2.0 collaborative agent-workflow workspace, ~29.9k stars; visual canvas + conversational + code agents; 270+ integrations (5,400+ actions, 520+ triggers); run/log/schedule monitoring (https://github.com/simstudioai/sim, https://www.sim.ai). Stack is strikingly close to Arova's: **Next.js App Router, PostgreSQL + Drizzle, Zod, Better Auth, Trigger.dev background jobs, E2B/isolated-vm code execution, Socket.io**, Helm charts, `npx sim-setup` wizard with a `doctor`/`status` CLI that reports configured capabilities without printing credential values.

**Read:** existence proof that Arova's exact stack carries the full feature set. Steal the `doctor` pattern (capability introspection without secrets — mirrors Arova's env diagnostics) and note the community expectation of a one-command setup wizard (spec 25 territory) and an MCP *server* surface (let external agents manage the workspace).

### C.4 Dify, Coze Studio, AutoGPT, LangGraph/Flowise

- **Dify** — modified Apache 2.0: bars multi-tenant hosting, branding removal, and competing services; plain internal self-host fine (https://github.com/langgenius/dify). Differentiate-against: app-builder framing, no org structure.
- **Coze Studio** (ByteDance) — Apache 2.0, Go backend; visual builder, RAG, multi-agent; sibling **Coze Loop** for observability/eval — tracing ships alongside agents (https://github.com/coze-dev/coze-studio).
- **AutoGPT** — ~186.9k stars but effectively a zombie; company pivoted to hosted "Otto" (https://github.com/significant-gravitas/autogpt). Lesson: pick integration partners by commit velocity, not stars.
- **LangGraph Platform** — framework MIT; hosted from $35/mo; self-host via Docker free but Lite tier lacks custom auth; LangSmith Plus $39/seat (https://www.truefoundry.com/blog/langgraph-pricing). Flowise: self-hostable low-code, cloud from $35/mo. Steal-able: per-node execution billing granularity (~$0.001/node) shows how fine-grained usage metering is expected to be.

### C.5 Coding-agent platforms — transferable patterns only

- **GitHub Copilot coding agent** — assign an issue → agent implements → draft PR → reviewer comments get a **"Fix with Copilot"** button spawning a follow-up agent task on the same PR (https://github.blog/ai-and-ml/github-copilot/assigning-and-completing-issues-with-coding-agent-in-github-copilot). Steal: the **review-comment → agent-fix loop** as a first-class primitive (→ spec 27).
- **Cursor Cloud Agents** — isolated VMs, checkpoint/rollback of agent changes, parallel background runs (https://cursor.com/docs/cloud-agent); a 2025 writeup showed EC2 takeover via background-agent infra (https://www.reco.ai/blog/hijacking-cursors-agent-how-we-took-over-an-ec2-instance) — a caution for spec 24.
- **Replit Agent 3** — **one-click rollback to any checkpoint**, user-selectable **autonomy levels** (high = long self-correcting runs; low = step-wise approval) (https://docs.replit.com/features/version-control/checkpoints-and-rollbacks). Steal: the per-agent autonomy dial (→ spec 26 amendment).
- **Jules (Google)** — clones the repo, writes a **plan for your approval**, then executes in an isolated VM and opens a PR (https://jules.google). Steal: **plan-first gate** — the plan is the approval artifact before spend (→ spec 26 amendment).

### C.6 Voice/phone surfaces — a rentable commodity layer

Typical all-in cost ~$0.08–0.14/min: Vapi $0.05/min platform + at-cost models; Retell $0.07–0.31/min; Bland $0.14/min; ElevenLabs Agents ~$0.08/min (https://texttolab.com/blog/voice-agent-pricing, https://stackbinary.io/insights/voice-ai-pricing-per-minute-2026). Implication: if ever added, voice should be an **env-driven channel provider** (like model providers), never a built platform.

### C.7 Infrastructure primitives — status

- **Memory:** Mem0 is Apache-2.0 (not MIT); 2026 algorithm uses single-pass ADD-only extraction and multi-signal retrieval (semantic + BM25 + entity) with temporal ranking (https://github.com/mem0ai/mem0). Graphiti keeps a **temporal validity window on every fact by default** (https://hindsight.vectorize.io/blog/2026/08/11/open-source-agent-memory-systems). The BM25+entity fusion and `valid_from/valid_to` intervals are implementable in Arova's Postgres with no new service (→ spec 20 amendment). Arova's existing exclusion of Mem0/Zep/Letta stands.
- **Sandboxes:** E2B ~$0.0000303/s for 2 vCPU/512 MiB, ~717 ms cold start; Daytona ~$0.0504/vCPU-hr and **has dropped full self-hosting — managed cloud only going forward**; Modal ~$0.142/core-hr (https://blog.logrocket.com/comparing-ai-agent-sandbox-platforms-e2b-modal-daytona-and-more, https://pub.towardsai.net/e2b-vs-daytona-vs-modal-vs-docker-how-ai-agent-sandboxes-actually-differ-bd1ea9bb3333). Arova stays honest about not shipping a sandbox and documents providers as the sanctioned escape hatch (spec 24).
- **MCP gateways:** official registry https://registry.modelcontextprotocol.io; self-hostable gateways (MCPJungle, Obot, IBM ContextForge, Docker gateway) centralize auth, audit and per-tool rate control (https://www.lunar.dev/post/the-best-open-source-mcp-gateways-in-2026) — the enterprise-shaped feature set Arova's policy gateway (spec 17) hand-rolls.
- **Protocols:** **A2A** under https://github.com/a2aproject/a2a, production adoption lagging hype (https://credal.ai/blog/what-happened-to-a2a-protocol). **AG-UI** — CopilotKit's open event protocol for agent→frontend streaming over SSE (TEXT_MESSAGE_CONTENT, TOOL_CALL_START, STATE_DELTA), adopted by LangGraph, CrewAI, Pydantic AI, Microsoft Agent Framework (https://docs.ag-ui.com/introduction). Arova already streams over SSE; aligning its event vocabulary with AG-UI would make the frontend drop-in compatible with the ecosystem — noted as a later, high-leverage option.

### C.8 Workflow automation with agents

- **n8n** — Sustainable Use License (fair-code, **not** OSI open source); free internal self-host only; Business self-host key phones home daily (https://support.n8n.io/article/can-i-use-your-license-for-my-use-case).
- **Activepieces** — MIT core (agents/projects/API partly outside it); closest permissive license to Arova's intent (https://www.activepieces.com/blog/activepieces-vs-n8n).
- **Windmill** — AGPLv3, code-first.
- What they give agents that Arova lacks: **hundreds of trigger types** (webhooks, schedules, app events) and typed action libraries — Sim's "5,400+ actions / 520+ triggers" is the same pattern at workspace scale. Arova's single inbound bearer trigger is the weakest point relative to this category (→ spec 21 amendment candidate: webhook trigger kinds).

---

## D. Pass-3 shortlist — steal-able patterns not already on Arova's gap list

1. **Plan-first approval + run checkpoints/rollback.** Jules gates execution on an approved plan; Replit and Cursor offer one-click rollback to checkpoints. For Arova: persist the agent's plan as the approval artifact *before* spend, and snapshot thread/tool state so a run can be rolled back or branched. Postgres alone suffices. → amendment to spec 26.
2. **Per-agent autonomy dial.** One column mapping an agent to high (long self-correcting runs) vs low (step-wise confirmation) autonomy, on top of the existing approval matrix. → amendment to spec 26.
3. **Recovery provenance / resumable interrupted work.** OpenClaw 10.7 keeps recovery provenance and unfinished tool outcomes; Devin recovers crashed sessions by reply; OpenHands times out hung streams. → amendment to spec 16.
4. **Reviewable self-modification + review-comment fix loops.** Devin's sessions propose edits to shared skills pending admin approval; Kortix's git-as-company makes agent definitions diffable change requests; Copilot's "Fix with Copilot" turns a review comment into a bounded re-run. → **new spec 27**.
5. **Postgres-native memory fusion + temporal validity.** Mem0's BM25+entity fusion and Graphiti's `valid_from/valid_to` per fact, implemented inside Arova's existing tsvector tables — a dependency-free middle ground before committing to embeddings. → amendment to spec 20.

Near miss: **AG-UI event vocabulary** for the SSE path — high leverage, but only pays off once external clients exist. Second near miss: **outbound webhook/app-event trigger kinds** — rides spec 21.
