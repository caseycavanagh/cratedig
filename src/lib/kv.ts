// Upstash Redis over its REST API, shared by the likes and views routes.
// Add Upstash from Vercel's marketplace; it sets KV_REST_API_URL and KV_REST_API_TOKEN.
import { createHash } from "node:crypto";
import { site } from "@/lib/site";

type Cmd = (string | number)[];

export const kv = () => {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return async (cmds: Cmd[]) => {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmds),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`redis ${res.status}`);
    return ((await res.json()) as { result: unknown }[]).map((r) => r.result);
  };
};

// a reader, without accounts or cookies: a salted hash of their IP, different for every note
export const reader = (req: Request, slug: string) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  return createHash("sha256").update(`${slug}:${ip}:${process.env.LIKES_SALT ?? "cc"}`).digest("hex").slice(0, 32);
};

export const isNote = (slug: unknown): slug is string => typeof slug === "string" && site().notes.some((n) => n.slug === slug);
