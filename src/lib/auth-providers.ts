/**
 * Sign-in providers, env-driven and not code (D-17, spec 15) — the same doctrine the model gateway
 * ships for models (D-04): `AUTH_PROVIDERS` names the providers, and `<NAME>_CLIENT_ID` /
 * `_CLIENT_SECRET` / `_ISSUER` carry their parts. Adding Microsoft is an env edit, not a change
 * here; the sign-in screen builds itself from whatever this returns.
 *
 * A provider with missing pieces is reported as `incomplete` with the exact variable names, never
 * rendered as a broken button. Secrets stay in the returned object for the server's own use — they
 * are never part of `incomplete`, never logged, never reach the browser.
 *
 * Pure: reads only the env object it is handed; no database, no network. Endpoint resolution for
 * non-preset issuers is the caller's discovery fetch, not an invented path.
 */

export type AuthProvider = {
  name: string;
  label: string;
  clientId: string;
  clientSecret: string;
  issuer: string;
  /** Present only for presets; anything else resolves endpoints via `discoveryUrl` at runtime. */
  authorizeUrl?: string;
  tokenUrl?: string;
  jwksUri?: string;
  discoveryUrl: string;
  scopes: string;
};

export type AuthIncomplete = { name: string; missing: string[] };
export type AuthDiagnostics = { providers: AuthProvider[]; incomplete: AuthIncomplete[] };

const PRESETS: Record<string, Omit<AuthProvider, "name" | "label" | "clientId" | "clientSecret">> = {
  google: {
    issuer: "https://accounts.google.com",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
    discoveryUrl: "https://accounts.google.com/.well-known/openid-configuration",
    scopes: "openid email profile",
  },
};

const upper = (name: string) => name.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
const cleanIssuer = (raw: string) => raw.trim().replace(/\/+$/, "");

export function loadAuthProviders(env: Record<string, string | undefined>): AuthDiagnostics {
  const names = (env.AUTH_PROVIDERS ?? "").split(",").map(n => n.trim().toLowerCase()).filter(Boolean);
  const providers: AuthProvider[] = [];
  const incomplete: AuthIncomplete[] = [];
  for (const name of [...new Set(names)]) {
    const U = upper(name);
    const preset = PRESETS[name];
    const missing: string[] = [];
    if (!env[`${U}_CLIENT_ID`]) missing.push(`${U}_CLIENT_ID`);
    if (!env[`${U}_CLIENT_SECRET`]) missing.push(`${U}_CLIENT_SECRET`);
    const rawIssuer = env[`${U}_ISSUER`] || preset?.issuer;
    if (!rawIssuer && !preset) missing.push(`${U}_ISSUER`);
    else if (rawIssuer && !cleanIssuer(rawIssuer).startsWith("https://")) missing.push(`${U}_ISSUER (https)`);
    if (missing.length) {
      incomplete.push({ name, missing });
      continue;
    }
    const issuer = cleanIssuer(rawIssuer!);
    providers.push({
      name,
      label: name.charAt(0).toUpperCase() + name.slice(1),
      clientId: env[`${U}_CLIENT_ID`]!,
      clientSecret: env[`${U}_CLIENT_SECRET`]!,
      issuer,
      // A preset's fixed endpoints only survive when the issuer was not overridden away from it.
      ...(preset && issuer === preset.issuer ? { authorizeUrl: preset.authorizeUrl, tokenUrl: preset.tokenUrl, jwksUri: preset.jwksUri } : {}),
      discoveryUrl: `${issuer}/.well-known/openid-configuration`,
      scopes: preset?.scopes ?? "openid email profile",
    });
  }
  return { providers, incomplete };
}
