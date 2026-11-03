// The open record's About: two or three sentences on how the record was made, written by Claude from the
// album's Wikipedia article and kept only when every name, number and quote in it is in the article.
// Without ANTHROPIC_API_KEY, or when a sentence can't be checked, the plain paragraph stands in.

import Anthropic from "@anthropic-ai/sdk";

const SYSTEM = `You write the short About for an album in a record collection app. The page already shows the album title, the artist, the release year and the label.

Write two or three plain sentences about how the record was made: where and when it was recorded, who was in the room, what happened during the making, where the songs came from. Pick the most specific details, the ones that belong to this record and no other.

Use only facts stated in the article. Keep any quote word for word. Don't open with "<title> is the <nth> album by". Don't mention reviews, sales, charts, awards or rankings. Plain, warm, US English. Reply with the sentences only.`;

// a summary passes when its numbers, quotes and capitalized names all appear in the article
const COMMON = new Set("A An The He She They It Its His Her Their This That These Those In On At After Before When While With For By From During Over Under As To Of And But Then Later Most Some One Two Three".split(" "));
export function grounded(out: string, source: string): boolean {
  const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-");
  const o = norm(out), src = norm(source);
  for (const n of o.match(/\d[\d,.]*/g) ?? []) if (!src.includes(n.replace(/[.,]$/, ""))) return false;
  for (const q of o.match(/"([^"]{4,})"/g) ?? []) if (!src.includes(q.slice(1, -1).replace(/[.,]$/, ""))) return false;
  for (const w of o.match(/\b\p{Lu}[\p{L}'-]+/gu) ?? []) if (!COMMON.has(w) && !src.includes(w.replace(/'s$/, ""))) return false;
  return true;
}

export async function summarize(source: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY || source.length < 200) return null;
  try {
    const client = new Anthropic();
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: `<article>\n${source}\n</article>` }],
    });
    if (res.stop_reason !== "end_turn") return null;
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    return text && grounded(text, source) ? text : null;
  } catch {
    return null;
  }
}
