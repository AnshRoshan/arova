import { test } from "node:test";
import assert from "node:assert/strict";
import { HUES, hueFor, hueVars, type Hue } from "./identity.ts";

/* WCAG relative luminance, computed here so the palette cannot drift into unreadable territory. */
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

test("the palette is six distinct, fully-specified hues", () => {
  assert.equal(HUES.length, 6);
  assert.equal(new Set(HUES.map(h => h.id)).size, 6);
  for (const h of HUES) {
    for (const [field, value] of Object.entries(h)) {
      if (field === "id") continue;
      assert.match(String(value), /^#[0-9a-f]{6}$/, `${h.id}.${field} must be a hex colour`);
    }
  }
});

test("hues are cool, and never borrow a state colour", () => {
  const states = ["#14684f", "#8a5208", "#9b2720"]; // --ran, --waiting, --fault
  for (const h of HUES) {
    assert.ok(!states.includes(h.ink), `${h.id} collides with a state semantic`);
    const r = parseInt(h.ink.slice(1, 3), 16), g = parseInt(h.ink.slice(3, 5), 16), b = parseInt(h.ink.slice(5, 7), 16);
    assert.ok(b >= r - 20, `${h.id} reads warm (r=${r} b=${b}); the world is cool-neutral`);
  }
});

test("every hue is readable in the places it is used", () => {
  for (const h of HUES) {
    assert.ok(ratio(h.ink, h.wash) >= 4.5, `${h.id}: ink on wash is ${ratio(h.ink, h.wash).toFixed(2)}:1`);
    assert.ok(ratio("#ffffff", h.tile) >= 4.5, `${h.id}: white glyph on the tile is ${ratio("#ffffff", h.tile).toFixed(2)}:1`);
    assert.ok(ratio(h.ink, "#ffffff") >= 4.5, `${h.id}: ink as a label on paper`);
  }
});

test("assignment is deterministic and spread across the palette", () => {
  const a: Hue = hueFor("agent-1");
  assert.equal(hueFor("agent-1").id, a.id, "same key, same hue, every render");
  const used = new Set<string>();
  for (let i = 0; i < 600; i++) used.add(hueFor(`3f2b6c1e-0000-4a1b-9c3d-${String(i).padStart(4, "0")}`).id);
  assert.equal(used.size, HUES.length, "a real roster should exercise every hue");
});

test("a missing key still gets an identity, not a crash", () => {
  assert.equal(hueFor(undefined).id, HUES[0].id);
  assert.equal(hueFor("").id, HUES[0].id);
});

test("hueVars emits the custom properties the stylesheet reads", () => {
  assert.deepEqual(Object.keys(hueVars(HUES[0])).sort(), ["--h-ink", "--h-line", "--h-tile", "--h-wash"]);
  assert.equal(hueVars(HUES[0])["--h-ink"], HUES[0].ink);
});
