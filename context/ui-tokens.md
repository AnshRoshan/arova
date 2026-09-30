DESIGN.md at the repo root is the visual authority for "The Workbench" world — read it before touching styling, and do not fork its values into this file. This page only records what a non-visual agent needs.

- Canonical tokens live in `:root` in `src/app/globals.css`: cool paper `--paper #f4f7fa`, `--sheet`, `--tint`, ink ramp `--ink / --ink-2 / --ink-3`, rules `--rule / --rule-2`, one interactive accent `--azure #1d5dd0`.
- `--ran`, `--waiting`, `--fault` are **state semantics**, not palette. Use them only where the server recorded that state.
- Radii 6/8/10px plus pills. Body `--font-body` (DM Sans), headings `--font-display` (Manrope), `--font-mono` (JetBrains Mono) reserved for measurement (counts, times, tokens, model ids) — never as decoration. All three are **self-hosted** through `next/font/google` in `src/app/layout.tsx`; there is no remote Google `@import`, and adding a face means wiring it there, not linking a CDN.
- Column geometry: `--rail` 272px (organisation), fluid centre, `--boardw` 336px (activity board); thread prose measure `--measure` 80ch.
- The old warm world (`--purple #7154cc`, `--bg #fbfaf8`, ivory/lavender) is deleted. So are the Bench Notebook's taped-slip devices. Do not reintroduce either.
- Six identity hues live in `src/lib/identity.ts` (azure, teal, indigo, cyan, navy, steel) and reach CSS as `--h-ink/-tile/-wash/-line`. They mark *which agent*, never status. `identity.test.ts` asserts coolness, contrast and palette spread — change a hue there or the test fails.
- `--slate` / `--slate-2` are the code-block surface only — the app's only dark surface. Do not reuse them for cards or panels.
- Only two shadows exist (`--shadow-sheet`, `--shadow-lift`) and resting surfaces do not wear one. If a value is needed twice, promote it to `:root` before it scatters.
