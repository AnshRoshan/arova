# Feature 10 — Complete UI revamp (brief for the build session)

The user's standing instruction: **change the structure, not the tokens.** A colour and spacing
pass will be read as nothing having happened. Replace the control substrate — shell, navigation,
cards, lists, buttons, empty states — and delete what is replaced rather than restyling it.

## What the current shell is
"The Bench Notebook" (seed `fa31e43a`): three columns — ruled agent index, one thread on ruled
paper with an azure margin spine, taped evidence slips on the right. Cool paper, ink, hairline
rules, one azure, six agent identity hues, `'JetBrains Mono'` reserved for measurement.
Direction contract in `src/app/layout.tsx`; the built world is described in `DESIGN.md`.

## Honest diagnosis — why it reads as three columns of furniture
1. **The evidence margin is a third of the screen and is usually empty.** It carries provenance,
   agent config, run state and a legend, but at rest it shows two cards and a key.
2. **The thread is the product and it is the narrowest column.** 74ch inside a 940px max, left
   aligned, with the right half of the column empty.
3. **One flat list tries to hold everything**: agents, teams, the org chart, delegations, five
   panes collapsed into three nav items. The org tree and the agent list are the same rows twice.
4. **The header repeats the margin** (model, state, message count appear in both).
5. **Nothing on screen answers "what is happening right now"** — a scheduled run, an in-flight
   consult, and an idle workspace all look identical at a glance.
6. **Density is uneven**: the composer is generous, the index rows are cramped at 12px.

## Direction chosen: B — Workbench (user decision, 2026-09-30)

Build B. A and C are recorded below only so the reasoning that rejected them is not re-litigated.

**The shape to build.** Left column: the organisation as the primary object — the chart is the navigation, agents are nodes, a node shows its state and its reporting line. Centre: the selected seat's thread, given real width. Right: a live activity stream doing a real job — scheduled runs executing, consults in flight, approvals waiting, each one a row the server actually recorded. Nothing in the right column may be a legend or a static summary card.

## The directions considered
- **A. Thread-first, evidence on demand.** Two columns: a wide conversation and a rail that
  collapses to icons. Provenance attaches to the message it documents instead of living in a
  parallel column. The index becomes a switcher, not a page.
- **B. Workbench.** Left: organisation (the chart is the primary object, agents are nodes).
  Centre: the selected seat's thread. Right: a live activity stream — runs executing, consults in
  flight, approvals waiting. This makes the org feature the shape of the app instead of a sidebar
  section.
- **C. Command surface.** One palette (⌘K) as the primary navigation, a thin persistent status
  strip, and the thread filling everything else. Least like the current design, most work.

Recommend **B**: it is the only one that uses what the product can now actually do (orgs,
delegation chains, scheduled execution), and it removes the empty-column problem by giving the
right pane a live job.

## Constraints that must survive the rebuild
- **Never imply an action the server did not record.** Sample rows stay grey, partials say partial,
  stopped says stopped, budget-truncated says budget-truncated. This outranks visual consistency.
- Cool neutrals + one accent, semantics only for real states, radii 6–10px. Warm palettes and razor
  corners have been rejected.
- Every number on screen needs a source in the board payload. No invented stats, no filler metrics.
- Breakpoints 1180 / 860, `.only-narrow` / `.only-wide`. Motion: one entrance settle, one caret
  blink, `prefers-reduced-motion` respected.
- Model output renders through `src/lib/markdown.ts` into React nodes only. No
  `dangerouslySetInnerHTML`.

## Method for the build session
Run the `impeccable` skill end to end (context → concept seed → build in code, never an image
comp → detector → finish reviewer in a fresh context → DESIGN.md rewrite). Verify in a real
browser at 1440×900 and 390×844 with a live streamed reply, not from the CSS. Note the tooling
traps already recorded: agent-browser leaks a Chrome per session, and the in-app browser exposes
no screenshot surface.

## Files that will change
`src/app/page.tsx` (the whole shell), `src/app/globals.css`, `src/app/layout.tsx` (direction
contract), `DESIGN.md`, `.impeccable/design.json`, `context/ui-registry.md`, `context/ui-rules.md`,
`context/ui-tokens.md`.

## Status: built and verified (2026-09-30)
Direction B shipped as "The Workbench" (seed `14aada6d`, contract in `src/app/layout.tsx`). All six faults were addressed structurally: the evidence margin is deleted and its provenance job now prints inline under the reply it documents; the thread is the widest column at an 80ch measure; the organisation tree replaced the flat list; the header no longer repeats the margin (and the rail footer lost its provider chip so the model is named twice per screen, not three); the right column is a four-section printer with a real job; index density rose to the seat-node rhythm.

Method discharged end to end: concept seed run (`--scope direction --mode operate`, key `14aada6d`; the user-pinned direction beat the roll per the standing rule), built in code with no image comp, detector run once (17 advisory findings, all drift against the then-stale sidecar), finish review in a fresh context across four rounds ending `ship` (scoped), DESIGN.md rewritten from the built world with the sidecar regenerated, and verification in a real browser at 1440x900 and 390x844 with a live streamed reply.

What the brief's own tooling warnings cost, recorded so the next session does not repeat it: `agent-browser` was unusable (daemon dropped between calls, leaked Chrome processes); the replacement is `.impeccable/cdp-harness.cjs`. Two review rounds were spent on invalid evidence — a stale frame passed as fresh, and the Next dev-tools badge painted into every capture.
