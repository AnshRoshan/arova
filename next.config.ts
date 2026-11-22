import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The badge sits on top of the index footer where it reads as a broken control.
  devIndicators: { position: "bottom-right" },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), clipboard-read=(), clipboard-write=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
