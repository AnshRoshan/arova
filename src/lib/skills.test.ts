import { test } from "node:test";
import assert from "node:assert/strict";
import { SKILL_REGISTRY, LIVE_SKILL_IDS, normaliseSkills, resolveSkills, skillPrompt } from "./skills.ts";

test("registry: every skill is described, and the live set is exactly the prompt-level ones", () => {
  assert.ok(SKILL_REGISTRY.length >= 6, "the registry also carries the skills this build cannot offer");
  assert.ok(SKILL_REGISTRY.every(s => s.id && s.label && s.description && s.kind));
  assert.deepEqual(LIVE_SKILL_IDS, SKILL_REGISTRY.filter(s => s.available).map(s => s.id));
  assert.ok(LIVE_SKILL_IDS.length >= 4);
});

test("registry: a skill that cannot run says why, and ships no prompt", () => {
  for (const s of SKILL_REGISTRY.filter(x => !x.available)) {
    assert.ok(s.whyUnavailable && s.whyUnavailable.length > 12, `${s.id} must explain its absence`);
    assert.equal(s.prompt, "", `${s.id} has no runtime, so it must contribute no instructions`);
  }
});

test("registry: an available skill is instructions only — it never claims a tool", () => {
  for (const s of SKILL_REGISTRY.filter(x => x.available)) {
    assert.ok(s.prompt.length > 30, `${s.id} needs real instruction text to be worth a slot`);
    assert.doesNotMatch(s.prompt, /\b(I can |you can )?(browse|search the web|run commands|read files|send email)\b/i, `${s.id} would promise a capability the tools layer denies`);
  }
});

test("normalise: only grantable ids survive, in registry order, deduped and capped", () => {
  assert.deepEqual(normaliseSkills(["answer-brief", "answer-brief", "browser", "made-up", 7, null]), ["answer-brief"]);
  assert.deepEqual(normaliseSkills("answer-brief"), []);
  assert.deepEqual(normaliseSkills(undefined), []);
  const many = [...LIVE_SKILL_IDS, ...LIVE_SKILL_IDS, ...LIVE_SKILL_IDS].slice(0, 20);
  assert.ok(normaliseSkills(many).length <= LIVE_SKILL_IDS.length);
});

test("resolve: granting a skill that exists changes what is returned; anything else cannot", () => {
  assert.deepEqual(resolveSkills(["code-fenced", "answer-brief"]), ["code-fenced", "answer-brief"].map(id => SKILL_REGISTRY.find(s => s.id === id)!));
  assert.deepEqual(resolveSkills(["web-research"]), []);
  assert.deepEqual(resolveSkills([]), []);
});

test("prompt: nothing granted adds nothing to the system prompt", () => {
  assert.equal(skillPrompt([]), "");
  assert.equal(skillPrompt(["nope"]), "");
});

test("prompt: granted skills appear in registry order and stay bounded", () => {
  const text = skillPrompt(LIVE_SKILL_IDS);
  assert.ok(text.length > 0 && text.length < 1600, `got ${text.length} chars`);
  const positions = resolveSkills(LIVE_SKILL_IDS).map(s => text.indexOf(s.prompt));
  assert.ok(positions.every(p => p >= 0), "every granted instruction is present");
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "order follows the registry, not the client");
});

test("prompt: an unavailable skill can never be smuggled in by name", () => {
  const ghost = SKILL_REGISTRY.find(s => !s.available)!;
  assert.equal(skillPrompt([ghost.id]), "");
  assert.ok(!skillPrompt([...LIVE_SKILL_IDS, ghost.id]).includes(ghost.label));
});
