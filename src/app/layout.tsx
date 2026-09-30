import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DM_Sans, JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";

const bodyFont = DM_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const displayFont = Manrope({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const monoFont = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Arova — Your agent workspace",
  description: "A calmer place to put your AI agents to work. Plan, automate, and stay in control.",
};

const DIRECTION_CONTRACT = `<!--
impeccable:seed 14aada6d | surface src/app/page.tsx | mode operate | buildPath code
THESIS: The workspace is a shift board, not a notebook: the organisation is the navigation, and the activity column is a printer that only outputs rows the server actually stored. Refuses the category-default arrangement of a chat list beside a chat window beside a decorative evidence panel.
OWN-WORLD: Cool paper #f4f7fa under white sheets, ink #1b2430, hairline rules #dfe6ee, one azure #1d5dd0 doing all interactive work, semantics (green/amber/red) only for states a stored row produced. Radii 6-10px. DM Sans body, Manrope headings, JetBrains Mono reserved for measurement. Seat nodes carry an identity hue on --h-*: it marks who, never status.
STORY: An operator opens the app and reads their bench at a glance - who reports where, who is busy, who is waiting - answers whoever they selected in a thread given real width, and watches the activity board print what is in flight, what needs attention, and what the server recorded, newest first.
FIRST VIEWPORT: Left rail: teams as reporting trees with per-seat state dots, message counts and last-touch times, panes demoted to the footer. Centre: the identity bar (seat, role, reporting line, model, stored message count), the ruled thread at an 80ch measure, and under the last reply one printed provenance line - state, model, chars, estimated tokens, saved-at. Right: In flight / Needs attention / Record, each row a stored run, delegation, event, or approval; due schedules and no-worker waits stated in words. Composer across the bottom.
FORM: The Workbench, direction B pinned by the user (D-12), seed roll 14aada6d; raised by two competitive hands: the shift-log discipline that the system prints its own state as dated rows and the live layer never rewrites the record, from Phosphor Terminal Midnight; the interaction honesty that every control visibly shows the state it is in - pressed, selected, disabled - from Medium-Native One-Bit Desktop.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
-->`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`antialiased ${bodyFont.variable} ${displayFont.variable} ${monoFont.variable}`}>
        <span hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        {children}
      </body>
    </html>
  );
}
