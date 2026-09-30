import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_MEMBERS, decollideOrg, normaliseOrg, orgTemplate, orgTree, reachableFor, reportsOf, type OrgMember } from "./org.ts";

const m = (name: string, role: string, reportsTo: string | null = null): OrgMember => ({ name, role, instructions: `${name} does ${role}.`, reportsTo });

test("normalise: a well-formed org survives, junk does not", () => {
  const org = normaliseOrg({ team: "Nexus Labs", brief: "a product company", members: [m("CEO", "Strategy"), m("PO", "Product", "CEO"), m("Dev", "Build", "PO")] });
  assert.equal(org?.team, "Nexus Labs");
  assert.deepEqual(org?.members.map(x => [x.name, x.reportsTo]), [["CEO", null], ["PO", "CEO"], ["Dev", "PO"]]);
  assert.equal(normaliseOrg(null), null);
  assert.equal(normaliseOrg({ team: "x", members: [] }), null);
  assert.equal(normaliseOrg({ team: "x", members: [{ role: "no name" }, { name: "" }] }), null);
});

test("normalise: names are unique, roles are required, and the roster is capped", () => {
  const many = Array.from({ length: 30 }, (_, i) => m(`Agent ${i}`, `Role ${i}`, i ? `Agent ${i - 1}` : null));
  const org = normaliseOrg({ team: "Big", members: many })!;
  assert.equal(org.members.length, MAX_MEMBERS);
  const dup = normaliseOrg({ team: "Dup", members: [m("Sam", "A"), m("sam", "B"), m("Sam", "C", "Sam")] })!;
  assert.deepEqual(dup.members.map(x => x.name), ["Sam", "sam-2", "Sam-3"], "a repeated seat is renamed, never dropped: its role is still information");
});

test("normalise: a reporting line to someone who does not exist is dropped, not invented", () => {
  const org = normaliseOrg({ team: "T", members: [m("Boss", "Runs it", "Ghost"), m("Worker", "Does it", "Boss")] })!;
  assert.equal(org.members[0].reportsTo, null);
  assert.equal(org.members[1].reportsTo, "Boss");
});

test("normalise: a cycle is broken at the deeper link so the tree can never loop", () => {
  const org = normaliseOrg({ team: "T", members: [m("A", "one", "C"), m("B", "two", "A"), m("C", "three", "B")] })!;
  assert.equal(org.members[0].reportsTo, null, "the first member becomes the root");
  assert.equal(org.members[1].reportsTo, "A");
  assert.equal(org.members[2].reportsTo, "B");
  const tree = orgTree(org.members);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].descendants, 2);
});

test("normalise: self-management is impossible", () => {
  const org = normaliseOrg({ team: "T", members: [m("Solo", "everything", "Solo")] })!;
  assert.equal(org.members[0].reportsTo, null);
});

test("template: the product company has a Product Owner and a real tree", () => {
  const org = orgTemplate("Nexus Labs", "Ship a product");
  assert.ok(org.members.length >= 6 && org.members.length <= MAX_MEMBERS);
  assert.ok(org.members.some(x => /product owner/i.test(`${x.name} ${x.role}`)));
  const names = new Set(org.members.map(x => x.name));
  for (const member of org.members) {
    if (member.reportsTo) assert.ok(names.has(member.reportsTo), `${member.name} reports to nobody named ${member.reportsTo}`);
  }
  assert.equal(org.members.filter(x => x.reportsTo === null).length, 1, "exactly one root");
  assert.ok(org.members.every(x => x.instructions.length > 20), "every seat ships with a duty, not a title");
});

test("reports: only direct reports come back, and the tree counts the whole subtree", () => {
  const rows = [{ id: "ceo", name: "CEO", managerId: null }, { id: "po", name: "PO", managerId: "ceo" }, { id: "dev", name: "Dev", managerId: "po" }];
  assert.deepEqual(reportsOf(rows, "ceo").map(r => r.id), ["po"]);
  assert.deepEqual(reportsOf(rows, "nobody"), []);
  const tree = orgTree([{ name: "CEO", reportsTo: null }, { name: "PO", reportsTo: "CEO" }, { name: "Dev", reportsTo: "PO" }]);
  assert.deepEqual(tree[0].children.map(c => c.name), ["PO"]);
  assert.equal(tree[0].children[0].descendants, 1);
});

test("reachable: an agent may talk to its reports, its manager, and its teammates — nobody else", () => {
  const rows = [
    { id: "ceo", name: "CEO", managerId: null, teamId: "t1" },
    { id: "po", name: "PO", managerId: "ceo", teamId: "t1" },
    { id: "cto", name: "CTO", managerId: "ceo", teamId: "t1" },
    { id: "dev", name: "Dev", managerId: "cto", teamId: "t1" },
    { id: "far", name: "Other", managerId: null, teamId: "t2" },
  ];
  assert.deepEqual(reachableFor(rows, "cto").map(r => r.id).sort(), ["ceo", "dev", "po"]);
  assert.deepEqual(reachableFor(rows, "dev").map(r => r.id).sort(), ["cto"]);
  assert.deepEqual(reachableFor(rows, "far").map(r => r.id), [], "an agent in another org reaches nobody");
  assert.deepEqual(reachableFor(rows, "ceo").map(r => r.id).sort(), ["po", "cto"].sort());
});

test("reachable: a lone agent with no org reaches nobody", () => {
  assert.deepEqual(reachableFor([{ id: "x", name: "X", managerId: null }], "x"), []);
  assert.deepEqual(reachableFor([], "x"), []);
});

test("decollide: a clashing seat is renamed and its reports follow the new name", () => {
  const org = normaliseOrg({ team: "T", members: [m("Dev", "Builds"), m("QA", "Tests", "Dev")] })!;
  const out = decollideOrg(org, ["Dev"]);
  assert.deepEqual(out.members.map(x => [x.name, x.reportsTo]), [["Dev-2", null], ["QA", "Dev-2"]]);
  assert.equal(org.members[0].name, "Dev", "the input is not mutated");
});
