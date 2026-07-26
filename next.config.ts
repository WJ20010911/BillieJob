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
};

export default nextConfig;
