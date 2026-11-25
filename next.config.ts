import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // the link preview card (src/lib/og.tsx) reads its fonts from disk, and the two pages below read their HTML
  outputFileTracingIncludes: { "/og": ["./assets/fonts/*.ttf"], "/og/make": ["./assets/fonts/*.ttf"], "/og/landing": ["./assets/fonts/*.ttf"], "/og/p/[kind]": ["./assets/fonts/*.ttf", "./public/index.html", "./public/vinyl/covers.json", "./public/vinyl/*-front.webp"], "/og/r/[slug]": ["./assets/fonts/*.ttf", "./public/index.html", "./public/vinyl/covers.json", "./public/vinyl/*-front.webp"], "/api/added": ["./public/index.html"], "/home": ["./public/index.html", "./public/404.html", "./public/vinyl/covers.json"], "/[...missing]": ["./public/404.html"], "/crates": ["./public/crates.html", "./public/index.html", "./public/vinyl/covers.json"], "/make": ["./public/vinyl-make.html"], "/top10": ["./public/top10.html"], "/top10/list": ["./public/index.html"], "/og/2026": ["./assets/fonts/*.ttf"], "/landing": ["./public/landing.html", "./public/index.html", "./public/vinyl/covers.json"], "/soon": ["./public/soon.html"] },
  // "/" is the coming soon page (public/soon.html, Casey 2026-11-25), /casey Casey's crates (public/crates.html), and each crate (public/index.html)
  // at /casey/<crate>, the whole crate at /casey/all. The front door with the search box (public/landing.html, src/app/landing) is set aside for later.
  // They and the make page come through src/app/soon, src/app/crates, src/app/home and src/app/make, which add the domain to their link preview tags (src/lib/page.ts)
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/soon" },
        { source: "/casey", destination: "/crates" },
        { source: "/casey/:crate([a-z0-9-]{1,80})", destination: "/home?crate=:crate" },
        { source: "/vinyl-make.html", destination: "/make" },
        // a top 10 of 2026 (Casey, 2026-11-23): /2026 with a list in its address is that list on the crate page, ranked (public/index.html reads
        // the path); bare, it's the maker (public/top10.html through src/app/top10)
        ...["d", "m", "c", "s"].map((key) => ({ source: "/2026", has: [{ type: "query" as const, key }], destination: "/top10/list" })),
        { source: "/2026", destination: "/top10" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  // links to Casey's crate from when it lived at "/" or "/casey" (a shared record ?r=, ?edit, ?dv, ?hints, a visitor list) go to the whole crate,
  // query and all. Old /#record/<slug> and /casey#record/<slug> links never reach the server: public/soon.html and public/crates.html forward those.
  async redirects() {
    return ["/", "/casey"].flatMap((source) =>
      ["r", "edit", "dv", "hints", "d", "m", "c"].map((key) => ({ source, has: [{ type: "query" as const, key }], destination: "/casey/all", permanent: false })),
    );
  },
  // the self-hosted fonts never change under the same name, so browsers can keep them for a year
  async headers() {
    // covers, full size and the grid's small copies, can change under the same name when a cover is refetched, so a day, then
    // refreshed quietly. Kept, the full ones are also there for the baking worker to read again without asking the server
    return [
      { source: "/fonts/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/vinyl/:file([^/]+\\.webp)", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=2592000" }] },
      { source: "/vinyl/t/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=2592000" }] },
    ];
  },
};

export default nextConfig;
