import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // the link preview card (src/lib/og.tsx) reads its fonts from disk, and the two pages below read their HTML
  outputFileTracingIncludes: { "/og": ["./assets/fonts/*.ttf"], "/og/make": ["./assets/fonts/*.ttf"], "/home": ["./public/index.html"], "/make": ["./public/vinyl-make.html"] },
  // the crate is a single static page (public/index.html); the address stays "/".
  // It and the make page come through src/app/home and src/app/make, which add the domain to their link preview tags (src/lib/page.ts)
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/home" },
        { source: "/vinyl-make.html", destination: "/make" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  // the self-hosted fonts never change under the same name, so browsers can keep them for a year
  async headers() {
    return [{ source: "/fonts/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
  },
};

export default nextConfig;
