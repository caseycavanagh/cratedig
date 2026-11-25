import { kv } from "@/lib/kv";

// POST /api/notify { email } → 204: the coming soon page's signup (public/soon.html). Each address is kept once, in the sorted set
// "notify:emails" scored by when it first came in (ZADD NX). Read them with ZRANGE notify:emails 0 -1 WITHSCORES in Upstash.
// One address from the same network more than 20 times an hour is turned away, so the list can't be flooded from one place.
const LOOKS = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  const run = kv();
  if (!run) return new Response("not set up", { status: 503 });
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !LOOKS.test(email)) return new Response("that doesn't look like an email", { status: 400 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const key = `notify:ip:${ip}`;
  try {
    const [n] = (await run([["INCR", key], ["EXPIRE", key, 3600, "NX"]])) as [number];
    if (n > 20) return new Response("too many", { status: 429 });
    await run([["ZADD", "notify:emails", "NX", Date.now(), email]]);
  } catch {
    return new Response("couldn't save", { status: 502 });
  }
  return new Response(null, { status: 204 });
}
