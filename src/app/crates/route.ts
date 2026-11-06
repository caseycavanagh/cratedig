import { FRESH, page } from "@/lib/page";
import { type Tile, crateTiles } from "@/lib/record";

// "/casey" is rewritten here (next.config.ts): Casey's crates, public/crates.html, with the crates put in at <!--crates-->.
// A pinned crate leads, big; with only one crate, that one does. The rest sit in rows, all the same size.
// Each crate's words are Casey's own (edit mode, in the crate); a crate without any shows just its name.
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
// a bare cover name has small copies in vinyl/t/ (scripts/vinyl-thumbs.mjs); Casey's uploads come smaller at ?w=; anything else as it is
const small = (f: string) =>
  /^[a-z0-9-]+-front\.webp$/.test(f) ? `/vinyl/t/${f.replace(/\.webp$/, "")}-720.webp` : /^\/api\/crate\/img\/[0-9a-f]{24}$/.test(f) ? `${f}?w=720` : /^(https?:|\/)/.test(f) ? f : `/vinyl/${f}`;

const stack = (t: Tile, eager: boolean) =>
  t.fronts.length
    ? `<span class="stk">${[...t.fronts].reverse().map((f, i) => `<span class="r" style="--j:${t.fronts.length - 1 - i}"><img src="${esc(small(f))}" alt="" width="360" height="360"${eager ? "" : ' loading="lazy"'}></span>`).join("")}</span>`
    : `<span class="stk empty" aria-hidden="true"><span class="r" style="--j:2"></span><span class="r" style="--j:1"></span><span class="r j0" style="--j:0"></span></span>`;
const meta = (t: Tile) => `<span class="meta"><span class="nm">${esc(t.name)}</span>${t.about ? `<span class="ab">${esc(t.about)}</span>` : ""}</span>`;

export const GET = await page(
  "crates.html",
  async (html) => {
    const { pinned, list } = await crateTiles().catch(() => ({ pinned: undefined, list: [{ slug: "all", name: "Everything", fronts: [] }] as Tile[] }));
    const lead = list.length === 1 ? list[0] : list.find((t) => t.slug === pinned);
    const rest = list.filter((t) => t !== lead);
    const hero = lead ? `<a class="hero" href="/casey/${lead.slug}">${stack(lead, true)}${meta(lead)}</a>` : "";
    const grid = `<ul class="crates">${rest.map((t, i) => `<li><a class="tile" href="/casey/${t.slug}">${stack(t, i < 8)}${meta(t)}</a></li>`).join("")}</ul>`;
    return html.replace("<!--crates-->", hero + grid);
  },
  FRESH,
);
