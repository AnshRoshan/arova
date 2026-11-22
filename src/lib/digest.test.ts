import { test } from "node:test";
import assert from "node:assert/strict";
import { digestSections, renderDigest } from "./digest.ts";

/** Spec 44 — the digest is model-free and sectioned; a quiet day states itself. */

const facts = (over: Record<string, unknown> = {}) => ({
  attention: [], paused: [], deadLettered: [],
  queue: { workerLive: false, pending: 0 },
  sinceLabel: null, ...over,
}) as Parameters<typeof digestSections>[0];

test("urgent attention gets its own section ahead of the rest", () => {
  const s = digestSections(facts({ attention: [
    { title: "watch paused", severity: "urgent", body: "3 failures in a row" },
    { title: "page changed", severity: "attention", body: "the release page moved" },
  ] }));
  assert.equal(s[0].heading, "Needs you now");
  assert.equal(s[1].heading, "Attention");
});

test("a dead-lettered job quotes its recorded error, not a guess", () => {
  const s = digestSections(facts({ deadLettered: [{ kind: "trigger_brief", lastError: "The run ended failed." }] }));
  assert.match(s[0].lines[0], /trigger_brief — The run ended failed/);
});

test("the quiet day is stated, not skipped: only the queue section, saying so", () => {
  const text = renderDigest("Hex", facts(), new Date("2026-11-23T08:00:00Z"));
  assert.match(text, /Everything the ladder watches is quiet/);
});

test("no live worker is named as the reason work waits", () => {
  const s = digestSections(facts({ queue: { workerLive: false, pending: 4 } }));
  assert.match(s[s.length - 1].lines[0], /No live worker — 4 queued job/);
});

test("a live worker states the same queue honestly", () => {
  const s = digestSections(facts({ queue: { workerLive: true, pending: 2 } }));
  assert.match(s[s.length - 1].lines[0], /worker is live; 2 job/);
});
