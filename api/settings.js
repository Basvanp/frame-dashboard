// GET /api/settings   → { packs: [{id, name, description, count}], enabled: [ids] }
// PUT /api/settings   ← { packs: [ids] }   (write key)
// Saving bumps the version, so screens repaint within seconds.

import { canRead, canWrite } from '../lib/auth.js';
import { listPacks } from '../lib/art.js';
import { readJson, requestUrl, send } from '../lib/http.js';
import { getSettings, normalizeSettings } from '../lib/settings.js';
import { putSettings } from '../lib/store.js';

export default async function handler(req, res) {
  const url = requestUrl(req);
  try {
    if (req.method === 'GET') {
      if (!canRead(req, url)) return send(res, 401, { error: 'missing or wrong key' });
      return send(res, 200, { packs: listPacks(), enabled: (await getSettings()).packs });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      if (!canWrite(req)) return send(res, 401, { error: 'missing or wrong write key' });
      let doc;
      try {
        doc = normalizeSettings(await readJson(req));
      } catch (err) {
        return send(res, 400, { error: err.message });
      }
      await putSettings(doc);
      return send(res, 200, { ok: true, enabled: doc.packs });
    }
    send(res, 405, { error: 'method not allowed' });
  } catch (err) {
    send(res, 500, { error: err.message });
  }
}
