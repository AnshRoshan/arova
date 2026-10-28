import { test } from "node:test";
import assert from "node:assert/strict";
import { addSource, citationReport, createLedger, sourceKey } from "./citations.ts";
import { formatSearchResults } from "./web-search.ts";

test("the ledger numbers each URL once and keeps that number for the whole loop", () => {
  const ledger = createLedger();
  assert.equal(addSource(ledger, { title: "A", url: "https://a.example/x" })?.index, 1);
  assert.equal(addSource(ledger, { title: "B", url: "https://b.example" })?.index, 2);
  assert.equal(addSource(ledger, { title: "A again", url: "https://a.example/x#section" })?.index, 1, "a fragment is the same page");
  assert.equal(ledger.sources.length, 2);
  assert.equal(ledger.sources[0].title, "A", "the first title wins, so the list does not churn");
  assert.equal(sourceKey("https://a.example/x#one"), sourceKey("https://a.example/x#two"));
});

test("a source past the cap is not numbered, so no citation can point past the list", () => {
  const ledger = createLedger(2);
  addSource(ledger, { url: "https://a.example" });
  addSource(ledger, { url: "https://b.example" });
  assert.equal(addSource(ledger, { url: "https://c.example" }), null);
  assert.equal(ledger.sources.length, 2);
  assert.equal(ledger.sources[1].index, 2);
});

test("search text continues the ledger's numbering across calls instead of restarting at [1]", () => {
  const ledger = createLedger();
  const first = formatSearchResults(
    [{ title: "A", url: "https://a.example", snippet: "alpha" }, { title: "B", url: "https://b.example", snippet: "beta" }],
    [addSource(ledger, { title: "A", url: "https://a.example" })!.index, addSource(ledger, { title: "B", url: "https://b.example" })!.index],
  );
  const second = formatSearchResults(
    [{ title: "C", url: "https://c.example", snippet: "gamma" }, { title: "A", url: "https://a.example", snippet: "alpha again" }],
    [addSource(ledger, { title: "C", url: "https://c.example" })!.index, addSource(ledger, { title: "A", url: "https://a.example" })!.index],
  );
  assert.match(first.text, /^\[1\] A/);
  assert.match(first.text, /\[2\] B/);
  assert.match(second.text, /\[3\] C/);
  assert.match(second.text, /\[1\] A/, "a repeat keeps its original number");
  assert.equal(ledger.sources.length, 3);
});

test("an unnumbered result is printed without a citable number", () => {
  const formatted = formatSearchResults([{ title: "X", url: "https://x.example", snippet: "" }], [null]);
  assert.match(formatted.text, /^\[-\] X/);
});

test("the report separates cited sources, unused sources and invented numbers", () => {
  const sources = [
    { index: 1, title: "A", url: "https://a.example" },
    { index: 2, title: "B", url: "https://b.example" },
    { index: 6, title: "C", url: "https://c.example" },
  ];
  const report = citationReport("A says [1], and C agrees [6] and [1] again. Nothing supports [9].", sources);
  assert.deepEqual(report.cited, [1, 6]);
  assert.deepEqual(report.unresolved, [9]);
  assert.deepEqual(report.uncited, [2]);
});

test("numbers in code are not citations", () => {
  const sources = [{ index: 1, title: "A", url: "https://a.example" }];
  const report = citationReport("Call `rows[2]` first.\n\n```\nitems[1]\n```\n\nThen see [1].", sources);
  assert.deepEqual(report.cited, [1]);
  assert.deepEqual(report.unresolved, [], "an array index is not a missing source");
  assert.deepEqual(report.uncited, []);
});

test("a reply with no citations is reported as such, not as verified", () => {
  const report = citationReport("A plain answer.", [{ index: 1, title: "A", url: "https://a.example" }]);
  assert.deepEqual(report.cited, []);
  assert.deepEqual(report.unresolved, []);
  assert.deepEqual(report.uncited, [1]);
});
