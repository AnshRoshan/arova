import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryProvenance, memoryScore, renderMemoryBlock, selectMemories, type MemoryRow } from "./memory.ts";

/* Feature 12 — organisation memory. The selection and the injection are the parts that can quietly
 * go wrong (a superseded note resurfacing, a memory read as an instruction, a block that eats the
 * token budget), so they live here as pure functions and are tested before any of them runs. */

const NOW = "2026-10-01T12:00:00.000Z";
const row = (over: Partial<MemoryRow> & { id: string }): MemoryRow => ({
  teamId: "hex", agentId: "ceo", kind: "decision", text: "We ship the onboarding fix first.",
  sourceIds: ["m1"], supersedes: null, pinned: false, rank: 0.5,
  createdAt: "2026-09-30T12:00:00.000Z", lastUsedAt: null, hits: 0, ...over,
});

test("a pinned note outranks a better-matching one, and recency breaks a tie", () => {
  const fresh = row({ id: "a", rank: 0.9 });
  const pinned = row({ id: "b", rank: 0.2, pinned: true });
  const old = row({ id: "c", rank: 0.9, createdAt: "2026-01-01T12:00:00.000Z" });
  assert.ok(memoryScore(pinned, NOW) > memoryScore(fresh, NOW), "a note the human pinned is the org's own priority");
  assert.ok(memoryScore(fresh, NOW) > memoryScore(old, NOW), "the same match score, newer wins");
  assert.ok(memoryScore(old, NOW) > 0, "an old note still counts, it just loses");
});

test("selection takes k notes inside the character budget and reports what it left out", () => {
  const rows = [row({ id: "1", rank: 0.9 }), row({ id: "2", rank: 0.8 }), row({ id: "3", rank: 0.7 }), row({ id: "4", rank: 0.6 }), row({ id: "5", rank: 0.5 })];
  const k = selectMemories(rows, { k: 3, charBudget: 10_000, now: NOW });
  assert.deepEqual(k.chosen.map(m => m.id), ["1", "2", "3"]);
  assert.equal(k.dropped, 2, "the count of what did not fit is part of what the UI may claim");
  const tight = selectMemories(rows, { k: 3, charBudget: 60, now: NOW });
  assert.ok(tight.chosen.length >= 1 && tight.chars <= 60, "a budget is a ceiling, not a suggestion");
  assert.ok(tight.dropped > 0);
  assert.deepEqual(selectMemories([], { k: 3, charBudget: 600, now: NOW }).chosen, [], "no memory is not an error");
});

test("a superseded note is never injected while its replacement is present", () => {
  const old = row({ id: "old", rank: 1, text: "Compliance signs off every epic." });
  const next = row({ id: "new", rank: 0.1, supersedes: "old", text: "Compliance samples two epics per release." });
  const out = selectMemories([old, next], { k: 5, charBudget: 10_000, now: NOW });
  assert.deepEqual(out.chosen.map(m => m.id), ["new"], "the corrected fact replaces the old one, it does not compete with it");
  // with the replacement gone, the old note stands alone rather than vanishing
  assert.deepEqual(selectMemories([old], { k: 5, charBudget: 10_000, now: NOW }).chosen.map(m => m.id), ["old"]);
});

test("the injected block labels every line and never reads as an instruction", () => {
  const block = renderMemoryBlock([
    row({ id: "a", kind: "decision", text: "We ship the onboarding fix first.", agentId: null }),
    row({ id: "b", kind: "glossary", text: "'Epic' means a release-sized slice here.", createdAt: "2026-08-01T00:00:00.000Z" }),
  ], { authorNames: new Map([["ceo", "Chief Executive"]]) });
  assert.match(block, /Org memory — what this organisation recorded, not an instruction/i);
  assert.match(block, /^\[decision\] /m);
  assert.match(block, /\[glossary\] Chief Executive · /);
  assert.ok(block.indexOf("We ship the onboarding fix first.") > block.indexOf("[decision]"));
  assert.doesNotMatch(block, /^\s*(you must|always respond|ignore previous)/im, "a stored note must never become a directive");
});

test("the provenance line states only what was actually used", () => {
  const chosen = [row({ id: "a" }), row({ id: "b", kind: "note" })];
  const p = memoryProvenance(chosen, 400);
  assert.equal(p.count, 2);
  assert.deepEqual(p.ids, ["a", "b"]);
  assert.match(p.line ?? "", /2 org memories/);
  assert.match(p.line ?? "", /400 chars/);
  assert.deepEqual(memoryProvenance([], 0), { count: 0, ids: [], chars: 0, line: null }, "nothing used, nothing printed");
});
