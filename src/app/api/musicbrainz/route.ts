// MusicBrainz and the Cover Art Archive for visitor crates (public/vinyl-make.html):
// no key needed, so it's the source until DISCOGS_TOKEN is set. MusicBrainz asks for at most
// one request a second, so the crate page loads every record in one search by ID.
//   ?q=harvest        albums (release groups) matching a search
//   ?pick=<group id>  the album's best pressing: vinyl with a scanned back if there is one
//   ?ids=<mbid>,...   those releases with label, format, front and back, and a Spotify ID
//   ?img=<path>       a Cover Art Archive image, passed through so the crate can read its colors

import { connection, type NextRequest } from "next/server";
import { spotifyAlbum } from "@/lib/spotify";

const MB = "https://musicbrainz.org/ws/2/";
const CAA = "https://coverartarchive.org/";
const UA = "caseycavanagh.com-records/1.0 (https://caseycavanagh.com)";
const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type MbRelease = {
  id: string;
  title: string;
  date?: string;
  "artist-credit"?: { name: string; joinphrase?: string }[];
  "release-group"?: { id: string; "primary-type"?: string };
  media?: { format?: string }[];
  "label-info"?: { label?: { name: string } }[];
  "cover-art-archive"?: { front: boolean; back: boolean };
};
type MbGroup = {
  id: string;
  title: string;
  "first-release-date"?: string;
  "primary-type"?: string;
  "artist-credit"?: { name: string; joinphrase?: string }[];
};
type CaaImage = { front: boolean; back: boolean; image: string; thumbnails: Record<string, string> };

// releases, kept between requests
const releases = new Map<string, object>();

let next = 0;
async function mb(path: string) {
  const wait = next - Date.now();
  next = Math.max(Date.now(), next) + 1100;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return fetch(`${MB}${path}&fmt=json`, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
}

const artistOf = (r: MbRelease | MbGroup) => (r["artist-credit"] ?? []).map((a) => a.name + (a.joinphrase ?? "")).join("");
const isVinyl = (r: MbRelease) => (r.media ?? []).some((m) => /vinyl/i.test(m.format ?? ""));
const format = (r: MbRelease) => {
  const vinyl = (r.media ?? []).filter((m) => /vinyl/i.test(m.format ?? "")).length;
  return vinyl ? (vinyl > 1 ? `${vinyl}×LP` : "LP") : (r.media?.[0]?.format ?? "");
};

export async function GET(request: NextRequest) {
  await connection();
  const p = request.nextUrl.searchParams;
  const origin = request.nextUrl.origin;
  const img = (path: string) => `${origin}/api/musicbrainz?img=${encodeURIComponent(path)}`;

  const path = p.get("img");
  if (path) {
    if (!/^release(-group)?\/[0-9a-f-]{36}\/[\w-]+(\.\w+)?$/.test(path)) return new Response(null, { status: 400 });
    const res = await fetch(CAA + path, { headers: { "User-Agent": UA } });
    if (!res.ok) return new Response(null, { status: res.status });
    return new Response(res.body, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const q = p.get("q")?.trim();
  if (q) {
    // whole albums, not pressings: a release search buries albums under dozens of CD and
    // digital editions. dismax searches titles and artists together, so "neil young harvest" works
    const res = await mb(`release-group?query=${encodeURIComponent(q)}&dismax=true&limit=40`);
    if (!res.ok) return Response.json({ results: [] }, { status: res.status === 503 ? 429 : 502 });
    const results = ((await res.json())["release-groups"] ?? [])
      .filter((g: MbGroup) => !g["primary-type"] || g["primary-type"] === "Album" || g["primary-type"] === "EP")
      .slice(0, 24)
      .map((g: MbGroup) => ({
        id: g.id,
        artist: artistOf(g),
        title: g.title,
        year: (g["first-release-date"] ?? "").slice(0, 4),
        thumb: img(`release-group/${g.id}/front-250`),
      }));
    return Response.json({ results }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  }

  const group = p.get("pick");
  if (group) {
    if (!MBID.test(group)) return new Response(null, { status: 400 });
    const res = await mb(`release?release-group=${group}&inc=media+labels&limit=100`);
    if (!res.ok) return Response.json({}, { status: res.status === 503 ? 429 : 502 });
    const list: MbRelease[] = (await res.json()).releases ?? [];
    const art = (r: MbRelease) => r["cover-art-archive"] ?? { front: false, back: false };
    // vinyl with both sides scanned, then vinyl with a front, then anything with a front
    const best =
      list.find((r) => isVinyl(r) && art(r).front && art(r).back) ??
      list.find((r) => isVinyl(r) && art(r).front) ??
      list.find((r) => isVinyl(r)) ??
      list.find((r) => art(r).front && art(r).back) ??
      list.find((r) => art(r).front) ??
      list[0];
    return Response.json({ id: best?.id ?? null }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  }

  const ids = (p.get("ids") ?? "").split(",").filter((id) => MBID.test(id)).slice(0, 100);
  if (!ids.length) return Response.json({ records: [] });
  const missing = ids.filter((id) => !releases.has(id));
  if (missing.length) {
    const res = await mb(`release?query=${encodeURIComponent(missing.map((id) => `reid:${id}`).join(" OR "))}&limit=100`);
    if (!res.ok) return Response.json({ records: [] }, { status: 502 });
    const found: MbRelease[] = (await res.json()).releases ?? [];
    for (let i = 0; i < found.length; i += 5) {
      await Promise.all(
        found.slice(i, i + 5).map(async (r) => {
          // which of this release's images are the front and back
          const art = await fetch(`${CAA}release/${r.id}`, { headers: { "User-Agent": UA } })
            .then((res) => (res.ok ? res.json() : { images: [] }))
            .catch(() => ({ images: [] }));
          const images: CaaImage[] = art.images ?? [];
          const pick = (side: "front" | "back") => {
            const i = images.find((i) => i[side]);
            const id = i?.image.match(/\/([\w-]+)\.\w+$/)?.[1];
            return id ? img(`release/${r.id}/${id}-1200.jpg`) : "";
          };
          const artist = artistOf(r);
          releases.set(r.id, {
            id: r.id,
            group: r["release-group"]?.id ?? "",
            artist,
            title: r.title,
            year: (r.date ?? "").slice(0, 4),
            label: r["label-info"]?.[0]?.label?.name ?? "",
            format: format(r),
            front: pick("front") || (r["release-group"] ? img(`release-group/${r["release-group"].id}/front-1200`) : ""),
            back: pick("back"),
            spotify: await spotifyAlbum(r.title, artist).catch(() => null),
          });
        }),
      );
    }
  }
  return Response.json(
    { records: ids.map((id) => releases.get(id)).filter(Boolean) },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
