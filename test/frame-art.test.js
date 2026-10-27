import assert from 'node:assert/strict';
import test from 'node:test';
import { buildUploadFrame, parseFrame } from '../lib/frame-art.js';

test('upload frame is a length, a send_image header, then the JPEG', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const frame = buildUploadFrame(jpeg, 'abc', 'none');
  const headerLen = frame.readUInt16BE(0);
  const header = JSON.parse(frame.subarray(2, 2 + headerLen).toString('utf8'));
  const inner = JSON.parse(header.params.data);
  assert.equal(header.method, 'ms.channel.emit');
  assert.equal(header.params.event, 'art_app_request');
  assert.equal(inner.request, 'send_image');
  assert.equal(inner.file_type, 'JPEG');
  assert.equal(inner.matte_id, 'none');
  assert.equal(inner.id, 'abc');
  assert.deepEqual([...frame.subarray(2 + headerLen)], [...jpeg]);
});

test('a TV frame can carry a binary tail after the JSON', () => {
  const json = Buffer.from('{"event":"d2d_service_message","data":"{}"}');
  const tail = Buffer.from([0xff, 0xd8]);
  const frame = parseFrame(Buffer.concat([json, tail]));
  assert.equal(frame.event, 'd2d_service_message');
  assert.deepEqual([...frame.binary], [0xff, 0xd8]);
});
