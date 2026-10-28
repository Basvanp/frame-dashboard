// Turns one or more iCal feeds into a flat list of occurrences for a week.
// Recurrence (RRULE), exclusions (EXDATE) and moved instances (RECURRENCE-ID)
// are handled by ical-expander.

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import IcalExpander from 'ical-expander';
import { addDays, ymdInTz } from './time.js';

// The same ical.js instance ical-expander uses, so registrations are shared.
const ICAL = createRequire(import.meta.resolve('ical-expander'))('ical.js');

// ical-expander preloads an old copy of the IANA zones — it still has DST for
// Mexico, abolished in 2022, which shifts every meeting by an hour. A feed's own
// VTIMEZONE blocks (Google always sends them) are current, so they win.
function registerFeedTimezones(ics) {
  const root = new ICAL.Component(ICAL.parse(ics));
  for (const vtz of root.getAllSubcomponents('vtimezone')) {
    const tzid = vtz.getFirstPropertyValue('tzid');
    if (tzid) ICAL.TimezoneService.register(tzid, new ICAL.Timezone(vtz));
  }
}

export function icsUrls() {
  return (process.env.ICS_URLS || '')
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter(Boolean);
}

// Short names for the wall, aligned with ICS_URLS. First feed is still the
// household calendar (glass glow). Later feeds get a tag: afval, school, …
export function icsLabels() {
  const n = icsUrls().length;
  const raw = process.env.ICS_LABELS || '';
  const labels = raw.split(',').map((s) => s.trim());
  return Array.from({ length: n }, (_, i) => labels[i] || null);
}

export function icsFeeds() {
  const urls = icsUrls();
  const labels = icsLabels();
  return urls.map((url, i) => ({ url, label: labels[i] }));
}

function calendarName(ics) {
  const line = ics.split(/\r?\n/).find((l) => l.startsWith('X-WR-CALNAME'));
  if (!line) return null;
  const value = line.slice(line.indexOf(':') + 1).trim();
  return value || null;
}

// A busy calendar's feed is megabytes of history; keep each feed for a few
// minutes per warm function instance rather than refetching on every request.
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

async function fetchIcs(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;
  const text = await fetchIcsUncached(url);
  cache.set(url, { at: Date.now(), text });
  return text;
}

async function fetchIcsUncached(url) {
  // Local files are for development and the bundled demo calendar.
  if (url.startsWith('file:')) return readFile(new URL(url, `file://${process.cwd()}/`), 'utf8');
  // Google hands out webcal:// in some places; it is plain https underneath.
  const res = await fetch(url.replace(/^webcal:/, 'https:'), {
    headers: { 'user-agent': 'frame-dashboard' },
  });
  if (!res.ok) throw new Error(`calendar feed returned ${res.status}`);
  return res.text();
}

function ymdOfDateValue(time) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${time.year}-${pad(time.month)}-${pad(time.day)}`;
}

function toOccurrence(item, startDate, endDate, tz, calendarIndex, label) {
  const base = {
    title: item.summary || '(no title)',
    location: item.location || null,
    calendar: calendarIndex,
    label: label || null,
  };

  if (startDate.isDate) {
    // All-day: DTEND is exclusive, so a one-day event ends on the next date.
    const first = ymdOfDateValue(startDate);
    const endExclusive = endDate ? ymdOfDateValue(endDate) : addDays(first, 1);
    const days = [];
    for (let d = first; d < endExclusive; d = addDays(d, 1)) days.push(d);
    return days.map((date) => ({ ...base, allDay: true, date }));
  }

  const start = startDate.toJSDate();
  const end = endDate ? endDate.toJSDate() : start;
  return [
    {
      ...base,
      allDay: false,
      date: ymdInTz(start, tz),
      start: start.toISOString(),
      end: end.toISOString(),
    },
  ];
}

export function expandIcs(ics, days, tz, calendarIndex = 0, label = null) {
  // Pad the window a day each side; occurrences are bucketed by local date below.
  const after = new Date(`${addDays(days[0], -1)}T00:00:00Z`);
  const before = new Date(`${addDays(days[days.length - 1], 2)}T00:00:00Z`);
  registerFeedTimezones(ics);
  const expander = new IcalExpander({ ics, maxIterations: 0 });
  const { events, occurrences } = expander.between(after, before);
  const tag = label || (calendarIndex > 0 ? calendarName(ics) : null);

  const wanted = new Set(days);
  const out = [];

  for (const e of events) {
    if (e.component.getFirstPropertyValue('status') === 'CANCELLED') continue;
    out.push(...toOccurrence(e, e.startDate, e.endDate, tz, calendarIndex, tag));
  }
  for (const o of occurrences) {
    if (o.item.component.getFirstPropertyValue('status') === 'CANCELLED') continue;
    out.push(...toOccurrence(o.item, o.startDate, o.endDate, tz, calendarIndex, tag));
  }

  return out.filter((ev) => wanted.has(ev.date));
}

export async function loadEvents(days, tz) {
  const feeds = icsFeeds();
  const results = await Promise.allSettled(feeds.map((f) => fetchIcs(f.url)));
  const events = [];
  const errors = [];
  const calendars = feeds.map((f) => f.label);

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      try {
        const tagged = expandIcs(r.value, days, tz, i, feeds[i].label);
        events.push(...tagged);
        if (!calendars[i]) {
          const fromFeed = tagged.find((e) => e.label)?.label;
          if (fromFeed) calendars[i] = fromFeed;
        }
      } catch (err) {
        errors.push(`calendar ${i + 1}: ${err.message}`);
      }
    } else {
      errors.push(`calendar ${i + 1}: ${r.reason.message}`);
    }
  });

  return { events, errors, calendars };
}
