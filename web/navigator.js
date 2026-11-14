import { horizonFromDem, truncatedAz, sectorTruncated, seriesStats, latLonToPx, pxToLatLon, samplePublished, candidateGrid, navScore, rankRows, toCsv, NAV_MARGIN_PX } from './lib.js';

const $ = id => document.getElementById(id);
const PUB = 256, STRIDE = 48;
const f4 = v => v == null ? '' : v.toFixed(4);
export const CSV_COLS = [
  { label: 'rank', get: r => r.rank }, { label: 'lat_deg', get: r => r.lat.toFixed(4) }, { label: 'lon_deg', get: r => r.lon.toFixed(4) },
  { label: 'sun_fraction_2m', get: r => f4(r.sun) }, { label: 'earth_fraction_2m', get: r => f4(r.earth) },
  { label: 'longest_dark_h', get: r => r.darkH }, { label: 'longest_no_earth_h', get: r => r.noEarthH },
  { label: 'nasa_map_sun_0m', get: r => f4(r.pubSun) }, { label: 'diff_sun_vs_nasa_map', get: r => r.pubSun == null ? '' : f4(r.sun - r.pubSun) },
  { label: 'nasa_map_earth_0m', get: r => f4(r.pubEarth) }, { label: 'diff_earth_vs_nasa_map', get: r => r.pubEarth == null ? '' : f4(r.earth - r.pubEarth) },
  { label: 'earth_ray_truncated', get: r => r.earthTrunc ? 'yes' : '' }, { label: 'picked', get: r => r.picked ? 'yes' : '' }
];

export function initNavigator(ctx) {
  const st = { site: null, data: null, pub: null, rows: [], last: null, cv: $('navMap'), img: null };
  const msg = t => { $('navMsg').textContent = t || ''; };
  const sel = $('navSite');
  ctx.sites.forEach(s => sel.add(new Option(s.name || s.id, s.id)));
  sel.onchange = () => load(sel.value);
  $('navGo').onclick = () => {
    const lat = parseFloat($('navLat').value), lon = parseFloat($('navLon').value);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return msg('Enter numeric lat and lon (degrees, east-positive lon).');
    const p = latLonToPx(st.site, lat, lon); addPoint(p.row, p.col);
  };
  $('navCsv').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCsv(st.rows, CSV_COLS)], { type: 'text/csv' })); a.download = 'albedo-navigator-' + st.site.id + '.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  st.cv.onclick = e => {
    const b = st.cv.getBoundingClientRect(), n = st.site.dem_size_px;
    addPoint((e.clientY - b.top) / b.height * n - 0.5, (e.clientX - b.left) / b.width * n - 0.5);
  };

  function evaluate(row, col, picked) {
    const s = st.site, n = s.dem_size_px;
    if (row < 0 || col < 0 || row > n - 1 || col > n - 1) { msg('Point is outside the ' + (n * s.meters_per_px / 1000) + ' km DEM window of this site.'); return null; }
    const x = seriesStats(st.data.ephemeris, horizonFromDem(st.data.dem, n, s.meters_per_px, row, col, 2)), earthTrunc = sectorTruncated(st.data.ephemeris.earth_az, truncatedAz(n, s.meters_per_px, row, col)), ll = pxToLatLon(s, row, col);
    const m = NAV_MARGIN_PX, edge = row < m || col < m || row > n - 1 - m || col > n - 1 - m;
    const pubEarth = st.pub.earth ? samplePublished(st.pub.earth, PUB, s, row, col) : null;
    return { row, col, lat: ll.lat, lon: ll.lon, sun: x.sun, earth: x.earth, darkH: x.darkH, noEarthH: x.noEarthH, edge, earthTrunc, picked,
      pubSun: st.pub.sun ? samplePublished(st.pub.sun, PUB, s, row, col) : null, pubEarth, score: navScore(x, pubEarth) };
  }
  function addPoint(row, col) {
    const r = evaluate(row, col, true); if (!r) return;
    msg(r.earthTrunc ? 'The ray toward Earth leaves the DEM window before 10 km: terrain beyond is unknown, so Earth % may read too high (marked †).' : r.edge ? 'Near the window edge: horizon range is shorter there, so Sun/Earth fractions are biased high.' : '');
    st.rows.push(r); st.last = r; render();
  }
  async function load(id) {
    st.site = ctx.sites.find(s => s.id === id); msg('Loading ' + id + '...');
    st.data = await ctx.siteData(id);
    if (!st.data.dem || !st.data.ephemeris) { msg('Missing DEM or ephemeris for ' + id + '.'); return; }
    const get = async f => { try { const r = await fetch(ctx.base + 'published/' + id + '_' + f + '.bin'); if (!r.ok) throw 0; return new Uint8Array(await r.arrayBuffer()); } catch (e) { return null; } };
    st.pub = { sun: await get('sun'), earth: await get('earth') };
    drawBase(); msg('Scoring grid points...');
    await new Promise(r => setTimeout(r, 20));
    st.rows = candidateGrid(st.site.dem_size_px, STRIDE).map(p => evaluate(p.row, p.col, false)); st.last = null;
    msg(''); render();
  }
  function drawBase() {
    const n = st.site.dem_size_px, dem = st.data.dem, cv = st.cv; cv.width = cv.height = n;
    const im = cv.getContext('2d').createImageData(n, n);
    let lo = Infinity, hi = -Infinity; for (const v of dem) { if (v < lo) lo = v; if (v > hi) hi = v; }
    for (let i = 0; i < n * n; i++) { const g = Math.round(235 * (dem[i] - lo) / (hi - lo) + 20); im.data[4 * i] = im.data[4 * i + 1] = im.data[4 * i + 2] = g; im.data[4 * i + 3] = 255; }
    st.img = im;
  }
  function render() {
    const c = st.cv.getContext('2d');
    c.putImageData(st.img, 0, 0);
    st.rows = rankRows(st.rows); st.rows.forEach((r, i) => { r.rank = i + 1; });
    st.rows.slice(0, 40).forEach(r => { c.fillStyle = r.picked ? '#5aa8ff' : '#ffc94a'; c.beginPath(); c.arc(r.col, r.row, 5, 0, 6.283); c.fill(); c.strokeStyle = '#000'; c.stroke(); });
    if (st.last) { c.strokeStyle = '#5ee0a0'; c.lineWidth = 3; c.beginPath(); c.arc(st.last.col, st.last.row, 9, 0, 6.283); c.stroke(); c.lineWidth = 1; }
    const p = v => v == null ? '-' : (v * 100).toFixed(1), d = (a, b) => b == null ? '-' : ((a - b) >= 0 ? '+' : '') + ((a - b) * 100).toFixed(1);
    const top = st.rows.slice(0, 20); if (st.last && !top.includes(st.last)) top.push(st.last);
    $('navBody').innerHTML = '<table><thead><tr><th>#</th><th>Lat</th><th>Lon</th><th>Sun %</th><th>Earth % (upper bound)</th><th>Longest dark (h)</th><th>NASA Sun %</th><th>Diff (pp)</th><th>NASA Earth %</th><th>Diff (pp)</th></tr></thead><tbody>' +
      top.map(r => `<tr${r === st.last ? ' class="hl"' : ''}><td>${r.rank}${r.picked ? ' *' : ''}</td><td class="num">${r.lat.toFixed(3)}</td><td class="num">${r.lon.toFixed(3)}</td><td class="num">${p(r.sun)}</td><td class="num">${p(r.earth)}${r.earthTrunc ? ' †' : ''}</td><td class="num">${r.darkH}</td><td class="num">${p(r.pubSun)}</td><td class="num">${d(r.sun, r.pubSun)}</td><td class="num">${p(r.pubEarth)}</td><td class="num">${d(r.earth, r.pubEarth)}</td></tr>`).join('') + '</tbody></table>';
  }
  load(ctx.sites[0].id);
}
