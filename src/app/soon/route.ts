import { esc, FRESH, page, thumb } from "@/lib/page";
import { crateTiles } from "@/lib/record";

// "/" is rewritten here (next.config.ts): public/soon.html, the coming soon page, with whole addresses for link previews.
// The back of the sleeve previews one of Casey's crates, like the back of a sampler: five of its covers in a row with its name under them,
// the whole row a link into it. The pinned crate, or else the whole crate. If the crates can't be read, the page keeps its plain "See Casey's crate" link.
export const GET = await page(
  "soon.html",
  async (html) => {
    const { pinned, list } = await crateTiles(5).catch(() => ({ pinned: undefined, list: [] }));
    const t = list.find((c) => c.slug === pinned && c.fronts.length >= 5) ?? list[0];
    if (!t || t.fronts.length < 5) return null;
    const who = t.slug === "all" ? "Casey’s crate" : t.name;
    const covers = t.fronts.map((f) => `<img src="${esc(thumb(f, 360))}" alt="" width="360" height="360">`).join("");
    return html
      .replace('<main class="pg" id="pg">', '<main class="pg smp-on" id="pg">')
      .replace("<!--crate-->", `<a class="smp" href="/casey/${esc(t.slug)}"><span class="rw">${covers}</span><span class="lb">${esc(who)}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg></span></a>`)
      .replace(/\s*<a class="see"[^>]*>[^<]*<\/a>/, "");
  },
  FRESH,
);
