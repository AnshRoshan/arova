/**
 * A deliberately small eval: one prompt, one answer, one expected fragment.
 *
 * The scorer is a substring check, not a model judge. A judge would add a second model call, a
 * second bill, and a second opinion that cannot be replayed; this reports exactly what it measured.
 */

export type EvalVerdict = { passed: boolean; detail: string };

const normalise = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

export function scoreEval(answer: string, expected: string): EvalVerdict {
  const wanted = normalise(expected);
  if (!wanted) return { passed: false, detail: "No expected answer was recorded, so nothing could be scored." };
  const got = normalise(answer);
  if (!got) return { passed: false, detail: "The model returned no text, so nothing could be scored." };
  const passed = got.includes(wanted);
  return {
    passed,
    detail: passed ? `The answer contains “${expected}”.` : `The answer does not contain “${expected}”.`,
  };
}

export type EvalSummary = {
  attempts: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number | null;
  medianMs: number | null;
};

/** Skipped attempts are excluded from the rate; an empty suite reports null, not 100%. */
export function summariseEvalResults(results: { status: string; durationMs: number }[]): EvalSummary {
  const scored = results.filter(r => r.status === "PASS" || r.status === "FAIL");
  const passed = scored.filter(r => r.status === "PASS").length;
  const times = scored.map(r => r.durationMs).sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  return {
    attempts: results.length,
    passed,
    failed: scored.length - passed,
    skipped: results.filter(r => r.status === "SKIPPED").length,
    passRate: scored.length ? passed / scored.length : null,
    medianMs: times.length ? (times.length % 2 ? times[mid] : Math.round((times[mid - 1] + times[mid]) / 2)) : null,
  };
}
