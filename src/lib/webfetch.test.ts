import { test } from "node:test";
import assert from "node:assert/strict";
import { extractText, parseFetchCap } from "./webfetch.ts";

/**
 * Spec 17d — web_fetch's text handling. The model reads extracted text, not raw markup, and the
 * cap is honest: what was cut is stated, never silently dropped.
 */

test("extractText strips scripts, styles, comments and tags, and collapses space", () => {
  const html = `<html><head><style>body{color:red}</style><script>evil()</script></head>
    <!-- secret comment -->
    <body><h1>Hello</h1><p>World&nbsp;&amp; more</p></body></html>`;
  const text = extractText(html);
  assert.ok(text.includes("Hello"));
  assert.ok(text.includes("World & more"));
  assert.ok(!text.includes("evil"), "script bodies never survive");
  assert.ok(!text.includes("secret comment"), "comments never survive");
  assert.ok(!text.includes("<"), "no markup survives");
  assert.ok(!/[ \t]{2}|\n{2}/.test(text), "whitespace collapses");
});

test("a cap of zero or junk falls back to the default", () => {
  assert.equal(parseFetchCap(undefined), 8000);
  assert.equal(parseFetchCap("0"), 8000);
  assert.equal(parseFetchCap("nonsense"), 8000);
  assert.equal(parseFetchCap("100"), 100);
});
