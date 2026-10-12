// Assembles what the screen shows: the plan for this week merged with the
// calendar, one entry per day.

import { artFor } from './art.js';
import { loadEvents } from './calendar.js';
import { normalizePlan } from './plan.js';
import { getPlan as readPlan } from './store.js';
import { addDays, isYmd, mondayOf, tzName, weekDays, ymdInTz } from './time.js';

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

  const [plan, calendar] = await Promise.all([getPlan(monday), loadEvents(dates, tz)]);

  const dayOf = (d, dayPlan, events) => {
    const planned = (dayPlan && dayPlan.days[d]) || {};
    return {
      date: d,
      focus: planned.focus || null,
      note: planned.note || null,
      tasks: planned.tasks || [],
      events: events.filter((e) => e.date === d).sort(byStart),
      art: artFor(d),
    };
  };

  const days = dates.map((d) => dayOf(d, plan, calendar.events));

  // The evening view previews tomorrow. On Sunday that is next week's Monday,
  // which lives in a different plan.
  const tomorrowDate = addDays(today, 1);
  let tomorrow = days.find((d) => d.date === tomorrowDate) || null;
  if (!tomorrow && anchor === today) {
    const [nextPlan, nextCal] = await Promise.all([
      getPlan(mondayOf(tomorrowDate)),
      loadEvents([tomorrowDate], tz),
    ]);
    tomorrow = dayOf(tomorrowDate, nextPlan, nextCal.events);
  }

  return {
    tz,
    locale: process.env.DASHBOARD_LOCALE || 'en',
    layout: process.env.DASHBOARD_LAYOUT || 'bleed',
    today,
    weekOf: monday,
    focus: plan ? plan.focus : null,
    planned: Boolean(plan),
    planUpdatedAt: plan ? plan.updatedAt : null,
    days,
    tomorrow,
    errors: calendar.errors,
    generatedAt: new Date().toISOString(),
  };
}
