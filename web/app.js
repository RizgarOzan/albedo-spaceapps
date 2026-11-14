import * as THREE from './vendor/three.module.js';
import { loadSites, loadSiteData, loadOptional, normalizeValidation, stepIndex, horizonAt, isVisible,
  visibilitySeries, nextTransition, formatCountdown, formatUtc } from './lib.js';
import { initNavigator } from './navigator.js';
import { Sonifier } from './sonify.js';

const $ = id => document.getElementById(id);
const fetchFn = (u) => fetch(u);
const OBSERVER_H = 2;
const SUN_R_DEG = 0.2665, EARTH_R_DEG = 0.95; // angular radii seen from the Moon (Earth ~1.9 deg across)
const rad = d => d * Math.PI / 180;

const app = { sites: [], base: null, mock: false, summary: null, cache: new Map(), views: [],
  timeline: { start: Date.parse('2027-01-01T00:00:00Z'), stepMs: 3600000, n: 8760 }, tMs: 0, playing: false, dirty: true };
app.tMs = app.timeline.start;

const fmt = (v, d = 1) => (v == null || Number.isNaN(v)) ? '-' : Number(v).toFixed(d);
const pct = v => v == null ? '-' : (v * 100).toFixed(1) + '%';

function siteData(id) {
  if (!app.cache.has(id)) app.cache.set(id, loadSiteData(fetchFn, app.base, id));
  return app.cache.get(id);
}

class View {
  constructor(parent, siteId, index) {
    this.siteId = siteId; this.az = 90; this.pitch = 3; this.data = null; this.series = null;
    const el = this.el = document.createElement('section'); el.className = 'view';
    el.innerHTML = `<div class="vhead"><select aria-label="Site"></select><button class="btn" type="button" data-face="sun">Face Sun</button><button type="button" data-face="earth">Face Earth</button></div>
      <div class="stage"><div class="overlay" hidden></div><div class="compass"></div></div>
      <canvas class="strip" width="800" height="70"></canvas><div class="panel"></div>`;
    parent.appendChild(el);
    this.select = el.querySelector('select');
    app.sites.forEach(s => this.select.add(new Option(s.name || s.id, s.id)));
    this.select.value = siteId;
    this.select.onchange = () => this.setSite(this.select.value);
    el.querySelectorAll('[data-face]').forEach(b => b.onclick = () => this.face(b.dataset.face));
    this.stage = el.querySelector('.stage'); this.overlay = el.querySelector('.overlay');
    this.compass = el.querySelector('.compass'); this.strip = el.querySelector('.strip'); this.panel = el.querySelector('.panel');
    this.initThree();
    this.initDrag();
    this.setSite(siteId);
  }

  initThree() {
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (e) { this.renderer = null; this.showOverlay('WebGL is not available in this browser. The panel and horizon strip still work.'); return; }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.stage.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.5, 1e6);
    this.light = new THREE.DirectionalLight(0xfff3d6, 2.6); this.scene.add(this.light, this.light.target);
    this.scene.add(new THREE.AmbientLight(0x303a55, 0.35)); // faint earthshine/starlight look
    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff1b0 }));
    this.earthMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0x4f9bff }));
    this.scene.add(this.sunMesh, this.earthMesh);
    const pts = []; for (let i = 0; i < 600; i++) { const a = Math.random() * 6.283, e = Math.random() * 1.4; pts.push(Math.cos(e) * Math.sin(a) * 5e5, Math.sin(e) * 5e5, -Math.cos(e) * Math.cos(a) * 5e5); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false })));
    new ResizeObserver(() => this.resize()).observe(this.stage);
  }

  resize() {
    if (!this.renderer) return;
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); app.dirty = true;
  }

  initDrag() {
    let last = null;
    this.stage.addEventListener('pointerdown', e => { last = e; this.stage.setPointerCapture(e.pointerId); });
    this.stage.addEventListener('pointerup', () => { last = null; });
    this.stage.addEventListener('pointermove', e => {
      if (!last) return;
      const k = 65 / Math.max(this.stage.clientHeight, 1);
      this.az = ((this.az - (e.clientX - last.clientX) * k) % 360 + 360) % 360;
      this.pitch = Math.max(-20, Math.min(60, this.pitch + (e.clientY - last.clientY) * k));
      last = e; app.dirty = true;
    });
  }

  face(body) {
    if (!this.data || !this.data.ephemeris) return;
    const e = this.data.ephemeris, i = stepIndex(e, app.tMs);
    this.az = e[body + '_az'][i]; this.pitch = Math.max(0, e[body + '_el'][i]); app.dirty = true;
  }

  showOverlay(msg) { this.overlay.hidden = !msg; this.overlay.textContent = msg || ''; }

  async setSite(id) {
    this.siteId = id; this.select.value = id;
    this.showOverlay('Loading ' + id + '...');
    const site = app.sites.find(s => s.id === id);
    const data = await siteData(id);
    if (this.siteId !== id) return; // user switched meanwhile
    this.data = data; this.site = site; this.series = null;
    if (data.ephemeris && data.horizon) {
      const h = data.horizon.horizon_deg;
      this.series = { sun: visibilitySeries(data.ephemeris, h, 'sun'), earth: visibilitySeries(data.ephemeris, h, 'earth') };
    }
    if (data.ephemeris) {
      const e = data.ephemeris; app.timeline = { start: Date.parse(e.start_utc), stepMs: e.step_min * 60000, n: e.n };
      const sl = $('slider'); sl.max = e.n - 1;
      if (app.tMs < app.timeline.start || app.tMs > app.timeline.start + e.n * app.timeline.stepMs) app.tMs = app.timeline.start;
    }
    this.buildTerrain();
    app.dirty = true;
  }

  buildTerrain() {
    if (!this.renderer) { this.showOverlay('WebGL is not available in this browser. The panel and horizon strip still work.'); return; }
    if (this.terrain) { this.scene.remove(this.terrain); this.terrain.geometry.dispose(); this.terrain = null; }
    const { dem } = this.data, s = this.site;
    const n = s && s.dem_size_px, mpp = s && s.meters_per_px;
    if (!dem || !n || !mpp || dem.length !== n * n) {
      this.showOverlay('No terrain data for this site (dem/' + this.siteId + '.bin missing or wrong size).'); this.far = 1e4; return;
    }
    this.showOverlay('');
    const c = Math.floor(n / 2), z0 = dem[c * n + c];
    const pos = new Float32Array(n * n * 3);
    for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
      const k = (r * n + q) * 3;
      pos[k] = (q - c) * mpp; pos[k + 1] = dem[r * n + q] - z0; pos[k + 2] = (r - c) * mpp; // x east, z south
    }
    const idx = new Uint32Array((n - 1) * (n - 1) * 6); let p = 0;
    for (let r = 0; r < n - 1; r++) for (let q = 0; q < n - 1; q++) {
      const a = r * n + q, b = a + 1, d = a + n, e = d + 1;
      idx[p++] = a; idx[p++] = d; idx[p++] = b; idx[p++] = b; idx[p++] = d; idx[p++] = e;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
    this.terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x9a9a9a }));
    this.scene.add(this.terrain);
    this.far = n * mpp / 2;
    this.camera.far = this.far * 3; this.camera.updateProjectionMatrix();
    this.camera.position.set(0, OBSERVER_H, 0);
    this.D = this.far * 2;
    this.sunMesh.scale.setScalar(this.D * Math.tan(rad(SUN_R_DEG)));
    this.earthMesh.scale.setScalar(this.D * Math.tan(rad(EARTH_R_DEG)));
  }

  dir(az, el) { return new THREE.Vector3(Math.cos(rad(el)) * Math.sin(rad(az)), Math.sin(rad(el)), -Math.cos(rad(el)) * Math.cos(rad(az))); }

  update() {
    const d = this.data;
    this.updatePanel();
    this.drawStrip();
    this.compass.textContent = 'Looking ' + Math.round(this.az) + '° az (0=N, 90=E)';
    if (!this.renderer || !this.terrain) return;
    const e = d.ephemeris, h = d.horizon && d.horizon.horizon_deg;
    this.camera.rotation.order = 'YXZ'; this.camera.rotation.y = -rad(this.az); this.camera.rotation.x = rad(this.pitch);
    if (e) {
      const i = stepIndex(e, app.tMs);
      const place = (mesh, az, el) => { mesh.visible = el > -0.5; mesh.position.copy(this.dir(az, el).multiplyScalar(this.D)); mesh.position.y += OBSERVER_H; };
      place(this.sunMesh, e.sun_az[i], e.sun_el[i]); place(this.earthMesh, e.earth_az[i], e.earth_el[i]);
      this.light.position.copy(this.dir(e.sun_az[i], Math.max(e.sun_el[i], 0.3)).multiplyScalar(this.far));
      this.light.intensity = (h ? isVisible(e.sun_el[i], e.sun_az[i], h) : e.sun_el[i] > 0) ? 2.6 : 0;
    } else { this.sunMesh.visible = this.earthMesh.visible = false; this.light.intensity = 0; }
    this.renderer.render(this.scene, this.camera);
  }

  drawStrip() {
    const cv = this.strip, ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const h = this.data && this.data.horizon && this.data.horizon.horizon_deg;
    if (!h) { ctx.fillStyle = '#8e99b8'; ctx.font = '14px system-ui'; ctx.fillText('No horizon profile available', 12, H / 2); return; }
    const lo = -2, hi = Math.max(8, Math.ceil(Math.max(...h) + 2));
    const Y = el => H - (el - lo) / (hi - lo) * H, X = az => az / 360 * W;
    ctx.fillStyle = '#3a4260'; ctx.beginPath(); ctx.moveTo(0, H);
    for (let a = 0; a <= 360; a++) ctx.lineTo(X(a), Y(h[a % 360]));
    ctx.lineTo(W, H); ctx.fill();
    ctx.fillStyle = '#6b7599'; ctx.font = '11px system-ui';
    [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([t, a]) => ctx.fillText(t, X(a) + 3, 11));
    ctx.fillText(hi + '°', W - 26, 11);
    // current look direction
    ctx.strokeStyle = '#ffffff55'; ctx.beginPath(); ctx.moveTo(X(this.az), 0); ctx.lineTo(X(this.az), H); ctx.stroke();
    const e = this.data.ephemeris;
    if (e) {
      const i = stepIndex(e, app.tMs);
      [['sun', '#ffc94a', 5], ['earth', '#5aa8ff', 7]].forEach(([b, col, r]) => {
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(e[b + '_az'][i]), Math.max(r, Math.min(H - r, Y(e[b + '_el'][i]))), r, 0, 6.283); ctx.fill();
      });
    }
  }

  updatePanel() {
    const d = this.data, P = this.panel;
    const e = d.ephemeris, h = d.horizon && d.horizon.horizon_deg;
    let html = '';
    if (!e) {
      html += `<div class="card wide empty">No ephemeris data for this site (ephemeris/${this.siteId}.json missing or invalid). Sun and Earth positions cannot be shown.</div>`;
    } else {
      const i = stepIndex(e, app.tMs);
      const body = (b, label, cls, up, down) => {
        const el = e[b + '_el'][i], az = e[b + '_az'][i];
        const vis = h ? isVisible(el, az, h) : null;
        const tr = this.series ? nextTransition(this.series[b], i, e.step_min) : null;
        const state = vis == null ? '<span class="empty">visibility unknown (no horizon profile)</span>' : vis ? `<span class="ok">${b === 'sun' ? 'Lit (Sun above horizon)' : 'Earth visible'}</span>` : `<span class="bad">${b === 'sun' ? 'In shadow (Sun below terrain horizon)' : 'Earth hidden below horizon'}</span>`;
        const next = tr ? `${tr.kind === 'set' ? down : up} in <b>${formatCountdown(tr.minutes)}</b> (${formatUtc(app.timeline.start + tr.idx * app.timeline.stepMs).slice(0, 16)})`
          : (this.series ? `No ${up.toLowerCase()}/${down.toLowerCase()} until the end of the window` : '<span class="empty">countdown unavailable</span>');
        return `<div class="card"><h3>${label}</h3><div class="big ${cls}">${fmt(el, 2)}° el, ${fmt(az, 1)}° az</div>
          <div>Terrain horizon there: ${h ? fmt(horizonAt(h, az), 2) + '°' : '-'}</div><div>${state}</div><div>${next}</div></div>`;
      };
      html += body('sun', 'Sun', 'sun', 'Sunrise', 'Sunset') + body('earth', 'Earth', 'earth', 'Earthrise', 'Earthset');
      if (this.series) {
        const tr = nextTransition(this.series.earth, i, e.step_min);
        html += `<div class="card earthset" id="earthset"><b>${tr ? (tr.kind === 'set' ? 'Earthset in ' : 'Earthrise in ') + formatCountdown(tr.minutes) : 'No Earth rise or set in the window'}</b> <span class="muted">(Earth currently ${this.series.earth[i] ? 'above' : 'below'} the terrain horizon)</span></div>`;
      }
      if (app.sonic && app.sonic.on && this === app.views[0]) app.sonic.update(e.sun_el[i], this.series ? !!this.series.sun[i] : e.sun_el[i] > 0);
    }
    const st = app.summary && (app.summary[this.siteId] || (Array.isArray(app.summary) && app.summary.find(x => x.id === this.siteId)));
    if (!st) html += '<div class="card wide empty">No yearly statistics available (summary.json missing or has no entry for this site).</div>';
    else html += `<div class="card wide"><h3>2027 statistics</h3><div class="stats">
      <div>Sunlit fraction<b>${pct(st.illumination_fraction)}</b></div><div>Longest dark spell<b>${fmt(st.longest_dark_hours, 0)} h</b></div>
      <div>Earth visible<b>${pct(st.earth_visible_fraction)}</b></div><div>Longest no-Earth spell<b>${fmt(st.longest_no_earth_hours, 0)} h</b></div>
      <div>Mean Sun elevation when up<b>${fmt(st.mean_sun_el_when_up, 2)}°</b></div></div></div>`;
    P.innerHTML = html;
  }
}

function setTime(ms) {
  const { start, stepMs, n } = app.timeline;
  app.tMs = Math.min(Math.max(ms, start), start + (n - 1) * stepMs);
  app.dirty = true;
}

function relayout() {
  const two = $('compare').checked, box = $('views');
  box.classList.toggle('two', two);
  if (two && app.views.length < 2) {
    const other = app.sites.find(s => s.id !== app.views[0].siteId) || app.sites[0];
    app.views.push(new View(box, other.id, 1));
  } else if (!two && app.views.length > 1) { const v = app.views.pop(); v.el.remove(); if (v.renderer) v.renderer.dispose(); }
  app.dirty = true;
}

function renderValidation(raw) {
  const rows = normalizeValidation(raw), box = $('valBody');
  if (!rows.length) { box.innerHTML = '<p class="empty">No validation data available (validation.json missing or empty).</p>'; return; }
  const n = (v, d = 4) => v == null ? '-' : (typeof v === 'number' ? v.toFixed(d) : v);
  const esc = s => String(s == null ? '-' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  box.innerHTML = `<table><thead><tr><th>Site</th><th>Metric</th><th>Model</th><th>Published</th><th>Abs. error</th><th>Rel. error</th><th>Source</th></tr></thead><tbody>` +
    rows.map(r => `<tr><td>${esc(r.site)}</td><td>${esc(r.metric)}</td><td class="num">${n(r.model)}</td><td class="num">${n(r.published)}</td><td class="num">${n(r.abs_error)}</td><td class="num">${n(r.rel_error_pct, 2)}${r.rel_error_pct == null ? '' : '%'}</td><td>${esc(r.source)}${r.note ? '<br><span class="muted">' + esc(r.note) + '</span>' : ''}</td></tr>`).join('') +
    `</tbody></table><p class="note">Model values come from the DEM horizon and Horizons ephemeris. See docs/validation.md for the exact comparison and its caveats.</p>`;
}

function renderBand(b) {
  const box = $('bandBody');
  if (!b || !b.sites) { box.innerHTML = '<p class="empty">No validation_band.json.</p>'; return; }
  const x = v => v == null ? '-' : (v * 100).toFixed(1), sg = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(1);
  let rows = '';
  for (const [id, r] of Object.entries(b.sites)) for (const h of ['0', '2', '5']) {
    const ps = r.patch5x5.sun.by_height[h], pe = r.patch5x5.earth.by_height[h];
    rows += `<tr><td>${id}</td><td class="num">${h} m</td><td class="num">${x(r.poi[h].sun)}</td><td class="num">${sg(ps.mean_dev)} / ${x(ps.rmse)}</td><td class="num">${x(r.poi[h].earth)}</td><td class="num">${sg(pe.mean_dev)} / ${x(pe.rmse)}</td></tr>`;
  }
  box.innerHTML = '<table><thead><tr><th>Site</th><th>Observer</th><th>Sun % at POI</th><th>Sun 5x5 mean dev / RMSE (pp)</th><th>Earth % at POI</th><th>Earth 5x5 mean dev / RMSE (pp)</th></tr></thead><tbody>' + rows + '</tbody></table><p class="note">The 25 model points sit on the NASA 60 m pixels of a 5x5 patch around each POI, so unlike the POI row they are not the pixel the site was picked from. ' + b.note + ' Positive deviation: model brighter than the NASA map.</p>';
}

function stopTour(msg) { app.tour = null; app.playing = false; $('play').textContent = 'Play'; $('tour').disabled = false; if (msg != null) $('tourMsg').textContent = msg; }

function startTour() {
  const v = app.views[0], e = v && v.data && v.data.ephemeris, s = v && v.series && v.series.earth;
  if (!s) { $('tourMsg').textContent = 'Earth data is not loaded yet.'; return; }
  const step = app.timeline.stepMs, now = Math.round((app.tMs - app.timeline.start) / step);
  let k = -1;
  for (let i = Math.max(now, 1); i < s.length; i++) if (s[i - 1] && !s[i]) { k = i; break; }
  if (k < 0) for (let i = 1; i < s.length; i++) if (s[i - 1] && !s[i]) { k = i; break; } // wrap to the start of the year
  if (k < 0) { $('tourMsg').textContent = 'Earth never sets at this site in 2027.'; return; }
  const from = Math.max(k - 5, 0), to = Math.min(k + 3, s.length - 1);
  app.tMs = app.timeline.start + from * step; v.face('earth');
  $('speed').value = '3600000'; app.tour = { v, endMs: app.timeline.start + to * step, setMs: app.timeline.start + k * step };
  app.playing = true; $('play').textContent = 'Pause'; $('tour').disabled = true; app.dirty = true;
  $('tourMsg').textContent = `Earth hangs about ${fmt(e.earth_el[from], 1)} deg above the horizon at ${v.site ? (v.site.name || v.siteId) : v.siteId}. Watch it slip behind the terrain.`;
}

function loop(prev) {
  return function frame(now) {
    if (app.tour) {
      app.tour.v.face('earth');
      if (app.tMs >= app.tour.setMs && !app.tour.shown) { app.tour.shown = true; $('tourMsg').textContent = 'Earthset: no direct line of sight to Earth now, so no radio link until it rises again.'; }
      if (app.tMs >= app.tour.endMs) stopTour();
    }
    if (app.playing) { setTime(app.tMs + Number($('speed').value) * Math.min(now - prev, 100) / 1000); if (app.tMs >= app.timeline.start + (app.timeline.n - 1) * app.timeline.stepMs) app.tMs = app.timeline.start; }
    prev = now;
    if (app.dirty) {
      app.dirty = false;
      $('utc').textContent = formatUtc(app.tMs);
      $('slider').value = Math.round((app.tMs - app.timeline.start) / app.timeline.stepMs);
      app.views.forEach(v => v.data && v.update());
    }
    requestAnimationFrame(frame);
  };
}

async function main() {
  $('tabExplore').onclick = () => tab(true); $('tabValid').onclick = () => tab(false);
  $('tabNav').onclick = () => tab('nav');
  function tab(w) { w = w === true ? 'ex' : w === false ? 'val' : w; $('explore').hidden = w !== 'ex'; $('navigator').hidden = w !== 'nav'; $('validation').hidden = w !== 'val';
    [['tabExplore', 'ex'], ['tabNav', 'nav'], ['tabValid', 'val']].forEach(([id, k]) => $(id).classList.toggle('active', w === k)); app.dirty = true; }
  let loaded;
  try { loaded = await loadSites(fetchFn); } catch (e) {
    $('loadMsg').textContent = ''; $('views').innerHTML = '<p class="empty">No data available. ' + String(e.message).replace(/</g, '&lt;') + '</p>';
    $('valBody').innerHTML = '<p class="empty">No validation data available.</p>'; return;
  }
  app.base = loaded.base; app.sites = loaded.sites; app.mock = loaded.mock;
  $('mockBanner').hidden = !app.mock;
  $('loadMsg').textContent = 'Data: ' + app.base + (app.mock ? ' (mock)' : '');
  app.summary = await loadOptional(fetchFn, app.base, 'summary.json');
  renderValidation(await loadOptional(fetchFn, app.base, 'validation.json'));
  renderBand(await loadOptional(fetchFn, app.base, 'validation_band.json'));
  initNavigator({ sites: app.sites, base: app.base, siteData });
  const sonic = new Sonifier();
  app.sonic = sonic;
  $('sonify').onclick = () => {
    if (sonic.on) sonic.stop(); else if (!sonic.start()) { $('sonify').textContent = 'Sound unavailable'; return; }
    $('sonify').textContent = 'Sound: ' + (sonic.on ? 'on' : 'off'); $('sonify').setAttribute('aria-pressed', String(sonic.on)); app.dirty = true;
  };
  app.views.push(new View($('views'), app.sites[0].id, 0));
  $('compare').onchange = relayout;
  $('slider').oninput = e => { if (app.tour) stopTour(''); const { start, stepMs } = app.timeline; setTime(start + Number(e.target.value) * stepMs); };
  $('tour').onclick = startTour;
  $('play').onclick = () => { if (app.tour) { stopTour(''); return; } app.playing = !app.playing; $('play').textContent = app.playing ? 'Pause' : 'Play'; };
  app.dirty = true;
  requestAnimationFrame(loop(performance.now()));
}
main();
