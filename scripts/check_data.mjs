// Data integrity: size / NaN / range / schema checks for data/, plus data/CHECKSUMS (sha256).
//   node scripts/check_data.mjs          verify (exit 1 on any problem)
//   node scripts/check_data.mjs --write  rewrite data/CHECKSUMS after the data changed
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const SUBDIRS = ['dem', 'horizon', 'ephemeris', 'published'];
const TOP = ['sites.json', 'summary.json', 'validation.json', 'validation_band.json'];

const sha = buf => createHash('sha256').update(buf).digest('hex');
const finite = a => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false; return true; };
const inRange = (a, lo, hi) => { for (let i = 0; i < a.length; i++) if (a[i] < lo || a[i] > hi) return false; return true; };

export function listDataFiles(root = DEFAULT_ROOT) {
  const files = TOP.filter(f => existsSync(join(root, f)));
  for (const d of SUBDIRS) if (existsSync(join(root, d))) for (const f of readdirSync(join(root, d)).sort()) files.push(d + '/' + f);
  return files;
}

export function checkData(root = DEFAULT_ROOT) {
  const errs = [], err = (f, m) => errs.push(f + ': ' + m);
  const json = f => { try { return JSON.parse(readFileSync(join(root, f), 'utf8')); } catch (e) { err(f, 'unreadable JSON (' + e.message + ')'); return null; } };
  const sitesRaw = json('sites.json'), sites = Array.isArray(sitesRaw) ? sitesRaw : sitesRaw && sitesRaw.sites;
  if (!Array.isArray(sites) || !sites.length) { err('sites.json', 'no sites'); return errs; }
  const summary = json('summary.json');
  for (const s of sites) {
    for (const k of ['id', 'lat', 'lon', 'dem_size_px', 'meters_per_px', 'elev_min_m', 'elev_max_m']) if (s[k] == null) err('sites.json', s.id + ' missing ' + k);
    const n = s.dem_size_px;
    if (!(s.lat >= -90 && s.lat <= 90) || !(s.lon >= 0 && s.lon <= 360)) err('sites.json', s.id + ' lat/lon out of range');
    // DEM: n*n float32, finite, inside the elevation span recorded in sites.json
    const demF = 'dem/' + s.id + '.bin';
    if (!existsSync(join(root, demF))) err(demF, 'missing');
    else {
      const b = readFileSync(join(root, demF));
      if (b.length !== n * n * 4) err(demF, 'size ' + b.length + ' != ' + n * n * 4);
      else {
        const d = new Float32Array(b.buffer, b.byteOffset, n * n);
        if (!finite(d)) err(demF, 'NaN/Inf in DEM');
        else if (!inRange(d, s.elev_min_m - 1, s.elev_max_m + 1)) err(demF, 'values outside sites.json elev_min/max_m');
      }
    }
    // horizon: 360 finite angles in [-90, 90]
    const hF = 'horizon/' + s.id + '.json', h = existsSync(join(root, hF)) ? json(hF) : (err(hF, 'missing'), null);
    if (h) {
      if (!Array.isArray(h.horizon_deg) || h.horizon_deg.length !== 360) err(hF, 'horizon_deg is not 360 long');
      else if (!finite(h.horizon_deg) || !inRange(h.horizon_deg, -90, 90)) err(hF, 'horizon_deg NaN or outside [-90, 90]');
    }
    // ephemeris: parallel arrays of length n, finite, az in [0, 360], el in [-90, 90]
    const eF = 'ephemeris/' + s.id + '.json', e = existsSync(join(root, eF)) ? json(eF) : (err(eF, 'missing'), null);
    if (e) {
      for (const k of ['sun_az', 'sun_el', 'earth_az', 'earth_el']) {
        const a = e[k], az = k.endsWith('az');
        if (!Array.isArray(a) || a.length !== e.n) err(eF, k + ' length != n');
        else if (!finite(a)) err(eF, k + ' has NaN/Inf');
        else if (!inRange(a, az ? 0 : -90, az ? 360 : 90)) err(eF, k + ' out of range');
      }
      if (!(e.step_min > 0) || Number.isNaN(Date.parse(e.start_utc))) err(eF, 'bad step_min/start_utc');
    }
    // published patches: 513*513 uint8 (PUB in navigator.js), optional
    for (const f of ['sun', 'earth']) {
      const pF = 'published/' + s.id + '_' + f + '.bin';
      if (existsSync(join(root, pF)) && readFileSync(join(root, pF)).length !== 513 * 513) err(pF, 'size != 263169');
    }
    // summary fractions in [0, 1], hours within the year
    const m = summary && summary[s.id];
    if (!m) err('summary.json', 'no entry for ' + s.id);
    else for (const [k, v] of Object.entries(m)) {
      if (!Number.isFinite(v)) err('summary.json', s.id + '.' + k + ' not finite');
      else if (/fraction/.test(k) && (v < 0 || v > 1)) err('summary.json', s.id + '.' + k + ' outside [0, 1]');
      else if (/hours/.test(k) && (v < 0 || v > 8760)) err('summary.json', s.id + '.' + k + ' outside [0, 8760]');
    }
  }
  // validation.json: comparisons with the columns the Validation tab reads
  const v = json('validation.json');
  if (v) {
    if (!Array.isArray(v.comparisons) || !v.comparisons.length) err('validation.json', 'no comparisons');
    else for (const c of v.comparisons) for (const k of ['site', 'quantity', 'modelled', 'published_at_poi', 'abs_err', 'rel_err_pct']) {
      const text = k === 'site' || k === 'quantity';
      if (c[k] == null || (!text && !Number.isFinite(c[k]))) err('validation.json', (c.site || '?') + ' bad ' + k);
    }
  }
  const vb = json('validation_band.json');
  if (vb && (!vb.sites || !Object.keys(vb.sites).length)) err('validation_band.json', 'no sites');
  return errs;
}

export function checksumText(root = DEFAULT_ROOT) {
  return listDataFiles(root).map(f => sha(readFileSync(join(root, f))) + '  ' + f).join('\n') + '\n';
}

// Compare data/CHECKSUMS with the files on disk; returns a list of problems.
export function verifyChecksums(root = DEFAULT_ROOT) {
  const p = join(root, 'CHECKSUMS');
  if (!existsSync(p)) return ['CHECKSUMS missing (run: node scripts/check_data.mjs --write)'];
  const want = new Map(readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map(l => { const i = l.indexOf('  '); return [l.slice(i + 2), l.slice(0, i)]; }));
  const errs = [];
  for (const f of listDataFiles(root)) {
    if (!want.has(f)) errs.push(f + ': not in CHECKSUMS');
    else if (want.get(f) !== sha(readFileSync(join(root, f)))) errs.push(f + ': sha256 mismatch');
    want.delete(f);
  }
  for (const f of want.keys()) errs.push(f + ': listed in CHECKSUMS but missing');
  return errs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errs = checkData();
  if (process.argv.includes('--write')) {
    if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
    writeFileSync(join(DEFAULT_ROOT, 'CHECKSUMS'), checksumText());
    console.log('wrote data/CHECKSUMS (' + listDataFiles().length + ' files)');
  } else {
    errs.push(...verifyChecksums());
    console.log(errs.length ? errs.join('\n') : 'data OK (' + listDataFiles().length + ' files)');
    process.exit(errs.length ? 1 : 0);
  }
}
