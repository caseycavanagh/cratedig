import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // the crate is a single static page (public/index.html); the address stays "/"
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/index.html" }], afterFiles: [], fallback: [] };
  },
  // the self-hosted fonts never change under the same name, so browsers can keep them for a year
  async headers() {
    return [{ source: "/fonts/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
  },
};

export default nextConfig;
