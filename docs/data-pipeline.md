# Data pipeline

Reproduce everything (needs internet; about 10 minutes, mostly JPL Horizons):

    .venv\Scripts\python scripts\build_data.py     # DEM windows, horizons, ephemerides, summary.json
    .venv\Scripts\python scripts\extend_range.py   # 64 km DEM windows, 30 km horizons (the numbers the site shows)
    .venv\Scripts\python scripts\validate.py       # validation.json (docs/validation.md is the written analysis)

`scripts/lunar.py` holds the shared geometry. Large downloads are cached in `data/cache/` (not committed).

## Sources, licence, attribution

| Data | Source | URL |
|---|---|---|
| DEM | LRO LOLA GDR `LDEM_85S_20M_FLOAT` V2.1 (85S-90S, 20 m/px, polar stereographic, heights relative to the 1737.4 km sphere), PDS Geosciences Node. 920 MB file; only the needed row band is read with HTTP Range requests. | https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/ldem_85s_20m_float.img (label: `.lbl`) |
| Ephemeris | JPL Horizons via `astroquery.jplhorizons` (observer on the Moon surface, body 301, Sun = 10, Earth = 399, quantity 4 apparent az/el, 60 min steps, 2027-01-01 for 365 d). | https://ssd.jpl.nasa.gov/horizons/ |
| Validation maps | LOLA team average Sun / Earth visibility, `AVGVISIB_85S_060M_201608(_EARTH).IMG`, via NASA PGDA | https://pgda.gsfc.nasa.gov/products/69 , http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/ |

NASA/PDS and JPL data are public domain; credit "NASA/GSFC/LRO LOLA Science Team" and "NASA/JPL Horizons". The illumination method is Mazarico et al. 2011, Icarus 211, 1066-1081.

## Products

- `data/dem/<id>.bin`: 512x512 little-endian Float32, 40 m/px (20.48 km window), local east/north grid, north up, centre = site. Resampled bilinearly from the 20 m polar stereographic LDEM (azimuthal-equidistant local frame).
- `data/horizon/<id>.json`: 360 azimuths, observer 2 m, ray-march with sphere curvature, max range 30 km, from a 1600 x 1600 px (64 km) window built by `scripts/extend_range.py` (before 2026-11-15: 10.24 km). `data/dem/<id>.bin` stays the 20.48 km window used by the 3D view and the click-anywhere navigator.
- `data/ephemeris/<id>.json`, `data/summary.json`, `data/sites.json`, `data/validation.json`.

## Sites

The three points are chosen by rule from LOLA data, they are not NASA's official region centroids (not found in a citable source):

- Shackleton: highest average-illumination pixel (87%, from the NASA map) on the rim ring 8-12 km from the crater centre (USGS Gazetteer 89.67S, 129.78E, 21 km). We use the rim, not the crater floor, which is in permanent shadow (map value 0).
- Nobile: highest average-illumination pixel on the ring 30-45 km from the nominal crater centre (85.2S, 53.3E).
- Malapert: DEM summit (5.17 km) within 6 km of 85.9S, 0E, i.e. 85.99S, 2.06E (Wikipedia/IAU place the summit near 0-3E).

Polar-stereographic image orientation (x = rho sin(lon), row up = rho cos(lon)) was checked by reading known crater floors (Shackleton, Faustini, Cabeus, all deep) and the Shackleton floor showing 0 illumination in the NASA map.
