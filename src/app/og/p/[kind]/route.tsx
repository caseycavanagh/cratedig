import { postCard, storyCard } from "@/lib/og";
import { blurData, coverData, crateCovers, findRecord } from "@/lib/record";

// /og/p/post and /og/p/story: pictures for the share sheet, for apps that take an image and not a link.
// ?r=<slug> draws one of Casey's records; without it, the crate

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "post" && kind !== "story") return new Response("Not found", { status: 404 });
  const slug = new URL(req.url).searchParams.get("r");
  const r = slug && /^[a-z0-9-]{1,200}$/.test(slug) ? await findRecord(slug) : null;
  const size = kind === "post" ? 800 : 900;
  const pic = r
    ? { title: r.title, sub: r.artist, cover: await coverData(r.front, size) }
    : { title: "Casey’s crate", sub: "Every record Casey owns", cover: null, covers: await crateCovers(9, Math.round(size / 3)) };
  if (kind === "post") return postCard(pic);
  return storyCard({ ...pic, blur: r ? await blurData(r.front, 1080, 1920) : null, foot: r ? "In Casey’s crate" : "Flip through it" });
}
