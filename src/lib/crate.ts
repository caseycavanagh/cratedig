// Casey's edits to the records crate (public/index.html, and the original in public/vinyl-prototype.html), kept in Upstash Redis (src/lib/kv.ts)
// next to the likes: records added and taken out, jacket colors, and covers Casey uploads. Anyone can read them,
// because the crate shows them; only Casey can change them: signed in with Google (src/lib/auth.ts), or with the key in CRATE_KEY sent in an X-Crate-Key header.
import { createHash, timingSafeEqual } from "node:crypto";
import { kv } from "@/lib/kv";
import { signedIn } from "@/lib/auth";

export type Run = NonNullable<ReturnType<typeof kv>>;
export type Rec = {
  slug: string;
  artist: string;
  title: string;
  year?: string;
  label?: string;
  format?: string;
  front?: string;
  back?: string;
  spine?: string;
  spotify?: string;
  links?: Record<string, string>;
  added?: string;
};
export type Patch = {
  bg?: string;
  front?: string;
  back?: string;
  spine?: string;
  // the details Casey corrects; an empty string blanks one (a label or year that's wrong rather than missing)
  title?: string;
  artist?: string;
  sortAs?: string;
  year?: string;
  label?: string;
  format?: string;
  // where Play goes, by service; an empty string takes a wrong link away
  links?: Record<string, string>;
  // the liner notes, by hand, over what /api/liner found; an empty value (or list) hides that line
  notes?: Notes;
};
export type Notes = {
  about?: string;
  producer?: string[];
  recorded?: string;
  minutes?: number | "";
  genres?: string[];
  players?: [string, string][]; // name, what they play
  sleeve?: [string, string][]; // role, name
};
// More crates than the one: each is picked from Casey's records (records, by slug) and can hold records Casey doesn't own
// (extra, which live only in that crate). "all" is the whole crate; it keeps a name and description here but never a list.
// A crate's slug is its address (/casey/<slug>) and stays put when it's renamed, so shared links keep working.
export type Crate = { slug: string; name: string; about?: string; records: string[]; extra: Rec[] };
export type Crates = { pinned?: string; all?: { name?: string; about?: string }; list: Crate[] };
export type Edits = { added: Rec[]; removed: string[]; patch: Record<string, Patch>; crates?: Crates };
export const ALL = "all";

export const EDITS = "crate:edits";
export const imgKey = (id: string) => `crate:img:${id}`;
export const IMG_ID = /^[0-9a-f]{24}$/;

export const slugOf = (artist: string, title: string) =>
  `${artist} ${title}`.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function readEdits(run: Run): Promise<Edits> {
  const [v] = await run([["GET", EDITS]]);
  try {
    const e = JSON.parse(String(v));
    return { added: e.added ?? [], removed: e.removed ?? [], patch: e.patch ?? {}, crates: e.crates ?? { list: [] } };
  } catch {
    return { added: [], removed: [], patch: {}, crates: { list: [] } };
  }
}

// Is this Casey? Signed in with Google (src/lib/auth.ts), or holding CRATE_KEY.
// Wrong keys are counted per address, and past 20 in an hour that address waits.
export async function owner(req: Request, run: Run): Promise<boolean | "slow"> {
  if (await signedIn(req, run)) return true;
  // both sides cleaned the same way: a key pasted into Vercel often carries a trailing newline, space or quotes
  const clean = (s?: string | null) => (s ?? "").normalize("NFC").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  const key = clean(process.env.CRATE_KEY);
  // the key comes in its own header, URI-encoded so any character survives; Authorization is left alone, since a protected
  // Vercel preview reads that header itself
  const sent = req.headers.get("x-crate-key");
  let got = clean(req.headers.get("authorization")?.replace(/^Bearer\s+/i, ""));
  if (sent)
    try {
      got = clean(decodeURIComponent(sent));
    } catch {
      got = clean(sent);
    }
  if (!key || !got) return false;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const tries = `crate:tries:${createHash("sha256").update(ip).digest("hex").slice(0, 16)}`;
  const [n] = await run([["GET", tries]]);
  if (Number(n) > 20) return "slow";
  const h = (s: string) => createHash("sha256").update(s).digest();
  if (timingSafeEqual(h(key), h(got))) return true;
  await run([["INCR", tries], ["EXPIRE", tries, 3600]]);
  return false;
}

export const denied = (who: boolean | "slow") =>
  Response.json({ error: who === "slow" ? "too many tries" : "not allowed" }, { status: who === "slow" ? 429 : 401 });

// The images an edit no longer points at
export const ownImg = (u?: string) => u?.match(/^\/api\/crate\/img\/([0-9a-f]{24})$/)?.[1];
export function usedImgs(e: Edits) {
  const s = new Set<string>();
  const add = (u?: string) => {
    const id = ownImg(u);
    if (id) s.add(id);
  };
  for (const x of [...e.added, ...Object.values(e.patch), ...(e.crates?.list ?? []).flatMap((c) => c.extra)]) {
    add(x.front);
    add(x.back);
  }
  return s;
}
