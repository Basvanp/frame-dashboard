// Push the live dashboard into Art Mode once a minute, replacing last minute's file.
//
//   npm run art:push
//
// Runs on a machine on the same LAN as the Frame. Reads .env.local:
//   FRAME_TV_IP       the TV
//   FRAME_TV_PORT     8002 on a 2022 Frame (8001 on older ones)
//   DASHBOARD_URL     the hosted page, including ?k=
//   CHROME_PATH       optional, if Chrome is not in the usual place
//
// The first connection asks you to press Allow on the TV. The token is kept
// in frame-tv.token. The content id of the current slide is frame-art.json.
// Matte is none, so the painting stays full-bleed. Slideshow is turned off
// so the Frame does not rotate away to another picture.

import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtemp, readFile, writeFile, access } from 'node:fs/promises';
import { networkInterfaces, tmpdir } from 'node:os';
import path from 'node:path';
import { FrameArt } from '../lib/frame-art.js';

const once = process.argv.includes('--once');
const discoverOnly = process.argv.includes('--discover');
const host = process.env.FRAME_TV_IP;
const port = Number(process.env.FRAME_TV_PORT || 8002);
const pageUrl = process.env.DASHBOARD_URL;
const stateFile = path.resolve(process.env.FRAME_STATE_FILE || 'frame-art.json');
const tokenFile = path.resolve(process.env.FRAME_TOKEN_FILE || 'frame-tv.token');

if (discoverOnly) {
  const found = await discover();
  if (!found.length) console.log('No Frame found on this network.');
  for (const tv of found) console.log(`${tv.ip}\t${tv.name}\t${tv.model}`);
  process.exit(found.length ? 0 : 1);
}

if (!host || !pageUrl) {
  console.error('Set FRAME_TV_IP and DASHBOARD_URL (with ?k=) in .env.local, or .env next to docker-compose.yml');
  process.exit(1);
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates;
}

async function whichChrome() {
  for (const file of chromePath()) {
    try {
      await access(file);
      return file;
    } catch {
      /* next */
    }
  }
  throw new Error('Chrome not found. Set CHROME_PATH.');
}

class Screen {
  constructor(exe) {
    this.exe = exe;
    this.proc = null;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
  }

  async start() {
    const dir = await mkdtemp(path.join(tmpdir(), 'frame-art-'));
    const port = 9333;
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--hide-scrollbars',
      '--remote-debugging-address=127.0.0.1',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${dir}`,
      '--window-size=1920,1080',
    ];
    if (process.getuid?.() === 0 || process.env.FRAME_IN_DOCKER === '1') {
      args.push('--no-sandbox', '--disable-dev-shm-usage');
    }
    args.push('about:blank');
    this.proc = spawn(this.exe, args, { stdio: 'ignore' });
    this.proc.on('exit', () => {
      this.proc = null;
    });
    const list = await waitFor(`http://127.0.0.1:${port}/json/list`);
    const tab = list.find((t) => t.type === 'page') || list[0];
    this.ws = new WebSocket(tab.webSocketDebuggerUrl);
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      const wait = this.pending.get(msg.id);
      if (wait) {
        this.pending.delete(msg.id);
        wait(msg.result);
      }
    });
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', () => reject(new Error('Chrome devtools did not open')));
    });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2,
      mobile: false,
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 20000);
      this.pending.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async jpeg() {
    const url = new URL(pageUrl);
    url.searchParams.set('frameart', String(Date.now()));
    await this.send('Page.navigate', { url: url.toString() });
    const started = Date.now();
    let ready = false;
    while (Date.now() - started < 20000) {
      const result = await this.send('Runtime.evaluate', {
        expression: `(() => {
          var clock = document.getElementById('clock-time');
          if (!clock || !clock.textContent) return false;
          if (document.fonts && document.fonts.status !== 'loaded') return false;
          var imgs = [document.getElementById('bleed'), document.getElementById('painting')];
          return imgs.some(function (img) { return img && img.complete && img.naturalWidth > 0; });
        })()`,
        returnByValue: true,
      });
      if (result && result.result && result.result.value) {
        ready = true;
        break;
      }
      await sleep(400);
    }
    if (!ready) throw new Error('dashboard did not finish painting');
    const shot = await this.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 82,
      fromSurface: true,
    });
    return Buffer.from(shot.data, 'base64');
  }

  stop() {
    try {
      this.ws && this.ws.close();
    } catch {
      /* already gone */
    }
    this.ws = null;
    if (this.proc) {
      const proc = this.proc;
      this.proc = null;
      proc.kill();
    }
  }
}

async function waitFor(url) {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
    } catch {
      /* chrome still starting */
    }
    await sleep(200);
  }
  throw new Error('Chrome did not open a debugging port');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readState() {
  try {
    return JSON.parse(await readFile(stateFile, 'utf8'));
  } catch {
    return {};
  }
}

let artWasOn = false;

async function inArtMode(tv) {
  return tv.artMode().then((mode) => mode === 'on').catch(() => false);
}

// Never select_image while a programme is on: on this Frame that pulls Art Mode
// over the picture. Upload still happens so the file is ready; we only show it
// when Art Mode is already on, or the moment the set enters Art Mode.
async function showIfArt(tv, id) {
  if (!id) return false;
  const on = await inArtMode(tv);
  const entered = on && !artWasOn;
  artWasOn = on;
  if (!on) return false;
  await tv.select(id, true);
  return entered;
}

async function tick(screen, tv) {
  console.log('Capturing the dashboard');
  const jpeg = await screen.jpeg();
  const state = await readState();
  const id = await tv.uploadJpeg(jpeg, 'none');
  const previous = [...(state.ids || [])];
  if (state.contentId && !previous.includes(state.contentId)) previous.push(state.contentId);
  await writeFile(stateFile, JSON.stringify({ contentId: id, ids: [...previous, id] }));
  await showIfArt(tv, id);
  const left = [];
  for (const old of previous) {
    if (old === id) continue;
    try {
      await tv.remove(old);
    } catch (err) {
      left.push(old);
      console.error(`could not remove ${old}: ${err.message}`);
    }
  }
  await writeFile(stateFile, JSON.stringify({ contentId: id, ids: left }));
  const how = shown || artWasOn ? 'shown' : 'queued';
  console.log(`${new Date().toISOString()} ${id} ${(jpeg.length / 1024).toFixed(0)}kb ${how}, replaced ${state.contentId || 'nothing'}`);
}

async function waitForNextMinute(tv) {
  const deadline = Date.now() + (60_000 - (Date.now() % 60_000)) + 1500;
  while (!stopped && Date.now() < deadline) {
    const state = await readState();
    if (state.contentId && !artWasOn) {
      const shown = await showIfArt(tv, state.contentId);
      if (shown) console.log(`${new Date().toISOString()} ${state.contentId} shown (Art Mode)`);
    }
    await sleep(Math.min(8000, Math.max(0, deadline - Date.now())));
  }
}

function lanHosts() {
  const ips = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list || []) {
      if (net.family !== 'IPv4' && net.family !== 4) continue;
      if (net.internal) continue;
      const parts = net.address.split('.');
      if (parts.length !== 4) continue;
      const prefix = parts.slice(0, 3).join('.');
      for (let i = 1; i < 255; i++) ips.push(`${prefix}.${i}`);
    }
  }
  return ips;
}

function probe(ip) {
  return new Promise((resolve) => {
    const req = http.get({ host: ip, port: 8001, path: '/api/v2/', timeout: 1500 }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const device = JSON.parse(Buffer.concat(chunks).toString()).device || {};
          if (device.FrameTVSupport === 'true') {
            resolve({
              ip,
              name: String(device.name || '').replace('[TV]', '').trim() || 'Frame',
              model: device.modelName || '',
            });
            return;
          }
        } catch {
          /* not a Samsung reply */
        }
        resolve(null);
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function discover() {
  const hosts = lanHosts();
  const found = [];
  const width = 64;
  for (let i = 0; i < hosts.length; i += width) {
    const batch = await Promise.all(hosts.slice(i, i + width).map(probe));
    found.push(...batch.filter(Boolean));
  }
  return found;
}

const screen = new Screen(await whichChrome());
const tv = new FrameArt({ host, port, tokenFile });
let stopped = false;
let linked = false;

function shutdown() {
  stopped = true;
  screen.stop();
  tv.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

let first = true;
do {
  try {
    if (!screen.proc) await screen.start();
    if (!linked) {
      await tv.connect();
      await tv.holdStill();
      linked = true;
      console.log(`Frame ${host}:${port} linked. A JPEG goes up at each new minute.`);
    }
    if (!once && !first) await waitForNextMinute(tv);
    first = false;
    if (stopped) break;
    await tick(screen, tv);
  } catch (err) {
    console.error(err.message);
    linked = false;
    artWasOn = false;
    tv.close();
    if (/Chrome|devtools|dashboard did not|painting/.test(err.message)) screen.stop();
    if (once) process.exit(1);
    await sleep(30_000);
  }
} while (!stopped && !once);

shutdown();
