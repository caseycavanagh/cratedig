// Downloads front and back cover art for the records experiment from the
// Cover Art Archive (MusicBrainz) into public/directions/vinyl/, resized to
// 800px with sips, looks up each album's Spotify ID for the embed player
// (SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET from .env.local), and writes
// covers.json for the prototype to read. Fronts come from Apple Music's
// artwork (clean, label-supplied) when it has the album; backs stay with the
// Cover Art Archive.
// Run on a Mac: node scripts/vinyl-covers.mjs   (add --force to refetch)
import {mkdir, writeFile, readFile, access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const OUT = path.resolve('public/directions/vinyl');
const UA = 'caseycavanagh.com-records/1.0 (https://caseycavanagh.com)';
const force = process.argv.includes('--force');

// Keep in sync with RECORDS in public/directions/vinyl-prototype.html
const RECORDS = [
  ['Lucinda Williams', 'Car Wheels on a Gravel Road'],
  ['Wilco', 'Yankee Hotel Foxtrot'],
  ['Gillian Welch', 'Time (The Revelator)'],
  ['Jason Isbell', 'Southeastern'],
  ['Townes Van Zandt', 'Live at the Old Quarter, Houston, Texas'],
  ['Uncle Tupelo', 'No Depression'],
  ['Emmylou Harris', 'Pieces of the Sky'],
  ['Gram Parsons', 'Grievous Angel'],
  ['Neil Young', 'Harvest'],
  ['Sturgill Simpson', 'Metamodern Sounds in Country Music'],
  ['Whiskeytown', 'Strangers Almanac'],
  ['Margo Price', 'Midwest Farmer’s Daughter'],
];

const slug = (a, t) => (a + ' ' + t).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = s => s.replace(/[’]/g, "'").replace(/["\\]/g, '');

async function get(url, json = true) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, {headers: {'User-Agent': UA, Accept: json ? 'application/json' : '*/*'}, redirect: 'follow'});
    if (r.status === 503 || r.status === 429) { await sleep(2000 * (i + 1)); continue; }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return json ? r.json() : Buffer.from(await r.arrayBuffer());
  }
  throw new Error(`gave up on ${url}`);
}

// MusicBrainz asks for at most one request a second
let last = 0;
async function mb(p) {
  const wait = last + 1100 - Date.now(); if (wait > 0) await sleep(wait);
  last = Date.now();
  return get('https://musicbrainz.org/ws/2/' + p + (p.includes('?') ? '&' : '?') + 'fmt=json');
}

async function findCovers(artist, title) {
  const rg = await mb(`release-group/?query=${encodeURIComponent(`releasegroup:"${q(title)}" AND artist:"${q(artist)}" AND primarytype:album`)}&limit=5`);
  const group = rg?.['release-groups']?.[0];
  if (!group) return null;
  // Prefer a vinyl release with both a front and a back; fall back to any front
  const rel = await mb(`release?release-group=${group.id}&inc=media&limit=100`);
  const releases = (rel?.releases || []).sort((a, b) => {
    const v = x => (x.media || []).some(m => /vinyl/i.test(m.format || '')) ? 0 : 1;
    return v(a) - v(b) || (a.date || '9999').localeCompare(b.date || '9999');
  });
  let frontOnly = null;
  for (const r of releases.slice(0, 25)) {
    const caa = await get(`https://coverartarchive.org/release/${r.id}`);
    if (!caa) continue;
    const front = caa.images.find(i => i.front || i.types.includes('Front'));
    const back = caa.images.find(i => i.back || i.types.includes('Back'));
    if (front && back) return {release: r.id, group: group.id, front, back};
    if (front && !frontOnly) frontOnly = {release: r.id, group: group.id, front};
  }
  return frontOnly;
}

async function save(img, file) {
  const url = typeof img === 'string' ? img : img.thumbnails?.['1200'] || img.thumbnails?.large || img.image;
  const buf = await get(url, false);
  const tmp = path.join(OUT, '.tmp-' + path.basename(file));
  await writeFile(tmp, buf);
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', '1200', tmp, '--out', file], {stdio: 'ignore'});
  execFileSync('rm', [tmp]);
}

// Spotify: client-credentials token, then the best album match by name
const env = Object.fromEntries((await readFile('.env.local', 'utf8').catch(() => '')).split('\n')
  .map(l => l.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/)).filter(Boolean).map(m => [m[1], m[2]]));
const sid = process.env.SPOTIFY_CLIENT_ID || env.SPOTIFY_CLIENT_ID, ssecret = process.env.SPOTIFY_CLIENT_SECRET || env.SPOTIFY_CLIENT_SECRET;
let token = null;
if (sid && ssecret) {
  const r = await fetch('https://accounts.spotify.com/api/token', {method: 'POST',
    headers: {Authorization: 'Basic ' + Buffer.from(sid + ':' + ssecret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'grant_type=client_credentials'});
  token = r.ok ? (await r.json()).access_token : null;
}
if (!token) console.log('no Spotify token: skipping album IDs');
const norm = x => x.toLowerCase().replace(/[’']/g, '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
async function spotifyAlbum(artist, title) {
  const r = await fetch('https://api.spotify.com/v1/search?type=album&limit=10&market=US&q=' + encodeURIComponent(`album:${q(title)} artist:${q(artist)}`), {headers: {Authorization: 'Bearer ' + token}});
  if (!r.ok) return null;
  const items = (await r.json()).albums?.items || [];
  const a = norm(artist), t = norm(title);
  const hit = items.find(i => i.artists.some(x => norm(x.name) === a) && norm(i.name) === t)
    || items.find(i => i.artists.some(x => norm(x.name) === a) && norm(i.name).startsWith(t));
  return hit?.id || null;
}

// Apple Music: the iTunes Search API needs no key; artwork URLs take any size up to the master
async function appleFront(artist, title) {
  const r = await get('https://itunes.apple.com/search?entity=album&limit=10&country=us&term=' + encodeURIComponent(`${q(artist)} ${q(title)}`));
  const a = norm(artist), t = norm(title);
  const hit = (r?.results || []).find(i => norm(i.artistName) === a && norm(i.collectionName) === t)
    || (r?.results || []).find(i => norm(i.artistName) === a && norm(i.collectionName).startsWith(t));
  return hit?.artworkUrl100?.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/1500x1500bb.jpg') || null;
}

await mkdir(OUT, {recursive: true});
const manifestPath = path.join(OUT, 'covers.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{}'));
const exists = f => access(f).then(() => true, () => false);

for (const [artist, title] of RECORDS) {
  const s = slug(artist, title);
  if (token && (force || !manifest[s]?.spotify)) {
    const id = await spotifyAlbum(artist, title).catch(() => null);
    if (id) manifest[s] = {...manifest[s], spotify: id};
    console.log(id ? 'spotify' : 'no spotify', s);
  }
  if (force || manifest[s]?.frontSource !== 'apple') {
    const url = await appleFront(artist, title).catch(() => null);
    if (url) {
      const front = `${s}-front.jpg`;
      await save(url, path.join(OUT, front));
      manifest[s] = {...manifest[s], front, frontSource: 'apple'};
    }
    console.log(url ? 'apple front' : 'no apple front', s);
  }
  if (!force && manifest[s]?.front && (manifest[s].back || manifest[s].release) && await exists(path.join(OUT, manifest[s].front))) { console.log('have covers', s); continue; }
  try {
    const c = await findCovers(artist, title);
    if (!c) { console.log('none', s); continue; }
    const entry = {...manifest[s], release: c.release};
    if (entry.frontSource !== 'apple') { entry.front = `${s}-front.jpg`; await save(c.front, path.join(OUT, entry.front)); }
    if (c.back) { entry.back = `${s}-back.jpg`; await save(c.back, path.join(OUT, entry.back)); }
    manifest[s] = entry;
    console.log(c.back ? 'front+back' : 'front', s);
  } catch (e) { console.log('error', s, e.message); }
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('wrote', path.relative(process.cwd(), manifestPath));
