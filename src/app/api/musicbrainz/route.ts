// MusicBrainz and the Cover Art Archive for visitor crates (public/vinyl-make.html):
// no key needed, so it's the source until DISCOGS_TOKEN is set. MusicBrainz asks for at most
// one request a second, so the crate page loads every record in one search by ID.
//   ?q=harvest        albums (release groups) matching a search
//   &albums=1         (the top 10 maker) studio albums and EPs only, the artist's own first and newest first
//   ?barcode=<digits>  releases with that barcode, for scanning a record
//   ?pick=<group id>  the album's best pressing: vinyl with a scanned back if there is one
//   ?ids=<mbid>,...   those releases with label, format, front and back, and a Spotify ID
//   ?img=<path>       a Cover Art Archive image, passed through so the crate can read its colors

import { connection, type NextRequest } from "next/server";
import { spotifyAlbum } from "@/lib/spotify";
import { kv } from "@/lib/kv";

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
  "secondary-types"?: string[];
  "artist-credit"?: { name: string; joinphrase?: string }[];
};
type CaaImage = { front: boolean; back: boolean; image: string; thumbnails: Record<string, string> };

// releases, kept between requests
const releases = new Map<string, object>();

let next = 0;
async function mb(path: string, tries = 2): Promise<Response> {
  const wait = next - Date.now();
  next = Math.max(Date.now(), next) + 1100;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(`${MB}${path}&fmt=json`, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" }).catch(() => null);
  // MusicBrainz turns a busy moment away with a 503: wait our turn and ask once more
  if ((!res || res.status === 503 || res.status >= 500) && tries > 1) return mb(path, tries - 1);
  return res ?? new Response(null, { status: 502 });
}

// releases a shared list has already looked up, kept in Redis so a list opens without asking MusicBrainz again
const KEEP = 60 * 60 * 24 * 30;
async function kept(ids: string[]) {
  const run = kv();
  if (!run || !ids.length) return;
  try {
    const got = (await run([["MGET", ...ids.map((id) => `mb:rel:${id}`)]]))[0] as (string | null)[];
    got.forEach((v, i) => { if (v) releases.set(ids[i], JSON.parse(v)); });
  } catch {}
}
async function keep(list: { id: string }[]) {
  const run = kv();
  if (!run || !list.length) return;
  try { await run(list.map((r) => ["SET", `mb:rel:${r.id}`, JSON.stringify(r), "EX", KEEP])); } catch {}
}

// "Rosalía" and "rosalia" are the same name
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// the words of a search, safe inside a Lucene query
const words = (q: string) => q.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, " ").split(/\s+/).filter(Boolean).slice(0, 8).map((w) => w.toLowerCase());
// studio albums and EPs: no live sets, best-ofs, soundtracks, remixes, mixtapes or tributes
const NOT = "live OR compilation OR soundtrack OR remix OR dj-mix OR mixtape/street OR interview OR spokenword OR demo OR audiobook OR audio drama";
const albumsQuery = (t: string[]) =>
  `(artist:"${t.join(" ")}"^4 OR releasegroup:"${t.join(" ")}"^2 OR (${t.map((w) => `(artist:${w} OR releasegroup:${w})`).join(" AND ")})) AND primarytype:(album OR ep) AND NOT secondarytype:(${NOT.split(" OR ").map((x) => `"${x}"`).join(" OR ")})`;

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
  if (q && p.get("albums")) {
    // the top 10 maker: "Bad Bunny" should bring up Bad Bunny's albums, newest first, not every title with the words in it
    const t = words(q);
    if (!t.length) return Response.json({ results: [] });
    const res = await mb(`release-group?query=${encodeURIComponent(albumsQuery(t))}&limit=60`);
    if (!res.ok) return Response.json({ results: [] }, { status: res.status === 503 ? 429 : 502 });
    const want = fold(q);
    const groups: MbGroup[] = (await res.json())["release-groups"] ?? [];
    const scored = groups.map((g, i) => {
      const a = fold(artistOf(g));
      // their own: the search is the artist's name, or starts with it ("geese getting killed")
      const own = a && (want === a || want.startsWith(a + " ")) ? 0 : 1;
      return { g, i, own, year: +(g["first-release-date"] ?? "").slice(0, 4) || 0 };
    });
    scored.sort((x, y) => x.own - y.own || (x.own === 0 ? y.year - x.year : 0) || x.i - y.i);
    const results = scored.slice(0, 24).map(({ g }) => ({
      id: g.id,
      artist: artistOf(g),
      title: g.title,
      year: (g["first-release-date"] ?? "").slice(0, 4),
      thumb: img(`release-group/${g.id}/front-250`),
    }));
    return Response.json({ results }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  }
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

  // a scanned barcode: the pressing itself. A UPC read as EAN-13 has a leading 0, and MusicBrainz may hold either
  const code = p.get("barcode")?.replace(/\D/g, "");
  if (code) {
    if (code.length < 8 || code.length > 14) return Response.json({ results: [] }, { status: 400 });
    const alt = code.length === 13 && code[0] === "0" ? code.slice(1) : code.length === 12 ? "0" + code : "";
    const res = await mb(`release?query=${encodeURIComponent(`barcode:${code}${alt ? ` OR barcode:${alt}` : ""}`)}&limit=10`);
    if (!res.ok) return Response.json({ results: [] }, { status: res.status === 503 ? 429 : 502 });
    const list: MbRelease[] = (await res.json()).releases ?? [];
    // vinyl first, since that's what's in hand
    const results = [...list.filter(isVinyl), ...list.filter((r) => !isVinyl(r))].slice(0, 5).map((r) => ({
      id: r.id,
      artist: artistOf(r),
      title: r.title,
      year: (r.date ?? "").slice(0, 4),
      thumb: r["release-group"] ? img(`release-group/${r["release-group"].id}/front-250`) : "",
    }));
    return Response.json({ results }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  }

  const group = p.get("pick");
  if (group) {
    if (!MBID.test(group)) return new Response(null, { status: 400 });
    const res = await mb(`release?release-group=${group}&inc=media+labels&limit=100`);
    if (!res.ok) return Response.json({}, { status: res.status === 503 ? 429 : 502 });
    const all: MbRelease[] = (await res.json()).releases ?? [];
    // the album under its usual name: a Japanese or translated edition of "Man’s Best Friend" titles it in another script
    const count = new Map<string, number>();
    for (const r of all) count.set(r.title, (count.get(r.title) ?? 0) + 1);
    const usual = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
    const art = (r: MbRelease) => r["cover-art-archive"] ?? { front: false, back: false };
    // vinyl with both sides scanned, then vinyl with a front, then anything with a front
    const pickFrom = (list: MbRelease[]) =>
      list.find((r) => isVinyl(r) && art(r).front && art(r).back) ??
      list.find((r) => isVinyl(r) && art(r).front) ??
      list.find((r) => isVinyl(r)) ??
      list.find((r) => art(r).front && art(r).back) ??
      list.find((r) => art(r).front) ??
      list[0];
    const best = pickFrom(all.filter((r) => r.title === usual)) ?? pickFrom(all);
    return Response.json({ id: best?.id ?? null }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  }

  const ids = (p.get("ids") ?? "").split(",").filter((id) => MBID.test(id)).slice(0, 100);
  if (!ids.length) return Response.json({ records: [] });
  await kept(ids.filter((id) => !releases.has(id)));
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
    await keep(missing.map((id) => releases.get(id) as { id: string } | undefined).filter((r): r is { id: string } => !!r));
  }
  return Response.json(
    { records: ids.map((id) => releases.get(id)).filter(Boolean) },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
