import { test } from "node:test";
import assert from "node:assert/strict";
import { clampExcerpt, normaliseSourceUrl, researchBrief, sourceHost } from "./research.ts";

test("a URL is normalised without its fragment and rejects non-web schemes", () => {
  assert.equal(normaliseSourceUrl(" https://Example.com/a?b=1#frag "), "https://example.com/a?b=1");
  assert.equal(normaliseSourceUrl("not a url"), null);
  assert.equal(normaliseSourceUrl("javascript:alert(1)"), null);
  assert.equal(sourceHost("https://example.com/x"), "example.com");
});

test("an excerpt is collapsed and says where it was cut", () => {
  const long = clampExcerpt("x".repeat(30), 10);
  assert.match(long, /truncated at 10 characters of 30/);
  assert.equal(clampExcerpt("a\n\n b"), "a b");
});

test("the brief numbers sources and resolves findings against those numbers", () => {
  const sources = [
    { id: "s2", url: "https://b.example/x", host: "b.example", title: "Second", excerpt: "", note: "", tag: "market", pinned: true },
    { id: "s1", url: "https://a.example/x", host: "a.example", title: "First", excerpt: "", note: "", tag: "", pinned: false },
  ];
  const brief = researchBrief(
    { name: "Pricing", question: "What do rivals charge?", status: "ACTIVE" },
    sources,
    [{ text: "Most charge per seat.", sourceIds: ["s1", "missing"] }],
  );
  assert.match(brief, /^# Pricing/m);
  assert.match(brief, /What do rivals charge\?/);
  assert.match(brief, /1\. Second/);
  assert.match(brief, /2\. First/);
  assert.match(brief, /Most charge per seat\. \[2\]/);
  assert.match(brief, /2 source\(s\) · 1 finding\(s\)/);
});

test("an empty project says so instead of printing empty headings", () => {
  const brief = researchBrief({ name: "Empty", question: "", status: "ACTIVE" }, [], []);
  assert.match(brief, /No findings recorded\./);
  assert.match(brief, /No sources yet\./);
});
