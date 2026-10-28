import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSearchResults, loadSearchProfile, searchWeb } from "./web-search.ts";

const searxng = loadSearchProfile({ SEARCH_PROVIDER: "searxng", SEARCH_BASE_URL: "https://search.example" });
const brave = loadSearchProfile({ SEARCH_PROVIDER: "brave", BRAVE_SEARCH_API_KEY: "k" });

test("the profile is configured only when its required fields exist", () => {
  assert.equal(searxng.configured, true);
  assert.equal(brave.configured, true);
  assert.equal(loadSearchProfile({ SEARCH_PROVIDER: "brave" }).configured, false, "Brave without a key is not configured");
  assert.equal(loadSearchProfile({ SEARCH_PROVIDER: "searxng" }).configured, false, "SearXNG needs a base URL");
  assert.equal(loadSearchProfile({}).configured, false);
});

test("SearXNG is called with the JSON format and a q parameter", async () => {
  let seen = "";
  const result = await searchWeb("open source agents", searxng, {
    fetchImpl: async url => {
      seen = String(url);
      return new Response(JSON.stringify({ results: [{ title: "A", url: "https://a.example", content: "alpha" }, { title: "B", url: "https://b.example", snippet: "beta" }] }), { status: 200 });
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0].title, "A");
    assert.equal(result.results[1].snippet, "beta");
  }
  assert.match(seen, /\/search\?/);
  assert.match(seen, /format=json/);
  assert.match(seen, /q=open\+source\+agents/);
});

test("Brave sends its subscription token and reads web.results", async () => {
  let token = "";
  const result = await searchWeb("query", brave, {
    fetchImpl: async (_url, init) => {
      token = String((init?.headers as Record<string, string>)["x-subscription-token"] ?? "");
      return new Response(JSON.stringify({ web: { results: [{ title: "B", url: "https://b.example", description: "desc" }] } }), { status: 200 });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(token, "k");
  if (result.ok) assert.equal(result.results[0].snippet, "desc");
});

test("a local endpoint is refused unless SEARCH_ALLOW_LOCAL=1", async () => {
  const local = loadSearchProfile({ SEARCH_PROVIDER: "searxng", SEARCH_BASE_URL: "http://localhost:8888" });
  const result = await searchWeb("q", local, { fetchImpl: async () => new Response("{}") });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /SEARCH_ALLOW_LOCAL/);
  const allowed = { ...local, allowLocal: true };
  const ok = await searchWeb("q", allowed, { fetchImpl: async () => new Response(JSON.stringify({ results: [{ title: "L", url: "https://l.example", content: "local" }] })) });
  assert.equal(ok.ok, true);
});

test("a remote endpoint must be https, so a key and the query never ride plain http", async () => {
  const profile = loadSearchProfile({ SEARCH_PROVIDER: "custom", SEARCH_BASE_URL: "http://search.example", SEARCH_API_KEY: "secret" });
  let called = false;
  const result = await searchWeb("q", profile, { fetchImpl: async () => { called = true; return new Response("{}"); } });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /https/);
  assert.equal(called, false, "the request is refused before anything is sent");
});

test("an HTTP error and an empty result set are refusals, not fabricated answers", async () => {
  const failed = await searchWeb("q", searxng, { fetchImpl: async () => new Response("no", { status: 503 }) });
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.match(failed.error, /503/);
  const empty = await searchWeb("q", searxng, { fetchImpl: async () => new Response(JSON.stringify({ results: [] })) });
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.match(empty.error, /no usable results/);
});

test("sources are numbered and carried separately for the UI", () => {
  const formatted = formatSearchResults([{ title: "A", url: "https://a.example", snippet: "alpha" }]);
  assert.match(formatted.text, /\[1\] A/);
  assert.deepEqual(formatted.sources, [{ title: "A", url: "https://a.example" }]);
});
