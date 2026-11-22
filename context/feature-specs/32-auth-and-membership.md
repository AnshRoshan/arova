# 18 — Auth, sessions, membership and roles

**Status: SUPERSEDED by Feature 15 (real sign-in, shipped and verified 2026-10-06).** Feature 15 delivered this slice's substance — users, memberships with roles, sessions — so the vertical slice below was folded there rather than built twice. Original text kept for the record.

> Was: PROPOSED — not approved, not implemented. Feature 15's diagnostics already exist; this is the vertical slice that turns them into real sign-in. Part of the 2026-10-20 market roadmap.

## Goal

A person signs in with Google (or another configured OIDC provider), gets a real session, and belongs to a workspace with a role. The first person becomes the owner; the owner can invite, promote and remove people. When no provider is configured, the app remains the honest cookie demo. **No OAuth is described as working until it is verified live.**

Measurable: sign out → sign in → owner row exists; a second person is listed and can be promoted/removed; a removed session dies on the next request; a state mismatch or bad id-token is refused with a sentence.

## Why now

Every hosted competitor has accounts; OpenBot has OIDC/roles/admins; Devin and enterprise platforms use SSO. A "workspace for a team" without people is a demo. This also unblocks safe multi-user channels and per-person provenance.

## Scope

### 18a — Data model
`users` (id, email, name, picture, created_at) · `auth_identities` (provider, subject, user_id, unique provider+subject) · `sessions` (id, user_id, workspace_id, token_hash, created_at, expires_at, revoked_at, user_agent, ip_hash) · `memberships` (workspace_id, user_id, role `owner | admin | member`, created_at, unique pair). Keep `workspaces.creator_agent_id` untouched.

### 18b — Routes
- `GET /api/auth/start?provider=...` → 302 with PKCE, `state`, `nonce`; stores the attempt in a short-lived httpOnly cookie.
- `GET /api/auth/callback` → exchanges code, verifies the id-token against the issuer JWKS (issuer, audience, nonce, expiry), upserts user + identity, claims the anonymous workspace on first sign-in, creates a session.
- `POST /api/auth/signout` → revokes the session and clears the cookie.

### 18c — Session and CSRF
Opaque random token in an httpOnly, secure-in-production, same-site=lax cookie; only a hash is stored. Rotation on sign-in; absolute and idle expiry. Every mutating request checks `Origin` and a double-submit CSRF token (or a custom header) in addition to the session. Workspace resolution moves from "cookie = workspace" to "session → membership → workspace"; the demo cookie remains a fallback only when auth is unconfigured.

### 18d — Roles
- `owner`: everything, including deleting the workspace and transferring ownership.
- `admin`: manage people, connections, routines, org structure; cannot delete the workspace.
- `member`: use the workspace; no people/security changes.
Server actions enforce roles; the UI hides what the role cannot do and explains why.

### 18e — People admin
`/admin/people` (or a Settings pane): list members, invite by email (an invite row with expiry), promote/demote, remove (revokes live sessions). Every change is an `events` audit row. The first user is owner; ownership transfer is explicit.

### 18f — UI
Sign-in screen built from configured providers (no hardcoded list). Account menu with name/picture/sign-out. A banner states "cookie demo — no sign-in configured" when applicable. Settings shows the provider status from `auth-providers.ts` without secrets.

## Deep-research amendments (2026-10-20)

- Real auth is the prerequisite for every enterprise borrow; no policy, channel or agent-registry feature is trustworthy without a principal (`market-deep-dives/03`).
- Follow OpenBot's Better-Auth pattern but keep provider secrets encrypted in the database layer; upstream plugins that persist plaintext JSON require a storage-adapter wrapper.
- A single-user mode is acceptable for local demo only; a public URL must refuse to start if every request would be admitted as admin.
- Sessions, devices and admin kill switches belong here; spec 26 uses them to stop work.
- Role checks and org membership must be authorization logic, never inferred from reporting-line visibility.
- Invite flow, session rotation and CSRF are minimum team controls; SAML/SCIM/enterprise groups stay out of v1.

## Value-source gate

The settings line reads the real provider registry; a provider is "configured" only when client id + secret are present. The member list reads `memberships`; a removed person disappears and their session is revoked. No fake "signed in" state.

## Data and code

- `src/db/schema.ts`: users, auth_identities, sessions, memberships, invites.
- `src/lib/auth-providers.ts`: reuse; add redirect URI and scopes.
- New `src/lib/auth.ts` (PKCE, state/nonce, JWKS verification, session helpers) + tests.
- `src/app/api/auth/{start,callback,signout}/route.ts`.
- `src/app/api/board/route.ts`: actor resolution + role checks + CSRF.
- `src/app/page.tsx`: sign-in screen, account menu, people admin.
- Env: `AUTH_PROVIDERS`, `<NAME>_CLIENT_ID`, `<NAME>_CLIENT_SECRET`, `<NAME>_ISSUER`, `AUTH_SECRET`.

## Exclusions

No SAML, SCIM, directory sync, email/password, magic links, multi-workspace per user, or enterprise SSO in this unit. No session in localStorage. No OAuth provider beyond Google + one generic OIDC issuer.

## Verification

- Unit: PKCE/state/nonce validation; id-token claim checks; session hash/expiry; role matrix; invite expiry.
- Live: configure a real Google client (the user supplies credentials); sign in; owner row; second account; promote/demote; remove and confirm the session dies; bad state and bad token refused; CSRF missing token refused; no secret in HTML/JSON.
- With no provider: identical demo behavior and an explicit banner.
- Gates: tests, typecheck, lint, build.

## Risks and cost

Auth mistakes are security incidents. Keep the surface small, use a reviewed OIDC library or well-tested primitives, verify id-tokens fully, and do not invent crypto. Cost: four tables, three routes, CSRF on every mutation, and a migration of the anonymous workspace.

## Dependencies

None for the core; spec 17 uses the actor/role context, and spec 21 maps external identities to members.

## Open questions for the user

1. One workspace with members, or one workspace per person? D-17 chose one workspace with signed-in people; confirm before building.
2. First person in becomes owner — confirm, or should an env-configured owner email win?
3. Invite model: email invite links (needs email) or owner pre-creates emails? Recommendation: invite rows with a copyable link first, email delivery later.
4. Do agents need identities/owners too (for audit), or is the acting person enough in v1? Recommendation: person + seat in the audit row; agent identity in spec 24.

---

> **Renumbered 2026-11-22.** This document belonged to the parallel work line on this machine (its spec 18). On main it is spec **32**; the whole line renumbered 16–27 → 30–41 to continue main's own specs 16–29. Internal subsection letters and cross-references still speak the old numbers.
