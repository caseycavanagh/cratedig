import { top10Card } from "@/lib/og";
import { colors, covers } from "@/lib/top10";

// /og/2026: a shared top 10's link preview, in the colors it was made in, with its covers (d, m, c, o as in the list's own address). ?by=Sam&t=c, or t=x&bg=…&fg=… (src/lib/top10.ts)

// the picture says what the list is; whose it is rides in the link's own title under it (og:title, whose() in src/lib/top10.ts)
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return top10Card({ title: "Top 10 albums of 2026", ...colors(q), covers: await covers(q) });
}
