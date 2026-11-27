import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Link previews need whole addresses, and the pages in public/ only know their paths. "/", "/casey", each crate and the make page come through here,
// which puts the domain the page was asked for in front of og:url and og:image. It's read from each request, not baked in at build,
// so every domain the site answers on (a renamed one, a custom one, a preview) points previews at itself.
// The CDN keeps a copy per domain for a day; a new deploy clears it.
export function origin(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return new URL(req.url).origin;
  const proto = req.headers.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

export const CACHE = "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";
// pages that show Casey's edits (the crates on /casey) can't wait a day for them
export const FRESH = "public, max-age=0, s-maxage=10, stale-while-revalidate=300";

// tweak: a last say over the page for this request (a shared record names itself in its preview tags), or nothing
export async function page(file: string, tweak?: (html: string, req: Request) => Promise<string | null>, cache = CACHE) {
  const src = await readFile(join(process.cwd(), "public", file), "utf8");
  return async (req: Request) => {
    const html = ((tweak && (await tweak(src, req))) || src).replace(/(<meta property="og:(?:url|image)" content=")\//g, `$1${origin(req)}/`);
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": cache } });
  };
}

export const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
// a cover at a smaller size: a bare cover name has 360px and 720px copies in vinyl/t/ (scripts/vinyl-thumbs.mjs, made at build); Casey's uploads come smaller at ?w=; anything else as it is
export const thumb = (f: string, w: 360 | 720 = 720) =>
  /^[a-z0-9-]+-front\.webp$/.test(f) ? `/vinyl/t/${f.replace(/\.webp$/, "")}-${w}.webp` : /^\/api\/crate\/img\/[0-9a-f]{24}$/.test(f) ? `${f}?w=${w}` : /^(https?:|\/)/.test(f) ? f : `/vinyl/${f}`;

// a page's preview tags, set to other words
export function og(html: string, tags: Record<string, string>) {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return Object.entries(tags).reduce(
    (h, [k, v]) => h.replace(new RegExp(`(<meta (?:property|name)="${k}" content=")[^"]*"`), `$1${esc(v)}"`),
    html,
  );
}

// Crate Dig's 404 (public/404.html): a giant 404 on a record sleeve and one way home. For addresses nothing answers to
// (src/app/[...missing]) and crates that don't exist (src/app/home). Kept briefly, so a crate made a moment ago isn't stuck behind it
export async function missing(cache = "public, max-age=0, s-maxage=10") {
  const src = await readFile(join(process.cwd(), "public", "404.html"), "utf8");
  return () => new Response(src, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": cache } });
}
