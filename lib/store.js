// Where weekly plans live. Upstash Redis (REST) when configured, otherwise a
// local JSON file per week under plan/ — handy for development and for anyone
// self-hosting on a box with a disk. plan/ is gitignored.

import fs from 'node:fs/promises';
import path from 'node:path';

const PLAN_DIR = path.join(process.cwd(), 'plan');

function redisConfig() {
  // Vercel's Upstash integration sets the KV_* names.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

// Two documents per week: the plan (focus + tasks, written by you or Claude)
// and pushed calendar events (written by the Mac app). They are separate keys
// so a calendar sync can never overwrite a task edit, or the other way round.
const keyFor = (kind, monday) => `frame-dashboard:${kind}:${monday}`;
const fileFor = (kind, monday) =>
  path.join(PLAN_DIR, kind === 'plan' ? `${monday}.json` : `${monday}.${kind}.json`);

export function storeKind() {
  return redisConfig() ? 'redis' : 'file';
}

async function getDoc(kind, monday) {
  const redis = redisConfig();
  if (redis) {
    const res = await fetch(`${redis.url}/get/${encodeURIComponent(keyFor(kind, monday))}`, {
      headers: { authorization: `Bearer ${redis.token}` },
    });
    if (!res.ok) throw new Error(`redis get returned ${res.status}`);
    const { result } = await res.json();
    return result ? JSON.parse(result) : null;
  }

  try {
    return JSON.parse(await fs.readFile(fileFor(kind, monday), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// Bumped on every write. Screens poll this one cheap key to learn that
// something changed, instead of rebuilding the whole week every few seconds.
const VERSION_KEY = 'frame-dashboard:version';
const VERSION_FILE = path.join(PLAN_DIR, '.version');

async function putDoc(kind, monday, doc) {
  const body = JSON.stringify(doc);
  const version = String(Date.now());
  const redis = redisConfig();
  if (redis) {
    // One round trip for both writes.
    const res = await fetch(`${redis.url}/multi-exec`, {
      method: 'POST',
      headers: { authorization: `Bearer ${redis.token}` },
      body: JSON.stringify([
        ['SET', keyFor(kind, monday), body],
        ['SET', VERSION_KEY, version],
      ]),
    });
    if (!res.ok) throw new Error(`redis write returned ${res.status}`);
    return;
  }

  await fs.mkdir(PLAN_DIR, { recursive: true });
  await fs.writeFile(fileFor(kind, monday), `${JSON.stringify(doc, null, 2)}\n`);
  await fs.writeFile(VERSION_FILE, version);
}

export async function getVersion() {
  const redis = redisConfig();
  if (redis) {
    const res = await fetch(`${redis.url}/get/${encodeURIComponent(VERSION_KEY)}`, {
      headers: { authorization: `Bearer ${redis.token}` },
    });
    if (!res.ok) throw new Error(`redis get returned ${res.status}`);
    return (await res.json()).result || '0';
  }
  try {
    return (await fs.readFile(VERSION_FILE, 'utf8')).trim();
  } catch {
    return '0';
  }
}

export const getPlan = (monday) => getDoc('plan', monday);
// Settings are not per week; 'all' stands in for the Monday.
export const getSettings = () => getDoc('settings', 'all');
export const putSettings = (doc) => putDoc('settings', 'all', doc);
export const putPlan = (monday, plan) => putDoc('plan', monday, plan);
export const getEvents = (monday) => getDoc('events', monday);
export const putEvents = (monday, doc) => putDoc('events', monday, doc);
