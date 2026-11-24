// Spotify's albums for the top 10 maker (public/top10.html), with the app's own token (src/lib/spotify.ts).
//   ?q=geese&year=2026   albums and EPs out that year
//   ?new=1&year=2026     what the maker shows before you type: the critics' list for that year first (public/vinyl/lists-2026.json, AOTY), in its order,
//                        then Spotify's own albums out that year to fill out 25
//   ?ids=<id>,...        those albums in full, for a shared list (s= in its address)
// Without SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET it answers 503, and the maker searches MusicBrainz instead.
import { connection, type NextRequest } from "next/server";
import { spotifyAlbums, spotifyCritics, spotifyNew, spotifyReady, spotifySearch } from "@/lib/spotify";
import lists2026 from "../../../../public/vinyl/lists-2026.json";

const LISTS: Record<string, { lists: { id: string; asOf?: string; records: { artist: string; title: string }[] }[] }> = { "2026": lists2026 };

const ID = /^[0-9A-Za-z]{22}$/;

export async function GET(request: NextRequest) {
  await connection();
  if (!spotifyReady()) return Response.json({ error: "no spotify" }, { status: 503 });
  const p = request.nextUrl.searchParams;
  if (p.get("new")) {
    const year = /^\d{4}$/.test(p.get("year") ?? "") ? (p.get("year") as string) : String(new Date().getFullYear());
    const list = LISTS[year]?.lists[0];
    const [critics, more] = await Promise.all([list ? spotifyCritics(list.records, year, `sp:list2:${year}:${list.id}:${list.asOf ?? ""}`) : [], spotifyNew(year)]);
    if (!critics.length && !more) return Response.json({ results: [] }, { status: 502 });
    const have = new Set(critics.map((r) => r.id)), seen = new Set(critics.map((r) => r.artist.toLowerCase()));
    const results = [...critics, ...(more ?? []).filter((r) => !have.has(r.id) && !seen.has(r.artist.toLowerCase()))].slice(0, 25);
    return Response.json({ results }, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
  }
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
