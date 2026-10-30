import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEndpoint, catalogEndpoint, chooseServedModel, ensureServedModel, resetModelCatalog, completionPayload, estimateTokens, finishReason, readSseText, requestCompletion, usageFromJson, usageFromSseLine, isRetryableStatus, loadProfiles, parseStreamDelta, resolveForAgent, trimToTokenBudget } from "./model-gateway.ts";


const dahlProfile = loadProfiles({ PROVIDERS: "dahl", DAHL_BASE_URL: "https://inference.dahl.global/v1", DAHL_MODEL: "MiniMaxAI/MiniMax-M2.7", DAHL_API_KEY: "secret-key", DAHL_MAX_CONTEXT: "32000" }).find(p => p.name === "dahl")!;
const tinyProfile = { ...dahlProfile, maxContextTokens: 3000 };

test("endpoint: accepts a full completions URL without duplicating the path", () => {
  assert.equal(buildEndpoint("https://inference.dahl.global/v1/chat/completions"), "https://inference.dahl.global/v1/chat/completions");
});

test("endpoint: appends completions to a base URL and tolerates a trailing slash", () => {
  assert.equal(buildEndpoint("https://inference.dahl.global/v1"), "https://inference.dahl.global/v1/chat/completions");
  assert.equal(buildEndpoint("https://inference.dahl.global/v1/"), "https://inference.dahl.global/v1/chat/completions");
});

test("endpoint: rejects non-http(s) schemes so a bearer key is never sent to file: or other transports", () => {
  assert.throws(() => buildEndpoint("file:///etc/passwd"), /http/);
  assert.throws(() => buildEndpoint("not a url"), /Invalid/);
});

test("token estimate: roughly four characters per token", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("a".repeat(4000)), 1000);
});

test("history budget: drops the oldest turns when over budget, keeps the newest", () => {
  const history = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x".repeat(4000) }));
  const kept = trimToTokenBudget(history, { profile: tinyProfile, reserve: 800 });
  assert.ok(kept.length < history.length, "must drop some turns");
  assert.ok(kept.length >= 2, "must keep at least the most recent turns");
  assert.equal(kept[kept.length - 1].content, history[history.length - 1].content);
  assert.ok(kept.reduce((n, m) => n + estimateTokens(m.content), 0) <= tinyProfile.maxContextTokens - 800, "kept turns stay within budget");
});

test("history budget: a small window is returned untouched", () => {
  const history = [{ role: "user", content: "short" }, { role: "assistant", content: "also short" }];
  assert.deepEqual(trimToTokenBudget(history, { profile: dahlProfile, reserve: 800 }), history);
});

test("history budget: hard cap of 64 turns regardless of tokens", () => {
  const history = Array.from({ length: 200 }, () => ({ role: "user", content: "hi" }));
  assert.equal(trimToTokenBudget(history, { profile: dahlProfile, reserve: 800 }).length, 64);
});

test("profiles: a custom provider is described without ever carrying its key", () => {
  assert.equal(dahlProfile.model, "MiniMaxAI/MiniMax-M2.7");
  assert.equal(dahlProfile.configured, true);
  assert.ok(!JSON.stringify(dahlProfile).includes("secret-key"), "profile must not serialize the key");
});

test("profiles: named provider without a key is reported unconfigured, not silently dropped", () => {
  const [p] = loadProfiles({ PROVIDERS: "dahl", DAHL_BASE_URL: "https://inference.dahl.global/v1", DAHL_MODEL: "m" }).filter(x => x.name === "dahl");
  assert.equal(p.configured, false);
});

test("profiles: built-ins are always listed; an unset PROVIDERS adds no custom profiles", () => {
  const names = loadProfiles({}).map(p => p.name);
  assert.deepEqual(names, ["xai", "openai"]);
  assert.equal(loadProfiles({}).every(p => p.configured), false);
});

test("auto resolution: prefers xai, then openai, then custom profiles, then local", () => {
  assert.equal(resolveForAgent("auto", loadProfiles({ XAI_API_KEY: "k" })).name, "xai");
  assert.equal(resolveForAgent("auto", loadProfiles({ OPENAI_API_KEY: "k" })).name, "openai");
  assert.equal(resolveForAgent("auto", loadProfiles({ PROVIDERS: "dahl", DAHL_BASE_URL: "https://x/v1", DAHL_MODEL: "m", DAHL_API_KEY: "k" })).name, "dahl");
  assert.equal(resolveForAgent("auto", loadProfiles({})).name, "local");
});

test("explicit resolution: a configured vendor wins; unknown or unselected names fall back to local", () => {
  const profiles = loadProfiles({ PROVIDERS: "dahl", DAHL_BASE_URL: "https://x/v1", DAHL_MODEL: "m", DAHL_API_KEY: "k" });
  assert.equal(resolveForAgent("dahl", profiles).name, "dahl");
  assert.equal(resolveForAgent("xai", profiles).name, "xai");
  assert.equal(resolveForAgent("nope", profiles).name, "local");
});

test("explicit resolution: an unconfigured vendor is still resolved by name so the error can name it", () => {
  assert.equal(resolveForAgent("xai", loadProfiles({})).name, "xai");
});

test("stream delta: parses OpenAI-style SSE frames and ignores the [DONE] sentinel", () => {
  const raw = 'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n';
  assert.deepEqual(parseStreamDelta(raw, 0).map(e => e.text), ["Hel", "lo"]);
});

test("stream delta: a partial trailing frame is not consumed, and completes on the next call", () => {
  const first = 'data: {"choices":[{"delta":{"content":"a"}}]}\n\ndata: {"choi';
  const events = parseStreamDelta(first, 0);
  assert.deepEqual(events.map(e => e.text), ["a"]);
  const follow = parseStreamDelta(first + 'ces":[{"delta":{"content":"b"}}]}\n\n', events[0].cursor);
  assert.deepEqual(follow.map(e => e.text), ["b"]);
});

test("stream delta: malformed or contentless frames are ignored, not thrown", () => {
  assert.deepEqual(parseStreamDelta("data: {oops\n\n", 0), []);
  assert.deepEqual(parseStreamDelta('data: {"choices":[{"delta":{}}]}\n\n', 0), []);
});

test("retry policy: 429 and 5xx are retryable, 4xx client errors are not", () => {
  assert.equal(isRetryableStatus(429), true);
  assert.equal(isRetryableStatus(503), true);
  assert.equal(isRetryableStatus(401), false);
  assert.equal(isRetryableStatus(400), false);
});

test("finish reason: the frame that ends a stream is read, not swallowed", () => {
  assert.equal(finishReason('data: {"choices":[{"index":0,"delta":{},"finish_reason":"length"}]}'), "length");
  assert.equal(finishReason('data: {"choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}'), "");
  assert.equal(finishReason("data: [DONE]"), "");
  assert.equal(finishReason("data: {broken"), "");
  assert.equal(finishReason("event: ping"), "");
});

test("finish reason: stop is reported so a complete answer is not flagged", () => {
  assert.equal(finishReason('data: {"choices":[{"finish_reason":"stop"}]}'), "stop");
});

test("usage: a unary response's real token counts are read out", () => {
  assert.deepEqual(usageFromJson({ choices: [{}], usage: { prompt_tokens: 1217, completion_tokens: 431, total_tokens: 1648 } }), { input: 1217, output: 431 });
  assert.equal(usageFromJson({ choices: [{}] }), null, "a server that sends no usage stays an estimate");
  assert.equal(usageFromJson({ usage: { prompt_tokens: "many" } }), null);
  assert.equal(usageFromJson(null), null);
});

test("usage: the final SSE frame carries counts the deltas never do", () => {
  assert.deepEqual(usageFromSseLine('data: {"choices":[],"usage":{"prompt_tokens":900,"completion_tokens":120}}'), { input: 900, output: 120 });
  assert.equal(usageFromSseLine('data: {"choices":[{"delta":{"content":"hi"}}]}'), null);
  assert.equal(usageFromSseLine("data: [DONE]"), null);
  assert.equal(usageFromSseLine("data: {broken"), null);
});

test("stream payload: usage is requested, and only for streams", () => {
  const streamed = completionPayload({ profile: { model: "m" }, messages: [{ role: "user", content: "x" }], stream: true });
  assert.deepEqual(streamed.stream_options, { include_usage: true });
  const unary = completionPayload({ profile: { model: "m" }, messages: [{ role: "user", content: "x" }], stream: false });
  assert.equal("stream_options" in unary, false, "a non-stream response already carries usage");
});

test("usage: keys reported without numbers are 'not reported', never reported zeros", () => {
  assert.equal(usageFromJson({ usage: { prompt_tokens: null, completion_tokens: null } }), null);
  assert.equal(usageFromSseLine('data: {"usage":{"prompt_tokens":"","completion_tokens":5}}'), null);
});

test("profiles: PROVIDERS listing a built-in name does not duplicate the option", () => {
  const names = loadProfiles({ PROVIDERS: "openai dahl", DAHL_BASE_URL: "https://x/v1", DAHL_MODEL: "m" }).map(p => p.name);
  assert.equal(names.filter(n => n === "openai").length, 1);
  assert.ok(names.includes("dahl"));
});

test("requestCompletion: a server that rejects stream_options is retried once without it", async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  const seen: boolean[] = [];
  try {
    const profile = loadProfiles({ OPENAI_API_KEY: "test-key" }).find(p => p.name === "openai")!;
    const fakeFetch = async (_url: unknown, init: { body: string }) => {
      const body = JSON.parse(init.body);
      seen.push(Boolean(body.stream_options));
      if (body.stream_options) return new Response("stream_options is not supported", { status: 400 });
      return new Response("{}", { status: 200 });
    };
    const res = await requestCompletion({ profile, messages: [{ role: "user", content: "hi" }], stream: true, fetchImpl: fakeFetch as never });
    assert.equal(res.ok, true, "the message must survive a server that rejects the usage frame");
    assert.deepEqual(seen, [true, false]);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous;
  }
});

test("requestCompletion: a caller who stopped is not retried — one attempt, then their error", async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  const profile = loadProfiles({ OPENAI_API_KEY: "test-key" }).find(p => p.name === "openai")!;
  const controller = new AbortController();
  let attempts = 0;
  try {
    await assert.rejects(requestCompletion({
      profile,
      messages: [{ role: "user", content: "hi" }],
      stream: false,
      signal: controller.signal,
      fetchImpl: (async () => { attempts++; controller.abort(); throw new DOMException("aborted", "AbortError"); }) as never,
    }));
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous;
  }
  assert.equal(attempts, 1, "a stop is final, not a transient failure to spend budget on");
});

test("a stopped SSE read closes the connection and keeps the text already shown", async () => {
  let cancelled = false;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "hi" }, finish_reason: null }] })}\n\n`));
      // If the reader is not cancelled, the stream ends by itself shortly and the flag stays false.
      setTimeout(() => { try { controller.close(); } catch { /* already cancelled */ } }, 120);
    },
    cancel() { cancelled = true; },
  });
  let stop = false;
  const result = await readSseText(new Response(body, { status: 200 }), () => { stop = true; }, () => stop);
  assert.equal(result.text, "hi", "what already arrived is kept");
  assert.equal(cancelled, true, "the provider connection is closed, not left reading into nothing");
});

test("catalogue endpoint: sits beside chat/completions for both base URL forms", () => {
  assert.equal(catalogEndpoint("https://gw.example/v1"), "https://gw.example/v1/models");
  assert.equal(catalogEndpoint("https://gw.example/v1/"), "https://gw.example/v1/models");
  assert.equal(catalogEndpoint("https://gw.example/v1/chat/completions"), "https://gw.example/v1/models");
});

test("served-model choice: the pinned model wins when the gateway has it", () => {
  assert.deepEqual(chooseServedModel(["gpt-4o-mini", "claude-opus-5"], "gpt-4o-mini"), { model: "gpt-4o-mini", reason: "served" });
});

test("served-model choice: prefers a cheap fast chat model and never an embedding or audio model", () => {
  const ids = ["text-embedding-3-large", "whisper-1", "claude-opus-5", "gpt-6-luna-fast", "gemini-3.7-flash"];
  const picked = chooseServedModel(ids, "gpt-4o-mini");
  assert.equal(picked.reason, "fallback");
  assert.ok(["gemini-3.7-flash", "gpt-6-luna-fast"].includes(picked.model), picked.model);
  assert.equal(chooseServedModel(["embeddings-xl", "tts-1"], "x").reason, "none");
});

test("served-model choice: a heavy model loses to a light one at equal relevance", () => {
  const picked = chooseServedModel(["claude-opus-5", "gpt-5.6-luna"], "gpt-4o-mini");
  assert.equal(picked.model, "gpt-5.6-luna");
});

test("ensureServedModel: an unpinned model the gateway does not serve is replaced and marked automatic", async () => {
  resetModelCatalog();
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const profile = loadProfiles({ OPENAI_API_KEY: "test-key", OPENAI_BASE_URL: "https://gw.example/v1" }).find(p => p.name === "openai")!;
    assert.equal(profile.modelPinned, false, "no OPENAI_MODEL means the model was only a default");
    const resolved = await ensureServedModel(profile, {
      fetchImpl: (async () => new Response(JSON.stringify({ data: [{ id: "gemini-3.7-flash" }, { id: "claude-opus-5" }] }), { status: 200 })) as never,
    });
    assert.equal(resolved.profile.model, "gemini-3.7-flash");
    assert.equal(resolved.auto, true);
    assert.equal(resolved.served, true);
    assert.equal(resolved.count, 2);
  } finally {
    resetModelCatalog();
    if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous;
  }
});

test("ensureServedModel: a pinned model that is missing is reported, never silently replaced", async () => {
  resetModelCatalog();
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const profile = loadProfiles({ OPENAI_API_KEY: "test-key", OPENAI_BASE_URL: "https://gw.example/v1", OPENAI_MODEL: "gpt-4o-mini" }).find(p => p.name === "openai")!;
    assert.equal(profile.modelPinned, true);
    const resolved = await ensureServedModel(profile, {
      fetchImpl: (async () => new Response(JSON.stringify({ data: [{ id: "gemini-3.7-flash" }] }), { status: 200 })) as never,
    });
    assert.equal(resolved.profile.model, "gpt-4o-mini", "the owner's choice survives");
    assert.equal(resolved.served, false);
    assert.equal(resolved.suggestion, "gemini-3.7-flash");
    assert.match(resolved.error ?? "", /does not serve/);
  } finally {
    resetModelCatalog();
    if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous;
  }
});

test("ensureServedModel: an unreachable catalogue leaves the call alone and says why", async () => {
  resetModelCatalog();
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const profile = loadProfiles({ OPENAI_API_KEY: "test-key", OPENAI_BASE_URL: "https://gw.example/v1" }).find(p => p.name === "openai")!;
    const resolved = await ensureServedModel(profile, { fetchImpl: (async () => new Response("nope", { status: 503 })) as never });
    assert.equal(resolved.profile.model, profile.model);
    assert.equal(resolved.auto, false);
    assert.match(resolved.error ?? "", /503/);
  } finally {
    resetModelCatalog();
    if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous;
  }
});

test("requestCompletion: an injected fetch is used as-is, with no catalogue probe", async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  const urls: string[] = [];
  try {
    const profile = loadProfiles({ OPENAI_API_KEY: "test-key" }).find(p => p.name === "openai")!;
    const res = await requestCompletion({
      profile,
      messages: [{ role: "user", content: "hi" }],
      stream: false,
      fetchImpl: (async (url: unknown) => { urls.push(String(url)); return new Response("{}", { status: 200 }); }) as never,
    });
    assert.equal(res.ok, true);
    assert.deepEqual(urls, ["https://api.openai.com/v1/chat/completions"]);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous;
  }
});
