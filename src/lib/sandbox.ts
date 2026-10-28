/**
 * Execution providers.
 *
 * `unconfigured` refuses everything. `local-os` wraps a command with Anthropic's
 * `@anthropic-ai/sandbox-runtime` on this host: no Docker, no image, no VM, no GUI. It is a
 * process boundary on the host kernel, so it is honest about what it cannot do: no desktop,
 * no stream, no snapshot, no takeover. A command failure is a refusal, never a pretend result.
 *
 * The settings are built here, server-side, and never come from the model or the browser.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type SandboxState = "CREATING" | "READY" | "STARTING" | "ACTIVE" | "IDLE" | "PAUSING" | "PAUSED" | "STOPPING" | "STOPPED" | "ERROR" | "DESTROYING" | "DESTROYED";
export type SandboxCapabilities = {
  graphical: boolean;
  pty: boolean;
  snapshots: boolean;
  takeover: boolean;
  persistentHome: boolean;
  multiScreen: boolean;
};
export type Command = { type: "browser" | "computer"; action: string; input?: Record<string, unknown> };
export interface SandboxProvider {
  readonly name: string;
  readonly capabilities: SandboxCapabilities;
  create(input: { workspaceId: string; agentId: string }): Promise<{ id: string; status: SandboxState }>;
  get(id: string): Promise<{ id: string; status: SandboxState }>;
  start(id: string): Promise<void>;
  pause(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  destroy(id: string): Promise<void>;
  execute(id: string, command: Command): Promise<{ output: string }>;
  browser(id: string): Promise<{ url: string }>;
  stream(id: string): Promise<{ url: string }>;
}

export const UNCONFIGURED_CAPABILITIES: SandboxCapabilities = {
  graphical: false, pty: false, snapshots: false, takeover: false, persistentHome: false, multiScreen: false,
};
export const LOCAL_OS_CAPABILITIES: SandboxCapabilities = {
  graphical: false, pty: true, snapshots: false, takeover: false, persistentHome: true, multiScreen: false,
};

/** A safe, explicit no-op provider for development without container infrastructure. */
export class UnconfiguredSandboxProvider implements SandboxProvider {
  readonly name = "unconfigured";
  readonly capabilities = UNCONFIGURED_CAPABILITIES;
  private unavailable(): never { throw new Error("Computer runtime is not configured. Set AROVA_SANDBOX_PROVIDER=local-os and install the sandbox runtime, or configure another provider."); }
  async create(_input: { workspaceId: string; agentId: string }): Promise<{ id: string; status: SandboxState }> { return this.unavailable(); }
  async get(_id: string): Promise<{ id: string; status: SandboxState }> { return this.unavailable(); }
  async start(_id: string): Promise<void> { return this.unavailable(); }
  async pause(_id: string): Promise<void> { return this.unavailable(); }
  async stop(_id: string): Promise<void> { return this.unavailable(); }
  async destroy(_id: string): Promise<void> { return this.unavailable(); }
  async execute(_id: string, _command: Command): Promise<{ output: string }> { return this.unavailable(); }
  async browser(_id: string): Promise<{ url: string }> { return this.unavailable(); }
  async stream(_id: string): Promise<{ url: string }> { return this.unavailable(); }
}

export type SrtSettings = {
  network: { allowedDomains: string[]; deniedDomains: string[] };
  filesystem: { denyRead: string[]; allowWrite: string[]; denyWrite: string[] };
};

const safeId = (id: string): string => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("Invalid agent id for a sandbox workspace.");
  return id;
};

export function parseAllowedDomains(raw: string | undefined): string[] {
  return (raw ?? "").split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
}

/**
 * The settings the CLI receives. Write is allow-only; the project's env files are denied by
 * absolute path because the command's cwd is the workspace, not the project root. Network is
 * allow-only and starts empty: a command that needs a host must be given one by the operator.
 */
export function buildSrtSettings(input: { workspace: string; projectRoot?: string; allowedDomains?: string[]; platform?: NodeJS.Platform }): SrtSettings {
  const projectRoot = input.projectRoot ?? process.cwd();
  // On Windows the credential stores are already protected: either the profile read grant excludes
  // them, or the profile is unreadable because no grant exists. Denying them here makes the runtime
  // rewrite the profile root's DACL and walk the entire tree, which takes minutes to hours.
  const homeDenies = (input.platform ?? process.platform) === "win32"
    ? []
    : ["~/.ssh", "~/.aws", "~/.config/gcloud", "~/.azure"];
  const denyRead = [
    ...homeDenies,
    ".env", ".env.local",
    path.join(projectRoot, ".env"), path.join(projectRoot, ".env.local"),
  ];
  return {
    network: { allowedDomains: input.allowedDomains ?? [], deniedDomains: [] },
    filesystem: {
      denyRead,
      allowWrite: [input.workspace],
      denyWrite: [".env", ".env.local"],
    },
  };
}

/**
 * Where a seat's workspace lives. On Windows it is outside the user profile: with the profile read
 * grant skipped (the install this app recommends) the sandbox account cannot traverse the user's
 * profile, and the runtime reports a workspace inside it as a mapped drive and refuses.
 */
export function defaultSandboxRoot(env: Record<string, string | undefined> = process.env, platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") return path.join(env.PUBLIC || "C:\\Users\\Public", "arova", "sandboxes");
  return path.join(process.cwd(), ".arova", "sandboxes");
}

export type SrtRunner = (bin: string, args: string[], opts: { cwd: string; timeoutMs: number }) => Promise<{ code: number | null; stdout: string; stderr: string }>;

const MAX_OUTPUT = 20_000;
const NL = String.fromCharCode(10);
const capOutput = (value: string): string => value.length <= MAX_OUTPUT
  ? value
  : `${value.slice(0, MAX_OUTPUT)}${NL}… truncated at ${MAX_OUTPUT.toLocaleString("en-US")} characters of ${value.length.toLocaleString("en-US")}`;

const defaultRunner: SrtRunner = (bin, args, opts) => new Promise(resolve => {
  const child = spawn(bin, args, { cwd: opts.cwd, windowsHide: true, env: { ...process.env } });
  let stdout = "", stderr = "";
  child.stdout.on("data", d => { stdout += d; });
  child.stderr.on("data", d => { stderr += d; });
  const timer = setTimeout(() => {
    try {
      if (process.platform === "win32" && child.pid) spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
      else child.kill("SIGKILL");
    } catch { /* best effort; the close event still resolves */ }
    stderr += `\n(timed out after ${opts.timeoutMs}ms)`;
  }, opts.timeoutMs);
  child.on("error", error => { clearTimeout(timer); resolve({ code: null, stdout, stderr: `${stderr}${error.message}` }); });
  child.on("close", code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
});

/** Resolve the packaged CLI's JS entry, so the provider does not depend on a .cmd shim in PATH. */
function resolveSrtCli(): string {
  const explicit = process.env.AROVA_SRT_CLI;
  if (explicit && existsSync(explicit)) return explicit;
  const packaged = path.join(process.cwd(), "node_modules", "@anthropic-ai", "sandbox-runtime", "dist", "cli.js");
  if (existsSync(packaged)) return packaged;
  throw new Error("Local OS sandbox needs @anthropic-ai/sandbox-runtime on the server. Run `npm install @anthropic-ai/sandbox-runtime`, restart, and on Windows run `npx srt windows-install` once.");
}

export type LocalOsOptions = {
  root?: string;
  projectRoot?: string;
  allowedDomains?: string[];
  timeoutMs?: number;
  cliPath?: string;
  runner?: SrtRunner;
};

export class LocalOsSandboxProvider implements SandboxProvider {
  readonly name = "local-os";
  readonly capabilities = LOCAL_OS_CAPABILITIES;
  private readonly root: string;
  private readonly projectRoot: string;
  private readonly allowedDomains: string[];
  private readonly timeoutMs: number;
  private readonly cliPath: string | null;
  private readonly runner: SrtRunner;

  constructor(options: LocalOsOptions = {}) {
    this.root = options.root ?? defaultSandboxRoot();
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.allowedDomains = options.allowedDomains ?? [];
    // initialize() runs the runtime's own WFP probe, which has a 30 s budget and can retry; a
    // shorter cap kills setup and reports only "timed out" instead of the runtime's typed refusal.
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.cliPath = options.cliPath ?? null;
    this.runner = options.runner ?? defaultRunner;
  }

  workspace(id: string): string {
    return path.join(this.root, safeId(id));
  }

  private settingsPath(id: string): string {
    return path.join(this.workspace(id), "srt-settings.json");
  }

  private async ensure(id: string): Promise<string> {
    const workspace = this.workspace(id);
    await mkdir(workspace, { recursive: true });
    const settings = buildSrtSettings({ workspace, projectRoot: this.projectRoot, allowedDomains: this.allowedDomains });
    await writeFile(this.settingsPath(id), JSON.stringify(settings, null, 2), "utf8");
    return workspace;
  }

  async create(input: { workspaceId: string; agentId: string }): Promise<{ id: string; status: SandboxState }> {
    await this.ensure(input.agentId);
    return { id: input.agentId, status: "READY" };
  }

  async get(id: string): Promise<{ id: string; status: SandboxState }> {
    return { id, status: existsSync(this.workspace(id)) ? "READY" : "STOPPED" };
  }

  async start(id: string): Promise<void> { await this.ensure(id); }
  async pause(): Promise<void> { /* no memory snapshot; the process is not running between commands */ }
  async stop(): Promise<void> { /* no persistent process */ }
  async destroy(id: string): Promise<void> { await rm(this.workspace(id), { recursive: true, force: true }); }

  async execute(id: string, command: Command): Promise<{ output: string }> {
    if (command.type !== "computer" || command.action !== "exec") throw new Error("The local OS sandbox runs shell commands only; it has no browser or desktop stream.");
    const raw = typeof command.input?.command === "string" ? command.input.command.trim() : "";
    if (!raw) throw new Error("A sandbox command is required.");
    if (raw.length > 2000) throw new Error("The sandbox command is longer than 2,000 characters.");
    const workspace = await this.ensure(id);
    const cli = this.cliPath ?? resolveSrtCli();
    const result = await this.runner(process.execPath, [cli, "--settings", this.settingsPath(id), "-c", raw], { cwd: workspace, timeoutMs: this.timeoutMs });
    const output = capOutput([result.stdout, result.stderr].filter(Boolean).join(NL).trim());
    if (result.code !== 0) throw new Error(output.replace(/^Error:\s*/i, "") || `The sandbox exited with code ${result.code}.`);
    return { output: output || "(no output)" };
  }

  async browser(): Promise<{ url: string }> { throw new Error("The local OS sandbox has no GUI browser stream. Use a desktop provider for view/takeover."); }
  async stream(): Promise<{ url: string }> { throw new Error("The local OS sandbox has no GUI stream. Use a desktop provider for view/takeover."); }
}

/** Opt-in: no provider runs commands on the host unless AROVA_SANDBOX_PROVIDER says so. */
export function providerFromEnv(env: Record<string, string | undefined> = process.env): SandboxProvider {
  const kind = (env.AROVA_SANDBOX_PROVIDER ?? "").trim().toLowerCase();
  if (kind === "local-os" || kind === "local") {
    return new LocalOsSandboxProvider({
      root: env.AROVA_SANDBOX_ROOT,
      allowedDomains: parseAllowedDomains(env.AROVA_SANDBOX_ALLOWED_DOMAINS),
      timeoutMs: Number(env.AROVA_SANDBOX_TIMEOUT_MS) || undefined,
    });
  }
  return new UnconfiguredSandboxProvider();
}

export const sandboxProvider: SandboxProvider = providerFromEnv();
