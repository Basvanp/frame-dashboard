// Posts a weekly plan to the dashboard.
//   npm run plan:push -- plan/2026-10-12.json
// Reads DASHBOARD_API and DASHBOARD_WRITE_KEY from the environment (.env.local).

import { readFileSync } from 'node:fs';

const file = process.argv[2];
const api = (process.env.DASHBOARD_API || 'http://localhost:4321').replace(/\/$/, '');
const key = process.env.DASHBOARD_WRITE_KEY;

if (!file) {
  console.error('usage: npm run plan:push -- <plan.json>');
  process.exit(1);
}
if (!key) {
  console.error('DASHBOARD_WRITE_KEY is not set');
  process.exit(1);
}

const res = await fetch(`${api}/api/plan`, {
  method: 'PUT',
  headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
  body: readFileSync(file, 'utf8'),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`${res.status}: ${body.error || 'request failed'}`);
  process.exit(1);
}
console.log(`Saved week of ${body.weekOf} at ${body.updatedAt} → ${api}`);
