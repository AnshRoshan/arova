import { createHmac } from "node:crypto";
const base = "http://127.0.0.1:3100";
// fire a fresh mention (new event id) so the worker delivers its terminal report to the mock
const payload = { type: "event_callback", event_id: "Ev-drive-" + Date.now(), team_id: "T0001", event: { type: "app_mention", channel: "C123", user: "U999", text: "<@U000> Report the release page" } };
const body = JSON.stringify(payload);
const ts = String(Math.floor(Date.now() / 1000));
const sig = "v0=" + createHmac("sha256", "signing-secret-1234567890").update(`v0:${ts}:${body}`).digest("hex");
const m = await fetch(base + "/api/channels/slack", { method: "POST", headers: { "content-type": "application/json", "x-slack-request-timestamp": ts, "x-slack-signature": sig }, body });
console.log("mention:", m.status, (await m.json()).jobId?.slice(0, 8));
