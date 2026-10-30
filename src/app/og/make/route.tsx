import { titleCard } from "@/lib/og";

// /og/make: the make page's link preview

export function GET() {
  return titleCard({ title: "Make your crate", sub: "Your records, flipped through like a crate", foot: "Share it as a link" });
}
