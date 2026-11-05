import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // the link preview card (src/lib/og.tsx) reads its fonts from disk, and the two pages below read their HTML
  outputFileTracingIncludes: { "/og": ["./assets/fonts/*.ttf"], "/og/make": ["./assets/fonts/*.ttf"], "/og/landing": ["./assets/fonts/*.ttf"], "/og/p/[kind]": ["./assets/fonts/*.ttf", "./public/index.html", "./public/vinyl/covers.json", "./public/vinyl/*-front.webp"], "/og/r/[slug]": ["./assets/fonts/*.ttf", "./public/index.html", "./public/vinyl/covers.json", "./public/vinyl/*-front.webp"], "/home": ["./public/index.html", "./public/vinyl/covers.json"], "/make": ["./public/vinyl-make.html"], "/landing": ["./public/landing.html", "./public/index.html", "./public/vinyl/covers.json"] },
  // "/" is the front door (public/landing.html); Casey's crate (public/index.html) is at /casey.
  // They and the make page come through src/app/landing, src/app/home and src/app/make, which add the domain to their link preview tags (src/lib/page.ts)
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/landing" },
        { source: "/casey", destination: "/home" },
        { source: "/vinyl-make.html", destination: "/make" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  // links to Casey's crate from when it lived at "/" (a shared record ?r=, ?edit, ?dv, ?hints) go to /casey, query and all.
  // Old /#record/<slug> links never reach the server: public/landing.html forwards those itself.
  async redirects() {
    return ["r", "edit", "dv", "hints"].map((key) => ({ source: "/", has: [{ type: "query" as const, key }], destination: "/casey", permanent: false }));
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
