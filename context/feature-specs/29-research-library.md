# Feature 29 — Research library

## The problem

The product can fetch a page and cite it inside one reply, but there was nowhere for a source to
live after the turn ended. `web_search` is unavailable without a search provider, so "research"
depended entirely on a configured model and a single conversation.

## What it is

A workspace-scoped research library that works without a model.

- **Project** — a name, a question, an optional seat and organisation, and a status
  (`ACTIVE` / `ARCHIVED`).
- **Source** — either fetched from a public https URL through the same SSRF policy as `web_fetch`
  (final URL, title, readable excerpt, fetch time), or a pasted excerpt with an optional provenance
  URL. One URL may appear once per project; pasted notes have no URL key.
- **Finding** — a sentence plus the ids of sources in the same project. A finding cannot cite a
  source from another project.
- **Brief** — a deterministic markdown document: question, findings with `[n]` citations, and the
  numbered source list. It is assembled client-side and copied, so no model call is involved.

Management: pin, tag, note, open, delete a source; edit, assign, archive, delete a project. Research
rows are included in the audit export and the project/source/finding events appear in the activity
record.

## Out of scope

Model summarisation, embeddings/semantic search, scheduled digests, shared cross-workspace libraries,
and any tool that fetches http or private addresses.

## Verification

`src/lib/research.test.ts` covers URL normalisation, excerpt clamping and brief numbering. The live
proof (`.impeccable/research-proof.mjs`) fetches `https://example.com`, stores its excerpt, refuses a
duplicate URL, saves a pasted source, pins it, saves a finding citing both, refuses a cross-project
citation, archives the project and verifies the cascade delete. Chrome (`cdp-spec25-check.mjs`) opens
the Research rail and sees the project, source and findings section.
