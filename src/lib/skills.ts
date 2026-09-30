/**
 * Skills: named instruction packs an agent can be given.
 *
 * A skill here is exactly what it can honestly be in this build — text that joins the system prompt.
 * It is not a tool, and it never pretends to be one: the tools registry decides what can run, and a
 * skill only changes how the model writes. That distinction is the whole design of this file, so the
 * unavailable entries stay listed with a reason instead of becoming checkboxes that do nothing.
 */

export type SkillKind = "style" | "output" | "reasoning";

export type SkillSpec = {
  id: string;
  label: string;
  kind: SkillKind;
  description: string;
  /** The exact text appended to the system prompt. Empty for a skill that cannot run. */
  prompt: string;
  available: boolean;
  whyUnavailable?: string;
};

export const SKILL_REGISTRY: SkillSpec[] = [
  {
    id: "code-fenced", label: "Fence every snippet", kind: "output", available: true,
    description: "Code, commands and paths go in labelled blocks, never in a running paragraph.",
    prompt: "Put every code sample, command, and configuration snippet in its own fenced block with a language tag. Never paste multi-line code into a running paragraph.",
  },
  {
    id: "answer-brief", label: "Answer first", kind: "style", available: true,
    description: "Lead with the answer; explanation follows only as far as it earns its place.",
    prompt: "Lead with the direct answer in one or two sentences before any explanation. Cut preamble, restatements of the question, and closing summaries.",
  },
  {
    id: "evidence-cited", label: "Quote the figure", kind: "output", available: true,
    description: "Any number or row you report is shown in the sentence that uses it.",
    prompt: "When you state a number, a date, or a row from this workspace, quote the exact figure you used in the same sentence. If you cannot point at where a figure came from, say that you do not know it.",
  },
  {
    id: "plain-language", label: "Plain language", kind: "style", available: true,
    description: "Every technical term is defined where it first appears.",
    prompt: "Write in everyday words. Define each technical term the first time it appears, in the same sentence, without breaking the flow.",
  },
  {
    id: "plan-before-acting", label: "Plan before answering", kind: "reasoning", available: true,
    description: "Multi-step tasks open with a short numbered plan, then the result.",
    prompt: "For any task with more than one step, open with a short numbered plan of what you intend to do, then give the result. Do not stop to ask permission to continue.",
  },
  {
    id: "uncertainty-flagged", label: "Flag what is guessed", kind: "reasoning", available: true,
    description: "Inference is labelled as inference; unknowns stay unknown.",
    prompt: "Mark anything you are inferring rather than reading directly, with 'likely' or 'I could not verify'. Never present a guess as a fact.",
  },
  {
    id: "web-research", label: "Web research", kind: "output", available: false,
    description: "Gather sources from the open web before answering.",
    prompt: "",
    whyUnavailable: "No browser, fetch, or search tool is wired in this deployment, so a research skill would have nothing to read.",
  },
  {
    id: "long-memory", label: "Durable memory", kind: "reasoning", available: false,
    description: "Carry notes and preferences across threads.",
    prompt: "",
    whyUnavailable: "There is no per-agent memory store. Only the messages in this thread persist.",
  },
  {
    id: "skill-import", label: "Import a skill file", kind: "style", available: false,
    description: "Load instructions from a file you upload.",
    prompt: "",
    whyUnavailable: "Skills are reviewed text in this build. There is no upload path, so arbitrary instructions cannot enter the system prompt.",
  },
  {
    id: "tool-authoring", label: "Author a tool", kind: "output", available: false,
    description: "Let the agent define new capabilities for itself.",
    prompt: "",
    whyUnavailable: "The tool registry in src/lib/tools.ts is the only source of what can run. An agent cannot widen its own reach.",
  },
];

export const LIVE_SKILL_IDS = SKILL_REGISTRY.filter(s => s.available).map(s => s.id);

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Narrowing only: an unknown or unrunnable name contributes nothing, and the list cannot grow past the registry. */
export function normaliseSkills(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const granted = new Set(raw.map(str).filter(Boolean));
  return LIVE_SKILL_IDS.filter(id => granted.has(id));
}

export function resolveSkills(granted: unknown): SkillSpec[] {
  const ids = new Set(normaliseSkills(granted));
  return SKILL_REGISTRY.filter(s => ids.has(s.id));
}

/** The block appended to the system prompt, or "" when the agent holds no skills. */
export function skillPrompt(granted: unknown): string {
  const specs = resolveSkills(granted);
  if (!specs.length) return "";
  const NL = String.fromCharCode(10);
  return `Working style granted to this agent. These change how you write, not what you can do:${NL}${specs.map(s => `- ${s.prompt}`).join(NL)}`;
}
