// A cover Casey uploads for the records crate (src/lib/crate.ts): the page shrinks it to 1200px first,
// so it fits in one Redis value. POST the image itself as the body → { url: "/api/crate/img/<id>" }.
// The id is the image's own hash, so the same image uploaded twice is stored once and never changes.
import { createHash } from "node:crypto";
import { connection } from "next/server";
import { kv } from "@/lib/kv";
import { denied, imgKey, owner } from "@/lib/crate";

const TYPES = ["image/webp", "image/jpeg", "image/png"];
const MAX = 700_000;

export async function POST(req: Request) {
  await connection();
  const run = kv();
  if (!run) return Response.json({ error: "no database" }, { status: 503 });
  const who = await owner(req, run);
  if (who !== true) return denied(who);
  const type = req.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!TYPES.includes(type)) return Response.json({ error: "a cover is a WebP, JPEG or PNG" }, { status: 415 });
  const bytes = Buffer.from(await req.arrayBuffer());
  if (!bytes.length || bytes.length > MAX) return Response.json({ error: "a cover is at most 700 KB" }, { status: 413 });
  const id = createHash("sha256").update(bytes).digest("hex").slice(0, 24);
  await run([["SET", imgKey(id), `${type};${bytes.toString("base64")}`]]);
  return Response.json({ url: `/api/crate/img/${id}` });
}
