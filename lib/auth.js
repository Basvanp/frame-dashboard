// Two shared secrets: a read key baked into the TV apps, and a write key used
// only when posting the Monday plan. Leaving the read key unset makes the
// dashboard public, which is fine on localhost and nowhere else.

import crypto from 'node:crypto';

function same(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// The write key also reads, so the Mac app needs only one secret.
export function canRead(req, url) {
  const key = process.env.DASHBOARD_READ_KEY;
  if (!key) return true;
  const given = url.searchParams.get('k') || bearer(req);
  if (given == null) return false;
  const write = process.env.DASHBOARD_WRITE_KEY;
  return same(given, key) || (!!write && same(given, write));
}

export function canWrite(req) {
  const key = process.env.DASHBOARD_WRITE_KEY;
  if (!key) return false;
  const given = bearer(req);
  return given != null && same(given, key);
}
