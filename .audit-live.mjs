const BASE = "http://localhost:3000";
let cookie = null;
const init = await fetch(`${BASE}/api/board`);
const sc = init.headers.get("set-cookie") ?? "";
cookie = sc.split(";")[0] || null;
if (!cookie) { console.log("FAIL · no workspace cookie issued"); process.exit(1); }
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"} · ${name}${detail ? ` · ${detail}` : ""}`); ok ? pass++ : fail++; };

const board = async () => (await (await fetch(`${BASE}/api/board`, { headers: { cookie } })).json());
const act = async (action, payload) => {
  const r = await fetch(`${BASE}/api/board`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ action, ...payload }) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
};

const b0 = await board();
check("fresh workspace initializes", b0.workspace && b0.agents.length === 0, `workspace=${b0.workspace?.id?.slice(0, 8)}`);

const t = await act("createEmptyTeam", { name: "Audit Org", brief: "verification" });
const teamId = t.j.team?.id ?? t.j.teamId ?? (t.j.board?.teams ?? [])[0]?.id;
check("createEmptyTeam", !!teamId, `status=${t.status}`);

const a = await act("createAgent", { name: "Audit Lead", role: "verifier", teamId });
const agentId = a.j.agent?.id ?? a.j.agentId ?? (a.j.board?.agents ?? []).find(x => x.name === "Audit Lead")?.id;
check("createAgent in team", !!agentId, `status=${a.status} err=${a.j.error ?? ""}`);

const lead = await act("assignOrgLead", { teamId, agentId });
check("assignOrgLead", lead.status === 200, `status=${lead.status} err=${lead.j.error ?? ""}`);

const trg = await act("createTrigger", { teamId, label: "Audit trigger" });
const token = trg.j.token ?? trg.j.trigger?.token ?? trg.j.secret;
check("createTrigger returns a token", !!token, `keys=${Object.keys(trg.j).join(",")}`);

const fire1 = await fetch(`${BASE}/api/trigger`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ text: "prove the inbound door works" }) });
const f1 = await fire1.json().catch(() => ({}));
check("trigger fires (honest no-provider outcome)", [200, 409, 502].includes(fire1.status) || f1.ok === false, `status=${fire1.status} body=${JSON.stringify(f1).slice(0, 140)}`);

const fire2 = await fetch(`${BASE}/api/trigger`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ text: "second immediate fire" }) });
check("second fire inside cooldown is 429 (atomic claim)", fire2.status === 429, `status=${fire2.status}`);

const b1 = await board();
const trig = (b1.triggers ?? []).find(x => x.teamId === teamId);
check("trigger hits incremented atomically", trig && trig.hits >= 1, `hits=${trig?.hits}`);

const cron = await fetch(`${BASE}/api/cron`, { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? "local-dev-cron-secret-change-me"}` } });
const cj = await cron.json().catch(() => ({}));
check("/api/cron with secret works", cron.status === 200 && cj.ok === true, JSON.stringify(cj).slice(0, 120));
const cronBad = await fetch(`${BASE}/api/cron`, { method: "POST", headers: { authorization: "Bearer wrong" } });
check("/api/cron rejects a wrong secret", cronBad.status === 401 || cronBad.status === 403, `status=${cronBad.status}`);

const badTrg = await fetch(`${BASE}/api/trigger`, { method: "POST", headers: { authorization: "Bearer not-a-real-token", "content-type": "application/json" }, body: JSON.stringify({ text: "bogus token probe" }) });
check("unknown trigger token is 404", badTrg.status === 404, `status=${badTrg.status}`);

const rev = await act("revokeTrigger", { triggerId: trg?.id ?? trig?.id });
check("revokeTrigger accepted", rev.status === 200, `status=${rev.status}`);
const after = await fetch(`${BASE}/api/trigger`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ text: "revoked token probe" }) });
check("revoked token is refused (404/410)", after.status === 404 || after.status === 410, `status=${after.status}`);

check("board scheduler heartbeat is live", b1.scheduler?.worker?.state === "live", `state=${b1.scheduler?.worker?.state}`);
check("limits say maxDelegations default 1", b1.limits?.maxDelegations === 1, `got=${b1.limits?.maxDelegations}`);
const mem = await act("saveMemory", { teamId, text: "the audit ran", kind: "note" });
check("saveMemory persists for a team", mem.status === 200, `status=${mem.status} err=${mem.j.error ?? ""}`);
const b2 = await board();
check("board carries the memory", (b2.memories ?? []).some(m => m.text === "the audit ran"), `count=${(b2.memories ?? []).length}`);

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
