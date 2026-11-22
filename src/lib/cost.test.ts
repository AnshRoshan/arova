import { test } from "node:test";
import assert from "node:assert/strict";
import { costUsd, formatUsd, parsePricing, runCost } from "./cost.ts";

/** Spec 46 — pricing is env-declared; unpriced is a state, never a $0. */

const env = {
  PROVIDERS: "xai openai groq",
  XAI_PRICE_IN: "3",
  XAI_PRICE_OUT: "15",
  OPENAI_PRICE_IN: "2.5",
  OPENAI_PRICE_OUT: "10",
  // groq declared but unpriced on purpose
};

test("parsePricing collects only fully priced providers", () => {
  const p = parsePricing(env);
  assert.deepEqual(Object.keys(p).sort(), ["openai", "xai"], "a provider with half a price is unpriced, not free");
});

test("costUsd is the textbook math over millions", () => {
  const p = parsePricing(env);
  assert.equal(costUsd(p, "xai", 1_000_000, 1_000_000), 18);
  assert.equal(costUsd(p, "openai", 100_000, 50_000), 0.75);
});

test("an unpriced provider returns null so the UI can say so", () => {
  const p = parsePricing(env);
  assert.equal(costUsd(p, "groq", 1_000_000, 1_000_000), null);
});

test("runCost refuses unknown provider or unknown tokens", () => {
  const p = parsePricing(env);
  assert.equal(runCost(p, "xai", null, 10), null);
  assert.equal(runCost(p, null, 10, 10), null);
  assert.equal(runCost(p, "xai", 1_000_000, 0), 3);
});

test("formatUsd stays readable at both scales", () => {
  assert.equal(formatUsd(0.124), "12.4¢");
  assert.equal(formatUsd(1.306), "$1.31");
});
