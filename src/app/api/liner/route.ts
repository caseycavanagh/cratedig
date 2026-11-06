// A record's liner notes for its open view: the track list by side, for the back of the sleeve,
// and a few lines about the album from Wikipedia. Works for any crate, from whichever ID the record has:
//   ?mb=<release id>&g=<release group id>   MusicBrainz (Casey's records, and visitor crates without Discogs)
//   ?d=<release id>                         Discogs, when DISCOGS_TOKEN is set
//   ?a=<collection id>                      Apple Music
//   &artist=…&title=…                       for finding the Wikipedia article when MusicBrainz has no link to it
// Answers { sides: [{ side: "A", tracks: ["…"] }], about: { text, url } | null, minutes, genres, credits }.
// A side is "" when the source doesn't say (a CD or digital release); the back then lists the songs without
// side breaks. About is written from the article (src/lib/about.ts); genres are MusicBrainz's, the album's or
// else the artist's; credits (producer, studio, recorded, players, sleeve) come from the article's infobox
// and Personnel list. Answers are kept in Upstash for a month, so each album is looked up and written once.

import { connection, type NextRequest } from "next/server";
import { kv } from "@/lib/kv";
import { article as readArticle, makingText, plainAbout } from "@/lib/wiki";
import { summarize } from "@/lib/about";

const MB = "https://musicbrainz.org/ws/2/";
const UA = "cratedig/1.0 (https://github.com/caseycavanagh/cratedig)";
const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Side = { side: string; tracks: string[] };
type Credits = { producer: string[]; studio: string[]; recorded: string; players: [string, string][]; sleeve: [string, string][] };
type Liner = { sides: Side[]; minutes: number; about: { text: string; url: string } | null; genres: string[]; credits: Credits | null; keyed?: boolean };
const VERSION = "v2";

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
  if (!r) return { sides: [], group: "", ms: 0 };
  const tracks = (r.media ?? []).flatMap((m: { position?: number; tracks?: { number?: string; title: string; length?: number }[] }) =>
    (m.tracks ?? []).map((t) => ({ pos: t.number ?? "", title: t.title, disc: m.position, ms: t.length ?? 0 })),
  );
  return { sides: bySide(tracks), group: (r["release-group"]?.id as string) ?? "", ms: tracks.reduce((n: number, t: { ms: number }) => n + t.ms, 0) };
}

const clock = (d = "") => d.split(":").reduce((n, x) => n * 60 + (parseInt(x) || 0), 0) * 1000;
async function fromDiscogs(id: string) {
  if (!process.env.DISCOGS_TOKEN) return { sides: [], ms: 0 };
  const r = await get(`https://api.discogs.com/releases/${id}`, { Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}` });
  const list: { position?: string; title: string; type_?: string; duration?: string }[] = (r?.tracklist ?? []).filter((t: { type_?: string }) => (t.type_ ?? "track") === "track");
  return { sides: bySide(list.map((t) => ({ pos: t.position ?? "", title: t.title }))), ms: list.reduce((n, t) => n + clock(t.duration), 0) };
}

async function fromApple(id: string) {
  const r = await get(`https://itunes.apple.com/lookup?id=${id}&entity=song&limit=200`);
  const list: { wrapperType: string; trackName: string; discNumber?: number; trackNumber?: number; trackTimeMillis?: number }[] = r?.results ?? [];
  const songs = list.filter((t) => t.wrapperType === "track").sort((a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
  return { sides: bySide(songs.map((t) => ({ pos: "", title: t.trackName, disc: t.discNumber }))), ms: songs.reduce((n, t) => n + (t.trackTimeMillis ?? 0), 0) };
}

// MusicBrainz's genres, most votes first: the album's, else the artist's
const top = (gs: { name: string; count: number }[] = []) =>
  gs.filter((g) => g.count > 0).sort((a, b) => b.count - a.count).slice(0, 3).map((g) => g.name[0].toUpperCase() + g.name.slice(1));

// the album's English Wikipedia article: by MusicBrainz's link to it when there is one, else by a search.
// The same MusicBrainz answer carries the album's genres.
async function article(group: string, artist: string, title: string): Promise<{ name: string | null; genres: string[] }> {
  let genres: string[] = [];
  if (MBID.test(group)) {
    const g = await mb(`release-group/${group}?inc=url-rels+genres+artist-credits`);
    genres = top(g?.genres);
    const who = g?.["artist-credit"]?.[0]?.artist?.id as string | undefined;
    if (!genres.length && who && MBID.test(who)) genres = top((await mb(`artist/${who}?inc=genres`))?.genres);
    const rels: { type: string; url?: { resource: string } }[] = g?.relations ?? [];
    const wiki = rels.find((x) => x.type === "wikipedia" && /\/\/en\.wikipedia\.org\/wiki\//.test(x.url?.resource ?? ""));
    if (wiki) return { name: decodeURIComponent(wiki.url!.resource.split("/wiki/")[1]), genres };
    const q = rels.find((x) => x.type === "wikidata")?.url?.resource.match(/Q\d+$/)?.[0];
    if (q) {
      const d = await get(`https://www.wikidata.org/wiki/Special:EntityData/${q}.json`);
      const t = d?.entities?.[q]?.sitelinks?.enwiki?.title;
      if (t) return { name: t as string, genres };
    }
  }
  if (!title) return { name: null, genres };
  const s = await get(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch=${encodeURIComponent(`${title} ${artist} album`)}`,
  );
  const fold = (x: string) => x.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  // the article is named for the album, maybe with "(album)" or "(The Band album)" after it
  const hit = (s?.query?.search ?? []).find((h: { title: string; snippet: string }) =>
    fold(h.title.replace(/\s*\([^)]*\)$/, "")) === fold(title) && /album|record|LP/i.test(h.snippet),
  );
  return { name: (hit?.title as string) ?? null, genres };
}

async function notes(group: string, artist: string, title: string) {
  const { name, genres } = await article(group, artist, title).catch(() => ({ name: null, genres: [] as string[] }));
  const a = name ? await readArticle(name.replace(/_/g, " "), artist).catch(() => null) : null;
  if (!a) return { about: null, genres, credits: null };
  const text = (await summarize(makingText(a))) ?? plainAbout(a);
  const { producer, studio, recorded, players, sleeve } = a;
  return { about: text ? { text, url: a.url } : null, genres, credits: { producer, studio, recorded, players, sleeve } };
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

  const key = [VERSION, mbid, d, a, group, artist, title].join("|");
  const store = kv();
  let liner = kept.get(key);
  if (!liner && store) liner = await store([["GET", `crate:liner:${key}`]]).then((r) => (r[0] ? (JSON.parse(r[0] as string) as Liner) : undefined)).catch(() => undefined);
  // an answer kept from before ANTHROPIC_API_KEY was set has the plain About: look it up again, once, to write it
  const keyed = !!process.env.ANTHROPIC_API_KEY;
  if (liner?.about && keyed && !liner.keyed) liner = undefined;
  if (!liner) {
    let t: { sides: Side[]; ms: number } = { sides: [], ms: 0 };
    if (d) t = await fromDiscogs(d).catch(() => t);
    if (!t.sides.length && mbid) {
      const m = await fromMusicBrainz(mbid).catch(() => ({ sides: [], group: "", ms: 0 }));
      t = m;
      group ||= m.group;
    }
    if (!t.sides.length && a) t = await fromApple(a).catch(() => t);
    liner = { sides: t.sides, minutes: Math.round(t.ms / 60000), ...(await notes(group, artist, title)), keyed };
    if (store && (liner.sides.length || liner.about)) await store([["SET", `crate:liner:${key}`, JSON.stringify(liner), "EX", 2592000]]).catch(() => null);
  }
  kept.set(key, liner);
  return Response.json(liner, { headers: { "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=2592000" } });
}
