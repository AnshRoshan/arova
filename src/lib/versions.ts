/** Pure version decisions, kept apart from the database so node --test can exercise them. */

export type AgentSnapshot = { instructions: string; capabilities: Record<string, unknown> | null; provider: string };

export function nextVersion(currentMax: number): number {
  return Math.max(0, Math.floor(Number(currentMax) || 0)) + 1;
}

function canonical(capabilities: Record<string, unknown> | null): string {
  if (!capabilities) return "{}";
  return JSON.stringify(Object.fromEntries(Object.keys(capabilities).sort().map(key => [key, capabilities[key]])));
}

export function sameSnapshot(a: AgentSnapshot, b: AgentSnapshot): boolean {
  return a.instructions === b.instructions && a.provider === b.provider && canonical(a.capabilities) === canonical(b.capabilities);
}

/** A new version is written only when the live seat actually differs from the last one recorded. */
export function needsVersion(latest: AgentSnapshot | null, current: AgentSnapshot): boolean {
  return !latest || !sameSnapshot(latest, current);
}
