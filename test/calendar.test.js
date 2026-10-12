import test from 'node:test';
import assert from 'node:assert/strict';
import { expandIcs } from '../lib/calendar.js';
import { mondayOf, weekDays } from '../lib/time.js';

const TZ = 'America/Monterrey';
const days = weekDays('2026-10-12');

// Google exports VTIMEZONE blocks; this one is trimmed to what ical.js needs.
const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VTIMEZONE
TZID:America/Monterrey
BEGIN:STANDARD
TZOFFSETFROM:-0600
TZOFFSETTO:-0600
TZNAME:CST
DTSTART:19700101T000000
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:standup
SUMMARY:Standup
DTSTART;TZID=America/Monterrey:20250106T093000
DTEND;TZID=America/Monterrey:20250106T094500
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR
EXDATE;TZID=America/Monterrey:20261014T093000
END:VEVENT
BEGIN:VEVENT
UID:standup
RECURRENCE-ID;TZID=America/Monterrey:20261016T093000
SUMMARY:Standup (moved)
DTSTART;TZID=America/Monterrey:20261016T110000
DTEND;TZID=America/Monterrey:20261016T111500
END:VEVENT
BEGIN:VEVENT
UID:late
SUMMARY:Late call
DTSTART:20261014T043000Z
DTEND:20261014T050000Z
END:VEVENT
BEGIN:VEVENT
UID:trip
SUMMARY:Trip
DTSTART;VALUE=DATE:20261017
DTEND;VALUE=DATE:20261019
END:VEVENT
BEGIN:VEVENT
UID:cancelled
SUMMARY:Cancelled thing
STATUS:CANCELLED
DTSTART:20261013T150000Z
DTEND:20261013T160000Z
END:VEVENT
END:VCALENDAR`;

const events = expandIcs(ics, days, TZ);
const on = (d) => events.filter((e) => e.date === d).map((e) => e.title);

test('weekly recurrence lands on the right local days', () => {
  assert.deepEqual(on('2026-10-12'), ['Standup']);
  const monday = events.find((e) => e.date === '2026-10-12');
  assert.equal(monday.start, '2026-10-12T15:30:00.000Z'); // 09:30 CST
});

test('EXDATE removes an occurrence', () => {
  assert.ok(!on('2026-10-14').includes('Standup'));
});

test('RECURRENCE-ID replaces an occurrence', () => {
  assert.deepEqual(on('2026-10-16'), ['Standup (moved)']);
});

test('UTC event is bucketed by local date', () => {
  // 04:30Z on the 14th is 22:30 on the 13th in Monterrey.
  assert.ok(on('2026-10-13').includes('Late call'));
});

test('all-day spans are exclusive of DTEND', () => {
  assert.deepEqual(on('2026-10-17'), ['Trip']);
  assert.deepEqual(on('2026-10-18'), ['Trip']);
  assert.ok(!events.some((e) => e.date === '2026-10-19'));
});

test('cancelled events are dropped', () => {
  assert.ok(!events.some((e) => e.title === 'Cancelled thing'));
});

test('mondayOf', () => {
  assert.equal(mondayOf('2026-10-18'), '2026-10-12');
  assert.equal(mondayOf('2026-10-12'), '2026-10-12');
});
