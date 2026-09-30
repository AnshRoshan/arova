# Feature 06 — The reading surface

Goal: the shell must hold up when a real conversation runs through it. The previous round designed the
notebook against seeded one-line greetings; the live app now streams multi-paragraph answers with code,
and the surface shows it badly.

## Diagnosis (from a 1440×900 capture of the running app, `.impeccable/review/before-1440.png`)
1. **Three columns of dead space.** The thread is a centred 68ch band with ~420px of empty paper to its
   right; the index is empty below row four; the evidence margin pushes its legend to the bottom and gaps
   in the middle. Nothing on screen says "this is a working document".
2. **Model output is mangled.** `RichText` handles bold and lists only. A fenced code block, an inline
   `identifier`, a heading or a link from the model arrives as literal backticks and asterisks. This is a
   correctness failure, not a style gap: the reply is stored fine and displayed wrong.
3. **No agent identity.** Every avatar is the same azure tile, so a five-agent team reads as one grey
   list. Colour is doing no work anywhere on the screen.
4. **The header is a debug string**: "Creative partner · active · 1 message · Dahl · MiniMaxAI/MiniMax-M2.7".
5. **A reply in flight cannot be stopped.** The only control is a disabled input. Worse, the server would
   persist a cut-off answer as if it were complete (see Enforcement).
6. **The composer is an underline**, with the model, the estimate and the send action in three unrelated
   places around it.

## Changes
- **`src/lib/identity.ts`** — six cool, low-chroma identity hues, assigned deterministically from the agent
  id, exposed as CSS custom properties (`--h-ink/-tile/-wash/-line`) on whatever element carries the agent.
  Semantics (`--ran/--waiting/--fault`) stay reserved for real states; hue never encodes status.
- **`src/lib/markdown.ts`** — a pure block/inline parser: paragraphs, ordered/unordered lists, bold,
  emphasis, inline code, fenced code with language, ATX headings, thematic breaks, links restricted to
  `http:`/`https:`. An unterminated fence (a cut-off stream) still renders as code. Rendered to React nodes
  only — `dangerouslySetInnerHTML` stays banned.
- **Header** — identity tile + name + role, with the model, state and message count as separate chips.
- **Thread** — you and the agent are visually distinct; the measure is left-aligned to the margin spine so
  the page reads as a page; assistant rows carry a copy action; the live row shows partial output with a
  Stop control; a thread with no messages says so.
- **Composer** — one bordered field that takes the agent's hue on focus, with the model chip, the estimate
  and the send/stop control inside it.
- **Index** — agents grouped under their team name (real `teams` rows), hue tiles, and a footer that stops
  overlapping its own label.
- **Evidence margin** — slips flow from the top (no gap), and a new capability slip shows what the agent is
  actually granted. The state key becomes a compact footer line.

## Enforcement (server)
`streamText` returns normally when the reader goes away, so a stopped or disconnected reply was persisted
with no flag and rendered as a complete answer. Both streaming paths now check whether the reader closed
mid-answer and persist `{ incomplete: true, stopped: true }` instead.

## Value sources (nothing here is invented)
hue ← hash of `agents.id` · model chip ← `board.profiles` matched to `agent.provider` · counts ← rows
already in the board payload · capability slip ← `agents.capabilities` through `resolveTools` · team group
headers ← `board.teams` + `agents.teamId` · token meter ← `est(draft)`, labelled est. · copy/stop ← the
browser and the live request. No latency, no uptime, no avatars, no percentages.

## Out of scope
Message pagination, edit/delete of a sent message, reconnect/resume of a dropped stream, virtualised
thread rendering, dark theme, and any change to what the gateway sends upstream.
