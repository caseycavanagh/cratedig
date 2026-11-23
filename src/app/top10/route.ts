import { page } from "@/lib/page";

// "/2026" with no list in its address is rewritten here (next.config.ts): the top 10 maker, public/top10.html, with whole addresses for link previews
export const GET = await page("top10.html");
