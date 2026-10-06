/**
 * Tools that genuinely execute in this process: no credential, no sandbox, no network.
 *
 * The registry may only ever claim what runs, and anything that runs must be provable without
 * a model in the loop — so each of these is a pure function with a fixed input grammar.
 * The calculator is a hand-written arithmetic parser rather than an evaluator: if a tool can
 * execute text, the text must not be able to execute the app.
 */

import { createHash } from "node:crypto";

export const LOCAL_TOOL_IDS = ["calc", "now_in_timezone", "json_transform", "checksum"] as const;
export type LocalToolId = (typeof LOCAL_TOOL_IDS)[number];

export type ToolResult = { ok: boolean; output?: string; error?: string };

const fail = (error: string): ToolResult => ({ ok: false, error });

/* ── calc ── */

type Op = { prec: number; right: boolean; apply: (a: number, b: number) => number };
const OPS: Record<string, Op> = {
  "+": { prec: 2, right: false, apply: (a, b) => a + b },
  "-": { prec: 2, right: false, apply: (a, b) => a - b },
  "*": { prec: 3, right: false, apply: (a, b) => a * b },
  "/": { prec: 3, right: false, apply: (a, b) => a / b },
  "%": { prec: 3, right: false, apply: (a, b) => a % b },
  "^": { prec: 4, right: true, apply: (a, b) => a ** b },
};
const NEG = "neg";

function tokenizeCalc(input: string): (number | string)[] | string {
  const out: (number | string)[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(input.slice(i));
      if (!m) return "a number the parser cannot read";
      out.push(Number(m[0]));
      i += m[0].length;
      continue;
    }
    if (c in OPS || c === "(" || c === ")") { out.push(c); i++; continue; }
    return `"${c}" is not part of arithmetic`;
  }
  return out;
}

/** Shunting-yard with a real unary operator: `-3+5%2` is (-3)+1, and `2^-1` is 0.5. */
function calc(input: string): ToolResult {
  if (input.length > 500) return fail("the expression is longer than 500 characters");
  const tokens = tokenizeCalc(input);
  if (typeof tokens === "string") return fail(tokens);
  const numeric: number[] = [];
  const operators: string[] = [];
  const pop = (): void => {
    const op = operators.pop()!;
    if (op === NEG) {
      const b = numeric.pop();
      if (b === undefined) throw new Error("a minus sign with nothing after it");
      numeric.push(-b);
      return;
    }
    const use = OPS[op];
    const b = numeric.pop(), a = numeric.pop();
    if (a === undefined || b === undefined) throw new Error("the expression is malformed");
    if ((op === "/" || op === "%") && b === 0) throw new Error(op === "/" ? "division by zero" : "modulo by zero");
    const v = use.apply(a, b);
    if (!Number.isFinite(v)) throw new Error("the result is not a finite number");
    numeric.push(v);
  };
  let expectOperand = true;
  try {
    for (const t of tokens) {
      if (typeof t === "number") {
        numeric.push(t);
        expectOperand = false;
        while (operators[operators.length - 1] === NEG) pop(); // unary binds its operand immediately
        continue;
      }
      if (t === "(") { operators.push(t); expectOperand = true; continue; }
      if (t === ")") {
        if (expectOperand) throw new Error("the expression is malformed");
        while (operators.length && operators[operators.length - 1] !== "(") pop();
        if (operators.pop() !== "(") throw new Error("unbalanced parentheses");
        while (operators[operators.length - 1] === NEG) pop();
        expectOperand = false;
        continue;
      }
      if ((t === "-" || t === "+") && expectOperand) {
        if (t === "-") operators.push(NEG); // unary plus needs no work
        continue;
      }
      expectOperand = true;
      const op = OPS[t];
      while (operators.length) {
        const top = operators[operators.length - 1];
        if (top === "(" || top === NEG) break;
        const useTop = OPS[top];
        if (useTop.prec > op.prec || (useTop.prec === op.prec && !op.right)) pop();
        else break;
      }
      operators.push(t);
    }
    if (expectOperand) throw new Error("the expression ends mid-operation");
    while (operators.length) {
      if (operators[operators.length - 1] === "(") throw new Error("unbalanced parentheses");
      pop();
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "the expression is malformed");
  }
  const value = numeric[0];
  if (numeric.length !== 1 || !Number.isFinite(value)) return fail("the expression does not reduce to one finite number");
  return { ok: true, output: String(value) };
}

/* ── now_in_timezone ── */

function nowInTimezone(input: string): ToolResult {
  const [zoneRaw, instantRaw] = input.split("@").map(s => s?.trim());
  const zone = zoneRaw ?? "";
  if (!zone) return fail("the input is a zone name, e.g. Europe/Berlin or Asia/Kolkata");
  try { new Intl.DateTimeFormat("en-CA", { timeZone: zone }); } catch {
    return fail(`"${zone}" is not an IANA time zone this server knows`);
  }
  let at: Date;
  if (instantRaw) {
    const parsed = new Date(instantRaw);
    if (Number.isNaN(parsed.getTime())) return fail(`"${instantRaw}" is not an instant (try 2026-07-01T12:00:00Z)`);
    at = parsed;
  } else at = new Date();
  const shown = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "shortOffset", timeZone: zone }).format(at);
  return { ok: true, output: `${shown.replace(/\s+/g, " ")} · ${zone}` };
}

/* ── json_transform ── */

function jsonTransform(input: string): ToolResult {
  if (input.length > 20_000) return fail("the document is longer than 20,000 characters");
  const sep = input.indexOf("::");
  const path = sep >= 0 ? input.slice(0, sep).trim() : "";
  const body = sep >= 0 ? input.slice(sep + 2) : input;
  let value: unknown;
  try { value = JSON.parse(body); } catch (error) {
    return fail(`the JSON does not parse: ${error instanceof Error ? error.message : "unknown reason"}`);
  }
  if (path) {
    let cursor = value;
    for (const key of path.split(".")) {
      if (Array.isArray(cursor) && /^\d+$/.test(key)) cursor = cursor[Number(key)];
      else if (cursor && typeof cursor === "object" && key in (cursor as Record<string, unknown>)) cursor = (cursor as Record<string, unknown>)[key];
      else return fail(`no value lives at "${path}" in this document`);
    }
    return { ok: true, output: typeof cursor === "string" ? cursor : JSON.stringify(cursor, null, 2) ?? "null" };
  }
  const pretty = JSON.stringify(value, null, 2);
  if (pretty.length > 6000) return { ok: true, output: `${pretty.slice(0, 6000)}\n… truncated at 6,000 characters of ${pretty.length}` };
  return { ok: true, output: pretty };
}

/* ── checksum ── */

const HASHES = ["md5", "sha1", "sha256", "sha384", "sha512"];

function checksum(input: string): ToolResult {
  // The algorithm is chosen with `sha1::text`, never by guessing a leading word: plain text
  // like "md5 is nice" must hash as itself, and "rot13::x" must refuse rather than silently sha256.
  const sep = input.indexOf("::");
  let algo = "sha256";
  let data = input;
  if (sep >= 0) {
    algo = input.slice(0, sep).trim().toLowerCase();
    data = input.slice(sep + 2);
    if (!HASHES.includes(algo)) return fail(`"${algo}" is not a hash this tool runs; the honest set is ${HASHES.join(", ")}`);
  }
  if (data.length > 100_000) return fail("the input is longer than 100,000 characters");
  return { ok: true, output: createHash(algo).update(data, "utf8").digest("hex") };
}

const RUNNERS: Record<LocalToolId, (input: string) => ToolResult> = { calc, now_in_timezone: nowInTimezone, json_transform: jsonTransform, checksum };

/** Execute a tool this deployment can genuinely perform. Anything else says so plainly. */
export function runLocalTool(id: string, rawInput: string): ToolResult {
  const input = rawInput.trim();
  if (!input) return fail("the tool needs an input");
  if (!(LOCAL_TOOL_IDS as readonly string[]).includes(id)) return fail(`"${id}" does not run in this process — it needs a credential or a runtime this deployment does not have`);
  return RUNNERS[id as LocalToolId](input);
}
