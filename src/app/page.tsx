"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, Bot, CalendarDays, Check, CircleHelp, Compass, Copy,
  Globe2, Menu, Network, Pause, Play, Plus, RotateCcw, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Square, Sun,
  Trash2, User, Users, WandSparkles, X, Zap, ListChecks, type LucideIcon,
} from "lucide-react";
import { TOOL_REGISTRY, mcpSummary, resolveTools, tokenBudgetFor, type Capabilities as ToolCaps } from "@/lib/tools";
import { SKILL_REGISTRY, resolveSkills } from "@/lib/skills";
import { parseMarkdown, splitReasoning, type Block, type Inline as MdInline } from "@/lib/markdown";
import { hueFor, hueVars } from "@/lib/identity";
import { describeSchedule } from "@/lib/scheduler";
import { orgTree, type OrgNode } from "@/lib/org";

type Agent = { id: string; name: string; role: string; instructions: string; avatar: string; status: string; provider: string; teamId: string | null; managerId: string | null; capabilities: Capabilities };
type Message = { id: string; agentId: string; role: string; content: string; kind: string; metadata: Record<string, unknown>; createdAt: string };
type Routine = { id: string; agentId: string; name: string; description: string; schedule: string; timezone: string; enabled: boolean; lastRunAt: string | null; nextRunAt: string | null; lastStatus: string | null };
type Run = { id: string; agentId: string; routineId: string | null; title: string; status: string; summary: string; startedAt: string; completedAt: string | null };
type Step = { id: string; runId: string; title: string; detail: string; createdAt: string };
type Approval = { id: string; agentId: string; title: string; detail: string; status: string; createdAt: string };
type Profile = { name: string; label: string; model: string; configured: boolean; builtIn: boolean; maxContextTokens: number };
type Usage = { provider: string; calls: number; inputTokens: number; outputTokens: number; estimated: boolean };
type Capabilities = {
  tools: string[]; deniedTools: string[]; permissionMode: "default" | "plan" | "auto";
  canConsult: string[]; canHandoffTo: string[]; effort: "low" | "medium" | "high";
  maxTurns: number | null; modelParams: { temperature?: number; maxTokens?: number };
  mcpServers: { name: string; transport: string }[]; mcpInheritance: unknown; skills: string[];
};
type Team = { id: string; name: string; brief: string; createdAt: string };
type Seat = { name: string; role: string; instructions: string; reportsTo: string | null };
type Delegation = { id: string; messageId: string | null; fromAgentId: string; toAgentId: string; question: string; answer: string; model: string; inputTokens: number; outputTokens: number; createdAt: string };
type BoardEvent = { id: string; agentId: string | null; type: string; detail: string; createdAt: string };
type Board = {
  workspace: { id: string; name: string; timezone: string };
  agents: Agent[]; messages: Message[]; routines: Routine[]; runs: Run[]; steps: Step[]; approvals: Approval[];
  connections: { agentId: string; slug: string }[]; events: BoardEvent[];
  sandboxProvider: string; modelConfigured: boolean; profiles: Profile[];
  teams: Team[]; delegations: Delegation[];
  limits: { dailyModelCalls: number; usage: Usage[]; maxDelegations: number };
};
type Pane = "scheduler" | "tools" | "settings";
type Tone = "ran" | "waiting" | "fault" | "idle";

const faces: Record<string, LucideIcon> = { sparkles: Sparkles, globe: Globe2, palette: WandSparkles, sun: Sun, bot: Bot, zap: Zap };
const toolCatalog = [
  { name: "Gmail", slug: "gmail", category: "Communication", description: "Read, draft, and organise your inbox." },
  { name: "Slack", slug: "slack", category: "Communication", description: "Keep channels in sync." },
  { name: "GitHub", slug: "github", category: "Developer", description: "Track repositories, issues and pull requests." },
  { name: "Google Calendar", slug: "calendar", category: "Productivity", description: "Hold meetings and deadlines in order." },
  { name: "Notion", slug: "notion", category: "Productivity", description: "Turn pages into working context." },
  { name: "Browser", slug: "browser", category: "Browser", description: "Work a site inside an isolated session." },
];
const zones = ["America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney", "UTC"];

const clock = (s: string) => new Date(s).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const stamp = (s: string) => `${new Date(s).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" })} ${new Date(s).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
const dayLabel = (s: string) => new Date(s).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
const ago = (s: string) => { const ms = Date.now() - new Date(s).getTime(); if (ms < 6e4) return "now"; if (ms < 36e5) return `${Math.floor(ms / 6e4)}m`; if (ms < 864e5) return `${Math.floor(ms / 36e5)}h`; return `${Math.floor(ms / 864e5)}d`; };
const agoTo = (s: string) => { const ms = new Date(s).getTime() - Date.now(); if (ms < 6e4) return "1m"; if (ms < 36e5) return `${Math.floor(ms / 6e4)}m`; if (ms < 864e5) return `${Math.floor(ms / 36e5)}h`; return `${Math.floor(ms / 864e5)}d`; };
/** The server's own budgeting rule, so the figure on screen means the same thing as the one in the code. */
const est = (s: string) => Math.ceil(s.length / 4);

/** Reformat an ISO instant embedded in stored prose; the words around it are untouched. */
const humanStamps = (text: string) => text.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, m => { const d = new Date(m); return Number.isNaN(d.getTime()) ? m : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`; });

const toneOf = (status: string, sample = false) => (sample ? "idle" : status === "COMPLETED" || status === "APPROVED" ? "ran" : ["FAILED", "CANCELLED", "TIMED_OUT", "REJECTED"].includes(status) ? "fault" : ["WAITING_FOR_TOOL", "QUEUED", "RUNNING", "PENDING"].includes(status) ? "waiting" : "idle");
/** Seeded rows describe a run that never happened; they must never wear the green of a real one. */
const isSample = (run: Run) => run.summary.startsWith("Sample run:");
const State = ({ status, sample = false }: { status: string; sample?: boolean }) => <span className={`chip ${toneOf(status, sample)}`}><i />{sample ? "sample" : status.replaceAll("_", " ").toLowerCase()}</span>;
/** Reasoning that arrived in the answer channel: folded and labelled, never deleted. A reply that
 * was nothing but reasoning must not render as an empty row — the fold opens and says so. */
const ReasoningFold = ({ text, model, streaming = false, truncated = false }: { text: string; model?: string; streaming?: boolean; truncated?: boolean }) => {
  const r = splitReasoning(text);
  if (!r.reasoning) return null;
  const only = !r.answer && !streaming;
  const label = streaming ? "reasoning · still writing" : only && truncated ? "reasoning filled the output budget · no answer followed" : only ? "reasoning only · no answer followed" : "reasoning";
  return <details className={`reasoning ${only ? "only" : ""}`} open={only}>
    <summary>{label} · verbatim from {model ?? "the model"}</summary>
    <div className="reasoning-body">{r.reasoning}</div>
  </details>;
};
const FaceIcon = ({ agent, size = 15 }: { agent: Pick<Agent, "avatar">; size?: number }) => { const F = faces[agent.avatar] ?? Sparkles; return <F size={size} strokeWidth={1.9} />; };

/** A proposed chart inside a card: rows, not openable seats — the seats do not exist yet. */
function OrgBranch({ node, depth, onPick, current }: { node: OrgNode; depth: number; onPick?: (name: string) => void; current?: string }) {
  return <>
    <button type="button" className={`org-row ${current === node.name ? "on" : ""}`} style={{ paddingLeft: 10 + depth * 15 }} disabled={!onPick} onClick={() => onPick?.(node.name)}>
      <span className="org-tick" data-depth={depth} />
      <b>{node.name}</b>
      <span className="org-role">{node.role ?? ""}</span>
      {node.descendants > 0 && <span className="org-count">{node.descendants}</span>}
    </button>
    {node.children.map(c => <OrgBranch key={c.name} node={c} depth={depth + 1} onPick={onPick} current={current} />)}
  </>;
}

function MdInlineNodes({ nodes }: { nodes: MdInline[] }) {
  return <>{nodes.map((n, i) => n.kind === "code" ? <code className="inline-code" key={i}>{n.text}</code>
    : n.kind === "strong" ? <strong key={i}>{n.text}</strong>
    : n.kind === "em" ? <em key={i}>{n.text}</em>
    : n.kind === "link" ? <a key={i} href={n.href} target="_blank" rel="noreferrer noopener">{n.text}</a>
    : <span key={i}>{n.text}</span>)}</>;
}

function CodeBlock({ block }: { block: Extract<Block, { kind: "code" }> }) {
  return <div className="code">
    <div className="code-bar"><span className="code-lang">{block.lang ?? "code"}</span><CopyBtn text={block.text} label="Copy" /></div>
    <pre><code>{block.text}</code></pre>
  </div>;
}

/**
 * Model output through `parseMarkdown` into React nodes. Never `dangerouslySetInnerHTML`:
 * a reply can contain anything, and only these known node types may become elements.
 */
function RichText({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <div className="rich">{blocks.map((b, i) => {
    switch (b.kind) {
      case "code": return <CodeBlock block={b} key={i} />;
      case "rule": return <hr className="md-rule" key={i} />;
      case "heading": return b.level === 2 ? <h3 className="md-h2" key={i}><MdInlineNodes nodes={b.inline} /></h3> : <h4 className="md-h3" key={i}><MdInlineNodes nodes={b.inline} /></h4>;
      case "quote": return <blockquote className="md-quote" key={i}><MdInlineNodes nodes={b.inline} /></blockquote>;
      case "list": return b.ordered
        ? <ol className="md-list" key={i}>{b.items.map((it, j) => <li key={j}><MdInlineNodes nodes={it} /></li>)}</ol>
        : <ul className="md-list" key={i}>{b.items.map((it, j) => <li key={j}><MdInlineNodes nodes={it} /></li>)}</ul>;
      default: return <p className="md-p" key={i}><MdInlineNodes nodes={b.inline} /></p>;
    }
  })}</div>;
}

/** One seat on the board — the organisation tree and the unaffiliated list render through this.
 * The dot answers "what is this seat doing" from stored rows; the time is the last stored message. */
function SeatNode({ selected, agent, secondary, dot, count, lastAt, indent = 0, onSelect }: {
  selected: boolean; agent: Pick<Agent, "id" | "name" | "avatar" | "status">; secondary: string; dot: Tone; count: number; lastAt?: string; indent?: number; onSelect?: () => void;
}) {
  const body = <>
    <span className="node-tile"><FaceIcon agent={agent} /></span>
    <span className="node-body">
      <span className="node-line">
        <i className={`dot ${dot}`} title={`${dot === "ran" ? "a run is executing" : dot === "waiting" ? "waiting: blocked on a tool, your decision, or a due schedule" : dot === "fault" ? "its last run faulted" : "idle"}`} />
        <strong>{agent.name}</strong>
        {agent.status !== "ACTIVE" && <span className="node-pause">paused</span>}
        <span className="node-count">{count}</span>
        <time>{lastAt ? ago(lastAt) : ""}</time>
      </span>
      <span className="node-sub">{secondary}</span>
    </span>
  </>;
  const style = { ...hueVars(hueFor(agent.id)), "--depth": indent } as CSSProperties;
  return onSelect
    ? <button type="button" className={`node ${selected ? "on" : ""}`} style={style} onClick={onSelect}>{body}</button>
    : <div className={`node ${selected ? "on" : ""}`} style={style}>{body}</div>;
}

/** Copies what is on screen. No claim, no network call, no invented "saved" state. */
function CopyBtn({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(false), 1800); return () => clearTimeout(t); }, [done]);
  return <button type="button" className="copy-btn" onClick={async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); } catch { setDone(false); }
  }} aria-label={label}><Check size={12} style={{ opacity: done ? 1 : 0 }} />{done ? "copied" : <><Copy size={12} />{label}</>}</button>;
}

export default function Workbench() {
  const [data, setData] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [rail, setRail] = useState(false);
  const [activity, setActivity] = useState(false);
  const [draft, setDraft] = useState("");
  const [stream, setStream] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [consulting, setConsulting] = useState<{ from: string; to: string; question: string } | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [dialog, setDialog] = useState<null | "agent" | "routine" | Run>(null);
  const [askDelete, setAskDelete] = useState<{ kind: "routine" | "agent"; id: string; name: string } | null>(null);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [agentForm, setAgentForm] = useState({ name: "", role: "", instructions: "", provider: "auto" });
  const [routineForm, setRoutineForm] = useState({ name: "", description: "", schedule: "Every day at 8:00 AM", agentId: "" });
  const endRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/board", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j);
    } catch (e) { setToast(e instanceof Error ? e.message : "Could not load your workspace"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  /** A scheduled run finishes after the page loaded, so keep looking while anything is RUNNING. */
  const executing = !!data && (data.runs.some(r => r.status === "RUNNING") || data.routines.some(r => r.lastStatus === "RUNNING"));
  useEffect(() => { if (!executing) return; const t = setInterval(() => { void load(); }, 5000); return () => clearInterval(t); }, [executing, load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5200); return () => clearTimeout(t); }, [toast]);
  /** Follow the reply only while the reader is at the bottom; scrolling up is a request to be left alone.
   * The container is pinned directly — scrollIntoView can climb to the document scroller and miss. */
  useEffect(() => { if (atBottom) { const b = bodyRef.current; if (b) b.scrollTop = b.scrollHeight; } }, [data?.messages.length, stream, agentId, pane, atBottom]);
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const onScroll = () => setAtBottom(body.scrollHeight - body.scrollTop - body.clientHeight < 180);
    onScroll();
    body.addEventListener("scroll", onScroll, { passive: true });
    return () => body.removeEventListener("scroll", onScroll);
  }, [data, pane, agentId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(String((e.target as HTMLElement | null)?.tagName));
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); searchRef.current?.focus(); setPane(null); }
      if (e.key === "Escape" && typing) (e.target as HTMLElement).blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** A daily driver opens where you left off, not on an overview. */
  useEffect(() => {
    if (!data?.agents.length || agentId) return;
    const saved = localStorage.getItem("arova.lastAgent");
    const touched = [...data.messages].reverse().find(m => data.agents.some(a => a.id === m.agentId))?.agentId;
    setAgentId(data.agents.find(a => a.id === saved)?.id ?? data.agents.find(a => a.id === touched)?.id ?? data.agents[0].id);
  }, [data, agentId]);
  useEffect(() => { if (agentId) localStorage.setItem("arova.lastAgent", agentId); }, [agentId]);

  async function act(action: string, payload: Record<string, unknown> = {}, say?: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/board", { method: "POST", headers: { "Content-Type": "application/json", ...(action === "runRoutine" ? { "Idempotency-Key": crypto.randomUUID() } : {}) }, body: JSON.stringify({ action, ...payload }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Something went wrong");
      setData(j.board);
      if (say) setToast(say);
      return j;
    } catch (e) { setToast(e instanceof Error ? e.message : "Something went wrong"); return null; }
    finally { setBusy(false); }
  }

  /** The server writes the partial when it sees the reader go away, which is a moment after we
   * abort — so poll for the row instead of showing a reply that is not stored yet. */
  async function awaitAssistantRow(targetId: string, before: number, tries = 10): Promise<Board | null> {
    for (let i = 0; i < tries; i++) {
      await new Promise(r => setTimeout(r, 300));
      const r = await fetch("/api/board", { cache: "no-store" }).catch(() => null);
      if (!r?.ok) continue;
      const j = (await r.json()) as Board;
      if (j.messages.filter(m => m.agentId === targetId && m.role === "assistant").length > before) return j;
    }
    return null;
  }

  async function send(content: string): Promise<boolean> {
    if (!agent) return false;
    const controller = new AbortController();
    abortRef.current = controller;
    const answeredBefore = thread.filter(m => m.role === "assistant").length;
    setBusy(true); setPending(content); setStream("");
    try {
      const r = await fetch("/api/board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sendMessage", agentId: agent.id, content, stream: true }), signal: controller.signal });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Something went wrong");
      if (!(r.headers.get("content-type") || "").includes("text/event-stream")) { setData((await r.json()).board); return true; }
      const reader = r.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "", answer = "", finalBoard: Board | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find(l => l.startsWith("data: "));
          if (!line) continue;
          let ev: { type: string; text?: string; board?: Board; error?: string };
          try { ev = JSON.parse(line.slice(6)); } catch { continue; }
          if (ev.type === "delta") { answer += ev.text ?? ""; setStream(answer); }
          else if (ev.type === "consult") setConsulting({ from: String((ev as { from?: string }).from), to: String((ev as { to?: string }).to), question: String((ev as { question?: string }).question) });
          else if (ev.type === "end") finalBoard = ev.board ?? null;
          else if (ev.type === "error") setToast(ev.error || "The reply could not be completed");
        }
      }
      if (!finalBoard) throw new Error("The connection dropped before the reply finished. Your message was saved.");
      setData(finalBoard);
      return true;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        const board = await awaitAssistantRow(agent.id, answeredBefore);
        if (board) setData(board); else void load();
        setToast(board
          ? `Stopped after ${answerChars(board, agent.id)} characters. What arrived is saved and marked partial.`
          : "Stopped. The server was still writing the partial reply — reload to see it.");
        return true;
      }
      setToast(e instanceof Error ? e.message : "Something went wrong"); return false;
    }
    finally { abortRef.current = null; setBusy(false); setPending(null); setStream(""); setConsulting(null); }
  }

  const answerChars = (board: Board, targetId: string) => {
    const last = [...board.messages].reverse().find(m => m.agentId === targetId && m.role === "assistant");
    return last ? splitReasoning(last.content).answer.length : 0;
  };

  const stop = () => abortRef.current?.abort();

  /** True once the server has stored the message being answered: the echo would be a duplicate. */
  const threadHasPending = !!pending && (data?.messages ?? []).some(m => m.role === "user" && m.content === pending);

  const agent = data?.agents.find(a => a.id === agentId) ?? data?.agents[0];
  const thread = useMemo(() => (data && agent ? data.messages.filter(m => m.agentId === agent.id) : []), [data, agent]);
  const byId = (id: string) => data?.agents.find(a => a.id === id);
  const answering = useMemo(() => {
    if (!data || !agent) return null;
    if (agent.provider === "local") return null;
    if (agent.provider === "auto") return data.profiles.find(p => p.configured) ?? null;
    return data.profiles.find(p => p.name === agent.provider) ?? null;
  }, [data, agent]);

  const pendingApprovals = data?.approvals.filter(a => a.status === "PENDING") ?? [];
  /** Only a message the gateway actually produced counts as a reply; a seeded greeting does not. */
  const lastReply = [...thread].reverse().find(m => m.role === "assistant" && m.kind !== "routine_proposal" && m.metadata?.provider);
  /** The board also returns hops that document an older reply, so a "today" label must say so. */
  const delegationsToday = (data?.delegations ?? []).filter(d => d.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10));
  const lastMessageOf = (id: string) => (data?.messages ?? []).filter(m => m.agentId === id).pop();
  const messageCountOf = (id: string) => (data?.messages ?? []).filter(m => m.agentId === id).length;
  /** One hue per agent, carried on the element via custom properties; never a status colour. */
  const hueOf = (id: string | null | undefined) => hueVars(hueFor(id ?? undefined));
  const hue = hueOf(agent?.id);
  const mcpCount = (data?.agents ?? []).reduce((n, a) => n + (a.capabilities?.mcpServers?.length ?? 0), 0);

  /* ── the workbench computes: what each seat is doing, and what the server recorded ── */
  const nowMs = Date.now();
  const dueRoutines = useMemo(() => (data?.routines ?? []).filter(r => r.enabled && r.nextRunAt && new Date(r.nextRunAt).getTime() <= nowMs), [data, nowMs]);
  const seatTone = useMemo(() => {
    const map = new Map<string, Tone>();
    if (!data) return map;
    const put = (id: string, tone: Tone) => {
      const order: Tone[] = ["fault", "waiting", "ran", "idle"];
      const cur = map.get(id);
      if (!cur || order.indexOf(tone) < order.indexOf(cur)) map.set(id, tone);
    };
    for (const r of data.runs) put(r.agentId, toneOf(r.status, isSample(r)));
    for (const a of data.approvals) if (a.status === "PENDING" && !a.detail.includes("Sample approval")) put(a.agentId, "waiting");
    for (const rt of dueRoutines) put(rt.agentId, "waiting");
    return map;
  }, [data, dueRoutines]);
  /** Teams split into the ones with real reporting lines (a chart) and families (a flat roster). */
  const teamGroups = useMemo(() => {
    if (!data) return [];
    const hasLines = new Set(data.agents.filter(a => a.teamId && a.managerId).map(a => a.teamId as string));
    return data.teams
      .map(t => ({ team: t, charted: hasLines.has(t.id), members: data.agents.filter(a => a.teamId === t.id) }))
      .filter(g => g.members.length > 0);
  }, [data]);
  const unfiled = useMemo(() => (data?.agents ?? []).filter(a => !a.teamId), [data]);
  /** The selected seat's reporting line, in words, for the identity bar. `manager_id` is the source. */
  const reportsLine = useMemo(() => {
    if (!data || !agent?.managerId) return null;
    const manager = data.agents.find(a => a.id === agent.managerId);
    if (!manager) return null;
    const chain = [manager.name];
    let cursor = manager;
    while (cursor.managerId) {
      const up = data.agents.find(a => a.id === cursor.managerId);
      if (!up) break;
      chain.push(up.name);
      cursor = up;
    }
    return `reports to ${chain.join(" · ")}`;
  }, [data, agent]);

  const openSeat = (id: string) => { setAgentId(id); setPane(null); setRail(false); setActivity(false); };

  /* Activity board rows: every one is a stored row (run, delegation, approval, event) or a live
   * SSE fact this client itself received. Nothing here is decorative. */
  const inFlight = useMemo(() => {
    const rows: { label: string; note?: string }[] = [];
    if (consulting) rows.push({ label: `${consulting.from} is asking ${consulting.to}`, note: consulting.question });
    if (busy && stream) { const r = splitReasoning(stream); rows.push({ label: `${agent?.name ?? "The agent"} is ${r.reasoning && !r.answer ? "reasoning" : "answering"}`, note: `${stream.length} chars received · saved when the reply completes` }); }
    else if (busy) rows.push({ label: `${agent?.name ?? "The agent"} is waiting on the model`, note: "the request was sent; nothing has arrived yet" });
    return rows;
  }, [consulting, busy, stream, agent?.name]);
  const waitingRows = useMemo(() => {
    if (!data) return [];
    return data.runs.filter(r => ["WAITING_FOR_TOOL", "QUEUED", "RUNNING"].includes(r.status)).map(r => ({
      run: r, tone: toneOf(r.status, isSample(r)) as Tone,
      note: r.status === "RUNNING" ? "executing now — the scheduler claimed it when this workspace was read"
        : r.status === "WAITING_FOR_TOOL" ? "there is no worker on this server, so it stays waiting"
        : "queued behind the worker",
    }));
  }, [data]);

  if (loading) return <div style={{ display: "grid", placeItems: "center", height: "100dvh" }}><span className="mark"><Sparkles size={15} /></span><p style={{ color: "var(--ink-2)", fontSize: 13, marginTop: 12 }}>Opening your workspace…</p></div>;
  if (!data) return <div className="blank" style={{ margin: 40 }}><h3>Arova could not open</h3><p>{toast ?? "The workspace did not load."}</p><button className="primary" onClick={load}>Try again</button></div>;

  const realRuns = data.runs.filter(r => !isSample(r));
  const upcoming = data.routines.filter(r => r.enabled && r.nextRunAt && new Date(r.nextRunAt).getTime() > nowMs).sort((x, y) => String(x.nextRunAt).localeCompare(String(y.nextRunAt))).slice(0, 5);
  const callsToday = data.limits.usage.reduce((n, u) => n + u.calls, 0);
  const realPending = pendingApprovals.filter(a => !a.detail.includes("Sample approval"));
  const panes: { id: Pane; label: string; icon: LucideIcon; count?: number; runs?: number; sample?: boolean }[] = [
    { id: "scheduler", label: "Scheduler", icon: CalendarDays, count: data.routines.filter(r => r.enabled).length, runs: realRuns.length || data.runs.length, sample: !realRuns.length && data.runs.length > 0 },
    { id: "tools", label: "Tools & MCP", icon: Compass, count: data.connections.length },
    { id: "settings", label: "Settings", icon: Settings2 },
  ];

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || busy || agent?.status !== "ACTIVE") return;
    setDraft("");
    if (!(await send(content))) setDraft(content);
  };

  /** One printed line of provenance for the last real reply — the evidence margin's job, done inline. */
  const provenance = (() => {
    if (!lastReply) return null;
    const r = splitReasoning(lastReply.content);
    const fault = lastReply.kind === "provider_error";
    const model = lastReply.metadata?.model ? String(lastReply.metadata.model) : null;
    const provider = data.profiles.find(p => p.name === String(lastReply.metadata?.provider))?.label ?? (model ? "unknown provider" : "this app, no model called");
    const state = fault ? "not answered" : lastReply.metadata?.stopped ? "stopped by you" : lastReply.metadata?.truncated ? "budget reached" : !r.answer ? "reasoning only" : lastReply.metadata?.incomplete ? "partial" : "complete";
    return { r, fault, model, provider, state, saved: clock(lastReply.createdAt) };
  })();

  /* The Record stream: every row is one stored run, delegation, audit event, or approval.
   * Newest first; a row is clickable only where the click opens a real record or thread. */
  type RecordRow = { id: string; label: string; note: string; tone: Tone; sample?: boolean; state?: string; time: string; open?: () => void };
  const recordRows: RecordRow[] = [];
  {
    const seatNote = (id: string | null) => (id ? `${byId(id)?.name ?? "removed seat"} · ` : "");
    for (const r of data.runs) {
      const sample = isSample(r);
      recordRows.push({ id: `r${r.id}`, label: r.title, note: `${seatNote(r.agentId)}${humanStamps(r.summary.replace(/^Sample run: /, ""))}`, tone: toneOf(r.status, sample), sample, state: r.status, time: r.startedAt, open: () => { setDialog(r); } });
    }
    for (const d of delegationsToday) {
      const asked = byId(d.fromAgentId)?.name ?? "removed seat";
      const peer = byId(d.toAgentId)?.name ?? "removed seat";
      recordRows.push({ id: `d${d.id}`, label: `${asked} asked ${peer}`, note: d.question, tone: "idle", time: d.createdAt, open: () => { openSeat(d.fromAgentId); } });
    }
    for (const e of data.events.filter(x => ["org.created", "team.created", "run.cancelled", "approval.requested", "routine.created", "agent.created"].includes(x.type))) {
      recordRows.push({ id: `e${e.id}`, label: e.type.replace(/\./g, " · ").replace(/_/g, " "), note: e.detail, tone: "idle", time: e.createdAt });
    }
    for (const a of data.approvals) {
      const sample = a.detail.includes("Sample approval");
      if (a.status === "PENDING" && !sample) continue; // already actionable under Needs attention
      recordRows.push({ id: `a${a.id}`, label: a.title, note: sample ? "seeded sample request · nothing was asked by a model" : `${seatNote(a.agentId)}your decision was recorded`, tone: sample ? "idle" : toneOf(a.status), sample, state: sample ? undefined : a.status, time: a.createdAt });
    }
    recordRows.sort((x, y) => y.time.localeCompare(x.time));
  }

  return <div className={`workbench ${activity ? "show-activity" : ""}`}>
    <aside className={`bench ${rail ? "open" : ""}`}>
      <div className="bench-top">
        <span className="mark"><Sparkles size={15} strokeWidth={2.2} /></span>
        <div className="brand"><span className="wordmark">Arova</span><span className="brand-ws">{data.workspace.name}</span></div>
        <button className="icon-btn push" title="New agent" onClick={() => { setDialog("agent"); setRail(false); }}><Plus size={16} /></button>
      </div>
      <div className="bench-search">
        <input ref={searchRef} className="search" placeholder="Find a seat" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Find a seat" />
        <kbd className="only-wide">{/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"}</kbd>
      </div>
      <div className="bench-list">
        {teamGroups.map(g => {
          const members = g.members;
          if (filter && !members.some(a => `${a.name} ${a.role}`.toLowerCase().includes(filter.toLowerCase()))) return null;
          const roots = g.charted ? orgTree(members.map(a => ({ name: a.name, role: a.role, instructions: a.role, reportsTo: data.agents.find(b => b.id === a.managerId && b.teamId === g.team.id)?.name ?? null }))) : [];
          const shown = (a: Agent) => !filter || `${a.name} ${a.role}`.toLowerCase().includes(filter.toLowerCase());
          return <div className="bench-group" key={g.team.id}>
            <div className="group-label"><Network size={11} /><span>{g.team.name}</span><span className="group-count">{g.members.length}</span></div>
            {g.charted
              ? roots.map(node => <SeatBranch key={node.name} node={node} depth={0} members={data.agents} current={agent?.id} toneOfSeat={id => seatTone.get(id) ?? "idle"} counts={messageCountOf} lastAt={lastMessageOf} visible={shown} onOpen={openSeat} />)
              : members.map(a => <SeatNode key={a.id} selected={!pane && agent?.id === a.id} agent={a} secondary={a.role} dot={seatTone.get(a.id) ?? "idle"} count={messageCountOf(a.id)} lastAt={lastMessageOf(a.id)?.createdAt} onSelect={() => openSeat(a.id)} />)}
          </div>;
        })}
        {(() => {
          const members = unfiled.filter(a => `${a.name} ${a.role}`.toLowerCase().includes(filter.toLowerCase()));
          if (!members.length) return filter && teamGroups.length ? null : <div className="bench-empty-sheet"><h3>No one here yet</h3><p>Add the first seat and this board becomes your organisation.</p><button className="primary" onClick={() => setDialog("agent")}><Plus size={14} />Add agent</button></div>;
          return <div className="bench-group">
            <div className="group-label"><Users size={11} /><span>Bench</span><span className="group-count">{members.length}</span></div>
            {members.map(a => <SeatNode key={a.id} selected={!pane && agent?.id === a.id} agent={a} secondary={a.role} dot={seatTone.get(a.id) ?? "idle"} count={messageCountOf(a.id)} lastAt={lastMessageOf(a.id)?.createdAt} onSelect={() => openSeat(a.id)} />)}
          </div>;
        })()}
        {filter && !teamGroups.some(g => g.members.some(a => `${a.name} ${a.role}`.toLowerCase().includes(filter.toLowerCase()))) && !unfiled.some(a => `${a.name} ${a.role}`.toLowerCase().includes(filter.toLowerCase())) && <p className="bench-none">No seat matches that name or role.</p>}
      </div>
      <nav className="index-foot">
        {panes.map(p => <button key={p.id} className={`pane-link ${pane === p.id ? "on" : ""}`} onClick={() => { setPane(p.id); setRail(false); }}><p.icon size={16} strokeWidth={1.9} /><span>{p.label}</span>{p.count ? <span className="count">{p.count}</span> : null}{p.runs ? <span className={`count ${p.sample ? "muted" : ""}`} title={p.sample ? "seeded sample data, not a real run" : `${p.runs} recorded runs`}>{p.runs}</span> : null}</button>)}
        <div className="foot-status">
          <span className={`pulse ${data.modelConfigured ? "on" : ""}`} />
          <span>{data.modelConfigured ? "Model ready" : "No model key"}</span>
        </div>
      </nav>
    </aside>
    {rail && <div className="scrim-rail" onClick={() => setRail(false)} />}

    <main className="sheet">
      <header className="sheet-bar">
        <button className="icon-btn only-narrow" onClick={() => setRail(true)} aria-label="Open the organisation"><Menu size={17} /></button>
        {pane ? <>
          <button className="icon-btn" onClick={() => setPane(null)} aria-label="Back to the thread"><ArrowLeft size={16} /></button>
          <div><h1>{pane[0].toUpperCase() + pane.slice(1)}</h1><div className="sub">{pane === "scheduler" ? `${data.routines.length} routine${data.routines.length === 1 ? "" : "s"} · ${data.runs.length} run${data.runs.length === 1 ? "" : "s"}` : pane === "tools" ? "nothing is connected" : "workspace"}</div></div>
        </> : agent && <>
          <div className="ident" style={hue}>
            <span className="ident-tile"><FaceIcon agent={agent} size={17} /></span>
            <div className="ident-main">
              <h1>{agent.name}</h1>
              <p className="ident-role">{agent.role}{reportsLine ? ` · ${reportsLine}` : ""}</p>
            </div>
          </div>
          <div className="facts">
            <span className={`fact ${agent.status === "ACTIVE" ? "live" : ""}`}><i className="fact-dot" />{agent.status === "ACTIVE" ? "active" : "paused"}</span>
            <span className="fact" title={data.limits.maxDelegations === 0 ? "delegation is switched off on this server" : `up to ${data.limits.maxDelegations} peer hop per answer`}>{answering ? <><b>{answering.label}</b><s>{answering.model}</s></> : <>local replies only</>}</span>
            <span className="fact mono" title="messages stored for this seat">{thread.length} msg</span>
          </div>
          <div className="push" />
          <button className="ghost only-narrow" onClick={() => setActivity(true)}><Activity size={15} />Activity</button>
          <button className="ghost" onClick={() => setSettingsFor(agent.id)}><SlidersHorizontal size={15} />Agent</button>
          <button className="ghost" onClick={() => { setRoutineForm({ name: "", description: "", schedule: "Every day at 8:00 AM", agentId: agent.id }); setDialog("routine"); }}><CalendarDays size={15} />Routine</button>
        </>}
      </header>

      <div className="sheet-body" ref={bodyRef}>
        {!pane && agent && <div className="thread">
          {!thread.length && <div className="thread-empty">
            <span className="entry-face" style={hue}><FaceIcon agent={agent} /></span>
            <h2>No conversation here yet</h2>
            <p>{agent.name} is {answering ? `on ${answering.label} · ${answering.model}` : "running without a model key"}. Ask something below and the reply is written to this workspace.</p>
          </div>}
          {thread.map((m, i) => {
            const fault = m.kind === "provider_error";
            const mine = m.role === "user";
            const isLast = m.id === lastReply?.id;
            return <div key={m.id}>
              {(i === 0 || dayLabel(thread[i - 1].createdAt) !== dayLabel(m.createdAt)) && <div className="rule-day"><span>{dayLabel(m.createdAt)}</span><i /></div>}
              <div style={mine ? undefined : hue} className={`entry ${mine ? "entry-user" : "entry-assistant"} ${fault ? "entry-fault" : ""}`}>
                <span className="entry-face">{mine ? <User size={15} /> : <FaceIcon agent={agent} />}</span>
                <div className="entry-main">
                  <div className="entry-head"><strong>{mine ? "You" : String(m.metadata?.authoredByName ?? agent.name)}</strong>{m.metadata?.handoffFrom ? <span className="who">via {String(m.metadata.handoffFrom)}</span> : null}<time>{clock(m.createdAt)}</time>{m.metadata?.scheduled ? <span className="tag" style={{ color: "var(--ink-2)" }}>scheduled</span> : null}{fault ? <span className="tag" style={{ color: "var(--fault)" }}>not answered</span> : m.metadata?.truncated ? <span className="tag" style={{ color: "var(--waiting)" }}>budget reached</span> : m.metadata?.incomplete ? <span className="tag" style={{ color: m.metadata.stopped ? "var(--ink-2)" : "var(--waiting)" }}>{m.metadata.stopped ? "stopped" : "partial"}</span> : null}<span className="entry-tools">{!mine && !fault && <CopyBtn text={m.content} label="Copy" />}</span></div>
                  {(() => { const r = splitReasoning(m.content); return <> <ReasoningFold text={m.content} model={m.metadata?.model ? String(m.metadata.model) : undefined} truncated={Boolean(m.metadata?.truncated)} />{r.answer || fault ? <div className="entry-text">{fault ? r.answer : <RichText text={r.answer} />}</div> : <div className="entry-text muted">{m.metadata?.truncated ? "The output budget this server gives the agent ran out while it was still reasoning. Raise it in Agent › Capabilities (effort or max tokens), or ask something shorter." : "The model wrote reasoning and stopped before answering. Nothing was invented to fill the gap — the block above is all it produced."}</div>}</>; })()}
                  {fault && <div className="fault-detail mono">provider: {String(m.metadata.provider)}{m.metadata.detail ? ` · ${String(m.metadata.detail).slice(0, 110)}` : ""}{m.metadata.quota ? " · daily budget reached" : ""}</div>}
                  {Array.isArray(m.metadata?.consulted) && (m.metadata.consulted as { name: string; question: string }[]).map(c => {
                    const peer = data.agents.find(a => a.name === c.name);
                    const hop = data.delegations.find(d => d.messageId === m.id && d.toAgentId === peer?.id);
                    return <div className="consult" key={c.name + c.question}>
                      <div className="consult-head"><ArrowLeft size={13} /><span><b>{agent.name}</b> consulted <b>{c.name}</b></span><time className="mono">{clock(m.createdAt)}</time></div>
                      <p className="consult-q">{c.question}</p>
                      {hop ? <><ReasoningFold text={hop.answer} model={hop.model} /><div className="consult-a">{splitReasoning(hop.answer).answer || "Their answer was reasoning only — see the block above."}</div></> : <p className="consult-a muted">Their answer is recorded but was not kept for display.</p>}
                    </div>;
                  })}
                  {m.kind === "org_proposal" && <div className="team-card">
                    {(() => {
                      const seats = (m.metadata?.agents as Seat[] ?? []).filter(x => x && x.name);
                      const team = String(m.metadata?.team ?? "New organisation");
                      return <>
                        <div className="team-card-head"><span className="mark"><Network size={13} /></span><div><strong>{team}</strong><span>{seats.length} seats · nothing created yet · they would report to {agent.name}</span></div></div>
                        <div className="org-chart">{orgTree(seats).map(node => <OrgBranch key={node.name} node={node} depth={0} />)}</div>
                        <div className="team-card-foot">
                          <span>Confirm and every seat exists with its reporting line, able to ask up and down that line.</span>
                          <button className="primary" disabled={busy} onClick={() => act("createOrg", { team, brief: String(m.metadata?.brief ?? ""), members: seats, provider: agent.provider, managerId: agent.id }, `${team} created`)}>Create {seats.length} seats<ArrowRight size={14} /></button>
                        </div>
                      </>;
                    })()}
                  </div>}
                  {m.kind === "team_proposal" && <div className="team-card">
                    <div className="team-card-head"><span className="mark"><Users size={13} /></span><div><strong>{String(m.metadata?.team ?? "New team")}</strong><span>{(m.metadata?.agents as { name: string; role: string }[] ?? []).length} teammates · nothing created yet</span></div></div>
                    <ul className="team-roster">{(m.metadata?.agents as { name: string; role: string; instructions: string }[] ?? []).map(a => <li key={a.name}><b>{a.name}</b><span>{a.role}</span><em>{a.instructions}</em></li>)}</ul>
                    <div className="team-card-foot">
                      <span>They will be able to consult each other on your next question.</span>
                      <button className="primary" disabled={busy} onClick={() => act("createTeam", { team: String(m.metadata?.team ?? "New team"), agents: m.metadata?.agents ?? [], provider: agent.provider }, "Team created")}>Create team<ArrowRight size={14} /></button>
                    </div>
                  </div>}
                  {m.metadata?.handoffFrom ? <div className="consult">
                    <div className="consult-head"><ArrowLeft size={13} /><span><b>{String(m.metadata.handoffFrom)}</b> handed this turn to <b>{String(m.metadata?.authoredByName ?? agent.name)}</b></span><time className="mono">{clock(m.createdAt)}</time></div>
                    <p className="consult-q">{String(m.metadata?.reason ?? "")}</p>
                  </div> : null}
                  {m.kind === "approval_request" ? <div className="propose">
                    <div style={{ minWidth: 0 }}><b>{String(m.metadata?.title ?? "Approval needed")}</b><span> · {String(m.metadata?.detail ?? "")}</span></div>
                    <span className="propose-actions"><button className="ghost" disabled={busy} onClick={() => act("decideApproval", { approvalId: String(m.metadata?.approvalId), decision: "REJECTED" }, "Rejected")}>Reject</button><button className="primary" disabled={busy} onClick={() => act("decideApproval", { approvalId: String(m.metadata?.approvalId), decision: "APPROVED" }, "Recorded. Nothing was sent.")}>Approve</button></span>
                  </div> : null}
                  {m.kind === "routine_proposal" && <div className="propose">
                    <div style={{ minWidth: 0 }}><b>{String(m.metadata?.name ?? "New routine")}</b><span> · {String(m.metadata?.schedule ?? "Every day at 8:00 AM")} · {data.workspace.timezone}</span></div>
                    <button className="primary" disabled={busy} onClick={() => act("createRoutine", { agentId: agent.id, name: String(m.metadata?.name ?? "New routine"), description: String(m.metadata?.description ?? ""), schedule: String(m.metadata?.schedule ?? "Every day at 8:00 AM") }, "Routine saved")}>Save<ArrowRight size={14} /></button>
                  </div>}
                  {isLast && provenance && <details className="prov">
                    <summary>
                      <span className="prov-state">{provenance.state}</span>
                      <span className="prov-provider">{provenance.provider}</span><span className="prov-model">{provenance.model ?? "no model"}</span>
                      <span className="push prov-mono">{provenance.r.answer.length} chars{provenance.r.reasoning ? ` · ${provenance.r.reasoning.length} reasoning` : ""}{provenance.model ? ` · ${est(provenance.r.answer)} tokens (est.)` : ""} · saved {provenance.saved}</span>
                    </summary>
                    <p className="prov-note">{provenance.fault ? "No model answer exists for this turn. Nothing was invented to fill it." : provenance.state === "stopped by you" ? "You stopped this one. What is here is everything that had arrived; it was not replayed." : provenance.state === "partial" ? "The connection died mid-reply. What is here is what arrived; it was not replayed, because replaying would duplicate text you already watched." : provenance.state === "budget reached" ? "The provider stopped at the output budget, which this server sets per agent. The reasoning that filled it is kept verbatim; nothing was invented to close the sentence." : provenance.state === "reasoning only" ? "The model streamed reasoning and then stopped. The stored row is exactly that, and the thread says so rather than showing a blank bubble." : "Stored in PostgreSQL. Reloading shows the same text."}</p>
                  </details>}
                </div>
              </div>
            </div>;
          })}

          {pending && !threadHasPending && <div className="entry entry-user"><span className="entry-face"><User size={15} /></span><div className="entry-main"><div className="entry-head"><strong>You</strong><time>sending</time></div><div className="entry-text">{pending}</div></div></div>}
          {busy && (() => { const live = splitReasoning(stream); return <div className="entry entry-assistant entry-live" style={hue}>
            <span className="entry-face"><FaceIcon agent={agent} /></span>
            <div className="entry-main">
              <div className="entry-head"><strong>{agent.name}</strong><time>{live.answer ? "answering" : live.reasoning ? "reasoning" : consulting ? "consulting" : "waiting"}</time>
                <span className="entry-tools"><button className="stop-btn" type="button" onClick={stop} title="Stop this reply; what has already arrived is kept"><Square size={11} fill="currentColor" />Stop</button></span>
              </div>
              <ReasoningFold text={stream} model={answering?.model} streaming />
              <div className="entry-text">{consulting ? <span className="consulting">Consulting {consulting.to} — {consulting.question}</span> : null}{live.answer || (live.reasoning || consulting ? "" : "Waiting for the model…")}{stream ? <span className="caret" /> : null}</div>
            </div>
          </div>; })()}
          <div ref={endRef} />
        </div>}

        {pane === "scheduler" && <div className="pane">
          <div className="pane-head"><div><h1>Scheduler</h1><p>A due routine runs the next time this workspace is opened — there is no background daemon on this server, so a routine that fell due while the laptop was closed fires once on the next open and is marked late.</p></div><div className="push" /><button className="primary" onClick={() => { setRoutineForm({ name: "", description: "", schedule: "Every day at 8:00 AM", agentId: agent?.id ?? "" }); setDialog("routine"); }}><Plus size={15} />New routine</button></div>
          <h2 className="pane-h2">Routines<span className="mono">{data.routines.length}</span></h2>
          {data.routines.length ? <div className="rows">{data.routines.map(r => <div className="row" key={r.id}>
            <span className="row-face"><CalendarDays size={15} /></span>
            <span className="row-main"><strong>{r.name}</strong><span>{r.description} · {byId(r.agentId)?.name}</span><span className="row-when">{r.enabled ? <>next {r.nextRunAt ? `${dayLabel(r.nextRunAt)} ${clock(r.nextRunAt)}` : "not scheduled"} · {describeSchedule(r.schedule, r.timezone)}</> : <>paused · {r.schedule}</>}</span></span>
            <span className="row-actions">
              <span className="row-side">{r.lastStatus ? <State status={r.lastStatus} /> : null}</span>
              <button className="ghost" disabled={busy} onClick={() => act("runRoutine", { routineId: r.id }, "Run started")}><Play size={14} />Run now</button>
              <button className="icon-btn" title={r.enabled ? "Pause" : "Resume"} disabled={busy} onClick={() => act("toggleRoutine", { routineId: r.id })}>{r.enabled ? <Pause size={15} /> : <Play size={15} />}</button>
              <button className="icon-btn" title="Delete" disabled={busy} onClick={() => setAskDelete({ kind: "routine", id: r.id, name: r.name })}><Trash2 size={15} /></button>
            </span>
          </div>)}</div> : <div className="blank"><h3>No routines</h3><p>Ask an agent for something on a schedule and it will propose one.</p></div>}
          <h2 className="pane-h2">Runs<span className="mono">{data.runs.length}</span></h2>
          {data.runs.length ? <div className="rows">{data.runs.map(r => <button className="row" key={r.id} onClick={() => setDialog(r)}>
            <span className="row-face"><Activity size={15} /></span>
            <span className="row-main"><strong>{r.title}</strong><span>{byId(r.agentId)?.name ?? "removed agent"} · {r.summary}</span></span>
            <span className="row-side"><State status={r.status} sample={isSample(r)} /><time>{dayLabel(r.startedAt)} {clock(r.startedAt)}</time></span>
          </button>)}</div> : <div className="blank"><h3>No runs yet</h3><p>Run a routine and the request is recorded here.</p></div>}
        </div>}

        {pane === "tools" && <div className="pane">
          <div className="pane-head"><div><h1>Tools &amp; MCP</h1><p>No connector is authorised here, so no agent has a browser, files, or an external account. Per-agent grants live in Agent › Capabilities.</p></div></div>
          <div className="rows">{toolCatalog.map(t => <div className="row" key={t.slug}>
            <span className="row-face"><Compass size={15} /></span>
            <span className="row-main"><strong>{t.name}</strong><span>{t.description} · {t.category}</span></span>
            <span className="row-side"><span className="chip idle"><i />not connected</span></span>
            <span className="row-actions"><button className="ghost" disabled={busy} onClick={() => act("connectTool", { agentId: agent?.id, slug: t.slug })}>Connect</button></span>
          </div>)}</div>
          <h2 className="pane-h2">MCP servers<span className="mono">{mcpCount}</span></h2>
          {mcpCount ? <div className="rows">{data.agents.flatMap(a => (a.capabilities.mcpServers ?? []).map((srv, i) => <div className="row" key={`${a.id}-${i}`}>
            <span className="row-face"><Settings2 size={15} /></span>
            <span className="row-main"><strong>{srv.name || "unnamed"}</strong><span>{a.name} · {srv.transport}</span></span>
            <span className="row-side"><span className="chip idle"><i />no transport</span></span>
          </div>))}</div> : <div className="blank"><h3>No server configured</h3><p>Add one in Agent › Capabilities. It is stored and shown, and nothing connects until a transport exists.</p></div>}
        </div>}

        {pane === "settings" && <div className="pane">
          <div className="pane-head"><div><h1>Settings</h1><p>What this workspace is, and exactly what it cannot do.</p></div></div>
          <div className="stack">
            <div className="block">
              <h2>Workspace</h2><p>Your personal space. Identified by a browser cookie, not an account.</p>
              <div className="field"><label htmlFor="ws">Name</label><input id="ws" value={data.workspace.name} disabled /></div>
              <div className="field"><label htmlFor="tz">Time zone</label><select id="tz" value={data.workspace.timezone} onChange={e => act("updateWorkspace", { timezone: e.target.value }, "Time zone saved")}>{zones.map(z => <option key={z}>{z}</option>)}</select><span className="hint">Applied when a routine is saved.</span></div>
            </div>
            <div className="block">
              <h2>Model providers</h2><p>Configured on the server in <span className="mono">.env.local</span>. A key never reaches the browser.</p>
              {data.profiles.map(p => <div className="kv" key={p.name}><span>{p.label}</span><span className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>{p.model}</span><span className="push"><span className={`chip ${p.configured ? "ran" : "idle"}`}><i />{p.configured ? "ready" : "no key"}</span></span></div>)}
              <hr />
              <div className="meter-block">
                <div className="kv"><span>Calls today</span><span className="push mono">{callsToday} of {data.limits.dailyModelCalls || "no limit"}</span></div>
                {data.limits.dailyModelCalls > 0 && <div className="meter" role="img" aria-label={`${callsToday} of ${data.limits.dailyModelCalls} model calls used today`}><i style={{ width: `${Math.min(100, (callsToday / data.limits.dailyModelCalls) * 100)}%` }} /></div>}
              </div>
              {data.limits.usage.length ? data.limits.usage.map(u => <div className="kv" key={u.provider}><span>{data.profiles.find(p => p.name === u.provider)?.label ?? u.provider}</span><span className="push mono">{u.inputTokens} in · {u.outputTokens} out {u.estimated ? <span style={{ color: "var(--ink-3)" }}>est.</span> : <span style={{ color: "var(--ink-3)" }}>reported</span>}</span></div>) : <div className="kv"><span>No model calls recorded today</span></div>}
            </div>
            <div className="block">
              <h2>What cannot run here</h2><p>Limits of this deployment, not switches for you to find.</p>
              <div className="kv"><span>Sign-in</span><span className="push"><span className="chip idle"><i />cookie demo</span></span></div>
              <div className="kv"><span>Scheduler</span><span className="push"><span className="chip waiting"><i />runs on open</span></span></div>
              <div className="kv"><span>Tool connectors</span><span className="push"><span className="chip idle"><i />not configured</span></span></div>
              <div className="kv"><span>Computer / browser</span><span className="push"><span className="chip idle"><i />{data.sandboxProvider}</span></span></div>
            </div>
          </div>
        </div>}
      </div>

      {!pane && agent && <>
        {!atBottom && <button className="jump" type="button" onClick={() => { const b = bodyRef.current; if (b) b.scrollTop = b.scrollHeight; setAtBottom(true); }}><ArrowDown size={14} />{busy ? "Answering below" : "Latest reply"}</button>}
        <form className="composer" onSubmit={submit} style={hue}>
          <div className="composer-box">
            <textarea value={draft} rows={1} placeholder={agent.status === "ACTIVE" ? `Message ${agent.name}` : `${agent.name} is paused`} disabled={agent.status !== "ACTIVE"} aria-label={`Message ${agent.name}`}
              onChange={e => { setDraft(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 168)}px`; }}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
            {busy
              ? <button className="stop-btn" type="button" onClick={stop} title="Stop this reply; what has already arrived is kept"><Square size={11} fill="currentColor" />Stop</button>
              : <button className="send" type="submit" disabled={!draft.trim() || agent.status !== "ACTIVE"} aria-label="Send message"><ArrowRight size={17} /></button>}
          </div>
          <div className="composer-bar">
            <span className="fact">{answering ? <><b>{answering.label}</b><s>{answering.model}</s></> : <>no model key · local replies</>}</span>
            <span className="composer-note"><CircleHelp size={12} />no browser, files, or connectors</span>
            <span className="push mono">{draft.trim() ? <>{est(draft)} est. tokens</> : busy ? <>Stop keeps what has arrived</> : <span className="only-wide">Enter sends · Shift+Enter newline</span>}</span>
          </div>
        </form>
      </>}
    </main>

    <aside className={`board ${activity ? "open" : ""}`}>
      <div className="board-head">
        <strong>Activity</strong>
        <span className="push" />
        <button className="icon-btn only-narrow" onClick={() => setActivity(false)} aria-label="Close activity"><X size={15} /></button>
      </div>
      <div className="board-body">
        {inFlight.length > 0 && <div className="board-sec">
          <div className="group-label"><Zap size={11} /><span>In flight</span></div>
          {inFlight.map((row, i) => <div className="bd-row live" key={i} style={hue}>
            <span className="st"><i className="caret-st" /></span>
            <span className="bd-main"><b>{row.label}</b>{row.note && <em>{row.note}</em>}</span>
          </div>)}
        </div>}

        {(realPending.length > 0 || waitingRows.length > 0 || dueRoutines.length > 0) && <div className="board-sec">
          <div className="group-label"><ShieldCheck size={11} /><span>Needs attention</span><span className="group-count">{realPending.length + waitingRows.length + dueRoutines.length}</span></div>
          {realPending.map(a => <div className="bd-row" key={a.id}>
            <span className={`st ${toneOf(a.status)}`}><i /></span>
            <span className="bd-main"><b>{a.title}</b><em>{a.detail}</em>
              <span className="bd-actions"><button className="ghost" disabled={busy} onClick={() => act("decideApproval", { approvalId: a.id, decision: "REJECTED" }, "Rejected")}>Reject</button><button className="primary" disabled={busy} onClick={() => act("decideApproval", { approvalId: a.id, decision: "APPROVED" }, "Recorded. Nothing was sent.")}>Approve</button></span>
            </span>
            <time className="mono">{stamp(a.createdAt)}</time>
          </div>)}
          {waitingRows.map(w => <button className="bd-row" key={w.run.id} onClick={() => { openSeat(w.run.agentId); setDialog(w.run); }}>
            <span className={`st ${w.tone}`}><i /></span>
            <span className="bd-main"><b>{w.run.title}</b><em>{byId(w.run.agentId)?.name ?? "removed seat"} · {w.note}</em></span>
            <time className="mono">{stamp(w.run.startedAt)}</time>
          </button>)}
          {dueRoutines.map(r => <button className="bd-row" key={r.id} onClick={() => openSeat(r.agentId)}>
            <span className="st waiting"><i /></span>
            <span className="bd-main"><b>{r.name} is due</b><em>{describeSchedule(r.schedule, r.timezone)} · executes as this workspace is read</em></span>
            <time className="mono">{stamp(r.nextRunAt!)}</time>
          </button>)}
        </div>}

        <div className="board-sec">
          <div className="group-label"><CalendarDays size={11} /><span>Upcoming</span><span className="group-count">{upcoming.length}</span></div>
          {!upcoming.length && <p className="board-none">No enabled routine is waiting for its next time.</p>}
          {upcoming.map(r => <button className="bd-row" key={r.id} onClick={() => openSeat(r.agentId)}>
            <span className="st"><i /></span>
            <span className="bd-main"><b>{r.name}</b><em>{byId(r.agentId)?.name ?? "removed seat"} · {describeSchedule(r.schedule, r.timezone)}</em></span>
            <span className="bd-side"><time className="mono">{stamp(r.nextRunAt!)} · in {agoTo(r.nextRunAt!)}</time></span>
          </button>)}
        </div>

        <div className="board-sec">
          <div className="group-label"><Activity size={11} /><span>Record</span><span className="group-count">{recordRows.length}</span></div>
          {!recordRows.length && <div className="blank"><h3>Nothing recorded yet</h3><p>Send a reply, schedule a routine, build a team. This board prints what the server stored, nothing else.</p></div>}
          {recordRows.slice(0, 24).map(row => row.open ? <button className="bd-row" key={row.id} onClick={row.open}>
            <span className={`st ${row.tone}`}><i /></span>
            <span className="bd-main"><b>{row.label}</b><em>{row.note}</em></span>
            <span className="bd-side">{row.sample ? <span className="chip idle"><i />sample</span> : row.state ? <State status={row.state} /> : null}<time className="mono">{stamp(row.time)}</time></span>
          </button> : <div className="bd-row" key={row.id}>
            <span className={`st ${row.tone}`}><i /></span>
            <span className="bd-main"><b>{row.label}</b><em>{row.note}</em></span>
            <span className="bd-side">{row.sample ? <span className="chip idle"><i />sample</span> : row.state ? <State status={row.state} /> : null}<time className="mono">{stamp(row.time)}</time></span>
          </div>)}
        </div>
      </div>
      <div className="board-foot">
        <span>No background worker: due work executes when this workspace is read.</span>
        <span className="board-usage mono">{callsToday} of {data.limits.dailyModelCalls || "no"} model calls today</span>
      </div>
    </aside>

    {activity && <div className="scrim-rail only-narrow" onClick={() => setActivity(false)} />}

    {dialog && <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) setDialog(null); }}>
      {dialog === "agent" && <form className="dialog" onSubmit={async e => { e.preventDefault(); const r = await act("createAgent", agentForm, `${agentForm.name || "Your agent"} is ready`); if (r) { setDialog(null); setAgentId(r.agentId); setPane(null); setAgentForm({ name: "", role: "", instructions: "", provider: "auto" }); } }}>
        <div className="dialog-top"><span className="mark"><Sparkles size={14} /></span><h2>New agent</h2><button type="button" className="icon-btn x" onClick={() => setDialog(null)} aria-label="Close"><X size={15} /></button></div>
        <div className="field"><label htmlFor="an">Name</label><input id="an" required maxLength={40} placeholder="Nova" value={agentForm.name} onChange={e => setAgentForm({ ...agentForm, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="ar">What do they do?</label><input id="ar" required maxLength={80} placeholder="Research analyst" value={agentForm.role} onChange={e => setAgentForm({ ...agentForm, role: e.target.value })} /></div>
        <div className="field"><label htmlFor="ai">Instructions</label><textarea id="ai" rows={4} placeholder="How should they help?" value={agentForm.instructions} onChange={e => setAgentForm({ ...agentForm, instructions: e.target.value })} /></div>
        <div className="field"><label htmlFor="ap">Chat model</label><select id="ap" value={agentForm.provider} onChange={e => setAgentForm({ ...agentForm, provider: e.target.value })}><option value="auto">Auto · first configured model</option>{data.profiles.map(p => <option key={p.name} value={p.name}>{p.label}{p.configured ? "" : " · no key"}</option>)}<option value="local">Local · no model</option></select></div>
        <div className="dialog-actions"><button type="button" className="ghost" onClick={() => setDialog(null)}>Cancel</button><button className="primary" disabled={busy}>Create agent</button></div>
      </form>}

      {dialog === "routine" && <form className="dialog" onSubmit={async e => { e.preventDefault(); const r = await act("createRoutine", routineForm, "Routine saved"); if (r) setDialog(null); }}>
        <div className="dialog-top"><span className="mark" style={{ background: "var(--azure-deep)" }}><CalendarDays size={14} /></span><h2>New routine</h2><button type="button" className="icon-btn x" onClick={() => setDialog(null)} aria-label="Close"><X size={15} /></button></div>
        <div className="field"><label htmlFor="rn">Name</label><input id="rn" required placeholder="Morning briefing" value={routineForm.name} onChange={e => setRoutineForm({ ...routineForm, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="ra">Agent</label><select id="ra" value={routineForm.agentId} onChange={e => setRoutineForm({ ...routineForm, agentId: e.target.value })}>{data.agents.map(a => <option key={a.id} value={a.id}>{a.name} — {a.role}</option>)}</select></div>
        <div className="field"><label htmlFor="rd">What should they do?</label><textarea id="rd" required rows={3} value={routineForm.description} onChange={e => setRoutineForm({ ...routineForm, description: e.target.value })} /></div>
        <div className="field"><label htmlFor="rs">Schedule</label><select id="rs" value={routineForm.schedule} onChange={e => setRoutineForm({ ...routineForm, schedule: e.target.value })}>{["Every day at 8:00 AM", "Weekdays at 8:00 AM", "Every Monday at 9:00 AM", "Every Friday at 4:00 PM", "Every week"].map(s => <option key={s}>{s}</option>)}</select><span className="hint">A due routine executes the next time this workspace is opened; nothing fires while the app is closed.</span></div>
        <div className="dialog-actions"><button type="button" className="ghost" onClick={() => setDialog(null)}>Cancel</button><button className="primary" disabled={busy}>Save routine</button></div>
      </form>}

      {typeof dialog === "object" && <div className="dialog wide">
        <div className="dialog-top"><span className="mark"><Activity size={14} /></span><h2>{dialog.title}</h2><button className="icon-btn x" onClick={() => setDialog(null)} aria-label="Close"><X size={15} /></button></div>
        <div className="dialog-meta"><State status={dialog.status} sample={isSample(dialog)} /><span className="mono">{dayLabel(dialog.startedAt)} {clock(dialog.startedAt)}</span><span>{byId(dialog.agentId)?.name ?? "removed agent"}</span></div>
        <p className="dialog-summary">{dialog.summary}</p>
        <div className="rows">{data.steps.filter(s => s.runId === dialog.id).map(s => <div className="row" key={s.id}><span className="row-face"><Check size={14} /></span><span className="row-main"><strong>{s.title}</strong><span>{s.detail}</span></span><span className="row-side"><time className="mono">{clock(s.createdAt)}</time></span></div>)}{!data.steps.some(s => s.runId === dialog.id) && <div className="row"><span className="row-main"><span>No steps recorded.</span></span></div>}</div>
        {!["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(dialog.status) && <div className="dialog-actions"><button className="ghost" disabled={busy} onClick={async () => { if (await act("cancelRun", { runId: dialog.id }, "Run cancelled")) setDialog(null); }}>Cancel run</button></div>}
      </div>}
    </div>}

    {settingsFor && byId(settingsFor) && <AgentDialog key={settingsFor} agent={byId(settingsFor)!} profiles={data.profiles} teammates={(() => { const target = byId(settingsFor); if (!target?.teamId) return []; return data.agents.filter(a => a.teamId === target.teamId && a.id !== target.id).map(a => ({ id: a.id, name: a.name, role: a.role })); })()} busy={busy} act={act} onClose={() => setSettingsFor(null)} onAskDelete={(id, name) => setAskDelete({ kind: "agent", id, name })} />}

    {askDelete && <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) setAskDelete(null); }}>
      <div className="dialog" style={{ width: 'min(380px, 100%)' }}>
        <div className="dialog-top"><span className="mark" style={{ background: 'var(--fault)' }}><Trash2 size={14} /></span><h2>Delete {askDelete.name}?</h2><button type="button" className="icon-btn x" onClick={() => setAskDelete(null)} aria-label="Close"><X size={15} /></button></div>
        <p className="dialog-summary" style={{ marginBottom: 0 }}>{askDelete.kind === 'routine' ? 'The schedule and its recorded runs stay in the audit; the routine stops firing.' : 'The seat, their thread, and their stored instructions are removed from the board.'}</p>
        <div className="dialog-actions">
          <button className="ghost" onClick={() => setAskDelete(null)}>Keep it</button>
          <button className="primary" style={{ background: 'var(--fault)', boxShadow: '0 1px 2px rgba(155, 39, 32, .3)' }} disabled={busy} onClick={async () => { const target = askDelete; setAskDelete(null); if (target.kind === 'routine') await act('deleteRoutine', { routineId: target.id }, 'Routine deleted'); else { if (await act('deleteAgent', { agentId: target.id }, 'Agent deleted')) { setSettingsFor(null); if (agentId === target.id) setAgentId(null); } } }}>Delete</button>
        </div>
      </div>
    </div>}

    {toast && <div className="toast"><CircleHelp size={16} style={{ color: "var(--ink-2)" }} /><span>{toast}</span><button className="x" onClick={() => setToast(null)} aria-label="Dismiss"><X size={15} /></button></div>}
  </div>;
}

/** The team's chart, drawn from stored `manager_id` rows: every node is a seat you can open,
 * indented by reporting depth, dotted by what the seat's stored rows say it is doing. */
function SeatBranch({ node, depth, members, current, toneOfSeat, counts, lastAt, visible, onOpen }: {
  node: OrgNode; depth: number; members: Agent[]; current?: string; toneOfSeat: (id: string) => Tone;
  counts: (id: string) => number; lastAt: (id: string) => Message | undefined; visible: (a: Agent) => boolean; onOpen: (id: string) => void;
}) {
  const agent = members.find(a => a.name === node.name);
  return <>
    {agent && visible(agent) && <SeatNode
      selected={current === agent.id}
      agent={agent}
      secondary={depth === 0 ? (node.descendants > 0 ? `${node.descendants} seats below this one` : agent.role) : agent.role}
      dot={toneOfSeat(agent.id)}
      count={counts(agent.id)}
      lastAt={lastAt(agent.id)?.createdAt}
      indent={depth}
      onSelect={() => onOpen(agent.id)}
    />}
    {node.children.map(c => <SeatBranch key={c.name} node={c} depth={depth + 1} members={members} current={current} toneOfSeat={toneOfSeat} counts={counts} lastAt={lastAt} visible={visible} onOpen={onOpen} />)}
  </>;
}

function CapabilitiesEditor({ caps, setCaps, teammates }: { caps: Capabilities; setCaps: (c: Capabilities) => void; teammates: { id: string; name: string; role: string }[] }) {
  const effective = new Set(resolveTools(caps as unknown as ToolCaps, { hasTeam: teammates.length > 0 }));
  const toggleTool = (id: string) => setCaps({ ...caps, tools: caps.tools.includes(id) ? caps.tools.filter(t => t !== id) : [...caps.tools, id] });
  const toggleSkill = (id: string) => setCaps({ ...caps, skills: caps.skills.includes(id) ? caps.skills.filter(x => x !== id) : [...caps.skills, id] });
  const setList = (key: "canConsult" | "canHandoffTo", next: boolean, id: string) => {
    const current = caps[key].includes("*") ? teammates.map(t => t.id) : caps[key];
    const value = next ? Array.from(new Set([...current, id])) : current.filter(v => v !== id);
    setCaps({ ...caps, [key]: value });
  };
  const everyone = (key: "canConsult" | "canHandoffTo", on: boolean) => setCaps({ ...caps, [key]: on ? teammates.map(t => t.id) : [] });
  return <div className="caps">
    <div className="caps-group">
      <label className="caps-label">Tools</label>
      <p className="caps-help">Only what this deployment can actually perform is selectable. Everything else is listed so you can see the boundary, not pretend it away.</p>
      {TOOL_REGISTRY.map(t => {
        const granted = caps.tools.includes(t.id);
        const dormant = t.available && granted && !effective.has(t.id);
        return <label key={t.id} className={`tool-row ${t.available ? "" : "off"} ${dormant ? "dormant" : ""}`} title={t.available ? t.description : t.whyUnavailable}>
          <input type="checkbox" disabled={!t.available} checked={granted} onChange={() => toggleTool(t.id)} />
          <span className="tool-row-main"><b>{t.label}</b><em>{t.available ? (dormant ? `${t.description} — inactive until this agent joins a team.` : t.description) : t.whyUnavailable}</em></span>
          <span className={`chip ${dormant ? "waiting" : t.available ? "ran" : "idle"}`}><i />{dormant ? "no team" : t.available ? t.kind : "unavailable"}</span>
        </label>;
      })}
    </div>
    <div className="caps-group">
      <label className="caps-label">Permission mode</label>
      <div className="seg" role="group" aria-label="Permission mode">
        {(["default", "plan", "auto"] as const).map(m => <button type="button" key={m} className={caps.permissionMode === m ? "on" : ""} onClick={() => setCaps({ ...caps, permissionMode: m })}>{m}</button>)}
      </div>
      <p className="caps-help">{caps.permissionMode === "plan" ? "Plan: advises and delegates, cannot save routines or raise approvals." : caps.permissionMode === "auto" ? "Auto: acts without asking for approval on writes." : "Default: acts, and raises approvals for anything that leaves the workspace."}</p>
    </div>
    <div className="caps-group">
      <label className="caps-label">May reach</label>
      {teammates.length === 0 ? <p className="caps-help">No teammates. Delegation tools disappear from this agent until it joins a team.</p> : (
        <div className="reach">
          {(["consult", "handoff"] as const).map(kind => {
            const key = kind === "consult" ? "canConsult" : "canHandoffTo";
            const allowed = caps[key].includes("*") ? teammates.map(t => t.id) : caps[key];
            return <div className="reach-col" key={kind}>
              <div className="reach-head"><b>{kind === "consult" ? "Consult" : "Hand off to"}</b><button type="button" onClick={() => everyone(key, allowed.length !== teammates.length)}>{allowed.length === teammates.length ? "None" : "Everyone"}</button></div>
              {teammates.map(t => <label key={t.id} className="reach-row"><input type="checkbox" checked={allowed.includes(t.id)} onChange={e => setList(key, e.target.checked, t.id)} /><span>{t.name}</span><em>{t.role}</em></label>)}
            </div>;
          })}
        </div>
      )}
    </div>
    <div className="caps-group caps-row">
      <div><label className="caps-label">Effort</label><div className="seg">{(["low", "medium", "high"] as const).map(e => <button type="button" key={e} className={caps.effort === e ? "on" : ""} onClick={() => setCaps({ ...caps, effort: e })}>{e}</button>)}</div><span className="caps-note">{tokenBudgetFor(caps as unknown as ToolCaps)} tokens per reply — a reasoning model can spend them all before it answers.</span></div>
      <div><label className="caps-label" htmlFor="mt">Max turns</label><input id="mt" type="number" min={1} max={25} value={caps.maxTurns ?? 8} onChange={e => setCaps({ ...caps, maxTurns: Math.max(1, Math.min(25, Number(e.target.value) || 1)) })} /></div>
      <div><label className="caps-label" htmlFor="tp">Temperature {caps.modelParams.temperature ?? 0.7}</label><input id="tp" type="range" min={0} max={1.5} step={0.1} value={caps.modelParams.temperature ?? 0.7} onChange={e => setCaps({ ...caps, modelParams: { ...caps.modelParams, temperature: Number(e.target.value) } })} /></div>
    </div>
    <div className="caps-group">
      <label className="caps-label">Skills</label>
      <p className="caps-help">A skill is a named block of instructions added to this agent's system prompt. It changes how a reply is written. It cannot grant a tool, and the server drops any name that is not in the registry.</p>
      {SKILL_REGISTRY.map(s => <label key={s.id} className={`tool-row ${s.available ? "" : "off"}`} title={s.available ? s.description : s.whyUnavailable}>
        <input type="checkbox" disabled={!s.available} checked={caps.skills.includes(s.id)} onChange={() => toggleSkill(s.id)} />
        <span className="tool-row-main"><b>{s.label}</b><em>{s.available ? s.description : s.whyUnavailable}</em></span>
        <span className={`chip ${s.available ? "azure" : "idle"}`}><i />{s.available ? s.kind : "unavailable"}</span>
      </label>)}
    </div>
    <div className="caps-group">
      <label className="caps-label">MCP servers</label>
      <p className="caps-help">{mcpSummary(caps as unknown as ToolCaps, { transportWired: false })}</p>
      {caps.mcpServers.map((srv, i) => <div className="mcp-row" key={`${srv.name}-${i}`}>
        <input value={srv.name} maxLength={40} aria-label={`Server ${i + 1} name`} placeholder="server name" onChange={e => setCaps({ ...caps, mcpServers: caps.mcpServers.map((s, j) => j === i ? { ...s, name: e.target.value } : s) })} />
        <select value={srv.transport} aria-label={`Server ${i + 1} transport`} onChange={e => setCaps({ ...caps, mcpServers: caps.mcpServers.map((s, j) => j === i ? { ...s, transport: e.target.value } : s) })}><option value="stdio">stdio</option><option value="http">http</option></select>
        <button type="button" className="icon-btn" aria-label={`Remove ${srv.name || "server"}`} onClick={() => setCaps({ ...caps, mcpServers: caps.mcpServers.filter((_, j) => j !== i) })}><X size={15} /></button>
      </div>)}
      <div><button type="button" className="ghost" disabled={caps.mcpServers.length >= 6} onClick={() => setCaps({ ...caps, mcpServers: [...caps.mcpServers, { name: "", transport: "stdio" }] })}><Plus size={14} />Add server</button></div>
    </div>
    <p className="caps-help">Active tools: {resolveTools(caps as unknown as ToolCaps, { hasTeam: teammates.length > 0 }).join(", ") || "none"} · skills: {resolveSkills(caps.skills).map(s => s.label).join(", ") || "none"}</p>
  </div>;
}

function AgentDialog({ agent, profiles, teammates, busy, act, onClose, onAskDelete }: { agent: Agent; profiles: Profile[]; teammates: { id: string; name: string; role: string }[]; busy: boolean; act: (a: string, p?: Record<string, unknown>, s?: string) => Promise<unknown>; onClose: () => void; onAskDelete: (id: string, name: string) => void }) {
  const [name, setName] = useState(agent.name);
  const [role, setRole] = useState(agent.role);
  const [instructions, setInstructions] = useState(agent.instructions);
  const [provider, setProvider] = useState(agent.provider);
  const [caps, setCaps] = useState<Capabilities>(agent.capabilities);
  const [section, setSection] = useState<"identity" | "capabilities">("identity");
  return <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="dialog">
      <div className="dialog-top"><span className="mark"><SlidersHorizontal size={14} /></span><h2>{agent.name}</h2><button type="button" className="icon-btn x" onClick={onClose} aria-label="Close"><X size={15} /></button></div>
      <form onSubmit={e => { e.preventDefault(); act("updateAgent", { agentId: agent.id, name, role, instructions, provider, capabilities: caps }, "Agent saved"); }}>
        <div className="field"><label htmlFor="sn">Name</label><input id="sn" value={name} maxLength={40} required onChange={e => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="sr">Role</label><input id="sr" value={role} maxLength={80} required onChange={e => setRole(e.target.value)} /></div>
        <div className="field"><label htmlFor="si">Instructions</label><textarea id="si" rows={4} value={instructions} onChange={e => setInstructions(e.target.value)} /></div>
        <div className="field"><label htmlFor="sp">Chat model</label><select id="sp" value={provider} onChange={e => setProvider(e.target.value)}><option value="auto">Auto · first configured model</option>{profiles.map(p => <option key={p.name} value={p.name}>{p.label} · {p.model}{p.configured ? "" : " · no key"}</option>)}<option value="local">Local · no model</option></select></div>
        <div className="seg dialog-tabs" role="group" aria-label="Section">
          <button type="button" className={section === "identity" ? "on" : ""} onClick={() => setSection("identity")}>Identity</button>
          <button type="button" className={section === "capabilities" ? "on" : ""} onClick={() => setSection("capabilities")}><ListChecks size={13} />Capabilities</button>
        </div>
        {section === "capabilities" ? <CapabilitiesEditor caps={caps} setCaps={setCaps} teammates={teammates} /> : null}
        <div className="dialog-actions"><button className="primary" type="submit" disabled={busy}>Save</button></div>
      </form>
      <hr className="dialog-rule" />
      <div className="kv"><span>{agent.status === "ACTIVE" ? "Active now" : "Paused now"}</span><button type="button" className="ghost push" disabled={busy} onClick={() => act("updateAgent", { agentId: agent.id, status: agent.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }, agent.status === "ACTIVE" ? "Paused" : "Resumed")}>{agent.status === "ACTIVE" ? <Pause size={14} /> : <Play size={14} />}{agent.status === "ACTIVE" ? "Pause" : "Resume"}</button></div>
      <div className="kv"><span style={{ color: "var(--ink-2)" }}>Deleting removes the agent from the board</span><button type="button" className="ghost danger push" disabled={busy} onClick={() => onAskDelete(agent.id, agent.name)}><Trash2 size={14} />Delete</button></div>
    </div>
  </div>;
}
