// Back from Google (src/lib/auth.ts): trade the code for who signed in, and if it's one of CRATE_OWNER_EMAIL, sign this device in.
// The ID token comes straight from Google's token endpoint over TLS, so its claims can be read without checking its signature.
// Either way it goes back to the crate, with ?signin=no when that account can't edit.
import { connection } from "next/server";
import { kv } from "@/lib/kv";
import { STATE, callback, cookie, google, isOwner, setCookie, startSession } from "@/lib/auth";
import { origin } from "@/lib/page";

export async function GET(req: Request) {
  await connection();
  const g = google(),
    run = kv();
  const q = new URL(req.url).searchParams;
  const [state, back = "/casey/all"] = cookie(req, STATE).split(" ");
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", setCookie(req, STATE, "", 0));
  const land = (ok: boolean) => {
    const u = new URL(back, origin(req));
    if (!ok) u.searchParams.set("signin", "no");
    headers.set("Location", u.toString());
    return new Response(null, { status: 302, headers });
  };
  if (!g || !run || !state || q.get("state") !== state || !q.get("code")) return land(false);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: q.get("code")!,
      client_id: g.id,
      client_secret: g.secret,
      redirect_uri: callback(req),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  }).catch(() => null);
  const token = res?.ok ? ((await res.json()) as { id_token?: string }).id_token : undefined;
  let who: { aud?: string; email?: string; email_verified?: boolean } = {};
  try {
    who = JSON.parse(Buffer.from(token!.split(".")[1], "base64url").toString());
  } catch {
    return land(false);
  }
  if (who.aud !== g.id || !who.email || who.email_verified !== true || !isOwner(who.email)) return land(false);
  headers.append("Set-Cookie", await startSession(req, run));
  return land(true);
}
