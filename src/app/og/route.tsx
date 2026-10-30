import { titleCard } from "@/lib/og";

// /og: the crate's link preview

export function GET() {
  return titleCard({ title: "Records", sub: "Every record Casey owns, flipped through like a crate", foot: "Casey Cavanagh" });
}
