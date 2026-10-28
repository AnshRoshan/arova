/**
 * The WSL sandbox: bubblewrap inside the local Ubuntu distro, chosen when the Windows runtime
 * cannot start (its sandbox account is denied remote logon in an RDP session).
 *
 * What it guarantees, and nothing more: the command runs in a new user/pid/network namespace, the
 * root filesystem is read-only, only the workspace is writable, `/tmp` is a private tmpfs, and both
 * the Linux home and the Windows profile are masked. Network is absent rather than allow-listed —
 * there is no proxy in this provider. There is no seccomp monitor and no snapshot.
 */

import { spawn } from "node:child_process";
import { homedir } from "node:os";

export type WslRunner = (args: string[], opts: { stdin?: string; timeoutMs: number }) => Promise<{ code: number | null; stdout: string; stderr: string }>;

export const WSL_CAPABILITIES = { graphical: false, pty: true, snapshots: false, takeover: false, persistentHome: true, multiScreen: false };

const MAX_OUTPUT = 20_000;
const NL = String.fromCharCode(10);
const safeId = (id: string): string => id.replace(/[^a-zA-Z0-9-]/g, "");
const capOutput = (value: string): string => value.length <= MAX_OUTPUT
  ? value
  : `${value.slice(0, MAX_OUTPUT)}${NL}… truncated at ${MAX_OUTPUT.toLocaleString("en-US")} characters of ${value.length.toLocaleString("en-US")}`;

/** C:\\Users\\Ansh → /mnt/c/Users/Ansh, which is how WSL mounts the Windows drive. */
export function toWslPath(windowsPath: string): string {
  const match = /^([a-zA-Z]):[\\/](.*)$/.exec(windowsPath);
  if (!match) return windowsPath;
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, "/")}`;
}

export function wslBwrapArgs(input: { workspace: string; home: string; windowsHome: string; script: string }): string[] {
  return [
    "--die-with-parent",
    "--unshare-all",
    "--new-session",
    "--ro-bind", "/", "/",
    "--dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
    "--bind", input.workspace, input.workspace,
    "--chdir", input.workspace,
    "--tmpfs", input.home,
    ...(input.windowsHome ? ["--tmpfs", input.windowsHome] : []),
    "--clearenv",
    "--setenv", "PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "--setenv", "HOME", input.home,
    "--setenv", "TERM", "dumb",
    "--",
    "bash", input.script,
  ];
}

const defaultRunner: WslRunner = (args, opts) => new Promise(resolve => {
  const child = spawn("wsl.exe", ["-e", ...args], { windowsHide: true, env: { ...process.env } });
  let stdout = "", stderr = "";
  child.stdout.on("data", data => { stdout += data; });
  child.stderr.on("data", data => { stderr += data; });
  if (opts.stdin !== undefined) child.stdin.end(opts.stdin);
  else child.stdin.end();
  const timer = setTimeout(() => {
    try {
      if (child.pid) spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
    } catch { /* best effort; close still resolves */ }
    stderr += `${NL}(timed out after ${opts.timeoutMs}ms)`;
  }, opts.timeoutMs);
  child.on("error", error => { clearTimeout(timer); resolve({ code: null, stdout, stderr: `${stderr}${error.message}` }); });
  child.on("close", code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
});

export class WslSandboxProvider implements SandboxProviderLike {
  readonly name = "wsl";
  readonly capabilities = WSL_CAPABILITIES;
  private readonly root: string;
  private readonly windowsHome: string;
  private readonly runner: WslRunner;
  private readonly timeoutMs: number;
  private home: string | null;

  constructor(options: { root?: string; home?: string; windowsHome?: string; runner?: WslRunner; timeoutMs?: number } = {}) {
    this.root = options.root ?? "/var/tmp/arova-sandboxes";
    this.home = options.home ?? null;
    this.windowsHome = options.windowsHome ?? toWslPath(homedir());
    this.runner = options.runner ?? defaultRunner;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  workspace(id: string): string {
    return `${this.root.replace(/\/+$/, "")}/${safeId(id)}`;
  }

  private async resolveHome(): Promise<string> {
    if (this.home) return this.home;
    const found = await this.runner(["sh", "-c", `printf %s "$HOME"`], { timeoutMs: this.timeoutMs });
    this.home = found.stdout.trim() || "/root";
    return this.home;
  }

  async create(input: { workspaceId: string; agentId: string }): Promise<{ id: string; status: "READY" }> {
    await this.resolveHome();
    const made = await this.runner(["mkdir", "-p", this.workspace(input.agentId)], { timeoutMs: this.timeoutMs });
    if (made.code !== 0) throw new Error(made.stderr.trim() || "The WSL workspace could not be created.");
    return { id: input.agentId, status: "READY" };
  }

  async get(id: string): Promise<{ id: string; status: "READY" | "STOPPED" }> {
    const found = await this.runner(["test", "-d", this.workspace(id)], { timeoutMs: this.timeoutMs });
    return { id, status: found.code === 0 ? "READY" : "STOPPED" };
  }

  async start(id: string): Promise<void> { await this.create({ workspaceId: "", agentId: id }); }
  async pause(): Promise<void> { /* no process persists between commands */ }
  async stop(): Promise<void> { /* no process persists between commands */ }
  async destroy(id: string): Promise<void> {
    await this.runner(["rm", "-rf", this.workspace(id)], { timeoutMs: this.timeoutMs });
  }

  async execute(id: string, command: { type: string; action: string; input?: Record<string, unknown> }): Promise<{ output: string }> {
    if (command.type !== "computer" || command.action !== "exec") throw new Error("The WSL sandbox runs shell commands only; it has no browser or desktop stream.");
    const raw = typeof command.input?.command === "string" ? command.input.command.trim() : "";
    if (!raw) throw new Error("A sandbox command is required.");
    if (raw.length > 2000) throw new Error("The sandbox command is longer than 2,000 characters.");
    const home = await this.resolveHome();
    await this.create({ workspaceId: "", agentId: id });
    const workspace = this.workspace(id);
    const script = `${workspace}/.arova-run.sh`;
    const written = await this.runner(["tee", script], { stdin: `set -e${NL}${raw}${NL}`, timeoutMs: this.timeoutMs });
    if (written.code !== 0) throw new Error(written.stderr.trim() || "The command could not be staged in the WSL workspace.");
    let result: { code: number | null; stdout: string; stderr: string };
    try {
      result = await this.runner(["bwrap", ...wslBwrapArgs({ workspace, home, windowsHome: this.windowsHome, script })], { timeoutMs: this.timeoutMs });
    } finally {
      await this.runner(["rm", "-f", script], { timeoutMs: 10_000 }).catch(() => {});
    }
    const output = capOutput([result.stdout, result.stderr].filter(Boolean).join(NL).trim());
    if (result.code !== 0) throw new Error(output || `The sandbox exited with code ${result.code}.`);
    return { output: output || "(no output)" };
  }

  async browser(): Promise<{ url: string }> { throw new Error("The WSL sandbox has no GUI browser stream. Use a desktop provider for view/takeover."); }
  async stream(): Promise<{ url: string }> { throw new Error("The WSL sandbox has no GUI stream. Use a desktop provider for view/takeover."); }
}

/** The shape `providerFromEnv` needs; kept structural so this module does not import the provider file. */
type SandboxProviderLike = {
  readonly name: string;
  readonly capabilities: typeof WSL_CAPABILITIES;
  create(input: { workspaceId: string; agentId: string }): Promise<{ id: string; status: string }>;
  get(id: string): Promise<{ id: string; status: string }>;
  start(id: string): Promise<void>;
  pause(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  destroy(id: string): Promise<void>;
  execute(id: string, command: { type: string; action: string; input?: Record<string, unknown> }): Promise<{ output: string }>;
  browser(id: string): Promise<{ url: string }>;
  stream(id: string): Promise<{ url: string }>;
};
