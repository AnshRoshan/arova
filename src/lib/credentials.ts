/**
 * Spec 17e — the credential boundary. AES-256-GCM envelopes sealed with a server-only key from
 * `CREDENTIAL_ENCRYPTION_KEY` (32 bytes, hex). Write-only by contract: nothing here returns a
 * plaintext to any payload, and a missing key refuses out loud instead of falling back.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

export function hasCredentialKey(key: string | undefined): boolean {
  return typeof key === "string" && /^[0-9a-f]{64}$/i.test(key);
}

function keyBytes(key: string | undefined): Buffer {
  if (!hasCredentialKey(key)) {
    throw new Error("Set CREDENTIAL_ENCRYPTION_KEY (32 bytes, hex) before storing credentials — refusing to write plaintext secrets.");
  }
  return Buffer.from(key as string, "hex");
}

export function encryptSecret(plaintext: string, key: string | undefined): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(key), iv);
  const sealed = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64")}:${sealed.toString("base64")}:${tag.toString("base64")}`;
}

export function decryptSecret(envelope: string, key: string | undefined): string {
  const [version, ivB64, dataB64, tagB64] = envelope.split(":");
  if (version !== VERSION || !ivB64 || !dataB64 || !tagB64) throw new Error("Not a credential envelope.");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(key), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
