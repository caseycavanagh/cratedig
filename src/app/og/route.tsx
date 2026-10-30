import { titleCard } from "@/lib/og";

// /og: the crate's link preview

export function GET() {
  return titleCard({ title: "Crate Dig", sub: "Every record Casey owns, flipped through like a crate", foot: "Casey Cavanagh" });
}
