// Spotify album matches for visitor crates (api/discogs, api/musicbrainz), with an app
// token (client credentials) from SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.
// Without them every match is null and the crate leaves out its Play button.

import { kv } from "@/lib/kv";

let token: { value: string; expires: number } | null = null;
const albums = new Map<string, string | null>();

async function spotifyToken() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return token.value;
}

export async function spotifyAlbum(title: string, artist: string): Promise<string | null> {
  const key = `${artist}\u0000${title}`.toLowerCase();
  if (albums.has(key)) return albums.get(key)!;
  const auth = await spotifyToken();
  if (!auth) return null;
  const url = new URL("https://api.spotify.com/v1/search");
  url.search = new URLSearchParams({ q: `album:${title} artist:${artist}`, type: "album", limit: "1" }).toString();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${auth}` }, cache: "no-store" });
  if (!res.ok) return null; // not kept, so a rate limit is retried next time
  const id: string | null = (await res.json())?.albums?.items?.[0]?.id ?? null;
  albums.set(key, id);
  return id;
}

// The top 10 maker's search (api/spotify): Spotify's albums, with a year filter, so "2026" means out in 2026.
// A search result is the album's simple face (no label); albums() asks for each in full, kept in Redis like MusicBrainz releases.
type SpImage = { url: string; width: number };
type SpAlbum = {
  id: string;
  name: string;
  album_type: string;
  release_date?: string;
  images?: SpImage[];
  artists?: { name: string }[];
  label?: string;
  total_tracks?: number;
};
const near = (imgs: SpImage[] = [], w: number) => [...imgs].sort((a, b) => Math.abs(a.width - w) - Math.abs(b.width - w))[0]?.url ?? "";
export const spotifyRecord = (a: SpAlbum) => ({
  id: a.id,
  artist: (a.artists ?? []).map((x) => x.name).join(", "),
  title: a.name,
  year: (a.release_date ?? "").slice(0, 4),
  label: a.label ?? "",
  format: "",
  front: near(a.images, 640),
  thumb: near(a.images, 300),
  back: "",
  spotify: a.id,
});
export type SpotifyRecord = ReturnType<typeof spotifyRecord>;

async function sp(path: string): Promise<Response | null> {
  const auth = await spotifyToken();
  if (!auth) return null;
  const go = () => fetch(`https://api.spotify.com/v1/${path}`, { headers: { Authorization: `Bearer ${auth}` }, cache: "no-store", signal: AbortSignal.timeout(6000) }).catch(() => null);
  let res = await go();
  // a rate limit says how long to wait: one more try if it's short
  if (res?.status === 429) {
    const s = +(res.headers.get("Retry-After") ?? "1");
    if (s <= 2) { await new Promise((r) => setTimeout(r, s * 1000)); res = await go(); }
  }
  return res;
}
export const spotifyReady = () => !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);

// albums and EPs only: no singles or compilations. Spotify's plain search mixes in anything with the word in it (wildlife sounds for "geese"),
// so the artist's own albums come first, then album titles, then the rest. New apps get at most 10 a page
export async function spotifySearch(term: string, year?: string): Promise<SpotifyRecord[] | null> {
  const t = term.replace(/[:"]/g, " ").replace(/\s+/g, " ").trim(), y = year ? ` year:${year}` : "";
  const ask = (q: string) => sp(`search?${new URLSearchParams({ q, type: "album", limit: "10", market: "US" })}`);
  const pages = await Promise.all([ask(`artist:"${t}"${y}`), ask(`album:"${t}"${y}`), ask(t + y)]);
  if (!pages.some((r) => r?.ok)) return null;
  const seen = new Set<string>(), out: SpotifyRecord[] = [];
  for (const res of pages) {
    if (!res?.ok) continue;
    for (const a of ((await res.json())?.albums?.items ?? []) as (SpAlbum | null)[]) {
      if (!a || a.album_type !== "album" && !(a.album_type === "single" && (a.total_tracks ?? 0) >= 4)) continue;
      if (/\b(live|en vivo|ao vivo|karaoke|instrumental version|tribute|lullaby|sleep sounds|nature sounds)\b/i.test(a.name)) continue;
      const r = spotifyRecord(a), k = `${r.artist}\u0000${r.title}`.toLowerCase();
      if (seen.has(k)) continue; // the clean and explicit editions are one album
      seen.add(k); out.push(r);
    }
  }
  return out;
}

const full = new Map<string, SpotifyRecord>();
export async function spotifyAlbums(ids: string[]): Promise<SpotifyRecord[]> {
  const run = kv();
  const want = ids.filter((id) => !full.has(id));
  if (run && want.length) {
    try {
      const got = (await run([["MGET", ...want.map((id) => `sp:alb:${id}`)]]))[0] as (string | null)[];
      got.forEach((v, i) => { if (v) full.set(want[i], JSON.parse(v)); });
    } catch {}
  }
  const missing = ids.filter((id) => !full.has(id));
  const fresh: SpotifyRecord[] = [];
  await Promise.all(missing.map(async (id) => {
    const res = await sp(`albums/${id}?market=US`);
    if (!res?.ok) return;
    const r = spotifyRecord(await res.json());
    full.set(id, r); fresh.push(r);
  }));
  if (run && fresh.length) { try { await run(fresh.map((r) => ["SET", `sp:alb:${r.id}`, JSON.stringify(r), "EX", 60 * 60 * 24 * 30])); } catch {} }
  return ids.map((id) => full.get(id)).filter((r): r is SpotifyRecord => !!r);
}

// one album, whatever the edition: "The Great Divide: The Last Of The Bugs", "Melodie (Deluxe)" and "Melodie - Expanded" are the album they start with
const edition = (t: string) => t.toLowerCase().replace(/\s*[([].*$/, "").replace(/\s+-\s.*$/, "").replace(/:\s.*$/, "").trim() || t.toLowerCase();

// what the maker shows before you type: Spotify's albums out that year, in its own order (its best known first). Its new-releases
// list isn't open to this app, so this is a search for the year alone
export async function spotifyNew(year: string): Promise<SpotifyRecord[] | null> {
  const pages = await Promise.all([0, 10, 20, 30, 40].map((offset) => sp(`search?${new URLSearchParams({ q: `year:${year}`, type: "album", limit: "10", offset: String(offset), market: "US" })}`)));
  if (!pages.some((r) => r?.ok)) return null;
  const out: SpotifyRecord[] = [], seen = new Set<string>();
  for (const res of pages) {
    if (!res?.ok) continue;
    for (const a of ((await res.json())?.albums?.items ?? []) as (SpAlbum | null)[]) {
      if (!a || a.album_type !== "album" || !(a.release_date ?? "").startsWith(year)) continue;
      const r = spotifyRecord(a), k = `${r.artist}\u0000${edition(r.title)}`.toLowerCase();
      if (seen.has(k) || /\b(live|en vivo|karaoke|tribute|lullaby)\b/i.test(a.name)) continue;
      seen.add(k); out.push(r);
    }
  }
  return out;
}

// a critic's list, matched to Spotify's albums in the list's order: same artist, and the same title or one that starts with it.
// A line with no match is left out. Kept under its own key, since every visitor would otherwise ask for the same 17
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export async function spotifyCritics(lines: { artist: string; title: string }[], year: string, key: string): Promise<SpotifyRecord[]> {
  const run = kv();
  if (run) { try { const v = (await run([["GET", key]]))[0] as string | null; if (v) return JSON.parse(v); } catch {} }
  const found: (SpotifyRecord | null)[] = Array(lines.length).fill(null);
  let next = 0, misses = 0;
  const work = async () => {
    for (let i; (i = next++) < lines.length;) {
      const c = lines[i], a = fold(c.artist), t = fold(c.title);
      const same = (r: SpotifyRecord) => { const x = fold(r.artist); return x === a || x.startsWith(a + " ") || a.startsWith(x + " "); };
      const pick = (res: SpotifyRecord[]) => res.find((r) => same(r) && (fold(r.title) === t || fold(r.title).startsWith(t + " "))) ?? res.find((r) => same(r) && t.startsWith(fold(r.title) + " ")) ?? null;
      // the whole line first; when that misses (a curly apostrophe, a long title), the artist's own albums that year
      const res = await spotifySearch(`${c.artist} ${c.title}`.replace(/[’‘]/g, "'"), year);
      found[i] = res && pick(res);
      if (!found[i]) { const more = await spotifySearch(c.artist, year); if (more) found[i] = pick(more); }
      if (!found[i]) misses++;
    }
  };
  await Promise.all([work(), work(), work()]);
  const out = found.filter((r): r is SpotifyRecord => !!r);
  // a list with lines still missing is kept a day, so they get another try soon; a whole one a week
  if (run && out.length) { try { await run([["SET", key, JSON.stringify(out), "EX", 60 * 60 * 24 * (misses ? 1 : 7)]]); } catch {} }
  return out;
}
