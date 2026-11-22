# Demand signals — what users actually praise, hate, and pay for

Research date: **2026-10-20**. Cluster: community/demand evidence for always-on agent products. Sources: Hacker News Algolia, GitHub issues/advisories, vendor help pages, Trustpilot/App Store reviews, technology press, and independent review aggregators. Twitter and authenticated Reddit backends were unavailable; direct Reddit fetching returned 403, so Reddit-derived sentiment is marked weak.

Evidence grades:
- **A** = official issue/advisory/vendor documentation or a primary HN story with a named source.
- **B** = multiple independent user reports or public review sites.
- **C** = single anecdote, aggregator commentary, or press interpretation.

## 1. Demand signal by theme

### Praise: concrete output and background continuation

Users reward products that produce a usable artifact while they are away:
- OpenClaw daily use includes nightly GitHub/Obsidian sync, morning briefs, and multiple isolated instances acting as employees in Slack — https://news.ycombinator.com/item?id=47783940 (2026-04-15). Grade B: multiple HN reports.
- OpenClaw became GitHub's most-starred project — https://news.ycombinator.com/item?id=47217812 (2026-03-02). Grade A for momentum, not quality.
- Grok Bot users highlighted concrete batch output (74 card-art pieces in 2 hours) and voice-completed reservations — https://metallab.ai/en/2026/8/grok-bot-early-user-reviews-roundup (2026-08-13). Grade C: aggregator.
- Editorial pattern: visible file/link output is more persuasive than chat text. Grade B.

### Complaints: autonomy without observability

The most severe complaints are not "the answer was bad" but "it spent/exposed without me seeing it":
- OpenAI dot reportedly burned 300K+ tokens across 155 traces without a user prompt; sub-agent activity was invisible — https://www.theregister.com/ai-and-ml/2026-10-13/ (2026-10-13). Grade B (press) / C (incident detail).
- A dot allegedly continued executing while UI said "paused," and Resume/Delete failed — https://dots101.com/field-notes/ (2026-10-01). Grade C.
- OpenClaw admin token/password exposure via URL query/localStorage — https://github.com/openclaw/openclaw/security/advisories/GHSA-rchv-x836-w7xp (2026-03-08). Grade A.
- OpenClaw CVE-2026-33579 privilege escalation — https://news.ycombinator.com/item?id=47633396 (2026-04-03). Grade A.
- Claude Cowork deleting 11GB after interpreting "clean up" — https://news.ycombinator.com/item?id=46597781 (2026-01-13). Grade B incident story.
- Cowork file exfiltration via prompt injection on day 2 — https://news.ycombinator.com/item?id=46622328 (2026-01-14). Grade A story volume, C mechanism detail.
- Anthropic/Google account actions against OpenClaw users: https://news.ycombinator.com/item?id=47115805 (2026-02-22), https://news.ycombinator.com/item?id=47963204 (2026-04-30). Grade B.

### Pricing: credits are the dominant trust failure

- Manus: 200 credits for a question, 6,000 for one site, 31,132 unused credits expired after upgrade — https://apps.apple.com/us/app/manus-ai-agent-automation/id6740909540 (2026-04-30), https://www.trustpilot.com/review/manus.im (2026-10-06). Grade B.
- Lindy: "$900+ on the $200/month plan" and a 4× increase — https://www.trustpilot.com/review/lindy.ai (2026-08-26). Grade B/C.
- Devin: weekly Max quota reportedly drained under 3 hours; hidden 5-hour limits on advertised free SWE-2 — https://www.feedbackbench.com/agents/devin.md (2026-09-03/19). Grade C aggregator.
- Microsoft Copilot Studio: pooled opaque tenant "Copilot Credits," $200/25K pack, 5 credits/action — https://learn.microsoft.com/en-us/microsoft-copilot-studio/requirements-messages-management (2026-10-01). Grade A for pricing structure.
- Pattern: users pay for predictable cost-per-outcome, not opaque token meters. Grade A.

## 2. Most-requested missing capabilities

1. **Per-task spend ledger + hard cap + kill switch.** Evidence: Dots/Manus/Lindy/Devin complaints. Grade A as a pattern.
2. **Provable pause.** A control that says paused must stop every child task, not merely the parent UI. Grade C incident, strong inferred need.
3. **Model/provider transparency and routing.** Grok Bot reportedly does not let users choose a model — metallab roundup. Grade C.
4. **RBAC and multi-user permissions.** OpenClaw GitHub issue +28 thumbs — https://github.com/openclaw/openclaw (issue referenced 2026-02-03). Grade A.
5. **Channel breadth + native MCP.** OpenClaw issues: Feishu/WeChat +75, Slack Block Kit +28, MCP +26. Grade A.
6. **Reliable artifact handoff.** Grok Bot files reportedly trapped in the bot VM. Grade C.
7. **Sub-agent audit trail.** Users cannot see child-agent work. Grade B.
8. **Scoped, ephemeral credentials.** Users told to give agents gift cards, not real cards. Grade B practitioner advice.

## 3. Buyer shape

- Consumers want one always-on helper (OpenClaw, Dots, Grok Bot).
- Small teams are already managing multiple agents as workers (OpenClaw HN pattern, Cowork team rollout). Grade B.
- Enterprises buy governance, SSO, audit, and org-wide caps. Devin Teams/Enterprise page reports SSO/audit/per-org caps — https://pick-right.com/tools/devin/ (2026-10-05). Grade C aggregator, consistent with official enterprise patterns.
- "Multi-agent swarm" enthusiasm in vendor trend surveys is marketing, not proven organic demand. Grade C.
- HN sentiment is skeptical of "AI employee/org chart" branding; credibility comes from concrete controls. Grade B.

## 4. Where a solo/open-source product can win

Evidence supports winning on:
- **Predictable cost and local control**, not frontier routing.
- **Provider neutrality** — model-agnostic alternatives appeared quickly after each lock-in event.
- **Credential custody** — users distrust hosted agents holding accounts.
- **Honest reliability** — visible traces, pauses, budgets, refusals.
- **Artifact delivery** — files/links in the user's workspace, not trapped in a VM.

Evidence says not to compete on:
- frontier model access,
- infinite connector catalogues,
- free hosted always-on infrastructure,
- generic Cowork/Dots UI.

## 5. Strategic corrections to the first pass

The original roadmap said structure/accountability/BYOK is a moat. Demand evidence strengthens that, but changes emphasis:

| First-pass assumption | Demand evidence | Corrected priority |
|---|---|---|
| Org structure is the primary moat | Users distrust autonomous spend more than they seek hierarchy | Spend ledger + kill switch + provable pause are a higher urgency than org features |
| Always-on = proactive swarms | Self-directed background work is the most common trust failure | Always-on must ship with visible task graph and hard budget before more proactivity |
| More skills = better | Users care about reliable artifact and channel output | Skills are secondary to execution visibility and delivery |
| Computer is the next substrate | Security incidents dominate complaints | Computer stays last; scoped credentials/pause/audit first |
| BYOK is a nice differentiator | Model lock-in is a recurring churn trigger | BYOK becomes a core promise, not an option |
| Open-source wins by copying UI | Free Cowork clones already exist | Arova must win on controls + accountability |

## 6. What to build specifically from demand evidence

### Add to spec 16 (durable work engine)
- `tasks` parent/child graph with depth and initiator.
- Per-task token/cost ledger, even if estimates.
- A kill switch that cancels parent and descendants.
- Pause state must be enforced in the worker, not only UI.
- A run export/artifact handoff contract.

### Add to spec 17 (tool plane)
- Scoped short-lived credentials by default.
- Secrets never in URLs/localStorage/browser props.
- Per-tool host/domain/path allow-lists.
- A visible "what will be spent" estimate on approval cards.

### Add to spec 18 (auth)
- RBAC is not optional for team use.
- Audit actor, role, model, tool, cost, artifact and external destination.
- Session/device controls and admin kill switch.

### Add to spec 19 (scale/observability)
- Cost per run/task/seat/provider with hard cap.
- Trace tree with sub-agents and tool calls.
- Pause/resume/cancel correctness.
- Artifacts/download links with retention.

### Add to spec 20/22 (memory and goals)
- No proactive background task without a per-goal budget and observable next check.
- Memory review is a trust feature, not just retrieval quality.

## 7. What not to chase

- Autonomous self-tasking "AI coworkers" with no spend controls.
- Org-chart aesthetics without actual RBAC, audit, pause and budget.
- A consumer clone UI.
- A broad connector marketplace as the first differentiator.
- Browser/terminal autonomy before the policy and credentials story is solid.
