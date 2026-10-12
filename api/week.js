// GET /api/week[?date=YYYY-MM-DD]&k=<read key>
// The whole week the screen renders: plan + calendar, one entry per day.

import { canRead } from '../lib/auth.js';
import { requestUrl, send } from '../lib/http.js';
import { buildWeek } from '../lib/week.js';

export default async function handler(req, res) {
  const url = requestUrl(req);
  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
  if (!canRead(req, url)) return send(res, 401, { error: 'missing or wrong key' });

  try {
    send(res, 200, await buildWeek({ date: url.searchParams.get('date') }));
  } catch (err) {
    send(res, 500, { error: err.message });
  }
}
