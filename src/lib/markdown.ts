/**
 * The model's markdown, parsed to data.
 *
 * Replies arrive with fenced code, inline identifiers, headings and links, and the renderer that
 * only knew about bold and lists printed the rest as literal backticks. Parsing is kept here, pure
 * and tested, so the React side only ever maps known node types — model output never becomes markup.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "em"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "paragraph"; inline: Inline[] }
  | { kind: "heading"; level: 2 | 3; inline: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "code"; lang: string | null; text: string }
  | { kind: "quote"; inline: Inline[] }
  | { kind: "rule" };

/** Some compatible endpoints stream their reasoning into the answer channel itself.
 * Show it, folded and labelled — never delete model output, and never let it bury the reply. A
 * closed block is found anywhere in the text, not only at the front: a channel report opens with
 * its own header line, so the reasoning sits in the middle of the stored row. */
const THINK = /\s*<\/?think>([\s\S]*?)<\/think>\s*/gi;
const THINK_OPEN = /^\s*<think>([\s\S]*)$/;

export type SplitReply = { reasoning: string | null; answer: string; rest: string };

export function splitReasoning(text: string): SplitReply {
  const blocks = [...text.matchAll(THINK)];
  if (blocks.length) {
    // Every block is kept and labelled; only the tags come out of what the reader is shown as the answer.
    const NL2 = String.fromCharCode(10, 10);
    const rest = text.replace(THINK, NL2).trim();
    return { reasoning: blocks.map(b => b[1].trim()).filter(Boolean).join(NL2), answer: rest, rest };
  }
  const open = text.match(THINK_OPEN);
  if (open) return { reasoning: open[1].trim(), answer: "", rest: text };
  return { reasoning: null, answer: text, rest: text };
}

/** Only web schemes are ever made clickable. Everything else stays visible as plain text. */
export function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw, "https://invalid.local");
    if (!/^https?:$/.test(url.protocol) || url.origin === "https://invalid.local") return null;
    return raw;
  } catch {
    return null;
  }
}

const FENCE = /^\s*```([\w+-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const LINK = /\[([^\]]+)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
const EMPHASIS = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|__([^_\n]+)__|_([^_\n]+)_/g;
const CODE = /`([^`\n]+)`/g;

function flushText(out: Inline[], text: string) {
  if (text) out.push({ kind: "text", text });
}

function parseEmphasis(src: string, out: Inline[]) {
  EMPHASIS.lastIndex = 0;
  let last = 0;
  for (let m = EMPHASIS.exec(src); m; m = EMPHASIS.exec(src)) {
    flushText(out, src.slice(last, m.index));
    if (m[1] || m[3]) out.push({ kind: "strong", text: (m[1] ?? m[3]) as string });
    else out.push({ kind: "em", text: (m[2] ?? m[4]) as string });
    last = m.index + m[0].length;
  }
  flushText(out, src.slice(last));
}

function parseLinks(src: string, out: Inline[]) {
  LINK.lastIndex = 0;
  let last = 0;
  for (let m = LINK.exec(src); m; m = LINK.exec(src)) {
    parseEmphasis(src.slice(last, m.index), out);
    const href = safeHref(m[2].trim());
    if (href) out.push({ kind: "link", text: m[1], href });
    else out.push({ kind: "text", text: m[0] });
    last = m.index + m[0].length;
  }
  parseEmphasis(src.slice(last), out);
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  CODE.lastIndex = 0;
  let last = 0;
  for (let m = CODE.exec(src); m; m = CODE.exec(src)) {
    parseLinks(src.slice(last, m.index), out);
    out.push({ kind: "code", text: m[1] });
    last = m.index + m[0].length;
  }
  parseLinks(src.slice(last), out);
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;
  let quote: string[] = [];
  const closeParagraph = () => { if (paragraph.length) { blocks.push({ kind: "paragraph", inline: parseInline(paragraph.join("\n")) }); paragraph = []; } };
  const closeList = () => { if (list) { blocks.push({ kind: "list", ordered: list.ordered, items: list.items }); list = null; } };
  const closeQuote = () => { if (quote.length) { blocks.push({ kind: "quote", inline: parseInline(quote.join("\n")) }); quote = []; } };
  const closeAll = () => { closeParagraph(); closeList(); closeQuote(); };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    const fence = FENCE.exec(raw);
    if (fence) {
      closeAll();
      const body: string[] = [];
      let closed = false;
      for (let j = i + 1; j < lines.length; j++) {
        if (FENCE.test(lines[j])) { i = j; closed = true; break; }
        body.push(lines[j]);
      }
      // A stream cut mid-block leaves the fence open: keep the text as code rather than
      // letting half a snippet render as instructions.
      if (!closed) i = lines.length;
      blocks.push({ kind: "code", lang: fence[1] || null, text: body.join("\n") });
      continue;
    }

    if (!raw.trim()) { closeAll(); continue; }

    const heading = HEADING.exec(raw);
    if (heading) {
      closeAll();
      blocks.push({ kind: "heading", level: Math.min(3, Math.max(2, heading[1].length)) as 2 | 3, inline: parseInline(heading[2].trim()) });
      continue;
    }

    if (RULE.test(raw)) { closeAll(); blocks.push({ kind: "rule" }); continue; }

    const quoted = QUOTE.exec(raw);
    if (quoted) {
      closeParagraph(); closeList();
      quote.push(quoted[1]);
      continue;
    }

    const bullet = BULLET.exec(raw);
    const number = bullet ? null : NUMBER.exec(raw);
    if (bullet || number) {
      closeParagraph(); closeQuote();
      const ordered = Boolean(number);
      if (!list || list.ordered !== ordered) closeList();
      list = list ?? { ordered, items: [] };
      list.items.push(parseInline((number ?? bullet)![1].trim()));
      continue;
    }

    closeList(); closeQuote();
    // Leading space is kept: it is how an unfenced snippet stays readable.
    paragraph.push(raw.replace(/\s+$/, ""));
  }

  closeAll();
  return blocks;
}
