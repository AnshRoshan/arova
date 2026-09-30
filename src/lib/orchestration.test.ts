import { test } from "node:test";
import assert from "node:assert/strict";
import { isOrgIntent, mentionConsult, ORG_SYSTEM, buildPeerPrompt, canConsult, cleanConsult, decollide, extractRoster, fallbackRoster, isTeamIntent, normaliseRoster, parseRouting, parseTurn, resolvePeer, routingPrompt } from "./orchestration.ts";


test("turn: plain prose is an answer, not a consult", () => {
  const r = parseTurn("Here is my take on the positioning.");
  assert.equal(r.consult, null);
  assert.equal(r.text, "Here is my take on the positioning.");
});


test("turn: a fenced JSON directive is extracted and stripped from the prose", () => {
  const raw = 'I need pricing input.\n```json\n{"consult":{"agent":"Atlas","question":"What do rivals charge?"}}\n```\n';
  const r = parseTurn(raw);
  assert.deepEqual(r.consult, { agent: "Atlas", question: "What do rivals charge?" });
  assert.equal(r.text, "I need pricing input.");
});


test("turn: a bare directive inline in prose is still found", () => {
  const r = parseTurn('Deferring to the reviewer: {"consult":{"agent":"Pixel","question":"critique this"}}');
  assert.equal(r.consult?.agent, "Pixel");
  assert.equal(r.text, "Deferring to the reviewer:");
});


test("turn: malformed JSON must never swallow the reply", () => {
  const raw = 'My answer stands. {"consult":{"agent":"Atlas" broken';
  const r = parseTurn(raw);
  assert.equal(r.consult, null);
  assert.equal(r.text, raw);
});


test("turn: a directive without a question is not a usable consult", () => {
  assert.equal(parseTurn('{"consult":{"agent":"Atlas"}}').consult, null);
  assert.equal(parseTurn('{"consult":{"question":"hi"}}').consult, null);
});


test("team intent: recognises a request to build a team of agents", () => {
  for (const p of ["create a product agency", "build me a team of agents for growth", "make a family of agents that cover marketing", "assemble a squad to plan launches"]) {
    assert.equal(isTeamIntent(p), true, `should match: ${p}`);
  }
});


test("team intent: does not fire on ordinary chat or routine requests", () => {
  for (const p of ["what is a good product", "remind me every morning to check email", "the team meeting is at noon", "summarise this"]) {
    assert.equal(isTeamIntent(p), false, `should not match: ${p}`);
  }
});


test("roster: a valid model roster is trimmed, deduped and capped", () => {
  const roster = normaliseRoster({
    team: "Product Studio",
    agents: [
      { name: " Nova ", role: "Product lead", instructions: "Owns the roadmap." },
      { name: "Atlas", role: "Researcher", instructions: "Finds evidence." },
      { name: "atlas", role: "Duplicate", instructions: "" },
      { name: "", role: "Nameless", instructions: "" },
      { name: "Five", role: "R5", instructions: "" },
      { name: "Six", role: "R6", instructions: "" },
      { name: "Seven", role: "R7", instructions: "" },
    ],
  })!;
  assert.equal(roster.team, "Product Studio");
  assert.equal(roster.agents.length, 4, "drops the nameless and duplicate, caps at 4");
  assert.equal(roster.agents[0].name, "Nova", "whitespace trimmed");
  assert.deepEqual(Object.keys(roster.agents[0]).sort(), ["instructions", "name", "role"]);
});


test("roster: fewer than two usable agents is not a team", () => {
  assert.equal(normaliseRoster({ team: "X", agents: [{ name: "Solo", role: "Only", instructions: "" }] }), null);
  assert.equal(normaliseRoster("nonsense"), null);
  assert.equal(normaliseRoster(null), null);
});


test("roster fallback: derives a deterministic team with no model call", () => {
  const roster = fallbackRoster("create a product agency")!;
  assert.ok(roster.agents.length >= 3, "a real family, not a placeholder");
  assert.ok(roster.agents.every(a => a.name && a.role), "every entry is creatable");
  assert.match(roster.team, /\S/);
  assert.equal(fallbackRoster("create a product agency")!.team, roster.team, "stable, not random");
});


test("roster fallback: refuses to invent a team for an unrelated request", () => {
  assert.equal(fallbackRoster("what is the capital of France"), null);
});


test("peer resolution: case-insensitive, prefix tolerant, never the caller", () => {
  const roster = [{ id: "a1", name: "Atlas" }, { id: "p1", name: "Pixel" }];
  assert.equal(resolvePeer("atlas", roster, "p1")?.id, "a1");
  assert.equal(resolvePeer("Atlas Q", roster, "p1")?.id, "a1");
  assert.equal(resolvePeer("Nobody", roster, "p1"), null);
  assert.equal(resolvePeer("Pixel", roster, "p1"), null, "an agent must not consult itself");
});


test("hop budget: consulted peers count against the ceiling", () => {
  assert.equal(canConsult([], 1), true);
  assert.equal(canConsult(["a1"], 1), false);
  assert.equal(canConsult(["a1"], 0), false, "0 disables delegation entirely");
  assert.equal(canConsult(["a1", "p1"], 3), true);
});


test("peer prompt: carries the peer's own role, the question, and the tool boundary", () => {
  const prompt = buildPeerPrompt({ name: "Atlas", role: "Research analyst", instructions: "Compare sources." }, "What do rivals charge?", "Nova");
  assert.match(prompt, /Research analyst/);
  assert.match(prompt, /Compare sources\./);
  assert.match(prompt, /What do rivals charge\?/);
  assert.match(prompt, /Nova/, "the peer knows who is asking");
  assert.match(prompt, /no browser|no tools|cannot access/i, "the boundary is stated to the peer too");
});


test("peer resolution: case-insensitive, prefix tolerant, never the caller", () => {
  const roster = [{ id: "a1", name: "Atlas" }, { id: "p1", name: "Pixel" }];
  assert.equal(resolvePeer("atlas", roster, "p1")?.id, "a1");
  assert.equal(resolvePeer("Atlas Q", roster, "p1")?.id, "a1");
  assert.equal(resolvePeer("Nobody", roster, "p1"), null);
  assert.equal(resolvePeer("Pixel", roster, "p1"), null, "an agent must not consult itself");
});


test("hop budget: consulted peers count against the ceiling", () => {
  assert.equal(canConsult([], 1), true);
  assert.equal(canConsult(["a1"], 1), false);
  assert.equal(canConsult(["a1"], 0), false, "0 disables delegation entirely");
  assert.equal(canConsult(["a1", "p1"], 3), true);
});


test("peer prompt: carries the peer's own role, the question, and the tool boundary", () => {
  const prompt = buildPeerPrompt({ name: "Atlas", role: "Research analyst", instructions: "Compare sources." }, "What do rivals charge?", "Nova");
  assert.match(prompt, /Research analyst/);
  assert.match(prompt, /Compare sources\./);
  assert.match(prompt, /What do rivals charge\?/);
  assert.match(prompt, /Nova/, "the peer knows who is asking");
  assert.match(prompt, /no browser|no tools|cannot access/i, "the boundary is stated to the peer too");
});


test("extractRoster: reads a roster from bare, fenced or prose-wrapped model output", () => {
  const NL = String.fromCharCode(10);
  const good = { team: "Product Studio", agents: [{ name: "Nova", role: "Lead", instructions: "x" }, { name: "Atlas", role: "Research", instructions: "y" }] };
  const json = JSON.stringify(good);
  assert.equal(extractRoster(json)!.team, "Product Studio");
  assert.equal(extractRoster("Sure!" + NL + "```json" + NL + json + NL + "```" + NL + "Hope that helps.")!.agents.length, 2);
  assert.equal(extractRoster("Here is a team: " + json + " - approve it?")!.team, "Product Studio");
  assert.equal(extractRoster("I cannot help with that"), null);
});


test("decollide: renames clashes instead of deleting agents", () => {
  const roster = { team: "T", agents: [{ name: "Scout", role: "a", instructions: "" }, { name: "Nova", role: "b", instructions: "" }] };
  const out = decollide(roster, ["Nova", "Atlas", "scout"]);
  assert.equal(out.agents.length, 2, "nothing is dropped");
  assert.equal(out.agents[0].name, "Scout 2", "case-insensitive clash is renamed");
  assert.equal(out.agents[1].name, "Nova 2");
  assert.equal(roster.agents[0].name, "Scout", "input is not mutated");
});


test("fallback rosters avoid the seeded demo names", () => {
  const seeded = new Set(["nova", "atlas", "pixel"]);
  const roster = fallbackRoster("create a product agency")!;
  assert.equal(roster.agents.filter(a => seeded.has(a.name.toLowerCase())).length, 0, "a fresh demo can create this team without name clashes");
});


test("routingPrompt: states both shapes and the roster", () => {
  const p = routingPrompt("should we ship recovery mode?", [{ id: "s1", name: "Scout" }], { consult: true, handoff: false, approval: false, build: false });
  assert.match(p, /\{"consult":null\}/);
  assert.match(p, /"agent":"<teammate name>"/);
  assert.match(p, /Scout/);
  assert.match(p, /recovery mode/);
});


test("routing: the model's decision is read with the same parser as an answer", () => {
  assert.equal(parseTurn('{"consult":null}').consult, null);
  assert.deepEqual(parseTurn('{"consult":{"agent":"Scout","question":"evidence?"}}').consult, { agent: "Scout", question: "evidence?" });
  assert.equal(parseTurn("I will answer this myself, no consult needed.").consult, null);
});

test("routingPrompt: an explicit request for a teammate outranks default restraint", () => {
  const p = routingPrompt("Ask Scout for the evidence, then recommend", [{ id: "s1", name: "Scout" }], { consult: true, handoff: true, approval: true, build: true });
  assert.match(p, /naming a teammate/);
  assert.match(p, /genuinely beats the asker.s own/);
});

test("cleanConsult: a template echoed back is repaired or rejected, never forwarded", () => {
  const asked = "What does the evidence say about retention features?";
  assert.deepEqual(cleanConsult({ agent: "Scout", question: "<the single question for them>" }, asked), { agent: "Scout", question: asked });
  assert.equal(cleanConsult({ agent: "<teammate name>", question: "real question" }, asked), null);
  assert.deepEqual(cleanConsult({ agent: "Scout", question: "actual question" }, asked), { agent: "Scout", question: "actual question" });
});

test("routing prompt: only the actions the agent is granted are offered", () => {
  const open = routingPrompt("ship or not?", [{ id: "s1", name: "Scout" }], { consult: true, handoff: true, approval: true, build: true });
  assert.match(open, /"handoff"/);
  assert.match(open, /"approval"/);
  const consultOnly = routingPrompt("ship or not?", [{ id: "s1", name: "Scout" }], { consult: true, handoff: false, approval: false, build: false });
  assert.ok(!/"handoff"/.test(consultOnly), "a tool the agent does not have must not be offered to it");
  assert.ok(!/"approval"/.test(consultOnly));
  const nothing = routingPrompt("hello", [], { consult: false, handoff: false, approval: false, build: false });
  assert.match(nothing, /"consult":null/);
});

test("parseRouting: reads each action shape and ignores prose", () => {
  assert.deepEqual(parseRouting('{"consult":null}'), { action: "none" });
  assert.deepEqual(parseRouting('{"consult":{"agent":"Scout","question":"evidence?"}}'), { action: "consult", agent: "Scout", question: "evidence?" });
  assert.deepEqual(parseRouting('{"handoff":{"agent":"Scout","reason":"this is their call"}}'), { action: "handoff", agent: "Scout", reason: "this is their call" });
  assert.deepEqual(parseRouting('{"approval":{"title":"Send the email","detail":"To 3 recipients"}}'), { action: "approval", title: "Send the email", detail: "To 3 recipients" });
  assert.deepEqual(parseRouting("I will just answer this one myself."), { action: "none" });
  assert.deepEqual(parseRouting('{"consult":{"agent":"<teammate name>","question":"x"}}'), { action: "none" }, "an echoed placeholder is not a decision");
});

test("routing: a build directive becomes a validated org, not raw model JSON", () => {
  const raw = JSON.stringify({ build: { team: "Nexus Labs", brief: "ship it", members: [
    { name: "Product Owner", role: "Backlog", instructions: "Own the order of work.", reportsTo: null },
    { name: "Developer", role: "Build", instructions: "Build it.", reportsTo: "Product Owner" },
    { name: "Ghost", role: "Nowhere", instructions: "Reports to a seat that is not above it.", reportsTo: "Imagined" },
  ] } });
  const r = parseRouting(raw);
  assert.equal(r.action, "build");
  assert.equal(r.org?.team, "Nexus Labs");
  assert.deepEqual(r.org?.agents.map(a => [a.name, a.reportsTo]), [["Product Owner", null], ["Developer", "Product Owner"], ["Ghost", null]]);
});

test("routing: a build that is not an org is refused", () => {
  assert.equal(parseRouting(JSON.stringify({ build: { team: "T", members: [{ name: "Solo", role: "All" }] } })).action, "none");
  assert.equal(parseRouting(JSON.stringify({ build: { team: "T", members: "not a list" } })).action, "none");
  assert.equal(parseRouting('Sure! I will build that company for you. {"build": bad json').action, "none");
});

test("routing: the build option only appears when the agent holds the tool", () => {
  const withBuild = routingPrompt("make me a company", [], { consult: false, handoff: false, approval: false, build: true });
  assert.ok(withBuild.includes('"build"'), "the shape must be offered");
  assert.ok(!routingPrompt("make me a company", [], { consult: false, handoff: false, approval: false, build: false }).includes('"build"'));
});

test("intent: an organisation is recognised separately from a flat team", () => {
  assert.equal(isOrgIntent("create a company with all the roles as agents, a product owner on top"), true);
  assert.equal(isOrgIntent("make me an organisation where the CTO has engineers reporting to them"), true);
  assert.equal(isOrgIntent("what is 2 + 2"), false);
  assert.equal(isOrgIntent("tell the team I said hi"), false, "mentioning a team is not asking to create one");
});

test("org prompt: the shape that keeps the chart acyclic is the one offered", () => {
  assert.ok(ORG_SYSTEM.includes("reportsTo"));
  assert.ok(ORG_SYSTEM.includes("only report to a seat already listed above"));
});

test("mention route: naming a teammate is enough to reach them, even when the router runs out of tokens", () => {
  const roster = [{ id: "d", name: "Developer", role: "Implementation" }, { id: "q", name: "QA", role: "Acceptance" }, { id: "c", name: "Chief Technology", role: "Architecture" }];
  const hit = mentionConsult("Ask your Developer how long the login migration will really take", roster, "c");
  assert.equal(hit?.agent, "Developer");
  assert.ok(hit?.question.includes("login migration"), "the question carries the user's own ask");
  assert.equal(mentionConsult("how are you?", roster, "c"), null);
  assert.equal(mentionConsult("ask the Developer and QA both", roster, "c"), null, "two names is a judgement call, not a route");
  assert.equal(mentionConsult("ask the developer", [], "c"), null);
  assert.equal(mentionConsult("Developer, review this", roster, "d"), null, "an agent cannot route to itself");
});

test("mention route: a word inside another word is not a name", () => {
  const roster = [{ id: "d", name: "Dev", role: "Build" }];
  assert.equal(mentionConsult("what is the deviation from plan?", roster, "x"), null);
});
