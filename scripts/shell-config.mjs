// Writes the dashboard URL into both TV shells from DASHBOARD_URL
// (e.g. https://your-app.vercel.app/?k=your-read-key&lang=es).
//   tizen/dashboard-url.js        loaded by the Tizen shell
//   android/dashboard.properties  read by Gradle into BuildConfig
// Both files are gitignored: the URL carries your read key.

import { writeFileSync } from 'node:fs';

const url = process.env.DASHBOARD_URL;
if (!url || !/^https?:\/\//.test(url)) {
  console.error('Set DASHBOARD_URL in .env.local first, e.g. https://your-app.vercel.app/?k=READ_KEY');
  process.exit(1);
}

writeFileSync('tizen/dashboard-url.js', `window.DASHBOARD_URL = ${JSON.stringify(url)};\n`);
writeFileSync('android/dashboard.properties', `dashboardUrl=${url.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`);
console.log('Wrote tizen/dashboard-url.js and android/dashboard.properties');
