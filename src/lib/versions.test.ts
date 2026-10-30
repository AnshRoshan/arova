import { test } from "node:test";
import assert from "node:assert/strict";
import { needsVersion, nextVersion, sameSnapshot } from "./versions.ts";

const base = { instructions: "Be brief.", provider: "auto", capabilities: { tools: ["calc"] } };

test("version numbers are monotonic", () => {
  assert.equal(nextVersion(0), 1);
  assert.equal(nextVersion(7), 8);
  assert.equal(nextVersion(-3), 1);
});

test("an unchanged seat does not publish a new version", () => {
  assert.equal(needsVersion(base, { ...base }), false);
  assert.equal(needsVersion(base, { ...base, capabilities: { tools: ["calc"] } }), false, "key order does not matter");
});

test("an instruction, provider or capability change publishes one", () => {
  assert.equal(needsVersion(base, { ...base, instructions: "Be verbose." }), true);
  assert.equal(needsVersion(base, { ...base, provider: "openai" }), true);
  assert.equal(needsVersion(base, { ...base, capabilities: { tools: ["calc", "web_fetch"] } }), true);
  assert.equal(sameSnapshot(base, { ...base, capabilities: null }), false);
});

test("no previous version always publishes", () => {
  assert.equal(needsVersion(null, base), true);
});
