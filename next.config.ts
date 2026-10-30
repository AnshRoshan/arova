import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Without this, a stray lockfile above the repo makes Next treat C:\Users\<name> as the project
  // root: .env.local in this directory is then never loaded, and the server silently runs on
  // whatever the shell happened to export. Pin the root to this app.
  turbopack: { root: path.resolve(__dirname) },
  // The badge sits on top of the index footer where it reads as a broken control.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
