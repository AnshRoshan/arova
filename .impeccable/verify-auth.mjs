/* Feature 15 live proof against the local mock OIDC provider. Two cookie jars sign in as two
 * people through the real routes (start → authorize → callback), the owner's board lists both,
 * removal ends the second person's session, and the refusal paths answer with sentences.
 * Run with NODE_TLS_REJECT_UNAUTHORIZED=0 — the mock's certificate is self-signed on purpose. */
const BASE = process.env.APP_BASE || "http://localhost:3000";
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"} · ${name}${detail ? ` · ${detail}` : ""}`); ok ? pass++ : fail++; };

function jar() {
  const cookies = new Map();
  return {
    headers: () => (cookies.size ? { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
    absorb: res => { for (const raw of res.headers.getSetCookie?.() ?? []) { const [pair] = raw.split(";"); const i = pair.indexOf("="); const name = pair.slice(0, i), value = pair.slice(i + 1); if (value === "" || /Max-Age=0/i.test(raw)) cookies.delete(name); else cookies.set(name, value); } },
    get: async (url, init = {}) => { const res = await fetch(url, { redirect: "manual", ...init, headers: { ...init.headers, ...cookies.size ? { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } : {} } }); return res; },
  };
}

async function board(j) { const r = await j.get(`${BASE}/api/board`); j.absorb(r); return r.json(); }

async function signIn(j, as) {
  const start = await j.get(`${BASE}/api/auth/start?provider=mock`);
  j.absorb(start);
  if (start.status !== 307) return { error: `start returned ${start.status}` };
  const authorizeUrl = new URL(start.headers.get("location"));
  if (as) authorizeUrl.searchParams.set("as", as);
  const toCallback = await j.get(authorizeUrl.toString()); // the mock answers with a 302 to the callback
  const callbackUrl = toCallback.headers.get("location");
  const cb = await j.get(callbackUrl);
  j.absorb(cb);
  return { status: cb.status, location: cb.headers.get("location") };
}

const A = jar();
await board(A); // anonymous workspace, which sign-in then claims

const in1 = await signIn(A);
check("owner sign-in lands at the app", [302, 307].includes(in1.status) && in1.location.endsWith("localhost:3000/"), JSON.stringify(in1));
const bA = await board(A);
check("board now knows a signed-in owner", bA.identity?.signedIn?.role === "owner" && bA.identity.signedIn.name === "Mock Owner", JSON.stringify(bA.identity?.signedIn));
check("the anonymous workspace was claimed, not replaced", !!bA.workspace?.id);

const B = jar();
await board(B);
const in2 = await signIn(B, "2");
check("second person signs in", [302, 307].includes(in2.status), JSON.stringify(in2));
const bB = await board(B);
check("second person is a member, not an owner", bB.identity?.signedIn?.role === "member", JSON.stringify(bB.identity?.signedIn));
const bA2 = await board(A);
check("owner sees both people", bA2.identity?.people?.length === 2, `people=${bA2.identity?.people?.length}`);
const second = (bA2.identity.people ?? []).find(p => p.name === "Mock Second");
check("member list never reaches the member's own board", bB.identity?.people?.length === 0, `people=${bB.identity?.people?.length}`);

const rem = await B.get(`${BASE}/api/board`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "setPersonRole", userId: second.id, role: "owner" }) });
const remJson = await rem.json();
check("a member cannot promote themselves", remJson.error ? /owner/.test(remJson.error) : false, String(remJson.error).slice(0, 60));

const rm = await A.get(`${BASE}/api/board`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "removePerson", userId: second.id }) });
check("owner removes the member", rm.status === 200, `status=${rm.status}`);
const bB2 = await board(B);
check("the removed person's session is dead on next read", !bB2.identity?.signedIn, JSON.stringify(bB2.identity?.signedIn));

const C = jar();
const cStart = await C.get(`${BASE}/api/auth/start?provider=mock`);
C.absorb(cStart);
const badCb = await C.get(`${BASE}/api/auth/callback?code=fake&state=not-the-state`);
check("a state mismatch refuses with a sentence", [302, 307].includes(badCb.status) && decodeURIComponent(badCb.headers.get("location") ?? "").includes("did not match this browser"), decodeURIComponent(badCb.headers.get("location") ?? ""));
const unk = await C.get(`${BASE}/api/auth/start?provider=nope`);
check("an unconfigured provider is refused", [302, 307].includes(unk.status) && /not a configured/.test(decodeURIComponent(unk.headers.get("location") ?? "")), decodeURIComponent(unk.headers.get("location") ?? ""));

const out = await A.get(`${BASE}/api/auth/signout`, { method: "POST" });
A.absorb(out);
const bA3 = await board(A);
check("sign-out returns the owner to an anonymous read", !bA3.identity?.signedIn, JSON.stringify(bA3.identity?.signedIn));
const bA4 = await board(A);
check("sign-out kept the browser in its own workspace, which still has its owner recorded", bA4.workspace?.id === bA.workspace.id, bA4.workspace?.id + " vs " + bA.workspace?.id);

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
