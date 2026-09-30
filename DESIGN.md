---
name: Arova — The Workbench
description: A shift-board agent workspace where the organisation is the navigation, the thread gets real width, and the activity column only prints rows the server actually stored.
colors:
  paper: "#f4f7fa"
  sheet: "#ffffff"
  tint: "#eaf0f7"
  ink: "#1b2430"
  ink-2: "#5a6a7d"
  ink-3: "#5c6e82"
  rule: "#dfe6ee"
  rule-2: "#c9d5e2"
  azure: "#1d5dd0"
  azure-deep: "#143f92"
  azure-wash: "#e8f0fd"
  identity-line: "#c6daf9"
  ran: "#14684f"
  ran-wash: "#e6f2ec"
  ran-line: "#cfe4da"
  waiting: "#8a5208"
  waiting-wash: "#fbf0dd"
  waiting-line: "#eddcbf"
  fault: "#9b2720"
  fault-wash: "#fbeceb"
  fault-line: "#edcbc7"
  danger-line: "#f0d3d0"
  danger-line-hover: "#e4b9b4"
  slate: "#16202c"
  slate-2: "#202c3c"
  code-bar: "#1c2836"
  code-ink: "#e3ecf7"
  code-lang: "#8fa4bd"
  user-entry-wash: "rgba(234, 240, 247, .6)"
  thread-rule-ink: "rgba(27, 36, 48, .05)"
  margin-rule-azure: "rgba(29, 93, 208, .22)"
  field-ring-azure: "rgba(29, 93, 208, .13)"
  scrim-ink: "rgba(27, 36, 48, .34)"
  scrim-rail-ink: "rgba(27, 36, 48, .3)"
typography:
  display:
    fontFamily: "Manrope, 'DM Sans', sans-serif"
    fontSize: "27px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.022em"
  headline:
    fontFamily: "Manrope, 'DM Sans', sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.022em"
  title:
    fontFamily: "Manrope, 'DM Sans', sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.022em"
  body:
    fontFamily: "'DM Sans', ui-sans-serif, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  thread-text:
    fontFamily: "'DM Sans', ui-sans-serif, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "'DM Sans', ui-sans-serif, sans-serif"
    fontSize: "10.5px"
    fontWeight: 700
    letterSpacing: "0.08em"
  micro-label:
    fontFamily: "'DM Sans', ui-sans-serif, sans-serif"
    fontSize: "9.5px"
    fontWeight: 700
    letterSpacing: "0.07em"
  mono:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontWeight: 400
    letterSpacing: "-0.01em"
    fontFeature: "tabular-nums"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  pill: "99px"
components:
  button-primary:
    backgroundColor: "{colors.azure}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "7px 13px"
  button-primary-hover:
    backgroundColor: "{colors.azure-deep}"
  button-ghost:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "7px 12px"
  button-icon:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    size: "32px"
  button-send:
    backgroundColor: "{colors.azure}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    size: "34px"
  seat-node:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "9px 10px"
  seat-node-on:
    backgroundColor: "{colors.azure-wash}"
  pane-link:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "7px 8px"
  chip-state:
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  count-badge:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "1px 6px"
  composer-box:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "9px 10px 9px 13px"
  provenance-pill:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "1px 7px"
  dialog:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
    width: "468px"
  dialog-wide:
    backgroundColor: "{colors.sheet}"
    width: "620px"
---

# Design System: Arova — The Workbench

<!-- Derived by scan from src/app/globals.css (:root + rules), src/app/page.tsx, src/app/layout.tsx and src/lib/identity.ts, against direction contract seed 14aada6d ("The Workbench", mode operate). This file replaces "The Bench Notebook" (seed fa31e43a) wholesale: the taped evidence slips (.slip), the printed State Key (.key), the margin slip scroll-tie, and the flat agent tab list are DELETED from the code, not hidden, and none of their devices may be carried forward. -->

## Overview

**Creative North Star: "The Workbench"**

The screen is a shift board, not a notebook. Three columns do three different jobs: the left rail *is* the organisation — teams rendered as reporting trees of seat nodes, each carrying who it reports to, what its stored rows say it is doing, its message count and its last touch — the centre gives the selected seat's thread real width at an 80ch measure on ruled paper with the reply's provenance printed inline directly beneath it, and the right column is an activity board that behaves like a printer: In flight, Needs attention, Upcoming, Record — every row is a run, delegation, audit event or approval the server actually stored, or a live fact this client itself received over SSE. The category-default arrangement of a chat list beside a chat window beside a decorative evidence panel is refused; nothing in the right column is decorative.

The material world is unchanged and deliberate: cool paper (`paper`) under white sheets, ink text, hairline rules, and one azure (`azure`) doing all interactive work. What the Workbench adds is *identity*: each agent carries one of six cool hues (`src/lib/identity.ts`, applied through `--h-ink` / `--h-tile` / `--h-wash` / `--h-line`) that answers "which agent" and never "what is happening". Status colors (green/amber/red) are reserved for states a stored row produced, and seeded sample rows are force-greyed. Monospace is reserved for measurement. Depth is minimal: paper lies flat; only lifted things (dialogs, toasts, overlays, the open drawer, the active segmented pill) carry a shadow.

**Key Characteristics:**
- Three named zones: organisation-as-navigation (left), the thread at an 80ch measure with inline provenance (centre), the activity printer that only prints recorded rows (right).
- Identity hues mark *who*, semantics mark *state*, monospace marks *measurement* — three orthogonal systems that never bleed into each other.
- Cool paper under white sheets, hairline rules, one azure for interactivity; the identity hue extends the "you are here" wash per agent.
- The thread still sits on printed 28px rule lines with a faint azure margin spine; entries hang off it at 30px face tiles.
- State is provenance: the last real reply carries one printed line — state pill, provider, model, chars, estimated tokens, saved-at — expandable into a plain-language note of exactly what happened.
- Motion is one entrance settle (`rise`), one loop (the caret blink, shared by the streaming reply and the In-flight row), and 120ms press transitions, all clamped under `prefers-reduced-motion`.
- Radii only 6/8/10px plus pills; the only dark surface in the app is the code block.
- DM Sans body, Manrope headings, JetBrains Mono measurement — now self-hosted through `next/font/google`, not remotely imported.

## Colors

The palette is the `:root` custom properties of `globals.css` (normative): a cool monochrome paper stack, one azure for interactivity, three deep desaturated state inks with pale wash partners, a slate pair reserved for code, and an identity-hue family that lives in `src/lib/identity.ts` and arrives on elements as `--h-*` inline custom properties.

### Interactive
- **Workbench Azure** (`azure`, `{colors.azure}`): the default identity hue and the system interactive color — links, primary fills, selected faces, focus, carets, list markers, the field focus border. If it responds to you, it is azure (or your agent's hue wearing azure's role).
- **Deep Azure** (`azure-deep`, `{colors.azure-deep}`): hover/pressed partner; the fill of the routine dialog's mark tile; `.chip.azure` ink.
- **Azure Wash** (`azure-wash`, `{colors.azure-wash}`): the quiet "you are here" background — selected seat node, assistant face, `.consult` wash, the composer's focus ring.

### Identity hues (who, never status)
Six cool, low-chroma families in `identity.ts` — azure `#1d5dd0`, teal `#0d6a68/#0d7171`, indigo `#3a44a4`, cyan `#0a66a3/#0a6ba8`, navy `#16386e`, steel `#3f4a58/#55606e` — each a quad of ink/tile/wash/line. `hueFor()` hashes the agent id (FNV-1a, stable across processes and renders) and `hueVars()` stamps the quad onto elements as `--h-ink`, `--h-tile`, `--h-wash`, `--h-line`; one stylesheet rule serves every seat. They color the selected seat node's wash and face, the identity tile, the streaming caret, the In-flight row and its caret dot, the live focus ring, `.consult` heads, `.jump`, `.stop-btn` hover, `.org-row.on` and roster role ink. `:root` defaults the quad to azure so unscoped surfaces stay calm.

### State (reserved; never decorative)
Green/amber/red may only color a status a stored row produced, as computed by `toneOf(status, sample)` in `page.tsx` — where `sample === true` forces idle no matter what the row claims. Each state is an ink + wash + mid-tone line triple (`ran-line`, `waiting-line`, `fault-line`) so chips always border in the softened version of their ink.
- **Ran Green** (`ran` / `ran-wash` / `{colors.ran-line}`): COMPLETED/APPROVED rows, the active-seat dot, the "Model ready" foot pulse, ready provider chips.
- **Waiting Amber** (`waiting` / `waiting-wash` / `{colors.waiting-line}`): QUEUED/RUNNING/PENDING/WAITING_FOR_TOOL, due routines, partial/budget-reached entry tags, dormant-capability chips. Gated: seeded approvals produce no amber anything (`realPending`).
- **Fault Red** (`fault` / `fault-wash` / `{colors.fault-line}`): FAILED/CANCELLED/TIMED_OUT/REJECTED, provider-error entries, the danger ghost (`{colors.danger-line}` / `{colors.danger-line-hover}`), the delete dialog's mark.
- **Idle**: `rule-2` dots, `tint`/`ink-2` chips — the mandatory look for unconfigured things and for every seeded sample row, labelled "sample" in words.

### Neutral
- **Cool Paper** (`paper`, `{colors.paper}`): app background, thread surface, activity board ground, composer field fill.
- **Sheet White** (`sheet`, `{colors.sheet}`): raised surfaces — bench rail, bars, composer, dialogs, rows, provenance line.
- **Pale Tint** (`tint`, `{colors.tint}`): hover fills, idle chips, tile faces, segmented track, team-card head band.
- **Ink** (`ink`, `{colors.ink}`): body text. `ink-2` (`{colors.ink-2}`) is secondary text; `ink-3` (`{colors.ink-3}`) a near-identical third grade for labels, times and placeholders — treat `ink-2` as the workhorse.
- **Rule** (`rule`, `{colors.rule}`): the ubiquitous 1px hairline. **Rule-2** (`rule-2`, `{colors.rule-2}`): the stronger hairline for borders that matter (composer box, dialog frame, dashed provisional edges, idle dots).
- **Thread fabrics**: `thread-rule-ink` (the 1px line every 28px that rules the thread), `margin-rule-azure` (the vertical spine 26px into the sheet body), `user-entry-wash` (the soft band behind user entries).
- **Scrims**: `scrim-ink` behind dialogs, `scrim-rail-ink` behind the bench drawer and the activity overlay.

### Code surface
`slate` (`{colors.slate}`) is the only dark surface in the app, reserved for fenced model output: body `slate`, rules `slate-2` (`{colors.slate-2}`), bar `{colors.code-bar}`, text `{colors.code-ink}`, language tag `{colors.code-lang}`, plus one-off copy-button internals (#22303f/#2c3c4f/#3d5169/#9db2ca) recorded in the sidecar, not promoted.

### Derived one-offs (recorded, not canonized)
Selection #cfe0fb, scrollbar thumb #c3cfdd (#a8b9cc hover), user-entry text #24303f, fault-entry text #6f2019, the primary/ident button shadows rgba(20,63,146,.3)/.25, and the delete-dialog's inline fault-fill overrides are single-use literals deliberately outside the token system. If one is needed twice, promote it to `:root` first instead of scattering it.

### Named Rules
**The Who-Not-Status Rule.** An identity hue answers "which agent" and nothing else. It never means busy, waiting, or done; those words belong exclusively to ran/waiting/fault. Conversely a state color never decorates an interactive affordance.

**The Recorded-State Rule.** A color state is a claim about the server. If the server did not record it, the element wears idle neutral and the copy says what is true ("sample", "no key", "not connected"). `toneOf()`'s `sample` parameter forcing idle is the law; new surfaces must pass the flag, not hand-pick tones.

**The Printer Rule.** The activity board prints rows. Every one is a stored run, delegation, audit event or approval — or a live SSE fact this client actually received — newest first, timestamped in mono. The live layer never rewrites the record: a row moves from In flight into Record when the server has the row, and due schedules say so in words ("executes as this workspace is read").

**The No-Side-Accent Rule.** A card kind is signaled by a full wash (`.consult` on `--h-wash`, `.entry-user` on `user-entry-wash`), never by a colored border-left stripe. The 1px `rule-2` border-left of a markdown blockquote is a typographic quote rule, not an accent, and is the only left border in the system.

## Typography

**Display Font:** Manrope (with 'DM Sans', sans-serif) — headings, wordmark, identity-bar names.
**Body Font:** DM Sans (with ui-sans-serif) — all UI text at 14px/1.6.
**Label/Mono Font:** JetBrains Mono (with ui-monospace) — measurement only.

All three are self-hosted through `next/font/google` in `src/app/layout.tsx` and reach CSS as `--font-body`, `--font-display`, `--font-mono` (with `display: swap`). There is no remote Google `@import` any more; the literal family names in stacks are fallbacks only.

Character: Manrope's tight -0.022em headings give the board its confident printed-header voice; DM Sans stays calm in the thread; JetBrains Mono is the instrument readout. The split is enforced by selectors: `.num, time, .mono` automatically sets any `<time>` tag in mono with tabular figures, which is why every timestamp in every column aligns in columns.

### Hierarchy
- **Display** (Manrope 800, 27px base, lh 1.2, -0.022em): `h1`, stepped down to 22px in the identity bar, 20px in the sheet bar, 24px in pane heads. Contrast carried by weight, not scale jumps.
- **Headline** (Manrope 700, 18px): `h2`; 17px in dialogs and the thread empty-state; block titles in panes drop to 15px.
- **Title** (Manrope 700, 15px): `h3`; blank-state headings; a model's own `###` renders at 14px, `##` at 16px.
- **Body** (DM Sans 400, 14px, lh 1.6): UI default. Thread prose runs 15px/1.7 at the hard 80ch measure (`--measure`) — a reply is read, not scanned; the composer textarea matches at 15px/1.55.
- **Label** (DM Sans 700, 10–11px uppercase, tracking .05–.1em): group labels, board section heads, chips, entry tags, field labels, pane section heads (`pane-h2`). Small, wide, everywhere — the board's stamped voice.
- **Mono** (JetBrains Mono, 9.5–12.5px, tabular-nums, -0.01em): stamps, counts, char/token figures, model ids, fault detail, `kbd`, prov measurements, row times. The dense UI ladder between label and body remains 10.5/11/11.5/12/12.5/13/13.5px — new micro UI picks a step from it, it does not mint one.

### Named Rules
**The Measurement Rule.** Monospace means a number, a timestamp, an id, or a machine detail. Never set prose, a button label, or a heading in mono. If it isn't something you'd check with a ruler, it isn't mono.

**The Label Case Rule.** Micro-labels are uppercase with ≥.05em tracking at 9.5–11px; nothing else in the system is letter-spaced upward.

## Layout

Fixed three-column workbench grid, viewport-locked: `.workbench { grid-template-columns: var(--rail) minmax(0,1fr) var(--boardw) }` — 272px organisation rail, fluid centre, 336px activity board — at `height: 100dvh; overflow: hidden`, each column scrolling independently. No named spacing tokens exist; the observed rhythm is whole pixels clustered at 2 / 5–9 / 10–14 / 16 / 22–26 / 40 (`--gutter`), with the rail's search, list and pinned footer nav stacked under a bordered top bar.

**Left (bench):** the organisation as navigation. Teams render through `orgTree()` as depth-indented seat nodes (padding grows 14px per depth via `--depth`); each node is a 30px face tile, a name line with a state dot, paused marker, mono message count and relative last-touch time, and an ellipsised role line. Panes (Scheduler, Tools & MCP, Settings) are demoted to `.pane-link` rows in the pinned `.index-foot` under a hairline, with the workspace "Model ready / No model key" pulse beneath them.

**Centre (sheet):** bar (identity tile, name, role + reports-to chain in words, `.facts` pills for active/paused, model and message count, action ghosts) → scrollable body → composer. The thread caps at 1120px inside the fluid column, sits at `--measure: 80ch` padding, on 28px repeating rules with the azure margin spine 26px in. Day separators are label-plus-hairline rows. The `.prov` provenance line renders only under the last real reply (a message the gateway actually produced; seeded greetings don't qualify). Demoted panes reuse the column at max-width 980px. A `.jump` pill floats bottom-center only when the reader has scrolled up.

**Right (board):** uppercase section heads with mono counts; rows are `.bd-row` grids (status dot | bold label + note | mono stamp). Empty sections state their emptiness in words; `.board-foot` permanently prints the deployment truth ("No background worker: due work executes when this workspace is read") plus today's call budget.

**Responsive (exact breakpoints):**
- **≤1180px** — the board leaves the grid; `.only-narrow` controls switch on (menu, Activity button, overlay close); `show-activity` floats the board as a fixed right overlay (`min(372px, 92vw)`, lift shadow, z-58) over a scrim.
- **≤860px** — single column. The bench becomes a fixed 292px drawer sliding from the left (`.24s`, scrim z-55); `.only-wide` content hides (the ⌘K `kbd`, the composer's keyboard instruction); sheet bar reorders facts to their own line; thread/composer/pane paddings tighten to 16px; `.caps-row` and `.reach` stack.
- **`.only-narrow` / `.only-wide` convention** — the two visibility helpers, both decisive in `globals.css`. New chrome that exists in only one mode uses these classes, never a bespoke media query.

## Elevation & Depth

A paper stack, not a glass stack. Surfaces at rest are flat: separation comes from 1px hairlines and background swaps (paper → sheet → tint). Shadows are strictly structural — two diffuse, ink-tinted ambients that read as "this sheet is lifted off the board", never as glow.

### Shadow Vocabulary
- **Sheet shadow** (`--shadow-sheet`: `0 1px 2px rgba(27,36,48,.05), 0 8px 22px -14px rgba(27,36,48,.18)`): resting lift — the composer box and the active segmented pill.
- **Lift shadow** (`--shadow-lift`: `0 2px 4px rgba(27,36,48,.07), 0 16px 34px -18px rgba(27,36,48,.26)`): raised-over-page state — dialogs, toasts, the ≤1180px board overlay, the open ≤860px drawer, the jump pill.
- **Fill shadows:** the primary button (`0 1px 2px rgba(20,63,146,.3)`) and the 38px identity tile (`rgba(20,63,146,.25)`) carry a 2px tint under their azure-family fills only.

### Named Rules
**The Paper Stack Rule.** Depth is state, not hierarchy: a shadow appears when something is physically above the page (dialog open, overlay shown, drawer slid out, pill selected) and disappears when it settles back. Resting rows, nodes and thread entries are flat.

## Shapes

Gently practical, never razor, never blobby: exactly three radii — 6px (`--r-sm`: controls, tiles, chips'-host rows, fields, kbd, jump), 8px (`--r`: seat nodes, thread entries, rows containers, blocks, team cards) — 10px (`--r-lg`: dialogs, the composer box) — plus 99px pills reserved for chips, facts, counts, the jump and the provenance state pill. Faces are hairline-bordered squares at 30px (seat/entry tiles), 38px (identity tile), 28px (row faces), 27px (the brand `.mark`, the only solidly-filled one).

The recurring silhouette is the **seat node**: tile at left, a name line (dot, bold name, floating mono count, mono last-touch), an ellipsised role line — used identically in trees and flat bench lists, echoed by thread entries and `.bd-row`s. The second silhouette is **dashed means provisional**: proposal strips, muted sample counts, blank-state frames, the empty bench sheet, `.fact.none`, the prov-note divider. Solid means real and filed.

Borders are 1px `rule` by default; `rule-2` where the edge carries weight (composer box, dialog frame, drawer overlay). The composer is a *bordered field* — `rule-2` stroke, 10px corners, paper fill lifting to sheet with a 3px `--h-wash` ring on focus — the old ink-line composer is gone. The only dark shape is the code block (`slate` body, `slate-2` frame, its own header bar).

### Motion grammar
One entrance, one loop, everything else is state response. `rise` (9px up + .985 scale → rest, on `--ease` `cubic-bezier(.22,.68,.31,1)`) settles dialogs (.26s), toasts (.22s) and the jump pill (.2s); `fade` (.18s) brings scrims. The **only loop** is `blink` (1.05s steps) on the 2px `--h-ink` caret — the same animation drives the streaming reply's caret and the In-flight row's status dot, so "live" has exactly one visual verb. Press/hover transitions are 120ms; composer box and `.field` shifts are 140ms; the drawer is 240ms. Under `prefers-reduced-motion` all durations clamp to .01ms and the carets rest at 60% opacity — the live signal survives without blinking.

## Components

### Buttons
- **Shape:** gently squared (6px).
- **Primary:** azure fill, white 13px/600 label, `7px 13px`, 7px icon gap, 2px fill shadow; hover deepens to azure-deep, active presses 1px, both at .12s on `--ease`.
- **Ghost:** sheet white, 1px `rule` border, ink 13px/600; hover shifts border to `rule-2` and fill to tint. The default for everything that isn't the one action on a surface. `.danger` recolors text to `fault` with `{colors.danger-line}`, washing to fault-wash on hover.
- **Icon button:** 32px square, hairline border, `ink-2` glyph, same hover as ghost.
- **Send:** borderless 34px square filled with `--h-tile` (the selected agent's hue tile — azure by default); hover brightens 12%, active presses with `scale(.97)`.
- **Stop:** a small ghost (12px, `4px 10px`) whose hover takes the identity hue (`--h-ink` text, `--h-wash` fill); replaces Send while a reply streams, in both the composer box and the live entry head.

### Seat Node (signature, rail)
30px face tile (identity-washed, `--h-line` border; selected flips to sheet fill with `--h-ink` border), name 13.5px/700 with a 6px state dot (idle `rule-2`, or ran/waiting/fault — with a title explaining the word in plain language), a "paused" micro-marker, mono count and mono relative time floating right, role line beneath at 12px `ink-2`. Hover tints; selected fills `--h-wash`. Siblings separated by hairline top borders that vanish after a selected node. Depth shows as 14px-per-level padding, not connector lines.

### State Chips & Badges
Pill, uppercase 10.5px/700 label with a 5px dot at `currentColor`, wash background + tinted `*-line` border per state; `.idle` is tint/`ink-2` and is the mandatory look for sample rows (labelled "sample" in words, never "COMPLETED"). `.fact` pills (composer bar, sheet bar) are the calm sibling: 11.5px sentence-case, paper fill, hairline border; `live` swaps its dot to ran green. `.count` badges are mono 11px tint pills; `.count.muted` goes transparent with a dashed `rule-2` ring and the tooltip "seeded sample data, not a real run".

### Thread Entries (the ruled page)
30px face, head row (bold name — `--h-ink` for the assistant, `via {origin}` handoff note, mono time, right-floating state tag, hover-revealed tools), 15px/1.7 prose capped at 80ch. User entries sit on the `user-entry-wash` band with a 10px inset; assistant faces take the identity wash; fault entries sit in a fault-wash panel with a mono detail line. `RichText` re-typesets model markdown into React nodes (paragraphs, 16/14px headings, italic quotes on a 1px hairline, lists with `--h-ink` markers and tabular figures, `inline-code` chips, slate code blocks with a language tag and copy pill) — model text is never injected as HTML. Reasoning that arrived in the answer channel renders in the `.reasoning` fold: "+/−" marker, labelled "verbatim from {model}", opened and saying so when reasoning filled the row. Live states: pending echo ("sending"), streaming entry ("answering" / "reasoning" / "consulting" / "waiting") ending in the caret, with the Stop pill in its head and the `.consulting` wash line for peer hops inside the prose.

### Provenance Line (`.prov`, signature)
One `<details>` under the last real reply, capped at the measure: summary = the state pill (complete / partial / stopped by you / budget reached / reasoning only / not answered), provider, model id, then the right-floating mono measurement string ("N chars · N reasoning · N tokens (est.) · saved 7:39 PM") with a "+/−" affordance. Opening adds one dashed-ruled plain-language note stating exactly what happened ("The connection died mid-reply. What is here is what arrived; it was not replayed."). This replaces the margin's taped slip: the evidence is printed where the work is, not pinned beside it.

### Activity Board Rows (`.bd-row`, signature)
Grid: 7px status dot (or the caret-st for live rows) | bold 12.5px label over 11.5px `ink-2` note | mono stamp right. Sections In flight (`--h-wash` rows, caret dots), Needs attention (approvals carry inline Reject/Approve ghost+primary pairs; waiting runs and due routines explain themselves in words — "there is no worker on this server, so it stays waiting"), Upcoming, Record (newest-first merge of runs, today's delegations, filtered audit events, decided/sample approvals; sample rows wear the idle "sample" chip; rows open dialogs or seats only where a real record exists; capped at 24). `.board-foot` is the permanent deployment truth plus budget line.

### Consulted Hops & Handoffs (`.consult`)
Full identity wash (1px `--h-line` border, `--h-wash` fill — never a side stripe), head row with identity-hued arrow, "A consulted B" / "A handed this turn to B" at 11.5px, right-floating mono time, italic question, then the peer's recorded answer (folded reasoning first) or the honest fallback line "Their answer is recorded but was not kept for display." The card never silently disappears.

### Proposal Cards (`.team-card` + `.org-chart` / `.team-roster`)
An `org_proposal` prints a real reporting chart inside a solid sheet card: tint head band with the 27px azure mark, "N seats · nothing created yet · they would report to X", then `.org-row` tree rows indented 15px per depth with tick stubs, names, roles and mono descendant-count pills — disabled rows, because the seats do not exist. A `team_proposal` renders the flat `team-roster` (92px name column, identity-hued role, duty line). Foot: one promise sentence in words and the primary Create button. Dashed never stands in for the copy; the not-filed status lives in the words.

### Rows, Panes, Blocks, Segmented, Blank
Demoted panes list data in bordered `.rows` cards (12px 14px rows, 28px face, 13.5px bold title, ellipsised 12px sub, optional mono `row-when` line, right-side state/time or actions). `.pane-h2` stamps sections uppercase 11px with a right-floating mono count. Settings stack bordered `.block` cards with hairline `kv` rows and azure `.meter` bars for budget. Segmented controls: tint track, white raised pill (`--shadow-sheet`) when on. Blank states are dashed centered sheets — invitations, not success screens.

### Forms & the Composer
Fields: uppercase 11.5px labels, 1px `rule-2` bordered 6px-radius inputs on white; focus drops the outline for an azure border plus a 3px `field-ring-azure` ring. The composer box: `rule-2` stroke, 10px radius, paper fill lifting to sheet with a 3px `--h-wash` identity ring on `:focus-within`; auto-growing textarea (max 168px); Enter sends, Shift+Enter newlines; the bar beneath carries the model `.fact`, the boundary note ("no browser, files, or connectors"), and a right-aligned mono line that is *state-dependent*: an "N est. tokens" estimate while typing, "Stop keeps what has arrived" while a reply streams, and the keyboard instruction only when idle **and** wide.

### Dialogs & Toast
Scrim at 34% ink with a .18s fade; dialog 468px (`.wide` 620px) sheet, 10px radius, `rule-2` border, lift shadow, one `rise` settle (.26s). Head: 27px mark tile (azure; `azure-deep` for routines; `fault` for delete confirms), 17px Manrope title, X. Actions are full-width ghost+primary halves. Agent settings live in a dialog with Identity/Capabilities segmented tabs; the Capabilities editor is the boundary-lit surface — unavailable tools listed but disabled with the reason in words, dormant ones amber "no team", an active-tools summary line. Toasts are the same lifted sheet bottom-center, 5.2s auto-dismiss.

### Browser-Surface Theming
Selection is soft azure (#cfe0fb one-off) with ink text; input carets are azure; `:focus-visible` is a 2px outline in `--h-ink` (the *identity* hue, locally scoped) at 2px offset with 6px corners — the only outline in the system, never removed. Scrollbars are 11px with transparent track and a paper-outlined rounded thumb (#c3cfdd, #a8b9cc hover).

## Do's and Don'ts

### Do:
- **Do** treat `globals.css` `:root` as the single normative token source and `src/lib/identity.ts` as the single source of hues; new CSS references `var(--paper)` … `var(--ease)` and `var(--h-*)` inside agent-scoped subtrees.
- **Do** keep fonts on the `next/font` path (`--font-body` / `--font-display` / `--font-mono` from `layout.tsx`); never add a remote `@import`.
- **Do** reserve green/amber/red for statuses `toneOf()` produced from a real server row, always passing the `sample` flag; seeded rows render idle and say "sample".
- **Do** print only recorded rows in the activity board — or live SSE facts this client received — each with a mono stamp and words explaining what it means; the live layer never rewrites the record.
- **Do** use identity hues for "who": selection washes, faces, focus, carets, live rows, consult cards, list markers. A status question never gets a hue answer.
- **Do** print the reply's provenance as the one inline `.prov` line under the last real reply, with the honest note on open; never fabricate progress, replay stopped streams, or fill gaps ("Nothing was invented to fill the gap").
- **Do** render model text through `RichText` React nodes; reasoning arrives folded and labelled, never deleted; never inject model or user text as HTML.
- **Do** keep monospace to measurement (`<time>`, counts, char/token figures, model ids) — the `.num, time, .mono` selector already enforces it for timestamps.
- **Do** cap thread prose at the 80ch measure and let 28px rule lines, hairline dividers and the margin spine do the structural work instead of boxes.
- **Do** use 6/8/10px radii and 99px pills only; 1px `rule` hairlines for separation; dashed borders only for provisional/unfiled things; non-creation stated in words, not dashed styling.
- **Do** reuse `.only-narrow` / `.only-wide` for mode-specific chrome and the 1180px/860px collapse order (activity board → overlay, then bench → drawer).
- **Do** keep motion to the recorded vocabulary (one `rise` settle, one `blink` loop, 120ms press, 140ms field shift, 240ms drawer) on `var(--ease)`, inside the shipped `prefers-reduced-motion` clamp with carets resting at 60%.
- **Do** let copy state boundaries as content ("No background worker: due work executes when this workspace is read", "no browser, files, or connectors").

### Don't:
- **Don't** resurrect the discarded Bench Notebook devices: no taped evidence slips, no `.slip` cards, no printed `.key` state legend, no margin slip scroll-tie, no flat agent-tab index list, no ink-line composer. They are deleted from the code; a new surface must not quietly bring one back.
- **Don't** reintroduce the retired warm-ivory/violet world: paper stays cool (`#f4f7fa`) and the only warm hue is the reserved waiting state.
- **Don't** use state colors on interactive affordances or decorative dots, and don't use identity hues to mean status; each family answers exactly one question.
- **Don't** mark sample or unconfigured things with ran green, live badges, or optimistic counts; keep the `realPending` gate on every new alert surface.
- **Don't** signal a card kind with a colored border-left or any >1px side stripe; use the full wash (`.consult` on `--h-wash`). Side stripes are a detector AI tell this system refuses.
- **Don't** set prose, headings or button labels in JetBrains Mono, and don't use it as an aesthetic tech font.
- **Don't** add shadows beyond `--shadow-sheet` / `--shadow-lift` (plus the fixed azure-fill button tints), and don't shadow resting surfaces.
- **Don't** add radii outside 6/8/10px/pill, razor corners, glassmorphism, or a second dark surface — the code block owns `slate`.
- **Don't** add infinite animation beyond the caret blink (and its In-flight dot, which is literally the same keyframe), and don't animate anything not lifted, settled, or pressed.
- **Don't** mint off-token hexes; single-use literals stay single-use (see Derived one-offs). If one is needed twice, promote it to `:root` first.
- **Don't** let the composer's right-hand line be static: it is token estimate while typing, "Stop keeps what has arrived" while streaming, keyboard instruction only when idle and wide.
