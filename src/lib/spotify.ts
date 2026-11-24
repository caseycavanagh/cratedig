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
      if (/\b(live|karaoke|instrumental version|tribute|lullaby)\b/i.test(a.name)) continue;
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
