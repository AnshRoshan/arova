import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown, safeHref, splitReasoning, type Block, type Inline } from "./markdown.ts";

const pick = <K extends Block["kind"]>(blocks: Block[], kind: K): Extract<Block, { kind: K }>[] =>
  blocks.filter((b): b is Extract<Block, { kind: K }> => b.kind === kind);
const first = <K extends Block["kind"]>(blocks: Block[], kind: K): Extract<Block, { kind: K }> => {
  const found = pick(blocks, kind);
  assert.equal(found.length, 1, `expected exactly one ${kind} block`);
  return found[0];
};
const text = (inline: Inline[]) => inline.map(i => i.text).join("");

test("plain prose is one paragraph, and a single newline stays inside it", () => {
  const blocks = parseMarkdown("line one\nline two\n\nline three");
  assert.equal(blocks.length, 2);
  assert.equal(text(blocks[0].kind === "paragraph" ? blocks[0].inline : []), "line one\nline two");
  assert.equal(text(blocks[1].kind === "paragraph" ? blocks[1].inline : []), "line three");
});

test("emphasis and inline code parse in the right order", () => {
  const p = first(parseMarkdown("Use **npm test** and `npm run dev`, *please*"), "paragraph");
  assert.deepEqual(p.inline.map(i => [i.kind, i.text]), [
    ["text", "Use "],
    ["strong", "npm test"],
    ["text", " and "],
    ["code", "npm run dev"],
    ["text", ", "],
    ["em", "please"],
  ]);
});

test("a fenced block keeps its language and its literal text", () => {
  const blocks = parseMarkdown("before\n```ts\nconst x = 1; // **not bold**\n```\nafter");
  assert.deepEqual(blocks.map(b => b.kind), ["paragraph", "code", "paragraph"]);
  const code = first(blocks, "code");
  assert.equal(code.lang, "ts");
  assert.equal(code.text, "const x = 1; // **not bold**");
});

test("a fence the stream never closed still renders as code, not as prose", () => {
  const blocks = parseMarkdown("Here you go:\n```python\ndef a():\n    return 1");
  const code = first(blocks, "code");
  assert.equal(code.lang, "python");
  assert.equal(code.text, "def a():\n    return 1");
});

test("lists are collected in order and stop at a blank line", () => {
  const blocks = parseMarkdown("- first\n- second\n\n3. a\n2. b");
  assert.deepEqual(blocks.map(b => b.kind), ["list", "list"]);
  const [bullets, numbers] = pick(blocks, "list");
  assert.equal(bullets.ordered, false);
  assert.deepEqual(bullets.items.map(text), ["first", "second"]);
  assert.equal(numbers.ordered, true);
  assert.deepEqual(numbers.items.map(text), ["a", "b"]);
});

test("a list item that starts with bold keeps the emphasis", () => {
  const list = first(parseMarkdown("- **Scout**: 3 rows found"), "list");
  assert.deepEqual(list.items[0].map(i => i.kind), ["strong", "text"]);
});

test("headings never outrank the page title", () => {
  assert.deepEqual(parseMarkdown("# One\n### Three\n##### Five").map(b => (b.kind === "heading" ? b.level : b.kind)), [2, 3, 3]);
});

test("thematic breaks and blockquotes are their own blocks", () => {
  assert.deepEqual(parseMarkdown("a\n\n---\n\n> quoted line").map(b => b.kind), ["paragraph", "rule", "quote"]);
});

test("only web links become anchors", () => {
  assert.equal(safeHref("https://x.dev/a?b=1"), "https://x.dev/a?b=1");
  assert.equal(safeHref("http://x.dev"), "http://x.dev");
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,x"), null);
  assert.equal(safeHref("/relative"), null);
  const p = first(parseMarkdown("see [docs](https://x.dev) and [oops](javascript:alert(1))"), "paragraph");
  assert.deepEqual(p.inline.filter(i => i.kind === "link").map(i => i.href), ["https://x.dev"]);
  assert.ok(text(p.inline).includes("oops"), "a rejected link still shows its text");
});

test("nothing is dropped: every word of the input survives into the output", () => {
  const src = "intro\n\n- one\n- two\n\n```sh\nnpm run build\n```\n\n**tight** tail\n> note\n## head";
  const flat = JSON.stringify(parseMarkdown(src)).replace(/[^\w]/g, "");
  for (const word of src.replace(/```/g, "").split(/[^\w]+/).filter(Boolean)) {
    assert.ok(flat.includes(word), `lost word: ${word}`);
  }
});

test("indentation inside a paragraph survives: some endpoints emit code without fences", () => {
  const blocks = parseMarkdown("def say_hello():\n    print(\"hello\")\n\nDone.");
  assert.equal(blocks.length, 2);
  assert.equal(text(blocks[0].kind === "paragraph" ? blocks[0].inline : []), "def say_hello():\n    print(\"hello\")");
});

test("empty input produces no blocks", () => {
  assert.deepEqual(parseMarkdown(""), []);
  assert.deepEqual(parseMarkdown("   \n\n  \n"), []);
});

test("a closed reasoning block separates from the answer without losing either", () => {
  const r = splitReasoning("<think>\nweighed two options\n</think>\n\nThe answer is **two**.");
  assert.equal(r.reasoning, "weighed two options");
  assert.equal(r.answer, "The answer is **two**.");
});

test("a reasoning block the stream has not closed folds too, so the live row stays readable", () => {
  const r = splitReasoning("<think>\nstill writing the rationale");
  assert.equal(r.reasoning, "still writing the rationale");
  assert.equal(r.answer, "");
});

test("a reasoning block that arrives after other text still splits out of the answer", () => {
  // The channel prints its own header line before the model answer, so the block is never leading.
  const r = splitReasoning("Chief Executive reports: built on 1 teammate post.\n\n<think>\nweighed it\n</think>\n\nFix the onboarding step.");
  assert.equal(r.reasoning, "weighed it");
  assert.equal(r.answer, "Chief Executive reports: built on 1 teammate post.\n\nFix the onboarding step.");
  assert.doesNotMatch(r.answer, /<\/?think>/, "no tag may leak into what the reader is shown as the answer");
});

test("only a leading block is reasoning; prose that mentions the tag stays intact", () => {
  assert.deepEqual(splitReasoning("plain reply"), { reasoning: null, answer: "plain reply", rest: "plain reply" });
  const mentioned = splitReasoning("Use <think> to wrap notes.\n\nDone.");
  assert.equal(mentioned.reasoning, null);
  assert.equal(mentioned.answer, "Use <think> to wrap notes.\n\nDone.");
});

test("a reasoning block the model never closed still folds: the tag leaks into content", () => {
  const leaked = splitReasoning("<think>keep weighing options\nmore thinking\nI cannot provide an estimate without scope.");
  assert.equal(leaked.reasoning, "keep weighing options\nmore thinking\nI cannot provide an estimate without scope.");
  assert.equal(leaked.answer, "");
  // `rest` is the other question: what is left when only a *closed* block is removed. An unclosed one
  // keeps its raw text, so a directive that follows it is still findable by the parsers that use it.
  assert.ok(leaked.rest.includes("keep weighing options"));
  const closed = splitReasoning("<think>thought\n</think>\nThe answer.");
  assert.equal(closed.answer, "The answer.");
});

