/* Creates a fresh workspace with real rows (team, two seats, a routine, a memory, a trigger)
 * so palette captures show populated surfaces, not empty states. Prints the workspace id. */
const BASE = "http://localhost:3000";
const init = await fetch(`${BASE}/api/board`);
const cookie = (init.headers.get("set-cookie") ?? "").split(";")[0];
if (!cookie) { console.error("FAIL no workspace cookie"); process.exit(1); }
const headers = { cookie, "content-type": "application/json" };
const act = async (action, payload) => {
  const r = await fetch(`${BASE}/api/board`, { method: "POST", headers, body: JSON.stringify({ action, ...payload }) });
  const j = await r.json().catch(() => ({}));
  if (r.status !== 200 && !j.team && !j.agent) console.error(`  ! ${action} -> ${r.status} ${j.error ?? ""}`);
  return j;
};

const t = await act("createEmptyTeam", { name: "Cartography", brief: "Maps the territory before anyone walks it." });
const teamId = t.team?.id ?? t.teamId;
const atlas = await act("createAgent", { name: "Atlas", role: "researcher", teamId });
const vela = await act("createAgent", { name: "Vela", role: "writer", teamId });
const atlasId = atlas.agent?.id ?? atlas.agentId;
const velaId = vela.agent?.id ?? vela.agentId;
await act("assignOrgLead", { teamId, agentId: atlasId });
await act("createRoutine", { agentId: atlasId, name: "Nightly index", description: "Re-index what changed today.", schedule: "Every day at 8:00 AM" });
await act("saveMemory", { teamId, text: "bench means the roster", kind: "note" });
await act("saveMemory", { teamId, text: "we ship on tuesdays", kind: "decision" });
await act("createTrigger", { teamId, label: "Audit trigger" });

const board = await (await fetch(`${BASE}/api/board`, { headers: { cookie } })).json();
console.log(JSON.stringify({
  cookie: cookie.split("=")[1],
  agents: board.agents?.length ?? 0,
  teams: board.teams?.length ?? 0,
  routines: board.routines?.length ?? 0,
  memories: board.memories?.length ?? 0,
  triggers: board.triggers?.length ?? 0,
  provider: board.profiles?.map?.(p => p.name) ?? Object.keys(board.profiles ?? {}),
  dailyCalls: board.limits?.dailyModelCalls,
}));
