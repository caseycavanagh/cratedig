// A record's liner notes for its open view: the track list by side, for the back of the sleeve,
// and a few lines about the album from Wikipedia. Works for any crate, from whichever ID the record has:
//   ?mb=<release id>&g=<release group id>   MusicBrainz (Casey's records, and visitor crates without Discogs)
//   ?d=<release id>                         Discogs, when DISCOGS_TOKEN is set
//   ?a=<collection id>                      Apple Music
//   &artist=…&title=…                       for finding the Wikipedia article when MusicBrainz has no link to it
// Answers { sides: [{ side: "A", tracks: ["…"] }], about: { text, url } | null, minutes, genres, credits }.
// A side is "" when the source doesn't say (a CD or digital release); the back then lists the songs without
// side breaks. About is written from the article (src/lib/about.ts); genres are Discogs styles when Discogs knows
// the album, else MusicBrainz's, the album's or else the artist's; credits (producer, studio, recorded, players,
// sleeve) come from the article's infobox and Personnel list. Answers are kept in Upstash for a month, so each album is looked up and written once (one without an About for a week);
// an answer put together while a source was down or rate-limiting isn't kept, and says partial: true.

import { connection, type NextRequest } from "next/server";
import { kv } from "@/lib/kv";
import { article as readArticle, makingText, plainAbout } from "@/lib/wiki";
import { summarize } from "@/lib/about";
import { watch, shaky, troubled } from "@/lib/shaky";

const MB = "https://musicbrainz.org/ws/2/";
const UA = "cratedig/1.0 (https://github.com/caseycavanagh/cratedig)";
const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Side = { side: string; tracks: string[] };
type Credits = { producer: string[]; studio: string[]; recorded: string; players: [string, string][]; sleeve: [string, string][] };
type Liner = { sides: Side[]; minutes: number; about: { text: string; url: string } | null; genres: string[]; credits: Credits | null; keyed?: boolean; styled?: boolean; whole?: boolean };
const VERSION = "v2";

// answers, kept between requests
const kept = new Map<string, Liner>();

// MusicBrainz asks for at most one request a second, and answers 503 when it's asked faster: then it's asked once more
let next = 0;
async function mb(path: string) {
  for (let tries = 2; tries--; ) {
    const wait = next - Date.now();
    next = Math.max(Date.now(), next) + 1100;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const res = await fetch(`${MB}${path}&fmt=json`, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" }).catch(() => null);
    if (res?.ok) return res.json();
    if (res && !troubled(res.status)) return null;
  }
  shaky();
  return null;
}
const get = (url: string, headers: Record<string, string> = {}) =>
  fetch(url, { headers: { "User-Agent": UA, ...headers }, cache: "no-store" })
    .then((r) => {
      if (troubled(r.status)) shaky();
      return r.ok ? r.json() : null;
    })
    .catch(() => {
      shaky();
      return null;
    });

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

// Discogs styles (Alt-Country, Neo Soul…), which name an album more closely than MusicBrainz's genres. Reading a
// master or release needs no token, so any crate gets them: Discogs records by their own ID, the rest through
// MusicBrainz's link to Discogs.
type Rel = { type: string; url?: { resource: string } };
async function styles(path: string): Promise<string[]> {
  const t = process.env.DISCOGS_TOKEN;
  const r = await get(`https://api.discogs.com/${path}`, t ? { Authorization: `Discogs token=${t}` } : {});
  return ((r?.styles ?? []) as string[]).slice(0, 3);
}
function discogsPath(rels: Rel[]) {
  const urls = rels.filter((x) => x.type === "discogs").map((x) => x.url?.resource ?? "");
  const m = urls.map((u) => u.match(/discogs\.com\/master\/(\d+)/)?.[1]).find(Boolean);
  if (m) return `masters/${m}`;
  const r = urls.map((u) => u.match(/discogs\.com\/release\/(\d+)/)?.[1]).find(Boolean);
  return r ? `releases/${r}` : "";
}

// a record's genres: Discogs styles when Discogs knows the album, else MusicBrainz's
async function genresOf(g: { genres?: { name: string; count: number }[]; relations?: Rel[]; "artist-credit"?: { artist?: { id?: string } }[] } | null, d: string) {
  const path = d ? `releases/${d}` : discogsPath(g?.relations ?? []);
  const s = path ? await styles(path).catch(() => []) : [];
  if (s.length) return s;
  let genres = top(g?.genres);
  const who = g?.["artist-credit"]?.[0]?.artist?.id;
  if (!genres.length && who && MBID.test(who)) genres = top((await mb(`artist/${who}?inc=genres`))?.genres);
  return genres;
}

// the album's English Wikipedia article: by MusicBrainz's link to it when there is one, else by a search.
// The same MusicBrainz answer carries the album's genres and its link to Discogs.
async function article(group: string, artist: string, title: string, d: string): Promise<{ name: string | null; genres: string[] }> {
  let genres: string[] = [];
  if (!MBID.test(group)) genres = d ? await styles(`releases/${d}`).catch(() => []) : [];
  if (MBID.test(group)) {
    const g = await mb(`release-group/${group}?inc=url-rels+genres+artist-credits`);
    genres = await genresOf(g, d);
    const rels: Rel[] = g?.relations ?? [];
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

async function notes(group: string, artist: string, title: string, d: string) {
  const { name, genres } = await article(group, artist, title, d).catch(() => ({ name: null, genres: [] as string[] }));
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
  // an answer kept without an About, from before answers said whether every source answered: look it up again, once,
  // since a source that was down then may have left the About out
  if (liner && !liner.about && !liner.whole) liner = undefined;
  let shook = false;
  // an answer kept from before Discogs styles: look up its genres again, once, and keep the rest
  if (liner && !liner.styled) {
    const was = liner;
    const { value: genres, shaky: rough } = await watch(async () => {
      const g0 = group || (mbid ? (await fromMusicBrainz(mbid).catch(() => ({ group: "" }))).group : "");
      const g = MBID.test(g0) ? await mb(`release-group/${g0}?inc=url-rels+genres+artist-credits`).catch(() => null) : null;
      return g || d ? await genresOf(g, d).catch(() => was.genres) : was.genres;
    });
    if (!rough) {
      liner = { ...liner, genres, styled: true };
      if (store) await store([["SET", `crate:liner:${key}`, JSON.stringify(liner), "EX", 2592000]]).catch(() => null);
    }
  }
  if (!liner) {
    const { value, shaky: rough } = await watch(async () => {
      let t: { sides: Side[]; ms: number } = { sides: [], ms: 0 };
      if (d) t = await fromDiscogs(d).catch(() => t);
      if (!t.sides.length && mbid) {
        const m = await fromMusicBrainz(mbid).catch(() => ({ sides: [], group: "", ms: 0 }));
        t = m;
        group ||= m.group;
      }
      if (!t.sides.length && a) t = await fromApple(a).catch(() => t);
      return { sides: t.sides, minutes: Math.round(t.ms / 60000), ...(await notes(group, artist, title, d)), keyed, styled: true };
    });
    liner = { ...value, whole: !rough };
    shook = rough;
    // kept a month; one without an About is looked up again after a week, in case its article turns up.
    // One put together while a source was in trouble isn't kept at all, so the next look asks again
    if (store && !rough && (liner.sides.length || liner.about)) await store([["SET", `crate:liner:${key}`, JSON.stringify(liner), "EX", liner.about ? 2592000 : 604800]]).catch(() => null);
  }
  if (shook) return Response.json({ ...liner, partial: true }, { headers: { "Cache-Control": "no-store" } });
  kept.set(key, liner);
  const age = liner.about ? "s-maxage=604800, stale-while-revalidate=2592000" : "s-maxage=86400";
  return Response.json(liner, { headers: { "Cache-Control": `public, ${age}` } });
}
