import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAuthProviders, type AuthDiagnostics } from "./auth-providers.ts";

/**
 * The provider registry for sign-in, built on the house doctrine: providers are env-driven, not code.
 * `AUTH_PROVIDERS=google` plus `<NAME>_CLIENT_ID` / `_CLIENT_SECRET` / `_ISSUER` (preset where one
 * exists) — and the sign-in screen builds itself from what is configured. The same rule `PROVIDERS`
 * gives the model gateway (D-04), applied to identity (D-17, spec 15).
 */

const env = (over: Record<string, string | undefined>): Record<string, string | undefined> =>
  ({ AUTH_PROVIDERS: "google", GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsec", ...over });

test("a configured provider arrives whole, with the Google preset endpoints derived", () => {
  const { providers } = loadAuthProviders(env({}));
  assert.equal(providers.length, 1);
  const g = providers[0];
  assert.equal(g.name, "google");
  assert.equal(g.issuer, "https://accounts.google.com");
  assert.equal(g.authorizeUrl, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(g.tokenUrl, "https://oauth2.googleapis.com/token");
  assert.equal(g.jwksUri, "https://www.googleapis.com/oauth2/v3/certs");
  assert.match(g.scopes, /openid/);
});

test("nothing is configured when AUTH_PROVIDERS is absent — the demo cookie keeps the workspace, and the app says so", () => {
  const { providers, incomplete } = loadAuthProviders({});
  assert.deepEqual(providers, []);
  assert.deepEqual(incomplete, [], "absent is a decision, not a mistake — nothing to nag about");
});

test("a half-configured provider names the exact variables it needs instead of rendering a broken button", () => {
  const { providers, incomplete } = loadAuthProviders(env({ GOOGLE_CLIENT_SECRET: undefined }));
  assert.deepEqual(providers, []);
  assert.equal(incomplete[0].name, "google");
  assert.deepEqual(incomplete[0].missing, ["GOOGLE_CLIENT_SECRET"]);
});

test("a generic OIDC provider needs no code — the issuer gives the discovery document, and nothing is invented", () => {
  const { providers } = loadAuthProviders(env({
    AUTH_PROVIDERS: "google, okta ",
    OKTA_CLIENT_ID: "oid", OKTA_CLIENT_SECRET: "osec", OKTA_ISSUER: "https://acme.okta.com/",
  }));
  assert.equal(providers.length, 2);
  const o = providers.find(p => p.name === "okta")!;
  assert.equal(o.issuer, "https://acme.okta.com", "trailing slash normalised away");
  assert.equal(o.discoveryUrl, "https://acme.okta.com/.well-known/openid-configuration");
  assert.equal(o.authorizeUrl, undefined, "endpoints come from discovery, not from a guessed path");
});

test("an unknown provider with no preset and no issuer is incomplete, not invented", () => {
  const { providers, incomplete } = loadAuthProviders(env({ AUTH_PROVIDERS: "acme", ACME_CLIENT_ID: "a", ACME_CLIENT_SECRET: "s" }));
  assert.deepEqual(providers, []);
  assert.deepEqual(incomplete[0].missing, ["ACME_ISSUER"]);
});

test("http issuers are refused — an identity token over plain text is not identity", () => {
  const { providers, incomplete } = loadAuthProviders(env({ AUTH_PROVIDERS: "okta", OKTA_CLIENT_ID: "a", OKTA_CLIENT_SECRET: "s", OKTA_ISSUER: "http://insecure.example" }));
  assert.deepEqual(providers, []);
  assert.ok(incomplete[0].missing.includes("OKTA_ISSUER (https)"), incomplete[0].missing.join(","));
});

test("secrets never appear in diagnostics", () => {
  const d: AuthDiagnostics = loadAuthProviders(env({ GOOGLE_CLIENT_ID: undefined }));
  assert.doesNotMatch(JSON.stringify(d.incomplete), /gsec/);
});
