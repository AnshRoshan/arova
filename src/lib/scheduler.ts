/**
 * Schedules.
 *
 * A routine is saved with a human label ("Weekdays at 8:00 AM") and a workspace time zone. This
 * module turns that pair into a real instant — and nothing else: no database, no clock of its own,
 * no side effects, so the timezone maths can be tested against fixed dates.
 *
 * The subtle part is that "8:00 AM in Asia/Kolkata" and "8:00 AM in America/New_York" are not the
 * same moment, and twice a year one of them does not exist at all. Everything here works in wall
 * clock first and converts by projection, which is what makes daylight saving fall out correctly
 * instead of being special-cased.
 */

export type Schedule = { minute: number; hour: number | null; weekdays: number[] | null; everyHours: number | null };

const WEEKDAYS: Record<string, number> = { sunday: 1 === 1 ? 7 : 7, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

const timeOf = (text: string): { hour: number; minute: number } | null => {
  const m = /(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(text);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
};

/** The five labels the UI offers, plus `Every N hours`. Anything else is not a schedule. */
export function parseSchedule(label: string): Schedule | null {
  const text = (label ?? "").trim();
  if (!text) return null;

  const every = /^every\s+(\d{1,3})\s+hours?$/i.exec(text);
  if (every) {
    const hours = Number(every[1]);
    return hours >= 1 && hours <= 168 ? { minute: 0, hour: null, weekdays: null, everyHours: hours } : null;
  }

  const named = /^every\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+at\s+(.+)$/i.exec(text);
  if (named) {
    const time = timeOf(named[2]);
    return time ? { minute: time.minute, hour: time.hour, weekdays: [WEEKDAYS[named[1].toLowerCase()]], everyHours: null } : null;
  }

  const weekdays = /^weekdays\s+at\s+(.+)$/i.exec(text);
  if (weekdays) {
    const time = timeOf(weekdays[1]);
    return time ? { minute: time.minute, hour: time.hour, weekdays: [1, 2, 3, 4, 5], everyHours: null } : null;
  }

  const daily = /^every\s+day\s+at\s+(.+)$/i.exec(text);
  if (daily) {
    const time = timeOf(daily[1]);
    return time ? { minute: time.minute, hour: time.hour, weekdays: null, everyHours: null } : null;
  }

  return null;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
const partsOf = (when: Date, timeZone: string) => {
  let fmt = fmtCache.get(timeZone);
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    } catch {
      return null;
    }
    fmtCache.set(timeZone, fmt);
  }
  const found: Record<string, string> = {};
  for (const part of fmt.formatToParts(when)) if (part.type !== "literal") found[part.type] = part.value;
  const y = Number(found.year), mo = Number(found.month), d = Number(found.day), h = Number(found.hour) % 24, mi = Number(found.minute);
  if ([y, mo, d, h, mi].some(Number.isNaN)) return null;
  return { y, mo, d, h, mi, weekday: isoWeekday(Date.UTC(y, mo - 1, d)) };
};

/** ISO numbering: Monday 1 … Sunday 7. */
const isoWeekday = (utcMs: number) => ((new Date(utcMs).getUTCDay() + 6) % 7) + 1;

/**
 * Wall clock → instant, by projecting a guess and correcting it. A wall clock that the time zone
 * never shows (the hour spring-forward deletes) resolves to an instant that reads back differently,
 * and the caller is expected to notice.
 */
function zonedToInstant(y: number, mo: number, d: number, h: number, mi: number, timeZone: string): { instant: Date; exact: boolean } | null {
  const target = Date.UTC(y, mo - 1, d, h, mi);
  let ts = target;
  for (let i = 0; i < 3; i++) {
    const p = partsOf(new Date(ts), timeZone);
    if (!p) return null;
    const offset = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - ts;
    ts = target - offset;
  }
  const back = partsOf(new Date(ts), timeZone);
  if (!back) return null;
  return { instant: new Date(ts), exact: back.y === y && back.mo === mo && back.d === d && back.h === h && back.mi === mi };
}

/** The first occurrence strictly after `after`, or null when the label is not a schedule. */
export function nextRunAt(label: string, timeZone: string, after: Date | null): Date | null {
  const schedule = parseSchedule(label);
  if (!schedule || !after) return null;
  if (schedule.everyHours) {
    const step = schedule.everyHours * 3600_000;
    return new Date((Math.floor(after.getTime() / step) + 1) * step);
  }
  const origin = partsOf(after, timeZone);
  if (!origin) return null;
  for (let day = 0; day < 400; day++) {
    const probe = new Date(Date.UTC(origin.y, origin.mo - 1, origin.d + day, 12, 0));
    const wall = partsOf(probe, timeZone);
    if (!wall) return null;
    if (schedule.weekdays && !schedule.weekdays.includes(wall.weekday)) continue;
    const found = zonedToInstant(wall.y, wall.mo, wall.d, schedule.hour!, schedule.minute, timeZone);
    if (!found || !found.exact) continue; // a DST-absent wall clock: skip the day rather than invent it
    if (found.instant.getTime() > after.getTime()) return found.instant;
  }
  return null;
}

export const isDue = (nextRun: Date | null, now: Date): boolean => !!nextRun && now.getTime() >= nextRun.getTime();

/** Late is normal. Later than a whole interval means the app was closed and some runs never happened. */
export function missedIntervalMs(schedule: Schedule, nextRun: Date, now: Date): boolean {
  const late = now.getTime() - nextRun.getTime();
  if (late <= 0) return false;
  const window = schedule.everyHours ? schedule.everyHours * 3600_000 : 24 * 3600_000 * (schedule.weekdays?.length === 5 ? 3 : 1);
  return late > window;
}

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function describeSchedule(label: string, timeZone: string): string {
  const schedule = parseSchedule(label);
  if (!schedule) return "no recognised schedule — it will not run";
  if (schedule.everyHours) return `every ${schedule.everyHours} hours, ${timeZone}`;
  const hour = schedule.hour ?? 0;
  const meridiem = hour < 12 ? "AM" : "PM";
  const clock = `${hour % 12 === 0 ? 12 : hour % 12}:${String(schedule.minute).padStart(2, "0")} ${meridiem}`;
  const when = schedule.weekdays === null ? "daily" : schedule.weekdays.length === 5 ? "Mon–Fri" : DAY_NAMES[schedule.weekdays[0]];
  return `${clock} ${when}, ${timeZone}`;
}
