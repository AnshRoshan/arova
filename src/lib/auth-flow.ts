/**
 * The OIDC code flow, as pure as a network protocol gets (spec 15).
 *
 * Everything here takes its inputs — the provider record, the fetch implementation, the current
 * time — so the whole flow is provable without a live identity provider: the tests generate an RSA
 * key, mint a real JWS, and verify it exactly as the callback will. What is NOT here: env reading
 * (auth-providers.ts), database writes (the routes), and anything that invents a fallback identity
 * when verification fails. There is none by design: a refused callback is a sentence on a screen,
 * never a signed-in demo.
 */

import { createPublicKey, randomBytes, createHash, verify as cryptoVerify } from "node:crypto";
import type { AuthProvider } from "./auth-providers.ts";

export type FlowDeps = { fetchImpl?: (url: string, init?: RequestInit) => Promise<Response> };

const b64url = (buf: Buffer) => buf.toString("base64url");
const nowSeconds = () => Math.floor(Date.now() / 1000);

/* ── PKCE and state ── */

export function createFlowSecrets(): { verifier: string; state: string } {
  return { verifier: b64url(randomBytes(32)), state: b64url(randomBytes(24)) };
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

/* ── discovery ── */

export type Endpoints = { authorize: string; token: string; jwks: string };

/** Preset endpoints win only when the issuer was not overridden; anything else goes through discovery. */
export async function resolveEndpoints(provider: AuthProvider, deps: FlowDeps = {}): Promise<Endpoints | { error: string }> {
  if (provider.authorizeUrl && provider.tokenUrl && provider.jwksUri) {
    return { authorize: provider.authorizeUrl, token: provider.tokenUrl, jwks: provider.jwksUri };
  }
  const doFetch = deps.fetchImpl ?? fetch;
  let doc: Record<string, unknown> | null = null;
  try {
    const res = await doFetch(provider.discoveryUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { error: `${provider.label}'s discovery document returned ${res.status}.` };
    doc = await res.json() as Record<string, unknown>;
  } catch {
    return { error: `${provider.label}'s discovery document could not be reached.` };
  }
  const authorize = typeof doc?.authorization_endpoint === "string" ? doc.authorization_endpoint : "";
  const token = typeof doc?.token_endpoint === "string" ? doc.token_endpoint : "";
  const jwks = typeof doc?.jwks_uri === "string" ? doc.jwks_uri : "";
  if (!authorize || !token || !jwks) return { error: `${provider.label}'s discovery document is missing an endpoint this flow needs.` };
  for (const url of [authorize, token, jwks]) {
    if (!url.startsWith("https://")) return { error: `${provider.label} offered a non-https endpoint; the flow refuses it.` };
  }
  return { authorize, token, jwks };
}

/* ── the redirect ── */

export function authorizeUrl(provider: AuthProvider, endpoints: Endpoints, opts: { redirectUri: string; state: string; verifier: string; nonce?: string }): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: provider.clientId,
    redirect_uri: opts.redirectUri,
    scope: provider.scopes,
    state: opts.state,
    code_challenge: pkceChallenge(opts.verifier),
    code_challenge_method: "S256",
  });
  // The nonce ties the minted ID token to this exact browser flow; without it a stolen token
  // could be replayed into a different session.
  if (opts.nonce) params.set("nonce", opts.nonce);
  return `${endpoints.authorize}?${params.toString()}`;
}

/* ── code exchange ── */

export type TokenSet = { access_token?: string; id_token?: string };

export async function exchangeCode(provider: AuthProvider, endpoints: Endpoints, opts: { code: string; verifier: string; redirectUri: string }, deps: FlowDeps = {}): Promise<TokenSet | { error: string }> {
  const doFetch = deps.fetchImpl ?? fetch;
  const body = new URLSearchParams({ grant_type: "authorization_code", code: opts.code, client_id: provider.clientId, client_secret: provider.clientSecret, redirect_uri: opts.redirectUri, code_verifier: opts.verifier });
  try {
    const res = await doFetch(endpoints.token, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: body.toString(), signal: AbortSignal.timeout(15_000) });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) return { error: `${provider.label} refused the code exchange (${res.status}): ${typeof json.error_description === "string" ? json.error_description.slice(0, 200) : "no detail"}` };
    if (typeof json.id_token !== "string" || !json.id_token) return { error: `${provider.label} returned no ID token, so there is no identity to trust.` };
    return { id_token: json.id_token, ...(typeof json.access_token === "string" ? { access_token: json.access_token } : {}) };
  } catch (error) {
    return { error: `${provider.label}'s token endpoint could not be reached: ${error instanceof Error ? error.name : "unknown"}` };
  }
}

/* ── id-token verification ── */

type Jwk = { kid?: string; n?: string; e?: string };

function jwkToPem(jwk: Jwk): string | null {
  if (!jwk.n || !jwk.e) return null;
  try { return createPublicKey({ key: { kty: "RSA", n: jwk.n, e: jwk.e }, format: "jwk" }).export({ type: "spki", format: "pem" }).toString(); } catch { return null; }
}

const decodeSegment = (segment: string): Record<string, unknown> => JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));

/**
 * Verify the JWS (RS256 against the issuer's JWKS) before trusting a single claim, then enforce
 * iss, aud, exp/nbf and nonce. A key that is not published is not a key; a token that fails any
 * line returns a sentence, never a partial identity.
 */
export async function verifyIdToken(idToken: string, provider: AuthProvider, opts: { jwks: string; nonce?: string; now?: number }, deps: FlowDeps = {}): Promise<{ claims: Record<string, unknown> } | { error: string }> {
  const doFetch = deps.fetchImpl ?? fetch;
  const parts = idToken.split(".");
  if (parts.length !== 3) return { error: "The ID token is not a JWS this verifier can read." };
  const [headerB64, payloadB64, sigB64] = parts;
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try { header = decodeSegment(headerB64); claims = decodeSegment(payloadB64); } catch { return { error: "The ID token's segments do not decode." }; }
  if (header.alg !== "RS256") return { error: `The ID token is signed with ${String(header.alg)}; only RS256 is accepted.` };
  let keys: Jwk[] = [];
  try {
    const res = await doFetch(opts.jwks, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { error: "The issuer's key set could not be fetched." };
    keys = ((await res.json()) as { keys?: Jwk[] }).keys ?? [];
  } catch { return { error: "The issuer's key set could not be reached." }; }
  const pems = keys.filter(k => !header.kid || k.kid === header.kid).map(jwkToPem).filter((p): p is string => !!p);
  if (!pems.length) return { error: "No published key matches this token's signature." };
  const signature = Buffer.from(sigB64, "base64url");
  const signed = Buffer.from(`${headerB64}.${payloadB64}`, "ascii");
  const verified = pems.some(pem => { try { return cryptoVerify("RSA-SHA256", signed, pem, signature); } catch { return false; } });
  if (!verified) return { error: "The ID token's signature does not verify against the issuer's keys." };
  const now = opts.now ?? nowSeconds();
  if (claims.iss !== provider.issuer) return { error: "The ID token was issued by someone else." };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(provider.clientId)) return { error: "The ID token was not meant for this client." };
  if (typeof claims.exp === "number" && claims.exp <= now) return { error: "The ID token had already expired." };
  if (typeof claims.nbf === "number" && claims.nbf > now + 30) return { error: "The ID token is not valid yet." };
  if (opts.nonce && claims.nonce !== opts.nonce) return { error: "The ID token's nonce does not match this browser's flow." };
  if (typeof claims.sub !== "string" || !claims.sub) return { error: "The ID token carries no subject." };
  return { claims };
}

/* ── the identity a workspace stores ── */

export type Identity = { subject: string; email: string; name: string; picture: string };

export function identityFromClaims(claims: Record<string, unknown>): Identity | { error: string } {
  const sub = claims.sub;
  if (typeof sub !== "string" || !sub) return { error: "The verified identity has no subject." };
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return { subject: sub.slice(0, 200), email: str(claims.email).toLowerCase().slice(0, 200), name: str(claims.name) || str(claims.email).split("@")[0] || "a signed-in person", picture: str(claims.picture).startsWith("https://") ? str(claims.picture).slice(0, 500) : "" };
}
