// The names in a crate's liner notes that are already looked up: for each record the crate asks about (by the same key
// /api/liner keeps its answer under), its producers, players and genres. The open record links a name that other
// records in the crate share, so it can fill the crate with them, like a year or a label.
//   POST { keys: ["v2|<mb>|<d>|<a>|<g>|<artist>|<title>", …] }  →  { "<key>": { producer, players, genres } }

import type { NextRequest } from "next/server";
import { kv } from "@/lib/kv";

type Liner = { genres?: string[]; credits?: { producer?: string[]; players?: [string, string][] } | null };

export async function POST(request: NextRequest) {
  const store = kv();
  const body = await request.json().catch(() => null);
  const keys: string[] = Array.isArray(body?.keys) ? body.keys.filter((k: unknown) => typeof k === "string" && k.length < 700).slice(0, 600) : [];
  if (!store || !keys.length) return Response.json({});
  const got = (await store([["MGET", ...keys.map((k) => `crate:liner:${k}`)]]).catch(() => [[]]))[0] as (string | null)[];
  const out: Record<string, { producer: string[]; players: string[]; genres: string[] }> = {};
  keys.forEach((k, i) => {
    const l = got?.[i] ? (JSON.parse(got[i] as string) as Liner) : null;
    if (l) out[k] = { producer: l.credits?.producer ?? [], players: (l.credits?.players ?? []).map((p) => p[0]), genres: l.genres ?? [] };
  });
  return Response.json(out);
}
