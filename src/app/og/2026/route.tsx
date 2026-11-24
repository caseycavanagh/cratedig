import { top10Card } from "@/lib/og";
import { origin } from "@/lib/page";
import { colors, covers, whose } from "@/lib/top10";

// /og/2026: a shared top 10's link preview, in the colors it was made in, with its covers (d, m, c, o as in the list's own address). ?by=Sam&t=c, or t=x&bg=…&fg=… (src/lib/top10.ts)

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return top10Card({ title: whose(q.get("by")), ...colors(q), host: new URL(origin(req)).host, covers: await covers(q) });
}
