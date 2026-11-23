import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readActor } from "@/lib/auth-sessions";
import { cookieName } from "@/lib/board-core";
import { allowWrite, sameOrigin, type Bucket } from "@/lib/write-guard";

export const dynamic = "force-dynamic";

/**
 * Spec 52 — the voice door. Browser audio in, transcript text out, through an env-driven
 * Whisper-compatible endpoint (`TRANSCRIBE_BASE_URL` + `TRANSCRIBE_API_KEY` + `TRANSCRIBE_MODEL`,
 * the same env-edit pattern as every provider). The audio is forwarded and never stored; the
 * transcript is returned to the composer as a draft the person reviews before sending — the
 * microphone never sends anything to a seat by itself. Without a provider the route refuses with
 * exactly what is missing.
 */
const writeBuckets: Map<string, Bucket> = ((globalThis as { __arovaTranscribeBuckets?: Map<string, Bucket> }).__arovaTranscribeBuckets ??= new Map());
const MAX_AUDIO = 15 * 1024 * 1024;

export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers.get("origin"), request.nextUrl.host)) return NextResponse.json({ error: "Cross-origin transcription is refused." }, { status: 403 });
  const actor = await readActor();
  const workspaceId = actor?.workspaceId ?? (await cookies()).get(cookieName)?.value;
  if (!workspaceId) return NextResponse.json({ error: "Workspace session missing. Refresh the page." }, { status: 401 });
  if (!allowWrite(writeBuckets, workspaceId, { burst: 6, perMinute: 20 }).ok) return NextResponse.json({ error: "That is a lot of dictation at once — try again shortly." }, { status: 429 });

  const base = process.env.TRANSCRIBE_BASE_URL?.replace(/\/$/, "");
  if (!base || !process.env.TRANSCRIBE_API_KEY) {
    return NextResponse.json({ error: `No transcription provider is configured on this server${!base ? " — set TRANSCRIBE_BASE_URL" : ""}${!process.env.TRANSCRIBE_API_KEY ? `${!base ? " and " : " — set "}TRANSCRIBE_API_KEY` : ""}. The microphone stays off until one exists.` }, { status: 501 });
  }

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File)) return NextResponse.json({ error: "The body must be multipart form data with an `audio` file." }, { status: 400 });
  if (audio.size > MAX_AUDIO) return NextResponse.json({ error: "That recording is over the 15 MB cap — dictation is for messages, not lectures." }, { status: 413 });

  const upstream = new FormData();
  upstream.append("file", audio, audio.name || "dictation.webm");
  upstream.append("model", process.env.TRANSCRIBE_MODEL || "whisper-1");
  const res = await fetch(`${base}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.TRANSCRIBE_API_KEY}` },
    body: upstream,
    signal: AbortSignal.timeout(60_000),
  }).catch((error: unknown) => {
    console.error("transcription reach failed", error instanceof Error ? error.message : "unknown");
    return null;
  });
  if (!res) return NextResponse.json({ error: "The transcription provider did not answer." }, { status: 502 });
  const body = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
  if (!res.ok) return NextResponse.json({ error: `The transcription provider refused (${res.status}${body.error?.message ? `: ${body.error.message.slice(0, 160)}` : ""}).` }, { status: 502 });
  return NextResponse.json({ ok: true, text: String(body.text ?? "").slice(0, 8000) });
}
