// GET /api/version?k=<read key> → { version }
// Changes whenever a plan or calendar sync is saved. Screens poll this every
// few seconds and fetch /api/week only when it moves.

import { canRead } from '../lib/auth.js';
import { requestUrl, send } from '../lib/http.js';
import { getVersion } from '../lib/store.js';

export default async function handler(req, res) {
  const url = requestUrl(req);
  if (!canRead(req, url)) return send(res, 401, { error: 'missing or wrong key' });
  try {
    send(res, 200, { version: await getVersion() });
  } catch (err) {
    send(res, 500, { error: err.message });
  }
}
