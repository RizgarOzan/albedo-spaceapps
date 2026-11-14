# Validation

Run `.venv\Scripts\python scripts\validate.py` to regenerate `data/validation.json`.

## What we compare against

NASA/LOLA-team published maps of average Sun and Earth visibility at the south pole, `AVGVISIB_85S_060M_201608.IMG` and `..._EARTH.IMG` (https://pgda.gsfc.nasa.gov/products/69, files at http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/). Method: Mazarico et al. 2011, Icarus 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030 (LDEM at 240 m in the paper; 60 m LDEM_85S in this product), hourly steps over a full 18.6-year nutation cycle, a pixel counts as sunlit if any fraction of the solar disc is visible, at surface height (0 m). Values are sampled at our site coordinates (bilinear) and as min/max of a 5x5 pixel (300 m) patch.

We could not read the Mazarico et al. site tables (Table 3): the paper is paywalled and no open copy was found, so no per-site percentages from the paper are quoted. The only number we cite from the paper is in its abstract (NTRS https://ntrs.nasa.gov/citations/20120010094): a point near the Shackleton rim is sunlit continuously for about 240 days, longest total darkness about 1.5 days. We did not find NASA's published Artemis III region tables with Earth/Sun percentages either.

## Results (our model: 2027-01-01 + 365 d, Horizons, 2 m observer, Sun disc centre; published: 18.6 yr, 0 m, any part of disc)

| Site | Quantity | Ours | Published at POI | Published 300 m patch min..max | Abs err | Rel err |
|---|---|---|---|---|---|---|
| Shackleton rim | Sun | 0.887 | 0.868 | 0.379..0.871 | +0.019 | +2.2% |
| Shackleton rim | Earth | 0.459 | 0.536 | 0.015..0.538 | -0.078 | -14.5% |
| Nobile rim | Sun | 0.896 | 0.829 | 0.319..0.832 | +0.067 | +8.1% |
| Nobile rim | Earth | 0.591 | 0.598 | 0.324..0.689 | -0.006 | -1.1% |
| Malapert summit | Sun | 0.646 | 0.566 | 0.422..0.703 | +0.080 | +14.0% |
| Malapert summit | Earth | 0.795 | 0.845 | 0.652..0.925 | -0.050 | -5.9% |

Literature check: longest continuous darkness at Shackleton rim, ours 102 h vs about 36 h (1.5 d) in the Mazarico abstract, +66 h. That figure is for the single best location in the whole region over 18.6 years; our pixel is a good rim pixel (87% in the NASA map) but not necessarily that one, so the gap is expected to be at least partly a site mismatch, and we cannot separate the causes.

## Honest caveats

- Site coordinates are ours, not NASA's region centroids. Shackleton and Nobile points were picked as the brightest pixel in the NASA 60 m Sun map on a rim ring, then compared to that same map, so agreement says the horizon model works but is not an independent test of site choice. Malapert is the DEM summit near 85.99S, 2.06E.
- Time window: one year (2027) against an 18.6-year average. The Sun's polar elevation amplitude changes over the nutation cycle, so single-year values can differ by several percent either way. This is probably part of the +5 to +14 point Sun differences; we did not test it.
- Observer height dominates: the same points at 0 m (as in the published maps) with our DEM give Sun fractions of 0.457 / 0.499 / 0.485 (Shackleton / Nobile / Malapert), far below 0.87 / 0.83 / 0.57. Adding the Sun's upper limb (+0.267 deg) moves 2 m results by only +0.02 to +0.03. So at these sites the 2 m height changes results by tens of points, because horizons are within about 1 deg of the Sun's elevation. The result is therefore very sensitive to DEM error (LOLA vertical error about 1 m or more, 40 m resampling, interpolated gaps near the pole). Treat illumination values as +-10 points at best.
- Limited range: ray-marching reaches 10.24 km (half window). Correction, 2026-11-14: earlier builds stopped the rays at 5.12 km by mistake (step array bound in `scripts/lunar.py`), while this file and the horizon JSON said 10.24 km; fixed, horizons and `summary.json` rebuilt (Sun fractions dropped by 0.00 to 0.035; Shackleton 0.922 to 0.887, Nobile 0.910 to 0.896, Malapert 0.648 to 0.646). Mountains beyond the window edge are missing, which can only raise the real horizon, so our illumination is biased high and our darkness periods biased low. Malapert (massif surrounded by terrain within a few km) and Nobile (rim at 30+ km from other high ground) are less affected than the Shackleton rim, where Connecting Ridge and de Gerlache rim lie within 10 to 20 km. Not quantified here.
- Earth visibility is geometric (Earth disc centre above horizon, selenographic libration included by Horizons); the NASA map's exact Earth definition (disc fraction vs. centre) was not checked. Mismatch up to -15% at Shackleton is consistent with the 300 m patch spread (0.015..0.538), i.e. a sub-pixel position effect.
- Resolution: 40 m/px grid resampled from the 20 m LDEM vs 60 m map; the published patch min/max spreads (up to 0.5) show how local positioning can alter values.

## Observer-height band and independent 5x5 check (`scripts/validate_band.py`, `data/validation_band.json`)

For each site the model is run at 0, 2 and 5 m observer height. The 5x5 check puts a model point on each of the 25 NASA 60 m pixels around the POI and compares them one to one (mean deviation = model minus NASA, RMSE over the 25). Unlike the POI row this does not reuse the pixel the site was chosen from, so it is a fairer test, though still one year against 18.6 years and Sun disc centre against any part of the disc. Values are fractions of time, shown here in percentage points.

| Site | Height | Sun at POI | Sun 5x5 dev / RMSE | Earth at POI | Earth 5x5 dev / RMSE |
|---|---|---|---|---|---|
| shackleton | 0 m | 45.7 | -6.7 / 15.2 | 45.7 | -9.1 / 29.2 |
| shackleton | 2 m | 88.7 | +6.1 / 17.0 | 45.9 | -2.8 / 24.7 |
| shackleton | 5 m | 92.9 | +15.2 / 21.7 | 46.1 | +0.7 / 22.1 |
| nobile | 0 m | 49.9 | -11.8 / 19.3 | 42.3 | -15.5 / 21.1 |
| nobile | 2 m | 89.6 | +10.5 / 17.6 | 59.1 | -4.8 / 10.3 |
| nobile | 5 m | 94.4 | +24.7 / 28.6 | 62.5 | +0.8 / 7.6 |
| malapert | 0 m | 48.5 | -8.9 / 10.1 | 72.7 | -11.5 / 11.9 |
| malapert | 2 m | 64.6 | +4.9 / 5.9 | 79.5 | -3.0 / 5.6 |
| malapert | 5 m | 74.8 | +14.2 / 15.2 | 82.5 | +2.1 / 6.2 |

What it says: for Earth the 5 m row has the smallest bias at all three sites (Shackleton +0.7, Nobile +0.8, Malapert +2.1 points); the 2 m row is 3 to 5 points low. For the Sun the bias is 5 to 10 points high at 2 m and 14 to 25 points high at 5 m, and 7 to 12 points low at 0 m, so the NASA map sits between our 0 m and 2 m results. RMSE stays at 6 to 29 points whatever the height, so sub-pixel position matters more than the height choice. No single height is "right" and we do not tune it to the NASA maps.
