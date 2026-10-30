import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Link previews need whole addresses, and the pages in public/ only know their paths. "/" and the make page come through here,
// which puts the site's own domain in front of og:url and og:image. Vercel sets the domain at build (a custom one once it's added),
// so it's never typed in; locally, or if it's missing, the paths stay as they are. Read once, at build.
const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const ORIGIN = host ? `https://${host}` : "";

export async function page(file: string) {
  const src = await readFile(join(process.cwd(), "public", file), "utf8");
  const html = src.replace(/(<meta property="og:(?:url|image)" content=")\//g, `$1${ORIGIN}/`);
  return () => new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
