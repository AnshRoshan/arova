import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalOsSandboxProvider, UnconfiguredSandboxProvider, buildSrtSettings, defaultSandboxRoot, parseAllowedDomains, type SrtRunner } from "./sandbox.ts";

const AGENT = "11111111-1111-4111-8111-111111111111";

test("the settings are allow-only, deny credentials by absolute path, and start with no network", () => {
  const settings = buildSrtSettings({ workspace: "/work/agent", projectRoot: "/app", allowedDomains: ["example.com"], platform: "linux" });
  assert.deepEqual(settings.network.allowedDomains, ["example.com"]);
  assert.deepEqual(settings.filesystem.allowWrite, ["/work/agent"]);
  assert.ok(settings.filesystem.denyRead.includes("~/.ssh"));
  assert.ok(settings.filesystem.denyRead.some(p => p.endsWith(".env.local")));
  assert.ok(settings.filesystem.denyWrite.includes(".env"));
});

test("on Windows the home denies are left to the profile grant, which already excludes them", () => {
  // A deny on ~/.ssh forces the runtime to rewrite the DACL on the profile root and walk the whole
  // tree (hours on a real machine). Without a profile read grant the profile is unreadable anyway;
  // with one, the grant itself excludes the credential stores. Project .env files are still denied.
  const windows = buildSrtSettings({ workspace: "C:\\work\\agent", projectRoot: "C:\\app", platform: "win32" });
  assert.equal(windows.filesystem.denyRead.some(p => p.startsWith("~")), false);
  assert.ok(windows.filesystem.denyRead.includes(".env"));
  assert.ok(windows.filesystem.denyRead.some(p => p.endsWith(".env.local")));
  const linux = buildSrtSettings({ workspace: "/work/agent", projectRoot: "/app", platform: "linux" });
  assert.ok(linux.filesystem.denyRead.includes("~/.ssh"), "a Linux home is readable by default, so it is denied there");
});

test("a Windows workspace is outside the user profile, which the sandbox account cannot read", () => {
  const publicDir = "C:\\Users\\Public";
  assert.equal(defaultSandboxRoot({ PUBLIC: publicDir }, "win32"), join(publicDir, "arova", "sandboxes"));
  assert.equal(defaultSandboxRoot({}, "linux"), join(process.cwd(), ".arova", "sandboxes"));
});

test("the allowlist parser accepts commas and whitespace and drops empties", () => {
  assert.deepEqual(parseAllowedDomains("a.com, b.com  c.com"), ["a.com", "b.com", "c.com"]);
  assert.deepEqual(parseAllowedDomains(undefined), []);
});

test("local-os advertises shell/files but no GUI, snapshot or takeover", () => {
  const p = new LocalOsSandboxProvider({ cliPath: "/fake/cli.js", runner: async () => ({ code: 0, stdout: "", stderr: "" }) });
  assert.deepEqual(p.capabilities, { graphical: false, pty: true, snapshots: false, takeover: false, persistentHome: true, multiScreen: false });
});

test("create writes the settings and execute passes the command to srt, not a host shell", async () => {
  const root = mkdtempSync(join(tmpdir(), "arova-sandbox-"));
  const seen = { bin: "", args: [] as string[], cwd: "", timeoutMs: 0 };
  const runner: SrtRunner = async (bin, args, opts) => { seen.bin = bin; seen.args = args; seen.cwd = opts.cwd; seen.timeoutMs = opts.timeoutMs; return { code: 0, stdout: "hello", stderr: "" }; };
  try {
    const p = new LocalOsSandboxProvider({ root, projectRoot: "/app", allowedDomains: ["example.com"], cliPath: "/fake/cli.js", runner });
    const created = await p.create({ workspaceId: "w", agentId: AGENT });
    assert.equal(created.status, "READY");
    const settings = JSON.parse(readFileSync(join(root, AGENT, "srt-settings.json"), "utf8"));
    assert.deepEqual(settings.network.allowedDomains, ["example.com"]);
    const out = await p.execute(AGENT, { type: "computer", action: "exec", input: { command: "echo hi" } });
    assert.equal(out.output, "hello");
    assert.equal(seen.timeoutMs, 120_000, "the budget covers initialize's own probe");
    assert.equal(seen.bin, process.execPath);
    assert.ok(seen.args.includes("--settings"));
    assert.ok(seen.args.includes("-c"));
    assert.ok(seen.args.includes("echo hi"));
    assert.equal(seen.cwd, join(root, AGENT));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a huge command output is capped and says so", async () => {
  const root = mkdtempSync(join(tmpdir(), "arova-sandbox-"));
  try {
    const p = new LocalOsSandboxProvider({ root, cliPath: "/fake/cli.js", runner: async () => ({ code: 0, stdout: "x".repeat(25_000), stderr: "" }) });
    const out = await p.execute(AGENT, { type: "computer", action: "exec", input: { command: "yes" } });
    assert.match(out.output, /truncated at 20,000 characters of 25,000/);
    assert.ok(out.output.length < 21_000);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a non-zero srt exit is a refusal carrying its output", async () => {
  const root = mkdtempSync(join(tmpdir(), "arova-sandbox-"));
  try {
    const p = new LocalOsSandboxProvider({ root, cliPath: "/fake/cli.js", runner: async () => ({ code: 2, stdout: "", stderr: "Connection blocked by network allowlist" }) });
    await assert.rejects(() => p.execute(AGENT, { type: "computer", action: "exec", input: { command: "curl example.com" } }), /blocked by network allowlist/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("browser and stream refuse rather than invent a desktop", async () => {
  const p = new LocalOsSandboxProvider({ cliPath: "/fake/cli.js", runner: async () => ({ code: 0, stdout: "", stderr: "" }) });
  await assert.rejects(() => p.browser(), /no GUI browser stream/i);
  await assert.rejects(() => p.stream(), /no GUI stream/i);
});

test("an invalid agent id cannot escape the workspace root", async () => {
  const p = new LocalOsSandboxProvider({ cliPath: "/fake/cli.js", runner: async () => ({ code: 0, stdout: "", stderr: "" }) });
  await assert.rejects(() => p.create({ workspaceId: "w", agentId: "../../etc" }), /invalid agent id/i);
});

test("the unconfigured provider still refuses everything", async () => {
  const p = new UnconfiguredSandboxProvider();
  await assert.rejects(() => p.execute("x", { type: "computer", action: "exec" }), /not configured/i);
  assert.equal(p.capabilities.pty, false);
});
