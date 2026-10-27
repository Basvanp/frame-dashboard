import assert from 'node:assert/strict';
import test from 'node:test';
import { weatherKind } from '../lib/weather.js';

test('weather codes become the icons the placard draws', () => {
  assert.equal(weatherKind(0), 'clear');
  assert.equal(weatherKind(1), 'mainly');
  assert.equal(weatherKind(2), 'partly');
  assert.equal(weatherKind(3), 'cloudy');
  assert.equal(weatherKind(45), 'fog');
  assert.equal(weatherKind(51), 'drizzle');
  assert.equal(weatherKind(61), 'rain');
  assert.equal(weatherKind(71), 'snow');
  assert.equal(weatherKind(80), 'showers');
  assert.equal(weatherKind(95), 'storm');
  assert.equal(weatherKind(999), 'cloudy');
});
