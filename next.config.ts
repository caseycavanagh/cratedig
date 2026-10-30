import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // the crate is a single static page (public/index.html); the address stays "/"
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/index.html" }], afterFiles: [], fallback: [] };
  },
  // the self-hosted fonts never change under the same name, so browsers can keep them for a year
  async headers() {
    // the grid's small covers can change under the same name when a cover is refetched, so a day, then refreshed quietly
    return [
      { source: "/fonts/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/vinyl/t/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=2592000" }] },
    ];
  },
};

export default nextConfig;
