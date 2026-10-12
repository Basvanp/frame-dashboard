// Art of the day, drawn from packs.
//
// - "impressionists": the original 44 works, images shipped in public/art/.
//   Always available, and the fallback if a remote image ever fails.
// - art/packs/*.json: curated sets from museum open-access APIs (built by
//   scripts/build-packs.mjs). Their images are served through the
//   dashboard's own image optimizer, so a screen never talks to a museum CDN.
//
// Which packs are on is a setting (see lib/settings.js). The same day always
// gets the same painting for a given set of packs.

import { readdirSync, readFileSync } from 'node:fs';

const BUILTIN = {
  id: 'impressionists',
  name: 'Impressionists',
  description: 'Monet, Van Gogh, Sisley, Cézanne and friends, plus Hokusai and Hiroshige.',
  local: true,
  works: JSON.parse(readFileSync(new URL('./art.json', import.meta.url), 'utf8')),
};

function loadPacks() {
  const dir = new URL('../art/packs/', import.meta.url);
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch {
    // No remote packs in this checkout.
  }
  return [BUILTIN, ...files.map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')))];
}

const PACKS = loadPacks();

export function listPacks() {
  return PACKS.map((p) => ({ id: p.id, name: p.name, description: p.description, count: p.works.length }));
}

export const ALL_PACK_IDS = PACKS.map((p) => p.id);

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function dayNumber(ymd) {
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86400000);
}

// On Vercel, remote images go through /_vercel/image (allowed hosts are in
// vercel.json): resized to full HD, cached, served from our own domain.
function imageUrl(w) {
  if (!w.remote) return w.image;
  if (!process.env.VERCEL) return w.remote;
  return `_vercel/image?url=${encodeURIComponent(w.remote)}&w=1920&q=75`;
}

function shape(w) {
  return {
    title: w.title,
    artist: w.artist,
    date: w.date,
    medium: w.medium,
    collection: w.collection,
    kind: w.kind, // canvas → gilt frame; paper → black frame with a mat
    ratio: w.ratio,
    image: imageUrl(w),
    source: w.source,
    fact: w.fact || null,
    factSource: w.factSource || null,
  };
}

const orderCache = new Map();
function rotation(enabled) {
  const key = enabled.join(',');
  if (!orderCache.has(key)) {
    const works = PACKS.filter((p) => enabled.includes(p.id)).flatMap((p) => p.works);
    // A fixed shuffle so consecutive days rarely land on the same artist.
    orderCache.set(key, works.slice().sort((a, b) => hash(a.slug) - hash(b.slug)));
  }
  return orderCache.get(key);
}

export function artFor(ymd, enabled = ALL_PACK_IDS) {
  const on = enabled.filter((id) => ALL_PACK_IDS.includes(id));
  const order = rotation(on.length ? on : ['impressionists']);
  const n = dayNumber(ymd);
  const art = shape(order[n % order.length]);
  // A local painting to hang instead if the remote image fails to load.
  if (art.image.indexOf('art/') !== 0) {
    const local = rotation(['impressionists']);
    art.fallback = shape(local[n % local.length]);
  }
  return art;
}
