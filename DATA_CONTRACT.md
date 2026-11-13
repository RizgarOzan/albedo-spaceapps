# Data contract (Lunar Light Clock)

Sites (3, south pole, Artemis III candidate regions): ids `shackleton`, `nobile`, `malapert`. Each has a point of interest (lat, lon) and a square DEM crop around it from LRO LOLA.

All files live in `data/`:

- `data/sites.json`: list of `{id, name, lat, lon, dem_file, dem_size_px, meters_per_px, elev_min_m, elev_max_m, dem_source, dem_url}`
- `data/dem/<id>.bin`: raw little-endian Float32, row-major, `dem_size_px`^2 values, elevation in meters relative to the 1737.4 km sphere; north up, east right; observer point = image centre. Keep each file under 4 MB (downsample if needed; e.g. 256x256 or 512x512).
- `data/horizon/<id>.json`: `{id, az_step_deg:1, observer_height_m:2, horizon_deg:[360 floats]}` where element i = max elevation angle (deg) of terrain blocking the sky at azimuth i (0=N, 90=E) from the centre pixel, computed by ray-marching the DEM (state the max range in km).
- `data/ephemeris/<id>.json`: `{id, start_utc, step_min, n, source:"JPL Horizons", sun_az, sun_el, earth_az, earth_el}` arrays of `n` floats in degrees, topocentric at the site (selenographic lat/lon), unrefracted; window = 2027-01-01T00:00Z for 365 days at 60 min steps. (Horizons observer on Moon: site coordinates, center 301 body-centred.)
- `data/summary.json`: per site: `{illumination_fraction, longest_dark_hours, earth_visible_fraction, longest_no_earth_hours, mean_sun_el_when_up}` computed from ephemeris + horizon over the 365-day window (sun counts as visible when sun_el > horizon at its azimuth; same for Earth, limb of Sun disc ignored).
- `data/validation.json` + `docs/validation.md`: our modelled illumination fraction (and where available Earth visibility) vs. published NASA/LRO values for the same site coordinates (cite paper + table + number), with absolute and relative error. State the exact comparison honestly, including mismatches in site coordinates/height/time window.

Web app (`web/`) reads these files over fetch(), relative path `../data/` or `./data/` (make the loader try both). Everything must work as static files on GitHub Pages.
