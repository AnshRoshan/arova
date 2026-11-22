import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveSkillGrants, savedSkillPrompt, skillAppliesTo, skillExport, skillImport, slugify, nextVersion } from "./saved-skills.ts";

/**
 * Spec 23 — saved skills. A skill is a capability bundle: instructions + tool grants + scope.
 * The effective grant is skill ∩ seat — a skill can never widen access; versions are immutable;
 * the portable payload is Markdown + frontmatter, not a bespoke DSL.
 */

const seatCaps = { tools: ["web_fetch", "save_note"], deniedTools: [], permissionMode: "act" };

test("effective grants are the intersection — a skill cannot escalate", () => {
  assert.deepEqual(effectiveSkillGrants(["web_fetch", "run_command"], seatCaps as never), ["web_fetch"]);
  assert.deepEqual(effectiveSkillGrants([], seatCaps as never), []);
});

test("scope decides who is offered a skill", () => {
  const org = { scope: "org", teamId: null, agentId: null };
  const team = { scope: "team", teamId: "t1", agentId: null };
  const seat = { scope: "seat", teamId: null, agentId: "a1" };
  assert.equal(skillAppliesTo(org, { teamId: "t9", id: "a9" }, true), true, "org scope reaches every seat");
  assert.equal(skillAppliesTo(team, { teamId: "t1", id: "a9" }, true), true);
  assert.equal(skillAppliesTo(team, { teamId: "t2", id: "a9" }, true), false, "another team's seat is out of scope");
  assert.equal(skillAppliesTo(seat, { teamId: "t1", id: "a1" }, true), true);
  assert.equal(skillAppliesTo(seat, { teamId: "t1", id: "a2" }, true), false);
  assert.equal(skillAppliesTo(org, { teamId: null, id: "a9" }, false), true, "bench seats still get org skills");
  assert.equal(skillAppliesTo(team, { teamId: null, id: "a9" }, false), false, "a bench seat gets no team skill");
});

test("the prompt section names the skill and its instructions, bounded", () => {
  const prompt = savedSkillPrompt([
    { name: "Vendor triage", instructions: "Check the status page first, then record a note.", grants: ["web_fetch"] },
  ], new Map([["web_fetch", true]]));
  assert.ok(prompt.includes("Vendor triage"));
  assert.ok(prompt.includes("Check the status page first"));
  assert.equal(savedSkillPrompt([], new Map()), "", "no skills, no section");
});

test("versions increment and never exceed the count of stored versions", () => {
  assert.equal(nextVersion(1, 1), 2);
  assert.equal(nextVersion(3, 3), 4);
});

test("slugify is stable and URL-safe", () => {
  assert.equal(slugify("Vendor Triage — Weekly!"), "vendor-triage-weekly");
  assert.equal(slugify("  A  B  "), "a-b");
});

test("export is markdown with frontmatter; import round-trips and refuses junk", () => {
  const md = skillExport({ name: "Vendor triage", description: "Watch the vendor.", scope: "org", instructions: "Check the page.", toolGrants: ["web_fetch"], version: 2 });
  assert.ok(md.startsWith("---"));
  assert.ok(md.includes("name: Vendor triage"));
  assert.ok(md.includes("Check the page."));
  const back = skillImport(md);
  assert.ok(back);
  assert.equal(back!.name, "Vendor triage");
  assert.deepEqual(back!.toolGrants, ["web_fetch"]);
  assert.equal(back!.version, 2);
  assert.equal(skillImport("not a skill at all"), null);
  assert.equal(skillImport("---\nname: X\nno closing fence"), null);
});
