import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The 1200×630 card a shared link shows (Messages, Slack, Bluesky…): caseycavanagh.com's title card, turned dark like the crate.
// The crate's preview is /og (app/og/route.tsx), the make page's /og/make. The icons are scripts/icons.mjs.

const font = (f: string) => readFile(join(process.cwd(), "assets/fonts", f));
const [regular, medium] = await Promise.all([font("InstrumentSans-Regular.ttf"), font("InstrumentSans-Medium.ttf")]);

// Paper Mono ships as woff2, which ImageResponse can't read; take a .ttf from the same pinned commit on jsDelivr, else stay in Instrument Sans
const PAPER = "paper-design/paper-mono@e6eaeceaef02";
async function paperMono(): Promise<ArrayBuffer | null> {
  try {
    const list = await fetch(`https://data.jsdelivr.com/v1/packages/gh/${PAPER}?structure=flat`, { signal: AbortSignal.timeout(5000) });
    const files: { name: string }[] = (await list.json()).files ?? [];
    const ttf = files.map((f) => f.name).filter((n) => /\.ttf$/i.test(n));
    const pick = ttf.find((n) => /Regular\.ttf$/i.test(n)) ?? ttf.find((n) => !/italic/i.test(n));
    if (!pick) return null;
    const res = await fetch(`https://cdn.jsdelivr.net/gh/${PAPER}${pick}`, { signal: AbortSignal.timeout(5000) });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}
const mono = await paperMono();
const MONO = mono ? "Paper Mono" : "Instrument Sans";
const HOST = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? ""; // the site's domain, from Vercel at build

// the record mark, public/vinyl/records-logo.svg
const MARK = [
  "M157.145 0.0252864C160.03 -0.268345 162.5 2.03448 162.5 4.94184V20.1458C162.5 22.7538 160.496 24.9183 157.911 25.2131C83.1157 33.7382 25.0003 97.5464 25 175C25 252.453 83.1156 316.262 157.911 324.787C160.496 325.082 162.5 327.245 162.5 329.853V345.057C162.5 347.965 160.03 350.268 157.145 349.975C68.8822 340.985 0 266.079 0 175C0.000299011 83.9203 68.8823 9.01514 157.145 0.0252864Z",
  "M187.5 4.94282C187.5 2.03527 189.97 -0.268454 192.855 0.0252864C281.118 9.01516 350 83.9211 350 175.001C350 266.08 281.118 340.985 192.855 349.975C189.97 350.269 187.5 347.966 187.5 345.058V329.853C187.5 327.245 189.504 325.082 192.089 324.787C266.884 316.262 325 252.454 325 175.001C325 97.5471 266.884 33.7373 192.089 25.2121C189.504 24.9174 187.5 22.7538 187.5 20.1458V4.94282Z",
  "M157.017 50.6613C159.943 50.2375 162.5 52.5624 162.5 55.5269V70.8483C162.5 73.3761 160.618 75.495 158.133 75.9195C110.937 83.9772 75.0003 125.27 75 175C75 224.729 110.936 266.022 158.133 274.079C160.618 274.504 162.5 276.623 162.5 279.151V294.473C162.5 297.438 159.943 299.763 157.017 299.34C96.5016 290.577 50 238.246 50 175C50.0003 111.753 96.5018 59.4244 157.017 50.6613Z",
  "M187.5 55.5279C187.5 52.5633 190.057 50.2374 192.983 50.6613C253.498 59.4244 300 111.754 300 175.001C300 238.247 253.498 290.576 192.983 299.339C190.057 299.763 187.5 297.438 187.5 294.473V279.151C187.5 276.623 189.381 274.504 191.867 274.079C239.063 266.022 275 224.73 275 175.001C275 125.271 239.064 83.9772 191.867 75.9195C189.381 75.4951 187.5 73.3762 187.5 70.8483V55.5279Z",
  "M156.713 101.879C159.712 101.123 162.5 103.489 162.5 106.59V122.448C162.5 124.733 160.947 126.705 158.79 127.447C139.132 134.215 125 152.948 125 175C125 197.051 139.132 215.785 158.79 222.553C160.947 223.295 162.5 225.266 162.5 227.552V243.409C162.5 246.51 159.712 248.877 156.713 248.121C124.13 239.916 100 210.29 100 175C100 139.709 124.13 110.084 156.713 101.879Z",
  "M187.5 106.59C187.5 103.489 190.287 101.123 193.286 101.878C225.869 110.083 250 139.709 250 175.001C250 210.291 225.869 239.917 193.286 248.122C190.287 248.877 187.5 246.51 187.5 243.41V227.551C187.5 225.266 189.053 223.294 191.21 222.552C210.868 215.784 225 197.052 225 175.001C225 152.949 210.868 134.215 191.21 127.447C189.053 126.705 187.5 124.734 187.5 122.448V106.59Z",
  "M174.622 150.689C188.429 150.689 199.622 161.91 199.622 175.751C199.622 189.593 188.429 200.814 174.622 200.814C160.815 200.814 149.622 189.593 149.622 175.751C149.622 161.91 160.815 150.689 174.622 150.689ZM174.622 170.739C171.861 170.739 169.622 172.983 169.622 175.751C169.622 178.52 171.861 180.764 174.622 180.764C177.383 180.764 179.622 178.52 179.622 175.751C179.622 172.983 177.383 170.739 174.622 170.739Z",
];

// title big, sub under it in gray, a small mono line along the bottom
export function titleCard({ title, sub, foot }: { title: string; sub: string; foot: string }) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 96, background: "#121212", color: "#ecebe8", fontFamily: "Instrument Sans" }}>
        <svg width="64" height="64" viewBox="0 0 350 350">
          {MARK.map((d, i) => <path key={i} fill="#ecebe8" fillRule="evenodd" d={d} />)}
        </svg>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 100, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{title}</div>
          <div style={{ fontSize: 50, color: "#8f8f93", marginTop: 18, letterSpacing: "-0.01em" }}>{sub}</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 72, fontFamily: MONO, fontSize: 30, color: "#8f8f93" }}>
            <span>{foot}</span>
            <span>{HOST}</span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Instrument Sans", data: regular, weight: 400, style: "normal" },
        { name: "Instrument Sans", data: medium, weight: 500, style: "normal" },
        ...(mono ? [{ name: "Paper Mono", data: mono, weight: 400 as const, style: "normal" as const }] : []),
      ],
    },
  );
}
