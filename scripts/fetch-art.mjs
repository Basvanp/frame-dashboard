// Maintainer tool: downloads every work in art/catalog.json from Wikimedia
// Commons into public/art/, and writes lib/art.json for the server.
//   node scripts/fetch-art.mjs
//
// The images ship with the app on purpose. Museum image servers sit behind
// bot protection that a TV can't pass, so the screen never hotlinks them.
// Everything listed is public domain; Commons serves 1280px thumbnails, which
// is plenty for a frame on a 1080p page.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const UA = { 'user-agent': 'frame-dashboard (open-source TV dashboard)' };
const WIDTH = 1920; // one of Commons' standard thumbnail steps; the day view fills the screen
const catalog = JSON.parse(readFileSync('art/catalog.json', 'utf8'));
// One sentence per work, each taken from the Wikipedia article in `source`
// (CC BY-SA; the screen credits Wikipedia). Written by hand from the article
// text, never invented: a work with nothing new to say has no entry.
const facts = existsSync('art/facts.json') ? JSON.parse(readFileSync('art/facts.json', 'utf8')) : {};
mkdirSync('public/art', { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Commons answers 429 when asked too quickly. Back off and try again.
async function retry(request, attempts = 5) {
  for (let i = 0; ; i++) {
    const res = await request();
    if (res.ok || i === attempts - 1) return res;
    await sleep(5000 * 2 ** i);
  }
}

// One API call for the whole catalog (Commons takes up to 50 titles at once).
async function infoForAll(files) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({
    action: 'query', titles: files.join('|'), prop: 'imageinfo', iiprop: 'url|size',
    iiurlwidth: String(WIDTH), format: 'json', formatversion: '2',
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await retry(() => fetch(url, { headers: UA }));
  const body = await res.json();
  // Commons normalises titles (underscores, encoding); map back to what we asked for.
  const alias = new Map((body.query.normalized || []).map((n) => [n.to, n.from]));
  const byFile = new Map();
  for (const page of body.query.pages) {
    if (page.imageinfo) byFile.set(alias.get(page.title) || page.title, page.imageinfo[0]);
  }
  return byFile;
}

const infos = await infoForAll(catalog.map((w) => w.commons));
const out = [];
for (const w of catalog) {
  const meta = infos.get(w.commons);
  if (!meta) throw new Error(`not found on Commons: ${w.commons}`);
  const path = `public/art/${w.slug}.jpg`;
  if (!existsSync(path)) {
    const img = await retry(() => fetch(meta.thumburl, { headers: UA }));
    if (!img.ok || !/image\/jpeg/.test(img.headers.get('content-type'))) {
      throw new Error(`${w.slug}: ${img.status} ${img.headers.get('content-type')}`);
    }
    writeFileSync(path, Buffer.from(await img.arrayBuffer()));
    // Full screen on a 1080p page is all we need; keep files small.
    const shrink = spawnSync('magick', ['mogrify', '-strip', '-resize', '1920x1440>', '-quality', '72', '-sampling-factor', '4:2:0', '-interlace', 'JPEG', path]);
    if (shrink.error) console.warn('ImageMagick not found; kept the original');
    console.log('fetched', w.slug);
    await sleep(1500);
  }
  out.push({
    slug: w.slug,
    artist: w.artist,
    title: w.title,
    date: w.date,
    medium: w.medium,
    kind: w.kind,
    collection: w.collection,
    ratio: Number((meta.width / meta.height).toFixed(3)),
    image: `art/${w.slug}.jpg`,
    source: meta.descriptionurl,
    fact: facts[w.slug]?.fact || null,
    factSource: facts[w.slug]?.source || null,
  });
}

writeFileSync('lib/art.json', `${JSON.stringify(out, null, 1)}\n`);
console.log(`lib/art.json: ${out.length} works`);
