import { page } from "@/lib/page";

// "/" is rewritten here (next.config.ts): the crate, public/index.html, with whole addresses for link previews
export const GET = await page("index.html");
