import { test } from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret, hasCredentialKey } from "./credentials.ts";

/**
 * Spec 17e — the credential boundary. AES-256-GCM with a server-only key; write-only API; a
 * missing key refuses out loud instead of falling back to plaintext.
 */

const KEY = "a".repeat(64); // 32 bytes hex

test("a round trip returns the plaintext and nothing else", () => {
  const sealed = encryptSecret("sk-live-abc123", KEY);
  assert.notEqual(sealed, "sk-live-abc123");
  assert.ok(sealed.startsWith("v1:"), "versioned envelope");
  assert.ok(!sealed.includes("abc123"), "no plaintext in the envelope");
  assert.equal(decryptSecret(sealed, KEY), "sk-live-abc123");
});

test("two encryptions of the same secret differ — a fresh IV every time", () => {
  assert.notEqual(encryptSecret("same", KEY), encryptSecret("same", KEY));
});

test("the wrong key fails to decrypt — authentication, not hope", () => {
  const sealed = encryptSecret("secret", KEY);
  assert.throws(() => decryptSecret(sealed, "b".repeat(64)));
});

test("a tampered ciphertext fails", () => {
  const sealed = encryptSecret("secret", KEY);
  const parts = sealed.split(":");
  parts[2] = (parts[2] === "AAAA" ? "AAAB" : "AAAA");
  assert.throws(() => decryptSecret(parts.join(":"), KEY));
});

test("a missing or malformed key refuses loudly — never a plaintext fallback", () => {
  assert.equal(hasCredentialKey(undefined), false);
  assert.equal(hasCredentialKey("short"), false);
  assert.equal(hasCredentialKey(KEY), true);
  assert.throws(() => encryptSecret("x", undefined), /CREDENTIAL_ENCRYPTION_KEY/);
});
