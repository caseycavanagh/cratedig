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

// "Sam’s top 10 of 2026", or "A top 10 of 2026" without a name
export function whose(by: string | null) {
  const n = (by || "").trim().slice(0, 40);
  return n ? `${n}${/s$/i.test(n) ? "’" : "’s"} top 10 of 2026` : "A top 10 of 2026";
}

// the address's colors and name, the only parts the link picture needs
export function cardQuery(q: URLSearchParams) {
  const out = new URLSearchParams();
  for (const k of ["by", "t", "bg", "fg", "n"]) { const v = q.get(k); if (v) out.set(k, v.slice(0, 40)); }
  return out.toString();
}
