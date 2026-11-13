// Generates SYNTHETIC "MOCK" data matching DATA_CONTRACT.md. Not real lunar data.
// Run: node web/mock/gen.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { visibilitySeries } from '../lib.js';
const out = dirname(fileURLToPath(import.meta.url));
for (const d of ['dem', 'horizon', 'ephemeris']) mkdirSync(join(out, d), { recursive: true });
const N = 128, MPP = 120, H = 2;
const defs = [
  { id: 'shackleton', name: 'Shackleton rim (MOCK)', lat: -89.9, lon: 129.2, seed: 1, rim: 260, amp: 1.2 },
  { id: 'nobile', name: 'Nobile rim (MOCK)', lat: -85.4, lon: 31.6, seed: 2, rim: 160, amp: 2.0 },
  { id: 'malapert', name: 'Malapert massif (MOCK)', lat: -86.0, lon: 0.0, seed: 3, rim: 80, amp: 3.0 }
];
const rnd = s => { let x = s; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; };
const summary = {}, sites = [];
const f3 = v => +v.toFixed(3);
for (const d of defs) {
  const r = rnd(d.seed * 977), ph = [r() * 6, r() * 6, r() * 6];
  const dem = new Float32Array(N * N);
  let mn = 1e9, mx = -1e9;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (x - N / 2) / (N / 2), dy = (y - N / 2) / (N / 2), rr = Math.hypot(dx, dy);
    let z = d.rim * rr * rr - 300;
    z += 40 * Math.sin(4 * dx + ph[0]) * Math.cos(3 * dy + ph[1]) + 15 * Math.sin(9 * dx + 7 * dy + ph[2]);
    dem[y * N + x] = z; mn = Math.min(mn, z); mx = Math.max(mx, z);
  }
  writeFileSync(join(out, 'dem', d.id + '.bin'), Buffer.from(dem.buffer));
  const c = N / 2, zc = dem[c * N + c] + H, hz = [];
  const at = (x, y) => dem[Math.min(N - 1, Math.max(0, Math.round(y))) * N + Math.min(N - 1, Math.max(0, Math.round(x)))];
  for (let a = 0; a < 360; a++) {
    const s = Math.sin(a * Math.PI / 180), co = Math.cos(a * Math.PI / 180);
    let best = -90;
    for (let k = 1; k < N / 2; k += 0.5) {
      const el = Math.atan2(at(c + k * s, c - k * co) - zc, k * MPP) * 180 / Math.PI;
      if (el > best) best = el;
    }
    hz.push(f3(best));
  }
  writeFileSync(join(out, 'horizon', d.id + '.json'), JSON.stringify({ id: d.id, az_step_deg: 1, observer_height_m: H, max_range_km: +(N / 2 * MPP / 1000).toFixed(2), source: 'MOCK synthetic', horizon_deg: hz }));
  const n = 365 * 24;
  const e = { id: d.id, start_utc: '2027-01-01T00:00:00Z', step_min: 60, n, source: 'MOCK synthetic (not JPL Horizons)', sun_az: [], sun_el: [], earth_az: [], earth_el: [] };
  for (let i = 0; i < n; i++) {
    const t = i / 24;
    e.sun_az.push(f3((((t / 29.53 * 360 + d.seed * 40) % 360) + 360) % 360));
    e.sun_el.push(f3(d.amp * Math.sin(2 * Math.PI * t / 365.25 + d.seed) + 1.5 * Math.cos(2 * Math.PI * t / 29.53)));
    e.earth_az.push(f3((((100 + d.seed * 30 + 25 * Math.sin(2 * Math.PI * t / 27.32)) % 360) + 360) % 360));
    e.earth_el.push(f3(5 * Math.sin(2 * Math.PI * t / 27.32 + d.seed) + 3 * Math.sin(2 * Math.PI * t / 365.25)));
  }
  writeFileSync(join(out, 'ephemeris', d.id + '.json'), JSON.stringify(e));
  const run = (s, v) => { let best = 0, cur = 0; for (const x of s) { if (x === v) { cur++; best = Math.max(best, cur); } else cur = 0; } return best; };
  const sv = visibilitySeries(e, hz, 'sun'), ev = visibilitySeries(e, hz, 'earth');
  const frac = s => s.reduce((a, b) => a + b, 0) / s.length;
  const up = e.sun_el.filter((_, i) => sv[i]);
  summary[d.id] = { illumination_fraction: +frac(sv).toFixed(4), longest_dark_hours: run(sv, 0), earth_visible_fraction: +frac(ev).toFixed(4), longest_no_earth_hours: run(ev, 0), mean_sun_el_when_up: f3(up.reduce((a, b) => a + b, 0) / (up.length || 1)) };
  sites.push({ id: d.id, name: d.name, lat: d.lat, lon: d.lon, dem_file: 'dem/' + d.id + '.bin', dem_size_px: N, meters_per_px: MPP, elev_min_m: mn, elev_max_m: mx, dem_source: 'MOCK synthetic DEM', dem_url: '' });
}
writeFileSync(join(out, 'sites.json'), JSON.stringify(sites, null, 1));
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 1));
const val = defs.map(d => { const m = summary[d.id].illumination_fraction, p = +(m * 0.93 + 0.02).toFixed(4); return { site: d.id, metric: 'illumination_fraction', model: m, published: p, abs_error: +Math.abs(m - p).toFixed(4), rel_error_pct: +(Math.abs(m - p) / p * 100).toFixed(2), source: 'MOCK - not a real publication' }; });
writeFileSync(join(out, 'validation.json'), JSON.stringify(val, null, 1));
console.log(JSON.stringify(summary));
