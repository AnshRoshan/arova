"use client";

import { useEffect, useState } from "react";
import { Check, Clock3, Copy, Globe2, HeartPulse, KeyRound, RefreshCw, Rocket, Server, Timer, Webhook, Zap } from "lucide-react";

type Beat = { startedAt: string; lastTickAt: string; ticks: number; lastClaimed: number; totalClaimed: number; lastError: string | null };
type DriverState = "live" | "stale" | "never" | "off";
export type SchedulerInfo = {
  headline: "always-on" | "on-open" | "degraded";
  now: string;
  intervalSeconds: number;
  worker: { enabled: boolean; state: DriverState; beat: Beat | null };
  cron: { configured: boolean; state: DriverState; beat: Beat | null };
};

const ago = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const upFor = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  return `${Math.floor(s / 86400)} d ${Math.floor((s % 86400) / 3600)} h`;
};

function Snippet({ title, hint, code }: { title: string; hint?: string; code: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(false), 1600); return () => clearTimeout(t); }, [done]);
  return <div className="ao-snippet">
    <div className="ao-snippet-head"><b>{title}</b>{hint && <span>{hint}</span>}
      <button type="button" className="ghost" onClick={() => { void navigator.clipboard?.writeText(code).then(() => setDone(true)); }}>{done ? <><Check size={13} />Copied</> : <><Copy size={13} />Copy</>}</button>
    </div>
    <pre><code>{code}</code></pre>
  </div>;
}

const STATE_COPY: Record<DriverState, { label: string; tone: string }> = {
  live: { label: "live", tone: "ran" }, stale: { label: "stopped ticking", tone: "fault" }, never: { label: "waiting for first tick", tone: "waiting" }, off: { label: "not in use", tone: "idle" },
};

const PRESETS: { label: string; hint: string; schedule: string }[] = [
  { label: "Morning briefing", hint: "Every day at 8:00 AM", schedule: "Every day at 8:00 AM" },
  { label: "Weekday stand-up", hint: "Weekdays at 9:30 AM", schedule: "Weekdays at 9:30 AM" },
  { label: "Monday planning", hint: "Every Monday at 9:00 AM", schedule: "Every Monday at 9:00 AM" },
  { label: "End-of-week recap", hint: "Every Friday at 4:00 PM", schedule: "Every Friday at 4:00 PM" },
  { label: "Every 6 hours", hint: "Four times a day, around the clock", schedule: "Every 6 hours" },
  { label: "Every 30 minutes", hint: "A frequent check (watch the budget)", schedule: "Every 30 minutes" },
];

type Guide = "vps" | "vercel" | "github" | "cron";

export function AlwaysOn({ info, origin, routineCount, enabledCount, onPreset, onRefresh }: { info: SchedulerInfo; origin: string; routineCount: number; enabledCount: number; onPreset: (schedule: string) => void; onRefresh: () => void }) {
  const [now, setNow] = useState(() => new Date(info.now).getTime());
  const [guide, setGuide] = useState<Guide>("vps");
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const host = origin || "https://your-app.example.com";
  const head = {
    "always-on": { title: "Always on", body: "Something is ticking right now. Due routines fire on time, with nobody in the app.", tone: "ran" },
    degraded: { title: "Was running, now silent", body: "A scheduler ticked before but has stopped. The server may have been restarted, put to sleep, or stopped.", tone: "fault" },
    "on-open": { title: "Runs only when opened", body: "No scheduler has ticked yet. Routines will only fire when you open the app until a worker or an outside clock is running.", tone: "waiting" },
  }[info.headline];
  const w = info.worker, c = info.cron;

  const guides: { id: Guide; label: string; icon: typeof Server }[] = [
    { id: "vps", label: "Server or Docker", icon: Server }, { id: "vercel", label: "Vercel", icon: Rocket },
    { id: "github", label: "GitHub Actions", icon: Webhook }, { id: "cron", label: "Any cron", icon: Timer },
  ];

  return <div className="ao">
    <section className={`ao-hero ${head.tone}`} aria-live="polite">
      <div className="ao-beacon" aria-hidden><i /><i /><i /><HeartPulse size={26} /></div>
      <div className="ao-hero-main">
        <span className="ao-kicker">Scheduler status</span>
        <h2>{head.title}</h2>
        <p>{head.body}</p>
        <div className="ao-hero-meta">
          <span><b>{enabledCount}</b> of {routineCount} routine{routineCount === 1 ? "" : "s"} armed</span>
          <span>checks every <b>{info.intervalSeconds}s</b></span>
        </div>
      </div>
      <button type="button" className="ghost" onClick={onRefresh}><RefreshCw size={14} />Refresh</button>
    </section>

    <div className="ao-grid">
      <section className="ao-card">
        <header><span className="ao-ico"><Zap size={16} /></span><div><h3>Built-in worker</h3><p>Loop inside the server process</p></div><span className={`chip ${STATE_COPY[w.state].tone}`}><i />{STATE_COPY[w.state].label}</span></header>
        {w.enabled && w.beat ? <dl>
          <div><dt>Last tick</dt><dd className="mono">{ago(w.beat.lastTickAt, now)}</dd></div>
          <div><dt>Up for</dt><dd className="mono">{upFor(w.beat.startedAt, now)}</dd></div>
          <div><dt>Ticks</dt><dd className="mono">{w.beat.ticks.toLocaleString()}</dd></div>
          <div><dt>Runs started</dt><dd className="mono">{w.beat.totalClaimed.toLocaleString()}</dd></div>
        </dl> : <p className="ao-note">{w.enabled ? "Starts with the server. No tick recorded yet — if this stays empty, the host is not keeping the process alive." : "Switched off with SCHEDULER_WORKER=off. Remove it to turn the loop back on."}</p>}
        {w.beat?.lastError && <p className="ao-error">Last error: {w.beat.lastError}</p>}
        <footer>Lives exactly as long as the server process. Free hosts that sleep stop it — pair it with an outside clock.</footer>
      </section>

      <section className="ao-card">
        <header><span className="ao-ico"><Globe2 size={16} /></span><div><h3>Outside clock</h3><p>Anything that can call <span className="mono">/api/cron</span></p></div><span className={`chip ${STATE_COPY[c.state].tone}`}><i />{c.configured ? STATE_COPY[c.state].label : "closed · no secret"}</span></header>
        {c.configured && c.beat ? <dl>
          <div><dt>Last call</dt><dd className="mono">{ago(c.beat.lastTickAt, now)}</dd></div>
          <div><dt>Calls</dt><dd className="mono">{c.beat.ticks.toLocaleString()}</dd></div>
          <div><dt>Runs started</dt><dd className="mono">{c.beat.totalClaimed.toLocaleString()}</dd></div>
        </dl> : <p className="ao-note">{c.configured ? "The endpoint is open to callers with the secret. Nothing has called it yet." : <>Closed until <span className="mono">CRON_SECRET</span> is set on the server. Generate one with <span className="mono">openssl rand -hex 32</span>.</>}</p>}
        <footer><KeyRound size={12} /> Needs the header <span className="mono">Authorization: Bearer $CRON_SECRET</span>. The secret never reaches this page.</footer>
      </section>
    </div>

    <section className="ao-section">
      <div className="ao-section-head"><Clock3 size={16} /><div><h3>Time triggers</h3><p>Pick a rhythm, then tell an agent what to do on it. Times use your workspace time zone.</p></div></div>
      <div className="ao-presets">{PRESETS.map(p => <button type="button" key={p.schedule} className="ao-preset" onClick={() => onPreset(p.schedule)}><b>{p.label}</b><span>{p.hint}</span></button>)}</div>
    </section>

    <section className="ao-section">
      <div className="ao-section-head"><Rocket size={16} /><div><h3>Keep it running 24/7</h3><p>The bot can only fire while something is awake. Choose where it lives.</p></div></div>
      <div className="ao-guide-tabs" role="tablist">{guides.map(g => <button type="button" key={g.id} role="tab" aria-selected={guide === g.id} className={guide === g.id ? "on" : ""} onClick={() => setGuide(g.id)}><g.icon size={14} />{g.label}</button>)}</div>

      {guide === "vps" && <div className="ao-guide">
        <p><b>Best option.</b> A small always-on machine (a VPS, Railway, Fly.io, a Raspberry Pi) runs the server, and the built-in worker does the rest — no cron needed.</p>
        <Snippet title="Docker Compose" hint="app + Postgres, restarts forever" code={`git clone https://github.com/AnshRoshan/arova && cd arova\ncp .env.example .env     # add DATABASE_URL, a model key, CRON_SECRET\ndocker compose -f deploy/docker-compose.yml up -d --build`} />
        <Snippet title="PM2 on any Linux box" hint="survives crashes and reboots" code={`npm ci && npx drizzle-kit push && npm run build\nnpm i -g pm2\npm2 start npm --name arova -- start\npm2 save && pm2 startup   # run the command it prints`} />
        <p className="ao-fine">Also in the repo: <span className="mono">deploy/arova.service</span> (systemd) and <span className="mono">docs/ALWAYS-ON.md</span>.</p>
      </div>}

      {guide === "vercel" && <div className="ao-guide">
        <p>Serverless hosts freeze between requests, so the built-in worker cannot run there. Use Vercel Cron to call <span className="mono">/api/cron</span> instead. Set <span className="mono">CRON_SECRET</span> in the project environment and Vercel sends it automatically.</p>
        <Snippet title="vercel.json" hint="every minute needs Pro; Hobby allows once a day" code={`{\n  "crons": [{ "path": "/api/cron", "schedule": "* * * * *" }]\n}`} />
        <p className="ao-fine">On Hobby, combine with the GitHub Actions clock for free sub-daily runs.</p>
      </div>}

      {guide === "github" && <div className="ao-guide">
        <p>Free, and works with any host. GitHub calls your server every five minutes (its minimum). Add repository secrets <span className="mono">ARO_URL</span> (<span className="mono">{host}</span>) and <span className="mono">CRON_SECRET</span>.</p>
        <Snippet title=".github/workflows/arova-cron.yml" hint="already in the repo" code={`name: arova-cron\non:\n  schedule: [{ cron: "*/5 * * * *" }]\n  workflow_dispatch:\njobs:\n  tick:\n    runs-on: ubuntu-latest\n    steps:\n      - run: curl -fsS -X POST "\${{ secrets.ARO_URL }}/api/cron" -H "Authorization: Bearer \${{ secrets.CRON_SECRET }}"`} />
      </div>}

      {guide === "cron" && <div className="ao-guide">
        <p>cron-job.org, UptimeRobot, a Cloudflare Worker, or your own crontab: anything that can make a request on a timetable.</p>
        <Snippet title="Try it from a terminal" hint="replace the secret" code={`curl -X POST ${host}/api/cron \\\n  -H "Authorization: Bearer $CRON_SECRET"`} />
        <Snippet title="crontab -e" hint="every minute" code={`* * * * * curl -fsS -X POST ${host}/api/cron -H "Authorization: Bearer $CRON_SECRET" >/dev/null`} />
        <p className="ao-fine">A successful call returns <span className="mono">{`{"ok":true,"claimed":N}`}</span> and this page flips to <b>Always on</b> within a minute.</p>
      </div>}
    </section>
  </div>;
}
