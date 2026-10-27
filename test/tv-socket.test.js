import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { openTvSocket } from '../lib/tv-socket.js';

test('the TV socket does not offer permessage-deflate and reads a text frame', async () => {
  let request = '';
  const server = net.createServer((socket) => {
    const chunks = [];
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      if (!buf.includes('\r\n\r\n')) return;
      request = buf.toString('utf8');
      const key = request.match(/Sec-WebSocket-Key: (.+)\r\n/)[1];
      const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
      const payload = Buffer.from('{"event":"ms.channel.connect","data":{"token":"t"}}');
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
      );
      socket.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const ws = await openTvSocket(`ws://127.0.0.1:${port}/api/v2/channels/samsung.remote.control?name=abc`);
  const message = await new Promise((resolve) => {
    ws.addEventListener('message', (ev) => resolve(Buffer.from(ev.data).toString('utf8')));
    ws.start();
  });
  assert.equal(request.includes('permessage-deflate'), false);
  assert.match(request, /Upgrade: websocket/);
  assert.match(message, /ms\.channel\.connect/);
  ws.close();
  server.close();
});
