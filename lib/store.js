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

const keyFor = (monday) => `frame-dashboard:plan:${monday}`;

export function storeKind() {
  return redisConfig() ? 'redis' : 'file';
}

export async function getPlan(monday) {
  const redis = redisConfig();
  if (redis) {
    const res = await fetch(`${redis.url}/get/${encodeURIComponent(keyFor(monday))}`, {
      headers: { authorization: `Bearer ${redis.token}` },
    });
    if (!res.ok) throw new Error(`redis get returned ${res.status}`);
    const { result } = await res.json();
    return result ? JSON.parse(result) : null;
  }

  try {
    return JSON.parse(await fs.readFile(path.join(PLAN_DIR, `${monday}.json`), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function putPlan(monday, plan) {
  const body = JSON.stringify(plan);
  const redis = redisConfig();
  if (redis) {
    const res = await fetch(`${redis.url}/set/${encodeURIComponent(keyFor(monday))}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${redis.token}` },
      body,
    });
    if (!res.ok) throw new Error(`redis set returned ${res.status}`);
    return;
  }

  await fs.mkdir(PLAN_DIR, { recursive: true });
  await fs.writeFile(path.join(PLAN_DIR, `${monday}.json`), `${JSON.stringify(plan, null, 2)}\n`);
}
