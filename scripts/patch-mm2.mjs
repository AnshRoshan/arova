import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// ── schema: messages.attachments ──
let s = readFileSync("src/db/schema.ts", "utf8");
const msgOld = ` metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}), createdAt: created() }, t => [check("messages_addressed_to_one_subject"`;
if (!s.includes(msgOld)) { console.log("MSG ANCHOR NOT FOUND"); process.exit(1); }
s = s.replace(msgOld, ` metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  /** Spec 42 — files the turn carries: refs to bytes stored on the server (name, mime, size, id).
   * Images ride to vision-capable models as content parts; text-like files enter the prompt inline;
   * the bytes themselves stay on the server and are never embedded in the row. */
  attachments: jsonb("attachments").$type<{ id: string; name: string; mime: string; size: number }[]>().default([]), createdAt: created() }, t => [check("messages_addressed_to_one_subject"`);
writeFileSync("src/db/schema.ts", s);
console.log("schema re-applied");

// ── upload route ──
const uploadRoute = `import { NextRequest, NextResponse } from "next/server";
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
const ALLOWED = [/^image\\/(png|jpeg|webp|gif)$/, /^text\\//, /^application\\/(json|csv|xml)/];
const VISIBLE_NAME = /^[\\w .()\\-]{1,120}$/;

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
  if (files.length > MAX_FILES) return NextResponse.json({ error: \`At most \${MAX_FILES} files per message.\` }, { status: 400 });

  const refs: { id: string; name: string; mime: string; size: number }[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE) return NextResponse.json({ error: \`\${file.name} is over the 10 MB cap.\` }, { status: 413 });
    if (!ALLOWED.some(re => re.test(file.type))) return NextResponse.json({ error: \`\${file.name}: \${file.type || "unknown type"} is not an image or readable text this server accepts.\` }, { status: 415 });
    if (!VISIBLE_NAME.test(file.name)) return NextResponse.json({ error: \`\${file.name}: the name carries characters this server refuses.\` }, { status: 400 });
    const id = randomUUID();
    const dir = path.join(process.cwd(), ".data", "attachments", workspaceId);
    await mkdir(dir, { recursive: true });
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, id), bytes);
    refs.push({ id, name: file.name, mime: file.type, size: file.size });
  }
  return NextResponse.json({ ok: true, attachments: refs });
}
`;
mkdirSync("src/app/api/upload", { recursive: true });
writeFileSync("src/app/api/upload/route.ts", uploadRoute);
console.log("upload route added");

// ── gitignore ──
let gi = readFileSync(".gitignore", "utf8");
if (!gi.includes(".data/")) { gi += "\n# Spec 42 — uploaded file bytes stay on the server, never in git\n.data/\n"; writeFileSync(".gitignore", gi); }
console.log("gitignore updated");
