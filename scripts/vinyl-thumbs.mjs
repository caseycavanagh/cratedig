// Small copies of every front cover for the grid, the table and the search list, made at build time
// (npm runs this before `next build` and `next dev`). A tile is 100–250px wide on screen, so it picks
// the 360px or 720px copy instead of the 1200px cover. Copies live in public/vinyl/t/ and aren't
// committed: any cover added to public/vinyl gets them on the next build.
import {mkdir, readdir, stat} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SRC = path.resolve('public/vinyl'), OUT = path.join(SRC, 't');
const WIDTHS = [360, 720];
await mkdir(OUT, {recursive: true});
const fronts = (await readdir(SRC)).filter(f => f.endsWith('-front.webp'));
const age = f => stat(f).then(s => s.mtimeMs, () => 0);
let made = 0;
await Promise.all(fronts.map(async f => {
  const from = path.join(SRC, f), t = await age(from);
  for (const w of WIDTHS) {
    const to = path.join(OUT, f.replace(/\.webp$/, `-${w}.webp`));
    if (await age(to) >= t) continue;
    await sharp(from).resize(w, w, {fit: 'cover'}).webp({quality: 78}).toFile(to);
    made++;
  }
}));
console.log(`vinyl-thumbs: ${made} made, ${fronts.length * WIDTHS.length - made} already there`);
