import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Link previews need whole addresses, and the pages in public/ only know their paths. "/" and the make page come through here,
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

export async function page(file: string) {
  const src = await readFile(join(process.cwd(), "public", file), "utf8");
  return (req: Request) => {
    const html = src.replace(/(<meta property="og:(?:url|image)" content=")\//g, `$1${origin(req)}/`);
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": CACHE } });
  };
}
