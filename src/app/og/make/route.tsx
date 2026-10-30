import { titleCard } from "@/lib/og";
import { origin } from "@/lib/page";

// /og/make: the make page's link preview

export function GET(req: Request) {
  return titleCard({ title: "Make your crate", sub: "Your records, flipped through like a crate", foot: "Share it as a link", host: new URL(origin(req)).host });
}
