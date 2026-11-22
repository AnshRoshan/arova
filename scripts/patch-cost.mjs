import { readFileSync, writeFileSync } from "node:fs";

// ── schema: runs carry stamped tokens ──
let s = readFileSync("src/db/schema.ts", "utf8");
const runsAnchor = `  initiator: text("initiator").notNull().default("person"), idempotencyKey: text("idempotency_key"), startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(), completedAt: timestamp("completed_at", { withTimezone: true }) }, t => [uniqueIndex("runs_idempotency_unique").on(t.workspaceId, t.idempotencyKey), index("runs_workspace_started_index").on(t.workspaceId, t.startedAt), index("runs_status_started_index").on(t.status, t.startedAt)]);`;
if (!s.includes(runsAnchor)) { console.log("RUNS ANCHOR NOT FOUND"); process.exit(1); }
s = s.replace(runsAnchor, `  initiator: text("initiator").notNull().default("person"), idempotencyKey: text("idempotency_key"),
  /** Spec 46 — the tokens this run actually spent, stamped by its runner where they are known.
   * Null means the runner does not know (a brief's calls are per-hop); cost is derivable from
   * these plus the pricing env, and "unpriced" is a state, never $0. */
  inputTokens: integer("input_tokens"), outputTokens: integer("output_tokens"), startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(), completedAt: timestamp("completed_at", { withTimezone: true }) }, t => [uniqueIndex("runs_idempotency_unique").on(t.workspaceId, t.idempotencyKey), index("runs_workspace_started_index").on(t.workspaceId, t.startedAt), index("runs_status_started_index").on(t.status, t.startedAt)]);`);
writeFileSync("src/db/schema.ts", s);
console.log("runs tokens columns added");

// ── routine-runner: stamp the run ──
let r = readFileSync("src/lib/routine-runner.ts", "utf8");
const stampAnchor = `    const counted = usageFromJson(body);
    await recordUsage(workspaceId, profile.name, counted?.input ?? estimateTokens(task), counted?.output ?? estimateTokens(answer), Boolean(counted));`;
if (!r.includes(stampAnchor)) { console.log("ROUTINE ANCHOR NOT FOUND"); process.exit(1); }
r = r.replace(stampAnchor, stampAnchor + `
    // Spec 46 — the run carries its own tokens, so cost is derivable from stored rows alone.
    await db.update(runs).set({ inputTokens: counted?.input ?? estimateTokens(task), outputTokens: counted?.output ?? estimateTokens(answer) }).where(eq(runs.id, run.id));`);
writeFileSync("src/lib/routine-runner.ts", r);
console.log("routine runner stamps tokens");

// ── payload: priced usage ──
let p = readFileSync("src/lib/board-payload.ts", "utf8");
p = p.replace(
  'import { maxDelegations } from "@/lib/board-core";',
  'import { maxDelegations } from "@/lib/board-core";\nimport { costUsd, parsePricing } from "@/lib/cost";'
);
p = p.replace(
  '    limits: { dailyModelCalls: dailyCallLimit(), usage, maxDelegations: maxDelegations() },',
  `    // Spec 46 — the usage rows priced where the env declares a price; unpriced providers carry
    // null, and the UI says so instead of implying free work.
    limits: (() => {
      const prices = parsePricing(process.env);
      return {
        dailyModelCalls: dailyCallLimit(),
        usage: usage.map(u => ({ ...u, costUsd: costUsd(prices, u.provider, u.inputTokens, u.outputTokens) })),
        todayCostUsd: usage.reduce((sum, u) => sum + (costUsd(prices, u.provider, u.inputTokens, u.outputTokens) ?? 0), 0),
        pricingConfigured: usage.every(u => costUsd(prices, u.provider, u.inputTokens, u.outputTokens) !== null),
        maxDelegations: maxDelegations(),
      };
    })(),`
);
writeFileSync("src/lib/board-payload.ts", p);
console.log("payload costs added");

// ── page.tsx: Usage type + cost display in Settings limits ──
let g = readFileSync("src/app/page.tsx", "utf8");
g = g.replace(
  "type Usage = { provider: string; calls: number; inputTokens: number; outputTokens: number; estimated: boolean };",
  "type Usage = { provider: string; calls: number; inputTokens: number; outputTokens: number; estimated: boolean; costUsd?: number | null };"
);
g = g.replace(
  "  limits: { dailyModelCalls: number; usage: Usage[]; maxDelegations: number };",
  "  limits: { dailyModelCalls: number; usage: Usage[]; todayCostUsd: number; pricingConfigured: boolean; maxDelegations: number };"
);
writeFileSync("src/app/page.tsx", g);
console.log("usage types updated");

// ── .env.example: pricing vars ──
let e = readFileSync(".env.example", "utf8");
e += `
# ── Cost attribution (spec 46) ────────────────────────────────────────────────
# Dollars per million tokens, both sides required for a provider to be priced.
# Providers without a pair show "unpriced", never $0.
# XAI_PRICE_IN=3
# XAI_PRICE_OUT=15
# OPENAI_PRICE_IN=2.5
# OPENAI_PRICE_OUT=10
`;
writeFileSync(".env.example", e);
console.log("env pricing documented");
