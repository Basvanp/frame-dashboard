// Local server: static files from public/ plus the two API routes.
// Run with `npm run dev` (loads .env.local if present).

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import week from '../api/week.js';
import plan from '../api/plan.js';

const PORT = Number(process.env.PORT || 4321);
const ROOT = path.join(process.cwd(), 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

const routes = { '/api/week': week, '/api/plan': plan };

http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (routes[pathname]) return routes[pathname](req, res);

    const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    try {
      const body = await fs.readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  })
  .listen(PORT, () => console.log(`frame-dashboard on http://localhost:${PORT}`));
