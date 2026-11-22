# Deep dive — memory and execution-substrate rails

Research date: **2026-10-20**. Labels: VERIFIED / DOCUMENTED / INFERRED / UNVERIFIED.

## Memory/context

### Mem0
- LLM-driven extraction/consolidation/retrieval; Apache-2.0, ~67.5k stars; self-hosted Docker server uses Postgres+pgvector. VERIFIED via https://docs.mem0.ai/open-source/overview and GitHub API.
- Platform tiers free → $19 → $249 with graph memory/Dream; enterprise controls exist. DOCUMENTED via https://mem0.ai/pricing; SOC 2 claim not found in consulted doc.
- **Fit: avoid as a dependency.** Auto-extraction conflicts with Arova's review-before-save principle, adds an LLM to the write path, and duplicates the existing `memories` schema.

### Zep
- Now proprietary Konig-graph commercial context layer with credit pricing, SOC 2/HIPAA/BYOK/VPC. Community Edition no longer available. VERIFIED via https://docs.getzep.com/introduction/what-is-zep/ and https://www.getzep.com/pricing.
- **Fit: avoid.** Hosting dependency closes Arova's self-hosted/BYOK story.

### Graphiti
- Apache-2.0, ~32k stars; bi-temporal fact invalidation and hybrid semantic/keyword/graph retrieval with provenance. VERIFIED via https://github.com/getzep/graphiti and https://help.getzep.com/graphiti.
- Requires Neo4j/FalkorDB/Neptune, Python-first, default OpenAI inference/embedding.
- **Fit: avoid as substrate, adopt invalidation concept.** Add `valid_at`/`invalid_at` to Arova memories instead of a graph database.

### Letta
- Apache-2.0 stateful agent runtime with self-editing memory, ~25k stars, BYOK. VERIFIED via https://docs.letta.com/self-hosting/ and GitHub.
- Third-party reports say the old Docker self-host image and V1 API were deprecated; not fully confirmed. UNVERIFIED.
- **Fit: avoid.** It is a competing agent runtime, not a memory library for Arova.

### pgvector and Postgres-native search
- pgvector 0.8.6 current; Postgres 18 needs ≥0.8.2. VERIFIED from project research and https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md.
- Absent on this machine. Existing install routes and supply-chain caveats are in `context/vector-graph-memory-research.md`.
- VectorChord and ParadeDB pg_search exist, but ParadeDB is AGPL-3.0. VERIFIED for license/popularity; performance/license compatibility needs a separate evaluation.
- **Fit: integrate pgvector only.** Postgres remains single store; keyword fallback always available.

### Embeddings
- OpenAI-compatible `/v1/embeddings` is the easiest rail; default candidate `text-embedding-3-small` at $0.02/1M tokens. DOCUMENTED via https://platform.openai.com/docs/pricing.
- Local candidates: `nomic-embed-text`, qwen3-embedding, bge, jina-v3 through Ollama. DOCUMENTED via https://ollama.com/search?c=embedding. Ollama is not installed here. VERIFIED locally.
- Arova's gateway hardcodes `/chat/completions`; an embedding client must be added. VERIFIED at `src/lib/model-gateway.ts`.

### Cognee
- Active Apache-2.0 graph+vector memory, Python pipelines, cloud option. VERIFIED via https://github.com/topoteretes/cognee.
- **Fit: watch only.** Wrong stack and no review gate.

## Recommended memory reference architecture

Build thin inside Arova:
- keep `to_tsvector`/`ts_rank` keyword path;
- add optional `vector(1536)` via pgvector 0.8.6;
- add an `EMBEDDINGS_*` provider following the existing provider doctrine;
- hybrid scoring with explicit mode (`keyword | hybrid`), thresholds, evidence and stale-note exclusion;
- temporal `valid_at`/`invalid_at` for supersede;
- proposed → reviewed → active memory; no automatic write without human review.

Avoid Mem0, Zep, Letta and external vector DBs for the current product.

## Execution substrate

### E2B
- Firecracker Linux sandboxes, exec/files/persistence, per-second vCPU/RAM pricing, runtime caps 1h hobby / 24h pro, paused state, SOC 2/pen test/DPA. Infrastructure is Apache-2.0 but hosted-first; docs state BYOC is not self-hosting. VERIFIED via https://e2b.dev/docs and https://e2b.dev/docs/faq.
- TypeScript SDK is a natural Next.js integration.
- **Fit: primary production adapter for terminal/files.**

### Browserbase
- Managed browser over CDP + Stagehand (MIT, ~25.7k stars). Free 3 concurrent/1h/15-minute sessions; $20 and $99 tiers; live-view URLs support takeover. VERIFIED via https://docs.browserbase.com and https://www.browserbase.com/pricing.
- **Fit: optional production browser adapter if live takeover matters.**

### Daytona
- Current platform docs list Linux/Windows/macOS/GPU sandboxes and enterprise controls; OSS repo is archived as of 2026-07-24. VERIFIED via https://www.daytona.io/docs/en/ and GitHub API.
- **Fit: fallback only. Hard lock-in signal.**

### Modal / CodeSandbox
- Modal is general serverless compute, not an agent-isolation product; Python-centric, pricing not aligned to seat sessions. VERIFIED via https://modal.com/pricing.
- CodeSandbox docs bot-walled and license/isolation/pricing unverified.
- **Fit: avoid both.**

### Docker local adapter
- One container per seat with Chromium + workspace, caps/TTL, nonroot, read-only root, no host mounts/keys. This is the only fully local/self-hosted pattern consistent with Arova's identity.
- On this machine Docker CLI may exist but daemon was not running in the prior environment note; needs explicit validation before implementation.
- **Fit: dev adapter.** Harden with gVisor/Firecracker later; do not expose a raw browser profile.

### Browser standard
- MCP + Playwright is the practical standard: Playwright MCP (Apache-2.0), browser-use (MIT), Steel, Stagehand. VERIFIED via GitHub API.
- Skyvern is AGPL.
- **Fit: expose browser tools through MCP/Playwright rather than inventing a protocol.**

## Recommended computer reference architecture

1. Keep Arova's `SandboxProvider` contract as the boundary.
2. Implement a **Docker local adapter** first: browser + files, shell off by default.
3. Implement an **E2B adapter** as production exec/files rail.
4. Add **Browserbase** only when live session/takeover becomes a customer requirement.
5. Keep Daytona behind contract as a fallback only.
6. Route every action through spec 17 policy gateway: fail-closed, domain/path/command allow-lists, scoped credentials, audit, TTL, kill switch.
7. Enforce memory/CPU/output caps and provider budget at both worker and gateway.

## Corrections to the first comparison

- OpenMuse's documented Docker computer is more hardened than its E2B path; its E2B alternative enables network and exposes all listening ports unauthenticated. This makes "E2B by default" an anti-pattern without a proxy/policy.
- The agent-computer market is consolidating around MCP + Playwright, not custom browser protocols.
- pgvector is the only memory rail compatible with Arova's self-hosted/BYOK position.
