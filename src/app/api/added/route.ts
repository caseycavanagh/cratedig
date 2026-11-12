import { connection } from "next/server";
import { additions } from "@/lib/record";

// GET /api/added → { records: [{ slug, artist, title, added, url }] }, newest first: what Casey added to the crate and when.
// The Recently feed on caseycavanagh.com reads it.
export async function GET(req: Request) {
  await connection(); // Casey's edits are read at request time
  const at = new URL(req.url).origin;
  const records = (await additions()).map((r) => ({ ...r, url: `${at}/casey/all#record/${r.slug}` }));
  return Response.json({ records }, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } });
}
