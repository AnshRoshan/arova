# Feature 19 — Local OS sandbox (execution tier)

## The problem

Arova can run a command only in its own Node process (the four local tools and `web_fetch`).
There is no shell, no workspace and no way to run an agent's actual tool work. The obvious
answer — E2B or a Docker supervisor — needs a key, a daemon or a cloud account. Claude Code's
approach uses the host OS instead: Seatbelt on macOS, `bubblewrap` on Linux/WSL2, or a dedicated
Windows user + WFP filters, with a host-side proxy for network policy. Anthropic open-sourced it
as `@anthropic-ai/sandbox-runtime` (Apache-2.0, v0.0.81).

This feature uses it as a **peer provider behind Arova's existing `SandboxProvider` contract**.
It is an execution tier: shell commands and a persistent workspace. It is not a desktop.

## Provider contract

`src/lib/sandbox.ts` now has two implementations:

- `UnconfiguredSandboxProvider` — refuses everything (the default).
- `LocalOsSandboxProvider` — `name: "local-os"`, capabilities:
  `{graphical:false, pty:true, snapshots:false, takeover:false, persistentHome:true, multiScreen:false}`.

`create` makes a per-agent workspace under `AROVA_SANDBOX_ROOT` (default `.arova/sandboxes/<agentId>`)
and writes `srt-settings.json`. `execute` accepts only `{type:"computer", action:"exec",
input:{command}}`, runs the packaged CLI via `process.execPath` (not a `.cmd` shim or a host shell),
and returns stdout/stderr. `browser`/`stream` refuse with "no GUI stream". `destroy` removes the
workspace. There is no memory snapshot; `pause`/`stop` are no-ops because no process persists
between commands.

## Settings (server-side, never model- or browser-controlled)

- `network.allowedDomains`: from `AROVA_SANDBOX_ALLOWED_DOMAINS`, empty by default. srt's proxy
  denies loopback, cloud metadata and host interface addresses; the empty allowlist is the
  CVE-2025-66479 regression case and must deny everything.
- `filesystem.allowWrite`: the agent workspace only.
- `filesystem.denyRead`: `~/.ssh`, `~/.aws`, `~/.config/gcloud`, `~/.azure`, `.env`, `.env.local`,
  and the project-root `.env`/`.env.local` by absolute path.
- `denyWrite`: `.env`, `.env.local`.

## Server behaviour

`runSandboxCommand` (a manual, human-triggered action) creates a real `runs` row and step, upserts a
`sandboxes` row (`provider:"local-os"`, `READY`/`ERROR`), calls the provider, records the output,
audits `sandbox.ran` or `sandbox.refused`, and returns `{sandbox:{ok, output|error, runId, provider}}`.
A provider failure is a `FAILED` run, not an HTTP error, so the console can show the exact sentence.
The old `sandboxAction` now points to this action and says the local provider has no desktop.

## UI

Integrations → Sandbox: provider and capability chips, the opt-in status, a seat selector, a command
box, Run and Check. The output/refusal is rendered in the existing code block; the run appears in
Runs and the activity board. Settings → Deployment limits names the provider and says "shell only,
no GUI".

## Security and honest limits

- The sandbox shares the host kernel. It is a process boundary, not a VM; not a multi-tenant
  isolation boundary.
- The model cannot edit the settings or toggle the sandbox. The command is typed by a human in the
  console; the model does not call it.
- A shell is high risk. Credentials are denied by path, network is default-deny, and every command
  is audited. Do not run this as a public multi-tenant service without a stronger provider.
- Windows requires a one-time `npx srt windows-install` (UAC + a local `srt-sandbox` user and WFP
  filters). On a shared machine use `--skip-profile-grant`.
- The package is pre-1.0 and adds a high `zod` advisory. Pin it; keep the capability opt-in.

## Out of scope

GUI/desktop, VNC/stream, takeover, snapshots/resume, multi-screen, headless browser guarantees
(Chromium under srt needs its own spike; macOS is known broken), automatic model tool calls, and a
hosted multi-tenant policy.

## Verification

- `src/lib/sandbox.test.ts` **9/9**: settings allow/deny and empty network, allowlist parsing,
  capabilities, create + execute via an injected runner (no host shell), output cap, non-zero refusal,
  browser/stream refusal, path traversal rejection, unconfigured refusal.
- `npm test` **219/219**.
- Output is capped at 20,000 characters with an explicit truncation line; `resetSandbox` deletes the
  per-agent workspace and the `sandboxes` row while keeping the runs/audit; the Sandbox tab shows the
  selected seat's workspace state and recent sandbox runs.
- The proposed config passes `SandboxRuntimeConfigSchema`; the CLI and library fail closed on this
  Windows host with the exact "Sandbox user is not provisioned" message until the UAC install.
- Live: with `AROVA_SANDBOX_PROVIDER=local-os`, Integrations → Sandbox showed the provider and
  capability chips; Check ran, created a `Sandbox · Scout` FAILED run, an ERROR `sandboxes` row, and
  rendered the refusal. A successful command is **not** verified on this host until the owner runs
  `npx srt windows-install`.
