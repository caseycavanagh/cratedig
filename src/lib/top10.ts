import { spotifyAlbums } from "@/lib/spotify";
// A top 10 of 2026's colors, as its link carries them: t=<preset letter>, or t=h (from the number one's cover) / t=x (your own)
// with bg, fg and maybe n (the numbers) as six hex digits. Keep the presets in step with SC in public/top10.html.
export const PRESETS: Record<string, [name: string, bg: string, fg: string, n: string]> = {
  a: ["Night", "#121212", "#ffffff", "#ffffff"],
  b: ["Paper", "#f2ede2", "#1f1b16", "#1f1b16"],
  c: ["Cobalt", "#1f33c7", "#ffffff", "#ffffff"],
  d: ["Tomato", "#e2462c", "#fff6ea", "#fff6ea"],
  e: ["Forest", "#16382a", "#f1e9d2", "#d8b968"],
  f: ["Bubblegum", "#ffd3e3", "#3a0d28", "#c2185b"],
  g: ["Mustard", "#f1c232", "#1c1708", "#1c1708"],
};

const HEX = /^[0-9a-f]{6}$/i;
export function colors(q: URLSearchParams) {
  const p = PRESETS[q.get("t") || "a"];
  if (p) return { bg: p[1], fg: p[2], n: p[3] };
  const bg = q.get("bg") || "", fg = q.get("fg") || "", n = q.get("n") || "";
  if (!HEX.test(bg) || !HEX.test(fg)) return { bg: PRESETS.a[1], fg: PRESETS.a[2], n: PRESETS.a[3] };
  return { bg: `#${bg}`, fg: `#${fg}`, n: HEX.test(n) ? `#${n}` : `#${fg}` };
}

// "My top 10 in 2026 by Sam", as the maker titles it (the title, with the name signed under it), or just "My top 10 in 2026"
export function whose(by: string | null) {
  const n = (by || "").trim().slice(0, 40);
  return n ? `My top 10 in 2026 by ${n}` : "My top 10 in 2026";
}

// the address's colors, name and records: what the link picture needs
export function cardQuery(q: URLSearchParams) {
  const out = new URLSearchParams();
  for (const k of ["by", "t", "bg", "fg", "n"]) { const v = q.get(k); if (v) out.set(k, v.slice(0, 40)); }
  for (const k of ["d", "m", "c", "s", "o"]) { const v = q.get(k); if (v) out.set(k, v.slice(0, 400)); }
  return out.toString();
}

// the ten covers for the link picture, in the list's order: MusicBrainz releases from the Cover Art Archive, Apple Music albums from
// iTunes. Each comes back as a data URL (or null), so one slow or missing cover leaves a blank square instead of breaking the picture.
// Spotify albums (s) from Spotify. Discogs records (d) need a token and stay blank. Mirrors decode/decodeM/fromAddress in public/vinyl/visitor-crate.js.
const b36 = (c: string | null) => [...new Set((c || "").split(".").map((s) => parseInt(s, 36)).filter((n) => n > 0))];
const mbids = (c: string | null) =>
  [...new Set((c || "").split(".").filter((s) => /^[0-9a-z]{1,25}$/.test(s)).map((s) => {
    let n = BigInt(0);
    for (const ch of s) n = n * BigInt(36) + BigInt(parseInt(ch, 36));
    const h = n.toString(16).padStart(32, "0");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }))];
const UA = "cratedig/1.0 (https://cratedig-demo.vercel.app)";
async function dataURL(url: string) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const type = res.headers.get("Content-Type") || "image/jpeg";
    if (!/^image\/(jpeg|png)/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}
export async function covers(q: URLSearchParams): Promise<(string | null)[]> {
  const d = b36(q.get("d")).slice(0, 10), m = mbids(q.get("m")).slice(0, 10), c = b36(q.get("c")).slice(0, 10);
  const s = [...new Set((q.get("s") || "").split(".").filter((x) => /^[0-9A-Za-z]{22}$/.test(x)))].slice(0, 10);
  const spotify: Record<string, string> = {};
  if (s.length) { try { for (const r of await spotifyAlbums(s)) spotify[r.id] = r.thumb; } catch {} }
  const apple: Record<string, string> = {};
  if (c.length) {
    try {
      const res = await fetch(`https://itunes.apple.com/lookup?entity=album&id=${c.join(",")}`, { signal: AbortSignal.timeout(4000) });
      for (const a of (await res.json()).results ?? []) if (a.wrapperType === "collection" && a.artworkUrl100) apple[a.collectionId] = a.artworkUrl100.replace(/\/\d+x\d+bb\./, "/300x300bb.");
    } catch {}
  }
  const urls = {
    d: d.map(() => ""),
    m: m.map((id) => `https://coverartarchive.org/release/${id}/front-250`),
    a: c.map((id) => apple[id] || ""),
    s: s.map((id) => spotify[id] || ""),
  };
  const o = q.get("o"), order: string[] = [];
  if (o) { const k = { d: [...urls.d], m: [...urls.m], a: [...urls.a], s: [...urls.s] } as Record<string, string[]>; for (const ch of o) { const u = k[ch]?.shift(); if (u !== undefined) order.push(u); } }
  else order.push(...urls.d, ...urls.m, ...urls.a, ...urls.s);
  return Promise.all(order.slice(0, 10).map((u) => (u ? dataURL(u) : null)));
}
