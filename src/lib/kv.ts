// Upstash Redis over its REST API, for the crate's edits (src/lib/crate.ts).
// Add Upstash from Vercel's marketplace; it sets KV_REST_API_URL and KV_REST_API_TOKEN.
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
