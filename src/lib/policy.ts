/**
 * Spec 26g + the 2026-10-25 amendments — the approval token's rules and the autonomy dial, kept
 * pure. The database owns atomicity (consumption is a predicate update); this file owns the
 * meaning: one action, expiring, bound to exact arguments, never reusable.
 */
import { createHash } from "node:crypto";

/** A stable digest of exactly what was approved. Key order is normalised so an equal object hashes equal. */
export function argumentsHash(args: unknown): string {
  return createHash("sha256").update(JSON.stringify(args, Object.keys((args ?? {}) as object).sort?.() || [])).digest("hex");
}

/** Bearer credentials are stored as a digest and compared as a digest: a database read must never
 * hand back a working token (spec 26e; the 2026-10-25 audit found them plaintext). */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** What the UI may show forever after creation: enough to recognise, useless to replay. */
export function tokenPreview(raw: string): string {
  return `${raw.slice(0, 8)}…${raw.slice(-4)}`;
}

export const UNATTENDED_EXPIRY_MS = 10 * 60_000;

/**
 * Unattended approvals expire in ten minutes (the Grok-Bot pattern the market study adopted).
 * An interactive approval is consumed in the same request that issues it, so its expiry is now.
 */
export function approvalExpiry(now: Date, interactive: boolean): Date {
  return interactive ? now : new Date(now.getTime() + UNATTENDED_EXPIRY_MS);
}

export type TokenShape = { expiresAt: string | Date; consumedAt: string | Date | null; argumentsHash: string; target: string };

/** The refusal always names its reason: consumed | expired | arguments | target. */
export function tokenVerdict(token: TokenShape, use: { hash: string; target: string; now: Date }): { ok: true } | { ok: false; reason: "consumed" | "expired" | "arguments" | "target" } {
  if (token.consumedAt) return { ok: false, reason: "consumed" };
  const expires = typeof token.expiresAt === "string" ? new Date(token.expiresAt) : token.expiresAt;
  if (expires.getTime() <= use.now.getTime()) return { ok: false, reason: "expired" };
  if (token.argumentsHash !== use.hash) return { ok: false, reason: "arguments" };
  if (token.target !== use.target) return { ok: false, reason: "target" };
  return { ok: true };
}

export type Autonomy = "low" | "standard" | "high";

/**
 * May this seat chain a follow-up step on its own? High autonomy may, interactively only — a run
 * with no person watching is always capped at the standard rules, whatever its dial says (the
 * Replit pattern: the dial widens interactive iteration, never unattended reach).
 */
export function canPropose(autonomy: Autonomy, unattended: boolean): boolean {
  return autonomy === "high" && !unattended;
}

/** Until a budget row says otherwise, unattended work spends at most one model call per step. */
export const UNATTENDED_CAP = 1;

/**
 * Spec 17b — the policy gateway's decision matrix, the pure half. Fail-closed: an unknown risk,
 * a missing grant or a malformed target permits nothing, and every refusal names its rule so the
 * audit row can quote it. Execution and the audit rows live at the call site; the decision is here.
 */
export type ToolRisk = "READ" | "WRITE" | "EXTERNAL";

export function decideToolCall(
  req: { tool: string; risk: ToolRisk; granted: boolean; permissionMode: string; unattended: boolean; allowedHosts: string[] | null; preApproved?: boolean },
  ctx: { target?: string },
): { decision: "allow" | "approval" | "deny"; rule: string } {
  if (!req.granted) return { decision: "deny", rule: "not granted" };
  if (req.risk !== "READ" && req.permissionMode === "plan") return { decision: "deny", rule: "plan mode" };
  if (req.risk !== "READ" && req.unattended) return { decision: "deny", rule: "unattended work cannot approve writes" };
  if (req.risk === "READ" && req.tool === "web_fetch") {
    try {
      assertFetchableUrl(ctx.target ?? "", req.allowedHosts);
    } catch (error) {
      return { decision: "deny", rule: error instanceof Error ? error.message : "target refused" };
    }
    return { decision: "allow", rule: "granted read" };
  }
  // Any other granted read — an annotated MCP tool, say — needs no approval; only what mutates
  // or reaches outward does.
  if (req.risk === "READ") return { decision: "allow", rule: "granted read" };
  // "Act if pre-approved": an explicit seat grant IS the approval for an internal write
  // (save_note's grant, say). It never covers EXTERNAL reach — that always asks.
  if (req.risk === "WRITE" && req.preApproved) return { decision: "allow", rule: "pre-approved by grant" };
  // Every other write asks in v1 — which also covers unannotated MCP tools, whose safe default
  // is approval.
  return { decision: "approval", rule: "write requires approval" };
}

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i, /^127\./, /^0\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./, /^\[?::1\]?$/, /^\[?fc00:/i, /^\[?fd/i, /^0\.0\.0\.0$/,
];

/**
 * Spec 17d — the SSRF guard. An outbound fetch may only leave for a public host, and only on the
 * allow-list when the deployment configures one. Throws with the rule name so the gateway's refusal
 * can quote it.
 */
export function assertFetchableUrl(raw: string, allowedHosts: string[] | null): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("target is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("target must be http(s)");
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOST_PATTERNS.some((p) => p.test(host))) throw new Error("target is a private or metadata address");
  if (host.endsWith(".internal") || host.endsWith(".local") || host.includes("metadata.")) throw new Error("target is a metadata or internal hostname");
  if (allowedHosts && allowedHosts.length) {
    const ok = allowedHosts.some((allowed) => {
      const a = allowed.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      return host === a || host.endsWith(`.${a}`);
    });
    if (!ok) throw new Error("host is not on this deployment's allow-list (TOOL_ALLOWED_HOSTS)");
  }
  return url;
}

/** Tool output enters context bounded, and the boundary is visible, never silent. */
export function truncateOutput(text: string, cap: number): string {
  if (text.length <= cap) return text;
  return `${text.slice(0, cap)}\n[truncated: ${text.length} chars, showing ${cap}]`;
}

/** `TOOL_ALLOWED_HOSTS` is a space/comma list of hosts; a scheme or path typed in is stripped. */
export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,]+/)
    .map((entry) => entry.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim())
    .filter(Boolean);
}
