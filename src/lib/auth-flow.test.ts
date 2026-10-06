import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { authorizeUrl, createFlowSecrets, exchangeCode, identityFromClaims, pkceChallenge, resolveEndpoints, verifyIdToken, type Endpoints } from "./auth-flow.ts";
import type { AuthProvider } from "./auth-providers.ts";

/* Feature 15's flow, proven with real cryptography: the test generates an RSA pair, mints a real
 * JWS, and the verifier checks it the same way the live callback will. Nothing here trusts a token
 * it could not sign-verify. */

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = keys.publicKey.export({ format: "jwk" }) as { n: string; e: string };
const KID = "test-key-1";

const provider: AuthProvider = {
  name: "mock", label: "Mock", clientId: "client-abc", clientSecret: "shhh",
  issuer: "https://issuer.test", discoveryUrl: "https://issuer.test/.well-known/openid-configuration",
  scopes: "openid email profile",
};
const endpoints: Endpoints = { authorize: "https://issuer.test/authorize", token: "https://issuer.test/token", jwks: "https://issuer.test/jwks" };

function signToken(claims: Record<string, unknown>, opts: { kid?: string; alg?: string; tamper?: boolean } = {}): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: opts.alg ?? "RS256", typ: "JWT", kid: opts.kid ?? KID });
  const payload = b64(claims);
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`, "ascii");
  let sig = signer.sign(keys.privateKey).toString("base64url");
  if (opts.tamper) sig = sig.slice(0, -6) + "AAAAAA";
  return `${header}.${payload}.${sig}`;
}

const goodClaims = () => ({ iss: provider.issuer, aud: provider.clientId, sub: "user-42", exp: Math.floor(Date.now() / 1000) + 600, email: "Person@Example.com", name: "Person One", picture: "https://avatars.example/p1" });

const fetchWith = (routes: Record<string, unknown | Response>) => async (url: string) => {
  const key = Object.keys(routes).find(k => url.startsWith(k));
  if (!key) return new Response("not found", { status: 404 });
  const value = routes[key];
  if (value instanceof Response) return value;
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
};

test("secrets and PKCE: S256 is the challenge, and every flow gets fresh randomness", () => {
  const a = createFlowSecrets();
  const b = createFlowSecrets();
  assert.ok(a.verifier.length >= 43 && a.state !== b.state);
  assert.match(pkceChallenge(a.verifier), /^[A-Za-z0-9_-]+$/);
  assert.notEqual(pkceChallenge(a.verifier), a.verifier);
});

test("authorize URL carries PKCE, state, and the exact redirect the callback will replay", () => {
  const url = new URL(authorizeUrl(provider, endpoints, { redirectUri: "http://localhost:3000/api/auth/callback", state: "st-1", verifier: "v".repeat(43) }));
  assert.equal(url.origin + url.pathname, "https://issuer.test/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), "st-1");
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:3000/api/auth/callback");
  assert.ok(url.searchParams.get("code_challenge"));
  assert.ok(!url.toString().includes("shhh"), "the client secret never rides a URL");
});

test("endpoints: no preset means discovery, and discovery is only trusted for https endpoints", async () => {
  const fetched: string[] = [];
  const viaDiscovery = await resolveEndpoints(provider, { fetchImpl: async (url) => { fetched.push(String(url)); return fetchWith({ "https://issuer.test/.well-known": { authorization_endpoint: "https://issuer.test/authorize", token_endpoint: "https://issuer.test/token", jwks_uri: "https://issuer.test/jwks" } })(url); } });
  assert.deepEqual(viaDiscovery, endpoints);
  assert.deepEqual(fetched, ["https://issuer.test/.well-known/openid-configuration"]);
  const lying = await resolveEndpoints(provider, { fetchImpl: fetchWith({ "https://issuer.test/.well-known": { authorization_endpoint: "http://issuer.test/authorize", token_endpoint: "https://issuer.test/token", jwks_uri: "https://issuer.test/jwks" } }) });
  assert.ok("error" in lying && /non-https/.test(lying.error as string), "an http endpoint in a discovery document is refused, not followed");
  const missing = await resolveEndpoints(provider, { fetchImpl: fetchWith({ "https://issuer.test/.well-known": { token_endpoint: "https://issuer.test/token" } }) });
  assert.ok("error" in missing, "a discovery document without the endpoints is an error, not a guess");
});

test("verifyIdToken: a real RS256 signature against the issuer's JWKS passes; every cheat fails", async () => {
  const deps = { fetchImpl: fetchWith({ "https://issuer.test/jwks": { keys: [{ kid: KID, kty: "RSA", n: jwk.n, e: jwk.e }] } }) };
  const ok = await verifyIdToken(signToken(goodClaims()), provider, { jwks: endpoints.jwks }, deps);
  assert.ok(!("error" in ok), `a correctly signed token must verify: ${"error" in ok ? ok.error : ""}`);
  assert.equal(ok.claims.sub, "user-42");

  const wrongKid = await verifyIdToken(signToken(goodClaims(), { kid: "other" }), provider, { jwks: endpoints.jwks }, deps);
  assert.ok("error" in wrongKid, "a token signed by an unpublished key is not an identity");

  const tampered = await verifyIdToken(signToken(goodClaims(), { tamper: true }), provider, { jwks: endpoints.jwks }, deps);
  assert.ok("error" in tampered, "one flipped byte in the signature must not verify");

  const expired = await verifyIdToken(signToken({ ...goodClaims(), exp: Math.floor(Date.now() / 1000) - 5 }), provider, { jwks: endpoints.jwks }, deps);
  assert.ok("error" in expired && /expired/.test(expired.error as string));

  const wrongAud = await verifyIdToken(signToken({ ...goodClaims(), aud: "someone-else" }), provider, { jwks: endpoints.jwks }, deps);
  assert.ok("error" in wrongAud && /not meant for this client/.test(wrongAud.error as string));

  const wrongIss = await verifyIdToken(signToken({ ...goodClaims(), iss: "https://evil.test" }), provider, { jwks: endpoints.jwks }, deps);
  assert.ok("error" in wrongIss && /someone else/.test(wrongIss.error as string));

  const nonceMismatch = await verifyIdToken(signToken({ ...goodClaims(), nonce: "other-nonce" }), provider, { jwks: endpoints.jwks, nonce: "this-nonce" }, deps);
  assert.ok("error" in nonceMismatch, "a token minted for a different browser flow is refused");

  const algNone = await verifyIdToken(`${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify(goodClaims())).toString("base64url")}.`, provider, { jwks: endpoints.jwks }, deps);
  assert.ok("error" in algNone, "alg:none is refused before any key lookup");
});

test("exchangeCode: the verifier and secret go in the body, and a response without an ID token is refused", async () => {
  let seen: URLSearchParams | null = null;
  const deps = {
    fetchImpl: async (_url: string, init?: RequestInit) => {
      seen = new URLSearchParams(String(init?.body));
      return new Response(JSON.stringify({ access_token: "at-1" }), { status: 200, headers: { "content-type": "application/json" } });
    },
  };
  const noId = await exchangeCode(provider, endpoints, { code: "c-1", verifier: "v".repeat(43), redirectUri: "https://app.test/cb" }, deps);
  assert.ok("error" in noId && /no ID token/.test(noId.error as string), "an access token alone is not an identity");
  const body = seen!;
  assert.equal(body.get("code_verifier"), "v".repeat(43));
  assert.equal(body.get("client_secret"), "shhh");
});

test("identity: email is lower-cased for display, and a non-https picture is dropped, not proxied", () => {
  const id = identityFromClaims(goodClaims());
  assert.equal((id as Identity).email, "person@example.com");
  assert.equal((id as { name: string }).name, "Person One");
  const noName = identityFromClaims({ iss: provider.issuer, sub: "s", email: "fallback@example.com" });
  assert.equal((noName as { name: string }).name, "fallback");
  const badPicture = identityFromClaims({ ...goodClaims(), picture: "http://evil.test/x.png" });
  assert.equal((badPicture as { picture: string }).picture, "");
});

type Identity = { subject: string; email: string; name: string; picture: string };
