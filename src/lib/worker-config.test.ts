import { test } from "node:test";
import assert from "node:assert/strict";
import { alwaysOn, cronState, driverState, schedulerIntervalSeconds, workerEnabled, type Beat } from "./worker-config.ts";

const now = new Date("2026-03-02T12:00:00Z");
const beat = (agoSeconds: number, ticks = 5): Beat => ({ startedAt: "2026-03-02T00:00:00Z", lastTickAt: new Date(now.getTime() - agoSeconds * 1000), ticks, lastClaimed: 0, totalClaimed: 0, lastError: null });

test("the worker is on by default and off only when asked", () => {
  assert.equal(workerEnabled({}), true);
  assert.equal(workerEnabled({ SCHEDULER_WORKER: "OFF" }), false);
  assert.equal(workerEnabled({ SCHEDULER_WORKER: "on" }), true);
});

test("the interval is clamped and ignores junk", () => {
  assert.equal(schedulerIntervalSeconds({}), 30);
  assert.equal(schedulerIntervalSeconds({ SCHEDULER_INTERVAL_SECONDS: "1" }), 5);
  assert.equal(schedulerIntervalSeconds({ SCHEDULER_INTERVAL_SECONDS: "99999" }), 600);
  assert.equal(schedulerIntervalSeconds({ SCHEDULER_INTERVAL_SECONDS: "abc" }), 30);
});

test("a worker is live for three intervals, then stale", () => {
  assert.equal(driverState(beat(80), 30, now), "live");
  assert.equal(driverState(beat(95), 30, now), "stale");
  assert.equal(driverState(null, 30, now), "never");
  assert.equal(driverState(beat(1, 0), 30, now), "never");
  assert.equal(driverState(beat(1), 30, now, false), "off");
});

test("cron is live inside twenty minutes and off when no secret is set", () => {
  assert.equal(cronState(beat(600), true, now), "live");
  assert.equal(cronState(beat(1500), true, now), "stale");
  assert.equal(cronState(null, true, now), "never");
  assert.equal(cronState(beat(1), false, now), "off");
});

test("the headline never claims more than a recent beat proves", () => {
  assert.equal(alwaysOn("live", "off"), "always-on");
  assert.equal(alwaysOn("stale", "live"), "always-on");
  assert.equal(alwaysOn("stale", "off"), "degraded");
  assert.equal(alwaysOn("never", "never"), "on-open");
  assert.equal(alwaysOn("off", "off"), "on-open");
});
