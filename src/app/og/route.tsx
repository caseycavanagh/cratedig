import { titleCard } from "@/lib/og";
import { origin } from "@/lib/page";

// /og: the crate's link preview

export function GET(req: Request) {
  return titleCard({ title: "Crate Dig", sub: "Every record Casey owns, flipped through like a crate", foot: "Casey Cavanagh", host: new URL(origin(req)).host });
}
