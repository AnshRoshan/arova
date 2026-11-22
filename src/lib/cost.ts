/**
 * Spec 46 — cost attribution's pure half. Pricing arrives per provider as env
 * (`<NAME>_PRICE_IN` / `<NAME>_PRICE_OUT`, dollars per million tokens, both required for a
 * provider to be priced); the math turns stored token counts into dollars. Unpriced is a state,
 * not a zero: the UI must say "unpriced" rather than imply the work was free.
 */

export type PriceTable = Record<string, { inPerM: number; outPerM: number }>;

/** `PROVIDERS` names the configured vendors; built-ins ride along. Keys are the provider's lowercase name. */
export function parsePricing(env: Record<string, string | undefined>): PriceTable {
  const names = new Set<string>([
    ...(env.PROVIDERS ?? "").split(/[\s,]+/).filter(Boolean).map(n => n.toLowerCase()),
    "xai", "openai",
  ]);
  const prices: PriceTable = {};
  for (const name of names) {
    const key = name.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const inPerM = Number(env[`${key}_PRICE_IN`]);
    const outPerM = Number(env[`${key}_PRICE_OUT`]);
    if (Number.isFinite(inPerM) && inPerM >= 0 && Number.isFinite(outPerM) && outPerM >= 0) {
      prices[name] = { inPerM, outPerM };
    }
  }
  return prices;
}

/** Dollars for one row of usage, or null when the provider carries no pricing — never $0. */
export function costUsd(prices: PriceTable, provider: string, inputTokens: number, outputTokens: number): number | null {
  const price = prices[provider.toLowerCase()];
  if (!price) return null;
  return (inputTokens / 1_000_000) * price.inPerM + (outputTokens / 1_000_000) * price.outPerM;
}

/** A run's cost from stamped tokens, using the seat's provider. Null when either side is unknown. */
export function runCost(prices: PriceTable, provider: string | null | undefined, inputTokens: number | null, outputTokens: number | null): number | null {
  if (!provider || inputTokens === null || outputTokens === null) return null;
  return costUsd(prices, provider, inputTokens, outputTokens);
}

/** "12.4¢" / "$1.31" — a readable figure for a card, honest about smallness. */
export function formatUsd(usd: number): string {
  if (usd < 1) return `${Math.round(usd * 1000) / 10}¢`;
  return `$${Math.round(usd * 100) / 100}`;
}
