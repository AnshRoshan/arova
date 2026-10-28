import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreEval, summariseEvalResults } from "./evals.ts";

test("a case-insensitive contiguous fragment passes; whitespace is normalised", () => {
  assert.equal(scoreEval("The answer is   forty-two.", "FORTY-TWO").passed, true);
  assert.equal(scoreEval("The answer is forty two.", "forty-two").passed, false);
});

test("an empty answer or an empty expectation is a failure with a reason", () => {
  assert.match(scoreEval("", "x").detail, /returned no text/);
  assert.match(scoreEval("x", "  ").detail, /No expected answer/);
});

test("the summary excludes skipped attempts from the rate and reports a real median", () => {
  const s = summariseEvalResults([
    { status: "PASS", durationMs: 100 },
    { status: "FAIL", durationMs: 300 },
    { status: "PASS", durationMs: 200 },
    { status: "SKIPPED", durationMs: 0 },
  ]);
  assert.equal(s.attempts, 4);
  assert.equal(s.passed, 2);
  assert.equal(s.failed, 1);
  assert.equal(s.skipped, 1);
  assert.equal(s.passRate, 2 / 3);
  assert.equal(s.medianMs, 200);
});

test("an empty suite is null, not a fabricated 100 percent", () => {
  const s = summariseEvalResults([]);
  assert.equal(s.passRate, null);
  assert.equal(s.medianMs, null);
});
