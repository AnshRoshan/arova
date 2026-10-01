import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DM_Sans, JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";

const bodyFont = DM_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const displayFont = Manrope({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const monoFont = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Arova — Your AI workspace",
  description: "Your agents, automations, and ideas in motion. Meet the workspace built for getting things done.",
};

const DIRECTION_CONTRACT = `<!--
impeccable:seed 14aada6d | surface src/app/page.tsx | mode operate | buildPath code
THESIS: The bench is an instrument panel, not a webpage: a permanent icon rail owns navigation, a contextual section panel owns the list you are working through, and the activity board on the right is a printer that only outputs rows the server actually stored. Refuses the category-default arrangement of a light dashboard wearing a dark sidebar.
OWN-WORLD: Graphite. Six surfaces step toward the reader — void #131416 (rail) · panel #191a1d · sheet #1e2023 · card #24262a · raised #2b2e33 · sunken #17191c — under neutral ink #eceef1, with one cool azure #7ba6ef doing all interactive work and a dark glyph (#0e1a2b) on every azure fill. Green/amber/red exist only where a stored row produced them; three identity tints (sage/aqua/mauve) mark which agent and are proven 30 deg clear of the accent and of each state. Radii 6/8/10px. DM Sans body, Manrope headings, JetBrains Mono reserved for measurement.
STORY: An operator opens the app, reads the workspace pulse as one line of real counts, picks a seat from the bench, and watches what the server recorded — what is in flight, what needs attention, what is scheduled, what already ran. Nothing on screen implies work that did not happen.
FIRST VIEWPORT: Icon rail down the left edge, permanent at every breakpoint; the section panel beside it titled by what it holds (Shortcuts, The bench, Routines); the work surface with a single section title; the activity board flush right. Composer across the bottom of a thread. No hero, no decorative illustration, no repeated title.
FORM: The Graphite Edition — the user's pinned direction ("dark theme primary, graphite and neutral colors", 2026-09-30) applied to the Workbench structure the same session pinned as direction B (D-12); a pinned brief beats the roll, so seed 14aada6d is recorded as provenance, not as a re-litigated choice.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
-->`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body className={`antialiased ${bodyFont.variable} ${displayFont.variable} ${monoFont.variable}`}>
    <span hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
    {children}
  </body></html>;
}
