---
name: Arova — The Midnight Edition
description: An agent workbench where graphite surfaces step toward the reader, a midnight light layer carries the depth, one azure family does the interactive work, and each room owns one hue on the rail and across its stage.
colors:
  void: "#07080d"
  sunken: "#0a0c13"
  panel: "#0c0e15"
  sheet: "#0f111a"
  card: "#151824"
  raised: "#1e2232"
  ink: "#eef0f8"
  ink-2: "#a8aec6"
  ink-3: "#8b92ad"
  rule: "#222638"
  rule-2: "#343a55"
  azure: "#8b9bff"
  azure-bright: "#b4beff"
  azure-wash: "#1b2147"
  azure-line: "#323c82"
  on-azure: "#0a0d28"
  # The accent's fill expression: one indigo→violet gradient, dark glyph on top.
  grad: "linear-gradient(135deg, #7e8fff 0%, #a187ff 60%, #c78bff 100%)"
  grad-stop-a: "#7e8fff"
  grad-stop-b: "#a187ff"
  grad-stop-c: "#c78bff"
  grad-soft: "linear-gradient(135deg, rgba(126, 143, 255, .16), rgba(199, 139, 255, .10))"
  # Light-layer channels: every glow, hairline and aurora mixes from these six
  # space-separated RGB triplets — never from a hardcoded rgba() of the same family.
  azure-rgb: "139 155 255"
  indigo-rgb: "126 143 255"
  violet-rgb: "199 139 255"
  ran-rgb: "95 206 155"
  waiting-rgb: "232 178 92"
  fault-rgb: "244 140 171"
  ran: "#5fce9b"
  ran-wash: "#1d3227"
  ran-line: "#2f5a44"
  waiting: "#e8b25c"
  waiting-wash: "#33291a"
  waiting-line: "#5c4626"
  on-waiting: "#17140d"
  fault: "#f48cab"
  fault-wash: "#35202a"
  fault-line: "#5f3243"
  on-fault: "#2a0f16"
  ink-strong: "#f5f7f9"
  fault-text: "#ffdbe4"
  user-text: "#e3e7f7"
  scroll-thumb: "#2a3050"
  scroll-thumb-hover: "#3d4672"
  code-bg: "#080a10"
  code-line: "#1f2335"
  code-text: "#dfe6ee"
  code-lang: "#7f8b99"
  code-bar: "#0c0e16"
  hue-sage: "#a8d98a"
  hue-aqua: "#70d2db"
  hue-mauve: "#c4a3dd"
  sec-overview: "#8b9bff"
  sec-agents: "#a8d98a"
  sec-org: "#70d2db"
  sec-scheduler: "#e6b455"
  sec-tools: "#b78ff2"
  sec-settings: "#f08cb8"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-.022em"
  body:
    fontFamily: "DM Sans, ui-sans-serif, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  reading:
    fontFamily: "DM Sans, ui-sans-serif, sans-serif"
    fontSize: "15px"
    lineHeight: 1.7
  label:
    fontFamily: "DM Sans, ui-sans-serif, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: ".08em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "10.5px"
    lineHeight: 1.62
    letterSpacing: "-.01em"
  # The enumerated ramp the built world actually uses. `chrome` is the half-stepped
  # ladder a 276px panel and a 320px board are set in; the named roles above are prose.
  scale:
    chrome-9: "9px"
    chrome-95: "9.5px"
    chrome-10: "10px"
    chrome-105: "10.5px"
    chrome-11: "11px"
    chrome-115: "11.5px"
    chrome-12: "12px"
    chrome-125: "12.5px"
    chrome-13: "13px"
    chrome-135: "13.5px"
    body: "14px"
    reading: "15px"
    card-title: "16px"
    dialog: "17px"
    h2: "18px"
    surface-bar: "19px"
    bar: "20px"
    identity-bar: "22px"
    pane-head: "24px"
    h1: "26px"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "99px"
  # The one-off ladder the built world uses beyond the tokens, enumerated the way
  # typography.scale is: a radius on this ladder is not drift.
  ladder:
    tab: "9px"
    control: "10px"
    row: "11px"
    track: "12px"
    rail: "13px"
    panel: "14px"
    card: "16px"
    sheet: "18px"
    dialog: "20px"
    hero: "24px"
spacing:
  gutter: "40px"
components:
  button-primary:
    background: "{colors.grad}"
    textColor: "{colors.on-azure}"
    rounded: "{rounded.control}"
    padding: "7px 13px"
  button-primary-hover:
    effect: "brightness(1.1) + translateY(-1px), shadow deepens"
  button-ghost:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
  button-ghost-hover:
    backgroundColor: "azure wash (rgb(var(--azure-rgb) / .12))"
    borderColor: "{colors.azure-line}"
  button-danger:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.fault}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
  button-danger-hover:
    backgroundColor: "{colors.fault-wash}"
    textColor: "{colors.fault}"
  send-button:
    backgroundColor: "the active seat's identity tile (--h-tile)"
    textColor: "that tint's dark glyph (--h-glyph)"
    rounded: "{rounded.sm}"
    size: "34px"
  input:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "12px 14px"
    elevation: "var(--edge) + var(--lift)"
  agent-card:
    backgroundColor: "linear-gradient(165deg, rgba(27,31,48,.92), rgba(16,19,30,.94))"
    rounded: "{rounded.card}"
    padding: "15px"
    width: "216px"
  chip-ran:
    backgroundColor: "{colors.ran-wash}"
    textColor: "{colors.ran}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  chip-waiting:
    backgroundColor: "{colors.waiting-wash}"
    textColor: "{colors.waiting}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  chip-fault:
    backgroundColor: "{colors.fault-wash}"
    textColor: "{colors.fault}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  chip-azure:
    backgroundColor: "{colors.azure-wash}"
    textColor: "{colors.azure-bright}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  code-block:
    backgroundColor: "{colors.code-bg}"
    textColor: "{colors.code-text}"
    rounded: "{rounded.track}"
---

# Design System: Arova — The Midnight Edition

## Overview

**Creative North Star: "The Instrument Panel, after dark"**

Arova is not a dashboard wearing a dark theme; it is an instrument bench. A permanent icon rail owns navigation at the far left, a contextual section panel owns the list you are working through beside it, the fluid work surface carries the single title of whatever you opened — one seat's thread, or one organisation's channel — and the activity board — summoned from the rail, closed by default — is a printer that only emits rows the server actually stored. The world is graphite: neutral surfaces step toward the reader and ink stays neutral. Colour is rationed to four jobs — one azure family for interaction, green/amber/red for a stored state, a fixed set of identity tints for *which agent*, and one hue per room for *where you are*. Depth is carried by a midnight light layer — aurora, glass, gradient, edge and lift — that sits on top of the graphite steps without replacing them. Nothing implies work that did not happen.

Density is the aesthetic. This is a working tool read every day by one operator who wants to continue, not tour. The surfaces are dark and close together; hairlines and surface steps do the structural work, and the light layer adds atmosphere without adding furniture. The identity tints are led by the avatar glyph, not the hue — the hue is a secondary marker precisely because there are only three and they cannot carry the whole identity load.

**Key Characteristics:**
- Six graphite surfaces (void → raised) that step toward the reader; the light layer adds depth on top of the steps rather than replacing them.
- One cool azure does all interactive work, expressed as a flat fill (with a dark glyph), its tint family (wash/line), or the indigo→violet gradient on primary fills; nothing else on the bench goes blue to mean "clickable".
- Each of the six rooms owns one hue on the rail and breathes it into the stage aurora, so the rail reads as a colour bar and the room you are in tints the light behind your work.
- Green/amber/red exist only where a stored row produced them; a sample row wears idle grey, never the green of a real run.
- Exactly three identity tints (sage/aqua/mauve), each proven 30° clear of the accent and of every state colour — and proven *against the live stylesheet*, because `identity.test.ts` parses `globals.css` for the values it measures.
- DM Sans body, Manrope headings, JetBrains Mono reserved strictly for measurement.
- Four fixed columns at wide (68 · 276 · fluid · 320), collapsing through two breakpoints; no section repeats the title of another.
- Every row belongs to exactly one subject — a seat's thread or an organisation's channel — and a channel post always names the seat that wrote it, in that seat's tile and tint.

## Colors

The palette is graphite plus rationed colour. Surfaces are neutral, text is neutral, and chroma appears only for interaction, stored state, or agent identity — never for decoration.

### Surfaces (the graphite ramp, darkest → lightest)
- **Void** (`#07080d`): the permanent icon rail and the page ground behind the stage — the darkest thing on screen.
- **Sunken** (`#0a0c13`): inputs and recessed wells; deliberately darker than the working ground.
- **Panel** (`#0c0e15`): the section panel and the activity board.
- **Sheet** (`#0f111a`): the working ground behind a thread or pane.
- **Card** (`#151824`): raised content — thread rows, cards, lists, bars.
- **Raised** (`#1e2232`): hover, selected, the tab track — the lightest resting surface.

The ramp is deliberately tight (it lives between `#06` and `#1e`); separation is carried by hairlines and the light layer, not by large luminance jumps.

### Text
- **Ink** (`#eef0f8`): primary text.
- **Ink-2** (`#a8aec6`): secondary text.
- **Ink-3** (`#8b92ad`): tertiary/metadata, tuned to clear 4.5:1 on **Raised** — the lightest surface tertiary text lands on. `identity.test.ts` measures this against the live `:root`, so a palette swap that breaks it fails the gate.

### Hairlines & borders
- **Rule** (`#222638`): default 1px divider.
- **Rule-2** (`#343a55`): stronger border (icon buttons, chips, inputs at rest).

### Accent (interaction — the only one)
- **Azure** (`#8b9bff`): every interactive affordance — links, focus ring, caret, selected washes, meters.
- **Azure-bright** (`#b4beff`): hover on an azure surface, and the focus outline.
- **Azure-wash** (`#1b2147`) and **Azure-line** (`#323c82`): azure's own dark-ground tint family.
- **On-azure** (`#0a0d28`): the dark glyph/text on any azure or gradient fill. A light accent on a dark ground cannot carry white text — every light fill takes this.
- **The gradient** (`--grad`: `#7e8fff` → `#a187ff` → `#c78bff` at 135°) is the accent's *fill expression*: primary buttons, the rail logo, active tab marks, meters, welcome numerals. `--grad-soft` is its 10–16% wash for selected grounds. A gradient fill always takes the dark `on-azure` glyph.
- **Channels** (`--azure-rgb` / `--indigo-rgb` / `--violet-rgb` and the state triplets below): space-separated RGB triplets that every glow, hairline, focus ring and aurora mixes from — `rgb(var(--azure-rgb) / .12)`, `color-mix(in srgb, var(--sec) 18%, …)`. No rule in the light layer may carry a hardcoded `rgba()` of these families; the 2026-10-06 pass retired 40+ literals into these six tokens so a retint is one line.

### State semantics (produced only by a stored row)
- **Ran** (`#5fce9b`, wash `#1d3227` / line `#2f5a44`, channel `--ran-rgb`): completed / approved.
- **Waiting** (`#e8b25c`, wash `#33291a` / line `#5c4626`, channel `--waiting-rgb`): queued, running, pending, due.
- **Fault** (`#f48cab`, wash `#35202a` / line `#5f3243` / on-fault `#2a0f16`, channel `--fault-rgb`): failed, cancelled, rejected, provider error. The one place a state colour fills a button is the destructive confirmation (`.primary.solid-fault`), which takes a dark glyph like every other light fill; its hover inverts to `fault-line` + `fault` rather than inventing a sixth pink.

Each state also carries its channel triplet, so a state dot glows faintly with its *own* colour (board rows, panel dots, seat nodes, live pulses). The glow never appears on a row that did not produce the state.

### Identity tints (which agent, never a status)
Three fully-specified hues live in `src/lib/identity.ts`, each an `ink`/`tile`/`glyph`/`wash`/`line` set applied as inline custom properties (`--h-*`) so one stylesheet rule serves every agent:
- **Sage** (`#a8d98a` ink), **Aqua** (`#70d2db` ink), **Mauve** (`#c4a3dd` ink). Each tile takes a **dark** glyph (sage `#2c372a`, aqua `#21363a`, mauve `#322d3b`) — never white.

### Room colours (where you are)
Six hues (`SECTION_COLORS` in `src/lib/identity.ts`, exposed as `--sec` on the workbench and each rail button): Overview `#8b9bff` · Agents `#a8d98a` · Organisation `#70d2db` · Automations `#e6b455` · Integrations `#b78ff2` · Settings `#f08cb8`. They paint the room's chrome and, since 2026-10-06, the primary stage aurora (see the Room-Colour Rule).

### Code well
- **Code-bg** (`#080a10`): the only recessed dark surface other than the rail; model output reads as an artifact. Family: **code-line** `#1f2335`, **code-text** `#dfe6ee`, **code-lang** `#7f8b99`, **code-bar** `#0c0e16` (with a faint inset azure edge).

### The light layer (what the Midnight pass added)
Named tokens and the single surface each may touch:
- `--grad` / `--grad-soft`: fills that mean "press me" or "this is selected". Never a whole pane.
- `--glow`: the rail logo tile only.
- `--edge`: the 1px inset top highlight on raised cards (`.rows`, `.block`, `.pulse-strip`, `.agent-card`, `.reasoning`, `.prov`, `.memory-panel`, `.dialog`, the control-room cards).
- `--lift`: the soft downward shadow under those same raised cards. Still *not* `--shadow-lift`: a resting card lifts a little; only a layer that leaves the grid gets the full treatment.
- `--dur` (`.22s`): the shared transition duration for the layer.
- **Aurora**: three radial gradients behind `.workbench` — the primary tinted with the open room's `--sec`, a secondary violet, a faint teal fill. They sit behind everything, never move content, and are the only place room colour reaches the work surface.

### Single-use surface steps (deliberate one-offs, kept out of `:root`)
These exist for one specific job. **Rule: a second use promotes the value into `:root`.**
- Text steps: `#e3e7f7` (user entry body), `#ffdbe4` (fault entry body), `#f5f7f9` (rich-text `<strong>`), `#cdd4ff` (active rail label), `#d5dbff` (active tab label), `#c6cdf5` / `#bfc8ff` (gradient-text ends on `h1` / welcome `h2`).
- Surface steps: `#1a1e2c` (node and board-row hairline), `#171b2a` (rail status hover), `#232842` (team-card head), `#181c2c` / `#121523` (dialog gradient ends), `#090a10` / `#06070b` (rail gradient ends), `#0c0e16` (code bar).
- **Cleanup owed (recorded 2026-10-06, not silently done):** the base layer still declares roughly ten hover/selection/scroll steps the light layer overrides — `.rail-btn:hover`, `.sp-item:hover`, `.node:hover`, `.bd-row:hover`, `.row:hover`, `.ghost:hover`, `.entry-user`, `.agent-card:hover`, `::selection`, the scrollbar thumbs. Delete each only after a capture proves it is dead.

### Named Rules
**The One Voice Rule.** Azure is the only interaction colour. It appears as a flat fill (with a dark glyph), as its tint family (wash/line), or as the accent gradient — nothing else on the bench goes blue to mean "clickable".
**The Dark-Glyph Rule.** A light accent, gradient or identity tint on a dark ground cannot carry white text. Every azure/gradient fill and every identity tile takes a dark glyph (`--on-azure`, or the tint's own dark `glyph`). `identity.test.ts` asserts a tile is never given a white glyph.
**The Stored-Row Rule.** Green, amber and red are only ever produced by a stored row. A seeded sample wears **idle** grey (`raised` + `ink-2`); a fabricated success state is a defect, not a colour. State glows inherit this rule exactly.
**The Three-Mark Rule.** Identity is exactly three tints (sage/aqua/mauve). This is a measured ceiling, not taste: with azure owning interaction and green/amber/red owning state, the cool half of the wheel has room for three marks at 30° of separation, so identity is led by the avatar glyph and the tint is secondary. **Adding a fourth hue requires changing the accent or the semantics first** — and the test now measures the *live* palette: it parses `src/app/globals.css` for the surface, accent and state hexes and asserts the stylesheet declares them, so a palette change fails the separation/contrast arithmetic until it is re-checked deliberately.

**The Room-Colour Rule** *(extended 2026-10-06)*. The multicolour budget is spent on *where you are*, not on *who* or *what happened*. Each of the six rooms owns one hue, and it paints exactly the room's chrome: the active rail mark and its wash, the section panel's title, item icons, tabs and right hairline, the pane headings, the sheet-bar hairline, and the primary stage aurora behind the workbench. Room hues may reuse identity and state hues (Automations is amber, Agents is sage) because a rail mark or an aurora is never read as a status dot — position and treatment disambiguate what the wheel cannot. Two hues exist only as room paint: violet for Integrations and rose for Settings; rose never appears as a state, and amber-as-state still means only a stored waiting row. **Azure remains the interactive colour inside every room**: buttons, links, focus and selection do not change hue with the section.

**The Depth-from-Light Rule** *(2026-10-06, replaces Flat-by-Default)*. Surfaces are flat graphite steps at rest; structural elevation is still a surface step plus a hairline. On top of that the light layer may add an inset edge (`--edge`), a soft lift (`--lift`), a glass blur, an accent gradient, or a state/room glow — but a glow marks interaction or a live/stored state, a gradient marks a primary action or a selection, and `--shadow-lift` still belongs only to layers that leave the grid (dialog, toast, jump pill, overlay drawers). Depth from light is not permission to make resting cards pop.

## Typography

**Display Font:** Manrope (`--font-display`), self-hosted through `next/font`.
**Body Font:** DM Sans (`--font-body`), self-hosted through `next/font`.
**Label/Mono Font:** JetBrains Mono (`--font-mono`), self-hosted through `next/font`.

**Character:** Manrope's tight, geometric headings give the rail and bars a technical poise; DM Sans stays neutral and workmanlike at 14px/1.6 for dense reading. JetBrains Mono is a measuring instrument, not a voice.

### Hierarchy
- **Display / headings** (Manrope 700–800, `-.022em`, line-height 1.2): `h1` 26px, `h2` 18px, `h3` 15px at rest; the surface bar tightens to 20px (22px on the section page-heading), the identity bar to 22px, a pane head to 24px, the control-room hero to 30px and the welcome hero to 34px; the editable org name carries the full 26px/800. A dialog title is 17px, a card heading 16px.
- **Body** (DM Sans 400, 14px/1.6): chrome, labels, list rows.
- **Reading** (DM Sans, 15px/1.7, max-width `80ch` via `--measure`): thread message text, channel posts and composer input.
- **Label** (DM Sans 700, ~11px, `.08em`, uppercase): group labels, section headings inside panes, chips — the only uppercase device, and it is never a kicker placed *above* a heading.
- **Mono** (JetBrains Mono, tabular-nums, `-.01em`): numbers, token counts, timestamps, model ids, code, schedule lines.
- **The chrome ladder** (13.5 → 9px, half-stepped: 13.5, 13, 12.5, 12, 11.5, 11, 10.5, 10, 9.5, 9): the working text of a 276px panel and a 320px board. It is half-stepped deliberately — one full pixel is the difference between a row that holds its two-line label and one that wraps. A new size outside this ladder and the prose steps above is drift; a new size *on* it is not.

### Named Rules
**The Monospace-Means-Measurement Rule.** JetBrains Mono marks only measured data — a count, a time, a token figure, a language tag. It never sets prose. `.num`, `time`, `.mono` exist for this and nothing else.

## Layout

The bench is a grid defined once as `.workbench`: `64px` icon rail · `244px` section panel · `minmax(0,1fr)` fluid work surface, at `100dvh` with internal scroll. A fourth `300px` activity column exists only while `show-activity` is set (the rail's Activity button), because the record is summoned, not parked. The section panel can collapse to `0` (`panel-closed`). For Integrations the panel is a five-item surface index, never a second copy of the page.

- **Breakpoint 1250px:** the activity board leaves the grid and becomes a right-side overlay drawer (`min(372px,92vw)`, `--shadow-lift`); `.only-narrow` affordances appear.
- **Breakpoint 860px:** the section panel becomes a full-width step (rail narrows to `60px`, `--gutter` tightens to 18px); the panel slides in as an overlay (`mpanel`); `.sheet-bar` compresses and `.facts` wrap to a third row. `.only-mobile` appears, `.only-wide` hides.
- **600px:** agent grid and org stats drop to two columns; the create button collapses to a bare icon.

Visibility helpers are exactly three: `.only-narrow`, `.only-wide`, `.only-mobile`. Rhythm uses `--gutter` (40px, tightening to 18px on mobile) as the sheet's horizontal step and `--measure` (80ch) as the reading column. Thread maxes at 1120px; panes at 1020px.

**The Naming Rule.** The section panel is titled by **what it holds** (Shortcuts, The bench, Routines) while the work surface carries the **section title** (Overview, Organisation, Automations, Integrations, Settings, or the agent's name). Neither repeats the other; a heading is never duplicated in two columns.

## Elevation & Depth

Depth is carried by three registers, in order of how often they appear:

1. **The surface step** (always): the graphite ramp plus 1px hairlines (`--rule`, `--rule-2`). This still does the structural work — which column is which, which row is selected.
2. **The light layer** (routinely): the aurora behind the stage, glass (`backdrop-filter`) on the sheet-bar / board-foot / composer, `--edge` + `--lift` on raised cards, `--grad` fills on primary controls, and state/room glows on live elements.
3. **`--shadow-lift`** (only when a layer floats): the dialog, the toast, the jump pill, and the two overlay drawers (activity board, mobile section panel).

### Shadow Vocabulary
- **Lift** (`--lift`): resting raised cards — `0 1px 2px rgba(0,0,0,.35), 0 10px 30px -12px rgba(0,0,0,.6)`.
- **Edge** (`--edge`): the 1px inset top highlight that reads as a bevel on those same cards.
- **Glow** (`--glow`): the rail logo tile only.
- **Float** (`--shadow-lift`): floating layers only — `0 30px 80px rgba(2,3,12,.7)` plus a 1px azure ring.

### Named Rules
**The Depth-from-Light Rule.** See Colors → Named Rules. Resting surfaces may carry `--edge` and `--lift`; a glow marks interaction or a live/stored state; `--shadow-lift` appears only where a layer leaves the grid, and a shadow is never used to make a static card "pop".

## Shapes

Form is restrained and mechanical. Radii are three tokens plus pills — `--r-sm` 4px (tiles, small chips, tab buttons), `--r` 7px (rows, cards, tabs track, buttons, inputs), `--r-lg` 10px (large panels), `99px` pills (chips, meters, badges, `fact`, `org-count`) — with a four-step chrome ladder: 7 (controls, inputs), 8 (rows, cards, agent tiles), 9 (rail buttons, rail logo), 10 (composer, large cards), 12 (dialog, control-room hero, welcome). The 2026-10-28 redesign sharpened the ladder from 8/12/16 and removed the old 11–18px middle so surfaces read as cut rather than pillowed. Borders are 1px hairlines; there are no heavy outlines and no decorative clipping. Tiles (30px seat nodes, 38px identity/avatar) are the recurring silhouette, and the active seat gets a 3px edge tab that bleeds from the rail (`rail-btn.on::before`). The code well (`--code-bg`) is the only deliberately recessed dark surface other than the rail.

## Components

### Buttons
- **Primary** (`.primary`): the accent gradient, dark `on-azure` label, 700 weight, 7px radius, padding `7px 13px`; hover brightens via `filter` and lifts 1px with a deeper shadow, active presses 1px, transition 120–220ms on `--dur`.
- **Destructive confirmation** (`.primary.solid-fault`): the one primary that takes the `fault` fill with a dark glyph; hover inverts to `fault-line` + `fault`.
- **Ghost** (`.ghost`): sheet background, `rule-2` border, ink text; hover fills with a faint azure wash, lifts the border to `azure-line`, and raises 1px. `.ghost.on` takes the `grad-soft` selected treatment.
- **Danger** (`.danger`): a ghost that takes **fault** text and `fault-line` border; hover fills `fault-wash`. Danger stays a *ghost* — it is not a filled red button.
- **Icon button** (`.icon-btn`): 32px square, azure-wash ground, `rule-2` border; hover deepens the wash.
- **Send** (`.send`): 34px square tinted with the active agent's identity tile, dark identity glyph; hover brightens via `filter: brightness(1.12)`.
- **Focus:** one shared treatment — `:focus-visible` draws a 2px `azure-bright` outline at 2px offset with a soft azure ring.

### Chips / status
- **Style:** 99px pill, uppercase 10.5px label with a leading 5px dot of `currentColor`.
- **Variants:** `.ran` / `.waiting` / `.fault` each take the matching state wash + state text + state-line border and a faint glow in their own channel; `.idle` is `raised` + `ink-2` (samples and unconfigured); `.azure` is the interaction tint. State chips are only ever rendered from `toneOf(status)`.

### Cards / rows
- **Corner:** 7px (`--r`). **Background:** `card` (or the agent-card's identity-washed gradient) with a `rule` hairline, `--edge` + `--lift`. Rows (`.row`, `.node`, `.sp-item`) separate with a 1px top border and hover to an azure- or room-tinted wash.
- **Agent card** (`.agent-card`): 216px min column, gradient ground with an identity `::before` wash bleeding from the top edge, 38px identity avatar tile carrying an identity-hued glow, an `agent-live` dot in `ran` (or `ink-3` when paused); hover rises 3px, deepens the gradient, and glows the border in the identity hue; the corner arrow fades in.

### Inputs / fields
- **Style:** `sunken` background, `rule-2` border, 7px radius; textarea auto-grows to 168px.
- **Focus:** border shifts to azure with a soft wash ring (the composer box uses the active identity hue instead: `h-line` border, `h-wash` ring).
- **Placeholder/muted:** `ink-3`. Disabled: opacity `.45`, `not-allowed`.

### Navigation — the icon rail (`.iconrail`)
- Permanent void column (with a subtle vertical gradient) at every breakpoint. Logo is a 40px gradient tile with `--glow` and a dark glyph (hover brightens, scales, tilts −4°). Buttons are 54px tall, room-hue-tinted at rest, taking the room hue's wash, ring and glowing mark when active, with a `waiting`-coloured count badge (own glow) top-right. Footer holds a panel-toggle and a status pulse (`rule-2` at rest, `ran` + a beating `ran-wash` ring when a model is configured).

### Signature: the seat node & activity printer
- **Seat node** (`.node`): 30px identity tile (glyph-first), a status dot answering "what is this seat doing" from stored rows (glowing in its own state colour), the name, message count in mono, and last-activity relative time; indent scales by reporting depth. Selected fills `h-wash` and inverts the tile to `h-tile`/`h-glyph`.
- **Activity board** (`.board`, closed by default, summoned from the rail): a printer, not a dashboard. Sections In flight / Needs attention / Upcoming / Record, each row one stored run, delegation, event, approval, or a live SSE fact — with a `caret-st` (the shared blink) marking a live row and mono timestamps. The foot states plainly that no background worker exists.

### The organisation channel (`.thread.channel`)
- The record of one company's briefed work, not a chat window. `.channel-head` states the stored team brief and the `.channel-seats` roster: pill chips with the seat's glyph tile, its `seatTone` dot, a `lead` marker on the seat a brief actually reaches, and a click that opens that seat's own thread.
- A post is an `.entry` wearing its author's identity tile and tint, with a kind tag (`notice`, `teammate post`, `report`) and, when the server refused to spend more, a state tag (`stopped at the budget`, `no answer`, `not answered`, `partial`, `stopped by you`, `budget reached`). Fault-family states take `--fault`; a budget refusal takes `--waiting` — the server declining to spend is not a broken thing.
- The question that produced a teammate post prints above it in the reused `.consult` block ("X asked Y"), so the summon is legible without opening anything. `.post-foot` is the mono provenance (`model · N chars · N reasoning · N tokens (est.)`) with a **Run steps** link into the stored `runs` row — the drill-in that answers "what is this seat doing right now".
- The composer in channel mode is the same `.composer` machine, reworded: placeholder "Brief {lead} for {org}", a note stating the summons ceiling, and Stop rendered only while the report streams. The bench panel stays visible beside it, because the channel is a view *of* the bench.

### Organisation memory and the trigger panel
- Two pills in `.memory-bar` under the channel head — **Memory** and **Trigger**, each with a stored count — expand a `.memory-panel` in place. No new pane, no new colour: the panel is `card` on `sheet` with a `rule` hairline, and a kind chip is the same uppercase label treatment as every other chip.
- A note is a row of evidence, not a toast: kind chip (decision takes the azure treatment, note the sage tint, glossary the aqua tint — the same three hues the bench uses), the sentence, then a mono line of who wrote it, when, `used N times`, and which channel posts it came from. Pinned takes the azure chip treatment (it is a priority, not a status); a superseded note is struck through and still listed, so a correction is visible as one.
- An injected block is labelled as a record to weigh, and the reply's provenance prints `· from N org memories (X chars)` — retrieval that the reader cannot see did not happen is not allowed.
- The trigger panel is deliberately plain: a copyable `curl` line in mono, its fire count, and copy that states there is no worker and nothing continues after the call. A surface that hands out a credential should not look like a feature card.

### Motion
The light layer's motion is one entrance rise and one caret blink, extended by three ambient accents — all collapsing to ~0 under `prefers-reduced-motion`, with the caret resting at 60% opacity:
- **Entrance rise** (`@keyframes rise`, .42s on panes/`.overview-content`/`.thread`, .5s on `.agent-grid` children with a 40ms stagger, .26s `pop` on dialogs, .22s on toast/jump).
- **The shared blink** (`caret` / `caret-st`, 1.05s steps) marks live text.
- **The beat** (2.4s ease-in-out) on live pulses — the rail status dot, the scheduler indicators, the panel live dot.
- **The ripple** (2.8s, three offset rings) on the control-room beacon while the scheduler is live.
- Transitions of 120–280ms on `--ease` / `--dur` for hover, press and selection; the agent card's rise is the largest at 280ms.

## Do's and Don'ts

### Do:
- **Do** carry structural elevation with a graphite step plus a `rule` hairline, and let the light layer add depth (`--edge`, `--lift`, glass, gradient, aurora) without inventing a fourth elevation — `--shadow-lift` stays with floating layers only.
- **Do** put a dark glyph (`--on-azure`, or the tint's own dark `glyph`) on every azure, gradient or identity fill.
- **Do** source green/amber/red only from `toneOf(status)` on a stored row, render a seeded sample as `idle` grey, and let a state glow appear only where the state does.
- **Do** mix every glow, hairline and aurora from the `--*-rgb` channel tokens — never from a hardcoded `rgba()` of the same family.
- **Do** keep the room hue on chrome and stage light only; buttons, links, focus and selection stay azure in every room.
- **Do** title the section panel by what it holds and the work surface by the section — never both the same word.
- **Do** use JetBrains Mono only for measurement (counts, times, tokens, code, language tags).
- **Do** keep identity to the three tints led by the avatar glyph; keep a tertiary text at `ink-3` no lighter than `raised` (4.5:1, measured against the live stylesheet).
- **Don't** add a fourth identity hue without first changing the accent or the state semantics — the test will fail, and now it fails against the palette the app actually ships.

### Don't:
- **Don't** give a light accent, gradient or tint fill white text.
- **Don't** use a glow to decorate: a glow marks interaction or a live/stored state, and `--shadow-lift` never lands on a resting card or button.
- **Don't** use a colour outside azure/state/identity/room to signal interactivity.
- **Don't** put the room hue on a button, link or focus ring.
- **Don't** set prose in the monospace face, or place an uppercase kicker above a heading.
- **Don't** invent a colour, an avatar or a name for a channel participant. A post is authored by a stored seat or by the human reading it; anything else is a row the server did not write.
- **Don't** let a channel go silent. A brief that was cut short, a peer that failed to answer, and a report that never got written each leave their own labelled row.
- **Don't** rebuild on the deleted Overview devices: the hero illustration, the four large stat cards, per-card ghost numerals, eyebrow/kicker labels above headings, or duplicated Upcoming/Recent panels. (The `.header-eyebrow` / `.sp-kicker` rules are now **deleted from the stylesheet** — 2026-10-06 — not merely orphaned.)

<!-- History, dated: the Graphite Edition (D-14) owned this file until 2026-10-06, when the built world was found to have moved — the always-on session had layered a Midnight polish over the graphite tokens (rewritten :root: void #07080d, azure #8b9bff, radii 8/12/16, plus --grad/--edge/--lift/--glow and six --*-rgb channels) while this document still described the retired palette, and identity.test.ts still asserted contrast against Graphite hexes the app no longer rendered. The 2026-10-06 pass (D-18) deepened the Midnight look — room-tinted stage aurora, state-dot glows, gradient meters, tokenised glow families — and rewrote this file from the built world; identity.test.ts now parses src/app/globals.css for the values it measures, so docs, tests and code can no longer drift apart silently. -->
