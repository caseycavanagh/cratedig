// Spotify's albums for the top 10 maker (public/top10.html), with the app's own token (src/lib/spotify.ts).
//   ?q=geese&year=2026   albums and EPs out that year
//   ?ids=<id>,...        those albums in full, for a shared list (s= in its address)
// Without SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET it answers 503, and the maker searches MusicBrainz instead.
import { connection, type NextRequest } from "next/server";
import { spotifyAlbums, spotifyReady, spotifySearch } from "@/lib/spotify";

const ID = /^[0-9A-Za-z]{22}$/;

export async function GET(request: NextRequest) {
  await connection();
  if (!spotifyReady()) return Response.json({ error: "no spotify" }, { status: 503 });
  const p = request.nextUrl.searchParams;
  const q = p.get("q")?.trim();
  if (q) {
    const year = /^\d{4}$/.test(p.get("year") ?? "") ? (p.get("year") as string) : undefined;
    const results = await spotifySearch(q.slice(0, 100), year);
    if (!results) return Response.json({ results: [] }, { status: 502 });
    return Response.json({ results }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
  }
  const ids = [...new Set((p.get("ids") ?? "").split(",").filter((id) => ID.test(id)))].slice(0, 20);
  if (!ids.length) return Response.json({ records: [] });
  const records = await spotifyAlbums(ids);
  if (!records.length) return Response.json({ records: [] }, { status: 502 });
  return Response.json({ records }, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}
