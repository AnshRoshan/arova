import { test } from "node:test";
import assert from "node:assert/strict";
import { describeSchedule, isDue, missedIntervalMs, nextRunAt, parseSchedule } from "./scheduler.ts";

const at = (iso: string) => new Date(iso);
const utc = (d: Date | null) => (d ? d.toISOString() : null);

test("parse: the five saved labels and an hourly form all resolve", () => {
  assert.deepEqual(parseSchedule("Every day at 8:00 AM"), { minute: 0, hour: 8, weekdays: null, everyHours: null });
  assert.deepEqual(parseSchedule("Weekdays at 8:00 AM"), { minute: 0, hour: 8, weekdays: [1, 2, 3, 4, 5], everyHours: null });
  assert.deepEqual(parseSchedule("Every Monday at 9:00 AM"), { minute: 0, hour: 9, weekdays: [1], everyHours: null });
  assert.deepEqual(parseSchedule("Every Friday at 4:00 PM"), { minute: 0, hour: 16, weekdays: [5], everyHours: null });
  assert.deepEqual(parseSchedule("Every 6 hours"), { minute: 0, hour: null, weekdays: null, everyHours: 6 });
});

test("parse: anything unrecognised is null, not a guess", () => {
  assert.equal(parseSchedule("Every week"), null);
  assert.equal(parseSchedule(""), null);
  assert.equal(parseSchedule("sometime on tuesday maybe"), null);
  assert.equal(parseSchedule("Every day at 25:00"), null);
});

test("next: daily 8am rolls to tomorrow after the hour, in UTC", () => {
  assert.equal(utc(nextRunAt("Every day at 8:00 AM", "UTC", at("2026-03-02T07:59:00Z"))), "2026-03-02T08:00:00.000Z");
  assert.equal(utc(nextRunAt("Every day at 8:00 AM", "UTC", at("2026-03-02T08:00:00Z"))), "2026-03-03T08:00:00.000Z");
});

test("next: the same label means a different instant per workspace zone", () => {
  const after = at("2026-03-02T00:00:00Z");
  assert.equal(utc(nextRunAt("Every day at 8:00 AM", "Asia/Kolkata", after)), "2026-03-02T02:30:00.000Z");
  assert.equal(utc(nextRunAt("Every day at 8:00 AM", "America/New_York", after)), "2026-03-02T13:00:00.000Z", "8am New York is EST (UTC-5) until 8 March");
});

test("next: weekdays skip the weekend and land on Monday", () => {
  // Friday 2026-03-06 22:00 UTC is Friday 17:00 in New York: today's 8am has passed, Saturday/Sunday are excluded.
  assert.equal(utc(nextRunAt("Weekdays at 8:00 AM", "America/New_York", at("2026-03-06T22:00:00Z"))), "2026-03-09T12:00:00.000Z");
});

test("next: a named weekday waits for that weekday", () => {
  assert.equal(utc(nextRunAt("Every Monday at 9:00 AM", "UTC", at("2026-03-03T10:00:00Z"))), "2026-03-09T09:00:00.000Z");
  assert.equal(utc(nextRunAt("Every Friday at 4:00 PM", "UTC", at("2026-03-03T10:00:00Z"))), "2026-03-06T16:00:00.000Z");
});

test("next: hourly schedules step from the instant asked about", () => {
  assert.equal(utc(nextRunAt("Every 6 hours", "UTC", at("2026-03-02T07:00:00Z"))), "2026-03-02T12:00:00.000Z");
  assert.equal(utc(nextRunAt("Every 6 hours", "UTC", at("2026-03-02T12:00:00Z"))), "2026-03-02T18:00:00.000Z");
});

test("next: a wall clock that spring-forward deletes is skipped, not invented", () => {
  // 2026-03-08 in the US: 02:00 EST becomes 03:00 EDT, so 02:30 New York time never exists that day.
  const before = at("2026-03-07T09:00:00Z");
  const next = nextRunAt("Every day at 2:30 AM", "America/New_York", before);
  assert.equal(utc(next), "2026-03-09T06:30:00.000Z", "must land on the next real 2:30, not a fabricated one");
});

test("next: an unparseable label or unknown zone yields no time", () => {
  assert.equal(nextRunAt("Every week", "UTC", at("2026-03-02T00:00:00Z")), null);
  assert.equal(nextRunAt("Every day at 8:00 AM", "Mars/Olympus_Mons", at("2026-03-02T00:00:00Z")), null);
  assert.equal(nextRunAt("Every day at 8:00 AM", "UTC", null), null);
});

test("due: a schedule is due at or after its time, and not before", () => {
  const next = at("2026-03-02T08:00:00Z");
  assert.equal(isDue(next, at("2026-03-02T07:59:59Z")), false);
  assert.equal(isDue(next, at("2026-03-02T08:00:00Z")), true);
  assert.equal(isDue(next, at("2026-03-05T00:00:00Z")), true);
  assert.equal(isDue(null, at("2026-03-05T00:00:00Z")), false, "no schedule means never due");
});

test("missed: lateness beyond the schedule's own interval is flagged, once", () => {
  const daily = parseSchedule("Every day at 8:00 AM")!;
  const next = at("2026-03-02T08:00:00Z");
  assert.equal(missedIntervalMs(daily, next, at("2026-03-02T12:00:00Z")), false, "four hours late on a daily is just late");
  assert.equal(missedIntervalMs(daily, next, at("2026-03-05T08:00:00Z")), true, "three days late means the laptop was closed");
  const hourly = parseSchedule("Every 6 hours")!;
  assert.equal(missedIntervalMs(hourly, next, at("2026-03-02T20:00:00Z")), true);
});

test("describe: the UI gets a sentence that names the zone", () => {
  assert.equal(describeSchedule("Every day at 8:00 AM", "Asia/Kolkata"), "8:00 AM daily, Asia/Kolkata");
  assert.equal(describeSchedule("Weekdays at 8:00 AM", "UTC"), "8:00 AM Mon–Fri, UTC");
  assert.equal(describeSchedule("Every 6 hours", "UTC"), "every 6 hours, UTC");
  assert.equal(describeSchedule("Every Friday at 4:00 PM", "UTC"), "4:00 PM Fri, UTC", "a PM hour must not print as 16:00 PM");
  assert.equal(describeSchedule("Every day at 12:00 AM", "UTC"), "12:00 AM daily, UTC");
  assert.equal(describeSchedule("Every week", "UTC"), "no recognised schedule — it will not run");
});
