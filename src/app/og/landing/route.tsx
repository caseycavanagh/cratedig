import { titleCard } from "@/lib/og";
import { origin } from "@/lib/page";

// /og/landing: the link preview for "/" (the coming soon page, public/soon.html)

export function GET(req: Request) {
  return titleCard({ title: "Crate Dig", sub: "Dig your records", foot: "Coming soon", host: new URL(origin(req)).host });
}
