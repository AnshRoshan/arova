import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { readActor } from "@/lib/auth-sessions";
import { cookieName } from "@/lib/board-core";
import { allowWrite, sameOrigin, type Bucket } from "@/lib/write-guard";

export const dynamic = "force-dynamic";

/**
 * Spec 42 — the file door. One route, workspace-scoped, capped: per-file 10 MB, 4 files per
 * request, mime allowlist (images for vision, text-like for inline extraction). Bytes live under
 * .data/attachments/<workspaceId>/ and are referenced by id in the message row — the row never
 * carries the bytes, and a ref is only usable by the workspace that uploaded it.
 */
const writeBuckets: Map<string, Bucket> = ((globalThis as { __arovaUploadBuckets?: Map<string, Bucket> }).__arovaUploadBuckets ??= new Map());
const MAX_FILE = 10 * 1024 * 1024;
const MAX_FILES = 4;
const ALLOWED = [/^image\/(png|jpeg|webp|gif)$/, /^text\//, /^application\/(json|csv|xml)/];
const VISIBLE_NAME = /^[\w .()\-]{1,120}$/;

export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers.get("origin"), request.nextUrl.host)) return NextResponse.json({ error: "Cross-origin uploads are refused." }, { status: 403 });
  const actor = await readActor();
  const workspaceId = actor?.workspaceId ?? (await cookies()).get(cookieName)?.value;
  if (!workspaceId) return NextResponse.json({ error: "Workspace session missing. Refresh the page." }, { status: 401 });
  if (!allowWrite(writeBuckets, workspaceId, { burst: 10, perMinute: 60 }).ok) return NextResponse.json({ error: "That is a lot of uploads at once — try again shortly." }, { status: 429 });
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "The body must be multipart form data." }, { status: 400 });
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "No files were sent." }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `At most ${MAX_FILES} files per message.` }, { status: 400 });

  const refs: { id: string; name: string; mime: string; size: number }[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE) return NextResponse.json({ error: `${file.name} is over the 10 MB cap.` }, { status: 413 });
    if (!ALLOWED.some(re => re.test(file.type))) return NextResponse.json({ error: `${file.name}: ${file.type || "unknown type"} is not an image or readable text this server accepts.` }, { status: 415 });
    if (!VISIBLE_NAME.test(file.name)) return NextResponse.json({ error: `${file.name}: the name carries characters this server refuses.` }, { status: 400 });
    const id = randomUUID();
    const dir = path.join(process.cwd(), ".data", "attachments", workspaceId);
    await mkdir(dir, { recursive: true });
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, id), bytes);
    refs.push({ id, name: file.name, mime: file.type, size: file.size });
  }
  return NextResponse.json({ ok: true, attachments: refs });
}

/** Read one stored file back, only for the workspace that uploaded it. */
export async function GET(request: NextRequest) {
  const actor = await readActor();
  const workspaceId = actor?.workspaceId ?? (await cookies()).get(cookieName)?.value;
  if (!workspaceId) return NextResponse.json({ error: "Workspace session missing." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  const name = request.nextUrl.searchParams.get("name") ?? "";
  if (!/^[\w .()\-]{1,120}$/.test(name)) return NextResponse.json({ error: "Bad name." }, { status: 400 });
  const { readFile } = await import("node:fs/promises");
  try {
    const bytes = await readFile(path.join(process.cwd(), ".data", "attachments", workspaceId, id));
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", txt: "text/plain", md: "text/plain", csv: "text/csv", json: "application/json", xml: "application/xml" }[ext] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(bytes), { headers: { "content-type": mime, "cache-control": "private, max-age=3600" } });
  } catch {
    return NextResponse.json({ error: "That file is not in this workspace's storage." }, { status: 404 });
  }
}
