// GET  /api/version?k=<read key> → { version, build }
//   version changes whenever a plan, calendar sync or setting is saved;
//   build changes on every deploy. Screens poll this every few seconds:
//   a new version refetches the week, a new build reloads the page.
// POST /api/version (write key) → bump the version: "refresh the screens now".

import { canRead, canWrite } from '../lib/auth.js';
import { requestUrl, send } from '../lib/http.js';
import { bumpVersion, getVersion } from '../lib/store.js';

// Vercel sets this per deployment; locally there is no build to compare.
const BUILD = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'dev';

export default async function handler(req, res) {
  const url = requestUrl(req);
  try {
    if (req.method === 'POST') {
      if (!canWrite(req)) return send(res, 401, { error: 'missing or wrong write key' });
      return send(res, 200, { version: await bumpVersion(), build: BUILD });
    }
    if (!canRead(req, url)) return send(res, 401, { error: 'missing or wrong key' });
    send(res, 200, { version: await getVersion(), build: BUILD });
  } catch (err) {
    send(res, 500, { error: err.message });
  }
}
