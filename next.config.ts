import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone build for Docker
  output: "standalone",

  // Allow larger body for image uploads
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },

  // The analysis workspace is an interactive, per-user page.  Do not let a
  // reverse proxy keep an old HTML shell after a deployment.
  async headers() {
    return [
      {
        source: "/analyze/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
