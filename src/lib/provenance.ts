/**
 * The standing provenance sentence, shaped by OpenBot's platform-wide rule: it is appended by the
 * deployment AFTER a seat's instructions and its skills, so it cannot be argued away by seat text
 * and cannot be forgotten by the next seat somebody creates. Editing a seat changes its voice;
 * this line is the workspace, not the voice.
 */

export const PROVENANCE_LINE =
  "Provenance rule: when something you say rests on this workspace's record — a post, a note, a stored run — name where it came from. When you answer from your own general knowledge instead, say so plainly. Never present your own knowledge as if it came from the record.";

/** Idempotent and last: whatever the prompt is, the standing line rides at its end, exactly once. */
export function withProvenance(prompt: string): string {
  if (prompt.includes(PROVENANCE_LINE)) return prompt;
  return prompt ? `${prompt}\n${PROVENANCE_LINE}` : PROVENANCE_LINE;
}
