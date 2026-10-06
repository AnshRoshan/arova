/**
 * The signed-in half of Feature 15: sessions, memberships, and the people list.
 *
 * The browser holds a random token in an httpOnly cookie; the database holds only its SHA-256
 * hash, so a leaked table cannot mint a session. A person is one (issuer, subject) pair; the
 * workspace is claimed by whoever signs in first and every later sign-in is a member unless the
 * owner promotes them. Removing a person ends their live sessions at the row level, which is why
 * reads re-check membership instead of trusting the session row that already exists.
 */

import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { events, memberships, sessions, users, workspaces } from "@/db/schema";
import { exchangeCode, identityFromClaims, resolveEndpoints, verifyIdToken, type FlowDeps } from "./auth-flow.ts";
import { loadAuthProviders, type AuthProvider } from "./auth-providers.ts";

export const sessionCookie = "arova_session";
export const flowCookie = "arova_oauth";
export const SESSION_DAYS = 30;
const SLIDING_TOUCH_MS = 60 * 60_000;

export type Actor = { userId: string; workspaceId: string; role: "owner" | "member"; name: string; email: string; picture: string };

const hashToken = (token: string) => createHash("sha256").update(token, "ascii").digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

/** Providers that are actually usable right now — configured, not merely named in the env. */
export function configuredProviders(env: Record<string, string | undefined> = process.env): AuthProvider[] {
  return loadAuthProviders(env).providers;
}

export function findProvider(name: string): AuthProvider | null {
  return configuredProviders().find(p => p.name === name) ?? null;
}

/**
 * Run the callback leg end to end and return the actor the browser becomes. Every refusal is a
 * sentence for the sign-in screen, and none of them leaves a half-written identity behind.
 */
export async function completeSignIn(opts: {
  provider: AuthProvider;
  code: string;
  verifier: string;
  nonce: string;
  redirectUri: string;
  /** The anonymous demo workspace this browser was already using, if any — signing in claims it. */
  claimedWorkspaceId?: string | null;
}, deps: FlowDeps = {}): Promise<{ ok: true; actor: Actor; token: string } | { ok: false; error: string }> {
  const endpoints = await resolveEndpoints(opts.provider, deps);
  if ("error" in endpoints) return { ok: false, error: endpoints.error };

  const tokens = await exchangeCode(opts.provider, endpoints, { code: opts.code, verifier: opts.verifier, redirectUri: opts.redirectUri }, deps);
  if ("error" in tokens) return { ok: false, error: tokens.error };

  const verified = await verifyIdToken(tokens.id_token!, opts.provider, { jwks: endpoints.jwks, nonce: opts.nonce }, deps);
  if ("error" in verified) return { ok: false, error: verified.error };

  const identity = identityFromClaims(verified.claims);
  if ("error" in identity) return { ok: false, error: identity.error };

  const [user] = await db.insert(users).values({
    issuer: opts.provider.issuer, subject: identity.subject, email: identity.email, name: identity.name, picture: identity.picture, lastSeenAt: new Date(),
  }).onConflictDoUpdate({
    target: [users.issuer, users.subject],
    set: { email: identity.email, name: identity.name, picture: identity.picture, lastSeenAt: new Date() },
  }).returning();

  // Which workspace does this person land in? A workspace they already belong to; then the one
  // workspace of this deployment that already has an owner (the spec's "one workspace, signed-in
  // people" — a second browser joins, it does not found a parallel company); then the anonymous
  // demo workspace this browser was already looking at, if nobody owns anything yet; then a new one.
  let workspaceId: string | null = null;
  const [mine] = await db.select({ workspaceId: memberships.workspaceId }).from(memberships)
    .where(and(eq(memberships.userId, user.id), isNull(memberships.removedAt))).orderBy(desc(memberships.addedAt)).limit(1);
  if (mine) workspaceId = mine.workspaceId;
  if (!workspaceId) {
    const [owned] = await db.select({ workspaceId: memberships.workspaceId }).from(memberships)
      .where(and(eq(memberships.role, "owner"), isNull(memberships.removedAt))).orderBy(asc(memberships.addedAt)).limit(1);
    if (owned) workspaceId = owned.workspaceId;
  }
  if (!workspaceId && opts.claimedWorkspaceId) {
    const [found] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, opts.claimedWorkspaceId)).limit(1);
    if (found) workspaceId = found.id;
  }
  if (!workspaceId) {
    const [fresh] = await db.insert(workspaces).values({ name: `${identity.name}'s workspace` }).returning();
    workspaceId = fresh.id;
    await db.insert(events).values({ workspaceId, agentId: null, type: "workspace.created", detail: "Workspace created by sign-in" });
  }

  const [existingMembership] = await db.select().from(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, user.id))).limit(1);
  const [{ count: ownerCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, "owner"), isNull(memberships.removedAt)));
  const becomesOwner = ownerCount === 0;
  let role: "owner" | "member";
  if (existingMembership) {
    role = existingMembership.role === "owner" ? "owner" : "member";
    await db.update(memberships).set({ removedAt: null }).where(eq(memberships.id, existingMembership.id));
  } else {
    role = becomesOwner ? "owner" : "member";
    await db.insert(memberships).values({ workspaceId, userId: user.id, role });
  }
  if (becomesOwner && existingMembership) {
    role = "owner";
    await db.update(memberships).set({ role: "owner" }).where(eq(memberships.id, existingMembership.id));
  }

  const token = newToken();
  await db.insert(sessions).values({ userId: user.id, workspaceId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) });
  await db.insert(events).values({ workspaceId, agentId: null, type: "person.signed_in", detail: `${user.name}${role === "owner" ? " became the owner" : ""}` });

  return { ok: true, token, actor: { userId: user.id, workspaceId, role, name: user.name, email: user.email, picture: user.picture } };
}

/** Who is this request, if anyone? A stale, revoked or expired session reads as anonymous. */
export async function readActor(): Promise<Actor | null> {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token) return null;
  const rows = await db.select({
    session: sessions, user: users, membership: memberships,
  }).from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(memberships, and(eq(memberships.workspaceId, sessions.workspaceId), eq(memberships.userId, users.id)))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()), isNull(memberships.removedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!row.session.lastUsedAt || Date.now() - row.session.lastUsedAt.getTime() > SLIDING_TOUCH_MS) {
    await db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, row.session.id));
  }
  return { userId: row.user.id, workspaceId: row.session.workspaceId, role: row.membership.role === "owner" ? "owner" : "member", name: row.user.name, email: row.user.email, picture: row.user.picture };
}

export async function signOut(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(sessionCookie)?.value;
  if (!token) return false;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  jar.delete(sessionCookie);
  return true;
}

/** The owner's people list: everyone with a live membership, with their session count. */
export async function listPeople(workspaceId: string) {
  const rows = await db.select({
    id: users.id, name: users.name, email: users.email, picture: users.picture,
    role: memberships.role, addedAt: memberships.addedAt, lastSeenAt: users.lastSeenAt, issuer: users.issuer,
  }).from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(and(eq(memberships.workspaceId, workspaceId), isNull(memberships.removedAt)))
    .orderBy(desc(memberships.role), asc(memberships.addedAt));
  const live = await db.select({ userId: sessions.userId, n: sql<number>`count(*)::int` }).from(sessions)
    .where(and(eq(sessions.workspaceId, workspaceId), gt(sessions.expiresAt, new Date()))).groupBy(sessions.userId);
  const sessionsBy = new Map(live.map(r => [r.userId, r.n]));
  return rows.map(r => ({ ...r, sessions: sessionsBy.get(r.id) ?? 0 }));
}

/** Removing a person ends their live sessions; the next read of theirs comes back anonymous. */
export async function removePerson(workspaceId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const [target] = await db.select().from(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId), isNull(memberships.removedAt))).limit(1);
  if (!target) return { ok: false, error: "That person is not a member of this workspace." };
  if (target.role === "owner") {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, "owner"), isNull(memberships.removedAt)));
    if (count <= 1) return { ok: false, error: "The last owner cannot be removed. Promote someone else first." };
  }
  await db.update(memberships).set({ removedAt: new Date() }).where(eq(memberships.id, target.id));
  await db.delete(sessions).where(inArray(sessions.id, (await db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.workspaceId, workspaceId), eq(sessions.userId, userId)))).map(r => r.id)));
  await db.insert(events).values({ workspaceId, agentId: null, type: "person.removed", detail: "A person was removed and their sessions ended" });
  return { ok: true };
}

export async function setPersonRole(workspaceId: string, actor: Actor, userId: string, role: "owner" | "member"): Promise<{ ok: boolean; error?: string }> {
  if (actor.role !== "owner") return { ok: false, error: "Only the owner can change roles." };
  const [target] = await db.select().from(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId), isNull(memberships.removedAt))).limit(1);
  if (!target) return { ok: false, error: "That person is not a member of this workspace." };
  if (target.role === role) return { ok: true };
  await db.update(memberships).set({ role }).where(eq(memberships.id, target.id));
  await db.insert(events).values({ workspaceId, agentId: null, type: "person.role", detail: `${role}` });
  return { ok: true };
}
