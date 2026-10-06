import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoop, type Timers } from "./worker.ts";

function fakeTimers() {
  const queue: { fn: () => void; ms: number; id: number; live: boolean }[] = [];
  let n = 0;
  const timers: Timers = { set: (fn, ms) => { const t = { fn, ms, id: ++n, live: true }; queue.push(t); return t; }, clear: h => { (h as { live: boolean }).live = false; } };
  const fire = async () => { const t = queue.filter(x => x.live).shift(); if (!t) return false; t.live = false; t.fn(); await new Promise(r => setImmediate(r)); return true; };
  return { timers, fire, pending: () => queue.filter(x => x.live).length, queue };
}

test("each finished pass arms exactly one next pass at the interval", async () => {
  const f = fakeTimers(); let calls = 0;
  createLoop(async () => { calls++; }, () => 30_000, 10, f.timers);
  assert.equal(f.queue[0].ms, 10);
  await f.fire();
  assert.equal(calls, 1);
  assert.equal(f.pending(), 1);
  assert.equal(f.queue.filter(x => x.live)[0].ms, 30_000);
});

test("a pass that throws is logged and the loop keeps going", async () => {
  const f = fakeTimers(); const logs: string[] = [];
  createLoop(async () => { throw new Error("db down"); }, () => 1000, 0, f.timers, m => logs.push(m));
  await f.fire();
  assert.match(logs[0], /db down/);
  assert.equal(f.pending(), 1);
});

test("stop prevents any further pass", async () => {
  const f = fakeTimers(); let calls = 0;
  const loop = createLoop(async () => { calls++; }, () => 1000, 0, f.timers);
  await f.fire();
  loop.stop();
  assert.equal(f.pending(), 0);
  assert.equal(await f.fire(), false);
  assert.equal(calls, 1);
});
