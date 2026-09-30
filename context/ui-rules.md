The shell is a workbench: the organisation is the navigation (left), one seat's thread is the product (centre), and the activity board prints what the server recorded (right). Panes are demoted to the bench footer, not the main frame. The app opens on the last conversation, restored from `localStorage["arova.lastAgent"]`.

- **Never imply an action the server did not record.** Seeded sample rows render in the neutral/idle treatment and read "sample"; a provider failure renders as a fault entry with the upstream detail; a partial stream is tagged "partial"; a stopped stream says "stopped by you"; a budget cut says "budget reached". This outranks visual consistency.
- **The activity board is a printer, not a dashboard.** Every row is a stored run, delegation, audit event, approval, or a routine's stored `next_run_at` — or a live SSE fact this client actually received. No legends, no static summary cards, no invented status. If a section has no rows, the section is absent.
- **A control that does nothing must not appear.** No mock attach/mic buttons, no fake progress, no success styling on provider or runtime errors.
- **Every number needs a source in the board payload.** Counts of stored rows are exact and unlabelled; gateway token figures are estimates and carry "(est.)"; a day whose usage still contains estimates is labelled "est." rather than "reported".
- Disabled or unconfigured surfaces explain why in the surface itself.
- Deletion is confirmed in-world (a stacked dialog naming what is removed), never with `window.confirm()`.
- Keyboard promises belong to wide surfaces: the `⌘K` hint and the composer's "Enter sends" line are `.only-wide`; while a reply streams the composer line says "Stop keeps what has arrived" instead of promising Enter.
- Form fields are labelled; action labels name the action. Responsive collapse is 1180px (activity board → overlay) and 860px (bench → drawer), using `.only-narrow` / `.only-wide`; never add a third breakpoint without updating DESIGN.md.
- Motion: one entrance settle and one caret blink (the In-flight dot uses the same blink); respect `prefers-reduced-motion`.
- Model output renders only through `src/lib/markdown.ts` into React nodes. No `dangerouslySetInnerHTML`.
- Visual verification is done in a real browser at 1440x900 and 390x844 with a live streamed reply, never from the CSS. The capture harness is `.impeccable/cdp-harness.cjs`; it deletes its own outputs at start and writes `desktop.png` / `mobile.png` from the same buffer as their source frame, so a stale frame cannot be presented as fresh evidence.
