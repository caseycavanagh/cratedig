// Is this device signed in to edit (src/lib/auth.ts)? Never cached, since the answer is per device.
//   GET    /api/auth → { google, owner }: google is whether Google sign-in is set up, owner whether this device is signed in with it
//   DELETE /api/auth → signs this device out
import { connection } from "next/server";
import { kv } from "@/lib/kv";
import { endSession, google, signedIn } from "@/lib/auth";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  await connection();
  const run = kv();
  return Response.json({ google: !!google(), owner: !!run && (await signedIn(req, run)) }, { headers: NO_STORE });
}

export async function DELETE(req: Request) {
  await connection();
  const run = kv();
  const headers = new Headers(NO_STORE);
  if (run) headers.append("Set-Cookie", await endSession(req, run));
  return Response.json({ owner: false }, { headers });
}
