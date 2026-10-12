// Calendar events pushed from a device (the Mac app reads the Mac's Calendar
// and sends the week here). An alternative to the iCal feed that needs no
// secret URL; both sources are merged when the week is built.

import { isYmd, mondayOf, weekDays, ymdInTz } from './time.js';

const MAX_EVENTS = 300;
const MAX_TEXT = 200;

function text(value, field, required) {
  if (value == null || value === '') {
    if (required) throw new Error(`${field} is required`);
    return null;
  }
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  return value.trim().slice(0, MAX_TEXT) || null;
}

function iso(value, field) {
  const t = Date.parse(value);
  if (typeof value !== 'string' || Number.isNaN(t)) throw new Error(`${field} must be an ISO date-time`);
  return new Date(t).toISOString();
}

export function normalizeEvents(input, tz) {
  if (!input || typeof input !== 'object') throw new Error('body must be a JSON object');
  if (!isYmd(input.weekOf) || mondayOf(input.weekOf) !== input.weekOf) {
    throw new Error('weekOf must be a Monday (YYYY-MM-DD)');
  }
  if (!Array.isArray(input.events)) throw new Error('events must be an array');
  if (input.events.length > MAX_EVENTS) throw new Error(`more than ${MAX_EVENTS} events`);

  const week = new Set(weekDays(input.weekOf));
  const events = [];
  input.events.forEach((e, i) => {
    const f = `events[${i}]`;
    const title = text(e.title, `${f}.title`, true);
    const location = text(e.location, `${f}.location`, false);
    if (e.allDay) {
      if (!isYmd(e.date)) throw new Error(`${f}.date must be YYYY-MM-DD for all-day events`);
      if (week.has(e.date)) events.push({ title, location, allDay: true, date: e.date });
      return;
    }
    const start = iso(e.start, `${f}.start`);
    const end = e.end ? iso(e.end, `${f}.end`) : start;
    // The day is decided by the dashboard's zone, not the sender's.
    const date = ymdInTz(new Date(start), tz);
    if (week.has(date)) events.push({ title, location, allDay: false, date, start, end });
  });

  return {
    weekOf: input.weekOf,
    source: text(input.source, 'source', false),
    events,
    syncedAt: new Date().toISOString(),
  };
}

// The same meeting can arrive from the iCal feed and from the Mac.
export function mergeEvents(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const e of list || []) {
      const key = `${e.title.toLowerCase()}|${e.allDay ? e.date : e.start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
  }
  return out;
}
