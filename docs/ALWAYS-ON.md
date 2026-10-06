# Running Arova 24/7

A routine can only fire while **something is awake and watching the clock**. Arova gives you two ways to be
awake, and you can use both together. The **Automations → 24/7 control room** in the app shows, live, which
one is actually ticking.

| | Built-in worker | Outside clock (`/api/cron`) |
|---|---|---|
| What it is | A loop inside the server process, started by `src/instrumentation.ts` | Any scheduler that makes an HTTP call |
| Needs | A host that keeps the process running | A public URL and `CRON_SECRET` |
| Granularity | Every 30 s (`SCHEDULER_INTERVAL_SECONDS`) | Whatever the caller does (1–5 min typical) |
| Fails when | The process sleeps, restarts or is stopped | The caller stops calling |

## Why it was not running 24/7 before

Previously a due routine was only claimed when someone **loaded the workspace**. Close the tab and the clock
stopped. Now `src/instrumentation.ts` starts a worker on server boot that claims due routines on its own, and
`/api/cron` lets an outside clock do it. Both use the same atomic claim, so running them together never
double-fires a routine. If the server was off when a routine fell due, it fires once on the next tick.

## Option A — host the server somewhere that stays up (recommended)

Any always-on machine works: a VPS, Railway, Fly.io, a home server. No cron needed.

**Docker Compose** (app + Postgres, restarts after crashes and reboots)

```bash
git clone https://github.com/AnshRoshan/arova && cd arova
cp .env.example .env        # set a model key (e.g. XAI_API_KEY) and CRON_SECRET
docker compose -f deploy/docker-compose.yml up -d --build
```

**PM2** (no Docker)

```bash
npm ci && npx drizzle-kit push && npm run build
npm i -g pm2 && pm2 start npm --name arova -- start
pm2 save && pm2 startup     # run the command it prints so it survives reboots
```

**systemd**: see `deploy/arova.service`.

Check the logs for `[arova] scheduler worker started — checking for due routines every 30s`.

## Option B — hosts that sleep (Vercel, Render free, Netlify…)

Serverless processes are frozen between requests, so the built-in worker can't run. Call `/api/cron` from
outside:

1. Set `CRON_SECRET` on the server (`openssl rand -hex 32`). Until it's set, `/api/cron` returns 503.
2. Pick a caller:
   * **GitHub Actions** (free): `.github/workflows/arova-cron.yml` is already in the repo. Add the secrets
     `ARO_URL` and `CRON_SECRET`. Runs every 5 minutes.
   * **Vercel Cron**: add `{"crons":[{"path":"/api/cron","schedule":"* * * * *"}]}` to `vercel.json`.
     Vercel sends `Authorization: Bearer $CRON_SECRET` itself. Hobby plans only allow once-a-day schedules.
   * **cron-job.org / UptimeRobot / crontab**:
     `curl -X POST https://your-host/api/cron -H "Authorization: Bearer $CRON_SECRET"`

A successful call returns `{"ok":true,"workspaces":1,"claimed":1,"reaped":0,"tookMs":...}`.

## Putting a time trigger on an agent

1. **Automations → Routines → +** (or ask any agent: *"every weekday at 9 send me a standup summary"*).
2. Choose **Daily / Weekdays / Weekly / Hours / Minutes** and a time. The dialog previews the next three run
   times in your workspace time zone. Minute schedules start at 5 minutes.
3. **Run now** executes it immediately so you can see the result before waiting for the clock.

Each firing creates a real run with steps and posts the answer to that agent's thread. Every run is a model
call against your daily budget (`DAILY_MODEL_CALLS_LIMIT`, default 60 per provider per day). A routine that
fails ten times in a row switches itself off and tells you why.

## Webhook triggers (event-driven)

An organisation can also be briefed by an outside event: open an organisation's channel → **Trigger** → create a
token, then `POST /api/trigger` with `Authorization: Bearer <token>` and `{"text":"…"}`.

## Settings reference

| Variable | Default | Meaning |
|---|---|---|
| `SCHEDULER_WORKER` | `on` | `off` disables the in-process loop |
| `SCHEDULER_INTERVAL_SECONDS` | `30` | Loop period, clamped to 5–600 |
| `CRON_SECRET` | *(unset → endpoint closed)* | Shared secret for `/api/cron` |
| `DAILY_MODEL_CALLS_LIMIT` | `60` | Model calls per workspace/provider/day (`0` = unlimited) |

## Honest limits

* **Auth is still the cookie demo.** A workspace belongs to the browser cookie that created it. Don't expose a
  public URL with real keys until sign-in is in place.
* Routines run the agent against the model only. There is no browser, file or connector execution.
* If the server is *off*, nothing fires. The control room will say so ("Was running, now silent") instead of
  pretending.
