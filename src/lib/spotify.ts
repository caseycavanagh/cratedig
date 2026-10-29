// Spotify album matches for visitor crates (api/discogs, api/musicbrainz), with an app
// token (client credentials) from SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.
// Without them every match is null and the crate leaves out its Play button.

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
