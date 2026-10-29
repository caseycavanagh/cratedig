// Discogs for visitor crates (public/vinyl-make.html). The token stays on
// the server; set DISCOGS_TOKEN in .env.local (and in Vercel for production), made at
// discogs.com/settings/developers. Discogs allows 60 requests a minute per token.
//   ?q=harvest        vinyl releases matching a search, one per album
//   ?ids=1,2,3        those releases with label, format, front and back, and a Spotify ID
//                     when SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are set
//   ?img=<url>        a Discogs image, passed through so the crate can read its colors

import { connection, type NextRequest } from "next/server";
import { spotifyAlbum } from "@/lib/spotify";

const API = "https://api.discogs.com";
const UA = "caseycavanagh.com-records/1.0 (https://caseycavanagh.com)";

type Release = {
  id: number;
  artist: string;
  title: string;
  year: number | "";
  label: string;
  format: string;
  front: string;
  back: string;
  spotify: string | null;
  discogs: string;
};

// releases, kept between requests
const releases = new Map<number, Release>();

const discogs = (path: string) =>
  fetch(API + path, {
    headers: { Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}`, "User-Agent": UA },
    cache: "no-store",
  });

// "Neil Young (2)" and "Lucinda Williams*" are Discogs' ways of telling artists apart
const name = (s: string) => s.replace(/ \(\d+\)$/, "").replace(/\*$/, "");

async function release(id: number, origin: string): Promise<Release | null> {
  if (releases.has(id)) return releases.get(id)!;
  const res = await discogs(`/releases/${id}`);
  if (!res.ok) return null;
  const r = await res.json();
  const artist = (r.artists ?? [])
    .map((a: { anv?: string; name: string; join?: string }, i: number, all: unknown[]) =>
      name(a.anv || a.name) + (i < all.length - 1 ? ` ${a.join || "&"} ` : ""))
    .join("")
    .replace(/ , /g, ", ");
  const f = r.formats?.[0] ?? {};
  const kind = (f.descriptions ?? []).includes("LP") ? "LP" : f.descriptions?.[0] || f.name || "";
  const img = (i?: { uri?: string }) => (i?.uri ? `${origin}/api/discogs?img=${encodeURIComponent(i.uri)}` : "");
  const images: { type: string; uri: string }[] = r.images ?? [];
  const out: Release = {
    id,
    artist,
    title: r.title,
    year: r.year || "",
    label: name(r.labels?.[0]?.name ?? ""),
    format: (+f.qty > 1 ? `${f.qty}×` : "") + kind,
    front: img(images.find((i) => i.type === "primary") ?? images[0]),
    back: img(images.find((i) => i.type === "secondary")), // usually the back of the jacket
    spotify: await spotifyAlbum(r.title, artist).catch(() => null),
    discogs: r.uri ?? "",
  };
  releases.set(id, out);
  return out;
}

export async function GET(request: NextRequest) {
  await connection();
  const p = request.nextUrl.searchParams;

  const img = p.get("img");
  if (img) {
    if (!img.startsWith("https://i.discogs.com/")) return new Response(null, { status: 400 });
    const res = await fetch(img, { headers: { "User-Agent": UA } });
    if (!res.ok) return new Response(null, { status: res.status });
    return new Response(res.body, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  if (!process.env.DISCOGS_TOKEN) return Response.json({ configured: false }, { status: 503 });

  const q = p.get("q")?.trim();
  if (q) {
    const url = new URLSearchParams({ q, type: "release", format: "Vinyl", per_page: "50" });
    const res = await discogs(`/database/search?${url}`);
    if (!res.ok) return Response.json({ configured: true, results: [] }, { status: res.status === 429 ? 429 : 502 });
    const seen = new Set<number>();
    const results = ((await res.json()).results ?? [])
      .filter((r: { master_id?: number; id: number }) => {
        const k = r.master_id || r.id; // many pressings of one album: keep the first
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 24)
      .map((r: { id: number; title: string; year?: string; cover_image?: string; thumb?: string }) => {
        const [artist, ...rest] = r.title.split(" - ");
        return { id: r.id, artist: name(artist), title: rest.join(" - ") || artist, year: r.year ?? "", thumb: r.cover_image || r.thumb || "" };
      });
    return Response.json({ configured: true, results }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  }

  const ids = (p.get("ids") ?? "").split(",").map(Number).filter((n) => n > 0).slice(0, 100);
  if (!ids.length) return Response.json({ configured: true });
  const origin = request.nextUrl.origin;
  const out: (Release | null)[] = [];
  for (let i = 0; i < ids.length; i += 5) {
    out.push(...(await Promise.all(ids.slice(i, i + 5).map((id) => release(id, origin).catch(() => null)))));
  }
  return Response.json(
    { configured: true, records: out.filter(Boolean) },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
