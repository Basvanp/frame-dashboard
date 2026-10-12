// Art of the day. The works in art.json are public domain; their images ship
// in public/art/ (see scripts/fetch-art.mjs and art/catalog.json).

import { readFileSync } from 'node:fs';

const works = JSON.parse(readFileSync(new URL('./art.json', import.meta.url), 'utf8'));

// A fixed shuffle so consecutive days don't land on the same artist.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const order = works.slice().sort((a, b) => hash(a.slug) - hash(b.slug));

function dayNumber(ymd) {
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86400000);
}

export function artFor(ymd) {
  const w = order[dayNumber(ymd) % order.length];
  return {
    title: w.title,
    artist: w.artist,
    date: w.date,
    medium: w.medium,
    collection: w.collection,
    kind: w.kind, // canvas → gilt frame; paper → black frame with a mat
    ratio: w.ratio,
    image: w.image,
    source: w.source,
  };
}
