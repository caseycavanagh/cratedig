// Casey's edits to the records crate (src/lib/crate.ts). The crate page reads them and lays them over its own list.
//   GET  /api/crate                     → { configured, editable, edits: { added, removed, patch } }
//   POST /api/crate { op, ... }          → { edits }, with the key in CRATE_KEY as a bearer token
//     op "check"                         is the key right
//     op "add"     record                a record: artist, title, year, label, format, front, back, spine, spotify, links
//     op "remove"  slug                  off the crate (kept, covers and all, so it can be put back)
//     op "restore" slug                  back in the crate
//     op "patch"   slug, set             { bg, front, back, spine } for a record; null clears one
// Covers Casey uploads go to /api/crate/img first and come back as /api/crate/img/<id>.
import { connection } from "next/server";
import { kv } from "@/lib/kv";
import { EDITS, type Edits, type Patch, type Rec, denied, imgKey, ownImg, owner, readEdits, slugOf, usedImgs } from "@/lib/crate";

export async function GET() {
  await connection();
  const run = kv();
  const editable = !!process.env.CRATE_KEY?.trim();
  if (!run) return Response.json({ configured: false, editable, edits: { added: [], removed: [], patch: {} } });
  // the page asks for a fresh copy (?t=…) after Casey edits; everyone else can have one a few seconds old
  return Response.json(
    { configured: true, editable, edits: await readEdits(run) },
    { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=300" } },
  );
}

const text = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const color = (v: unknown) => (typeof v === "string" && /^(#[0-9a-f]{6}|rgb\(\d{1,3},\s?\d{1,3},\s?\d{1,3}\))$/i.test(v) ? v : undefined);
// a cover is one of Casey's uploads or an image on the web
const image = (v: unknown) => (typeof v === "string" && (ownImg(v) || /^https:\/\/[^\s"'<>]+$/.test(v)) ? v.slice(0, 500) : undefined);

function record(b: Record<string, unknown>): Rec | null {
  const artist = text(b.artist), title = text(b.title);
  if (!artist || !title) return null;
  const links: Record<string, string> = {};
  if (b.links && typeof b.links === "object")
    for (const [k, v] of Object.entries(b.links)) if (/^\w{1,20}$/.test(k) && image(v)) links[k] = v as string;
  const r: Rec = {
    slug: slugOf(artist, title),
    artist,
    title,
    year: text(String(b.year ?? ""), 4),
    label: text(b.label),
    format: text(b.format, 20),
    front: image(b.front),
    back: image(b.back),
    spine: color(b.spine),
    spotify: typeof b.spotify === "string" && /^\w{10,30}$/.test(b.spotify) ? b.spotify : undefined,
    links: Object.keys(links).length ? links : undefined,
    added: new Date().toISOString().slice(0, 10),
  };
  return JSON.parse(JSON.stringify(r)); // without the empty fields
}

export async function POST(req: Request) {
  await connection();
  const run = kv();
  if (!run) return Response.json({ error: "no database" }, { status: 503 });
  const who = await owner(req, run);
  if (who !== true) return denied(who);
  const b = await req.json().catch(() => null);
  const e: Edits = await readEdits(run);
  if (b?.op === "check") return Response.json({ edits: e });
  const before = usedImgs(e);
  const slug = typeof b?.slug === "string" ? b.slug.slice(0, 200) : "";

  if (b?.op === "add") {
    const r = record(b.record ?? {});
    if (!r) return Response.json({ error: "a record needs an artist and a title" }, { status: 400 });
    e.added = [...e.added.filter((x) => x.slug !== r.slug), r];
    e.removed = e.removed.filter((s) => s !== r.slug);
  } else if (b?.op === "remove" && slug) {
    if (!e.removed.includes(slug)) e.removed.push(slug);
  } else if (b?.op === "restore" && slug) {
    e.removed = e.removed.filter((s) => s !== slug);
  } else if (b?.op === "patch" && slug && b.set && typeof b.set === "object") {
    const p: Patch = { ...e.patch[slug] };
    for (const k of ["bg", "spine", "front", "back"] as const) {
      if (!(k in b.set)) continue;
      const v = b.set[k] === null ? undefined : k === "bg" || k === "spine" ? color(b.set[k]) : image(b.set[k]);
      if (v) p[k] = v;
      else delete p[k];
    }
    if (Object.keys(p).length) e.patch[slug] = p;
    else delete e.patch[slug];
  } else return Response.json({ error: "unknown edit" }, { status: 400 });

  const after = usedImgs(e), gone = [...before].filter((id) => !after.has(id));
  await run([["SET", EDITS, JSON.stringify(e)], ...gone.map((id) => ["DEL", imgKey(id)])]);
  return Response.json({ edits: e });
}
