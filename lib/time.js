// Date helpers that work in a named IANA time zone without a date library.
// "ymd" strings (YYYY-MM-DD) are the unit of a day everywhere in this app.

export const DEFAULT_TZ = 'Europe/Amsterdam';

export function tzName() {
  return process.env.DASHBOARD_TZ || DEFAULT_TZ;
}

// en-CA formats as YYYY-MM-DD.
export function ymdInTz(date, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function isYmd(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// The Monday that starts the week containing `ymd`.
export function mondayOf(ymd) {
  const day = new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(ymd, -((day + 6) % 7));
}

export function weekDays(monday) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
