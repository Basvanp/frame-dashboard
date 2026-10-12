// GET /api/plan?week=YYYY-MM-DD   read the stored plan for a week
// PUT /api/plan                   replace a week's plan (body: plan JSON)
// Both need `Authorization: Bearer <write key>`.

import { canWrite } from '../lib/auth.js';
import { readJson, requestUrl, send } from '../lib/http.js';
import { normalizePlan } from '../lib/plan.js';
import { getPlan, putPlan } from '../lib/store.js';
import { isYmd, mondayOf, tzName, ymdInTz } from '../lib/time.js';

export default async function handler(req, res) {
  if (!canWrite(req)) return send(res, 401, { error: 'missing or wrong write key' });
  const url = requestUrl(req);

  try {
    if (req.method === 'GET') {
      const week = url.searchParams.get('week');
      const monday = mondayOf(isYmd(week) ? week : ymdInTz(new Date(), tzName()));
      return send(res, 200, (await getPlan(monday)) || { weekOf: monday, days: {} });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      let plan;
      try {
        plan = normalizePlan(await readJson(req));
      } catch (err) {
        return send(res, 400, { error: err.message });
      }
      await putPlan(plan.weekOf, plan);
      return send(res, 200, { ok: true, weekOf: plan.weekOf, updatedAt: plan.updatedAt });
    }

    send(res, 405, { error: 'method not allowed' });
  } catch (err) {
    send(res, 500, { error: err.message });
  }
}
