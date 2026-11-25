import { FRESH, missing, og, page } from "@/lib/page";
import { crateExists, crateInfo, facts, findRecord } from "@/lib/record";

// "/casey/<crate>" is rewritten here (next.config.ts) with ?crate=<crate>: one of Casey's crates, public/index.html, with whole
// addresses for link previews. The page itself reads which crate from its address. "all" is the whole crate.
// A crate previews as its name and words; a shared record (/casey/<crate>?r=<slug>) as that record, with its own card at /og/r/<slug>
// which crate: the request comes through the rewrite still addressed /casey/<crate>, so read it from the path (or ?crate= when asked for directly)
function crateOf(req: Request) {
  const u = new URL(req.url);
  return u.searchParams.get("crate") || u.pathname.match(/^\/casey\/([^/]+)\/?$/)?.[1] || "all";
}

const crate = await page(
  "index.html",
  async (html, req) => {
    const q = new URL(req.url).searchParams, crate = crateOf(req), slug = q.get("r");
    if (!/^[a-z0-9-]{1,80}$/.test(crate)) return null;
    const [c, r] = await Promise.all([
      crate === "all" ? null : crateInfo(crate).catch(() => null),
      slug && /^[a-z0-9-]{1,200}$/.test(slug) ? findRecord(slug) : null,
    ]);
    const at = `/casey/${crate}`;
    if (r) {
      const name = `${r.title} by ${r.artist}`, more = facts(r);
      return og(html, {
        "og:title": name,
        "og:description": more ? `${more}. In Casey’s crate.` : "In Casey’s crate.",
        "og:url": `${at}?r=${r.slug}`,
        "og:image": `/og/r/${r.slug}`,
        "og:image:alt": `The cover of ${name}`,
      });
    }
    if (!c) return og(html, { "og:url": at });
    return og(html, { "og:title": `${c.name} · Casey’s crate`, "og:description": c.about || "One of Casey’s crates.", "og:url": at });
  },
  FRESH,
);

// a crate that doesn't exist gets the 404 instead (public/404.html). If the saved crates can't be read, the page goes out as usual
// and sends itself to the whole crate if it finds no such crate (public/index.html)
const notFound = await missing();
export async function GET(req: Request) {
  const name = crateOf(req);
  if (!/^[a-z0-9-]{1,80}$/.test(name) || (await crateExists(name)) === false) return notFound();
  return crate(req);
}
