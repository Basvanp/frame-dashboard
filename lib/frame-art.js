// Local Art Mode channel on a Samsung Frame (2022 uses wss port 8002).
// Upload a JPEG, show it, delete the previous one. The TV must be on the LAN.

import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { connect as tlsConnect } from 'node:tls';
import { connect as netConnect } from 'node:net';
import { openTvSocket } from './tv-socket.js';

const ART_APP = 'com.samsung.art-app';
const REMOTE = 'samsung.remote.control';
const MY_PHOTOS = 'MY-C0002';
const IGNORE = new Set(['ed.edenTV.update', 'ms.voiceApp.hide']);
const PAIR_MS = 120000;

export function buildUploadFrame(jpeg, uploadId, matte = 'none') {
  const inner = {
    request: 'send_image',
    file_type: 'JPEG',
    matte_id: matte || 'none',
    id: uploadId,
  };
  const outer = {
    method: 'ms.channel.emit',
    params: {
      data: JSON.stringify(inner),
      to: 'host',
      event: 'art_app_request',
    },
  };
  const header = Buffer.from(JSON.stringify(outer));
  const len = Buffer.alloc(2);
  len.writeUInt16BE(header.length);
  return Buffer.concat([len, header, jpeg]);
}

export function parseFrame(data) {
  if (typeof data === 'string') return JSON.parse(data);
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const start = buf.indexOf(0x7b);
  if (start < 0) throw new Error('TV response had no JSON');
  let depth = 0;
  let end = -1;
  for (let i = start; i < buf.length; i++) {
    if (buf[i] === 0x7b) depth++;
    else if (buf[i] === 0x7d) {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error('TV response JSON did not close');
  const frame = JSON.parse(buf.subarray(start, end).toString('utf8'));
  const tail = buf.subarray(end + (buf[end] === 0x0a ? 1 : 0));
  if (tail.length) frame.binary = tail;
  return frame;
}

function channelUrl(host, port, channel, token) {
  const name = Buffer.from('FrameDashboard').toString('base64');
  const q = new URLSearchParams({ name });
  if (port === 8002 && token) q.set('token', token);
  const scheme = port === 8002 ? 'wss' : 'ws';
  return `${scheme}://${host}:${port}/api/v2/channels/${channel}?${q}`;
}

function tokenFrom(frame) {
  let data = frame.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data && data.token;
}

async function asBuffer(data) {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data && typeof data.arrayBuffer === 'function') return Buffer.from(await data.arrayBuffer());
  throw new Error('unexpected websocket payload');
}

export class FrameArt {
  constructor({ host, port = 8002, token = null, tokenFile = null, timeoutMs = 20000 }) {
    this.host = host;
    this.port = port;
    this.token = token;
    this.tokenFile = tokenFile;
    this.timeoutMs = timeoutMs;
    this.ws = null;
    this.version = null;
    this.uploadMode = null;
    this.#artLogged = false;
    this.#queue = [];
    this.#waiters = [];
  }

  #queue;
  #waiters;
  #artLogged = false;

  async connect() {
    if (!this.token && this.tokenFile) {
      try {
        this.token = (await readFile(this.tokenFile, 'utf8')).trim() || null;
      } catch {
        this.token = null;
      }
    }
    if (this.port === 8002) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    if (this.port === 8002 && !this.token) await this.#pair();
    try {
      await this.#openArt();
    } catch (err) {
      if (!/refused the connection/.test(err.message)) throw err;
      await this.#forgetToken();
      await this.#pair();
      await this.#openArt();
    }
  }

  async #pair() {
    console.log('Press Allow on the TV. You have 2 minutes.');
    const first = await this.#open(REMOTE, PAIR_MS);
    if (first.event === 'ms.channel.unauthorized') {
      throw new Error('Frame refused the connection. Turn the TV on and accept Allow on the screen.');
    }
    const token = tokenFrom(first);
    if (!token) throw new Error('Frame connected without a token. Press Allow on the screen.');
    this.token = token;
    if (this.tokenFile) await writeFile(this.tokenFile, token, { mode: 0o600 });
    this.#dropSocket();
  }

  async #forgetToken() {
    this.token = null;
    if (!this.tokenFile) return;
    try {
      await unlink(this.tokenFile);
    } catch {
      /* already gone */
    }
  }

  async #openArt() {
    const first = await this.#open(ART_APP, this.timeoutMs);
    if (first.event === 'ms.channel.unauthorized') {
      throw new Error('Frame refused the connection. Turn the TV on and accept Allow on the screen.');
    }
    const token = tokenFrom(first);
    if (token && token !== this.token) {
      this.token = token;
      if (this.tokenFile) await writeFile(this.tokenFile, token, { mode: 0o600 });
    }
    await this.#until((frame) => frame.event === 'ms.channel.ready');
  }

  #open(channel, timeoutMs) {
    this.#dropSocket();
    const previous = this.timeoutMs;
    this.timeoutMs = timeoutMs;
    return openTvSocket(channelUrl(this.host, this.port, channel, this.token), timeoutMs).then((ws) => {
      this.ws = ws;
      console.log(`Socket open on port ${this.port}. Allow should be on the TV now.`);
      ws.addEventListener('message', (ev) => {
        this.#onMessage(ev.data);
      });
      ws.addEventListener('close', () => {
        if (this.ws !== ws) return;
        const pending = this.#waiters.splice(0);
        for (const waiter of pending) waiter.reject(new Error('TV closed the connection'));
      });
      ws.addEventListener('error', (err) => {
        console.error(err && err.message ? err.message : 'TV socket error');
      });
      ws.start();
      return this.#until((frame) => frame.event === 'ms.channel.connect' || frame.event === 'ms.channel.unauthorized');
    }).finally(() => {
      this.timeoutMs = previous;
    });
  }

  #dropSocket() {
    const pending = this.#waiters.splice(0);
    for (const waiter of pending) waiter.reject(new Error('TV connection closed'));
    try {
      this.ws && this.ws.close();
    } catch {
      /* already gone */
    }
    this.ws = null;
    this.#queue = [];
    this.version = null;
    this.uploadMode = null;
  }

  close() {
    this.#dropSocket();
  }

  async #onMessage(data) {
    let frame;
    try {
      frame = parseFrame(await asBuffer(data));
    } catch {
      const preview = Buffer.isBuffer(data) ? data.subarray(0, 160).toString('utf8') : '';
      if (preview) console.log(`Ignored TV message: ${preview}`);
      return;
    }
    if (IGNORE.has(frame.event)) return;
    if (frame.event === 'ms.error') {
      const message = tvError(frame);
      console.log(`TV error: ${message}`);
      const waiter = this.#waiters.shift();
      if (waiter) waiter.reject(new Error(message));
      return;
    }
    if (frame.event && frame.event !== 'd2d_service_message') console.log(`TV event: ${frame.event}`);
    const waiter = this.#waiters.shift();
    if (waiter) waiter.resolve(frame);
    else this.#queue.push(frame);
  }

  #recv() {
    const queued = this.#queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve: (frame) => {
          clearTimeout(waiter.timer);
          resolve(frame);
        },
        reject: (err) => {
          clearTimeout(waiter.timer);
          reject(err);
        },
      };
      waiter.timer = setTimeout(() => {
        const at = this.#waiters.indexOf(waiter);
        if (at >= 0) this.#waiters.splice(at, 1);
        reject(new Error('TV did not answer'));
      }, this.timeoutMs);
      this.#waiters.push(waiter);
    });
  }

  async #until(pred) {
    const started = Date.now();
    while (Date.now() - started < this.timeoutMs) {
      const frame = await this.#recv();
      if (pred(frame)) return frame;
    }
    throw new Error('TV did not answer');
  }

  async #request(body, subEvent) {
    const id = body.id || randomUUID();
    const data = JSON.stringify({ ...body, id, request_id: id });
    console.log(`art request: ${body.request}`);
    this.ws.send(JSON.stringify({
      method: 'ms.channel.emit',
      params: { event: 'art_app_request', to: 'host', data },
    }));
    const frame = await this.#until((f) => {
      if (f.event !== 'd2d_service_message') return false;
      const payload = payloadOf(f);
      if (!payload) return false;
      f.payload = payload;
      const msgId = payload.request_id || payload.id;
      if (msgId && msgId !== id) return false;
      return !subEvent || payload.event === subEvent;
    });
    const payload = frame.payload;
    if (payload.event === 'error') {
      throw new Error(`${body.request} failed (${payload.error_code || 'unknown'})`);
    }
    if (frame.binary) payload.binary = frame.binary;
    return payload;
  }

  async apiVersion() {
    if (this.version) return this.version;
    for (const request of ['get_api_version', 'api_version']) {
      try {
        const data = await this.#request({ request });
        this.version = data.version || data.api_version || null;
        if (this.version) return this.version;
      } catch (err) {
        console.error(`${request}: ${err.message}`);
      }
    }
    return null;
  }

  async uploadJpeg(jpeg, matte = 'none') {
    if (!this.uploadMode) {
      const version = await this.apiVersion().catch(() => null);
      this.uploadMode = version === '0.97' ? 'binary' : 'socket';
    }
    try {
      return await this.#upload(this.uploadMode, jpeg, matte);
    } catch {
      const other = this.uploadMode === 'binary' ? 'socket' : 'binary';
      const id = await this.#upload(other, jpeg, matte);
      this.uploadMode = other;
      return id;
    }
  }

  async #upload(mode, jpeg, matte) {
    const id = randomUUID();
    if (mode === 'binary') {
      this.ws.send(buildUploadFrame(jpeg, id, matte), true);
      const done = await this.#until((f) => {
        if (f.event !== 'd2d_service_message') return false;
        f.payload = payloadOf(f);
        if (!f.payload) return false;
        const msgId = f.payload.request_id || f.payload.id;
        return (!msgId || msgId === id) && f.payload.event === 'image_added';
      });
      return done.payload.content_id;
    }
    const ready = await this.#request(
      {
        request: 'send_image',
        id,
        file_type: 'JPEG',
        file_size: jpeg.length,
        image_date: stamp(),
        matte_id: matte,
        portrait_matte_id: matte,
        conn_info: {
          d2d_mode: 'socket',
          connection_id: randomBytes(4).readUInt32BE(0),
          id,
        },
      },
      'ready_to_use'
    );
    await sendFile(ready, jpeg);
    const done = await this.#until((f) => {
      if (f.event !== 'd2d_service_message') return false;
      f.payload = payloadOf(f);
      if (!f.payload) return false;
      return f.payload.event === 'image_added';
    });
    return done.payload.content_id;
  }

  async artMode() {
    const data = await this.#request({ request: 'get_artmode_status' });
    const nested = data.data && typeof data.data === 'object' ? data.data.value : null;
    const value = data.value || data.art_mode || data.mode || nested;
    if (!this.#artLogged) {
      this.#artLogged = true;
      console.log(`art mode payload: ${JSON.stringify(data)}`);
    }
    return value === 'on' ? 'on' : 'off';
  }

  async select(contentId, show = true) {
    await this.#request({
      request: 'select_image',
      content_id: contentId,
      category_id: MY_PHOTOS,
      show: show !== false,
    });
  }

  async remove(contentId) {
    if (!contentId) return;
    await this.#request({
      request: 'delete_image_list',
      content_id_list: [{ content_id: contentId }],
    });
  }

  async holdStill() {
    try {
      await this.#request({
        request: 'set_slideshow_status',
        value: 'off',
        category_id: MY_PHOTOS,
        type: 'slideshow',
      });
    } catch {
      /* older firmware names this auto rotation; the picture still gets selected */
    }
  }
}

function payloadOf(frame) {
  const data = frame.data;
  if (!data) return null;
  if (typeof data === 'object') return data;
  try {
    const payload = JSON.parse(data);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

function tvError(frame) {
  const data = frame.data;
  if (!data) return 'ms.error';
  if (typeof data === 'string') return data;
  return data.message || JSON.stringify(data);
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function connInfo(payload) {
  const raw = payload.conn_info || {};
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

function sendFile(ready, jpeg) {
  const info = connInfo(ready);
  const header = Buffer.from(JSON.stringify({
    num: 0,
    total: 1,
    fileLength: jpeg.length,
    fileName: 'image',
    fileType: 'jpg',
    secKey: info.key,
    version: '0.0.1',
  }));
  const len = Buffer.alloc(4);
  len.writeUInt32BE(header.length);
  const socket = info.secured
    ? tlsConnect({ host: info.ip, port: Number(info.port), rejectUnauthorized: false })
    : netConnect({ host: info.ip, port: Number(info.port) });
  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.once(info.secured ? 'secureConnect' : 'connect', () => {
      socket.end(Buffer.concat([len, header, jpeg]), resolve);
    });
  });
}
