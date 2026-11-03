// Reading an album's Wikipedia article for the open record: its prose by section, the infobox's
// producer, studio and recording dates, and the players and sleeve credits from its Personnel list.

const UA = "cratedig/1.0 (https://github.com/caseycavanagh/cratedig)";
const API = "https://en.wikipedia.org/w/api.php?format=json&formatversion=2&redirects=1&";

const get = (q: string) =>
  fetch(API + q, { headers: { "User-Agent": UA }, cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

export type Section = { heading: string; text: string };
export type Article = {
  url: string;
  lead: string;
  sections: Section[];
  producer: string[];
  studio: string[];
  recorded: string;
  players: [string, string][];
  sleeve: [string, string][];
};

// the plain text comes with headings as "== Background ==" lines; subsections fold into their parent
function split(text: string): { lead: string; sections: Section[] } {
  const parts = text.split(/\n*^(={2,})\s*(.+?)\s*\1\s*$\n*/m);
  const lead = parts[0].trim();
  const sections: Section[] = [];
  for (let i = 1; i + 2 < parts.length + 1; i += 3) {
    const level = parts[i].length, heading = parts[i + 1], body = (parts[i + 2] ?? "").trim();
    if (level > 2 && sections.length) sections[sections.length - 1].text += `\n${body}`;
    else sections.push({ heading, text: body });
  }
  return { lead, sections };
}

// one infobox value as plain items: links to their text, list templates to lines, refs and comments gone
export function clean(v: string): string[] {
  let s = v
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/'''?/g, "")
    // links before templates, so a link's own | doesn't split a template's arguments
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2").replace(/\[\[([^\]]*)\]\]/g, "$1");
  // innermost templates first, until none are left
  for (let n = 0; n < 6 && /\{\{/.test(s); n++) {
    s = s.replace(/\{\{([^{}]*)\}\}/g, (_, body: string) => {
      const [name, ...args] = body.split("|");
      const t = name.trim().toLowerCase();
      if (/^(hlist|flatlist|plainlist|ubl|unbulleted list|nowrap|flat list|plain list)$/.test(t))
        return args.filter((a) => !/^\s*\w+\s*=/.test(a)).join("\n");
      return "";
    });
  }
  s = s.replace(/<[^>]+>/g, "");
  return s
    .split(/\n|\s*\*\s*/)
    .map((x) => x.replace(/\s+/g, " ").replace(/^[,;\s]+|[,;\s]+$/g, "").trim())
    .filter(Boolean);
}

function infobox(wikitext: string) {
  const at = wikitext.search(/\{\{\s*Infobox (album|music)/i);
  if (at < 0) return {} as Record<string, string[]>;
  let depth = 0, end = at;
  for (let i = at; i < wikitext.length - 1; i++) {
    if (wikitext[i] === "{" && wikitext[i + 1] === "{") { depth++; i++; }
    else if (wikitext[i] === "}" && wikitext[i + 1] === "}") { depth--; i++; if (!depth) { end = i; break; } }
  }
  const body = wikitext.slice(at, end - 1);
  const out: Record<string, string[]> = {};
  for (const line of body.split(/\n\s*\|/).slice(1)) {
    const m = line.match(/^\s*([\w ]+?)\s*=([\s\S]*)$/);
    if (m) out[m[1].toLowerCase()] = clean(m[2]);
  }
  return out;
}

// roles that are about the sound of the record, not who plays on it
const TECH = /produc|engineer|mix|master|record(ed|ing)|programm|assist|a&r|manage|runner|tech|liner notes|executive|coordinat|compil|edit|transfer|consult/i;
const SLEEVE = /photo|design|art direction|artwork|layout|illustrat|cover|sleeve|painting|typograph/i;

function personnel(sections: Section[], artist: string): { players: [string, string][]; sleeve: [string, string][] } {
  const s = sections.find((x) => /personnel|credits/i.test(x.heading));
  const players: [string, string][] = [], sleeve: [string, string][] = [];
  if (!s) return { players, sleeve };
  const fold = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  for (const line of s.text.split("\n")) {
    const m = line.match(/^\s*([^–—:]{2,60}?)\s+[–—-]\s+(.+)$/);
    if (!m) continue;
    const name = m[1].trim();
    const roles = m[2].replace(/\s*\([^)]*\)/g, "").split(/,|;| and /).map((r) => r.trim()).filter(Boolean);
    const art = roles.filter((r) => SLEEVE.test(r));
    if (art.length) { sleeve.push([art[0][0].toUpperCase() + art[0].slice(1), name]); continue; }
    const play = roles.filter((r) => !TECH.test(r));
    if (play.length && fold(name) !== fold(artist) && !players.some((p) => p[0] === name)) players.push([name, play.slice(0, 2).join(", ")]);
  }
  return { players: players.slice(0, 6), sleeve: sleeve.slice(0, 3) };
}

export async function article(name: string, artist: string): Promise<Article | null> {
  const t = encodeURIComponent(name);
  const [ex, wt] = await Promise.all([get(`action=query&prop=extracts&explaintext=1&titles=${t}`), get(`action=parse&prop=wikitext&section=0&page=${t}`)]);
  const page = ex?.query?.pages?.[0];
  if (!page?.extract) return null;
  const { lead, sections } = split(page.extract as string);
  const box = infobox((wt?.parse?.wikitext as string) ?? "");
  return {
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent((page.title as string).replace(/ /g, "_"))}`,
    lead,
    sections,
    producer: box.producer ?? [],
    studio: box.studio ?? [],
    recorded: (box.recorded ?? []).join(", "),
    ...personnel(sections, artist),
  };
}

// the parts of an article that say how the record was made, for the About
const MAKING = /background|recording|production|composition|music|lyric|theme|title|artwork|writing|development|conception|songs/i;
export const makingText = (a: Article) =>
  [a.lead, ...a.sections.filter((s) => MAKING.test(s.heading) && !/personnel|track|chart|certif|reception|accolade|reference/i.test(s.heading)).map((s) => `${s.heading}\n${s.text}`)]
    .join("\n\n")
    .slice(0, 24000);

// without a model: the first real paragraph of the making-of sections, else the lead past its "X is the fourth album by Y" sentence
export function plainAbout(a: Article): string {
  for (const s of a.sections) {
    if (!/background|recording|production|composition/i.test(s.heading)) continue;
    const p = s.text.split(/\n+/).find((x) => x.length >= 80);
    if (p) return firstSentences(p);
  }
  const rest = a.lead.replace(/^[^.]*?\b(is|was) (the|an?) [^.]*?\b(album|record|EP)\b[^.]*\.\s*/i, "");
  return firstSentences(rest.length >= 80 ? rest : a.lead);
}
// at most three sentences, so a long paragraph reads like the written About would
const firstSentences = (p: string) => (p.match(/[^.!?]+[.!?]+["”’)]*\s*/g) ?? [p]).slice(0, 3).join("").trim();
