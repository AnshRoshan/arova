import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The badge sits on top of the index footer where it reads as a broken control.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
