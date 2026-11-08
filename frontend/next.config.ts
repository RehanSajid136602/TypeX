import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Dev-only API proxy. Production builds are a static export served by the C++
// engine on the same origin, so no rewrite is emitted and no origin is baked in.
// Override with TYPEX_DEV_API_ORIGIN when the dev backend is not on :8080.
const devApiOrigin = process.env.TYPEX_DEV_API_ORIGIN || "http://localhost:8080";

const nextConfig: NextConfig = {
  ...(isProd ? { output: "export" } : {}),
  images: { unoptimized: true },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${devApiOrigin}/api/:path*`,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
