// Dashboard-wide settings, edited from Frame Desk. Today: which art packs
// are in the rotation.

import { ALL_PACK_IDS } from './art.js';
import { getSettings as read } from './store.js';

export async function getSettings() {
  const s = (await read()) || {};
  const packs = Array.isArray(s.packs) ? s.packs.filter((id) => ALL_PACK_IDS.includes(id)) : ALL_PACK_IDS;
  return { packs: packs.length ? packs : ALL_PACK_IDS };
}

export function normalizeSettings(input) {
  if (!input || typeof input !== 'object') throw new Error('body must be a JSON object');
  if (!Array.isArray(input.packs)) throw new Error('packs must be an array of pack ids');
  const unknown = input.packs.filter((id) => !ALL_PACK_IDS.includes(id));
  if (unknown.length) throw new Error(`unknown packs: ${unknown.join(', ')}`);
  if (!input.packs.length) throw new Error('turn on at least one pack');
  return { packs: [...new Set(input.packs)], updatedAt: new Date().toISOString() };
}
