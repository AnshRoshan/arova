import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { completeSignIn, findProvider, flowCookie, sessionCookie } from "@/lib/auth-sessions";
import { cookieName } from "@/lib/board-core";

export const dynamic = "force-dynamic";

/**
 * The provider's side of the door. The state and PKCE verifier must be the ones this browser
 * started, the ID token must verify against the issuer's keys, and any refusal lands the person
 * back at the app with a sentence — never half-signed-in.
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code") ?? "";
  const state = params.get("state") ?? "";
  const jar = await cookies();
  const raw = jar.get(flowCookie)?.value ?? "";
  jar.delete(flowCookie);

  const refuse = (why: string) => NextResponse.redirect(new URL(`/?auth=${encodeURIComponent(why)}`, request.url));
  if (params.get("error")) return refuse(`The provider refused the request: ${params.get("error_description") ?? params.get("error")}.`);
  let bag: { provider?: string; state?: string; verifier?: string; nonce?: string; redirectUri?: string } = {};
  try { bag = JSON.parse(raw); } catch { /* no flow started */ }
  if (!bag.provider || !bag.state || !bag.verifier || !bag.nonce) return refuse("This sign-in attempt was not started by this browser. Open the app and try again.");
  if (bag.state !== state || !code) return refuse("The provider's answer did not match this browser's sign-in attempt.");
  const provider = findProvider(bag.provider);
  if (!provider) return refuse("The provider this sign-in started with is no longer configured.");

  // The demo cookie this browser already carried names the workspace signing in claims.
  const result = await completeSignIn({
    provider, code, verifier: bag.verifier, nonce: bag.nonce,
    redirectUri: bag.redirectUri ?? new URL("/api/auth/callback", request.url).href,
    claimedWorkspaceId: jar.get(cookieName)?.value ?? null,
  });
  if (!result.ok) return refuse(result.error);

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(sessionCookie, result.token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30, path: "/",
  });
  return response;
}
