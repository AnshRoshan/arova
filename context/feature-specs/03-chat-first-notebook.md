# Feature 03 — Chat-first notebook shell

Goal: replace the dashboard shell with one the user opens every day — a ruled agent index, a single thread, and an evidence margin whose cards can only contain rows the server actually returned.

Decided with the user: chat-first shell (not token polish) · light, cool neutrals, one azure accent · evidence shows real state only · Runs/Schedule/Tools/Approvals/Settings kept but demoted to the index · honest evidence is the point of pride · code-first build.

Visual world: "The Bench Notebook" (impeccable seed `fa31e43a`), raised by three competitive hands — hairline module tabs and density, a printed state key plus the rule that the live layer never rewrites the record, and a monospace provenance readout. Contract lives in `src/app/layout.tsx`; system recorded in `DESIGN.md`.

Acceptance checks:
- App opens on the last conversation used (per-browser persistence), not an overview.
- Index shows every agent with a last-message preview, timestamp, and active/paused mark; previews never lead with model reasoning text.
- The provenance slip sits at the vertical position of the reply it documents and follows scroll.
- A seeded greeting yields "no reply / Nothing answered yet", never a completed-stream claim.
- A local (no-model) reply is labelled "Local note · this app, no model called" and shows no model rows.
- Token figures read "(est.)"; no daily aggregate is presented as one reply's input.
- Seeded sample runs and the seeded approval render grey/"sample" and raise no demand badge.
- Model reasoning that arrives inside the answer is shown folded and verbatim; nothing is deleted from the stored message.
- Composer has no control that cannot do something (no mock attach or mic).
- Panes remain reachable from the index and every prior action still works unchanged.

Out of scope: dark theme, streaming reconnect, cross-agent threads, real connectors, authentication.
