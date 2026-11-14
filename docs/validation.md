# Validation

Run `.venv\Scripts\python scripts\validate.py` to regenerate `data/validation.json`.

## What we compare against

NASA/LOLA-team published maps of average Sun and Earth visibility at the south pole, `AVGVISIB_85S_060M_201608.IMG` and `..._EARTH.IMG` (https://pgda.gsfc.nasa.gov/products/69, files at http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/). Method: Mazarico et al. 2011, Icarus 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030 (LDEM at 240 m in the paper; 60 m LDEM_85S in this product), hourly steps over a full 18.6-year nutation cycle, a pixel counts as sunlit if any fraction of the solar disc is visible, at surface height (0 m). Values are sampled at our site coordinates (bilinear) and as min/max of a 5x5 pixel (300 m) patch.

We could not read the Mazarico et al. site tables (Table 3): the paper is paywalled and no open copy was found, so no per-site percentages from the paper are quoted. The only number we cite from the paper is in its abstract (NTRS https://ntrs.nasa.gov/citations/20120010094): a point near the Shackleton rim is sunlit continuously for about 240 days, longest total darkness about 1.5 days. We did not find NASA's published Artemis III region tables with Earth/Sun percentages either.

## Results (our model: 2027-01-01 + 365 d, Horizons, 2 m observer, 30 km rays, Sun disc centre; published: 18.6 yr, 0 m, any part of disc)

| Site | Quantity | Ours | Published at POI | Published 300 m patch min..max | Abs err | Rel err |
|---|---|---|---|---|---|---|
| Shackleton rim | Sun | 0.860 | 0.868 | 0.379..0.871 | -0.008 | -0.9% |
| Shackleton rim | Earth | 0.459 | 0.536 | 0.015..0.538 | -0.078 | -14.5% |
| Nobile rim | Sun | 0.880 | 0.829 | 0.319..0.832 | +0.051 | +6.1% |
| Nobile rim | Earth | 0.591 | 0.598 | 0.324..0.689 | -0.006 | -1.1% |
| Malapert summit | Sun | 0.646 | 0.566 | 0.422..0.703 | +0.080 | +14.0% |
| Malapert summit | Earth | 0.795 | 0.845 | 0.652..0.925 | -0.050 | -5.9% |

Literature check: longest continuous darkness at Shackleton rim, ours 147 h (30 km rays; 102 h with 10.24 km rays) vs about 36 h (1.5 d) in the Mazarico abstract, +111 h. That figure is for the single best location in the whole region over 18.6 years; our pixel is a good rim pixel (87% in the NASA map) but not necessarily that one, so the gap is expected to be at least partly a site mismatch, and we cannot separate the causes.

## Honest caveats

- Site coordinates are ours, not NASA's region centroids. Shackleton and Nobile points were picked as the brightest pixel in the NASA 60 m Sun map on a rim ring, then compared to that same map, so agreement says the horizon model works but is not an independent test of site choice. Malapert is the DEM summit near 85.99S, 2.06E.
- Time window: one year (2027) against an 18.6-year average. The Sun's polar elevation amplitude changes over the nutation cycle, so single-year values can differ by several percent either way. This is probably part of the +2 to +8 point Sun differences at the three site points (the 5x5 patch check gives +5 to +11 at 2 m); we did not test it.
- Observer height dominates: the same points at 0 m (as in the published maps) with our DEM give Sun fractions of 0.457 / 0.499 / 0.485 (Shackleton / Nobile / Malapert), far below 0.87 / 0.83 / 0.57. Adding the Sun's upper limb (+0.267 deg) moves 2 m results by only +0.02 to +0.03. So at these sites the 2 m height changes results by tens of points, because horizons are within about 1 deg of the Sun's elevation. The result is therefore very sensitive to DEM error (LOLA vertical error about 1 m or more, 40 m resampling, interpolated gaps near the pole). Treat illumination values as +-10 points at best.
- Limited range: ray-marching reaches 30 km (64 km window; was 10.24 km before 2026-11-15). Correction, 2026-11-14: earlier builds stopped the rays at 5.12 km by mistake (step array bound in `scripts/lunar.py`), while this file and the horizon JSON said 10.24 km; fixed, horizons and `summary.json` rebuilt (Sun fractions dropped by 0.00 to 0.035; Shackleton 0.922 to 0.887, Nobile 0.910 to 0.896, Malapert 0.648 to 0.646). Mountains beyond the window edge are missing, which can only raise the real horizon, so our illumination is biased high and our darkness periods biased low. Malapert (massif surrounded by terrain within a few km) and Nobile (rim at 30+ km from other high ground) are less affected than the Shackleton rim, where Connecting Ridge and de Gerlache rim lie within 10 to 20 km. Not quantified here.
- Horizon range limit: terrain beyond 30 km is not modelled. The 10.24 to 30 km extension changed Shackleton by -2.7 Sun points and +45 h of dark spell, so ridges beyond 30 km could still matter (the 20 to 30 km change was 1 point at Shackleton, 0 at the other two). Sun hours stay an upper bound.
- Earth visibility is geometric (Earth disc centre above horizon, selenographic libration included by Horizons); the NASA map's exact Earth definition (disc fraction vs. centre) was not checked. Mismatch up to -15% at Shackleton is consistent with the 300 m patch spread (0.015..0.538), i.e. a sub-pixel position effect.
- Resolution: 40 m/px grid resampled from the 20 m LDEM vs 60 m map; the published patch min/max spreads (up to 0.5) show how local positioning can alter values.

## Observer-height band and independent 5x5 check (`scripts/validate_band.py`, `data/validation_band.json`)

For each site the model is run at 0, 2 and 5 m observer height. The 5x5 check puts a model point on each of the 25 NASA 60 m pixels around the POI and compares them one to one (mean deviation = model minus NASA, RMSE over the 25). Unlike the POI row this does not reuse the pixel the site was chosen from, so it is a fairer test, though still one year against 18.6 years and Sun disc centre against any part of the disc. Values are fractions of time, shown here in percentage points.

| Site | Height | Sun at POI | Sun 5x5 dev / RMSE | Earth at POI | Earth 5x5 dev / RMSE |
|---|---|---|---|---|---|
| shackleton | 0 m | 45.0 | -8.1 / 15.6 | 45.7 | -9.1 / 29.2 |
| shackleton | 2 m | 86.0 | +4.5 / 16.0 | 45.9 | -2.8 / 24.7 |
| shackleton | 5 m | 90.1 | +13.3 / 20.2 | 46.1 | +0.7 / 22.1 |
| nobile | 0 m | 49.9 | -11.9 / 19.4 | 42.3 | -15.5 / 21.1 |
| nobile | 2 m | 88.0 | +9.8 / 17.0 | 59.1 | -4.8 / 10.3 |
| nobile | 5 m | 92.1 | +23.5 / 27.3 | 62.5 | +0.8 / 7.6 |
| malapert | 0 m | 48.5 | -8.9 / 10.1 | 72.7 | -11.5 / 11.9 |
| malapert | 2 m | 64.6 | +4.9 / 5.9 | 79.5 | -3.0 / 5.6 |
| malapert | 5 m | 74.8 | +14.1 / 15.2 | 82.5 | +2.1 / 6.2 |

What it says: for Earth the 5 m row has the smallest bias at all three sites (Shackleton +0.7, Nobile +0.8, Malapert +2.1 points); the 2 m row is 3 to 5 points low. For the Sun the bias is 4 to 10 points high at 2 m and 13 to 24 points high at 5 m, and 8 to 12 points low at 0 m, so the NASA map sits between our 0 m and 2 m results. RMSE stays at 6 to 29 points whatever the height, so sub-pixel position matters more than the height choice. No single height is "right" and we do not tune it to the NASA maps.

## Sensitivity (`scripts/sensitivity.py`, `data/sensitivity.json`)

Same DEM windows (30 km) and 2027 hourly ephemerides as everywhere else; only the maximum ray length (2 m observer) or the observer height (full 30 km) changes. Since 2026-11-15 the runs use a 64 km LDEM window (1600 x 1600 px at 40 m, `scripts/extend_range.py`) so rays can go to 30 km; before that the window was 20.48 km and the limit 10.24 km. This is a convergence test of our own model, not a comparison with an outside source. Nothing beyond the 10.24 km window was computed (no DEM there), so the true limit is not measured.

Ray range, Sun fraction / longest dark spell (h) / Earth fraction / largest horizon change vs the 30 km run (the 10.24 km column is what the model gave before 2026-11-15):

| Site | 2.5 km | 5 km | 7.5 km | 10.24 km | 20 km | 30 km |
|---|---|---|---|---|---|---|
| Shackleton | 0.941 / 102 / 0.468 / 6.367 deg | 0.926 / 102 / 0.459 / 6.367 deg | 0.897 / 102 / 0.459 / 6.367 deg | 0.887 / 102 / 0.459 / 6.367 deg | 0.870 / 102 / 0.459 / 1.94 deg | 0.860 / 147 / 0.459 / 0 deg |
| Nobile | 0.910 / 138 / 0.591 / 2.338 deg | 0.910 / 138 / 0.591 / 2.338 deg | 0.897 / 138 / 0.591 / 2.12 deg | 0.896 / 138 / 0.591 / 2.12 deg | 0.880 / 151 / 0.591 / 2.105 deg | 0.880 / 151 / 0.591 / 0 deg |
| Malapert | 0.648 / 341 / 0.795 / 1.147 deg | 0.648 / 341 / 0.795 / 1.147 deg | 0.648 / 341 / 0.795 / 1.147 deg | 0.646 / 341 / 0.795 / 0.217 deg | 0.646 / 341 / 0.795 / 0 deg | 0.646 / 341 / 0.795 / 0 deg |

Observer height at 30 km, Sun fraction / longest dark spell (h) / Earth fraction:

| Site | 0 m | 2 m | 5 m |
|---|---|---|---|
| Shackleton | 0.450 / 539 / 0.457 | 0.860 / 147 / 0.459 | 0.901 / 74 / 0.461 |
| Nobile | 0.499 / 544 / 0.423 | 0.880 / 151 / 0.591 | 0.921 / 130 / 0.625 |
| Malapert | 0.485 / 428 / 0.727 | 0.646 / 341 / 0.795 | 0.748 / 310 / 0.825 |

What it says:
- Update 2026-11-15, 30 km: the earlier objection that nothing beyond 10.24 km was tested is now closed by measurement. Shackleton still moved after 10.24 km: Sun fraction 0.887 -> 0.870 (20 km) -> 0.860 (30 km), longest dark spell 102 h -> 147 h, largest horizon change 6.4 deg. Nobile moved 0.896 -> 0.880 and its dark spell 138 -> 151 h. Malapert did not move (0.646). Between 20 and 30 km the horizon changed only at Shackleton (1.9 deg at some azimuths), so the model has converged to the resolution that matters, but ranges beyond 30 km were not run. The 5x5 patch check and observer-height band table below were re-run with 30 km rays on 2026-11-15.
- Earlier 10.24 km result, kept as a correction note: Shackleton looked unconverged then; the 30 km run confirms ridges beyond 10.24 km lowered it, as the jury expected.
- Longest dark spell and Earth fraction did not change with range at the three sites (Shackleton longest no-Earth spell 345 h at 2.5 km, 354 h from 5 km on).
- Observer height matters far more than range: 0 to 2 m moves the Sun fraction by 0.16 to 0.43 and 2 to 5 m by 0.04 to 0.10 (see the earlier caveat on 0 m vs 2 m). Longest dark spell at Shackleton: 539 h at 0 m, 147 h at 2 m, 74 h at 5 m.
- Still one model; an independent horizon code was not run (not measured). Other years were run, see the next section.

## Three-year check (2026, 2027, 2028)

`scripts/multiyear.py` repeats the 2 m, 30 km run with hourly Horizons ephemerides for each year (same DEM windows, Sun disc centre, Earth centre). Output: `data/multiyear.json`.

| Site | Sun fraction 2026 / 2027 / 2028 | Earth fraction 2026 / 2027 / 2028 | Longest dark spell (h) 2026 / 2027 / 2028 |
|---|---|---|---|
| Shackleton rim | 0.862 / 0.860 / 0.866 | 0.480 / 0.459 / 0.540 | 147 / 147 / 147 |
| Nobile rim | 0.879 / 0.880 / 0.879 | 0.572 / 0.591 / 0.639 | 149 / 151 / 151 |
| Malapert summit | 0.669 / 0.646 / 0.663 | 0.799 / 0.795 / 0.830 | 340 / 341 / 341 |

Spread between the three years: Sun 0.1 to 2.3 points, Earth 3.5 to 8.1 points (Earth moves most because libration changes from year to year). So the single-year 2027 Sun values are stable to a few points across 2026 to 2028, which makes a year-count mismatch an unlikely main cause of the 2 to 8 point Sun differences to NASA's map. This is three years, not the 18.6-year nutation cycle, and the range limit of 10.24 km is unchanged (no DEM beyond it, not measured).

## Independent horizon check (2026-11-15, `scripts/independent_horizon.py`, `data/independent_horizon.json`)

A second horizon code with a different method: no ray, every DEM cell between 4 and 30 km from the site gets its own elevation angle (curvature included) and azimuth, and the maximum per 1 degree bin is kept. Closer than 4 km a 40 m cell is much narrower than 1 degree, so that band is not testable this way and is left out of both models. Same DEM, same ephemerides.

| Site | Mean abs horizon difference | Largest difference | Sun fraction ray / cells | Longest dark spell ray / cells (h) |
|---|---|---|---|---|
| Shackleton | 0.09 deg | 0.33 deg | 0.912 / 0.902 | 74 / 78 |
| Nobile | 0.12 deg | 0.37 deg | 0.960 / 0.955 | 50 / 53 |
| Malapert | 0.10 deg | 0.41 deg | 0.982 / 0.979 | 54 / 58 |

(The Sun fractions here are higher than the main results because the 0 to 4 km band is left out of both columns; only the agreement between the two methods matters.) So the far-field ray march (4 to 30 km) agrees with a brute-force check to about 0.1 deg and 1 Sun point, and this closes "no independent horizon code". It is still the same DEM, so DEM error (LOLA vertical error about 1 m or more) is not tested by it.
