"use client";

import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import { describeSchedule, nextRunAt, parseSchedule } from "@/lib/scheduler";

/**
 * A schedule picker that can only produce labels the scheduler understands. It is fully controlled by the
 * label string: it reads the label with parseSchedule and writes a new one, so there is no second copy of
 * the state to drift and a preset chip elsewhere can set the value just by changing the string.
 */
type Mode = "daily" | "weekdays" | "weekly" | "hours" | "minutes";

const DAYS = [
  { iso: 1, name: "Monday" }, { iso: 2, name: "Tuesday" }, { iso: 3, name: "Wednesday" }, { iso: 4, name: "Thursday" },
  { iso: 5, name: "Friday" }, { iso: 6, name: "Saturday" }, { iso: 7, name: "Sunday" },
];

const clock12 = (hour: number, minute: number) => `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;

const read = (label: string): { mode: Mode; hour: number; minute: number; day: number; every: number } => {
  const s = parseSchedule(label);
  if (!s) return { mode: "daily", hour: 8, minute: 0, day: 1, every: 6 };
  if (s.everyHours !== null) {
    return s.everyHours < 1
      ? { mode: "minutes", hour: 8, minute: 0, day: 1, every: Math.round(s.everyHours * 60) }
      : { mode: "hours", hour: 8, minute: 0, day: 1, every: s.everyHours };
  }
  const hour = s.hour ?? 8;
  if (s.weekdays === null) return { mode: "daily", hour, minute: s.minute, day: 1, every: 6 };
  if (s.weekdays.length === 5) return { mode: "weekdays", hour, minute: s.minute, day: 1, every: 6 };
  return { mode: "weekly", hour, minute: s.minute, day: s.weekdays[0], every: 6 };
};

const write = (p: ReturnType<typeof read>): string => {
  switch (p.mode) {
    case "daily": return `Every day at ${clock12(p.hour, p.minute)}`;
    case "weekdays": return `Weekdays at ${clock12(p.hour, p.minute)}`;
    case "weekly": return `Every ${DAYS.find(d => d.iso === p.day)?.name ?? "Monday"} at ${clock12(p.hour, p.minute)}`;
    case "hours": return `Every ${p.every} hours`;
    case "minutes": return `Every ${p.every} minutes`;
  }
};

const MODES: { id: Mode; label: string }[] = [
  { id: "daily", label: "Daily" }, { id: "weekdays", label: "Weekdays" }, { id: "weekly", label: "Weekly" },
  { id: "hours", label: "Hours" }, { id: "minutes", label: "Minutes" },
];

export function ScheduleBuilder({ value, onChange, timezone }: { value: string; onChange: (label: string) => void; timezone: string }) {
  const p = useMemo(() => read(value), [value]);
  const set = (patch: Partial<typeof p>) => onChange(write({ ...p, ...patch }));
  const timed = p.mode === "daily" || p.mode === "weekdays" || p.mode === "weekly";
  const upcoming = useMemo(() => {
    const first = nextRunAt(value, timezone, new Date());
    if (!first) return [];
    const out = [first];
    for (let i = 0; i < 2; i++) { const n = nextRunAt(value, timezone, out[out.length - 1]); if (n) out.push(n); }
    return out;
  }, [value, timezone]);
  const fmt = (d: Date) => d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone });

  return <div className="sched-builder">
    <div className="sched-modes" role="radiogroup" aria-label="How often">
      {MODES.map(m => <button type="button" key={m.id} role="radio" aria-checked={p.mode === m.id} className={p.mode === m.id ? "on" : ""} onClick={() => set({ mode: m.id, every: m.id === "minutes" ? 30 : m.id === "hours" ? 6 : p.every })}>{m.label}</button>)}
    </div>
    <div className="sched-row">
      {p.mode === "weekly" && <label className="sched-field"><span>On</span>
        <select aria-label="Day of the week" value={p.day} onChange={e => set({ day: Number(e.target.value) })}>{DAYS.map(d => <option key={d.iso} value={d.iso}>{d.name}</option>)}</select>
      </label>}
      {timed && <label className="sched-field"><span>At</span>
        <input type="time" aria-label="Time of day" value={`${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`} onChange={e => { const [h, m] = e.target.value.split(":").map(Number); if (Number.isFinite(h) && Number.isFinite(m)) set({ hour: h, minute: m }); }} />
      </label>}
      {p.mode === "hours" && <label className="sched-field"><span>Every</span>
        <select aria-label="Hours between runs" value={p.every} onChange={e => set({ every: Number(e.target.value) })}>{[1, 2, 3, 4, 6, 8, 12, 24].map(n => <option key={n} value={n}>{n === 1 ? "hour" : `${n} hours`}</option>)}</select>
      </label>}
      {p.mode === "minutes" && <label className="sched-field"><span>Every</span>
        <select aria-label="Minutes between runs" value={p.every} onChange={e => set({ every: Number(e.target.value) })}>{[5, 10, 15, 20, 30, 45].map(n => <option key={n} value={n}>{n} minutes</option>)}</select>
      </label>}
    </div>
    <div className="sched-preview">
      <CalendarClock size={14} />
      <div>
        <strong>{describeSchedule(value, timezone)}</strong>
        {upcoming.length ? <span>Next: {upcoming.map(fmt).join(" · ")}</span> : <span>Not a schedule the server can run.</span>}
      </div>
    </div>
  </div>;
}
