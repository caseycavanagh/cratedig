import { og, page } from "@/lib/page";
import { facts, findRecord } from "@/lib/record";

// "/" is rewritten here (next.config.ts): the crate, public/index.html, with whole addresses for link previews.
// A shared record (/?r=<slug>) previews as that record: its name, and its own card at /og/r/<slug>
export const GET = await page("index.html", async (html, req) => {
  const slug = new URL(req.url).searchParams.get("r");
  const r = slug && /^[a-z0-9-]{1,200}$/.test(slug) ? await findRecord(slug) : null;
  if (!r) return null;
  const name = `${r.title} by ${r.artist}`, more = facts(r);
  return og(html, {
    "og:title": name,
    "og:description": more ? `${more}. In Casey’s crate.` : "In Casey’s crate.",
    "og:url": `/?r=${r.slug}`,
    "og:image": `/og/r/${r.slug}`,
    "og:image:alt": `The cover of ${name}`,
  });
});
