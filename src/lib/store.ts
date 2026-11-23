// The crate's store: Postgres (Neon, from Vercel's marketplace; it sets DATABASE_URL). Casey is the first person in it.
// Until DATABASE_URL is set, everything reads as before: the records typed into public/index.html, facts from
// public/vinyl/covers.json, and Casey's edits as one value in Redis (src/lib/crate.ts).
//
// With it set, the first request moves all of that in once (seed, below), and from then on the crate comes from here:
//   people         one row a person: handle (/casey), name, email, the whole crate's name and words, the pinned crate
//   releases       a record as released: MusicBrainz id when known, and its facts (year, label, covers, links…), shared by everyone who has it
//   holdings       a record in a person's whole crate, by slug: "base" (moved in from the page) or "added" (added since), in order
//   taken_out      a person's records taken out of the whole crate (they stay in holdings, so they can be put back)
//   patches        a person's hand fixes to one record, by slug (the same Patch as before)
//   crates         a person's other crates, by slug, in the order made
//   crate_records  a crate's picks from the whole crate, by slug
//   crate_extras   records that live in one crate only
// Every change touches only its own rows, so two devices editing different records can't undo each other.
//
// The page and the API still speak in the shape they always have: a base list and the edits laid over it (load, below).
// A change is made to that shape in memory, as before, and save writes only the rows that changed.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { Pool, type PoolClient } from "pg";
import { kv } from "@/lib/kv";
import { type Crate, EDITS, type Edits, type Patch, type Rec, slugOf } from "@/lib/crate";

// a record in the base list: what the page's RECORDS line says, over its facts from covers.json
export type Base = Rec & { sortAs?: string; pal?: string[]; art?: string; release?: string; [k: string]: unknown };

let pool: Pool | null = null;
export const store = () => {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) return null;
  pool ??= new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000 });
  return pool;
};

const SCHEMA = `
create table if not exists people (
  id bigserial primary key, handle text unique not null, name text, email text unique,
  all_name text, all_about text, pinned text, seeded_at timestamptz, created_at timestamptz not null default now());
create table if not exists releases (
  id bigserial primary key, mbid text unique, artist text not null, title text not null, facts jsonb not null default '{}');
create table if not exists holdings (
  person_id bigint not null references people on delete cascade, slug text not null, kind text not null check (kind in ('base','added')),
  release_id bigint references releases, rec jsonb not null, seq int not null, primary key (person_id, slug));
create table if not exists taken_out (
  person_id bigint not null references people on delete cascade, slug text not null, at timestamptz not null default clock_timestamp(), primary key (person_id, slug));
create table if not exists patches (
  person_id bigint not null references people on delete cascade, slug text not null, patch jsonb not null, primary key (person_id, slug));
create table if not exists crates (
  id bigserial primary key, person_id bigint not null references people on delete cascade, slug text not null, name text not null,
  about text, seq int not null, unique (person_id, slug));
-- a ranked crate's order (a top ten), slugs, number one first; null when the crate isn't ranked
alter table crates add column if not exists rank jsonb;
create table if not exists crate_records (
  crate_id bigint not null references crates on delete cascade, slug text not null, seq int not null, primary key (crate_id, slug));
create table if not exists crate_extras (
  crate_id bigint not null references crates on delete cascade, slug text not null, rec jsonb not null, seq int not null, primary key (crate_id, slug));
`;

const pub = (f: string) => join(process.cwd(), "public", f);

// The records as the page has them typed: RECORDS in public/index.html (plain object literals), each over its facts in covers.json
export async function pageRecords(): Promise<Base[]> {
  const [html, covers] = await Promise.all([readFile(pub("index.html"), "utf8"), readFile(pub("vinyl/covers.json"), "utf8")]);
  const facts: Record<string, Record<string, unknown>> = JSON.parse(covers);
  const list = html.match(/const RECORDS=\[([\s\S]*?)\]\.map\(/)?.[1] ?? "";
  const typed = runInNewContext(`[${list}]`, Object.create(null), { timeout: 1000 }) as Record<string, unknown>[];
  return typed.map((t) => {
    const slug = slugOf(String(t.artist), String(t.title));
    return JSON.parse(JSON.stringify({ ...facts[slug], ...t, slug })) as Base;
  });
}

// Casey: the one person until accounts open. Their handle is the address the crate already has.
const CASEY = "casey";
const ownerEmail = () => (process.env.CRATE_OWNER_EMAIL ?? "").split(",")[0].trim().toLowerCase() || null;

// the facts that belong to the release, not to whoever holds it
const FACTS = ["year", "label", "format", "front", "back", "spine", "spotify", "links", "group", "frontSource", "backSource"] as const;
const split = (r: Base) => {
  const facts: Record<string, unknown> = {}, rec: Record<string, unknown> = { ...r };
  for (const k of FACTS) if (k in rec) facts[k] = rec[k];
  return { facts, rec };
};

async function tx<T>(db: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// Once: make the tables, and move Casey's crate in from the page and Redis. A lock keeps two first requests from both doing it.
let ready: Promise<number> | null = null;
export function person(db: Pool): Promise<number> {
  ready ??= tx(db, async (c) => {
    await c.query("select pg_advisory_xact_lock(4242)");
    await c.query(SCHEMA);
    const had = await c.query<{ id: string; seeded_at: Date | null }>("select id, seeded_at from people where handle = $1", [CASEY]);
    if (had.rows[0]?.seeded_at) return Number(had.rows[0].id);
    const run = kv();
    // Casey's edits as Redis holds them: a value that can't be read stops the move, rather than moving in without them.
    // The value stays in Redis afterward, untouched, as a copy of how things stood.
    const [base, raw] = await Promise.all([pageRecords(), run ? run([["GET", EDITS]]).then(([v]) => v) : null]);
    const edits: Edits | null = raw == null ? null : { ...empty(), ...JSON.parse(String(raw)) };
    const id = had.rows[0]
      ? Number(had.rows[0].id)
      : Number((await c.query<{ id: string }>("insert into people (handle, name, email) values ($1, 'Casey', $2) returning id", [CASEY, ownerEmail()])).rows[0].id);
    for (const [i, r] of base.entries()) await hold(c, id, "base", r, i);
    if (edits) await write(c, id, empty(), edits);
    await c.query("update people set seeded_at = now() where id = $1", [id]);
    return id;
  }).catch((e) => {
    ready = null; // try again on the next request
    throw e;
  });
  return ready;
}

const empty = (): Edits => ({ added: [], removed: [], patch: {}, crates: { list: [] } });

// a record into someone's whole crate, its release found by MusicBrainz id or made
async function hold(c: PoolClient, id: number, kind: "base" | "added", r: Base | Rec, seq: number) {
  const { facts, rec } = split(r as Base);
  const mbid = typeof (r as Base).release === "string" ? (r as Base).release! : null;
  let rel: number;
  const had = mbid ? null : (await c.query<{ release_id: string }>("select release_id from holdings where person_id = $1 and slug = $2", [id, r.slug])).rows[0];
  if (had?.release_id) {
    rel = Number(had.release_id);
    await c.query("update releases set artist = $2, title = $3, facts = $4 where id = $1 and mbid is null", [rel, r.artist, r.title, facts]);
  } else if (mbid) {
    const q = await c.query<{ id: string }>(
      `insert into releases (mbid, artist, title, facts) values ($1, $2, $3, $4)
       on conflict (mbid) do update set facts = releases.facts || excluded.facts returning id`,
      [mbid, r.artist, r.title, facts],
    );
    rel = Number(q.rows[0].id);
  } else rel = Number((await c.query<{ id: string }>("insert into releases (artist, title, facts) values ($1, $2, $3) returning id", [r.artist, r.title, facts])).rows[0].id);
  await c.query(
    `insert into holdings (person_id, slug, kind, release_id, rec, seq) values ($1, $2, $3, $4, $5, $6)
     on conflict (person_id, slug) do update set kind = excluded.kind, release_id = excluded.release_id, rec = excluded.rec, seq = excluded.seq`,
    [id, r.slug, kind, rel, rec, seq],
  );
}

// A person's crate in the shape the page and the API know: the base list, and the edits over it
export async function load(db: Pool | PoolClient, id: number): Promise<{ base: Base[]; edits: Edits }> {
  // a pool runs these side by side; one connection, inside a change, takes them in turn
  const each = db instanceof Pool ? <T,>(qs: (() => Promise<T>)[]) => Promise.all(qs.map((q) => q())) : async <T,>(qs: (() => Promise<T>)[]) => {
    const out: T[] = [];
    for (const q of qs) out.push(await q());
    return out;
  };
  const [p, h, out, pa, cs, cr, cx] = await each([
    () => db.query("select all_name, all_about, pinned from people where id = $1", [id]),
    () => db.query("select h.slug, h.kind, h.rec, r.facts from holdings h join releases r on r.id = h.release_id where h.person_id = $1 order by h.seq", [id]),
    () => db.query("select slug from taken_out where person_id = $1 order by at, slug", [id]),
    () => db.query("select slug, patch from patches where person_id = $1", [id]),
    () => db.query("select id, slug, name, about, rank from crates where person_id = $1 order by seq", [id]),
    () => db.query("select cr.crate_id, cr.slug from crate_records cr join crates c on c.id = cr.crate_id where c.person_id = $1 order by cr.seq", [id]),
    () => db.query("select cx.crate_id, cx.rec from crate_extras cx join crates c on c.id = cx.crate_id where c.person_id = $1 order by cx.seq", [id]),
  ]);
  const rec = (row: { rec: object; facts: object }) => ({ ...row.facts, ...row.rec }) as Base;
  const base = h.rows.filter((r) => r.kind === "base").map(rec);
  const added = h.rows.filter((r) => r.kind === "added").map(rec);
  const me = p.rows[0] ?? {};
  const all: { name?: string; about?: string } = {};
  if (me.all_name) all.name = me.all_name;
  if (me.all_about) all.about = me.all_about;
  const list: Crate[] = cs.rows.map((c) => {
    const k: Crate = { slug: c.slug, name: c.name, records: cr.rows.filter((x) => x.crate_id === c.id).map((x) => x.slug), extra: cx.rows.filter((x) => x.crate_id === c.id).map((x) => x.rec) };
    if (c.about) k.about = c.about;
    if (Array.isArray(c.rank)) k.rank = c.rank;
    return k;
  });
  const crates: Edits["crates"] = { list };
  if (me.pinned) crates.pinned = me.pinned;
  if (Object.keys(all).length) crates.all = all;
  return { base, edits: { added, removed: out.rows.map((r) => r.slug), patch: Object.fromEntries(pa.rows.map((r) => [r.slug, r.patch as Patch])), crates } };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Write what changed between two versions of the edits, row by row
async function write(c: PoolClient, id: number, was: Edits, now: Edits) {
  // records added since the page: in order after the base list
  const before = new Map(was.added.map((r, i) => [r.slug, { r, i }]));
  for (const [i, r] of now.added.entries()) {
    const b = before.get(r.slug);
    if (!b || b.i !== i || !same(b.r, r)) await hold(c, id, "added", r, 100_000 + i);
  }
  const kept = new Set(now.added.map((r) => r.slug));
  const gone = was.added.filter((r) => !kept.has(r.slug)).map((r) => r.slug);
  if (gone.length) await c.query("delete from holdings where person_id = $1 and kind = 'added' and slug = any($2)", [id, gone]);

  const out = new Set(now.removed), wasOut = new Set(was.removed);
  for (const s of out) if (!wasOut.has(s)) await c.query("insert into taken_out (person_id, slug) values ($1, $2) on conflict do nothing", [id, s]);
  const back = [...wasOut].filter((s) => !out.has(s));
  if (back.length) await c.query("delete from taken_out where person_id = $1 and slug = any($2)", [id, back]);

  for (const [s, p] of Object.entries(now.patch))
    if (!same(was.patch[s], p)) await c.query("insert into patches (person_id, slug, patch) values ($1, $2, $3) on conflict (person_id, slug) do update set patch = excluded.patch", [id, s, p]);
  const unpatched = Object.keys(was.patch).filter((s) => !(s in now.patch));
  if (unpatched.length) await c.query("delete from patches where person_id = $1 and slug = any($2)", [id, unpatched]);

  const wc = was.crates ?? { list: [] }, nc = now.crates ?? { list: [] };
  if (!same(wc.all, nc.all) || wc.pinned !== nc.pinned)
    await c.query("update people set all_name = $2, all_about = $3, pinned = $4 where id = $1", [id, nc.all?.name ?? null, nc.all?.about ?? null, nc.pinned ?? null]);
  const old = new Map(wc.list.map((k) => [k.slug, k]));
  for (const [i, k] of nc.list.entries()) {
    const o = old.get(k.slug);
    if (o && same(o, k) && wc.list.indexOf(o) === i) continue;
    const q = await c.query<{ id: string }>(
      `insert into crates (person_id, slug, name, about, seq, rank) values ($1, $2, $3, $4, $5, $6)
       on conflict (person_id, slug) do update set name = excluded.name, about = excluded.about, seq = excluded.seq, rank = excluded.rank returning id`,
      [id, k.slug, k.name, k.about ?? null, i, k.rank ? JSON.stringify(k.rank) : null],
    );
    const cid = Number(q.rows[0].id);
    if (!o || !same(o.records, k.records)) {
      await c.query("delete from crate_records where crate_id = $1", [cid]);
      for (const [j, s] of k.records.entries()) await c.query("insert into crate_records (crate_id, slug, seq) values ($1, $2, $3)", [cid, s, j]);
    }
    if (!o || !same(o.extra, k.extra)) {
      await c.query("delete from crate_extras where crate_id = $1", [cid]);
      for (const [j, r] of k.extra.entries()) await c.query("insert into crate_extras (crate_id, slug, rec, seq) values ($1, $2, $3, $4)", [cid, r.slug, r, j]);
    }
  }
  const dropped = wc.list.filter((k) => !nc.list.some((x) => x.slug === k.slug)).map((k) => k.slug);
  if (dropped.length) await c.query("delete from crates where person_id = $1 and slug = any($2)", [id, dropped]);
}

// A change: read the crate inside a transaction (locking this person, so changes queue rather than cross), let fn change the
// edits in memory as the API always has, and write only what it changed. fn returns an error to refuse the change.
export async function change(db: Pool, id: number, fn: (e: Edits) => string | void | Promise<string | void>) {
  return tx(db, async (c) => {
    await c.query("select id from people where id = $1 for update", [id]);
    const { edits } = await load(c, id);
    const was: Edits = structuredClone(edits);
    const bad = await fn(edits);
    if (bad) return { bad, was, edits };
    await write(c, id, was, edits);
    return { was, edits };
  });
}
