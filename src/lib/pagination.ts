/**
 * Spec 19a — the cursor contract. Keyset pagination (at, id), not offsets: stable under inserts,
 * lexicographically ordered in its encoded form, and junk decodes to null so a bad query fails
 * closed instead of crashing or leaking rows.
 */
export type Cursor = { at: string; id: string };

/** base64url without Buffer so the same code runs in the browser (the client encodes load-more cursors). */
const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (raw: string) => {
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export function encodeCursor(cursor: Cursor): string {
  return toBase64Url(JSON.stringify([cursor.at, cursor.id]));
}

export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(raw));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) return null;
  const [at, id] = parsed;
  if (typeof at !== "string" || typeof id !== "string") return null;
  if (Number.isNaN(new Date(at).getTime())) return null;
  return { at, id };
}

export function pageLimit(raw: string | null | undefined, fallback = 50, max = 200): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.trunc(n), max);
}
