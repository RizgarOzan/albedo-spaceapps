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
