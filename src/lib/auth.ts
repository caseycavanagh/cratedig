// Signing in to edit the crate with Google, in place of typing CRATE_KEY. Only the addresses in CRATE_OWNER_EMAIL get in.
// Set up when GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and CRATE_OWNER_EMAIL are all set; until then the key is the only way in.
// A signed-in device holds a random session id in an httpOnly cookie; Redis keeps only its hash, for a year (crate:session:<hash>).
// The cookie is SameSite=Lax, so another site can't post edits with it.
import { createHash, randomBytes } from "node:crypto";
import type { Run } from "@/lib/crate";
import { origin } from "@/lib/page";

export const SESSION = "crate_session";
export const STATE = "crate_oauth";
const YEAR = 60 * 60 * 24 * 365;
const sessionKey = (id: string) => `crate:session:${createHash("sha256").update(id).digest("hex")}`;

const owners = () =>
  (process.env.CRATE_OWNER_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
export const google = () =>
  process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim() && owners().length
    ? { id: process.env.GOOGLE_CLIENT_ID.trim(), secret: process.env.GOOGLE_CLIENT_SECRET.trim() }
    : null;
export const isOwner = (email: string) => owners().includes(email.trim().toLowerCase());

export function cookie(req: Request, name: string) {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return "";
}
export function setCookie(req: Request, name: string, value: string, maxAge: number) {
  const secure = origin(req).startsWith("https:") ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

export const callback = (req: Request) => `${origin(req)}/api/auth/google/callback`;

export async function signedIn(req: Request, run: Run) {
  const id = cookie(req, SESSION);
  if (!id || !google()) return false;
  const [v] = await run([["GET", sessionKey(id)]]);
  return v === "1";
}
export async function startSession(req: Request, run: Run) {
  const id = randomBytes(32).toString("base64url");
  await run([["SET", sessionKey(id), "1", "EX", YEAR]]);
  return setCookie(req, SESSION, id, YEAR);
}
export async function endSession(req: Request, run: Run) {
  const id = cookie(req, SESSION);
  if (id) await run([["DEL", sessionKey(id)]]);
  return setCookie(req, SESSION, "", 0);
}
