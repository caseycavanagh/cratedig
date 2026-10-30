import { recordCard } from "@/lib/og";
import { origin } from "@/lib/page";
import { coverData, facts, findRecord } from "@/lib/record";

// /og/r/<slug>: a shared record's link preview. A record that isn't in the crate gets the crate's own card

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await findRecord(slug);
  if (!r) return Response.redirect(new URL("/og", origin(req)), 302);
  return recordCard({ title: r.title, artist: r.artist, facts: facts(r), cover: await coverData(r.front) });
}
