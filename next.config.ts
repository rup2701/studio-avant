import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "pg"],
  images: {
    // Photos are served already resized by the storage adapter (see src/lib/images.ts).
    unoptimized: true,
  },
};

export default nextConfig;
