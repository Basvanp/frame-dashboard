// Dashboard-wide settings, edited from Frame Desk, Daybook or an agent:
// which art packs are in the rotation, and the screen's design.

import { ALL_PACK_IDS } from './art.js';
import { getSettings as read } from './store.js';

export const LAYOUTS = [
  { id: 'bleed', name: 'Day and night', description: 'The painting fills the screen; bone placard by day, dark glass after sunset.' },
  { id: 'salon', name: 'Salon', description: 'The painting in its frame on the gallery wall, all day.' },
  { id: 'painting', name: 'Painting', description: 'The painting fills the screen, day and night.' },
];
const LAYOUT_IDS = LAYOUTS.map((l) => l.id);

const defaultLayout = () => (LAYOUT_IDS.includes(process.env.DASHBOARD_LAYOUT) ? process.env.DASHBOARD_LAYOUT : 'bleed');

export async function getSettings() {
  const s = (await read()) || {};
  const packs = Array.isArray(s.packs) ? s.packs.filter((id) => ALL_PACK_IDS.includes(id)) : ALL_PACK_IDS;
  return {
    packs: packs.length ? packs : ALL_PACK_IDS,
    layout: LAYOUT_IDS.includes(s.layout) ? s.layout : defaultLayout(),
  };
}

// A PUT may carry any of the fields; the others keep their current value, so
// Frame Desk (which only sends packs) never resets the design.
export function normalizeSettings(input, current = { packs: ALL_PACK_IDS, layout: defaultLayout() }) {
  if (!input || typeof input !== 'object') throw new Error('body must be a JSON object');
  if (input.packs === undefined && input.layout === undefined) throw new Error('send packs and/or layout');
  let packs = current.packs;
  if (input.packs !== undefined) {
    if (!Array.isArray(input.packs)) throw new Error('packs must be an array of pack ids');
    const unknown = input.packs.filter((id) => !ALL_PACK_IDS.includes(id));
    if (unknown.length) throw new Error(`unknown packs: ${unknown.join(', ')}`);
    if (!input.packs.length) throw new Error('turn on at least one pack');
    packs = [...new Set(input.packs)];
  }
  let layout = current.layout;
  if (input.layout !== undefined) {
    if (!LAYOUT_IDS.includes(input.layout)) throw new Error(`layout must be one of ${LAYOUT_IDS.join(', ')}`);
    layout = input.layout;
  }
  return { packs, layout, updatedAt: new Date().toISOString() };
}
