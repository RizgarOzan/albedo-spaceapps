// Pure logic (no DOM, no three.js) so it can be unit-tested in node.
export const BASES = ['../data/', './data/', './mock/'];

// horizon: array of 360 elevation angles (deg), index = azimuth deg.
export function horizonAt(horizon, az) {
  const n = horizon.length;
  const a = ((az % 360) + 360) % 360 * (n / 360);
  const i = Math.floor(a) % n, j = (i + 1) % n, f = a - Math.floor(a);
  return horizon[i] * (1 - f) + horizon[j] * f;
}

// Above the local terrain horizon at that azimuth?
export function isVisible(el, az, horizon) {
  return el > horizonAt(horizon, az);
}

export function stepIndex(eph, tMs) {
  const t0 = Date.parse(eph.start_utc);
  const i = Math.round((tMs - t0) / (eph.step_min * 60000));
  return Math.max(0, Math.min(eph.n - 1, i));
}

export function visibilitySeries(eph, horizon, body) {
  const el = eph[body + '_el'], az = eph[body + '_az'];
  const out = new Uint8Array(eph.n);
  for (let i = 0; i < eph.n; i++) out[i] = isVisible(el[i], az[i], horizon) ? 1 : 0;
  return out;
}

// Next change of state after index i. Returns {kind:'set'|'rise', idx, minutes} or null.
export function nextTransition(series, i, stepMin) {
  const cur = series[i];
  for (let j = i + 1; j < series.length; j++) {
    if (series[j] !== cur) return { kind: cur ? 'set' : 'rise', idx: j, minutes: (j - i) * stepMin };
  }
  return null;
}

export function formatCountdown(min) {
  if (min == null) return 'none in window';
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = Math.round(min % 60);
  return (d ? d + 'd ' : '') + h + 'h ' + String(m).padStart(2, '0') + 'm';
}

export function formatUtc(ms) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

export function validateEphemeris(e) {
  return !!e && e.n > 0 && ['sun_az', 'sun_el', 'earth_az', 'earth_el'].every(k => Array.isArray(e[k]) && e[k].length === e.n);
}
export function validateHorizon(h) {
  return !!h && Array.isArray(h.horizon_deg) && h.horizon_deg.length === 360;
}

// Tolerant normaliser: array of rows, {rows|results|comparisons:[..]}, or object keyed by site id.
export function normalizeValidation(v) {
  let rows = [];
  if (Array.isArray(v)) rows = v;
  else if (v && typeof v === 'object') {
    const arr = v.rows || v.results || v.comparisons || v.validations;
    if (Array.isArray(arr)) rows = arr;
    else for (const [k, val] of Object.entries(v)) {
      if (Array.isArray(val)) val.forEach(r => rows.push({ site: k, ...r }));
      else if (val && typeof val === 'object') rows.push({ site: k, ...val });
    }
  }
  const pick = (r, ...ks) => { for (const k of ks) if (r[k] !== undefined) return r[k]; return null; };
  return rows.filter(r => r && typeof r === 'object').map(r => ({
    site: pick(r, 'site', 'id', 'site_id'),
    metric: pick(r, 'metric', 'quantity', 'name') || 'illumination_fraction',
    model: pick(r, 'model', 'model_value', 'ours', 'modelled'),
    published: pick(r, 'published', 'published_value', 'published_at_poi', 'reference', 'nasa'),
    abs_error: pick(r, 'abs_error', 'absolute_error', 'abs_err'),
    rel_error_pct: pick(r, 'rel_error_pct', 'rel_err_pct', 'relative_error_pct', 'rel_error_percent', 'rel_error'),
    source: pick(r, 'source', 'citation', 'reference_source'),
    note: pick(r, 'note', 'notes', 'comment')
  }));
}

async function getJson(fetchFn, url) {
  const r = await fetchFn(url);
  if (!r.ok) throw new Error(url + ' -> ' + r.status);
  return r.json();
}

// Try each base for sites.json; the first base that has it is used for everything.
// Mock mode = the base is ./mock/ (or the data says MOCK).
export async function loadSites(fetchFn, bases = BASES) {
  const errors = [];
  for (const base of bases) {
    try {
      const sites = await getJson(fetchFn, base + 'sites.json');
      const list = Array.isArray(sites) ? sites : sites.sites;
      if (!Array.isArray(list) || !list.length) throw new Error('empty sites.json');
      const mock = base.includes('mock') || list.some(s => /mock/i.test(s.dem_source || ''));
      return { base, sites: list, mock };
    } catch (e) { errors.push(String(e.message || e)); }
  }
  throw new Error('No data found. Tried: ' + errors.join('; '));
}

export async function loadSiteData(fetchFn, base, id) {
  const res = { dem: null, horizon: null, ephemeris: null, errors: {} };
  const tasks = {
    dem: async () => { const r = await fetchFn(base + 'dem/' + id + '.bin'); if (!r.ok) throw new Error('dem ' + r.status); return new Float32Array(await r.arrayBuffer()); },
    horizon: async () => { const h = await getJson(fetchFn, base + 'horizon/' + id + '.json'); if (!validateHorizon(h)) throw new Error('bad horizon'); return h; },
    ephemeris: async () => { const e = await getJson(fetchFn, base + 'ephemeris/' + id + '.json'); if (!validateEphemeris(e)) throw new Error('bad ephemeris'); return e; }
  };
  await Promise.all(Object.entries(tasks).map(async ([k, f]) => {
    try { res[k] = await f(); } catch (e) { res.errors[k] = String(e.message || e); }
  }));
  return res;
}

export async function loadOptional(fetchFn, base, file) {
  try { return await getJson(fetchFn, base + file); } catch (e) { return null; }
}

// ---- Navigator: horizon from the DEM at any pixel, per-point statistics, ranking, CSV ----
export const R_MOON = 1737400;

// Max terrain elevation angle (deg) per integer azimuth from fractional pixel (row, col); same maths as scripts/lunar.py horizon().
export function horizonFromDem(dem, n, mpp, row, col, obsH = 2, R = R_MOON) {
  const out = new Float64Array(360);
  const bil = (y, x) => {
    const y0 = Math.min(Math.floor(y), n - 2), x0 = Math.min(Math.floor(x), n - 2), ty = y - y0, tx = x - x0;
    return dem[y0 * n + x0] * (1 - ty) * (1 - tx) + dem[y0 * n + x0 + 1] * (1 - ty) * tx + dem[(y0 + 1) * n + x0] * ty * (1 - tx) + dem[(y0 + 1) * n + x0 + 1] * ty * tx;
  };
  const z0 = bil(row, col) + obsH;
  for (let az = 0; az < 360; az++) {
    const a = az * Math.PI / 180, s = Math.sin(a), c = Math.cos(a);
    let best = -Infinity;
    for (let k = 1; ; k++) {
      const d = k * mpp * 0.5, r = row - d * c / mpp, q = col + d * s / mpp;
      if (r < 0 || q < 0 || r > n - 1 || q > n - 1) break;
      const ang = Math.atan2(bil(r, q) - d * d / (2 * R) - z0, d) * 180 / Math.PI;
      if (ang > best) best = ang;
    }
    out[az] = best === -Infinity ? 0 : best;
  }
  return out;
}

// Rays shorter than this (m) hit the DEM window edge before the usual 10 km horizon range, so terrain beyond is unknown.
export const FULL_RANGE_M = 10000;
// Distance (m) from fractional pixel (row, col) to the DEM window edge along azimuth az (deg).
export function rayLengthM(n, mpp, row, col, az) {
  const a = az * Math.PI / 180, dr = -Math.cos(a), dc = Math.sin(a);
  const lim = (p, d) => d > 1e-12 ? (n - 1 - p) / d : d < -1e-12 ? -p / d : Infinity;
  return Math.max(0, Math.min(lim(row, dr), lim(col, dc))) * mpp;
}
// bool[360]: azimuths whose horizon ray is cut short by the window edge. Terrain beyond is unknown, so the horizon there is biased
// low and Sun/Earth look too visible (Shackleton: truncated Earth sectors read +0.10 high vs NASA; Malapert's real massif horizon does not).
export function truncatedAz(n, mpp, row, col) {
  return Array.from({ length: 360 }, (_, az) => rayLengthM(n, mpp, row, col, az) < FULL_RANGE_M);
}
// True if any azimuth the body visits (deg, any length) lies in a truncated ray (within 1 deg).
export function sectorTruncated(azSeries, truncated) {
  const seen = new Set(); for (let i = 0; i < azSeries.length; i++) seen.add(Math.round(((azSeries[i] % 360) + 360) % 360) % 360);
  for (const a of seen) if (truncated[a] || truncated[(a + 1) % 360] || truncated[(a + 359) % 360]) return true;
  return false;
}

// Local ENU frame of a site (north up, row 0 = north), azimuthal-equidistant about (lat, lon) like scripts/lunar.py.
export function latLonToPx(site, lat, lon) {
  const d = Math.PI / 180, p0 = site.lat * d, p = lat * d, dl = (lon - site.lon) * d;
  const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(dl);
  const c = Math.acos(Math.max(-1, Math.min(1, cosc))), k = c < 1e-9 ? 1 : c / Math.sin(c);
  const east = R_MOON * k * Math.cos(p) * Math.sin(dl);
  const north = R_MOON * k * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(dl));
  const half = site.dem_size_px * site.meters_per_px / 2;
  return { row: (half - north) / site.meters_per_px - 0.5, col: (east + half) / site.meters_per_px - 0.5, east, north };
}
export function pxToLatLon(site, row, col) {
  const d = Math.PI / 180, half = site.dem_size_px * site.meters_per_px / 2;
  const east = (col + 0.5) * site.meters_per_px - half, north = half - (row + 0.5) * site.meters_per_px;
  const s = Math.hypot(east, north) / R_MOON, az = Math.atan2(east, north), p0 = site.lat * d, l0 = site.lon * d;
  const lat = Math.asin(Math.sin(p0) * Math.cos(s) + Math.cos(p0) * Math.sin(s) * Math.cos(az));
  const lon = l0 + Math.atan2(Math.sin(az) * Math.sin(s) * Math.cos(p0), Math.cos(s) - Math.sin(p0) * Math.sin(lat));
  return { lat: lat / d, lon: (((lon / d) % 360) + 360) % 360 };
}

// Sun/Earth fractions and longest dark / no-Earth spell for a horizon profile (same definitions as summary.json).
export function seriesStats(eph, horizon) {
  const run = s => { let best = 0, cur = 0; for (let i = 0; i < s.length; i++) { cur = s[i] ? 0 : cur + 1; if (cur > best) best = cur; } return best; };
  const sun = visibilitySeries(eph, horizon, 'sun'), earth = visibilitySeries(eph, horizon, 'earth');
  const sum = s => s.reduce((a, b) => a + b, 0), h = eph.step_min / 60;
  return { sun: sum(sun) / eph.n, earth: sum(earth) / eph.n, darkH: run(sun) * h, noEarthH: run(earth) * h, sunSeries: sun, earthSeries: earth };
}

// Sample a uint8 published-fraction patch (size x size, spans the DEM window) at a DEM pixel; null if no patch.
export function samplePublished(bytes, size, site, row, col) {
  if (!bytes || bytes.length !== size * size) return null;
  const f = size / site.dem_size_px, y = (row + 0.5) * f - 0.5, x = (col + 0.5) * f - 0.5;
  if (y < 0 || x < 0 || y > size - 1 || x > size - 1) return null;
  const y0 = Math.min(Math.floor(y), size - 2), x0 = Math.min(Math.floor(x), size - 2), ty = y - y0, tx = x - x0;
  const g = (r, c) => bytes[r * size + c];
  return (g(y0, x0) * (1 - ty) * (1 - tx) + g(y0, x0 + 1) * (1 - ty) * tx + g(y0 + 1, x0) * ty * (1 - tx) + g(y0 + 1, x0 + 1) * ty * tx) / 255;
}

export const NAV_MARGIN_PX = 40;
// Candidate grid points (row, col), at least NAV_MARGIN_PX from the DEM edge so rays have range.
export function candidateGrid(n, stride) {
  const pts = [];
  for (let r = NAV_MARGIN_PX; r <= n - 1 - NAV_MARGIN_PX; r += stride) for (let c = NAV_MARGIN_PX; c <= n - 1 - NAV_MARGIN_PX; c += stride) pts.push({ row: r, col: c });
  return pts;
}

export function rankRows(rows, key = 'score') {
  return rows.slice().sort((a, b) => b[key] - a[key]);
}
// Simple landing-site score: sunlit fraction and Earth (comms) fraction weighted equally, short darkness is a tiebreak.
// Our Earth fraction is an upper bound (terrain beyond the 20 km window is missing and Earth sits only a few degrees up),
// so when a NASA Earth value is known the lower of the two is used.
export function navScore(st, pubEarth = null) { const e = pubEarth == null ? st.earth : Math.min(st.earth, pubEarth); return 0.5 * st.sun + 0.5 * e - st.darkH / 8760 * 0.1; }

export function toCsv(rows, cols) {
  const q = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.map(c => q(c.label)).join(','), ...rows.map(r => cols.map(c => q(c.get(r))).join(','))].join('\n') + '\n';
}

// ---- Landing window planner: stats for the WINDOW_DAYS after each possible landing day ----
export const WINDOW_DAYS = 14; // one lunar daylight period is about 14.8 days
// Combined power + comms score: the weaker of the two fractions (a site is only as good as its worse side).
export const windowScore = w => Math.min(w.sun, w.earth);
// One entry per UTC day of the series: Sun/Earth fraction and longest dark / no-Earth spell over the next `days` days.
// null when the window would run past the end of the data (no extrapolation).
export function landingWindows(sunSeries, earthSeries, stepMin, days = WINDOW_DAYS) {
  const per = 1440 / stepMin, len = days * per, n = sunSeries.length, h = stepMin / 60;
  return Array.from({ length: Math.floor(n / per) }, (_, day) => {
    const a = day * per, b = a + len;
    if (b > n) return null;
    let s = 0, e = 0, ds = 0, de = 0, ms = 0, me = 0;
    for (let i = a; i < b; i++) {
      s += sunSeries[i]; e += earthSeries[i];
      ds = sunSeries[i] ? 0 : ds + 1; de = earthSeries[i] ? 0 : de + 1;
      if (ds > ms) ms = ds; if (de > me) me = de;
    }
    const w = { day, sun: s / len, earth: e / len, darkH: ms * h, noEarthH: me * h };
    w.score = windowScore(w);
    return w;
  });
}
// Best k windows by score, non-overlapping (start days at least `days` apart); ties go to the shorter dark spell, then the earlier day.
export function topWindows(wins, k = 5, days = WINDOW_DAYS) {
  const order = wins.filter(Boolean).sort((a, b) => b.score - a.score || a.darkH - b.darkH || a.day - b.day), out = [];
  for (const w of order) { if (out.every(o => Math.abs(o.day - w.day) >= days)) out.push(w); if (out.length === k) break; }
  return out;
}
// Slip the landing by delayDays: every site's window on the delayed day, best score flagged (planned = the original day at siteId).
export function delayScenario(winsBySite, siteId, day, delayDays) {
  const rows = Object.entries(winsBySite).map(([id, wins]) => ({ id, w: wins[day + delayDays] || null }));
  const ok = rows.filter(r => r.w), best = ok.length ? ok.reduce((a, b) => b.w.score > a.w.score ? b : a) : null;
  return { planned: (winsBySite[siteId] || [])[day] || null, delayed: rows, bestId: best ? best.id : null };
}
