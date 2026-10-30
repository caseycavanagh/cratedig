// npm run icons: the site's icons, drawn from the record mark (public/vinyl/records-logo.svg), set up the way caseycavanagh.com does it.
//   public/favicon.svg         tabs and bookmarks in browsers that take SVG; a rounded tile that flips with the browser's light or dark
//   public/favicon.ico         16, 32 and 48 for everything else (and the /favicon.ico every browser asks for)
//   public/apple-touch-icon.png  180 square, opaque and edge to edge: home screens and Safari Favorites round the corners themselves
// Small sizes drop the outer ring and draw the rest bigger, since seven pieces turn to mush at 16 (vinyl-icon-sheet.html, A2).
// The link preview card is src/app/og/route.tsx.
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const pub = new URL("../public/", import.meta.url);
const logo = await readFile(new URL("vinyl/records-logo.svg", pub), "utf8");
const P = [...logo.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]); // outer ring, middle, inner (two halves each), label
const RINGS = { full: [[0, 1, 2, 3, 4, 5, 6], 175], two: [[2, 3, 4, 5, 6], 125] }; // which pieces, and the radius they reach
const DARK = "#121212", LIGHT = "#ecebe8"; // the crate's own background and text

// the record centered in a 180 box, spanning `fill` of it
function mark(rings, fill, attrs = "") {
  const [ids, r] = RINGS[rings], k = +((fill * 90) / r).toFixed(4);
  return `<g${attrs} transform="translate(90 90) scale(${k}) translate(-175 -175)">${ids.map((i) => `<path d="${P[i]}"${i === 6 ? ' fill-rule="evenodd"' : ""}/>`).join("")}</g>`;
}
const svg = (body, style = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">${style}${body}</svg>`;

// favicon.svg: dark tile in a light browser, light tile in a dark one
const favicon = svg(`<rect width="180" height="180" rx="40"/>${mark("two", 0.78)}`, `<style>rect{fill:${DARK}}path{fill:${LIGHT}}@media (prefers-color-scheme:dark){rect{fill:${LIGHT}}path{fill:${DARK}}}</style>`);
await writeFile(new URL("favicon.svg", pub), favicon + "\n");

// favicon.ico: the dark tile (an .ico can't follow light and dark), PNGs inside, which every current browser reads
const tile = svg(`<rect width="180" height="180" rx="40" fill="${DARK}"/>${mark("two", 0.78, ` fill="${LIGHT}"`)}`);
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((n) => sharp(Buffer.from(tile), { density: (72 * n) / 180 * 8 }).resize(n, n).png().toBuffer()));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let at = head.length;
sizes.forEach((n, i) => {
  const e = 6 + 16 * i;
  head[e] = n; head[e + 1] = n;
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(at, e + 12);
  at += pngs[i].length;
});
await writeFile(new URL("favicon.ico", pub), Buffer.concat([head, ...pngs]));

// apple-touch-icon.png: the whole record on the crate's dark, with the same room around it as the C on caseycavanagh.com
const touch = svg(`<rect width="180" height="180" fill="${DARK}"/>${mark("full", 0.66, ` fill="${LIGHT}"`)}`);
await sharp(Buffer.from(touch), { density: 72 * 4 }).resize(180, 180).flatten({ background: DARK }).png({ compressionLevel: 9 }).toFile(new URL("apple-touch-icon.png", pub).pathname);

console.log("favicon.svg, favicon.ico (16, 32, 48), apple-touch-icon.png (180)");
