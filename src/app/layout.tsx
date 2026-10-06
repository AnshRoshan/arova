import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";

const bodyFont = localFont({ src: "./fonts/dmsans.woff2", variable: "--font-body", display: "swap" });
const displayFont = localFont({ src: "./fonts/manrope.woff2", variable: "--font-display", display: "swap" });
const monoFont = localFont({ src: "./fonts/jetbrainsmono.woff2", variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Arova — Your AI workspace",
  description: "Your agents, automations, and ideas in motion — running around the clock. The workspace built for getting things done.",
  icons: { icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%238b9bff'/%3E%3Cstop offset='1' stop-color='%23b794ff'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' rx='9' fill='url(%23g)'/%3E%3Cpath d='M16 6l2.2 6.3L24.5 14l-6.3 1.7L16 22l-2.2-6.3L7.5 14l6.3-1.7z' fill='%230a0d28'/%3E%3C/svg%3E" },
};

export const viewport: Viewport = { themeColor: "#07080d", colorScheme: "dark", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" style={{ colorScheme: "dark" }}><body className={`antialiased ${bodyFont.variable} ${displayFont.variable} ${monoFont.variable}`}>{children}</body></html>;
}
