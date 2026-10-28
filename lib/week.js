// Assembles what the screen shows: the plan for this week merged with the
// calendar, one entry per day.

import { artFor } from './art.js';
import { loadEvents } from './calendar.js';
import { mergeEvents } from './events.js';
import { getSettings } from './settings.js';
import { normalizePlan } from './plan.js';
import { getEvents, getPlan as readPlan } from './store.js';
import { addDays, isYmd, mondayOf, tzName, weekDays, ymdInTz } from './time.js';
import { loadWeather } from './weather.js';

// Plans pushed through the API are already normalised; a hand-written file in
// plan/ may use the shorthand (tasks as plain strings), so normalise on read too.
async function getPlan(monday) {
  const raw = await readPlan(monday);
  if (!raw) return null;
  return { ...normalizePlan(raw), updatedAt: raw.updatedAt || null };
}

function byStart(a, b) {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  if (a.allDay) return a.title.localeCompare(b.title);
  return a.start.localeCompare(b.start);
}

export async function buildWeek({ date } = {}) {
  const tz = tzName();
  const today = ymdInTz(new Date(), tz);
  const anchor = isYmd(date) ? date : today;
  const monday = mondayOf(anchor);
  const dates = weekDays(monday);

  const [plan, calendar, pushed, settings, weather] = await Promise.all([
    getPlan(monday),
    loadEvents(dates, tz),
    getEvents(monday),
    getSettings(),
    loadWeather(tz),
  ]);
  const events = mergeEvents(calendar.events, pushed && pushed.events);

  const dayOf = (d, dayPlan, events) => {
    const planned = (dayPlan && dayPlan.days[d]) || {};
    return {
      date: d,
      focus: planned.focus || null,
      note: planned.note || null,
      tasks: planned.tasks || [],
      events: events.filter((e) => e.date === d).sort(byStart),
      art: artFor(d, settings.packs),
    };
  };

  const days = dates.map((d) => dayOf(d, plan, events));

  // The evening view previews tomorrow. On Sunday that is next week's Monday,
  // which lives in a different plan.
  const tomorrowDate = addDays(today, 1);
  let tomorrow = days.find((d) => d.date === tomorrowDate) || null;
  if (!tomorrow && anchor === today) {
    const [nextPlan, nextCal, nextPushed] = await Promise.all([
      getPlan(mondayOf(tomorrowDate)),
      loadEvents([tomorrowDate], tz),
      getEvents(mondayOf(tomorrowDate)),
    ]);
    tomorrow = dayOf(tomorrowDate, nextPlan, mergeEvents(nextCal.events, nextPushed && nextPushed.events));
  }

  return {
    tz,
    locale: process.env.DASHBOARD_LOCALE || 'nl',
    weather,
    layout: settings.layout,
    today,
    weekOf: monday,
    focus: plan ? plan.focus : null,
    planned: Boolean(plan),
    planUpdatedAt: plan ? plan.updatedAt : null,
    eventsSyncedAt: pushed ? pushed.syncedAt : null,
    days,
    tomorrow,
    calendars: calendar.calendars || [],
    errors: calendar.errors,
    generatedAt: new Date().toISOString(),
  };
}
