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
    published: pick(r, 'published', 'published_value', 'reference', 'nasa'),
    abs_error: pick(r, 'abs_error', 'absolute_error', 'abs_err'),
    rel_error_pct: pick(r, 'rel_error_pct', 'relative_error_pct', 'rel_error_percent', 'rel_error'),
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
