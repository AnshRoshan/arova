import { test } from "node:test";
import assert from "node:assert/strict";
import { LOCAL_TOOL_IDS, runLocalTool } from "./local-tools.ts";

/* Spec 05's real-execution gap: tools that genuinely run inside this process, with no credential
 * and no sandbox. Each one is a pure function so the registry can only ever claim what works. */

test("calc: evaluates arithmetic, and refuses anything that is not arithmetic", () => {
  assert.equal(runLocalTool("calc", "2*(3+4)").output, "14");
  assert.equal(runLocalTool("calc", "10/4").output, "2.5");
  assert.equal(runLocalTool("calc", "2^10").output, "1024");
  assert.equal(runLocalTool("calc", "-3 + 5 % 2").output, "-2");
  assert.equal(runLocalTool("calc", "(1+2").ok, false, "unbalanced parentheses are an error, not a guess");
  assert.equal(runLocalTool("calc", "1/0").ok, false);
  assert.equal(runLocalTool("calc", "require('fs')").ok, false, "no path to code evaluation exists");
  assert.equal(runLocalTool("calc", "process.exit()").ok, false);
});

test("now_in_timezone: projects an instant through a named IANA zone", () => {
  const r = runLocalTool("now_in_timezone", "Europe/Berlin @ 2026-07-01T12:00:00Z");
  assert.equal(r.ok, true);
  assert.match(String(r.output), /14:00/, "Berlin in July is UTC+2");
  assert.match(String(r.output), /Europe\/Berlin/);
  assert.equal(runLocalTool("now_in_timezone", "Not/AZone").ok, false, "an invented zone is refused");
  const now = runLocalTool("now_in_timezone", "Asia/Kolkata");
  assert.equal(now.ok, true, "no instant means the clock right now");
});

test("json_transform: pretty-prints, and a dotted path selects one value", () => {
  const pretty = runLocalTool("json_transform", '{"a":{"b":[1,2]}}');
  assert.equal(pretty.ok, true);
  assert.match(String(pretty.output), /\n {2}"a"/);
  const pick = runLocalTool("json_transform", "a.b.1::{\"a\":{\"b\":[1,2]}}");
  assert.equal(String(pick.output).trim(), "2");
  assert.equal(runLocalTool("json_transform", "{oops").ok, false);
  assert.equal(runLocalTool("json_transform", "a.zz::{\"a\":1}").ok, false, "a path that misses says so");
});

test("checksum: hashes bytes, sha256 unless an algorithm is named with ::", () => {
  assert.equal(runLocalTool("checksum", "abc").output, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(runLocalTool("checksum", "md5::abc").output, "900150983cd24fb0d6963f7d28e17f72");
  assert.equal(runLocalTool("checksum", "rot13::abc").ok, false, "only real algorithms, and only node:crypto's");
  assert.equal(runLocalTool("checksum", "md5 is nice").ok, true, "plain text that mentions a name is still its own text");
});

test("the id list is the contract the registry and the console both read", () => {
  assert.deepEqual([...LOCAL_TOOL_IDS].sort(), ["calc", "checksum", "json_transform", "now_in_timezone"]);
  assert.equal(runLocalTool("web_search", "anything").ok, false, "a tool that cannot run here cannot be invoked here");
});
