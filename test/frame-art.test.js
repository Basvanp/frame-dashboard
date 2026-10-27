import assert from 'node:assert/strict';
import test from 'node:test';
import { artModeValue, buildUploadFrame, isArtReply, parseFrame } from '../lib/frame-art.js';

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

test('image_added is not a reply to get_artmode_status', () => {
  const added = { event: 'image_added', content_id: 'MY_F0102' };
  assert.equal(isArtReply(added, { id: 'req-1', request: 'get_artmode_status' }), false);
  assert.equal(isArtReply({ event: 'artmode_status', value: 'on' }, { id: 'req-1', request: 'get_artmode_status' }), true);
  assert.equal(isArtReply({ value: 'on' }, { id: 'req-1', request: 'get_artmode_status' }), true);
});

test('art mode reads on from a few firmware shapes', () => {
  assert.equal(artModeValue({ value: 'on' }), 'on');
  assert.equal(artModeValue({ value: true }), 'on');
  assert.equal(artModeValue({ art_mode: 'ON' }), 'on');
  assert.equal(artModeValue({ event: 'image_added', content_id: 'MY_F0102' }), 'off');
});
