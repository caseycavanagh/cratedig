// A cover Casey uploaded (api/crate/img). Its address is its hash, so browsers and the CDN keep it for good
// and Redis is read once per image, not once per visit. ?w=360 or ?w=720 is a smaller copy, for the wall and the back of the pile.
import { connection } from "next/server";
import sharp from "sharp";
import { kv } from "@/lib/kv";
import { IMG_ID, imgKey } from "@/lib/crate";

const WIDTHS = ["360", "720"];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const run = kv();
  if (!run || !IMG_ID.test(id)) return new Response(null, { status: 404 });
  const [v] = await run([["GET", imgKey(id)]]);
  if (typeof v !== "string") return new Response(null, { status: 404 });
  const i = v.indexOf(";"), w = new URL(req.url).searchParams.get("w");
  let type = v.slice(0, i), body: Uint8Array<ArrayBuffer> = Buffer.from(v.slice(i + 1), "base64");
  if (w && WIDTHS.includes(w)) {
    const small = await sharp(body).resize(+w, +w, { fit: "cover", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer().catch(() => null);
    if (small) [type, body] = ["image/webp", new Uint8Array(small)];
  }
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
