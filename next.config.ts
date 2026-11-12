import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // the link preview card (src/lib/og.tsx) reads its fonts from disk, and the two pages below read their HTML
  outputFileTracingIncludes: { "/og": ["./assets/fonts/*.ttf"], "/og/make": ["./assets/fonts/*.ttf"], "/og/landing": ["./assets/fonts/*.ttf"], "/og/p/[kind]": ["./assets/fonts/*.ttf", "./public/index.html", "./public/vinyl/covers.json", "./public/vinyl/*-front.webp"], "/og/r/[slug]": ["./assets/fonts/*.ttf", "./public/index.html", "./public/vinyl/covers.json", "./public/vinyl/*-front.webp"], "/api/added": ["./public/index.html"], "/home": ["./public/index.html", "./public/vinyl/covers.json"], "/crates": ["./public/crates.html", "./public/index.html", "./public/vinyl/covers.json"], "/make": ["./public/vinyl-make.html"], "/landing": ["./public/landing.html", "./public/index.html", "./public/vinyl/covers.json"] },
  // "/" would be the front door (public/landing.html) and /casey Casey's crates (public/crates.html), but both redirect to /casey/all for now (below), and each crate (public/index.html)
  // at /casey/<crate>, the whole crate at /casey/all.
  // They and the make page come through src/app/landing, src/app/home and src/app/make, which add the domain to their link preview tags (src/lib/page.ts)
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/landing" },
        { source: "/casey", destination: "/crates" },
        { source: "/casey/:crate([a-z0-9-]{1,80})", destination: "/home?crate=:crate" },
        { source: "/vinyl-make.html", destination: "/make" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  // For now (Casey, 2026-11-07) the front door and the crates page are set aside: "/" and "/casey" go straight to Casey's crate,
  // query (a shared record ?r=, ?edit, …) and hash (#record/<slug>) and all. public/landing.html and public/crates.html stay for later;
  // to bring them back, drop the two plain redirects below and restore the query-only ones from git history.
  async redirects() {
    return ["/", "/casey"].map((source) => ({ source, destination: "/casey/all", permanent: false }));
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
