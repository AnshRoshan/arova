import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { researchSources } from "@/db/schema";
import { webFetch } from "@/lib/web-fetch";
import { clampExcerpt, normaliseSourceUrl, sourceHost } from "@/lib/research";

export type ResearchSourceRow = typeof researchSources.$inferSelect;

export type CollectInput = {
  workspaceId: string;
  projectId: string;
  url?: string;
  /** A pasted excerpt. When present the URL is stored as provenance and is not re-fetched. */
  text?: string;
  title?: string;
  note?: string;
  tag?: string;
  fetchImpl?: typeof fetch;
};

/**
 * One intake path for both kinds of source. A URL goes through the same SSRF policy as web_fetch,
 * then the readable excerpt is stored with its final URL. A pasted excerpt is stored as typed, with
 * the URL if the reader supplied one. Duplicate URLs are refused per project by the partial index.
 */
export async function collectResearchSource(input: CollectInput): Promise<{ ok: true; source: ResearchSourceRow; kind: "fetched" | "pasted" } | { ok: false; error: string; sourceId?: string }> {
  const url = input.url?.trim() ? normaliseSourceUrl(input.url) : null;
  if (input.url?.trim() && !url) return { ok: false, error: "That is not an http(s) URL." };
  if (url) {
    const [existing] = await db.select().from(researchSources)
      .where(and(eq(researchSources.projectId, input.projectId), eq(researchSources.url, url))).limit(1);
    if (existing) return { ok: false, error: "That URL is already in this project.", sourceId: existing.id };
  }

  const pasted = input.text?.trim() ?? "";
  if (!url && pasted.length < 10) return { ok: false, error: "Give a URL to fetch, or paste at least a sentence of the source." };

  let title = input.title?.trim().slice(0, 300) ?? "";
  let excerpt = "";
  let host = url ? sourceHost(url) : "";
  let fetchedAt: Date | null = null;
  if (!pasted) {
    const fetched = await webFetch(url!, { fetchImpl: input.fetchImpl });
    if (!fetched.ok) return { ok: false, error: fetched.error };
    title = title || fetched.title.slice(0, 300);
    excerpt = clampExcerpt(fetched.output);
    host = sourceHost(fetched.url) || host;
    fetchedAt = new Date();
  } else {
    excerpt = clampExcerpt(pasted);
    title = title || "Pasted note";
  }

  try {
    const [source] = await db.insert(researchSources).values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      url: url ?? "",
      host,
      title,
      excerpt,
      note: (input.note ?? "").trim().slice(0, 600),
      tag: (input.tag ?? "").trim().slice(0, 40),
      addedBy: "person",
      fetchedAt,
    }).returning();
    return { ok: true, source, kind: fetchedAt ? "fetched" : "pasted" };
  } catch {
    // A concurrent insert won the unique (project, url) race; treat it as already saved.
    const [existing] = url ? await db.select().from(researchSources)
      .where(and(eq(researchSources.projectId, input.projectId), eq(researchSources.url, url))).limit(1) : [];
    if (existing) return { ok: false, error: "That URL is already in this project.", sourceId: existing.id };
    return { ok: false, error: "The source could not be saved." };
  }
}
