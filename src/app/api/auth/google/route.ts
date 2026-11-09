// Off to Google to sign in (src/lib/auth.ts). ?back=/casey/<crate> is where to land after; a random state in a short-lived
// cookie makes sure the answer that comes back is to this request.
import { randomBytes } from "node:crypto";
import { connection } from "next/server";
import { STATE, callback, google, setCookie } from "@/lib/auth";

export async function GET(req: Request) {
  await connection();
  const g = google();
  if (!g) return Response.json({ error: "Google sign-in isn't set up" }, { status: 404 });
  const asked = new URL(req.url).searchParams.get("back") ?? "";
  const back = /^\/(?!\/)[^\s\\]*$/.test(asked) ? asked : "/casey/all";
  const state = randomBytes(24).toString("base64url");
  const to = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  to.search = new URLSearchParams({
    client_id: g.id,
    redirect_uri: callback(req),
    response_type: "code",
    scope: "openid email",
    state,
    prompt: "select_account",
  }).toString();
  const headers = new Headers({ Location: to.toString(), "Cache-Control": "no-store" });
  headers.append("Set-Cookie", setCookie(req, STATE, `${state} ${back}`, 600));
  return new Response(null, { status: 302, headers });
}
