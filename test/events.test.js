import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeEvents, normalizeEvents } from '../lib/events.js';

const TZ = 'America/Monterrey';

test('timed events are bucketed by the dashboard zone, not the sender', () => {
  const doc = normalizeEvents(
    {
      weekOf: '2026-10-12',
      events: [{ title: 'Late call', start: '2026-10-14T04:30:00Z', end: '2026-10-14T05:00:00Z' }],
    },
    TZ
  );
  assert.equal(doc.events[0].date, '2026-10-13'); // 22:30 the night before
});

test('events outside the week are dropped, bad ones rejected', () => {
  const doc = normalizeEvents(
    {
      weekOf: '2026-10-12',
      events: [
        { title: 'Next week', allDay: true, date: '2026-10-20' },
        { title: 'Trip', allDay: true, date: '2026-10-17' },
      ],
    },
    TZ
  );
  assert.deepEqual(doc.events.map((e) => e.title), ['Trip']);
  assert.throws(() => normalizeEvents({ weekOf: '2026-10-13', events: [] }, TZ), /Monday/);
  assert.throws(() => normalizeEvents({ weekOf: '2026-10-12', events: [{ start: 'x' }] }, TZ), /title/);
});

test('the same meeting from iCal and from the Mac shows once', () => {
  const a = [{ title: 'Standup', allDay: false, date: '2026-10-12', start: '2026-10-12T15:30:00.000Z' }];
  const b = [
    { title: 'standup', allDay: false, date: '2026-10-12', start: '2026-10-12T15:30:00.000Z' },
    { title: 'Dentist', allDay: false, date: '2026-10-12', start: '2026-10-12T20:00:00.000Z' },
  ];
  assert.deepEqual(mergeEvents(a, b).map((e) => e.title), ['Standup', 'Dentist']);
});

import { artFor, listPacks } from '../lib/art.js';
import { normalizeSettings } from '../lib/settings.js';

test('art packs: every day gets a painting, remote ones carry a local fallback', () => {
  const ids = listPacks().map((p) => p.id);
  assert.ok(ids.includes('impressionists'));
  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.UTC(2026, 9, 12 + i)).toISOString().slice(0, 10);
    const a = artFor(d, ids);
    assert.ok(a.image && a.title && a.ratio > 0);
    if (!a.image.startsWith('art/')) assert.ok(a.fallback && a.fallback.image.startsWith('art/'));
  }
});

test('settings reject unknown or empty pack lists', () => {
  assert.throws(() => normalizeSettings({ packs: [] }), /at least one/);
  assert.throws(() => normalizeSettings({ packs: ['nope'] }), /unknown/);
  assert.deepEqual(normalizeSettings({ packs: ['impressionists', 'impressionists'] }).packs, ['impressionists']);
});
