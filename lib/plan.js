// The weekly plan: what you decided on Monday. Validation is strict on shape
// and loose on content — tasks can be plain strings or { text, done, tag }.

import { isYmd, mondayOf, weekDays } from './time.js';

const MAX_TEXT = 200;
const MAX_TASKS = 20;

function text(value, field) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > MAX_TEXT) throw new Error(`${field} is longer than ${MAX_TEXT} characters`);
  return trimmed || null;
}

function task(value, field) {
  if (typeof value === 'string') return { text: text(value, field), done: false, tag: null };
  if (!value || typeof value !== 'object') throw new Error(`${field} must be a string or an object`);
  const t = text(value.text, `${field}.text`);
  if (!t) throw new Error(`${field}.text is required`);
  return { text: t, done: value.done === true, tag: text(value.tag, `${field}.tag`) };
}

export function normalizePlan(input) {
  if (!input || typeof input !== 'object') throw new Error('plan must be a JSON object');
  if (!isYmd(input.weekOf)) throw new Error('weekOf must be a YYYY-MM-DD date');
  if (mondayOf(input.weekOf) !== input.weekOf) throw new Error('weekOf must be a Monday');

  const allowed = new Set(weekDays(input.weekOf));
  const days = {};
  for (const [date, day] of Object.entries(input.days || {})) {
    if (!allowed.has(date)) throw new Error(`days.${date} is not in the week of ${input.weekOf}`);
    const tasks = day.tasks || [];
    if (!Array.isArray(tasks)) throw new Error(`days.${date}.tasks must be an array`);
    if (tasks.length > MAX_TASKS) throw new Error(`days.${date} has more than ${MAX_TASKS} tasks`);
    days[date] = {
      focus: text(day.focus, `days.${date}.focus`),
      note: text(day.note, `days.${date}.note`),
      tasks: tasks.map((t, i) => task(t, `days.${date}.tasks[${i}]`)),
    };
  }

  return {
    weekOf: input.weekOf,
    focus: text(input.focus, 'focus'),
    days,
    updatedAt: new Date().toISOString(),
  };
}
