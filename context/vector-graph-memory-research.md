# Vector + graph memory: install targets and retrieval architecture

Status: **research, not built.** Nothing in this file has been installed or run against the app.
Date: 2026-10-01. Written against PostgreSQL 18.3 on this host, probed live.
Supersedes nothing; it is the follow-up to the `Lost alternative: vector embeddings` line in D-16.

## 0. What was verified on this machine (not assumed)

| Fact | Value | How |
| --- | --- | --- |
| Server | PostgreSQL **18.3**, EDB native install | `show server_version` |
| Install root | `C:/Program Files/PostgreSQL/18`, data in `.../data` | `pg_config`, `show data_directory` |
| Service | `postgresql-x64-18`, Running, Automatic | `Get-Service` |
| Extensions installed | **`plpgsql` only** | `pg_extension` |
| Extensions available to install | `pg_trgm` 1.6, `ltree` 1.3, `hstore` 1.8 (SQL ships, not created) | `pg_available_extensions` |
| `vector` / `age` / `pg_search` / `pgvectorscale` / `vectorchord` | **absent from the server entirely** | `pg_available_extensions` — no row at all |
| Host RAM | **31.95 GB total, ~21.9 GB free, 8 logical CPUs** (corrected 2026-10-01: an earlier pass in this session assumed a 16 GB laptop — wrong, and it was not the constraint) | `Win32_ComputerSystem` / `Win32_OperatingSystem` |
| Server sizing | `shared_buffers` 128 MB, `work_mem` 4 MB, DB 10 MB | `show` |
| Data volume today | `memories` **13 rows, avg 50 chars, max 57** · `messages` 872 · `agents` 516 · `teams` 40 · `workspaces` 118 · `triggers` 0 | row counts |
| Build toolchain | VS Community 2022 present, **no C++ compiler** (`VC/Tools/MSVC/14.44.35207/bin` has no `cl.exe`/`nmake`); no `make`/`gcc`/`flex`/`bison`; no conda; no Stack Builder binary (license file only) | filesystem probe |
| Docker | CLI 29.7.2; **daemon not running** | `docker info` |
| Ollama | **not installed**, nothing on `127.0.0.1:11434` | PATH + netstat |
| Disk | 61 GB free on C: (77% used) | `df` |
| Gateway | can only POST `/chat/completions` — `buildEndpoint()` hardcodes that suffix; **no embeddings path exists** | `src/lib/model-gateway.ts:109` |

The data-volume row is the most important line in this file. **13 notes of 50 characters is not a retrieval problem.** Anything built here must be justified by where the product is going, not by what this table looks like today.

## 1. Install: pgvector

### 1.1 Version floor

PG18 support is recent and rough. From pgvector's own CHANGELOG: **0.8.1** (2025-09-04) added Postgres 18 rc1 support; **0.8.2** (2026-02-25) fixed `Index Searches` in `EXPLAIN` on PG18 *and* improved the Windows `install` target; **0.8.3** fixed a PG18 Hamming/Jaccard performance regression; **0.8.4** fixed HNSW vacuum corruption; **0.8.6** (2026-07-29) is current. Anything older than 0.8.2 on this server is a known-bad choice.

### 1.2 Route A — prebuilt Windows binary (recommended; 5 minutes, keeps this database)

Repo: `github.com/andreiramani/pgvector_pgsql_windows`. Verified via the GitHub API on 2026-10-01:
release tag `0.8.6_18`, asset **`vector.v0.8.6-pg18.zip`**, 166 KB, published 2026-07-30, 6,070 downloads.
Download URL:

```
https://github.com/andreiramani/pgvector_pgsql_windows/releases/download/0.8.6_18/vector.v0.8.6-pg18.zip
```

Unofficial build of the official 0.8.6 source. **That is a supply-chain decision, not a technical one**: you are putting a stranger's compiled `vector.dll` into a server process that holds this org's data. If you take it, take it knowingly — the mitigation is Route B, which costs a multi-GB toolchain install and a compile you can read.

Steps (admin PowerShell, not Git Bash — this needs elevation to write into `Program Files` and to restart the service):

```powershell
$pg = 'C:\Program Files\PostgreSQL\18'
$tmp = Join-Path $env:TEMP 'pgvector18'
New-Item -ItemType Directory -Force $tmp | Out-Null
curl.exe -sL --ssl-no-revoke -o "$tmp\v.zip" 'https://github.com/andreiramani/pgvector_pgsql_windows/releases/download/0.8.6_18/vector.v0.8.6-pg18.zip'
Expand-Archive "$tmp\v.zip" -DestinationPath $tmp -Force
Get-ChildItem -Recurse $tmp -Include vector.dll,vector.control,vector--*.sql | Select-Object FullName,Length
# stop when the listing above does not show all three kinds — do not copy blindly
Copy-Item (Get-ChildItem -Recurse $tmp -Filter vector.dll).FullName "$pg\lib\" -Force
Copy-Item (Get-ChildItem -Recurse $tmp -Include vector.control,vector--*.sql).FullName "$pg\share\extension\" -Force
Restart-Service postgresql-x64-18
```

Verify (this is the part that matters — an extension that loads but indexes wrong is worse than none):

```sql
CREATE EXTENSION vector;                       -- then a fresh session:
SELECT extversion FROM pg_extension WHERE extname='vector';   -- expect 0.8.6
SELECT vector_dims('[1,2,3]');                 -- expect 3
SELECT '[1,2,3]'::vector <-> '[3,2,1]'::vector; -- real number, not an error
```

Then prove the index is used, not silently skipped:

```sql
EXPLAIN SELECT id FROM memories ORDER BY embedding <-> '[0,0,0]'::vector LIMIT 5;
```

`could not access file "$libdir/vector"` → the copy missed or the service wasn't restarted. `extension "vector" is not available` → `vector.control` didn't land. An ABI/load error on `CREATE EXTENSION` → the DLL doesn't match this EDB PG18 build.

### 1.3 Route B — compile from source (auditable, needs the C++ workload)

The pgvector README's Windows path is MSVC `nmake`, and the Makefile.win links `%PGROOT%\lib\postgres.lib` directly (no PGXS). Server headers **are** already installed here (`include/server/` exists), so only the compiler is missing: add **Desktop development with C++** to VS Community 2022 through Visual Studio Installer (~2–6 GB).

Then, in **x64 Native Tools Command Prompt for VS 2022** run *as Administrator* (not Git Bash — a 32-bit prompt fails with `case value '4' already used`, and non-admin fails with `Access is denied`):

```bat
set "PGROOT=C:\Program Files\PostgreSQL\18"
cd %TEMP%
git clone --branch v0.8.6 https://github.com/pgvector/pgvector.git
cd pgvector
nmake /F Makefile.win
nmake /F Makefile.win install
net stop postgresql-x64-18 && net start postgresql-x64-18
```

### 1.4 Route C — Docker (rejected as the default, and why)

`pgvector/pgvector:pg18` exists (tags `pg18`, `0.8.6-pg18` verified on Docker Hub). It is the cleanest *supported* path, and it is still the wrong first move here, for three concrete reasons: it is a **second Postgres server**, so the app must be pointed at it and this project's data migrated; port 5432 is held by the EDB service, so it must run on another port; and your own rule that a `DATABASE_URL` must point at a database this project owns, never the shared `app_db`, means a container DB is actually *safer* than the shared host — but it is still a migration, and it solves only vectors while solving nothing about graph. If you later want AGE or `pg_search` (both Linux-only), Route C stops being optional and becomes the architecture.

Git Bash caveat if you do go this way: `-v C:\...` gets path-mangled; use a **named volume** instead of a bind mount.

### 1.5 What NOT to install, with the reason

| Thing | Verdict | Why |
| --- | --- | --- |
| **Apache AGE** | **No** on this box | v1.8.0 does support PG 11–18 (README, verified), but the README's build instructions are Linux and macOS only — **zero Windows content**, no official binaries, and this host has no `gcc`/`make`/`flex`/`bison` (all probed). AGE only exists here as a second Postgres inside Docker. |
| **ParadeDB `pg_search`** (real BM25) | No | pgrx/Rust; Docker, apt, managed — no documented Windows build. |
| **pgvectorscale** (Timescale) | No | README blocks macOS Intel and never mentions Windows. Linux/Docker only. |
| **VectorChord** (Neon) | Not yet | Its install docs list a Windows x86_64 entry and PG 14–18, which is *promising*, but I have not confirmed a working build against EDB PG 18.3. Do not plan on it. |
| **Kuzu** (embedded graph DB, would have fit perfectly) | **No — dead** | Archived/abandoned by Kùzu Inc in Oct 2025; community forks (`bighorn`, `Ladybug`) exist but are not a foundation to adopt for a product. |
| **Neo4j / Memgraph / FalkorDB** | Not at this scale | Each is another daemon (Neo4j is a JVM, ~1 GB) with its own backup and consistency story, on a machine whose Postgres holds 10 MB. Nothing they can answer is unanswerable with edge tables at 10²–10⁴ nodes. Memgraph is BSL-licensed, FalkorDB SSPLv1 — both non-Apache. |
| **conda-forge `pgvector`** | No | win-64 builds exist, but they target **conda's own Postgres** — the DLLs land in the conda prefix and link conda's `postgres.lib`. It does not install into `C:\Program Files\PostgreSQL\18`. |
| **EDB Stack Builder / BigSQL** | Don't count on it | Stack Builder isn't even installed here (license file only). No evidence either lists pgvector for Windows PG18; BigSQL's repo was unreachable during research. Both **unverified**. |
| **SQL/PGQ** (the ISO property-graph syntax that would make graph memory native) | Not available — **and no longer on the horizon** | CORRECTED 2026-10-01: I previously wrote "PG19, GA planned 2026-10-29", which is **wrong**. The SQL/PGQ commit **was rolled back from PostgreSQL 19** before release ([depesz](https://www.depesz.com/2026-07-31/waiting-for-postgresql-19-sql-property-graph-queries-sql-pgq/), [pgsql-hackers commit thread](https://www.postgresql.org/message-id/E1w247I-0000Tk-2Y@gemulon.postgresql.org)). Even the rolled-back version shipped no variable-length paths and no graph algorithms — it was syntax over joins, not a traversal engine. Next realistic attempt is PG20 at the earliest, and that is speculation. Do not plan around SQL/PGQ at all. |

**Net: pgvector is the only thing that needs installing.** Graph memory here is tables and a recursive CTE. That is the single most useful finding in this file.

## 2. Embeddings: the part everyone forgets until the migration breaks

pgvector stores vectors; it does not produce them. Verified provider reality:

- **xAI / Grok: no embeddings endpoint.** `docs.x.ai` lists Grok text/image/voice only. Worth killing a recurring assumption: **Voyage AI was acquired by MongoDB (Feb 2025), not xAI** — `voyage-*` models live at `api.voyageai.com/v1`, and their response shape is `{data:[{embedding}]}`-adjacent but not strictly OpenAI-compatible.
- **OpenAI: yes, and the key is already configured.** `text-embedding-3-small` $0.02/M tokens, 1536-dim; `text-embedding-3-large` $0.13/M, 3072-dim; input cap 8,192 tokens; `dimensions` param truncates. **1536 fits under pgvector's 2,000-dimension index limit; 3072 does not** — it needs `halfvec` or truncation to 1024/2048.
- **Dahl/MiniMax: treat as chat-only.** MiniMax's own API has `embo-01` embeddings, but whether `inference.dahl.global/v1/embeddings` proxies it is **unverified** — it needs one live probe, which is your call, not a guess to spend a key on.
- **Ollama (local, free, OpenAI-compatible `/v1/embeddings`)**: `nomic-embed-text` 274 MB / 768-dim / 8k ctx (needs the `search_document:` prefix), `bge-m3` 1.2 GB multilingual, `mxbai-embed-large` 670 MB / 1024-dim but only 512 ctx. **Not installed here.** Privacy-wise it is the best option: org text never leaves the machine.
- **fastembed-js** (`npm i fastembed`, ONNX CPU, `bge-small-en-v1.5` 384-dim ~30 MB) — no daemon, weights download on first use.

Cost arithmetic at our actual sizes (a 240-char memory ≈ 60 tokens):

| Volume | Tokens | OpenAI 3-small | voyage-3.5-lite ($0.02/M) | 3-large ($0.13/M) | local |
| --- | --- | --- | --- | --- | --- |
| 1,000 memories | 60k | **$0.0012** | $0.0012 | $0.0078 | $0 |
| 10,000 | 600k | $0.012 | $0.012 | $0.078 | $0 |
| 100,000 | 6M | $0.12 | $0.12 | $0.78 | $0 + ~2.2 CPU-hours for a backfill |

Embedding cost is **irrelevant**. The real cost is the LLM call per write (Section 3) and the `DAILY_MODEL_CALLS_LIMIT=60` chat budget: embeddings batch (the endpoint takes an array — 10 memories in one call), but they must be metered **separately from chat** in `model_usage`, or a chat-heavy day starves memory writes.

Gateway contract this forces (spec, not code): a sibling to `buildEndpoint()` that appends `/embeddings` instead of `/chat/completions`; a payload builder with no `max_tokens`/`stream`; `<NAME>_EMBED_MODEL` per provider, so a provider without one reports `embeddingsConfigured() === false` and the caller **degrades to keyword recall rather than crashing** — the same shape as `LOCAL_PROFILE` today; `EMBEDDINGS_PROVIDER` override; per-provider embed-eligibility cached after a 404. Adding a vendor must stay an env change, not a code change, or it breaks the rule AGENTS.md sets.

Hygiene that is not optional: store `embedding_model` and `embedding_dims` **on the row**. Vectors from different models are different coordinate spaces; comparing them silently returns garbage that looks like a result. Normalise, use cosine (`<=>` + `vector_cosine_ops`). Re-embed only on a content-hash change. Backfill without downtime: add nullable column → batched fill → `CREATE INDEX ... USING hnsw` (outside a transaction) → only then `SET NOT NULL`.

## 3. Graph memory: what it is, and what it is not

A temporal knowledge graph for agent memory — the reference being Zep's **Graphiti** paper (arXiv:2501.13956), which is the honest benchmark since it is Python-only and we cannot use it directly — has four layers:

1. **Episodes** — raw messages kept verbatim. We already have this: `messages`, with `source_ids` on a memory pointing back at them.
2. **Entities** — typed nodes extracted by an LLM ("Nexus Labs", "the billing service", "Priya"), with aliases resolved onto one survivor node.
3. **Relations** — typed edges (subject–predicate–object), each **bi-temporal**: `created_at`/`expired_at` (when the system learned it) *and* `valid_at`/`invalid_at` (when it was true in the world).
4. **Communities** — clusters with summaries. Expensive, LLM-heavy, and **out of scope for a demo.**

The mechanism worth stealing is the contradiction handling: when a new fact conflicts, the old edge is **invalidated** (`invalid_at` set to the new fact's `valid_at`), never deleted. Our `supersedes` uuid is a one-column stub of exactly this idea — it replaces a note, but it can't express "this was true from March to June," and it only works note-to-note, not entity-to-entity.

**What a graph answers that neither keyword nor cosine can compose:** "who owns the service that the thing Priya raised depends on" — a two-hop question. Full-text finds matching words; vectors find matching *meaning*; neither walks a relation. Second: contradiction detection at write time. Third: a provenance chain episode → edge → entity, which is already this product's core value (attribution), so it is not decoration here.

**What it costs:** ≥1 extra LLM call per memory write (entity + relation extraction), plus another for merge-vs-new adjudication if we do entity resolution properly. Ingestion latency measured in seconds per episode. Two signature failure modes, both silent: **wrong entity merge** (one node absorbs two real-world things; every neighborhood query afterwards is quietly wrong) and **hallucinated edges** (the model invents a typed relation that no post ever stated). Both are why the UI must label extracted edges as *LLM-inferred, reviewable*, not as fact.

## 4. Recommended architecture: Postgres-native, no second database

The closest prior art is **Cognee**, which since 1.0 runs the entire memory layer — graph *and* vectors — on a single Postgres instance, and markets it as "Drop the Graph Database. Keep the Graph." That is the proof this is not a compromise design; at 10²–10⁴ nodes it is the correct one.

Keep `memories` as the note layer (it works, it's attributed, it has provenance). Add two tables:

```sql
CREATE TABLE memory_entities (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL, team_id uuid NOT NULL,
  kind text NOT NULL,              -- person | org | system | project | term
  name text NOT NULL, aliases text[] NOT NULL DEFAULT '{}',
  summary text NOT NULL DEFAULT '',
  embedding vector(1536), embedding_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, kind, name)
);
CREATE TABLE memory_edges (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL, team_id uuid NOT NULL,
  src uuid NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  dst uuid NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  relation text NOT NULL,          -- owns | depends_on | works_for | decided | supersedes | mentions
  properties jsonb NOT NULL DEFAULT '{}',
  evidence jsonb NOT NULL DEFAULT '[]',   -- memory ids / message ids that assert this edge
  valid_at timestamptz, invalid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  extraction_model text
);
CREATE INDEX ON memory_edges (team_id, src);
CREATE INDEX ON memory_edges (team_id, dst);
```

Everything stays org-scoped by `team_id`, which is the one rule D-16 already treats as absolute — cross-org memory leakage is the harm this product forbids, and a graph edge is the easiest place to leak through.

Traversal without AGE — 2 hops, dead edges excluded:

```sql
WITH RECURSIVE hop AS (
  SELECT dst, relation, 1 AS depth, ARRAY[src] AS path
    FROM memory_edges
   WHERE src = $1 AND team_id = $2 AND invalid_at IS NULL
  UNION ALL
  SELECT e.dst, e.relation, h.depth + 1, h.path || e.src
    FROM memory_edges e JOIN hop h ON e.src = h.dst
   WHERE e.team_id = $2 AND e.invalid_at IS NULL AND h.depth < 2
     AND e.dst <> ALL (h.path)                    -- cycle guard
)
SELECT DISTINCT dst, min(depth) FROM hop GROUP BY dst;
```

At a few thousand nodes this is sub-millisecond. It is not a toy: `ltree` (already shipped, just uncreated) covers the `agents.manager_id` reporting line, and JSONB holds edge properties.

## 5. Ranking: fuse, then filter by time, then diversify, then re-score

**Use Reciprocal Rank Fusion, not raw-score blending.** RRF (Cormack/Clarke/Büttcher, SIGIR 2009) is `score(d) = Σ 1/(k + rank_i(d))` with the convention **k=60** (insensitive across 20–100). It wins because the channels are not comparable: `ts_rank` is an unbounded heuristic weight sum, cosine similarity is bounded but shifted (random pairs land ~0.1–0.3, not 0), and graph hop count is ordinal. Min-max normalising those three and adding them re-distributes arbitrarily per query, so one channel can dominate by accident. RRF also degrades gracefully when a channel is missing — which is our steady state until embeddings exist.

```sql
WITH lex AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(tsv, q) DESC, created_at DESC) AS r
    FROM memories, websearch_to_tsquery('english', $2) q
   WHERE team_id = $1 AND tsv @@ q
   ORDER BY ts_rank_cd(tsv, q) DESC LIMIT 50
), vec AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> $3::vector) AS r
    FROM memories WHERE team_id = $1 AND embedding IS NOT NULL
   ORDER BY embedding <=> $3::vector LIMIT 50
), gra AS (
  SELECT m.id, ROW_NUMBER() OVER (ORDER BY h.depth, m.created_at DESC) AS r
    FROM hop h JOIN memories m ON m.id = ANY (h.evidence_ids)
), fused AS (
  SELECT id, SUM(1.0 / (60 + r)) AS rrf
    FROM (SELECT id, r FROM lex UNION ALL SELECT id, r FROM vec UNION ALL SELECT id, r FROM gra) u
   GROUP BY id
)
SELECT m.*, f.rrf FROM fused f JOIN memories m USING (id)
 WHERE m.supersedes IS NULL OR m.id NOT IN (SELECT supersedes FROM memories WHERE supersedes IS NOT NULL)
 ORDER BY f.rrf DESC LIMIT 20;
```

Order of operations, and why each is where it is:
1. **Candidate pool per channel: 50** (lexical + vector), 25 (fuzzy `pg_trgm`). Beyond ~100/channel, fusion gains saturate while cost doesn't.
2. **Temporal filter before final ranking**: a memory/edge whose `invalid_at` is at-or-before the question's "as of" moment never competes. This is what makes a corrected fact replace rather than argue — the rule `selectMemories` already enforces crudely.
3. **RRF → MMR (λ≈0.5–0.7) → final k.** MMR is the cheap anti-duplication step; without it, five near-identical notes occupy all five slots and the reader sees a wall of repetition.
4. **Keep pin + recency re-scoring *after* fusion.** A pin is an ordinal prior ("this leads regardless"), not a score to normalise into a similarity list. Replace the 90-day linear decay with the documented **exponential** recency from generative-agents (0.995^hours-since-last-use) — and note the correction: that paper combines recency/importance/relevance as a **weighted sum**, not a product. Our current `rank + pin + freshness×0.25` is already additive, so this is a decay-shape change, not a rewrite.
5. **Optional stage-2 rerank, only if it earns its latency.** A cross-encoder (query and doc scored jointly) genuinely beats bi-encoder retrieval. Hosted (Cohere `/v2/rerank`, `rerank-v3.5`; Jina) costs ~200–500 ms on the request path a human is waiting on — and Cohere's public pricing page no longer lists the per-1K-search API rate, so that is **unverified** and would need their dashboard. Local ONNX (`bge-reranker-base`, ~0.28 GB int8) reranking top-50 on a laptop CPU is ~0.8–2 s — too slow to inline, fine async or between requests. **Recommendation: skip the reranker at 13 memories; revisit when recall@5 measurably misses.**

Core-Postgres upgrades that cost nothing and are available today, before any of the above:
- **Store the tsvector in a `GENERATED ALWAYS ... STORED` column** instead of computing `to_tsvector(text)` per row per query. The expression index works, but a stored column makes matching index-only and moves tokenisation to write time.
- **`ts_rank_cd` (cover density) over `ts_rank`** for short passages, and **proximity operators** (`<->`, `<N>`) to boost phrases.
- **`unaccent`** needs an immutable wrapper function to live in a generated column — a real constraint, not a footnote.
- Pin `'english'` explicitly everywhere (the server's `default_text_search_config` is `pg_catalog.english` today; don't rely on it drifting).
- `pg_trgm` GIN (`gin_trgm_ops`) as a third channel for names and typos — installable now with `CREATE EXTENSION pg_trgm`, no binary needed.
- `SET hnsw.iterative_scan = strict_order` when filtering vector results (`WHERE team_id = …`) — with the default `hnsw.ef_search = 40`, filtered queries under-deliver rows.

## 6. Evaluation, because "it feels smarter" is not evidence

Build a **synthetic probe set** of 30–80 queries from the real memories: for each target note, write 2–3 ways a human would actually ask, plus distractor queries that must *not* retrieve it. Then track:
- **recall@5 / recall@10** — does the gold note appear at all;
- **MRR** — how high it landed;
- **nDCG@10** — graded ordering quality;
- per stage: pool size, p50/p95 ms, list length after fusion, **prompt tokens injected** (the honest cost of "more memory" is a bigger context block eating the seat's budget), and the `hits`/`lastUsedAt` columns already on the table as implicit live feedback.
Compare pipeline A vs B with LLM-as-judge pairwise (positions swapped to kill order bias) — cheap, and it needs no labelled corpus.

There is no way to do this on 13 notes. **The precondition for all of this work is a corpus**: seed one org with real channel volume (hundreds of messages, dozens of durable notes) before touching the retrieval stack, or we will be tuning noise.

## 7. Latency and cost, stated plainly

| Stage | Added cost |
| --- | --- |
| Postgres FTS + GIN | 1–10 ms (already in use) |
| pgvector HNSW cosine | ~5–20 ms p99 at 1M×1536 (dbpedia benchmark: p99 5.51 ms, 25 s index build); sub-ms at our scale — figures below 1M row are extrapolation, **unverified here** |
| RRF over three CTEs | a few ms |
| 2-hop recursive CTE | sub-ms at 10³–10⁴ nodes |
| Storage, 1536-dim | `4×1536+8 = 6,152 B`/row → 100k rows ≈ **620 MB** column + ~0.8–1.3 GB HNSW index; must stay RAM-resident (fine on this host, not on `shared_buffers=128MB` alone — the OS cache does it) |
| Remote rerank | +200–500 ms |
| Local ONNX rerank top-50 | +0.5–2 s CPU |
| Write-time extraction | +1–2 counted model calls per memory saved, seconds of write latency, zero read latency |

Realistic read path if we build sections 4–5 without a reranker: **+~20–30 ms**. With Cohere: **+300–700 ms**. The write path is where the money and the latency actually go.

## 8. What the UI may claim after each stage (the honesty contract applies)

| Stage | Allowed wording | Forbidden wording |
| --- | --- | --- |
| Today | "keyword memory" | anything implying understanding |
| + pgvector + embeddings | "semantic (vector) recall", "meaning, not just words" | "graph memory" |
| + entities/edges + 2-hop | "entity and relation graph with temporal invalidation, 2-hop recall", "LLM-inferred, reviewable" | "unlimited hops", "global reasoning over your org", "it understands your organisation" |
| + community summaries | "thematic summaries" | still not "unlimited hops" |
| + pg_search/BM25 (Docker only) | "true BM25 ranking" | — |

Every stage above writes rows the human can read and delete. Extraction is the one new place where a wrong machine-guess becomes an authoritative-looking line in a prompt, so an extracted edge needs the same review shape `org_proposal` / `routine_proposal` / memory-distil already use: **propose, human confirms, nothing lands silently.**

## 9. Sequenced plan (each step independently valuable, each reversible)

0. **Prerequisite, no code:** seed one org with real channel volume. Without it nothing below is measurable.
1. **Zero-install wins:** generated `tsvector` column, `ts_rank_cd`, `CREATE EXTENSION pg_trgm`, pin `'english'`, iterative scan awareness. Pure SQL + `drizzle-kit push` to a DB this project owns.
2. **Install pgvector** (Route A or B, your call — Section 1). Nothing works differently until step 3; this is inert.
3. **Embeddings path in the gateway** + `<NAME>_EMBED_MODEL`, with honest degradation. Then: `embedding` column, backfill script, HNSW index, two-channel RRF. First day this is *provably* better or it's reverted.
4. **Graph:** `memory_entities` + `memory_edges` with bi-temporal fields, extraction as a **proposal** flow, 2-hop CTE as a third RRF channel, contradiction → `invalid_at` instead of `supersedes`.
5. **Evaluate** on the probe set; add the reranker only if recall@5 still misses.

Rejected as the shape of this work, with reasons: **Graphiti** (proven quality, but Python-only with Neo4j/FalkorDB backends and TS SDKs exist only for the paid Zep platform — it is a sidecar service, not a library); **Mem0 graph memory** (its docs now say Neo4j/Memgraph/Kuzu/AGE/Neptune backends are *discontinued*, and its own graph memory "does not assign typed, labeled relationships" — co-occurrence links only, which is not a graph in the sense that answers a two-hop question); **Microsoft GraphRAG** (README says largely maintenance mode, batch corpus indexing, LLM-expensive, wrong tool for conversational agent memory); **LightRAG** (document QA, default storage "not for production"); **Kuzu** (abandoned upstream); **waiting for SQL/PGQ** (PG19, GA planned 2026-10-29 — worth revisiting, not worth blocking on).

## 10. Decisions that are yours, and I will not make them

1. **Binary from a stranger, or install a compiler?** Route A vs B. Real trade-off: 5 minutes vs an auditable build.
2. **Embeddings: paid-but-already-configured OpenAI, or free-but-new Ollama?** OpenAI ships today and sends org text off the machine; Ollama keeps it local and adds a daemon plus a 274 MB pull.
3. **Does `dahl` get probed for `/v1/embeddings`?** One request; unknown until tried; MiniMax `embo-01` current availability/price/dims unverified.
4. **Docker as the permanent Postgres**, if AGE/BM25 ever become real requirements — it is the only way to have either on this host, and it means a migration.
5. **Extraction spend:** every saved memory costs 1–2 counted model calls against a 60/day budget. Opt-in like distillation, or automatic?
6. **Budget for the context block:** graph recall injects *more* text than keyword recall. k=3/900 chars today; how much of each seat's context does memory get to take?

## Unverified, explicitly

BigSQL Windows PG18 pgvector module (repo unreachable); EDB Stack Builder's pgvector listing; Neon/Supabase exact PG18 pgvector versions; **VectorChord on native Windows PG18.3**; `inference.dahl.global/v1/embeddings` existence and MiniMax `embo-01` current terms; Cohere's per-1K-search rerank API price (no longer public); Cohere embed-v4 dimension list and Jina's free token grant; OpenAI's embeddings input-array cap; whether Graphiti's `temporal_order` reranker exists in current code; all local ONNX throughput and any latency figure not from a cited benchmark; pgvector index-size multiplier (empirical); the community zip's exact contents (I verified the asset name, size and date, not the files inside it — hence the `Get-ChildItem` gate before copying in Route A).

# PART TWO — Neo4j and the four memory tiers (second research pass, 2026-10-01)

Five research threads ran on this: Neo4j platform/install, Neo4j retrieval capabilities, Node/TS integration, the alternatives comparison, and the tier model. Every claim below that decides an action is either measured on this host or quoted from a vendor primary source I re-fetched.

## 11. Neo4j: evaluated, and declined for now

### 11.1 Install is real, and more available than expected

Native Windows is **not** deprecated. The current line is **2026.09**, with **5.26 LTS** and **4.4** also documented; Windows 11 is listed as a verified development OS, and the deprecation notice on that page covers *Windows Server 2022* and macOS 13/14 — not desktop Windows. Both zips verified live (HTTP 200, real sizes):

```
https://dist.neo4j.org/neo4j-community-2026.09.0-windows.zip   262.1 MB
https://dist.neo4j.org/neo4j-community-5.26.31-windows.zip     158.0 MB   (LTS line)
```

**Java 21 is the precondition** (Adoptium API-verified asset `OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip`, ~195 MB, via `https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse`). The matrix is `5.x → Java SE 17`, `2025.01 → Java SE 21` (Java 17 dropped), `2025.10 → Java SE 21 and 25`. **These are not interchangeable**: a JDK 17 bought for 5.26 will not run 2026.09.

Route, if adopted (this box has 21.9 GB free RAM, so memory is not the argument):

```powershell
# 1. JDK 21 → unzip to C:\Java, then:  setx JAVA_HOME "C:\Java\jdk-21.0.12.1+1"
# 2. Neo4j Community 2026.09.0
New-Item -ItemType Directory -Force C:\Neo4j,C:\Neo4jDl | Out-Null
curl.exe -sL --ssl-no-revoke -o C:\Neo4jDl\n.zip https://dist.neo4j.org/neo4j-community-2026.09.0-windows.zip
Expand-Archive C:\Neo4jDl\n.zip -DestinationPath C:\Neo4j -Force
# 3. conf\neo4j.conf — native form is dotted keys, NOT the Docker double-underscore env form
#    server.memory.heap.initial_size=512m
#    server.memory.heap.max_size=1024m
#    server.memory.pagecache.size=512m
#    server.default_listen_address=127.0.0.1
# 4. auth bootstrap BEFORE first start, else you are prompted to change the default at first login
& C:\Neo4j\neo4j-community-2026.09.0\bin\neo4j-admin.exe dbms set-initial-password '<strong pw>'
# 5. dev:  bin\neo4j.exe console      long-lived (admin):  bin\neo4j.exe windows-service install
```
Drivers: `bolt://localhost:7687`, Browser at `http://localhost:7474`, data in `C:\Neo4j\neo4j-community-2026.09.0\data`. Heap 512 MB–1 GB + pagecache 512 MB is ample at 10⁴ nodes / 10⁵ rels (pagecache guidance is ≈1.2 × store size); expect ~1–1.5 GB RSS. Community is GPLv3, single instance, and — relevant, not fatal — talking to it over Bolt is arm's-length aggregation, so no derivative-work obligation attaches to the Next.js app ([FSF GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html): *"pipes, sockets and command-line arguments are communication mechanisms normally used between two separate programs"*); Neo4j Community is GPL, **not** AGPL, so there is no network copyleft clause. Not legal advice.

Two corrections to what I said earlier in this session: the Docker tag convention is the **opposite** of what I stated — *"Community releases omit a suffix entirely… Enterprise appends `-enterprise`"*, so `neo4j:2026.09.0` **is** Community — and on Docker you must set heap and pagecache explicitly because *"the default memory assignments to Neo4j are very limited… to allow multiple containers."* Git Bash rewrites mount args ([MSYS2](https://www.msys2.org/wiki/Porting/)), so use named volumes and `MSYS2_ARG_CONV_EXCL='*'`.

Managed alternative: **AuraDB Free is $0 with up to 200k nodes / 400k relationships, a single database** — but *"Free-tier databases without activity for 30 days are deleted"* and it is framed as *"ideal for learning or prototyping."* Paid tiers: Professional $65/GB/month, Business Critical $146/GB/month.

### 11.2 Why it was declined — four reasons, in order of weight

1. **Org isolation gets weaker, and that is the product's one absolute rule.** Community verifiably lacks multi-database, RBAC, property-based access control, sub-graph access control and online backup ([ops manual](https://neo4j.com/docs/operations-manual/current/introduction/)). So *"one org's memory must never reach another org's context"* moves from a Postgres `CHECK` + `NOT NULL` + FK the engine enforces, to `WHERE m.teamId = $teamId` in **every** Cypher query, forever. This is not theoretical: **LangGraph's JS store shipped exactly this class of bug** — namespace matching by raw string prefix with no segment boundary, so *"a read scoped to one namespace could return items belonging to another"* ([langgraphjs #2721](https://github.com/langchain-ai/langgraphjs/issues/2721); Python fixed in 3.1.1).
2. **Read-your-own-write breaks, which is fatal for a memory feature.** Verified from the vector-index docs: *"Changes made within the same transaction are not visible to the index"* and *"An index cannot be used while its state is POPULATING."* Save a note, immediately ask a question that needs it → the ANN path can't see it. Postgres in-table vectors answer from the same transaction that wrote them.
3. **The default vector index silently loses recall.** Verified defaults: `vector.quantization.enabled = "true"`, `vector.quantization.type = "binary"`. Binary quantisation without a re-rank step is a real accuracy trade, and the docs also warn ANN *"may retrieve fewer than k results."* You must opt out (`'none'` or `'scalar'`) deliberately — a default that quietly degrades retrieval is the worst kind of default.
4. **Two servers, two of everything.** A second stateful service with its own auth model, its own backup story (Community dump/load *"can be run only on an offline Neo4j DBMS"* — downtime-only), store-format upgrade risk across 5.x→2026.x, and tests that can no longer run without a daemon — which breaks this repo's `node --test` discipline. Cross-version dump on Community is itself **unverified** (the `block` format default is documented as Enterprise-only, which makes a Community dump suspect until tested).

And the honest framing of the performance argument: the "Neo4j is orders of magnitude faster than Postgres" corpus is **largely vendor-authored** (Neo4j's own blog; PuppyGraph is a competing vendor). Independent work puts the crossover at **tens of thousands of edges with deep or unbounded hops**. At 13 memories, bounded 2-hop, the crossover is not merely unmeasured — **it is unmeasurable**, and no Neo4j traversal latency at 10⁴ nodes exists in published form to claim otherwise.

### 11.3 What Neo4j genuinely has that Postgres doesn't (recorded, because it's the revisit trigger)

One real capability I could not give any other way: **in-index pre-filtering on the vector search** — `CREATE VECTOR INDEX … WITH [e.teamId]` then `WHERE` inside the `SEARCH` clause (GA in the 2026.01 line). **pgvector cannot pre-filter**; it post-filters and under-delivers rows unless you set `hnsw.iterative_scan`. At 10⁵+ memories with a selective `team_id` filter that is a genuine difference. Also: no hybrid procedure exists — *"Hybrid search is a retrieval pattern, not a separate index type"*, and Neo4j's own guide fuses with weighted RRF (`weight / (rrfConstant + sourceRank)`) across **separate** executions merged with `UNION ALL`; a single `SEARCH` block cannot mix vector and fulltext sources. `db.index.hybridsearch` / `dbms.util.rerank.reciprocalRank` do **not** appear in any fetched doc — treat them as nonexistent, not as unverified.

Full text is Lucene (`db.index.fulltext.queryNodes`, unbounded score, docs never call it BM25). For 240-char notes, **`ts_rank_cd` cover-density is arguably better documented** than Neo4j's opaque Lucene score, since it weighs lexeme proximity explicitly.

Revisit triggers, written down so the future decision is evidence-led: (a) filtered-vector recall measurably under-delivering at >10⁵ memories; (b) a hop-3+ query actually required by a user; (c) `WITH RECURSIVE` traversal measured slow on real data; (d) Postgres 20 with SQL/PGQ, if it ever re-lands — **and note PG19 does not have it**: the commit was rolled back before release ([depesz](https://www.depesz.com/2026-07-31/waiting-for-postgresql-19-sql-property-graph-queries-sql-pgq/)), and the reverted version had no variable-length paths or graph algorithms anyway.

### 11.4 Integration shape, if it ever happens (so the door stays cheap to open)

Dependencies we would actually add: `neo4j-driver@6.2.0` (Apache-2.0, `engines >=18`) — the only supported Bolt client; `@neo4j/cypher-builder@3.3.0` (Apache-2.0, zero deps, `>=20`, emits `{cypher, params}`) because it makes Cypher **testable as a pure function** under `node --test`; dev-only `@testcontainers/neo4j@12.2.0` (MIT) when Docker exists. Rejected, with registry evidence: `neode@0.4.9` and `neo4j-ogm@1.0.0-dev.2` were both last touched **2023-02** and the latter is *not* the official OGM (that's Java, Maven `org.neo4j`); `reactive-graph` is from 2016; `neo4j-graphql-js` is deprecated; `@neo4j-labs/agent-memory@0.5.0` is **Beta and a client for Neo4j's hosted memory service** (`MEMORY_API_KEY`), i.e. org text off-server; `@langchain/neo4j@0.1.23` ships `Neo4jVectorStore` but drags a framework we don't use. **Drizzle has no Neo4j dialect** — pg-core only.

Architecture if adopted: **derived projection only** — Postgres stays the system of record, every node keys on the source uuid via `MERGE`, graph is wipe-and-replayable, a `graph_sync_state` cursor makes backfill resumable, `UNWIND $batch` at a few hundred rows/txn (the offline `neo4j-admin import` is overkill at 872 messages). Dual-write is disqualified: no distributed transaction means either a committed-Postgres write 500s because the graph was down, or you swallow it and the graph silently rots while the UI still says "graph memory". Kafka CDC is unavailable to us — CDC is Enterprise/Aura-Enterprise only, and Postgres→Neo4j would need Debezium + broker + Connect worker on a host with no worker at all. Two Next.js traps to note: a module-level `new Driver()` **leaks a connection pool per HMR re-evaluation** ([vercel/next.js #26427](https://github.com/vercel/next.js/discussions/26427)) — cache on `globalThis` in dev — and per-request sessions must close in `finally` against `maxConnectionPoolSize = 100`.

## 12. The four tiers you asked for — and what the code actually does today

Three measured facts from `src/db/schema.ts:29-35`, `src/lib/memory.ts`, and `src/app/api/board/route.ts:366-370`, read before designing anything:

1. **No global tier exists, by design.** `memories.team_id` is **NOT NULL** and its own comment says "Scoped to a team and never global."
2. **Per-seat memory does not exist.** `memories.agent_id` is **authorship, not visibility** — `recallMemories` filters only `workspaceId AND teamId`, so a seat-authored note is already org-wide. Nothing reads per-seat. This tier must be *built*, not switched on.
3. **The exactly-one-subject pattern already has precedent**: `messages` carries `CHECK ((agent_id IS NOT NULL) <> (team_id IS NOT NULL))`.

| Their words | Taxonomy equivalent | Reads | Writes | Promotes to | TTL | Needs a graph? |
| --- | --- | --- | --- | --- | --- | --- |
| **Global** | semantic + procedural (Tulving; CoALA "knowledge about the world and itself") | every seat in **this workspace** | **human only** — never a model call | — | none; decay-scored | **No.** It's a list. MemGPT core blocks are fixed-size text, not edges |
| **Organisation** | semantic (`decision`/`glossary` ≈ Zep's entity+relation tier) | seats of that org | seat via `save_note`, human | global, via review | 90-day decay today | **Optional** — this is the *only* tier where typed edges pay |
| **Run / task** | working + episodic (CoALA "persists across LLM calls"; MemGPT main vs recall context) | only that run's seat | auto per turn | org, distilled at run close | hard: run close + 7 days | **No.** Sequential, short-lived — a graph is overkill |
| **Agent / seat** | semantic persona + procedural preferences | **that seat only** | that seat, self-edited | org, via proposal | until seat deleted | **Marginal.** The one real edge, "reports to", already exists as `agents.manager_id` |

Vendor reality, graded honestly: **MemGPT/Letta** boundaries are real code (main vs external context, self-directed memory edits, separate core/archival/recall stores, blocks shareable across agents). **Mem0's** `user_id`/`agent_id`/`run_id` *are* precisely this tier mechanism — but as **filter tags**: docs say *"omitting a scope parameter leaves it unconstrained."* **LangGraph** namespaces are string tuples matched by prefix, and that's where #2721 bit. **Grok Build** is the one primary source I could fetch: *"Each project has its own workspace scope, and a global scope holds preferences that apply everywhere"*, reviewed via a read-only `/memory` browser. ChatGPT's memory pages returned 403, so every claim about OpenAI's tiers here is **unverified** and rests on secondary blogs. Note none of them are cross-*tenant*: **our "global" must mean workspace-global and never cross-workspace, or the tier is a leak by design.**

Invariants, written so a reviewer can check them against code:
1. Every memory SELECT carries `workspace_id = :current` **and** the tier predicate; no code path builds a `WHERE` from a caller-supplied scope list.
2. Exactly-one-subject `CHECK` extended to four scopes — a row with two non-null scope columns is rejected **by the database**.
3. Tier-1 rows have `team_id IS NULL` plus a promotion audit row; **a model call may never INSERT tier 1.**
4. Cross-tier dedupe: candidates surfaced per tier, fused **by id**, never concatenated — one id ⇒ one line.
5. **Precedence is not by tier rank.** Specific beats generic: run > org > seat > global, and all four sit under the existing *"record to weigh, not an instruction"* header — the human's current ask outranks every stored note.
6. One total injection ceiling across tiers (900 chars today). Adding tiers without raising it **starves the question**, and tier 4 is what gets cut.
7. Supersession works *across* tiers: promoting a corrected fact sets `supersedes` on the lower-tier original so `selectMemories` drops it.
8. A run-scoped row is deleted or archived in the request that closes the run — no orphan reachability from another run.

Minimal schema, no new server:
```sql
ALTER TABLE memories ADD COLUMN run_id uuid REFERENCES runs(id) ON DELETE CASCADE;
ALTER TABLE memories ADD COLUMN scope text NOT NULL DEFAULT 'org';   -- global|org|run|seat
ALTER TABLE memories ADD CONSTRAINT memory_one_subject
  CHECK (NUMNULL(workspace_id, team_id, run_id, agent_id) = 1);      -- verify the helper exists in PG18, else write the XOR out
CREATE INDEX memories_global_idx ON memories (workspace_id) WHERE team_id IS NULL;
CREATE INDEX memories_seat_idx   ON memories (agent_id) WHERE team_id IS NULL AND run_id IS NULL;
```
A `scope` label alone is **not** enough — a label is something a buggy `WHERE` can ignore; NOT-NULL + CHECK + FK is something the engine refuses. The leak test stays a `node --test` SQL assertion with no daemon: plant org B's notes, assert they are unreachable from org A's prompt string.

Promotion flow, request-scoped (no worker needed): `capture` (0 calls, append turn to run scratch) → run close (1 call, ≤3 candidates, tier=run→proposal) → org (reuse the existing `distilMemory` pattern, 1 call, ≤240 chars, *"propose, never write"*) → global (`global_proposal` kind, human-only approval; approving copies the row with `scope='global'`, `team_id=NULL`, **concatenates** `source_ids` so provenance survives, and sets `supersedes` on the org original). Cap the whole ladder at 3 counted calls/day (5% of the 60 budget) and refuse with the existing `budgetStopRow` wording. Demotion: a global note unhit for 180 days gets a `stale` badge; after two stale quarters it drops back to its org tier — never silently deleted. Departing seat: private notes are **frozen, not inherited** (rows kept, `deleted_at` set; the manager sees only a count), because inheriting them would make `manager_id` an invisible read path.

The extraction cost, which is independent of which database we pick: **Graphiti's own pipeline runs 5 sequential LLM stages per episode** (extract nodes → resolve nodes → extract+resolve edges → attributes/summaries batched at `MAX_NODES = 30` → episode linking), with cosine candidate dedup capped at `NODE_DEDUP_CANDIDATE_LIMIT = 15` (read from `graphiti_core/nodes.py` / `edges.py` / `graphiti.py`). Graph memory is expensive **at write time**, in model calls, whatever stores it — that is the real budget question, not traversal.

## 13. What happens next, in order

0. Seed one org with real channel volume (a few hundred messages, dozens of durable notes). Nothing below is measurable without it, and this is the only step that is genuinely blocking.
1. Tier columns + `scope` + the exactly-one-subject CHECK + per-tier indexes + the leak test. Zero install, no new dependency.
2. Zero-install retrieval wins: `GENERATED ALWAYS … STORED` tsvector, `ts_rank_cd`, `CREATE EXTENSION pg_trgm`.
3. pgvector (Route A or B — your install), embeddings in the gateway, two-channel RRF.
4. `memory_entities` / `memory_edges` (§4) with bi-temporal validity as a third RRF channel, extraction landing as reviewable proposals.
5. Neo4j only if a §11.3 trigger is measured, and then only as a §11.4 derived projection.

## 14. Unverified (second pass)

2026.x end-of-support dates (vendor page unreachable; third-party endoflife.date shows 5.26 LTS → 2028-06-06 with every 2025.x minor already EOL — the calendar line churns about six weeks); whether a `2026.LTS` ships; the exact `set-initial-password` subcommand form on 2026.09 (5.x used `dbms`); Community 5.26 accepting Java 21 (matrix says 17); cross-version dump/load 5.x→2026.x on Community; Neo4j's own GPL FAQ position (page 404'd); Aura Free storage cap and commercial-use permission; Docker Desktop's resident RAM; cold-start time; extracted zip size (~500 MB+ unmeasured); `cjk` fulltext analyser and nested analyser options; the oft-cited 15-hop variable-length default; `apoc.coll.*` fusion helpers; `NEXT_EVENT`/`NEXT_CHUNK` labels in current Graphiti; any published Neo4j traversal latency at our scale; ChatGPT memory/project tiering (403, secondary sources only); consumer Grok cross-chat memory scope (only Grok Build's page was primary); `NUMNULL` availability in this PG18 build; whether a run-scoped tier earns its index cost at 13 rows (it does not, yet).

## Sources

pgvector: [README](https://github.com/pgvector/pgvector) · [CHANGELOG](https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md) · [Makefile.win](https://github.com/pgvector/pgvector/blob/master/Makefile.win) · [issue #870 Windows build errors](https://github.com/pgvector/pgvector/issues/870) · [Docker Hub tags](https://hub.docker.com/r/pgvector/pgvector/tags) · [community Windows builds](https://github.com/andreiramani/pgvector_pgsql_windows/releases) · [0.8.0 announcement](https://www.postgresql.org/about/news/pgvector-080-released-2952/) · [150× HNSW benchmark at 1M×1536](https://jkatz05.com/post/postgres/pgvector-performance-150x-speedup/)
Graph: [apache/age README](https://github.com/apache/age) · [AGE release notes](https://age.apache.org/release-notes/) · [AGE PG18 issue #2229](https://github.com/apache/age/issues/2229) · [Cognee: Just Postgres](https://www.cognee.ai/graph-on-postgres) · [Cognee 1.0](https://www.cognee.ai/newsroom/cognee-1-0-is-live) · [SQL/PGQ in Postgres](https://www.enterprisedb.com/blog/representing-graphs-postgresql-sqlpgq) · [PG19 open items](https://wiki.postgresql.org/wiki/PostgreSQL_19_Open_Items) · [Kuzu abandoned](https://www.theregister.com/software/2025-10-14/kuzudb-graph-database-abandoned-community-mulls-options/)
Memory systems: [Graphiti / Zep paper](https://arxiv.org/html/2501.13956v1) · [Graphiti repo](https://github.com/getzep/graphiti) · [Zep searching docs](https://help.getzep.com/graphiti/working-with-data/searching) · [Mem0 graph memory](https://docs.mem0.ai/features/graph-memory) · [MemGPT](https://arxiv.org/abs/2310.08560) · [Generative Agents](https://arxiv.org/abs/2304.03442) · [Neo4j agent-memory TS SDK](https://neo4j.com/labs/agent-memory/sdks/typescript/)
Ranking: [Postgres FTS docs](https://www.postgresql.org/docs/current/textsearch-controls.html) · [ParadeDB](https://github.com/paradedb/paradedb) · [VectorChord install](https://docs.vectorchord.ai/vectorchord/getting-started/installation.html) · [pgvectorscale](https://github.com/timescale/pgvectorscale) · [Cohere pricing](https://cohere.com/pricing) · [Jina reranker](https://jina.ai/reranker/) · [bge-reranker](https://huggingface.co/BAAI/bge-reranker-large)
Embeddings: [OpenAI pricing](https://developers.openai.com/api/docs/pricing) · [OpenAI embeddings guide](https://developers.openai.com/api/docs/guides/embeddings) · [xAI models](https://docs.x.ai/developers/models) · [MongoDB acquires Voyage](https://investors.mongodb.com/news-releases/news-release-details/mongodb-announces-acquisition-voyage-ai-enable-organizations/) · [Voyage pricing](https://docs.voyageai.com/pricing) · [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility) · [nomic-embed-text](https://ollama.com/library/nomic-embed-text) · [fastembed-js](https://github.com/Anush008/fastembed-js) · [Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings)
