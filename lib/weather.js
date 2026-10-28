// Today's weather for the corner of the clock. Open-Meteo needs no key.
// The icon is the day's forecast (the daily code); the number is the
// temperature outside right now. High, low, rain chance and sunset go with
// it so the wall can follow the light. A miss must not take the week down.

const CACHE_MS = 10 * 60 * 1000;
let cache = null;

export function weatherKind(code) {
  const c = Number(code);
  if (c === 0) return 'clear';
  if (c === 1) return 'mainly';
  if (c === 2) return 'partly';
  if (c === 3) return 'cloudy';
  if (c === 45 || c === 48) return 'fog';
  if (c === 51 || c === 53 || c === 55) return 'drizzle';
  if (c === 56 || c === 57 || c === 66 || c === 67) return 'freeze';
  if (c === 61 || c === 63 || c === 65) return 'rain';
  if (c === 71 || c === 73 || c === 75 || c === 77) return 'snow';
  if (c === 80 || c === 81 || c === 82) return 'showers';
  if (c === 85 || c === 86) return 'snow';
  if (c === 95 || c === 96 || c === 99) return 'storm';
  return 'cloudy';
}

// Castricum, Noord-Holland. DASHBOARD_LAT/LON overrides this.
const CASTRICUM = { lat: 52.54833, lon: 4.66944 };

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'frame-dashboard' },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`weather ${res.status}`);
  return res.json();
}

function point() {
  const lat = Number(process.env.DASHBOARD_LAT);
  const lon = Number(process.env.DASHBOARD_LON);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  return CASTRICUM;
}

// Open-Meteo already shifted sunrise/sunset into `timezone`. The time part
// is what the wall compares against localParts(), so we keep hour and minute
// and never parse the string as the server's zone.
export function hmFromIso(iso) {
  const m = String(iso || '').match(/T(\d{2}):(\d{2})/);
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function shapeWeather(data) {
  const cur = data && data.current;
  if (!cur || cur.temperature_2m == null) return null;
  const daily = data.daily || {};
  const code = daily.weather_code ? daily.weather_code[0] : cur.weather_code;
  const sunset = hmFromIso(daily.sunset && daily.sunset[0]);
  return {
    temp: Math.round(cur.temperature_2m),
    code,
    kind: weatherKind(code),
    high: num(daily.temperature_2m_max && daily.temperature_2m_max[0]),
    low: num(daily.temperature_2m_min && daily.temperature_2m_min[0]),
    rain: num(daily.precipitation_probability_max && daily.precipitation_probability_max[0]),
    sunsetHour: sunset ? sunset.hour : null,
    sunsetMinute: sunset ? sunset.minute : null,
    date: (daily.time && daily.time[0]) || null,
  };
}

async function fetchWeather(tz) {
  const p = point();
  if (!p) return null;
  const q = new URLSearchParams({
    latitude: String(p.lat),
    longitude: String(p.lon),
    current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset',
    timezone: tz,
    forecast_days: '1',
  });
  return shapeWeather(await getJson(`https://api.open-meteo.com/v1/forecast?${q}`));
}

export async function loadWeather(tz) {
  const key = `${tz}|${process.env.DASHBOARD_LAT || ''}|${process.env.DASHBOARD_LON || ''}`;
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const value = await fetchWeather(tz);
    cache = { key, at: Date.now(), value };
    return value;
  } catch {
    return cache && cache.key === key ? cache.value : null;
  }
}
