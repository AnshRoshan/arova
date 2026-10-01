---
name: Arova — The Graphite Edition
description: An agent workbench where every surface is a real graphite step and one cool azure does all interactive work.
colors:
  void: "#131416"
  sunken: "#17191c"
  panel: "#191a1d"
  sheet: "#1e2023"
  card: "#24262a"
  raised: "#2b2e33"
  ink: "#eceef1"
  ink-2: "#a9aeb5"
  ink-3: "#949aa3"
  rule: "#303439"
  rule-2: "#414750"
  azure: "#7ba6ef"
  azure-bright: "#9dbdf5"
  azure-wash: "#22304a"
  azure-line: "#35507e"
  on-azure: "#0e1a2b"
  ran: "#5fce9b"
  ran-wash: "#1d3227"
  ran-line: "#2f5a44"
  waiting: "#e8b25c"
  waiting-wash: "#33291a"
  waiting-line: "#5c4626"
  fault: "#f48cab"
  fault-wash: "#35202a"
  fault-line: "#5f3243"
  on-fault: "#2a0f16"
  on-waiting: "#17140d"
  ink-strong: "#f5f7f9"
  fault-text: "#ffdbe4"
  rule-3: "#575f6a"
  scroll-thumb: "#3b4149"
  code-bg: "#101215"
  code-line: "#23272d"
  code-text: "#dfe6ee"
  code-lang: "#7f8b99"
  hue-sage: "#a8d98a"
  hue-aqua: "#70d2db"
  hue-mauve: "#c4a3dd"
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
  sm: "6px"
  md: "8px"
  lg: "10px"
  pill: "99px"
  # Two one-off shapes that are not surface radii: a scrollbar thumb that must read as a
  # rounded slot, and the 3px edge of the rail's active tab.
  thumb: "9px"
  tab: "3px"
spacing:
  gutter: "40px"
components:
  button-primary:
    backgroundColor: "{colors.azure}"
    textColor: "{colors.on-azure}"
    rounded: "{rounded.sm}"
    padding: "7px 13px"
  button-primary-hover:
    backgroundColor: "{colors.azure-bright}"
  button-ghost:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "7px 12px"
  button-danger:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.fault}"
    rounded: "{rounded.sm}"
    padding: "7px 12px"
  button-danger-hover:
    backgroundColor: "{colors.fault-wash}"
    textColor: "{colors.fault}"
  send-button:
    backgroundColor: "{colors.hue-aqua}"
    textColor: "{colors.on-azure}"
    rounded: "{rounded.sm}"
    size: "34px"
  input:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  agent-card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.md}"
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
    rounded: "{rounded.md}"
---

# Design System: Arova — The Graphite Edition

## Overview

**Creative North Star: "The Instrument Panel"**

Arova is not a dashboard wearing a dark theme; it is an instrument bench. A permanent icon rail owns navigation at the far left, a contextual section panel owns the list you are working through beside it, the fluid work surface carries the single title of whatever you opened — one seat's thread, or one organisation's channel — and the activity board on the right is a printer that only emits rows the server actually stored. The whole world is graphite: neutral surfaces step toward the reader, ink stays neutral, and colour is rationed to three jobs — azure for interaction, green/amber/red for a stored state, and a fixed set of identity tints for *which agent* you are looking at. Nothing implies work that did not happen.

Density is the aesthetic. This is a working tool read every day by one operator who wants to continue, not tour. So the surfaces are dark and close together, hairlines and surface steps do the structural work that shadows would do elsewhere, and there is no hero, no decorative illustration, no repeated heading. The identity tints are led by the avatar glyph, not the hue — the hue is a secondary marker precisely because there are only three and they cannot carry the whole identity load.

**Key Characteristics:**
- Six graphite surfaces (void → sunken) that step toward the reader; elevation is carried by surface steps and hairlines, not shadows.
- One cool azure does all interactive work; its dark-ground tint family (wash/line) and a dark glyph live alongside it.
- Green/amber/red exist only where a stored row produced them; a sample row wears idle grey, never the green of a real run.
- Exactly three identity tints (sage/aqua/mauve), each proven 30° clear of the accent and of every state colour.
- DM Sans body, Manrope headings, JetBrains Mono reserved strictly for measurement.
- Four fixed columns at wide (68 · 276 · fluid · 320), collapsing through two breakpoints; no section repeats the title of another.
- Every row belongs to exactly one subject — a seat's thread or an organisation's channel — and a channel post always names the seat that wrote it, in that seat's tile and tint.

## Colors

The palette is graphite plus rationed colour. Surfaces are neutral, text is neutral, and chroma appears only for interaction, stored state, or agent identity — never for decoration.

### Surfaces (the graphite ramp, darkest → lightest)
- **Void** (`#131416`): the permanent icon rail — the darkest thing on screen.
- **Sunken** (`#17191c`): inputs and recessed wells; deliberately darker than the working ground.
- **Panel** (`#191a1d`): the section panel and the activity board.
- **Sheet** (`#1e2023`): the working ground behind a thread or pane.
- **Card** (`#24262a`): raised content — thread rows, cards, lists, bars.
- **Raised** (`#2b2e33`): hover, selected, the tab track — the lightest resting surface.

### Text
- **Ink** (`#eceef1`): primary text.
- **Ink-2** (`#a9aeb5`): secondary text.
- **Ink-3** (`#949aa3`): tertiary/metadata, tuned specifically to clear 4.5:1 on **Raised** — the lightest surface any tertiary text is allowed to land on.

### Hairlines & borders
- **Rule** (`#303439`): default 1px divider.
- **Rule-2** (`#414750`): stronger border (icon buttons, chips, inputs at rest).

### Accent (interaction — the only one)
- **Azure** (`#7ba6ef`): every interactive affordance — active nav fill, focus ring, links, caret, primary button, meters.
- **Azure-bright** (`#9dbdf5`): hover on an azure surface.
- **Azure-wash** (`#22304a`) and **Azure-line** (`#35507e`): azure's own dark-ground tint pair (selected tiles, focus glow, tinted chips).
- **On-azure** (`#0e1a2b`): the dark glyph/text that sits on any azure fill. A light accent on a dark ground cannot carry white text — every azure fill takes this.

### State semantics (produced only by a stored row)
- **Ran** (`#5fce9b`, with **ran-wash** `#1d3227` / **ran-line** `#2f5a44`): completed / approved.
- **Waiting** (`#e8b25c`, with **waiting-wash** `#33291a` / **waiting-line** `#5c4626`): queued, running, pending, due.
- **Fault** (`#f48cab`, with **fault-wash** `#35202a` / **fault-line** `#5f3243` / **on-fault** `#2a0f16`): failed, cancelled, rejected, provider error. The one place a state colour fills a button is the destructive confirmation (`.primary.solid-fault`), and it takes a dark glyph like every other light fill; its hover inverts to `fault-line` + `fault` rather than inventing a sixth pink.

### Identity tints (which agent, never a status)
Three fully-specified hues live in `src/lib/identity.ts`, each an `ink`/`tile`/`glyph`/`wash`/`line` set applied as inline custom properties (`--h-*`) so one stylesheet rule serves every agent:
- **Sage** (`#a8d98a` ink), **Aqua** (`#70d2db` ink), **Mauve** (`#c4a3dd` ink). Each tile takes a **dark** glyph (sage `#2c372a`, aqua `#21363a`, mauve `#322d3b`) — never white.

### Code well
- **Code-bg** (`#101215`): the only recessed dark surface other than the rail; the code block sits deliberately darker than everything so model output reads as an artifact. Its family: **code-line** `#23272d`, **code-text** `#dfe6ee`, **code-lang** `#7f8b99`.

### Single-use surface steps (deliberate one-offs, kept out of `:root`)
These exist for one specific job and are intentionally not tokens. **Rule: a second use promotes the value into `:root`.**
- Hover steps: `#1e2126` (rail button/status hover), `#1f2226` (section item / node / board row hover), `#202327` (node & board row hairline), `#2a2d32` (row hover, team-card head), `#282b30` (agent-card hover), `#22252a` (the user's own thread entry).
- Text steps: `#dfe3e8` (user entry body), `#ffdbe4` (fault entry body), `#f5f7f9` (rich-text `<strong>`).
- Selection: `#35507e`. Scrollbar thumb `#3b4149` / hover `#4b525c`. Ghost border-hover `#575f6a`. Rail badge ink `#17140d`. Code bar `#15181c`.

### Named Rules
**The One Voice Rule.** Azure is the only interaction colour. It appears as a fill (with a dark glyph) or as its tint family (wash/line) — nothing else on the bench goes blue to mean "clickable".
**The Dark-Glyph Rule.** A light accent or identity tint on a dark ground cannot carry white text. Every azure fill and every identity tile takes a dark glyph (`--on-azure`, or the tint's own dark `glyph`). `identity.test.ts` asserts a tile is never given a white glyph.
**The Stored-Row Rule.** Green, amber and red are only ever produced by a stored row. A seeded sample wears **idle** grey (`raised` + `ink-2`); a fabricated success state is a defect, not a colour.
**The Three-Mark Rule.** Identity is exactly three tints (sage/aqua/mauve). This is a measured ceiling, not taste: with azure owning interaction and green/amber/red owning state, the cool half of the wheel has room for three marks at 30° of separation, so identity is led by the avatar glyph and the tint is secondary. **Adding a fourth hue requires changing the accent or the semantics first** — `identity.test.ts` fails on contrast floors, the 30° separation from the accent and every state colour, or a warm drift.

## Typography

**Display Font:** Manrope (`--font-display`), self-hosted through `next/font`.
**Body Font:** DM Sans (`--font-body`), self-hosted through `next/font`.
**Label/Mono Font:** JetBrains Mono (`--font-mono`), self-hosted through `next/font`.

**Character:** Manrope's tight, geometric headings give the rail and bars a technical poise; DM Sans stays neutral and workmanlike at 14px/1.6 for dense reading. JetBrains Mono is a measuring instrument, not a voice.

### Hierarchy
- **Display / headings** (Manrope 700–800, `-.022em`, line-height 1.2): `h1` 26px, `h2` 18px, `h3` 15px at rest; the surface bar tightens to 20px, the identity bar to 22px, a pane head to 24px, and the editable org name carries the full 26px/800. A dialog title is 17px, a card heading 16px.
- **Body** (DM Sans 400, 14px/1.6): chrome, labels, list rows.
- **Reading** (DM Sans, 15px/1.7, max-width `80ch` via `--measure`): thread message text, channel posts and composer input.
- **Label** (DM Sans 700, ~11px, `.08em`, uppercase): group labels, section headings inside panes, chips — the only uppercase device, and it is never a kicker placed *above* a heading.
- **Mono** (JetBrains Mono, tabular-nums, `-.01em`): numbers, token counts, timestamps, model ids, code, schedule lines.
- **The chrome ladder** (13.5 → 9px, half-stepped: 13.5, 13, 12.5, 12, 11.5, 11, 10.5, 10, 9.5, 9): the working text of a 276px panel and a 320px board. It is half-stepped deliberately — one full pixel is the difference between a row that holds its two-line label and one that wraps, so the ladder is the ramp for dense chrome and the steps above it belong to prose. A new size outside this ladder and the prose steps above is drift; a new size *on* it is not.

### Named Rules
**The Monospace-Means-Measurement Rule.** JetBrains Mono marks only measured data — a count, a time, a token figure, a language tag. It never sets prose. `.num`, `time`, `.mono` exist for this and nothing else.

## Layout

The bench is a four-column grid defined once as `.workbench`: `68px` icon rail · `276px` section panel · `minmax(0,1fr)` fluid work surface · `320px` activity board, at `100dvh` with internal scroll. The section panel can collapse to `0` (`panel-closed`).

- **Breakpoint 1250px:** the activity board leaves the grid and becomes a right-side overlay drawer (`min(372px,92vw)`, `--shadow-lift`); `.only-narrow` affordances appear.
- **Breakpoint 860px:** the section panel becomes a full-width step (rail narrows to `60px`, `--gutter` tightens to `18px`); the panel slides in as an overlay (`mpanel`); `.sheet-bar` compresses and `.facts` wrap to a third row. `.only-mobile` appears, `.only-wide` hides.
- **600px:** agent grid and org stats drop to two columns; the create button collapses to a bare icon.

Visibility helpers are exactly three: `.only-narrow`, `.only-wide`, `.only-mobile`. Rhythm uses `--gutter` (40px, tightening to 18px on mobile) as the sheet's horizontal step and `--measure` (80ch) as the reading column. Thread maxes at 1120px; panes at 1020px.

**The Naming Rule.** The section panel is titled by **what it holds** (Shortcuts, The bench, Reporting lines, Routines, Connectors, Workspace) while the work surface carries the **section title** (Overview, Organisation, Automations, Integrations, Settings, or the agent's name). Neither repeats the other; a heading is never duplicated in two columns.

## Elevation & Depth

This system is **flat by construction**. Depth is carried entirely by the graphite surface ramp (`void → panel → sheet → card → raised`, stepping toward the reader) plus 1px hairlines (`--rule`, `--rule-2`). There is exactly one shadow token — `--shadow-lift` (`0 20px 48px rgba(0,0,0,.48)`) — and it belongs only to layers that genuinely float above the bench: the dialog, the toast, the jump pill, and the two overlay drawers (activity board, mobile section panel). Resting surfaces, cards, rows and inputs have no shadow.

### Shadow Vocabulary
- **Lift** (`--shadow-lift`): the only shadow. Floating layers only (`.dialog`, `.toast`, `.jump`, `.board`/`.sidepanel` when drawer-positioned).

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Elevation is a surface step plus a hairline. `--shadow-lift` appears only where a layer leaves the grid and floats, and a shadow is never used to make a static card "pop".

## Shapes

Form is restrained and mechanical. Radii are three steps plus pills: `--r-sm` 6px (inputs, icon buttons, tiles, chips-of-consideration), `--r` 8px (cards, rows, dialogs body, tabs track), `--r-lg` 10px (composer box, dialog), and `99px` pills (chips, meters, badges, `fact`, `org-count`). Borders are 1px hairlines; there are no heavy outlines and no decorative clipping. Tiles (30px seat nodes, 38px identity/avatar) are the recurring silhouette, and the active seat gets a 3px azure tab that bleeds from the rail (`rail-btn.on::before`). The code well (`--code-bg`) is the only deliberately recessed dark surface other than the rail.

## Components

### Buttons
- **Shape:** gently curved (6px).
- **Primary** (`.primary`): azure fill, dark `on-azure` label, 700 weight, padding `7px 13px`; hover → azure-bright, active → 1px press (`translateY(1px)`), transition 120ms.
- **Ghost** (`.ghost`): sheet background, `rule-2` border, ink text; hover lifts the border to `#575f6a` and the ground to **raised**.
- **Danger** (`.danger`): a ghost that takes **fault** text and `fault-line` border; hover fills `fault-wash`. Danger stays a *ghost* — it is not a filled red button.
- **Icon button** (`.icon-btn`): 32px square, sheet background, `rule` border; hover → raised.
- **Send** (`.send`): 34px square tinted with the active agent's identity tile, dark identity glyph; hover brightens via `filter: brightness(1.12)`.
- **Focus:** one shared treatment — `:focus-visible` draws a 2px azure outline at 2px offset.

### Chips / status
- **Style:** 99px pill, uppercase 10.5px label with a leading 5px dot of `currentColor`, transparent border at rest.
- **Variants:** `.ran` / `.waiting` / `.fault` each take the matching state wash background + state text + state line border; `.idle` is `raised` + `ink-2` (used for samples and unconfigured); `.azure` is the interaction tint. State chips are only ever rendered from `toneOf(status)`.

### Cards / rows
- **Corner:** 8px. **Background:** `card` with a `rule` hairline; no shadow. Rows (`.row`, `.node`, `.sp-item`) separate with a 1px `rule`/`#202327` top border and hover to a single-use step (`#2a2d32` / `#1f2226`).
- **Agent card** (`.agent-card`): 216px min column, `card` ground, 38px identity avatar tile, an `agent-live` dot in `ran` (or `ink-3` when paused); hover swaps the border to the tint's `line` and the ground to `#282b30`.

### Inputs / fields
- **Style:** `sunken` background, `rule`/`rule-2` border, 6px radius; textarea auto-grows to 168px.
- **Focus:** border shifts to azure with a `0 0 0 3px azure-wash` glow (the composer box uses the active identity hue instead: `h-line` border, `h-wash` glow).
- **Placeholder/muted:** `ink-3`. Disabled: opacity `.45`, `not-allowed`.

### Navigation — the icon rail (`.iconrail`)
- Permanent `void` column at every breakpoint. Logo is a 40px azure tile with a dark glyph (hover scale 1.05 → azure-bright). Buttons are 54px tall, `ink-3` at rest, hover `#1e2126`+ink, active `azure-wash` + `azure-bright` label with the 3px azure tab. A `waiting`-coloured count badge sits top-right. Footer holds a panel-toggle and a status pulse (`rule-2` at rest, `ran` + `ran-wash` ring when a model is configured).

### Signature: the seat node & activity printer
- **Seat node** (`.node`): 30px identity tile (glyph-first), a status dot answering "what is this seat doing" from stored rows, the name, message count in mono, and last-activity relative time; indent scales by reporting depth. Selected fills `h-wash` and inverts the tile to `h-tile`/`h-glyph`.
- **Activity board** (`.board`): a printer, not a dashboard. Sections In flight / Needs attention / Upcoming / Record, each row one stored run, delegation, event, approval, or a live SSE fact — with an `caret-st` (the shared blink) marking a live row and mono timestamps. The foot states plainly that no background worker exists.

### Organisation channel (`.thread.channel`)
- The record of one company's briefed work, not a chat window. `.channel-head` states the stored team brief and the `.channel-seats` roster: pill chips with the seat's glyph tile, its `seatTone` dot, a `lead` marker on the seat a brief actually reaches, and a click that opens that seat's own thread.
- A post is an `.entry` wearing its author's identity tile and tint, with a kind tag (`notice`, `teammate post`, `report`) and, when the server refused to spend more, a state tag (`stopped at the budget`, `no answer`, `not answered`, `partial`, `stopped by you`, `budget reached`). Fault-family states take `--fault`; a budget refusal takes `--waiting` — the server declining to spend is not a broken thing.
- The question that produced a teammate post prints above it in the reused `.consult` block ("X asked Y"), so the summon is legible without opening anything. `.post-foot` is the mono provenance (`model · N chars · N reasoning · N tokens (est.)`) with a **Run steps** link into the stored `runs` row — the drill-in that answers "what is this seat doing right now".
- The composer in channel mode is the same `.composer` machine, reworded: placeholder "Brief {lead} for {org}", a note stating the summons ceiling, and Stop rendered only while the report streams. The bench panel stays visible beside it, because the channel is a view *of* the bench.

### Organisation memory and the trigger panel
- Two pills in `.memory-bar` under the channel head — **Memory** and **Trigger**, each with a stored count — expand a `.memory-panel` in place. No new pane, no new colour: the panel is `card` on `sheet` with a `rule` hairline, and a kind chip is the same uppercase label treatment as every other chip.
- A note is a row of evidence, not a toast: kind chip, the sentence, then a mono line of who wrote it, when, `used N times`, and which channel posts it came from. Pinned takes the azure chip treatment (it is a priority, not a status); a superseded note is struck through and still listed, so a correction is visible as one.
- An injected block is labelled as a record to weigh, and the reply's provenance prints `· from N org memories (X chars)` — retrieval that the reader cannot see did not happen is not allowed.
- The trigger panel is deliberately plain: a copyable `curl` line in mono, its fire count, and copy that states there is no worker and nothing continues after the call. A surface that hands out a credential should not look like a feature card.

### Motion
One entrance rise (`@keyframes rise`, ~0.2–0.26s, on dialog/toast/jump), one shared blink (`caret` and `caret-st`, 1.05s steps), 120–150ms press/background transitions, all on `--ease` (`cubic-bezier(.22,.68,.31,1)`). Under `prefers-reduced-motion` every duration collapses to ~0 and the caret rests at 60% opacity.

## Do's and Don'ts

### Do:
- **Do** carry elevation with a graphite step plus a `rule` hairline; reserve `--shadow-lift` for floating layers (dialog, toast, jump, overlay drawers) only.
- **Do** put a dark glyph (`--on-azure`, or the tint's own dark `glyph`) on every azure or identity fill.
- **Do** source green/amber/red only from `toneOf(status)` on a stored row, and render a seeded sample as `idle` grey.
- **Do** title the section panel by what it holds and the work surface by the section — never both the same word.
- **Do** use JetBrains Mono only for measurement (counts, times, tokens, code, language tags).
- **Do** keep identity to the three tints led by the avatar glyph; keep a tertiary text at `ink-3` no lighter than `raised` (4.5:1).
- **Don't** add a fourth identity hue without first changing the accent or the state semantics — the tests will fail.
- **Don't** promote a single-use surface hex into a token before it has a second use.

### Don't:
- **Don't** reintroduce the deleted Overview devices: the hero illustration, the four large stat cards, per-card ghost numerals, eyebrow/kicker labels above headings, or duplicated Upcoming/Recent panels. (Residual `.header-eyebrow` / `.sp-kicker` CSS rules are orphaned — do not build new surfaces on them.)
- **Don't** give a light accent or tint fill white text.
- **Don't** use a shadow to make a resting card or button "lift" — that breaks the flat graphite construction.
- **Don't** use a colour outside azure/state/identity to signal interactivity.
- **Don't** set prose in the monospace face, or place an uppercase kicker above a heading.
- **Don't** invent a colour, an avatar or a name for a channel participant. A post is authored by a stored seat or by the human reading it; anything else is a row the server did not write.
- **Don't** let a channel go silent. A brief that was cut short, a peer that failed to answer, and a report that never got written each leave their own labelled row.

<!-- The two defects this file used to carry as "not canonized" are gone: the routine dialog's `--azure-deep` mark and the delete-confirmation's inline `--fault` fill with an offset shadow were both removed in the Graphite pass (grep finds neither token nor shadow in src). Feature 11 added no single-use surface hexes: `.channel-head`, `.seat-chip`, `.group-channel` and `.post-foot` are built entirely from the existing graphite ramp, hairlines, identity variables and state colours. -->
