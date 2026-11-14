import { seriesStats, landingWindows, topWindows, delayScenario, WINDOW_DAYS } from './lib.js';

const $ = id => document.getElementById(id);
const pc = v => (v * 100).toFixed(0) + '%';
const day2date = (start, d) => new Date(start + d * 86400000).toISOString().slice(0, 10);

export function initPlanner(ctx) {
  const st = { wins: null, start: null, sel: null };
  const sel = $('plSite'); ctx.sites.forEach(s => sel.add(new Option(s.name || s.id, s.id)));
  const name = id => (ctx.sites.find(s => s.id === id) || {}).name || id;

  async function ensure() {
    if (st.wins) return true;
    $('plMsg').textContent = 'Computing windows...';
    const wins = {};
    for (const s of ctx.sites) {
      const d = await ctx.siteData(s.id);
      if (!d.ephemeris || !d.horizon) { $('plMsg').textContent = 'Missing data for ' + s.id + '.'; return false; }
      const x = seriesStats(d.ephemeris, d.horizon.horizon_deg);
      wins[s.id] = landingWindows(x.sunSeries, x.earthSeries, d.ephemeris.step_min);
      st.start = Date.parse(d.ephemeris.start_utc);
    }
    st.wins = wins; $('plMsg').textContent = '';
    $('plDate').value = day2date(st.start, 0); $('plDate').min = day2date(st.start, 0);
    $('plDate').max = day2date(st.start, wins[ctx.sites[0].id].length - 1);
    return true;
  }

  function heat() {
    const cv = $('plHeat'), g = cv.getContext('2d'), w = st.wins[sel.value], N = w.length, cw = cv.width / N, rh = cv.height / 2;
    g.clearRect(0, 0, cv.width, cv.height);
    w.forEach((x, d) => {
      [x && x.sun, x && x.earth].forEach((v, r) => {
        g.fillStyle = v == null ? '#222a44' : r ? `hsl(210,80%,${10 + v * 55}%)` : `hsl(45,90%,${10 + v * 55}%)`;
        g.fillRect(d * cw, r * rh, Math.ceil(cw), rh - 1);
      });
    });
    if (st.sel != null) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(st.sel * cw, 1, Math.max(cw, 2), cv.height - 2); }
  }

  function top() {
    const t = topWindows(st.wins[sel.value]);
    $('plTop').innerHTML = '<tr><th>#</th><th>Landing date</th><th>Sun</th><th>Earth</th><th>Score</th><th>Longest dark</th><th>Longest no Earth</th></tr>' +
      t.map((x, i) => `<tr data-day="${x.day}"><td>${i + 1}</td><td>${day2date(st.start, x.day)}</td><td class="num">${pc(x.sun)}</td><td class="num">${pc(x.earth)}</td><td class="num">${pc(x.score)}</td><td class="num">${x.darkH.toFixed(0)} h</td><td class="num">${x.noEarthH.toFixed(0)} h</td></tr>`).join('');
    $('plTop').querySelectorAll('tr[data-day]').forEach(r => r.onclick = () => pick(+r.dataset.day));
  }

  function delay() {
    const day = st.sel, dl = +$('plDelay').value;
    $('plDelayN').textContent = '+' + dl + ' d';
    if (day == null) { $('plDelayBody').innerHTML = '<p class="muted">Pick a planned landing date above (date box or click the calendar).</p>'; return; }
    const r = delayScenario(st.wins, sel.value, day, dl), p = r.planned;
    const row = (label, w, flag) => w ? `<tr${flag ? ' class="best"' : ''}><td>${label}${flag ? ' (best option)' : ''}</td><td class="num">${pc(w.sun)}</td><td class="num">${pc(w.earth)}</td><td class="num">${pc(w.score)}</td><td class="num">${w.darkH.toFixed(0)} h</td><td class="num">${w.noEarthH.toFixed(0)} h</td></tr>`
      : `<tr><td>${label}</td><td colspan="5" class="muted">no full ${WINDOW_DAYS}-day window left in the 2027 data</td></tr>`;
    $('plDelayBody').innerHTML = '<table><tr><th>Option</th><th>Sun</th><th>Earth</th><th>Score</th><th>Longest dark</th><th>Longest no Earth</th></tr>' +
      row(`${name(sel.value)}, planned ${day2date(st.start, day)}`, p, false) +
      r.delayed.map(x => row(`${name(x.id)}, ${day2date(st.start, day + dl)}${x.id === sel.value ? ' (same site, delayed)' : ''}`, x.w, x.id === r.bestId)).join('') + '</table>' +
      (r.bestId ? `<p>Best option at the delayed date: <b>${name(r.bestId)}</b> (score ${pc(r.delayed.find(x => x.id === r.bestId).w.score)}${p ? ', planned was ' + pc(p.score) : ''}).</p>` : '');
  }

  function pick(day) { st.sel = day; $('plDate').value = day2date(st.start, day); heat(); delay(); }
  async function refresh() { if (await ensure()) { heat(); top(); delay(); } }

  sel.onchange = refresh;
  $('plDate').onchange = () => { const d = Math.round((Date.parse($('plDate').value) - st.start) / 86400000); if (st.wins && d >= 0 && d < st.wins[sel.value].length) pick(d); };
  $('plDelay').oninput = delay;
  $('plHeat').onclick = e => { if (!st.wins) return; const b = e.target.getBoundingClientRect(), n = st.wins[sel.value].length; pick(Math.min(n - 1, Math.floor((e.clientX - b.left) / b.width * n))); };
  return { show: refresh };
}
