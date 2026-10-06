import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { authorizeUrl, createFlowSecrets, resolveEndpoints } from "@/lib/auth-flow";
import { findProvider, flowCookie } from "@/lib/auth-sessions";

export const dynamic = "force-dynamic";

/**
 * `GET /api/auth/start?provider=<name>` — 302 to the provider with PKCE and a state this server
 * issued. The provider list is env-driven: an unknown or half-configured name gets a sentence,
 * never a broken redirect. The flow bag lives in a short-lived httpOnly cookie scoped to
 * /api/auth, so the callback can replay exactly the challenge this browser started.
 */
export async function GET(request: NextRequest) {
  const name = new URL(request.url).searchParams.get("provider") ?? "";
  const provider = findProvider(name);
  if (!provider) return NextResponse.redirect(new URL(`/?auth=${encodeURIComponent(name ? `“${name}” is not a configured sign-in provider.` : "Pick a sign-in provider.")}`, request.url));

  const endpoints = await resolveEndpoints(provider);
  if ("error" in endpoints) return NextResponse.redirect(new URL(`/?auth=${encodeURIComponent(endpoints.error)}`, request.url));

  const { verifier, state } = createFlowSecrets();
  const nonce = randomBytes(16).toString("base64url");
  const redirectUri = new URL("/api/auth/callback", request.url).href;

  const jar = await cookies();
  jar.set(flowCookie, JSON.stringify({ provider: provider.name, state, verifier, nonce, redirectUri }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/api/auth",
  });
  return NextResponse.redirect(authorizeUrl(provider, endpoints, { redirectUri, state, verifier, nonce }), 307);
}
