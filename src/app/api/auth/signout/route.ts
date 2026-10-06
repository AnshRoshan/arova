import { NextRequest, NextResponse } from "next/server";
import { signOut } from "@/lib/auth-sessions";

export const dynamic = "force-dynamic";

/** Ending the session deletes the stored hash, so the token dies on the server, not just in the browser. */
export async function POST(request: NextRequest) {
  await signOut();
  return NextResponse.redirect(new URL("/", request.url), 303);
}
