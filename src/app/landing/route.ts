import { FRESH, page } from "@/lib/page";
import { crateTiles } from "@/lib/record";

// "/" is rewritten here (next.config.ts): public/landing.html, the front door, with whole addresses for link previews.
// Beside the search box stands one of Casey's crates as the example: the pinned one, or else the whole crate. It opens that crate.
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
// a bare cover name has small copies in vinyl/t/ (scripts/vinyl-thumbs.mjs, made at build); Casey's uploads come smaller at ?w=; anything else as it is
const small = (f: string) =>
  /^[a-z0-9-]+-front\.webp$/.test(f) ? `/vinyl/t/${f.replace(/\.webp$/, "")}-720.webp` : /^\/api\/crate\/img\/[0-9a-f]{24}$/.test(f) ? `${f}?w=720` : /^(https?:|\/)/.test(f) ? f : `/vinyl/${f}`;

export const GET = await page(
  "landing.html",
  async (html) => {
    const { pinned, list } = await crateTiles(5).catch(() => ({ pinned: undefined, list: [] }));
    const t = list.find((c) => c.slug === pinned && c.fronts.length) ?? list[0];
    if (!t?.fronts.length) return null;
    const n = t.fronts.length;
    const stack = [...t.fronts].reverse().map((f, i) => `<span class="r" style="--j:${n - 1 - i}"><img src="${esc(small(f))}" alt="" width="400" height="400"${i === n - 1 ? "" : ' loading="lazy"'}></span>`).join("");
    const all = t.slug === "all";
    const who = all ? "Casey’s crate" : t.name;
    const sub = t.about || (all ? "" : "Casey’s crate");
    return html.replace("<!--example-->", `<a class="ex" href="/casey/${esc(t.slug)}"><span class="stk">${stack}</span><span class="meta"><span class="who">${esc(who)}</span>${sub ? `<span class="arts">${esc(sub)}</span>` : ""}</span></a>`);
  },
  FRESH,
);
