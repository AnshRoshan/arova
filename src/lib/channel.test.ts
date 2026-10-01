import { test } from "node:test";
import assert from "node:assert/strict";
import {
  budgetStopRow, channelSubject, denialBreaker, hermeticPeers, mayFoundOrg, mayStaffOrg, noReportStopRow, requestedOrgName, resolveLead, summarisePost, summonCeiling, type Verdict,
} from "./channel.ts";

/** A refusal must be a refusal before anyone reads its reason. */
const whyOf = (verdict: Verdict) => { assert.equal(verdict.ok, false, "expected a refusal"); return "why" in verdict ? verdict.why : ""; };

/* Feature 11 — the org channel. These are the decisions the server is allowed to make without a
 * model in the loop, so they are tested here rather than asserted in prose. */

test("a name the human typed survives into the proposal, quoted or not", () => {
  // the bug this fixes (L-11): only a quoted name was read, so "with name hex-aq" fell through to the template
  assert.equal(requestedOrgName("create the org or group with name hex-aq"), "hex-aq");
  assert.equal(requestedOrgName('Build a company called "Northwind"'), "Northwind");
  assert.equal(requestedOrgName("name it Vela and staff it with 4 seats"), "Vela");
  assert.equal(requestedOrgName("an org named: Cobalt, for hardware"), "Cobalt");
  assert.equal(requestedOrgName("set up a team"), null, "no name asked is not a name found");
  assert.equal(requestedOrgName("company with name a"), null, "one character is not a company name");
});

test("a channel post is addressed to an org or a seat, never both and never neither", () => {
  assert.deepEqual(channelSubject({ teamId: "t1", agentId: null }), { teamId: "t1", agentId: null });
  assert.deepEqual(channelSubject({ teamId: null, agentId: "a1" }), { teamId: null, agentId: "a1" });
  assert.throws(() => channelSubject({ teamId: null, agentId: null }), /one of team or seat/);
  assert.throws(() => channelSubject({ teamId: "t1", agentId: "a1" }), /not both/);
});

test("reach is sealed to the actor's own org", () => {
  const seats = [
    { id: "a", teamId: "hex" }, { id: "b", teamId: "hex" }, { id: "c", teamId: "other" }, { id: "d", teamId: null },
  ];
  assert.deepEqual(hermeticPeers(seats, "hex", "a").map(p => p.id), ["b"]);
  // a seat with no org can reach nobody: it is not a member of anything
  assert.deepEqual(hermeticPeers(seats, null, "d"), []);
  assert.deepEqual(hermeticPeers(seats, "hex", "a"), hermeticPeers(seats, "hex", "a"), "no hidden ordering");
});

test("only the designated creator may found an organisation", () => {
  const found = { id: "godfather", name: "Godfather", teamId: null, isCreator: true };
  const inside = { id: "lead", name: "Lead", teamId: "hex", isCreator: false };
  assert.equal(mayFoundOrg(found).ok, true);
  const refusal = whyOf(mayFoundOrg(inside, { name: found.name }));
  // the refusal names the rule and points at the seat that can actually do it
  assert.match(refusal, /creator/i);
  assert.match(refusal, /Godfather/i);
  assert.match(whyOf(mayFoundOrg(inside)), /creator seat/i, "still readable when no creator is designated");
});

test("an org's lead may staff inside its own org and nowhere else", () => {
  const lead = { id: "po", name: "Product Owner", teamId: "hex", isLead: true };
  const peer = { id: "dev", name: "Developer", teamId: "hex", isLead: false };
  assert.equal(mayStaffOrg(lead, "hex").ok, true);
  assert.match(whyOf(mayStaffOrg(lead, "other")), /own organisation/i);
  assert.match(whyOf(mayStaffOrg(peer, "hex")), /lead/i);
});

test("a brief stopped by the daily budget says who was never asked", () => {
  const row = budgetStopRow({ asked: ["UX Researcher"], unasked: ["Compliance", "Designer"], calls: 3, limit: 3 });
  assert.ok(row, "a brief cut short with peers left out must produce a row");
  assert.equal(row.kind, "budget_stop");
  // the honesty rule: silence would look like a team that finished
  assert.match(row.content, /daily budget/i);
  assert.match(row.content, /Compliance/);
  assert.match(row.content, /Designer/);
  assert.match(row.content, /never asked/i);
  // one name must read as one name; the row is shown to a human, not logged
  assert.match(row.content, /UX Researcher was asked and answered/);
  // and it must not claim the peers were consulted
  assert.doesNotMatch(row.content, /consulted Compliance/i);
  assert.deepEqual(row.metadata.unasked, ["Compliance", "Designer"]);
  assert.deepEqual(row.metadata.asked, ["UX Researcher"]);
  assert.equal(budgetStopRow({ asked: ["A"], unasked: [], calls: 1, limit: 3 }), null, "nothing missing, nothing to report");
});

test("the brief goes to the designated lead, else the root of the chart", () => {
  const seats = [
    { id: "dev", name: "Developer", managerId: "cto" },
    { id: "ceo", name: "Chief Executive", managerId: null },
    { id: "cto", name: "Chief Technology", managerId: "ceo" },
  ];
  assert.equal(resolveLead(seats, "cto")?.id, "cto", "a designated lead wins even when it is not the root");
  assert.equal(resolveLead(seats, null)?.id, "ceo", "no designation means the top of the chart is briefed");
  // lead_agent_id has no foreign key (agents already references teams), so a deleted seat can leave
  // a dangling uuid behind. The caller must fall back rather than brief a seat that is gone.
  assert.equal(resolveLead(seats, "gone")?.id, "ceo", "a dangling lead id is not a recipient");
  assert.equal(resolveLead([], null), null, "an empty org has nobody to brief");
  const allChained = [{ id: "b", managerId: "a" }, { id: "c", managerId: "b" }];
  assert.equal(resolveLead(allChained, null)?.id, "b", "a chart with no visible root still has a first seat");
});

test("a synthesis post names the peer posts it used, and only those", () => {
  const post = summarisePost({ author: "Product Owner", used: ["UX Researcher", "Chief Technology"] });
  assert.equal(post.metadata.authoredByName, "Product Owner");
  assert.match(post.content, /UX Researcher/);
  assert.match(post.content, /Chief Technology/);
  assert.deepEqual(post.metadata.usedPeers, ["UX Researcher", "Chief Technology"]);
  // with no peers it must not claim any collaboration happened
  const solo = summarisePost({ author: "Lead", used: [] });
  assert.deepEqual(solo.metadata.usedPeers, []);
  assert.doesNotMatch(solo.content, /built on/i);
  assert.match(solo.content, /without a teammate/i, "it says plainly that nobody was asked");
});

test("a brief that ran out before the report names the posts that did land", () => {
  // The summon loop finished; the budget died on the way to the synthesis. The channel must not
  // imply the lead reported, and must not invent peers that were never meant to be asked.
  const row = noReportStopRow({ author: "Product Owner", posted: ["UX Researcher", "Chief Technology"], calls: 5, limit: 5 });
  assert.equal(row.kind, "budget_stop");
  assert.match(row.content, /daily budget/i);
  assert.match(row.content, /UX Researcher/);
  assert.match(row.content, /Chief Technology/);
  assert.match(row.content, /Product Owner/);
  assert.match(row.content, /no call left/i);
  assert.deepEqual(row.metadata.posted, ["UX Researcher", "Chief Technology"]);
  assert.deepEqual(row.metadata.unasked, [], "nobody here was skipped on purpose, so naming one would be a lie");
  assert.doesNotMatch(row.content, /summarises|concluded/i);
  const solo = noReportStopRow({ author: "Lead", posted: [], calls: 1, limit: 1 });
  assert.match(solo.content, /before any teammate was asked/i, "with no posts it says so plainly");
});

test("a seat's own turn ceiling caps the summons it may make", () => {
  // maxTurns is edited in the capabilities UI, so the server has to honour it or the control lies.
  assert.equal(summonCeiling({ envMax: 2, seatMaxTurns: null }), 2, "no per-seat setting: the server ceiling");
  assert.equal(summonCeiling({ envMax: 2, seatMaxTurns: 8 }), 2, "the server ceiling still wins above its own number");
  assert.equal(summonCeiling({ envMax: 5, seatMaxTurns: 3 }), 2, "3 turns = 2 summons and the report");
  assert.equal(summonCeiling({ envMax: 5, seatMaxTurns: 1 }), 0, "one turn means it answers alone");
  assert.equal(summonCeiling({ envMax: 0, seatMaxTurns: 8 }), 0, "delegation switched off on the server wins");
});

test("the denial breaker trips on a run of refusals or on a hostile window", () => {
  // Newest first, which is how the approvals table is read.
  assert.equal(denialBreaker([]).tripped, false, "no history is not a signal");
  assert.equal(denialBreaker(["REJECTED", "REJECTED", "APPROVED"]).tripped, false, "two refusals is feedback, not a pattern");
  const run = denialBreaker(["REJECTED", "REJECTED", "REJECTED", "APPROVED"]);
  assert.equal(run.tripped, true);
  assert.equal(run.consecutive, 3);
  assert.match(run.reason ?? "", /three/i, "the seat has to be able to say why it stopped");
  // 10 of the last 50, with approvals interleaved so no consecutive run exists
  const mixed = [...Array(20)].flatMap(() => ["APPROVED", "REJECTED"]);
  const windowed = denialBreaker(mixed as ("APPROVED" | "REJECTED")[]);
  assert.equal(windowed.tripped, true, "a pattern across the window trips it too");
  assert.equal(windowed.denials, 20);
  // and the window is a window: 60 refusals count as 50
  assert.equal(denialBreaker(Array.from({ length: 60 }, () => "REJECTED") as ("APPROVED" | "REJECTED")[]).considered, 50);
});
