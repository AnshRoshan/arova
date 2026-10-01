import { test } from "node:test";
import assert from "node:assert/strict";
import { HUES, hueFor, hueVars, type Hue } from "./identity.ts";

/*
 * The graphite world. These assertions exist because a hue that read fine on paper does not
 * read on a dark ground, and because a six-hue identity palette is arithmetically impossible
 * once one azure owns interaction and green/amber/red own state. See D-14.
 */
const SURFACES = { sheet: "#1e2023", card: "#24262a", raised: "#2b2e33", panel: "#191a1d" };
const ACCENT = "#7ba6ef";
const STATES = { ran: "#5fce9b", waiting: "#e8b25c", fault: "#f48cab" };

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const hueAngle = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return null;
  const h = max === r ? (((g - b) / d) % 6) * 60 : max === g ? (((b - r) / d) + 2) * 60 : (((r - g) / d) + 4) * 60;
  return (h + 360) % 360;
};
/** Angular distance on the wheel; two marks closer than this are the same mark to a reader. */
const separation = (a: string, b: string) => {
  const x = hueAngle(a), y = hueAngle(b);
  if (x === null || y === null) return 999;
  const d = Math.abs(x - y) % 360;
  return Math.min(d, 360 - d);
};

test("the palette is three fully-specified hues, glyph-first", () => {
  assert.equal(HUES.length, 3, "cool-only dark ground has room for three identity tints, not six");
  assert.equal(new Set(HUES.map(h => h.id)).size, HUES.length);
  for (const h of HUES) {
    for (const field of ["ink", "tile", "glyph", "wash", "line"] as const) {
      assert.match(String(h[field]), /^#[0-9a-f]{6}$/, `${h.id}.${field} must be a hex colour`);
    }
  }
});

test("every tint is legible as a label on every surface it lands on", () => {
  for (const h of HUES) {
    for (const [name, bg] of Object.entries(SURFACES)) {
      assert.ok(ratio(h.ink, bg) >= 4.5, `${h.id}.ink on ${name} is ${ratio(h.ink, bg).toFixed(2)}:1`);
    }
  }
});

test("the glyph on a filled tile is legible, and the tile is not white-on-hue", () => {
  for (const h of HUES) {
    assert.ok(ratio(h.glyph, h.tile) >= 4.5, `${h.id}: glyph on tile ${ratio(h.glyph, h.tile).toFixed(2)}:1`);
    // a light tint cannot carry white text; the world must not start doing that
    assert.ok(ratio("#ffffff", h.tile) < 3, `${h.id}: tile is too light to ever be given a white glyph`);
  }
});

test("tints sit far from the accent and from every state semantic", () => {
  for (const h of HUES) {
    assert.ok(separation(h.ink, ACCENT) >= 30, `${h.id} is ${separation(h.ink, ACCENT).toFixed(0)}° from the accent; interaction and identity would blur`);
    for (const [state, colour] of Object.entries(STATES)) {
      assert.ok(separation(h.ink, colour) >= 30, `${h.id} is ${separation(h.ink, colour).toFixed(0)}° from "${state}"`);
    }
  }
});

test("the tints are distinguishable from each other", () => {
  for (let i = 0; i < HUES.length; i++) for (let j = i + 1; j < HUES.length; j++) {
    const s = separation(HUES[i].ink, HUES[j].ink);
    assert.ok(s >= 30, `${HUES[i].id} vs ${HUES[j].id} is only ${s.toFixed(0)}° apart`);
  }
});

test("the tints stay cool-neutral: no warm drift, no borrowed state colour", () => {
  const exact = Object.values(STATES);
  for (const h of HUES) {
    assert.ok(!exact.includes(h.ink), `${h.id} collides with a state semantic`);
    const r = parseInt(h.ink.slice(1, 3), 16), g = parseInt(h.ink.slice(3, 5), 16), b = parseInt(h.ink.slice(5, 7), 16);
    assert.ok(!(r > b + 40 && r > g + 40), `${h.id} reads warm; the world is graphite`);
  }
});

test("assignment is deterministic and exercises the whole palette", () => {
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
  assert.deepEqual(Object.keys(hueVars(HUES[0])).sort(), ["--h-glyph", "--h-ink", "--h-line", "--h-tile", "--h-wash"]);
  assert.equal(hueVars(HUES[0])["--h-ink"], HUES[0].ink);
});
