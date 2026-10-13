import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUTS, normalizeSettings } from '../lib/settings.js';

const current = { packs: ['impressionists'], layout: 'bleed' };

test('a layout change keeps the packs', () => {
  const s = normalizeSettings({ layout: 'salon' }, current);
  assert.equal(s.layout, 'salon');
  assert.deepEqual(s.packs, ['impressionists']);
});

test('a packs change (Frame Desk) keeps the layout', () => {
  const s = normalizeSettings({ packs: ['impressionists'] }, { ...current, layout: 'painting' });
  assert.equal(s.layout, 'painting');
});

test('rejects unknown layouts and empty bodies', () => {
  assert.throws(() => normalizeSettings({ layout: 'disco' }, current), /layout must be one of/);
  assert.throws(() => normalizeSettings({}, current), /packs and\/or layout/);
});

test('every layout has a name and a description', () => {
  for (const l of LAYOUTS) assert.ok(l.id && l.name && l.description);
});
