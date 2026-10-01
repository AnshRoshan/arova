/**
 * Agent identity colour, tuned for the graphite world.
 *
 * A roster rendered in one colour is a list nobody can scan, so each agent carries a tint of its
 * own. On a light ground six cool tints read as distinct; on graphite they do not — reserving one
 * azure for interaction and green/amber/red for state leaves room for three, and a fourth starts
 * colliding. So identity here is led by the avatar glyph and the tile, with the tint as a
 * secondary marker. `identity.test.ts` asserts the separation and contrast arithmetic; widening
 * this list without changing the accent or the semantics will fail.
 *
 * The tint is never used for status: `ran`, `waiting` and `fault` belong to the state semantics
 * and nowhere else.
 */

export type Hue = { id: string; ink: string; tile: string; glyph: string; wash: string; line: string };

export const HUES: Hue[] = [
  { id: "sage", ink: "#a8d98a", tile: "#a8d98a", glyph: "#2c372a", wash: "#353d36", line: "#4c5c47" },
  { id: "aqua", ink: "#70d2db", tile: "#70d2db", glyph: "#21363a", wash: "#2e3c41", line: "#3b5a5f" },
  { id: "mauve", ink: "#c4a3dd", tile: "#c4a3dd", glyph: "#322d3b", wash: "#393641", line: "#544c60" },
];

/** FNV-1a: stable across processes and renders, so an agent keeps its colour between sessions. */
export function hueFor(key: string | null | undefined): Hue {
  if (!key) return HUES[0];
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return HUES[hash % HUES.length];
}

/** Applied as inline custom properties so one stylesheet rule serves every agent. */
export function hueVars(hue: Hue): Record<string, string> {
  return { "--h-ink": hue.ink, "--h-tile": hue.tile, "--h-glyph": hue.glyph, "--h-wash": hue.wash, "--h-line": hue.line };
}
