// Minimal websocket client for a Samsung TV.
// Node's built-in WebSocket offers permessage-deflate. A Frame accepts that
// handshake and then stays silent, so the Allow prompt never appears.

import { randomBytes } from 'node:crypto';
import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

export function openTvSocket(url, timeoutMs = 20000) {
  const target = new URL(url);
  const secure = target.protocol === 'wss:';
  const port = Number(target.port || (secure ? 443 : 80));
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tlsConnect({ host: target.hostname, port, rejectUnauthorized: false, servername: target.hostname })
      : netConnect({ host: target.hostname, port });
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err instanceof Error ? err : new Error('TV websocket failed'));
    };
    socket.setTimeout(timeoutMs, () => fail(new Error('TV websocket timed out')));
    socket.once('error', fail);
    const shake = () => {
      const key = randomBytes(16).toString('base64');
      const path = `${target.pathname}${target.search}`;
      socket.write(
        `GET ${path} HTTP/1.1\r\n` +
        `Host: ${target.host}\r\n` +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Key: ${key}\r\n` +
        'Sec-WebSocket-Version: 13\r\n' +
        '\r\n'
      );
      let header = Buffer.alloc(0);
      const onData = (chunk) => {
        header = Buffer.concat([header, chunk]);
        const split = header.indexOf('\r\n\r\n');
        if (split < 0) return;
        socket.pause();
        socket.off('data', onData);
        const status = header.subarray(0, split).toString('latin1').split('\r\n')[0];
        if (!status.includes('101')) {
          fail(new Error(`TV refused the websocket (${status})`));
          return;
        }
        if (settled) return;
        settled = true;
        socket.setTimeout(0);
        socket.off('error', fail);
        const client = new TvSocket(socket, header.subarray(split + 4));
        resolve(client);
      };
      socket.on('data', onData);
    };
    socket.once(secure ? 'secureConnect' : 'connect', shake);
  });
}

class TvSocket {
  constructor(socket, preload) {
    this.socket = socket;
    this.preload = preload;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.binaryType = 'arraybuffer';
    this.#messages = [];
    this.#waiting = [];
    socket.on('data', (chunk) => this.#push(chunk));
    socket.on('close', () => this.#emit('close'));
    socket.on('error', (err) => this.#emit('error', err));
  }

  #messages;
  #waiting;

  start() {
    if (this.preload.length) this.#push(this.preload);
    this.preload = Buffer.alloc(0);
    this.socket.resume();
  }

  send(data, binary = false) {
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.socket.write(clientFrame(binary ? 0x82 : 0x81, payload));
  }

  close() {
    try {
      this.socket.end();
    } catch {
      /* already gone */
    }
  }

  addEventListener(type, fn) {
    this.#waiting.push({ type, fn });
    if (type !== 'message') return;
    const queued = this.#messages.splice(0);
    for (const payload of queued) fn({ data: payload });
  }

  #emit(type, arg) {
    for (const waiter of this.#waiting) {
      if (waiter.type === type) waiter.fn(arg);
    }
  }

  #push(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 2) {
      const opcode = this.buf[0] & 0x0f;
      let length = this.buf[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buf.length < 4) return;
        length = this.buf.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buf.length < 10) return;
        length = Number(this.buf.readBigUInt64BE(2));
        offset = 10;
      }
      const masked = (this.buf[1] & 0x80) !== 0;
      if (this.buf.length < offset + (masked ? 4 : 0) + length) return;
      let payload = Buffer.from(this.buf.subarray(offset + (masked ? 4 : 0), offset + (masked ? 4 : 0) + length));
      if (masked) {
        const mask = this.buf.subarray(offset, offset + 4);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      }
      const fin = (this.buf[0] & 0x80) !== 0;
      this.buf = this.buf.subarray(offset + (masked ? 4 : 0) + length);
      if (opcode === 0x9) {
        this.socket.write(clientFrame(0x8a, payload));
        continue;
      }
      if (opcode === 0x8) {
        this.#emit('close');
        this.socket.end();
        continue;
      }
      if (opcode === 0x1 || opcode === 0x2 || opcode === 0x0) {
        this.frags.push(payload);
        if (!fin) continue;
        const full = Buffer.concat(this.frags);
        this.frags = [];
        this.#deliver(full);
      }
    }
  }

  #deliver(payload) {
    const listeners = this.#waiting.filter((waiter) => waiter.type === 'message');
    if (!listeners.length) {
      this.#messages.push(payload);
      return;
    }
    for (const waiter of listeners) waiter.fn({ data: payload });
  }
}

function clientFrame(first, payload) {
  const mask = randomBytes(4);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
  let header;
  if (payload.length < 126) {
    header = Buffer.from([first, 0x80 | payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = first;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = first;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  return Buffer.concat([header, mask, masked]);
}
