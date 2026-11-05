import { titleCard } from "@/lib/og";
import { origin } from "@/lib/page";

// /og/landing: the landing page's link preview

export function GET(req: Request) {
  return titleCard({ title: "Crate Dig", sub: "Every record you own, flipped through like a crate", foot: "Make your crate", host: new URL(origin(req)).host });
}
