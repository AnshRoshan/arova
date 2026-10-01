# Arova Graphite Edition UI tokens

DESIGN.md at the repo root is the visual authority — read it before touching styling, and do not fork its values into this file. This page records only what a non-visual agent needs.

- One `:root` in `src/app/globals.css` is normative. Elevation comes from surface steps and hairlines, not shadows: `--void #131416` (icon rail) → `--panel #191a1d` → `--sheet #1e2023` (working ground) → `--card #24262a` → `--raised #2b2e33` (hover/selected) → `--sunken #17191c` (inputs, code well).
- Text: `--ink #eceef1` / `--ink-2 #a9aeb5` / `--ink-3 #949aa3`. `--ink-3` is tuned to clear 4.5:1 on `--raised`, the lightest surface tertiary text lands on; do not darken it.
- One interactive accent: `--azure #7ba6ef`, `--azure-bright` on hover, `--azure-wash`/`--azure-line` for its tint family. A light accent on dark cannot carry white text — azure fills use `--on-azure #0e1a2b`.
- `--ran #5fce9b`, `--waiting #e8b25c`, `--fault #f48cab` (each with `-wash`/`-line`) are **state semantics**, not palette. Use them only where a stored row produced that state.
- Identity tints live in `src/lib/identity.ts`: **three** (sage `#a8d98a`, aqua `#70d2db`, mauve `#c4a3dd`), reaching CSS as `--h-ink/-tile/-glyph/-wash/-line`. They mark *which agent*, never status. The count is a measured ceiling, not taste: with the accent at 218° and state at 152°/37°/342°, the cool half of the wheel holds three marks at 30° separation and no more. `identity.test.ts` asserts contrast and separation, so adding a fourth hue fails until the accent or a semantic moves first. The avatar glyph leads; the tint is secondary.
- Radii 6/8/10px plus pills. `--code-bg #101215` is the only recessed dark surface besides the rail; do not reuse it for cards.
- Fonts are **self-hosted** through `next/font/google` in `src/app/layout.tsx` as `--font-body` (DM Sans) / `--font-display` (Manrope) / `--font-mono` (JetBrains Mono). There is no CDN `@import`; adding a face means wiring it there. Mono is for measurement only.
- Only `--shadow-lift` exists, and only on floating layers (dialog, toast, jump pill, overlay panel/board).
- Layout: 68px icon rail · 276px section panel · fluid work surface · 320px activity board. Breakpoints 1250 (board → overlay) and 860 (rail → 60px, panel → full-width step, gutter tightens). `.only-narrow` / `.only-wide` / `.only-mobile` are the only visibility helpers.
- A small set of single-use hexes (hover steps, text steps, selection, scrollbar) is deliberate. If one is needed a second time, promote it to `:root` rather than repeating the literal.
- All summary values come from the board API; seeded sample rows never count as completed work. The retired worlds are gone — no warm ivory/lilac "Studio Edition", no cool-paper "Bench Notebook", no taped slips, no printed state legend, no hero illustration. Do not reintroduce any of them.
