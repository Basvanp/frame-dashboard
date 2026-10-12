// Maintainer tool: builds the remote art packs in art/packs/ from museum
// open-access APIs. Run it, then READ the titles it prints before committing —
// automatic queries pull in sketches, fragments and near-duplicates.
//
//   node scripts/build-packs.mjs [pack-id ...]
//
// Museum APIs are only ever called here, at build time. The screen loads the
// images through the dashboard's own image optimizer (see vercel.json).

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const UA = { 'user-agent': 'frame-dashboard/0.1 (https://github.com/joseamijares/frame-dashboard)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url) {
  for (let i = 0; i < 5; i++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res.json();
    await sleep(4000 * (i + 1));
  }
  throw new Error(`gave up on ${url}`);
}

const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// Museum titles carry catalogue noise the wall label doesn't need.
const cleanTitle = (t) =>
  t
    .replace(/\s*\((from the series|number|station)[^)]*\)/gi, '')
    .replace(/^Thirty-Six Views of Mt\. Fuji:\s*/i, '')
    .replace(/,? from (the )?(series )?.*$/i, '')
    .replace(/[,\s]+$/, '')
    .trim();

const isPaper = (medium) => /print|woodcut|watercolor|ink|paper|drawing/i.test(medium || '');

// ── Cleveland Museum of Art (CC0, no key). Facts: the curators' "Did you know". ──

async function cleveland({ query, filter = () => true, max }) {
  const url = new URL('https://openaccess-api.clevelandart.org/api/artworks/');
  Object.entries({ cc0: '1', has_image: '1', limit: '200', ...query }).forEach(([k, v]) => url.searchParams.set(k, v));
  const { data } = await json(url);
  const works = [];
  for (const d of data) {
    const img = d.images && d.images.print;
    if (!img) continue;
    const ratio = Number((Number(img.width) / Number(img.height)).toFixed(3));
    const artist = (d.creators && d.creators[0] && d.creators[0].description || 'Unknown').replace(/\s*\(.*$/, '');
    const w = {
      slug: `cma-${slugify(`${artist.split(' ').slice(-1)[0]}-${d.title}`)}`,
      artist,
      title: cleanTitle(d.title),
      series: (d.title.match(/from (?:the )?(?:series )?(.+)$/i) || [])[1] || null,
      date: d.creation_date,
      medium: d.technique ? d.technique[0].toUpperCase() + d.technique.slice(1) : null,
      kind: isPaper(d.technique) ? 'paper' : 'canvas',
      collection: 'Cleveland Museum of Art',
      ratio,
      remote: img.url,
      source: d.url,
      fact: d.did_you_know || null,
      factSource: d.did_you_know ? d.url : null,
      _type: d.type,
      _department: d.department,
    };
    if (filter(w, d)) works.push(w);
    if (works.length >= max) break;
  }
  return works;
}

// ── The Met (CC0). Search is rate-limited hard, so: one search, slow object reads. ──

async function imageRatio(url) {
  const dir = path.join(tmpdir(), 'fd-packs');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'probe.jpg');
  const res = await fetch(url, { headers: UA });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  const out = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' }).stdout;
  rmSync(file, { force: true });
  const w = Number((out.match(/pixelWidth: (\d+)/) || [])[1]);
  const h = Number((out.match(/pixelHeight: (\d+)/) || [])[1]);
  return w && h ? Number((w / h).toFixed(3)) : null;
}

async function met({ ids, filter = () => true, max }) {
  const works = [];
  for (const id of ids) {
    const o = await json(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
    await sleep(1100);
    if (!o.isPublicDomain || !o.primaryImage) continue;
    const ratio = await imageRatio(o.primaryImageSmall);
    if (!ratio) continue;
    const w = {
      slug: `met-${slugify(`${(o.artistDisplayName || 'unknown').split(' ').slice(-1)[0]}-${o.title}`)}`,
      artist: o.artistDisplayName || 'Unknown',
      title: cleanTitle(o.title),
      date: o.objectDate,
      medium: o.medium ? o.medium.split(/[;,]/)[0] : null,
      kind: isPaper(o.medium) ? 'paper' : 'canvas',
      collection: 'The Metropolitan Museum of Art',
      ratio,
      remote: o.primaryImage,
      source: o.objectURL,
      fact: null,
      factSource: null,
      _classification: o.classification,
    };
    if (filter(w, o)) works.push(w);
    if (works.length >= max) break;
  }
  return works;
}

async function metSearch(params) {
  const url = new URL('https://collectionapi.metmuseum.org/public/collection/v1.1/search');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await json(url);
  return r.objectIDs || [];
}

// ── The packs ──

const landscapeish = (w) => w.ratio >= 1.15 && w.ratio <= 2.2;

const PACKS = {
  'japanese-prints': {
    name: 'Japanese prints',
    description: 'Hiroshige and Hokusai woodblock landscapes, Cleveland Museum of Art.',
    build: async () => [
      ...(await cleveland({
        query: { q: 'Hiroshige', type: 'Print', department: 'Japanese Art' },
        filter: (w, d) => landscapeish(w) && /Hiroshige/.test(w.artist) && !/19[0-9]{2}/.test(d.creation_date),
        max: 24,
      })),
      ...(await cleveland({
        query: { q: 'Hokusai', type: 'Print', department: 'Japanese Art' },
        filter: (w, d) => landscapeish(w) && /Hokusai/.test(w.artist) && !/^Poem by/i.test(d.title),
        max: 16,
      })),
    ],
  },
  'cleveland-highlights': {
    name: 'Cleveland highlights',
    description: 'Landscape-format paintings from the Cleveland Museum of Art’s highlights.',
    build: async () => {
      // Reviewed by eye: no violence, nudes or devotional scenes on a living-room wall.
      const avoid = /Christ|Madonna|Saint|Virgin|Crucifix|nude|Martyr|Holy|Death|Stag at|Danaë|Psyche|Venus|Bath|Battle|Judith|Massacre/i;
      const ok = (w, d) => landscapeish(w) && !avoid.test(d.title) && !/Unknown/.test(w.artist);
      return [
        ...(await cleveland({ query: { type: 'Painting', highlight: '1' }, filter: ok, max: 25 })),
        ...(await cleveland({
          query: { type: 'Painting', q: 'landscape' },
          filter: (w, d) => ok(w, d) && /Painting and Sculpture/.test(d.department || ''),
          max: 25,
        })),
      ];
    },
  },
  'met-landscapes': {
    name: 'The Met: landscapes',
    description: 'European and American landscapes from The Metropolitan Museum of Art.',
    build: async () => {
      const ids = [
        ...(await metSearch({ q: 'landscape', departmentId: '11', hasImages: 'true', limit: '60' })),
        ...(await metSearch({ q: 'landscape', departmentId: '1', hasImages: 'true', limit: '30' })),
      ];
      return met({
        ids: [...new Set(ids)],
        filter: (w, o) => landscapeish(w) && o.classification === 'Paintings' && !/Study|Sketch|Bacchante|Nymph|Venus/i.test(o.title),
        max: 40,
      });
    },
  },
};

// Facts for works the museum didn't annotate, each from a Wikipedia article
// (artist or print series) kept as its source. Written by hand from the
// article text; rebuilding a pack keeps them.
const extraFacts = JSON.parse(readFileSync('art/pack-facts.json', 'utf8'));

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PACKS);
mkdirSync('art/packs', { recursive: true });
for (const id of wanted) {
  const pack = PACKS[id];
  if (!pack) throw new Error(`unknown pack ${id}`);
  const seen = new Set();
  const works = (await pack.build())
    .filter((w) => !seen.has(w.slug) && seen.add(w.slug))
    .map(({ _type, _department, _classification, ...w }) => w)
    .map((w) => (w.fact || !extraFacts[w.slug] ? w : { ...w, fact: extraFacts[w.slug].fact, factSource: extraFacts[w.slug].source }));
  writeFileSync(
    `art/packs/${id}.json`,
    `${JSON.stringify({ id, name: pack.name, description: pack.description, license: 'CC0', works }, null, 1)}\n`
  );
  console.log(`\n== ${id}: ${works.length} works`);
  for (const w of works) console.log(`${w.ratio.toFixed(2)} | ${w.artist} | ${w.title}${w.series ? ` [${w.series.slice(0, 30)}]` : ''} | ${w.date}${w.fact ? ' | ✓fact' : ''}`);
}
