import assert from 'node:assert/strict';
import test from 'node:test';
import { hmFromIso, shapeWeather, weatherKind } from '../lib/weather.js';

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

test('Open-Meteo sunset stays in the dashboard zone, not the server\'s', () => {
  assert.deepEqual(hmFromIso('2026-10-28T16:47'), { hour: 16, minute: 47 });
  assert.equal(hmFromIso('nope'), null);
});

test('the placard gets high, low, rain chance and sunset from the daily block', () => {
  const w = shapeWeather({
    current: { temperature_2m: 11.6, weather_code: 0 },
    daily: {
      time: ['2026-10-28'],
      weather_code: [61],
      temperature_2m_max: [16.2],
      temperature_2m_min: [6.4],
      precipitation_probability_max: [40],
      sunset: ['2026-10-28T16:47'],
    },
  });
  assert.equal(w.temp, 12);
  assert.equal(w.kind, 'rain');
  assert.equal(w.high, 16);
  assert.equal(w.low, 6);
  assert.equal(w.rain, 40);
  assert.equal(w.sunsetHour, 16);
  assert.equal(w.sunsetMinute, 47);
});
