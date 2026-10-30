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
import { isIP } from "node:net";

export type FetchPolicy = { lookup?: (host: string) => Promise<{ address: string; family: number | string }[]> };

const v4ToLong = (o: number[]) => (((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0);
const inCidr = (ip: number, base: string, prefix: number): boolean => {
  const b = base.split(".").map(Number);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ip & mask) === (v4ToLong(b) & mask);
};
const V4_BLOCKED: [string, number][] = [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4]];

/** URL syntax keeps brackets and zone ids on a literal address; the policy works on the address. */
function bareHost(host: string): string {
  return host.trim().replace(/^\[/, "").replace(/\]$/, "").replace(/%.*$/, "");
}

/** Eight 16-bit groups, or null. Handles `::` compression and a dotted IPv4 tail. */
function parseV6(raw: string): number[] | null {
  const address = raw.replace(/%.*$/, "");
  if (!address.includes(":")) return null;
  let text = address;
  let tail: number[] = [];
  const dotted = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text);
  if (dotted) {
    const parts = dotted[1].split(".").map(Number);
    if (parts.some(part => part > 255)) return null;
    tail = [(parts[0] << 8) | parts[1], (parts[2] << 8) | parts[3]];
    text = text.slice(0, -dotted[1].length).replace(/:$/, "");
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const groups = [...left, ...right];
  if (!groups.every(group => /^[0-9a-f]{1,4}$/i.test(group))) return null;
  const total = groups.length + tail.length;
  if (halves.length === 1 && total !== 8) return null;
  const fill = halves.length === 2 ? 8 - total : 0;
  if (fill < 0) return null;
  const nums = [...left, ...Array.from({ length: fill }, () => "0"), ...right].map(group => parseInt(group, 16));
  return [...nums, ...tail];
}

const dotted = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

export function isPublicAddress(address: string): boolean {
  const host = bareHost(address);
  if (isIP(host) === 4) {
    const octets = host.split(".").map(Number);
    const ip = v4ToLong(octets);
    return !V4_BLOCKED.some(([base, prefix]) => inCidr(ip, base, prefix));
  }
  const v6 = parseV6(host);
  if (!v6) return false;
  const [a, b, c, d, e, f, g, h] = v6;
  // ::ffff:0:0/96 (IPv4-mapped) and ::/96 (deprecated IPv4-compatible) carry a v4 address.
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff) return isPublicAddress(dotted(g, h));
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0 && (g || h)) return isPublicAddress(dotted(g, h));
  if (a === 0) return false; // ::, ::1 and anything else in the zero prefix
  if ((a & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((a & 0xfe00) === 0xfc00) return false; // unique-local fc00::/7
  if ((a & 0xffc0) === 0xfec0) return false; // site-local (deprecated) fec0::/10
  if ((a & 0xff00) === 0xff00) return false; // multicast ff00::/8
  if (a === 0x2002) return isPublicAddress(dotted(b, c)); // 6to4 embeds v4 in groups 2-3
  if (a === 0x0064 && b === 0xff9b) return isPublicAddress(dotted(g, h)); // NAT64
  if (a === 0x2001 && b === 0x0000) return false; // Teredo
  if (a === 0x2001 && b === 0x0db8) return false; // documentation 2001:db8::/32
  return true;
}

export async function validateFetchTarget(raw: string, policy: FetchPolicy = {}): Promise<{ url: URL; ips: string[] } | { error: string }> {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return { error: "That is not a URL." }; }
  if (url.protocol !== "https:") return { error: "Only https pages are fetched — the bearer of this request should never ride a plain-http hop." };
  if (url.username || url.password) return { error: "A URL with credentials in it is refused outright." };
  if (url.port && url.port !== "443") return { error: `Port ${url.port} is outside the policy; only standard https is fetched.` };
  if (["localhost", "metadata.google.internal"].includes(url.hostname.toLowerCase())) return { error: `${url.hostname} is inside this network, not on the public web.` };

  // `URL.hostname` keeps the brackets on a literal IPv6 address; the policy checks the address.
  const literal = bareHost(url.hostname);
  if (isIP(literal)) {
    return isPublicAddress(literal) ? { url, ips: [literal] } : { error: "That address is inside private or reserved space, so it is not fetched." };
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

/** Stop reading at the cap and close the connection; never buffer a whole body first. */
export async function readCapped(res: Response, cap = MAX_BYTES): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer()).subarray(0, cap);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < cap) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
  } finally {
    if (size >= cap) await reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(Math.min(size, cap));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= out.length) break;
    const take = Math.min(chunk.length, out.length - offset);
    out.set(chunk.subarray(0, take), offset);
    offset += take;
  }
  return out;
}

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
    const full = await readCapped(res);
    const { title, text } = extractReadable(new TextDecoder().decode(full));
    if (!text) return { ok: false, error: "The page carried no readable text." };
    // The final URL is the one a citation must carry: a redirect is still the page that was read.
    return { ok: true, output: `${title ? `${title} · ` : ""}${res.status} · ${target.url.hostname}\n${text}`, title: title || target.url.hostname, url: target.url.toString() };
  }
  return { ok: false, error: "The fetch ended without an answer." };
}
