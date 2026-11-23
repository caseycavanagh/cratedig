import { og, page } from "@/lib/page";
import { cardQuery, whose } from "@/lib/top10";

// "/2026?by=…&d=…" (a list in the address) is rewritten here (next.config.ts): the crate page, public/index.html, which ranks a list at /2026
// and opens it in the Top ten view. Its link preview is named for whoever made it, its picture (/og/2026) in their colors
export const GET = await page("index.html", async (html, req) => {
  const q = new URL(req.url).searchParams, title = whose(q.get("by"));
  return og(html, {
    "og:title": title,
    "og:description": "Ten records of 2026, in order. Make yours on Crate Dig.",
    "og:url": `/2026?${q}`,
    "og:image": `/og/2026?${cardQuery(q)}`,
    "og:image:alt": title,
  });
});
