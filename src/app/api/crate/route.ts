// Casey's edits to the records crate (src/lib/crate.ts). The crate page reads them and lays them over its own list.
//   GET  /api/crate                     → { configured, editable, edits: { added, removed, patch } }
//   POST /api/crate { op, ... }          → { edits }, signed in with Google (src/lib/auth.ts) or with CRATE_KEY in an X-Crate-Key header
//     op "check"                         is the key right
//     op "add"     record                a record: artist, title, year, label, format, front, back, spine, spotify, links; added is today
//     op "remove"  slug                  off the crate (kept, covers and all, so it can be put back)
//     op "restore" slug                  back in the crate
//     op "patch"   slug, set             { bg, front, back, spine, title, artist, sortAs, year, label, format, added, links, notes } for a
//                                         record; null clears one, back to the original. links: { service: url }, "" takes one away.
//                                         notes: { about, producer, recorded, minutes, genres, players, sleeve } over the liner notes,
//                                         each null to go back to what was found, or empty to hide it
//   More crates (src/lib/crate.ts, Crate):
//     op "crate-new"  name, about          a new crate, empty; its slug comes from the name and never changes
//     op "crate-set"  crate, name?, about? its name and its words (the slug never changes, "all" included)
//     op "crate-pin"  crate | null         the crate that leads on /casey, or none
//     op "crate-drop" crate                the crate itself; its records stay in the whole crate
//     op "crate-put"  crate, slug          one of Casey's records into a crate
//     op "crate-add"  crate, record        a record Casey doesn't own, into that crate only
//     op "crate-take" crate, slug          a record out of a crate (out of the whole crate is "remove")
// Covers Casey uploads go to /api/crate/img first and come back as /api/crate/img/<id>.
import { connection } from "next/server";
import { kv } from "@/lib/kv";
import { google } from "@/lib/auth";
import { ALL, EDITS, type Crate, type Edits, type Notes, type Patch, type Rec, denied, imgKey, ownImg, owner, readEdits, slugOf, usedImgs } from "@/lib/crate";

export async function GET() {
  await connection();
  const run = kv();
  const editable = !!(process.env.CRATE_KEY?.trim() || google());
  if (!run) return Response.json({ configured: false, editable, edits: { added: [], removed: [], patch: {}, crates: { list: [] } } });
  // the page asks for a fresh copy (?t=…) after Casey edits; everyone else can have one a few seconds old
  return Response.json(
    { configured: true, editable, edits: await readEdits(run) },
    { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=300" } },
  );
}

const SERVICES = ["spotify", "appleMusic", "youtubeMusic", "tidal", "amazonMusic", "deezer"];
const text = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const color = (v: unknown) => (typeof v === "string" && /^(#[0-9a-f]{6}|rgb\(\d{1,3},\s?\d{1,3},\s?\d{1,3}\))$/i.test(v) ? v : undefined);
// a cover is one of Casey's uploads or an image on the web
const image = (v: unknown) => (typeof v === "string" && (ownImg(v) || /^https:\/\/[^\s"'<>]+$/.test(v)) ? v.slice(0, 500) : undefined);

// the liner notes Casey writes in: each one cleaned, or undefined when it isn't the right shape
const line = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
const names = (v: unknown, n: number) =>
  Array.isArray(v) ? v.map((x) => line(x, 120)).filter((x): x is string => !!x).slice(0, n) : undefined;
const pairs = (v: unknown, n: number) =>
  Array.isArray(v)
    ? v
        .filter((x): x is unknown[] => Array.isArray(x))
        .map((x) => [line(x[0], 120) ?? "", line(x[1], 120) ?? ""] as [string, string])
        .filter((x) => x[0] || x[1])
        .slice(0, n)
    : undefined;
const NOTES: Record<keyof Notes, (v: unknown) => unknown> = {
  about: (v) => line(v, 2000),
  producer: (v) => names(v, 12),
  recorded: (v) => line(v, 200),
  minutes: (v) => (v === "" ? "" : typeof v === "number" && v > 0 && v < 1000 ? Math.round(v) : undefined),
  genres: (v) => names(v, 8),
  players: (v) => pairs(v, 40),
  sleeve: (v) => pairs(v, 20),
};

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
    // the day it came in, as the page sees it (Casey's own day, not the server's), else today on the server
    added: typeof b.added === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.added) ? b.added : new Date().toISOString().slice(0, 10),
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
    for (const k of ["title", "artist", "sortAs", "year", "label", "format", "added"] as const) {
      if (!(k in b.set)) continue;
      const v = b.set[k];
      if (v === null || typeof v !== "string") delete p[k];
      else if ((k === "title" || k === "artist") && !v.trim()) continue; // a record always has both
      else if (k === "year" && !/^(\d{4})?$/.test(v.trim())) continue;
      else if (k === "added" && !/^(\d{4}-\d{2}-\d{2})?$/.test(v.trim())) continue; // a day, or empty for no day
      else p[k] = v.trim().slice(0, k === "format" ? 40 : 200);
    }
    if (b.set.links && typeof b.set.links === "object") {
      const l: Record<string, string> = { ...p.links };
      for (const [k, v] of Object.entries(b.set.links)) {
        if (!SERVICES.includes(k)) continue;
        if (v === null) delete l[k];
        else if (v === "" || (typeof v === "string" && /^https:\/\/[^\s"'<>]+$/.test(v))) l[k] = (v as string).slice(0, 500);
      }
      if (Object.keys(l).length) p.links = l;
      else delete p.links;
    } else if (b.set.links === null) delete p.links;
    if (b.set.notes && typeof b.set.notes === "object") {
      const n: Notes = { ...p.notes };
      for (const [k, v] of Object.entries(b.set.notes as Record<string, unknown>)) {
        if (!(k in NOTES)) continue;
        const key = k as keyof Notes;
        if (v === null) delete n[key];
        else {
          const ok = NOTES[key](v);
          if (ok !== undefined) (n as Record<string, unknown>)[key] = ok;
        }
      }
      if (Object.keys(n).length) p.notes = n;
      else delete p.notes;
    } else if (b.set.notes === null) delete p.notes;
    if (Object.keys(p).length) e.patch[slug] = p;
    else delete e.patch[slug];
  } else if (typeof b?.op === "string" && b.op.startsWith("crate-")) {
    const bad = crateEdit(e, b);
    if (bad) return Response.json({ error: bad }, { status: 400 });
  } else return Response.json({ error: "unknown edit" }, { status: 400 });

  const after = usedImgs(e), gone = [...before].filter((id) => !after.has(id));
  await run([["SET", EDITS, JSON.stringify(e)], ...gone.map((id) => ["DEL", imgKey(id)])]);
  return Response.json({ edits: e });
}

// the crates: returns what went wrong, or nothing
function crateEdit(e: Edits, b: Record<string, unknown>): string | undefined {
  const cs = (e.crates ??= { list: [] }), id = typeof b.crate === "string" ? b.crate : "";
  const c = cs.list.find((x) => x.slug === id);
  const about = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 300) || undefined : undefined);
  if (b.op === "crate-new") {
    const name = text(b.name, 60);
    if (!name) return "a crate needs a name";
    if (cs.list.length >= 100) return "that’s a lot of crates";
    const root = slugOf(name, "").slice(0, 60) || "crate";
    let slug = root;
    for (let n = 2; slug === ALL || cs.list.some((x) => x.slug === slug); n++) slug = `${root}-${n}`;
    const made: Crate = { slug, name, records: [], extra: [] };
    if (about(b.about)) made.about = about(b.about);
    cs.list.push(made);
    return;
  }
  if (b.op === "crate-pin") {
    if (b.crate === null) delete cs.pinned;
    else if (id === ALL || c) cs.pinned = id;
    else return "no such crate";
    return;
  }
  if (b.op === "crate-set" && id === ALL) {
    const all = { ...cs.all };
    if ("name" in b) {
      const n = text(b.name, 60);
      if (n && n !== "Everything") all.name = n;
      else delete all.name;
    }
    if ("about" in b) all.about = about(b.about);
    cs.all = all;
    return;
  }
  if (!c) return "no such crate";
  const slug = typeof b.slug === "string" ? b.slug.slice(0, 200) : "";
  if (b.op === "crate-set") {
    if ("name" in b) c.name = text(b.name, 60) ?? c.name;
    if ("about" in b) c.about = about(b.about);
  } else if (b.op === "crate-drop") {
    cs.list = cs.list.filter((x) => x !== c);
    if (cs.pinned === id) delete cs.pinned;
  } else if (b.op === "crate-put" && slug) {
    if (!c.records.includes(slug) && !c.extra.some((x) => x.slug === slug)) c.records.push(slug);
  } else if (b.op === "crate-add") {
    const r = record((b.record ?? {}) as Record<string, unknown>);
    if (!r) return "a record needs an artist and a title";
    if (c.records.includes(r.slug)) return;
    c.extra = [...c.extra.filter((x) => x.slug !== r.slug), r];
  } else if (b.op === "crate-take" && slug) {
    c.records = c.records.filter((s) => s !== slug);
    c.extra = c.extra.filter((x) => x.slug !== slug);
  } else return "unknown edit";
}
