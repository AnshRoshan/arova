import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { delegations, runs, runSteps, teams } from "@/db/schema";
import { estimateTokens, loadProfiles, readSseText, requestCompletion, resolveForAgent } from "@/lib/model-gateway";
import { allowsAction, normaliseCapabilities, resolveTools, tokenBudgetFor } from "@/lib/tools";
import { mentionConsult, parseTurn, resolvePeer } from "@/lib/orchestration";
import { budgetStopRow, noReportStopRow, summarisePost, summonCeiling } from "@/lib/channel";
import { splitReasoning } from "@/lib/markdown";
import { audit } from "@/lib/audit";
import { finishRun } from "@/lib/run-contract";
import { drizzleRunStore } from "@/lib/run-contract-drizzle";
import { dailyCallLimit, overQuota, recordUsage } from "@/lib/budget";
import { ensureAgentVersion } from "@/lib/versions-drizzle";
import { liveRuns } from "@/lib/routine-runner";
import { board } from "@/lib/board-payload";
import { callsToday, channelTurns, chatMessages, failureReply, maxDelegations, notifyChannels, peersOf, postToChannel, quotaReply, recallMemories, streamTimeoutMs, type ChatAgent, type Peer, type Reply } from "@/lib/board-core";
import { consultPeer, integrateMessages, routeDecision } from "@/lib/chat-runner";

/** A summons answers the question it was asked and does not run a chain of its own. */
const NO_SUB_CONSULT = Number.MAX_SAFE_INTEGER;

/** A run's summary line is printed as plain text on the board, so markup is dropped and a cut lands on a word. */
const plainLine = (text: string, limit = 280) => {
  const t = text.replace(/(\*\*|__|`)/g, "").replace(/\s+/g, " ").trim();
  return t.length <= limit ? t : `${t.slice(0, limit).replace(/\s\S*$/, "")}…`;
};

export type TeamRow = typeof teams.$inferSelect;

/**
 * A brief to an organisation's lead, streamed. This is what Feature 11 exists for: the
 * coordination becomes the record instead of a fold inside one reply. Every summons the lead makes
 * is posted as its own channel row, authored by that seat, with a `delegations` row pointing at
 * that post; the lead's report names the posts it built on. `MAX_DELEGATIONS` caps the summons and
 * the daily budget is re-checked before every call, because a brief that stops silently would read
 * as a team that finished.
 */
/**
 * Runs one brief to an organisation's lead to completion. `send` receives the frames and
 * `isClosed` is polled so a reader that went away still gets its partial stored; a trigger
 * passes a no-op sink and never-closed answer, and the same code path serves both.
 */
export async function runBrief(workspaceId: string, team: TeamRow, lead: ChatAgent, asked: string, send: (payload: Record<string, unknown>) => void, isClosed: () => boolean, initiator: "person" | "trigger" = "person", signal?: AbortSignal, idempotencyKey?: string): Promise<{ runId: string; status: string; summary: string }> {
  const NL = String.fromCharCode(10);
  const briefId = crypto.randomUUID();
  const leadVersionId = await ensureAgentVersion(lead);
  const [run] = await db.insert(runs).values({ workspaceId, agentId: lead.id, agentVersionId: leadVersionId, title: `Brief · ${team.name}`, status: "RUNNING", summary: asked.slice(0, 240), initiator, idempotencyKey, startedAt: new Date() })
    .onConflictDoNothing({ target: [runs.workspaceId, runs.idempotencyKey] }).returning();
  if (!run) {
    // A retry of the same inbound request: return the run already on record instead of buying it twice.
    const [existing] = await db.select().from(runs)
      .where(and(eq(runs.workspaceId, workspaceId), eq(runs.idempotencyKey, idempotencyKey ?? ""))).limit(1);
    return { runId: existing?.id ?? "", status: existing?.status ?? "UNKNOWN", summary: existing?.summary ?? "" };
  }
  liveRuns.add(run.id);
  const step = (title: string, detail = "") => db.insert(runSteps).values({ workspaceId, runId: run.id, title, detail });
  // What the caller is told when it is not a browser: a trigger needs an outcome to answer with.
  const outcome = { runId: run.id, status: "RUNNING" as string, summary: "" };
  const finishRunForBrief = async (status: string, summary: string) => {
    outcome.status = status;
    outcome.summary = summary;
    liveRuns.delete(run.id);
    // A stop that already landed owns the row; this pass may not relabel it.
    if (await finishRun(drizzleRunStore, run.id, status, summary) === "already-finished") {
      outcome.status = "CANCELLED";
      outcome.summary = "Cancelled by a person while the brief was in flight.";
      return;
    }
    void notifyChannels(workspaceId, team.id, { kind: "run", title: `Brief · ${team.name}`, status, summary, agentName: lead.name, teamName: team.name, runId: run.id });
  };
  const post = async (reply: Reply, author: { id: string; name: string }) => {
    const row = await postToChannel(workspaceId, team.id, "assistant", { ...reply, metadata: { ...reply.metadata, briefId, runId: run.id } }, author);
    send({ type: "post", post: row });
    return row;
  };
  const leadSeat = { id: lead.id, name: lead.name };
  // A reader who leaves is polled between steps and aborts any unary call already in flight.
  const stopped = () => isClosed() || Boolean(signal?.aborted);
  const summons: { peer: Peer; question: string; answer: string }[] = [];
  let routed = false;
  /** The reader's stop: what already landed stays, nothing new starts, and the channel says why. */
  const stopBrief = async () => {
    const gathered = summons.map(s => s.peer.name);
    const content = gathered.length
      ? `The brief was stopped before the report was written. ${gathered.length} teammate post${gathered.length === 1 ? "" : "s"} above (${gathered.join(", ")}) are what was gathered; no further seat was asked.`
      : routed
        ? "The brief was stopped before any teammate answered. No report was written."
        : "The brief was stopped before any seat was asked. No model call was made.";
    await post({ content, kind: "channel_gap", metadata: { stopped: true, summons: gathered } }, leadSeat);
    await step("Stopped by the reader", `${gathered.length} post(s) gathered`);
    await audit(workspaceId, lead.id, "brief.stopped", "Stopped by the reader; work already posted stays.");
    await finishRunForBrief("CANCELLED", "The reader stopped the brief.");
  };

  try {
    const profile = resolveForAgent(lead.provider, loadProfiles());
    send({ type: "start", provider: profile.name, label: profile.label, model: profile.model, runId: run.id, teamId: team.id });
    await step("Brief received", `${lead.name} leads ${team.name}`);
    if (profile.name === "local" || !profile.configured) {
      const reply: Reply = { content: `${profile.label} is selected for ${lead.name} but is not configured on this server, so the brief was not answered and no teammate was consulted. No model call was made.`, kind: "provider_error", metadata: { provider: profile.name, unconfigured: true } };
      await post(reply, leadSeat);
      await step("Not answered", "the lead has no usable provider");
      await finishRunForBrief("FAILED", "No provider was configured for the lead.");
      return outcome;
    }

    const caps = normaliseCapabilities(lead.capabilities);
    const peers = await peersOf(workspaceId, lead);
    const granted = resolveTools(caps, { hasTeam: peers.length > 0 });
    const consultPeers = granted.includes("consult_teammate") ? peers.filter(p => allowsAction(caps, "consult_teammate", p.id)) : [];
    // The channel's own history, so a second brief inherits the first one's posts, plus what
    // this org recorded: the record and the memory are different things and both are shown.
    const memory = await recallMemories(workspaceId, team.id, asked);
    const chat = chatMessages(lead, await channelTurns(workspaceId, team.id), profile, consultPeers, team.name, memory.block || undefined);
    const ceiling = summonCeiling({ envMax: maxDelegations(), seatMaxTurns: caps.maxTurns });
    let remaining = consultPeers;

    /** The row that admits the brief was cut short, then the stop. */
    const stopShort = async (unasked: Peer[]) => {
      const calls = await callsToday(workspaceId, profile.name);
      const row = budgetStopRow({ asked: summons.map(s => s.peer.name), unasked: unasked.map(p => p.name), calls, limit: dailyCallLimit() });
      if (row) await post(row, leadSeat);
      else await post(quotaReply(profile), leadSeat);
      await step("Stopped at the budget", `${calls} of ${dailyCallLimit() || "no"} calls used · ${unasked.length} seat(s) not asked`);
      await finishRunForBrief("WAITING_FOR_TOOL", `The daily model budget stopped the brief with ${unasked.length} seat(s) unasked.`);
    };
    /** The other kind of stop: the summons are done, and the report is what the budget refused. */
    const stopWithoutReport = async () => {
      const calls = await callsToday(workspaceId, profile.name);
      const row = routed || summons.length
        ? noReportStopRow({ author: lead.name, posted: summons.map(s => s.peer.name), calls, limit: dailyCallLimit() })
        : quotaReply(profile);
      await post(row, leadSeat);
      await step("Stopped before the report", `${calls} of ${dailyCallLimit() || "no"} calls used · ${summons.length} post(s) landed`);
      await finishRunForBrief("WAITING_FOR_TOOL", "The daily model budget stopped the brief before the report was written.");
    };

    if (stopped()) { await stopBrief(); return outcome; }

    for (let hop = 0; hop < ceiling && remaining.length; hop++) {
      if (stopped()) { await stopBrief(); return outcome; }
      if (await overQuota(workspaceId, profile)) { await stopShort(remaining); return outcome; }
      // A second pass sees what the first teammate already said, so it must earn a new name.
      const question = hop === 0 ? asked : `${asked}${NL}${NL}Already gathered from ${summons.map(s => s.peer.name).join(" and ")}: ${summons[summons.length - 1].answer.slice(0, 600)}${NL}Consult again only if another seat's judgement is genuinely still missing.`;
      routed = true;
      let decision = await routeDecision(question, remaining, profile, workspaceId, { consult: true, handoff: false, approval: false, build: false }, signal);
      if (decision.action === "none" && hop === 0) {
        const named = mentionConsult(asked, remaining, lead.id);
        if (named) decision = { action: "consult", agent: named.agent, question: named.question };
      }
      const peer = decision.action === "consult" && decision.question ? resolvePeer(decision.agent ?? "", remaining, lead.id) : null;
      if (!peer || !decision.question) break;
      const question2 = decision.question;
      const peerProfile = resolveForAgent(peer.provider, loadProfiles());
      if (await overQuota(workspaceId, peerProfile)) { await stopShort(remaining); return outcome; }
      if (stopped()) { await stopBrief(); return outcome; }
      send({ type: "consult", from: lead.name, to: peer.name, role: peer.role, question: question2 });
      await step(`${peer.name} asked`, question2.slice(0, 200));
      let answer = "";
      try {
        // A summons answers the question it was asked: it does not run a chain of its own, so
        // one brief stays inside the calls it planned no matter how the peer is configured.
        answer = await consultPeer(workspaceId, leadSeat, peer, question2, { depth: NO_SUB_CONSULT, visited: [lead.id, ...summons.map(s => s.peer.id), peer.id], send: () => {}, signal });
      } catch (error) {
        // A stop is not a gap in the org's answer, and it must not be stored as one.
        if (stopped()) { await stopBrief(); return outcome; }
        const why = error instanceof Error ? error.message : "the teammate call failed";
        await post({ content: `Asked ${peer.name}: ${question2}${NL}${peer.name} did not answer (${why}). Nothing from that seat is part of this report.`, kind: "channel_gap", metadata: { askedPeer: peer.name, failed: true } }, leadSeat);
        await step(`${peer.name} did not answer`, why.slice(0, 200));
        remaining = remaining.filter(p => p.id !== peer.id);
        continue;
      }
      const row = await post({ content: answer, kind: "channel_post", metadata: { question: question2, askedBy: lead.name, provider: peerProfile.name, model: peerProfile.model } }, { id: peer.id, name: peer.name });
      await db.insert(delegations).values({ workspaceId, messageId: row.id, fromAgentId: lead.id, toAgentId: peer.id, question: question2, answer, model: peerProfile.model, inputTokens: estimateTokens(question2), outputTokens: estimateTokens(answer) });
      summons.push({ peer, question: question2, answer });
      remaining = remaining.filter(p => p.id !== peer.id);
    }

    if (await overQuota(workspaceId, profile)) { await stopWithoutReport(); return outcome; }
    let messages = chat;
    for (const s of summons) messages = integrateMessages(messages, s.peer, s.question, s.answer);
    if (stopped()) { await stopBrief(); return outcome; }

    const response = await requestCompletion({ profile, messages, maxTokens: tokenBudgetFor(caps), stream: true, timeoutMs: streamTimeoutMs() });
    let answer = "", finish = "", usage: { input: number; output: number } | null = null;
    try {
      const streamed = await readSseText(response, text => send({ type: "delta", text }), isClosed);
      answer = streamed.text; finish = streamed.finish; usage = streamed.usage;
    } catch (error) {
      const reply = answer.trim()
        ? { content: answer.trim(), kind: "message", metadata: { provider: profile.name, model: profile.model, incomplete: true, detail: error instanceof Error ? error.message : "stream error" } }
        : failureReply(profile, error);
      await post(reply, leadSeat);
      await finishRunForBrief("FAILED", String(reply.metadata.detail ?? "The report did not complete.").slice(0, 240));
      return outcome;
    }
    if (isClosed() && answer.trim()) {
      await post({ content: answer.trim(), kind: "message", metadata: { provider: profile.name, model: profile.model, incomplete: true, stopped: true } }, leadSeat);
      await finishRunForBrief("CANCELLED", "The reader went away mid-report; what arrived is stored and marked partial.");
      return outcome;
    }
    const cleaned = parseTurn(answer.trim());
    const finalText = (cleaned.text || (cleaned.consult ? `I asked ${cleaned.consult.agent}: ${cleaned.consult.question}` : "")).trim();
    if (!finalText) throw new Error("Provider returned no text");
    // The report line names the posts it stands on, so the stored row is self-describing.
    const report = summarisePost({ author: lead.name, used: summons.map(s => s.peer.name) });
    const truncated = finish === "length";
    await recordUsage(workspaceId, profile.name, usage?.input ?? estimateTokens(messages.map(m => m.content).join("")), usage?.output ?? estimateTokens(finalText), Boolean(usage));
    await post({
      content: `${report.content}${NL}${NL}${finalText}`,
      kind: "channel_summary",
      metadata: { ...report.metadata, provider: profile.name, model: profile.model, ...(memory.provenance.count ? { memory: memory.provenance } : {}), ...(truncated ? { incomplete: true, truncated: true } : {}) },
    }, leadSeat);
    // The run's summary is printed on the activity board, so it carries the answer, never the
    // reasoning block a model wrapped around it.
    const said = splitReasoning(finalText).rest.trim();
    await step("Report posted", `${said.length} characters from ${profile.model}`);
    await finishRunForBrief("COMPLETED", said ? plainLine(said) : "The lead wrote reasoning and no answer followed. The channel keeps exactly what it produced.");
  } catch (error) {
    // The abort is the reader's own action, not a blank in the org's work to report as a failure.
    if (stopped()) { await stopBrief(); return outcome; }
    const why = error instanceof Error ? error.message : "unknown error";
    console.error("Org brief failed", team.name, why);
    try {
      await post({ content: `The brief to ${lead.name} did not complete (${why}). Anything that had already been posted is still in this channel.`, kind: "provider_error", metadata: { detail: why } }, leadSeat);
    } catch { /* the row cannot be written either; the run says it below */ }
    await finishRunForBrief("FAILED", why.slice(0, 280));
    send({ type: "error", error: why });
  }
  return outcome;
}

/** The same brief, streamed to a browser. A reader who leaves aborts the unary work in flight. */
export function streamBrief(workspaceId: string, team: TeamRow, lead: ChatAgent, asked: string, clientSignal?: AbortSignal) {
  const encoder = new TextEncoder();
  let closed = false;
  const stop = new AbortController();
  const leave = () => { closed = true; stop.abort(); };
  if (clientSignal) {
    if (clientSignal.aborted) leave();
    else clientSignal.addEventListener("abort", leave, { once: true });
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: Record<string, unknown>) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)); } catch { closed = true; }
      };
      void runBrief(workspaceId, team, lead, asked, send, () => closed, "person", stop.signal).catch(error => {
        console.error("Org brief crashed", team.name, error instanceof Error ? error.message : "unknown error");
      }).finally(async () => {
        try { send({ type: "end", board: await board(workspaceId) }); } catch { /* client already gone */ }
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() { leave(); },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
