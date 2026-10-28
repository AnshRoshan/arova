import { test } from "node:test";
import assert from "node:assert/strict";
import { WslSandboxProvider, wslBwrapArgs, type WslRunner } from "./sandbox-wsl.ts";

const AGENT = "11111111-1111-4111-8111-111111111111";

test("the bwrap argv hides both homes, binds only the workspace and unshares everything", () => {
  const args = wslBwrapArgs({ workspace: "/var/tmp/arova/agent", home: "/home/tester", windowsHome: "/mnt/c/Users/tester", script: "/var/tmp/arova/agent/run.sh" });
  assert.ok(args.includes("--unshare-all"), "network, pid and user namespaces are all unshared");
  assert.deepEqual(args.slice(args.indexOf("--bind"), args.indexOf("--bind") + 3), ["--bind", "/var/tmp/arova/agent", "/var/tmp/arova/agent"]);
  assert.deepEqual(args.slice(args.indexOf("--tmpfs", args.indexOf("--bind") + 3), args.indexOf("--tmpfs", args.indexOf("--bind") + 3) + 2), ["--tmpfs", "/home/tester"]);
  assert.ok(args.includes("/mnt/c/Users/tester"), "the Windows profile is hidden too");
  assert.deepEqual(args.slice(-2), ["bash", "/var/tmp/arova/agent/run.sh"]);
  assert.ok(args.includes("--clearenv"), "the host environment does not leak into the command");
});

test("execute writes the command as a script (no shell quoting) and runs bwrap", async () => {
  const calls: { args: string[]; stdin?: string }[] = [];
  const runner: WslRunner = async (args, opts) => { calls.push({ args, stdin: opts.stdin }); return { code: 0, stdout: "hello", stderr: "" }; };
  const p = new WslSandboxProvider({ root: "/var/tmp/arova", home: "/home/tester", windowsHome: "/mnt/c/Users/tester", runner });
  const out = await p.execute(AGENT, { type: "computer", action: "exec", input: { command: "echo hi && echo 'quoted'" } });
  assert.equal(out.output, "hello");
  assert.deepEqual(calls[0].args.slice(0, 2), ["mkdir", "-p"]);
  assert.deepEqual(calls[1].args.slice(0, 2), ["tee", `/var/tmp/arova/${AGENT}/.arova-run.sh`]);
  assert.match(String(calls[1].stdin), /echo hi && echo 'quoted'/, "the command is passed verbatim");
  assert.equal(calls[2].args[0], "bwrap");
  assert.deepEqual(calls[3].args.slice(0, 2), ["rm", "-f"]);
});

test("a non-zero sandbox exit is a refusal with its output, not a success", async () => {
  const runner: WslRunner = async args => args[0] === "bwrap"
    ? { code: 2, stdout: "", stderr: "bash: no such file" }
    : { code: 0, stdout: "", stderr: "" };
  const p = new WslSandboxProvider({ root: "/var/tmp/arova", home: "/home/tester", runner });
  await assert.rejects(p.execute(AGENT, { type: "computer", action: "exec", input: { command: "nope" } }), /no such file/);
});

test("the provider advertises a shell but no GUI, snapshot or takeover", () => {
  const p = new WslSandboxProvider({ runner: async () => ({ code: 0, stdout: "", stderr: "" }) });
  assert.deepEqual(p.capabilities, { graphical: false, pty: true, snapshots: false, takeover: false, persistentHome: true, multiScreen: false });
});

test("a browser or stream request is refused rather than faked", async () => {
  const p = new WslSandboxProvider({ runner: async () => ({ code: 0, stdout: "", stderr: "" }) });
  await assert.rejects(p.browser(), /no GUI/);
  await assert.rejects(p.stream(), /no GUI/);
});
