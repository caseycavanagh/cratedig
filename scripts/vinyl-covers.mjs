// Fetches everything the records experiment shows for each record in RECORDS
// (public/directions/vinyl-prototype.html, the one list of Casey's records)
// and writes it to public/directions/vinyl/covers.json for the prototype:
// - year (first release), label and format (first vinyl pressing) from MusicBrainz
// - the front cover from Apple Music's artwork (clean, label-supplied), or the
//   Cover Art Archive when Apple doesn't have the album; the back from the
//   Cover Art Archive. Saved as 1200px WebP with sharp, plus the color of the
//   cover's left edge for the record's spine
// - the Spotify album ID for the embed player (SPOTIFY_CLIENT_ID and
//   SPOTIFY_CLIENT_SECRET from .env.local), and Apple Music and Deezer links
//   by the album's UPC (from Spotify), no key needed
// Records already fetched are skipped. A record whose release group is ambiguous
// can name it in RECORDS with mb:'<MusicBrainz release group ID>'.
// Run on a Mac: node scripts/vinyl-covers.mjs
//   --force   refetch everything
//   --prune   drop entries and images for records no longer in RECORDS
//   --only <a,b>    just the records whose slug contains one of these
//   --facts   only refresh year, label and format for records already fetched
import {mkdir, writeFile, readFile, access, unlink, readdir} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const OUT = path.resolve('public/directions/vinyl');
const PAGE = path.resolve('public/directions/vinyl-prototype.html');
const UA = 'caseycavanagh.com-records/1.0 (https://caseycavanagh.com)';
const args = process.argv.slice(2);
const force = args.includes('--force'), prune = args.includes('--prune');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null, factsOnly = args.includes('--facts');

const slug = (a, t) => (a + ' ' + t).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = s => s.replace(/[’]/g, "'").replace(/[‘“”]/g, '').replace(/["\\]/g, '');
const norm = x => x.toLowerCase().replace(/[’']/g, '').replace(/&/g, 'and').replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/^the /, '').trim();
const various = a => /^various/i.test(a);

// RECORDS lives in the prototype: read the lines between `const RECORDS=[` and `].map(`
const page = await readFile(PAGE, 'utf8');
const body = page.slice(page.indexOf('const RECORDS=[') + 'const RECORDS=['.length, page.indexOf('].map(r=>', page.indexOf('const RECORDS=[')));
const RECORDS = new Function(`return [${body}]`)().map(r => ({...r, slug: slug(r.artist, r.title)}));

async function get(url, json = true) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(url, {headers: {'User-Agent': UA, Accept: json ? 'application/json' : '*/*'}, redirect: 'follow'});
    if (r.status === 503 || r.status === 429 || r.status === 403 && /itunes/.test(url)) { await sleep(3000 * (i + 1)); continue; }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return json ? r.json() : Buffer.from(await r.arrayBuffer());
  }
  throw new Error(`gave up on ${url}`);
}
// MusicBrainz asks for at most one request a second; the iTunes Search API allows about 20 a minute
const paced = gap => { let last = 0; return async url => { const w = last + gap - Date.now(); if (w > 0) await sleep(w); last = Date.now(); return get(url); }; };
const mbGet = paced(1100), itunes = paced(3100);
const mb = p => mbGet('https://musicbrainz.org/ws/2/' + p + (p.includes('?') ? '&' : '?') + 'fmt=json');

// the release group: an exact title match by this artist, albums before EPs, never singles
async function findGroup(r) {
  if (r.mb) return mb(`release-group/${r.mb}`);
  const by = various(r.artist) ? 'Various Artists' : r.artist;
  // an exact title by exactly this artist ranks first; a title or credit that only contains the other (John Prine vs John Prine and Friends) after
  const pick = list => {
    const t = norm(r.title), a = norm(by), near = (x, y) => x && y && (x.includes(y) || y.includes(x));
    const score = g => {
      const gt = norm(g.title), names = (g['artist-credit'] || []).flatMap(c => [norm(c.name || ''), norm(c.artist?.name || '')]);
      const ts = gt === t ? 0 : near(gt, t) ? 4 : null, as = names.includes(a) || norm(g['artist-credit']?.map(c => c.name + (c.joinphrase || '')).join('') || '') === a ? 0 : names.some(n => near(n, a)) ? 2 : null;
      if (ts === null || as === null || g['primary-type'] === 'Single') return null;
      return ts + as + (g['primary-type'] === 'Album' ? 0 : g['primary-type'] === 'EP' ? 1 : 2) + (g['secondary-types']?.length ? .5 : 0);
    };
    return (list || []).map(g => [score(g), g]).filter(x => x[0] !== null)
      .sort((x, y) => x[0] - y[0] || (x[1]['first-release-date'] || '9999').localeCompare(y[1]['first-release-date'] || '9999'))[0]?.[1] || null;
  };
  const s1 = await mb(`release-group/?query=${encodeURIComponent(`releasegroup:"${q(r.title)}" AND artist:"${q(by)}"`)}&limit=15`);
  return pick(s1?.['release-groups']) || pick((await mb(`release-group/?query=${encodeURIComponent(`releasegroup:"${q(r.title)}"`)}&limit=25`))?.['release-groups']) || null;
}
// what MusicBrainz has by this artist, to name the right one with mb:'…' when nothing matched
async function suggest(r) {
  const s = await mb(`release-group/?query=${encodeURIComponent(`artist:"${q(r.artist)}"`)}&limit=40`);
  return (s?.['release-groups'] || []).map(g => `    ${g.id}  ${g['first-release-date']?.slice(0, 4) || '----'}  ${g['primary-type'] || ''}  ${g.title}`).join('\n');
}

// facts and covers from the group's releases: year from the first release, label from the earliest
// one that names one, format from the first vinyl pressing; covers from a vinyl release with a front and a back
const isVinyl = m => /vinyl/i.test(m.format || '');
function format(rel, group) {
  const v = (rel?.media || []).filter(isVinyl);
  if (!v.length) return null;
  const size = /7"/.test(v[0].format) ? '7″' : /10"/.test(v[0].format) ? '10″' : group['primary-type'] === 'EP' ? 'EP' : 'LP';
  return v.length > 1 ? `${v.length}×${size}` : size;
}
async function fromReleases(group, withCovers = true) {
  const rel = await mb(`release?release-group=${group.id}&inc=labels+media&limit=100`);
  const byDate = (rel?.releases || []).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  // the label on the first American release (where Casey buys records), else the first worldwide one, else the first anywhere
  const labelOf = x => (x['label-info'] || []).find(l => l.label && !/no label/i.test(l.label.name))?.label.name;
  const labelled = ['US', 'XW', null].map(c => byDate.find(x => (!c || x.country === c) && labelOf(x))).find(Boolean);
  const firstVinyl = byDate.find(x => (x.media || []).some(isVinyl));
  const facts = {
    year: +(group['first-release-date'] || byDate[0]?.date || '').slice(0, 4) || null,
    label: labelled ? labelOf(labelled) : null,
    format: format(firstVinyl, group),
  };
  const ordered = [...byDate].sort((a, b) => ((b.media || []).some(isVinyl) ? 1 : 0) - ((a.media || []).some(isVinyl) ? 1 : 0));
  let covers = null;
  for (const x of withCovers ? ordered.slice(0, 25) : []) {
    const caa = await get(`https://coverartarchive.org/release/${x.id}`).catch(() => null);
    if (!caa) continue;
    const front = caa.images.find(i => i.front || i.types.includes('Front'));
    const back = caa.images.find(i => i.back || i.types.includes('Back'));
    if (front && back) { covers = {release: x.id, front, back}; break; }
    if (front && !covers) covers = {release: x.id, front};
  }
  return {facts, covers};
}

// 1200px WebP, and the average color of the cover's left edge for its spine
const hex = n => Math.round(n).toString(16).padStart(2, '0');
async function save(img, file, spine) {
  const url = typeof img === 'string' ? img : img.thumbnails?.['1200'] || img.thumbnails?.large || img.image;
  const buf = await get(url, false);
  await sharp(buf).rotate().resize(1200, 1200, {fit: 'inside', withoutEnlargement: true}).webp({quality: 78, effort: 5}).toFile(file);
  if (!spine) return null;
  const m = await sharp(buf).metadata();
  const {channels} = await sharp(buf).extract({left: 0, top: 0, width: Math.max(1, Math.round(m.width * .03)), height: m.height}).stats();
  return '#' + channels.slice(0, 3).map(c => hex(c.mean)).join('');
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
const spot = p => fetch('https://api.spotify.com/v1/' + p, {headers: {Authorization: 'Bearer ' + token}}).then(r => r.ok ? r.json() : null);
async function spotifyAlbum(artist, title) {
  const a = norm(artist), t = norm(title);
  const find = items => (items || []).find(i => (various(artist) || i.artists.some(x => norm(x.name) === a)) && norm(i.name) === t)
    || (items || []).find(i => (various(artist) || i.artists.some(x => norm(x.name) === a)) && norm(i.name).startsWith(t))
    || (items || []).find(i => (various(artist) || i.artists.some(x => norm(x.name) === a)) && norm(i.name).includes(t)); // Joni Mitchell at Newport
  const hit = find((await spot('search?type=album&limit=10&market=US&q=' + encodeURIComponent(various(artist) ? `album:${q(title)}` : `album:${q(title)} artist:${q(artist)}`)))?.albums?.items)
    || find((await spot('search?type=album&limit=20&market=US&q=' + encodeURIComponent(`${q(artist)} ${q(title)}`)))?.albums?.items);
  return hit?.id || null;
}
// a UPC can be written with or without its leading zero
const upcs = u => u ? [...new Set([u, u.length === 12 ? '0' + u : u.replace(/^0(?=\d{12}$)/, '')])] : [];

// Apple Music: by UPC first, then by name
async function appleAlbum(artist, title, upc) {
  for (const u of upcs(upc)) {
    const hit = (await itunes('https://itunes.apple.com/lookup?entity=album&country=us&upc=' + u))?.results?.find(i => i.wrapperType === 'collection');
    if (hit) return hit;
  }
  const r = await itunes('https://itunes.apple.com/search?entity=album&limit=15&country=us&term=' + encodeURIComponent(various(artist) ? q(title) : `${q(artist)} ${q(title)}`));
  const a = norm(artist), t = norm(title), by = i => various(artist) || norm(i.artistName) === a;
  return (r?.results || []).find(i => by(i) && norm(i.collectionName) === t)
    || (r?.results || []).find(i => by(i) && norm(i.collectionName).startsWith(t))
    || (r?.results || []).find(i => by(i) && norm(i.collectionName).includes(t)) || null;
}
// artwork URLs take any size up to the master
const appleArt = hit => hit?.artworkUrl100?.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/1500x1500bb.jpg') || null;

// Deezer: no key; by UPC first, then by name (errors come back as 200s with an error object)
async function deezerLink(artist, title, upc) {
  for (const u of upcs(upc)) { const a = await get('https://api.deezer.com/album/upc:' + u); if (a?.link) return a.link; }
  const r = await get('https://api.deezer.com/search/album?q=' + encodeURIComponent(various(artist) ? `album:"${q(title)}"` : `artist:"${q(artist)}" album:"${q(title)}"`));
  const a = norm(artist), t = norm(title);
  return (r?.data || []).find(i => (various(artist) || norm(i.artist?.name || '') === a) && norm(i.title).includes(t))?.link || null;
}

await mkdir(OUT, {recursive: true});
const manifestPath = path.join(OUT, 'covers.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{}'));
const exists = f => access(f).then(() => true, () => false);
const missing = [];

for (const r of RECORDS) {
  const s = r.slug;
  if (only && !only.some(o => s.includes(o))) continue;
  const e = force ? {} : {...manifest[s]};
  if (factsOnly) {
    if (!e.group) continue;
    const group = await mb(`release-group/${e.group}`);
    if (group) { Object.assign(e, (await fromReleases(group, false)).facts); for (const k of Object.keys(e)) if (e[k] == null) delete e[k]; manifest[s] = e; }
    console.log(e.year || '----', e.label || '-', e.format || '-', s);
    continue;
  }
  const done = e.group && e.front?.endsWith('.webp') && await exists(path.join(OUT, e.front));
  if (done) { console.log('have', s); continue; }
  try {
    // MusicBrainz: facts, the Cover Art Archive release, and the back
    const group = await findGroup(r);
    let covers = null;
    if (group) {
      const got = await fromReleases(group);
      Object.assign(e, got.facts, {group: group.id});
      covers = got.covers;
      if (covers) e.release = covers.release;
    } else missing.push(r);
    // Spotify, then Apple Music and Deezer by the album's UPC
    if (token && !e.spotify) e.spotify = await spotifyAlbum(r.artist, r.title).catch(() => null) || undefined;
    const upc = token && e.spotify ? (await spot(`albums/${e.spotify}?market=US`))?.external_ids?.upc : null;
    const apple = await appleAlbum(r.artist, r.title, upc).catch(() => null);
    const links = {};
    if (apple?.collectionViewUrl) links.appleMusic = apple.collectionViewUrl.split('?')[0];
    const dz = await deezerLink(r.artist, r.title, upc).catch(() => null);
    if (dz) links.deezer = dz;
    e.links = links;
    if (!e.year && apple?.releaseDate) e.year = +apple.releaseDate.slice(0, 4);
    // covers: Apple's front when it has the album, the Cover Art Archive's otherwise; the back only from the archive
    const frontSrc = appleArt(apple) || covers?.front;
    if (frontSrc) { e.front = `${s}-front.webp`; e.frontSource = appleArt(apple) ? 'apple' : 'caa'; e.spine = await save(frontSrc, path.join(OUT, e.front), true); }
    if (covers?.back) { e.back = `${s}-back.webp`; await save(covers.back, path.join(OUT, e.back)); } else delete e.back;
    for (const k of Object.keys(e)) if (e[k] == null) delete e[k];
    manifest[s] = e;
    console.log([group ? 'mb' : 'NO MB', e.year || '----', e.label || '-', e.format || '-', e.spotify ? 'spotify' : 'NO SPOTIFY',
      Object.keys(links).join('+') || 'no links', e.front ? 'front:' + e.frontSource : 'NO FRONT', e.back ? 'back' : 'no back', s].join('  '));
  } catch (err) { console.log('error', s, err.message); }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n'); // as it goes, so a stopped run keeps what it got
}

if (prune) {
  const keep = new Set(RECORDS.map(r => r.slug));
  for (const s of Object.keys(manifest)) if (!keep.has(s)) { delete manifest[s]; console.log('pruned', s); }
  const used = new Set(Object.values(manifest).flatMap(e => [e.front, e.back]).filter(Boolean));
  for (const f of await readdir(OUT)) if (/\.(jpe?g|webp)$/.test(f) && !used.has(f)) { await unlink(path.join(OUT, f)); console.log('removed', f); }
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
for (const r of missing) console.log(`\nnot on MusicBrainz as written: ${r.artist}, ${r.title}\n${await suggest(r)}`);
console.log('wrote', path.relative(process.cwd(), manifestPath));
