import { page } from "@/lib/page";

// "/" is rewritten here (next.config.ts): public/soon.html, the coming soon page, with whole addresses for link previews
export const GET = await page("soon.html");
