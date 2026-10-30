// A record's liner notes for its open view: the track list by side, for the back of the sleeve,
// and a few lines about the album from Wikipedia. Works for any crate, from whichever ID the record has:
//   ?mb=<release id>&g=<release group id>   MusicBrainz (Casey's records, and visitor crates without Discogs)
//   ?d=<release id>                         Discogs, when DISCOGS_TOKEN is set
//   ?a=<collection id>                      Apple Music
//   &artist=…&title=…                       for finding the Wikipedia article when MusicBrainz has no link to it
// Answers { sides: [{ side: "A", tracks: ["…"] }], about: { text, url } | null }. A side is "" when the
// source doesn't say (a CD or digital release); the back then lists the songs without side breaks.

import { connection, type NextRequest } from "next/server";

const MB = "https://musicbrainz.org/ws/2/";
const UA = "cratedig/1.0 (https://github.com/caseycavanagh/cratedig)";
const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Side = { side: string; tracks: string[] };
type Liner = { sides: Side[]; about: { text: string; url: string } | null };

// answers, kept between requests
const kept = new Map<string, Liner>();

// MusicBrainz asks for at most one request a second
let next = 0;
async function mb(path: string) {
  const wait = next - Date.now();
  next = Math.max(Date.now(), next) + 1100;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(`${MB}${path}&fmt=json`, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
  return res.ok ? res.json() : null;
}
const get = (url: string, headers: Record<string, string> = {}) =>
  fetch(url, { headers: { "User-Agent": UA, ...headers }, cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

// tracks numbered A1, A2, B1… go to their side; anything else stays in its disc, with no side named
function bySide(tracks: { pos: string; title: string; disc?: number }[]): Side[] {
  const sides = new Map<string, Side>();
  for (const t of tracks) {
    const side = t.pos.match(/^([A-Z])\d*$/i)?.[1].toUpperCase() ?? "";
    const key = side || `disc ${t.disc ?? 1}`;
    if (!sides.has(key)) sides.set(key, { side, tracks: [] });
    sides.get(key)!.tracks.push(t.title);
  }
  return [...sides.values()];
}

async function fromMusicBrainz(id: string) {
  const r = await mb(`release/${id}?inc=recordings+release-groups`);
  if (!r) return { sides: [], group: "" };
  const tracks = (r.media ?? []).flatMap((m: { position?: number; tracks?: { number?: string; title: string }[] }) =>
    (m.tracks ?? []).map((t) => ({ pos: t.number ?? "", title: t.title, disc: m.position })),
  );
  return { sides: bySide(tracks), group: (r["release-group"]?.id as string) ?? "" };
}

async function fromDiscogs(id: string) {
  if (!process.env.DISCOGS_TOKEN) return [];
  const r = await get(`https://api.discogs.com/releases/${id}`, { Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}` });
  const list: { position?: string; title: string; type_?: string }[] = r?.tracklist ?? [];
  return bySide(list.filter((t) => (t.type_ ?? "track") === "track").map((t) => ({ pos: t.position ?? "", title: t.title })));
}

async function fromApple(id: string) {
  const r = await get(`https://itunes.apple.com/lookup?id=${id}&entity=song&limit=200`);
  const list: { wrapperType: string; trackName: string; discNumber?: number; trackNumber?: number }[] = r?.results ?? [];
  const songs = list.filter((t) => t.wrapperType === "track").sort((a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
  return bySide(songs.map((t) => ({ pos: "", title: t.trackName, disc: t.discNumber })));
}

// the album's English Wikipedia article: by MusicBrainz's link to it when there is one, else by a search
async function article(group: string, artist: string, title: string) {
  if (MBID.test(group)) {
    const g = await mb(`release-group/${group}?inc=url-rels`);
    const rels: { type: string; url?: { resource: string } }[] = g?.relations ?? [];
    const wiki = rels.find((x) => x.type === "wikipedia" && /\/\/en\.wikipedia\.org\/wiki\//.test(x.url?.resource ?? ""));
    if (wiki) return decodeURIComponent(wiki.url!.resource.split("/wiki/")[1]);
    const q = rels.find((x) => x.type === "wikidata")?.url?.resource.match(/Q\d+$/)?.[0];
    if (q) {
      const d = await get(`https://www.wikidata.org/wiki/Special:EntityData/${q}.json`);
      const t = d?.entities?.[q]?.sitelinks?.enwiki?.title;
      if (t) return t as string;
    }
  }
  if (!title) return null;
  const s = await get(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch=${encodeURIComponent(`${title} ${artist} album`)}`,
  );
  const fold = (x: string) => x.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  // the article is named for the album, maybe with "(album)" or "(The Band album)" after it
  const hit = (s?.query?.search ?? []).find((h: { title: string; snippet: string }) =>
    fold(h.title.replace(/\s*\([^)]*\)$/, "")) === fold(title) && /album|record|LP/i.test(h.snippet),
  );
  return (hit?.title as string) ?? null;
}

async function about(group: string, artist: string, title: string) {
  const name = await article(group, artist, title).catch(() => null);
  if (!name) return null;
  const s = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, "_"))}`);
  if (!s || s.type !== "standard" || !s.extract) return null;
  return { text: s.extract as string, url: (s.content_urls?.desktop?.page as string) ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(name)}` };
}

export async function GET(request: NextRequest) {
  await connection();
  const p = request.nextUrl.searchParams;
  const mbid = p.get("mb") ?? "";
  const d = p.get("d") ?? "";
  const a = p.get("a") ?? "";
  let group = p.get("g") ?? "";
  const artist = (p.get("artist") ?? "").slice(0, 200);
  const title = (p.get("title") ?? "").slice(0, 200);
  if (mbid && !MBID.test(mbid)) return new Response(null, { status: 400 });
  if ((d && !/^\d+$/.test(d)) || (a && !/^\d+$/.test(a)) || (group && !MBID.test(group))) return new Response(null, { status: 400 });

  const key = [mbid, d, a, group, artist, title].join("|");
  let liner = kept.get(key);
  if (!liner) {
    let sides: Side[] = [];
    if (d) sides = await fromDiscogs(d).catch(() => []);
    if (!sides.length && mbid) {
      const m = await fromMusicBrainz(mbid).catch(() => ({ sides: [], group: "" }));
      sides = m.sides;
      group ||= m.group;
    }
    if (!sides.length && a) sides = await fromApple(a).catch(() => []);
    liner = { sides, about: await about(group, artist, title) };
    kept.set(key, liner);
  }
  return Response.json(liner, { headers: { "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=2592000" } });
}
