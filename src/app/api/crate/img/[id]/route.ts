// A cover Casey uploaded (api/crate/img). Its address is its hash, so browsers and the CDN keep it for good
// and Redis is read once per image, not once per visit.
import { connection } from "next/server";
import { kv } from "@/lib/kv";
import { IMG_ID, imgKey } from "@/lib/crate";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const run = kv();
  if (!run || !IMG_ID.test(id)) return new Response(null, { status: 404 });
  const [v] = await run([["GET", imgKey(id)]]);
  if (typeof v !== "string") return new Response(null, { status: 404 });
  const i = v.indexOf(";");
  return new Response(Buffer.from(v.slice(i + 1), "base64"), {
    headers: {
      "Content-Type": v.slice(0, i),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
