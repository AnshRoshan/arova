/**
 * web_fetch — the first external tool, and the reason the registry says "policy first" (spec 05).
 *
 * What this can hurt you with, stated plainly: a server-side fetch is an SSRF primitive. So the
 * policy is the product: https only, no credentials in the URL, port 443 only, the hostname is
 * resolved HERE and every answer must be a public address (loopback, RFC1918, link-local — the
 * cloud metadata endpoint — CGNAT, unique-local and v4-mapped ranges are refused), redirects are
 * manual and each hop re-runs the whole check, the body is capped, the content-type must be text,
 * and script/style markup is dropped before the model ever sees the page.
 *
 * Residual risk, said out loud: DNS rebinding — the name is checked at resolve time, and the
 * socket resolves again when fetch connects. Closing that fully means connecting by pinned IP with
 * an SNI override; until that is done this tool is honest about being new. The workspace grant
 * list still decides which seats may use it at all.
 */

import { lookup as dnsLookup } from "node:dns/promises";

export type FetchPolicy = { lookup?: (host: string) => Promise<{ address: string; family: number | string }[]> };

const v4ToLong = (o: number[]) => (((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0);
const inCidr = (ip: number, base: string, prefix: number): boolean => {
  const b = base.split(".").map(Number);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ip & mask) === (v4ToLong(b) & mask);
};
const V4_BLOCKED: [string, number][] = [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4]];

export function isPublicAddress(address: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (v4) {
    const octets = v4.slice(1, 5).map(Number);
    if (octets.some(o => o > 255)) return false;
    const ip = v4ToLong(octets);
    return !V4_BLOCKED.some(([base, prefix]) => inCidr(ip, base, prefix));
  }
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isPublicAddress(mapped[1]);
  if (address === "::" || address === "::1") return false;
  const lower = address.toLowerCase();
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return false;
  return lower.includes(":");
}

export async function validateFetchTarget(raw: string, policy: FetchPolicy = {}): Promise<{ url: URL; ips: string[] } | { error: string }> {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return { error: "That is not a URL." }; }
  if (url.protocol !== "https:") return { error: "Only https pages are fetched — the bearer of this request should never ride a plain-http hop." };
  if (url.username || url.password) return { error: "A URL with credentials in it is refused outright." };
  if (url.port && url.port !== "443") return { error: `Port ${url.port} is outside the policy; only standard https is fetched.` };
  if (["localhost", "metadata.google.internal"].includes(url.hostname.toLowerCase())) return { error: `${url.hostname} is inside this network, not on the public web.` };

  if (/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.includes(":")) {
    return isPublicAddress(url.hostname) ? { url, ips: [url.hostname] } : { error: "That address is inside private or reserved space, so it is not fetched." };
  }
  let answers: { address: string }[];
  try {
    answers = await (policy.lookup ?? ((h: string) => dnsLookup(h, { all: true })))(url.hostname);
  } catch {
    return { error: `${url.hostname} does not resolve, so nothing was fetched.` };
  }
  if (!answers.length) return { error: `${url.hostname} resolved to nothing.` };
  if (!answers.every(a => isPublicAddress(a.address))) return { error: `${url.hostname} resolves to a private or reserved address — this is exactly the shape of an SSRF attempt, so it is refused.` };
  return { url, ips: answers.map(a => a.address) };
}

/** Text and title out of markup; scripts, styles and comments never reach the excerpt. */
export function extractReadable(body: string): { title: string; text: string } {
  const title = /<title[^>]*>([\s\S]{0,200}?)<\/title>/i.exec(body)?.[1]?.replace(/<[^>]*>/g, "").trim() ?? "";
  let text = body;
  if (/<[a-z!/]/i.test(text)) {
    text = text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(?:script|style)[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, " ");
  }
  text = text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
  if (text.length > 4000) text = `${text.slice(0, 4000)} … truncated at 4,000 characters of ${text.length}`;
  return { title, text };
}

const MAX_BYTES = 512_000;
const MAX_HOPS = 3;

/** Fetch one public web page inside the policy and return a readable excerpt. */
export async function webFetch(raw: string, deps: FetchPolicy & { fetchImpl?: typeof fetch } = {}): Promise<{ ok: true; output: string; title: string; url: string } | { ok: false; error: string }> {
  const doFetch = deps.fetchImpl ?? fetch;
  let next = raw;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const target = await validateFetchTarget(next, deps);
    if ("error" in target) return { ok: false, error: target.error };
    let res: Response;
    try {
      res = await doFetch(target.url.toString(), { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { accept: "text/html,text/plain,application/json", "user-agent": "Arova/1.0 (+workspace fetch tool)" } });
    } catch (error) {
      return { ok: false, error: `The page could not be reached: ${error instanceof Error ? error.name : "unknown"}` };
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location) return { ok: false, error: `The page redirected (${res.status}) with nowhere to go.` };
      if (hop === MAX_HOPS) return { ok: false, error: "The page redirected more than three times, so the fetch stopped." };
      next = new URL(location, target.url).toString();
      continue;
    }
    if (!res.ok) return { ok: false, error: `The page answered ${res.status}.` };
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/|json|xml/.test(type)) return { ok: false, error: `That is ${type.split(";")[0] || "an unknown type"}, not readable text — this tool does not download files.` };
    const full = new Uint8Array(await res.arrayBuffer());
    const { title, text } = extractReadable(new TextDecoder().decode(full.subarray(0, MAX_BYTES)));
    if (!text) return { ok: false, error: "The page carried no readable text." };
    // The final URL is the one a citation must carry: a redirect is still the page that was read.
    return { ok: true, output: `${title ? `${title} · ` : ""}${res.status} · ${target.url.hostname}\n${text}`, title: title || target.url.hostname, url: target.url.toString() };
  }
  return { ok: false, error: "The fetch ended without an answer." };
}
