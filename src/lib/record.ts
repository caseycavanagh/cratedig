import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { kv } from "@/lib/kv";
import { IMG_ID, imgKey, readEdits, slugOf } from "@/lib/crate";

// One of Casey's records, for a shared record link (/?r=<slug>) and its preview card (/og/r/<slug>).
// The list is the crate's own: public/index.html's RECORDS, facts from public/vinyl/covers.json, then Casey's edits on top.

export type Shared = { slug: string; title: string; artist: string; year?: string; label?: string; front?: string };

const pub = (f: string) => join(process.cwd(), "public", f);

async function base(): Promise<Map<string, Shared>> {
  const [html, covers] = await Promise.all([readFile(pub("index.html"), "utf8"), readFile(pub("vinyl/covers.json"), "utf8")]);
  const facts: Record<string, { year?: number | string; label?: string; front?: string }> = JSON.parse(covers);
  const list = html.match(/const RECORDS=\[([\s\S]*?)\]\.map\(/)?.[1] ?? "";
  const out = new Map<string, Shared>();
  for (const m of list.matchAll(/\{artist:'([^']*)',title:'([^']*)'/g)) {
    const [, artist, title] = m, slug = slugOf(artist, title), f = facts[slug] ?? {};
    out.set(slug, { slug, artist, title, year: f.year ? String(f.year) : undefined, label: f.label, front: f.front });
  }
  return out;
}

// Casey's edits, unless Redis is slow: a preview without them is better than none
async function edits() {
  const run = kv();
  if (!run) return null;
  return Promise.race([readEdits(run).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 1500))]);
}

export async function findRecord(slug: string): Promise<Shared | null> {
  const [all, e] = await Promise.all([base(), edits()]);
  if (e) {
    if (e.removed.includes(slug)) return null;
    for (const a of e.added) if (a.slug === slug && !all.has(slug)) all.set(slug, { slug, title: a.title, artist: a.artist, year: a.year, label: a.label, front: a.front });
  }
  const r = all.get(slug);
  if (!r) return null;
  const p = e?.patch[slug];
  if (!p) return r;
  const pick = (v: string | undefined, was: string | undefined) => (v === undefined ? was : v || undefined);
  return { ...r, title: p.title || r.title, artist: p.artist || r.artist, year: pick(p.year, r.year), label: pick(p.label, r.label), front: p.front || r.front };
}

// the cover as a JPEG data URL the card can draw (it can't read WebP): a file in public/, or a cover Casey uploaded
export async function coverData(front: string | undefined, size = 560): Promise<string | null> {
  if (!front) return null;
  try {
    let buf: Buffer | null = null;
    const id = front.match(/\/api\/crate\/img\/([^/?#]+)/)?.[1];
    if (id) {
      const run = kv();
      if (!run || !IMG_ID.test(id)) return null;
      const [v] = await run([["GET", imgKey(id)]]);
      if (typeof v !== "string") return null;
      buf = Buffer.from(v.slice(v.indexOf(";") + 1), "base64");
    } else if (!/^[a-z]+:/i.test(front)) {
      // like the crate's img(): a bare name is a file in public/vinyl/
      const f = front.split(/[?#]/)[0];
      buf = await readFile(pub(f.startsWith("/") ? f.slice(1) : `vinyl/${f}`));
    } else {
      const res = await fetch(front, { signal: AbortSignal.timeout(4000) });
      if (res.ok) buf = Buffer.from(await res.arrayBuffer());
    }
    if (!buf) return null;
    const jpg = await sharp(buf).resize(size, size, { fit: "cover" }).jpeg({ quality: 84 }).toBuffer();
    return `data:image/jpeg;base64,${jpg.toString("base64")}`;
  } catch {
    return null;
  }
}

export const facts = (r: Shared) => [r.year, r.label].filter(Boolean).join(", ");
