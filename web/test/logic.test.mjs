import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as L from '../lib.js';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('horizonAt interpolates and wraps', () => {
  const h = Array.from({ length: 360 }, (_, i) => i === 359 ? 4 : 0); h[0] = 2;
  assert.equal(L.horizonAt(h, 0), 2);
  assert.equal(L.horizonAt(h, 359.5), 3);
  assert.equal(L.horizonAt(h, -1), 4);
});
test('az-el vs horizon', () => {
  const h = new Array(360).fill(1); h[90] = 5;
  assert.equal(L.isVisible(3, 180, h), true);
  assert.equal(L.isVisible(3, 90, h), false);
  assert.equal(L.isVisible(1, 180, h), false); // equal is not above
});
test('nextTransition and countdown', () => {
  const s = Uint8Array.from([1, 1, 1, 0, 0, 1]);
  assert.deepEqual(L.nextTransition(s, 0, 60), { kind: 'set', idx: 3, minutes: 180 });
  assert.deepEqual(L.nextTransition(s, 3, 60), { kind: 'rise', idx: 5, minutes: 120 });
  assert.equal(L.nextTransition(s, 5, 60), null);
  assert.equal(L.formatCountdown(1500), '1d 1h 00m');
  assert.equal(L.formatCountdown(95), '1h 35m');
  assert.equal(L.formatCountdown(null), 'none in window');
});
test('stepIndex clamps, formatUtc', () => {
  const e = { start_utc: '2027-01-01T00:00:00Z', step_min: 60, n: 24 };
  assert.equal(L.stepIndex(e, Date.parse('2027-01-01T05:20:00Z')), 5);
  assert.equal(L.stepIndex(e, Date.parse('2030-01-01T00:00:00Z')), 23);
  assert.equal(L.formatUtc(Date.parse('2027-03-04T05:06:00Z')), '2027-03-04 05:06 UTC');
});
test('normalizeValidation shapes', () => {
  assert.equal(L.normalizeValidation(null).length, 0);
  assert.equal(L.normalizeValidation({ shackleton: { model: 0.1, published: 0.2, rel_error_pct: 50 } })[0].site, 'shackleton');
  assert.equal(L.normalizeValidation({ rows: [{ site: 'a', model: 1 }] })[0].model, 1);
});

// fake fetch backed by a file map
const fakeFetch = files => async u => {
  if (!(u in files)) return { ok: false, status: 404 };
  const v = files[u];
  return { ok: true, status: 200, json: async () => JSON.parse(v), arrayBuffer: async () => v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) };
};
test('loader prefers ../data/, falls back to ./data/ then ./mock/', async () => {
  const sj = JSON.stringify([{ id: 'x', dem_source: 'LOLA' }]);
  let r = await L.loadSites(fakeFetch({ '../data/sites.json': sj, './mock/sites.json': '[]' }));
  assert.equal(r.base, '../data/'); assert.equal(r.mock, false);
  r = await L.loadSites(fakeFetch({ './data/sites.json': sj }));
  assert.equal(r.base, './data/');
  r = await L.loadSites(fakeFetch({ './mock/sites.json': sj }));
  assert.equal(r.base, './mock/'); assert.equal(r.mock, true);
  await assert.rejects(L.loadSites(fakeFetch({})), /No data found/);
});
test('loadSiteData reports per-file errors without throwing', async () => {
  const r = await L.loadSiteData(fakeFetch({ 'b/horizon/x.json': JSON.stringify({ horizon_deg: new Array(360).fill(0) }) }), 'b/', 'x');
  assert.ok(r.horizon); assert.equal(r.dem, null); assert.equal(r.ephemeris, null);
  assert.ok(r.errors.dem && r.errors.ephemeris);
});
test('mock data obeys contract', async () => {
  const rd = f => JSON.parse(readFileSync(join(root, 'mock', f), 'utf8'));
  const sites = rd('sites.json'); assert.equal(sites.length, 3);
  for (const s of sites) {
    const dem = readFileSync(join(root, 'mock', s.dem_file));
    assert.equal(dem.length, s.dem_size_px ** 2 * 4);
    assert.ok(L.validateHorizon(rd(`horizon/${s.id}.json`)));
    const e = rd(`ephemeris/${s.id}.json`); assert.ok(L.validateEphemeris(e)); assert.equal(e.n, 8760);
    const h = rd(`horizon/${s.id}.json`).horizon_deg, sv = L.visibilitySeries(e, h, 'sun');
    const frac = sv.reduce((a, b) => a + b, 0) / sv.length;
    assert.ok(Math.abs(frac - rd('summary.json')[s.id].illumination_fraction) < 1e-3);
  }
  assert.equal(L.normalizeValidation(rd('validation.json')).length, 3);
});

// ---- Navigator / sonification ----
import { pitchHz } from '../sonify.js';
const real = id => {
  const d = join(root, '..', 'data'), rd = f => JSON.parse(readFileSync(join(d, f), 'utf8'));
  const b = readFileSync(join(d, 'dem', id + '.bin'));
  return { site: rd('sites.json').find(s => s.id === id), dem: new Float32Array(b.buffer, b.byteOffset, b.length / 4), eph: rd(`ephemeris/${id}.json`), hor: rd(`horizon/${id}.json`).horizon_deg, sum: rd('summary.json')[id] };
};
test('horizonFromDem at the centre reproduces the 10 km model run (sensitivity.json) and stays near the 30 km shipped summary', () => {
  // The navigator only has the 20 km window (10 km rays); the shipped site horizon/summary use 30 km rays (scripts/extend_range.py).
  const sens = JSON.parse(readFileSync(join(root, '..', 'data', 'sensitivity.json'), 'utf8')).sites;
  for (const id of ['shackleton', 'nobile', 'malapert']) {
    const r = real(id), c = r.site.dem_size_px / 2 - 0.5, ref = sens[id].by_range_2m['10.24'];
    const h = L.horizonFromDem(r.dem, r.site.dem_size_px, r.site.meters_per_px, c, c, 2);
    const s = L.seriesStats(r.eph, h);
    assert.ok(Math.abs(s.sun - ref.sun_frac) < 2e-3, id + ' sun ' + s.sun);
    assert.ok(Math.abs(s.earth - ref.earth_frac) < 2e-3);
    assert.equal(s.darkH, ref.longest_dark_h);
    assert.ok(Math.abs(s.sun - r.sum.illumination_fraction) < 0.03, id + ' 10 km vs 30 km sun gap');
    assert.ok(Math.abs(Math.max(...h) - Math.max(...r.hor)) < 7, id + ' max horizon gap');
  }
});
test('latLon <-> pixel round trip and centre', () => {
  const site = { lat: -85.3003, lon: 37.0989, dem_size_px: 512, meters_per_px: 40 };
  const p = L.latLonToPx(site, site.lat, site.lon);
  assert.ok(Math.abs(p.row - 255.5) < 1e-6 && Math.abs(p.col - 255.5) < 1e-6);
  const q = L.pxToLatLon(site, 100.3, 400.7), b = L.latLonToPx(site, q.lat, q.lon);
  assert.ok(Math.abs(b.row - 100.3) < 1e-3 && Math.abs(b.col - 400.7) < 1e-3);
  const pole = { lat: -89.6864, lon: 197.0629, dem_size_px: 512, meters_per_px: 40 }, q2 = L.pxToLatLon(pole, 50, 60), b2 = L.latLonToPx(pole, q2.lat, q2.lon);
  assert.ok(Math.abs(b2.row - 50) < 1e-2 && Math.abs(b2.col - 60) < 1e-2);
});
test('published patch sampling, ranking, csv, pitch', () => {
  const site = { dem_size_px: 512 }, bytes = new Uint8Array(513 * 513).fill(255); bytes[0] = 0;
  assert.equal(L.samplePublished(bytes, 513, site, 400, 400), 1);
  assert.equal(L.samplePublished(null, 256, site, 1, 1), null);
  assert.deepEqual(L.rankRows([{ score: 1 }, { score: 3 }, { score: 2 }]).map(r => r.score), [3, 2, 1]);
  assert.equal(L.toCsv([{ a: 'x,y', b: 2 }], [{ label: 'A', get: r => r.a }, { label: 'B', get: r => r.b }]), 'A,B\n"x,y",2\n');
  assert.equal(L.candidateGrid(512, 48)[0].row, 40);
  assert.equal(Math.round(pitchHz(-5)), 110); assert.equal(Math.round(pitchHz(9)), 880); assert.ok(pitchHz(3) > pitchHz(1));
});
test('rim points reading Earth 100%: truncated rays are flagged, centre is not', () => {
  assert.ok(Math.abs(L.rayLengthM(512, 40, 255.5, 255.5, 0) - 10220) < 1e-6);
  assert.ok(Math.abs(L.rayLengthM(512, 40, 100, 300, 90) - 211 * 40) < 1e-6);
  assert.equal(L.rayLengthM(512, 40, 0, 10, 0), 0);
  assert.ok(L.truncatedAz(512, 40, 255.5, 255.5).every(t => !t));
  assert.equal(L.sectorTruncated([160, 161], L.truncatedAz(512, 40, 424, 456)), true);
  // Shackleton (424, 456): Earth sector ray leaves the window at ~3.7 km, so ours reads far above NASA's map (~55%).
  // The model value itself is known to be wrong here, so only the gap and the flag are checked.
  const s = JSON.parse(readFileSync(join(root, '../data/sites.json'), 'utf8')).find(x => x.id === 'shackleton');
  const b = readFileSync(join(root, '../data/dem/shackleton.bin')), dem = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
  const eph = JSON.parse(readFileSync(join(root, '../data/ephemeris/shackleton.json'), 'utf8'));
  const st = L.seriesStats(eph, L.horizonFromDem(dem, 512, 40, 424, 456, 2));
  assert.equal(L.sectorTruncated(eph.earth_az, L.truncatedAz(512, 40, 424, 456)), true);
  const pub = new Uint8Array(readFileSync(join(root, '../data/published/shackleton_earth.bin')));
  const p = L.samplePublished(pub, 513, s, 424, 456);
  assert.ok(p < 0.7 && st.earth - p > 0.3, 'nasa ' + p);
  assert.equal(L.navScore({ sun: 0.5, earth: 1, darkH: 0 }, p), 0.5 * 0.5 + 0.5 * p); // score uses the lower Earth value
  assert.equal(L.navScore({ sun: 0.5, earth: 0.4, darkH: 0 }, 0.9), 0.45);
  // the Navigator's NASA patch must read the same value at the site as the Validation table (uint8 rounding only)
  for (const c of JSON.parse(readFileSync(join(root, '../data/validation.json'), 'utf8')).comparisons) {
    const key = c.quantity === 'illumination_fraction' ? 'sun' : 'earth';
    const pc = new Uint8Array(readFileSync(join(root, `../data/published/${c.site}_${key}.bin`)));
    assert.ok(Math.abs(L.samplePublished(pc, 513, s, 255.5, 255.5) - c.published_at_poi) < 0.004, c.site + ' ' + key);
  }
});
test('data/ passes integrity checks and CHECKSUMS match', async () => {
  const D = await import('../../scripts/check_data.mjs');
  assert.deepEqual(D.checkData(), []);
  assert.deepEqual(D.verifyChecksums(), []);
});

test('landingWindows: fractions, dark spell, incomplete tail', () => {
  const sun = new Uint8Array(24 * 20).fill(1), earth = new Uint8Array(24 * 20).fill(1);
  for (let i = 24 * 3; i < 24 * 3 + 10; i++) sun[i] = 0;       // 10 h dark on day 3
  for (let i = 0; i < 24 * 7; i++) earth[i] = 0;               // no Earth for the first 7 days
  const w = L.landingWindows(sun, earth, 60, 14);
  assert.equal(w.length, 20);
  assert.equal(w[0].darkH, 10); assert.ok(Math.abs(w[0].sun - (336 - 10) / 336) < 1e-12);
  assert.equal(w[0].earth, 0.5); assert.equal(w[0].noEarthH, 168); assert.equal(w[0].score, 0.5);
  assert.equal(w[6].noEarthH, 24); assert.equal(w[7], null);
});
test('topWindows is non-overlapping and ordered', () => {
  const mk = (day, score, darkH = 0) => ({ day, score, darkH });
  const t = L.topWindows([mk(0, .9), mk(1, .95), mk(20, .8), null, mk(5, .7)], 3, 14);
  assert.deepEqual(t.map(x => x.day), [1, 20]);
});
test('delayScenario flags best site at the delayed day', () => {
  const mk = score => ({ score });
  const by = { a: [mk(.9), mk(.2)], b: [mk(.1), mk(.6)], c: [mk(.5), null] };
  const r = L.delayScenario(by, 'a', 0, 1);
  assert.equal(r.planned.score, .9); assert.equal(r.bestId, 'b');
  assert.equal(r.delayed.find(x => x.id === 'c').w, null);
  assert.equal(L.delayScenario(by, 'a', 0, 5).bestId, null);
});

test('trekHint names the coordinates', () => {
  assert.match(L.trekHint(-89.9, 129.2), /-89\.9000, 129\.2000/);
  assert.ok(L.TREK_URL.startsWith('https://trek.nasa.gov/'));
});

test('multiyearNote reports the spread and tolerates missing data', () => {
  const my = { sites: { a: { years: { 2026: {}, 2034: {} }, spread_pts: { sun: 2.85, earth: 8.09 } } } };
  assert.match(L.multiyearNote(my, 'a'), /2026-2034.*2\.9 points.*8\.1 points/);
  assert.equal(L.multiyearNote(my, 'b'), '');
  assert.equal(L.multiyearNote(null, 'a'), '');
});
