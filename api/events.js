// GET /api/events?week=YYYY-MM-DD   the events last pushed for a week
// PUT /api/events                   replace a week's pushed events
//                                   (body: { weekOf, source?, events: [...] })
// Both need `Authorization: Bearer <write key>`.

import { canWrite } from '../lib/auth.js';
import { normalizeEvents } from '../lib/events.js';
import { readJson, requestUrl, send } from '../lib/http.js';
import { getEvents, putEvents } from '../lib/store.js';
import { isYmd, mondayOf, tzName, ymdInTz } from '../lib/time.js';

export default async function handler(req, res) {
  if (!canWrite(req)) return send(res, 401, { error: 'missing or wrong write key' });
  const url = requestUrl(req);

  try {
    if (req.method === 'GET') {
      const week = url.searchParams.get('week');
      const monday = mondayOf(isYmd(week) ? week : ymdInTz(new Date(), tzName()));
      return send(res, 200, (await getEvents(monday)) || { weekOf: monday, events: [] });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      let doc;
      try {
        doc = normalizeEvents(await readJson(req), tzName());
      } catch (err) {
        return send(res, 400, { error: err.message });
      }
      await putEvents(doc.weekOf, doc);
      return send(res, 200, { ok: true, weekOf: doc.weekOf, count: doc.events.length, syncedAt: doc.syncedAt });
    }

    send(res, 405, { error: 'method not allowed' });
  } catch (err) {
    send(res, 500, { error: err.message });
  }
}
