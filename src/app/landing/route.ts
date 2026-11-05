import { page } from "@/lib/page";
import { crateFronts } from "@/lib/record";

// "/" is rewritten here (next.config.ts): public/landing.html, the front door, with whole addresses for link previews.
// Its little crate of Casey's shows the crate's first four covers, put in here so it always matches the crate at /casey.
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
// a bare cover name has small copies in vinyl/t/ (scripts/vinyl-thumbs.mjs, made at build); anything else is used as it is
const small = (f: string) => (/^[a-z0-9-]+-front\.webp$/.test(f) ? `/vinyl/t/${f.replace(/\.webp$/, "")}-720.webp` : /^(https?:|\/)/.test(f) ? f : `/vinyl/${f}`);

export const GET = await page("landing.html", async (html) => {
  const four = await crateFronts(4).catch(() => []);
  if (!four.length) return null;
  const stack = [...four].reverse().map((r, i) => `<span class="r" style="--j:${four.length - 1 - i}"><img src="${esc(small(r.front!))}" alt="" width="360" height="360"${i === four.length - 1 ? "" : ' loading="lazy"'}></span>`).join("");
  const artists = [...new Set(four.map((r) => r.artist))].filter((a) => a !== "Various artists").slice(0, 3).join(", ");
  return html.replace("<!--casey-stack-->", stack).replace("<!--casey-artists-->", esc(artists) + " and more");
});
