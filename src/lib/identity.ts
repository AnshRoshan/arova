/**
 * Agent identity colour.
 *
 * A roster of five agents rendered in one azure is a list nobody can scan, so each agent carries a
 * hue of its own through the index, the thread and the margin. The set is deliberately cool and
 * low-chroma to sit inside the notebook world, and it is never used for status: `ran`, `waiting`
 * and `fault` belong to the state semantics and nowhere else.
 */

export type Hue = { id: string; ink: string; tile: string; wash: string; line: string };

export const HUES: Hue[] = [
  { id: "azure", ink: "#1d5dd0", tile: "#1d5dd0", wash: "#e8f0fd", line: "#c6daf9" },
  { id: "teal", ink: "#0d6a68", tile: "#0d7171", wash: "#e3f1f0", line: "#bfe0de" },
  { id: "indigo", ink: "#3a44a4", tile: "#3a44a4", wash: "#eaeaf9", line: "#caceee" },
  { id: "cyan", ink: "#0a66a3", tile: "#0a6ba8", wash: "#e2f0f9", line: "#bedcf0" },
  { id: "navy", ink: "#16386e", tile: "#16386e", wash: "#e6ecf6", line: "#c3cfe4" },
  { id: "steel", ink: "#3f4a58", tile: "#55606e", wash: "#edeff2", line: "#d3d9e1" },
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
  return { "--h-ink": hue.ink, "--h-tile": hue.tile, "--h-wash": hue.wash, "--h-line": hue.line };
}
