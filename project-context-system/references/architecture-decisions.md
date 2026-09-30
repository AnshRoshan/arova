# Architecture Decision Discipline

How senior engineers think, converted into agent behavior. The transcript's framing: "Building the thing was never the hard part. The hard part is what happens when the app you built gets popular."

## The break-it loop (default design method)
"We start with one server and one database. Then we break it. On purpose, over and over. And every time it breaks, we fix exactly one thing. So that by the end, you'll have built the whole system and you'll know why every piece is there and what it costs to add it."
- Baseline: the simplest architecture that serves thousands, not dozens. "Most applications will never need to look like anything else. That is not a failure." A cheap server handles hundreds of requests a second.
- Stress each design against a concrete scenario ("a big show goes on sale; thousands arrive at the exact same moment").
- Change exactly one thing per break. Annotate every component with *why it exists* and *what it costs*.
- Diagnose structural causes before touching code: "Nothing is wrong with your code. No bad queries, no bugs. The problem is simpler than that" (queue pileup, shared bottleneck).

## The cost ritual
"Everything we add from here has a cost." Every decision record names its cost in these categories:
1. **New moving part / single point of failure** - the load balancer itself needs a backup; if the shared session store dies, "nobody can be logged in at all"; queue + worker = "two more things to run".
2. **Per-request latency tax** - a shared session store adds time "to every single request".
3. **Correctness given up** - replication lag "quietly makes your app a little wrong"; cache copies "can go out of date".
4. **Reversibility cost** - sharding: "going back is its own painful migration."

## Escalation ladder (the default decision order)
1. **Vertical before horizontal.** "If a bigger server fixes your problem, buy the bigger server and get back to work." But "a bigger box buys you time, it doesn't buy you forever."
2. **Free checks before clever ones.** "Are your common queries actually using indexes? That one missing index looks exactly like a capacity problem, which it is not. Check that one first, as it is free."
3. **Reads before writes.** "Reads massively outnumber the writes" → replicas and caches off the read path first.
4. **Queue before new infra.** Split the request: "creating the account is the only part the user actually needs to happen before you answer them." Server: "answer the user fast and drop the slow work onto the queue." Worker: "quietly chew through that work in the background."
5. **Sharding strictly last.** "The most powerful tool and still the one you reach for last by a long way. Teams put it off for years and they are right to. You do it only when the data simply will not fit any other way." Choosing the split-key is itself a major decision: "pick well and almost every query stays on one shard; pick badly and you have built something slower than what you started with."

## Reuse one technology across roles
Redis for sessions + cache + queue: "Three jobs now in a single piece of technology. You didn't add a whole new system to your stack."

## Boundary rules for writing code
- **Statelessness:** "The servers are not allowed to remember anything about you between requests. No server keeps a note in its own memory. Instead, the note goes somewhere all of them can reach." Any component behind a load balancer keeps zero per-user state in-process.
- **Horizontal scale ≠ service decomposition:** three identical copies of the same app, not "one server for payments, one for messaging". "You ship it once, you tell your platform to run three instances." Don't split modules into services to fix capacity.
- **Interchangeability precondition:** for a load balancer to send any request to any server, all servers must be interchangeable.
- **Don't couple the user path to external availability:** "your sign-up is only as fast as that email service; if it's down, your sign-up fails too. That is a bad thing to tie together."
- **Async contract semantics:** "done now means we have promised to do this, not this is finished."
- **Background job failure plan:** retry in a minute; if it keeps failing, park it where a human looks. Retries + dead-letter + review.
- **Cache-aside flow standard:** check cache → hit: return; miss: fetch, populate on the way back. Invalidation is "genuinely one of the harder problems."
- **Connection pooling:** the pool sits between servers and the DB; the DB "only ever sees that small fixed number of connections."

## The correctness policy (headline lesson)
"You just made your app faster and slightly wrong on purpose. And you chose which parts are allowed to be slightly wrong and which parts are not."
- "A follower count that is 30 seconds out of date: cache it hard. The balance in somebody's bank account can never be even slightly out of date. You do not cache that. Ever."
- Per field, ask and record: is it cacheable? can it tolerate lag? must it read from primary (the "see your own post immediately" case)?
- "This is not a coding decision... you can outsource the typing, but not the decision-making." The agent **presents** these choices to the human, never silently picks.

## Concrete numbers and named tools (anchor values for decision records)
- Connection pools: a Postgres box tolerates a few hundred connections, sometimes only a few dozen; serverless multipliers make naive apps spike into the thousands. Standard fix: a pooler (PgBouncer-style) between servers and DB.
- Load balancer: Nginx-style; queue/worker: BullMQ-style; cache/sessions/queue in one Redis.
- Sharding mechanics: shard by modulo of a numeric key or hashed UUID; "avoiding cross-shard queries is the whole art" of choosing the key. Real-world ceiling: Notion sharded past 200 billion rows while the product stayed alive.
- Ops gotchas from the field: AI calls over ~60s time out in serverless API routes (move to background jobs); local background workers must run alongside dev or tasks queue forever; a stale lockfile can break deploy installs (delete it, reinstall); swap dev→prod vendor keys before deploy.

## Diagram habit
Maintain one evolving architecture diagram; add one box per fix; end with a walkthrough re-narrating each problem→fix pair. Record recognizable failure signatures per component ("the symptom isn't slowness, it is errors - database connection errors right at the moment things were going well").

## Defaults to encode in workflow-rules.md
Start with a monolith. Relational database by default. Paginate every list. Rate-limit every public endpoint. Never keep secrets in code. "Not the boxes, but the order and the trades we make" - "anyone can name these things; the one who gets hired says why they would pick one over the other and what it costs."

## Value-source gate (pre-build check)
"For every single value the feature has to show or compute - a total, a date, a status - name where that value comes from. Anything without a real source is a decision that nobody made." Before implementing, list every output value and its source from the plan; any value with no source stops the build and goes back to the human. Overriding is allowed, but the assumption gets flagged in writing (see recording-workflows.md).
