# 15 — Signed-in people: env-driven OIDC (spec only — waiting on credentials)

The user asked (2026-10-01): "allow the sign in with Google and other things". Decisions taken with
them (D-17): **one workspace, signed-in people**; **env-driven providers with a Google preset** (the
`PROVIDERS` doctrine applied to identity); **steals first** (done — spec 14).

## Shape
- `AUTH_PROVIDERS=google` plus `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; any further OIDC-capable
  provider is `<NAME>_CLIENT_ID` / `_CLIENT_SECRET` / `_ISSUER`. The sign-in screen builds itself from
  what is configured — adding Microsoft is an env edit, not a code edit. No provider list lives in the UI.
- Flow: `/api/auth/start` (302 to the provider, PKCE + state) → `/api/auth/callback` (code exchange,
  id-token verified against the issuer JWKS) → upsert `users` (email, name, picture) → mint a session
  row bound to the workspace → httpOnly cookie replaces the anonymous one.
- **First person in becomes the owner**; the owner lists, promotes and removes people (`/admin/people`
  shape from OpenBot); every change is an `events` audit row. Removing a person ends their live session.
- The anonymous cookie workspace stays what it is — the demo door — **only while no provider is
  configured**. The moment one is, anonymous reads keep working for the existing workspace until it is
  claimed, and the product says which mode it is in. `OPENBOT_SINGLE_USER` is the precedent for saying
  it out loud.
- Credentials: write-only, never returned by any API, redacted from logs (the pattern spec 12's trigger
  tokens already use).

## What the human must do before this can ship
1. Google Cloud Console → OAuth client (Web): authorized redirect URI
   `http://localhost:3000/api/auth/callback` plus the deployed origin.
2. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `AUTH_PROVIDERS=google` in `.env.local`.
   Secrets never enter chat (workflow rule); reference names only.

## Excluded on purpose
- SAML, email-domain routing, directory sync, SSO for seats' model providers. Multi-workspace tenancy.
- Anything that would make the demo claim production authentication it does not have until verified live.

## Acceptance (when built)
- A fresh clone with no `AUTH_PROVIDERS`: identical behaviour to today, and the settings panel names
  the env vars that would turn real sign-in on.
- With google configured: sign out → sign in as the person → owner row exists; second browser signs in
  as another email → listed, demote works, removed session dies on next read.
- Callback state mismatch and bad id-token each refuse with a sentence, not a stack.

## Built so far (2026-10-01) — the foundation, and only the foundation
`src/lib/auth-providers.ts` + `auth-providers.test.ts` (7 tests, RED confirmed first): the pure,
env-driven registry. `AUTH_PROVIDERS` plus `<NAME>_CLIENT_ID`/`_CLIENT_SECRET`/`_ISSUER`; a Google
preset supplies fixed endpoints; any other issuer exposes only its `discoveryUrl` (no invented paths);
a half-configured provider reports the exact missing variable names and renders nothing; `http` issuers
are refused; secrets are never in the diagnostics. `npm test` 151/151, tsc/build green, pushed schema
carries the earlier Feature 14 columns.

**What is NOT built, and cannot be until the human acts:** `users`/`sessions` tables, the two routes,
the session cookie, owner designation, `/admin/people`. Per workflow-rules + AGENTS.md, OAuth that is
not configured and not run live must not be described as working — and I cannot mint a Google client or
paste a secret. The next unit is blocked on the three env vars in "What the human must do" above; once
they exist the routes activate behind `loadAuthProviders`, and I build + verify each unit against the
live provider rather than a fixture.
