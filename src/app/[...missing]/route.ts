import { missing } from "@/lib/page";

// Any address nothing else answers to: Crate Dig's 404, public/404.html, with a 404 status (Casey, 2026-11-25).
// Files in public/ and every other route come first, so this only sees what would otherwise be Next's plain 404. An API address gets words, not a page.
const notFound = await missing("public, max-age=0, s-maxage=3600");
export async function GET(req: Request) {
  if (new URL(req.url).pathname.startsWith("/api/")) return Response.json({ error: "Not found" }, { status: 404 });
  return notFound();
}
