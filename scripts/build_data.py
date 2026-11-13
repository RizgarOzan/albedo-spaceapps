"""Build data/ (DEM windows, horizons, Horizons ephemerides, summary) from real NASA data.
Usage: .venv/Scripts/python scripts/build_data.py [--skip-ephemeris]"""
import json, os, sys, time
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lunar import *

D = os.path.join(ROOT, "data")
SIZE, MPP = 512, 40.0            # 512 px * 40 m = 20.48 km window (source LDEM is 20 m/px)
START, N_STEPS, STEP_MIN = "2027-01-01T00:00:00Z", 365 * 24, 60
# POIs: chosen from LOLA data (see docs/data-pipeline.md). Coordinates: planetocentric, east-positive.
SITES = [
    dict(id="shackleton", name="Shackleton crater rim (high-illumination rim point)", lat=-89.6864, lon=197.0629),
    dict(id="nobile", name="Nobile crater rim (high-illumination rim point)", lat=-85.3003, lon=37.0989),
    dict(id="malapert", name="Malapert massif summit", lat=-85.9878, lon=2.0648),
]
DEM_SOURCE = ("NASA LRO LOLA LDEM_85S_20M_FLOAT (PDS Geosciences Node, V2.1, relative to 1737.4 km sphere), "
              "bilinearly resampled from polar stereographic to a local 40 m/px ENU grid")


def site_dem(s):
    dem = window(s["lat"], s["lon"], SIZE, MPP)
    f = os.path.join(D, "dem", s["id"] + ".bin")
    dem.astype("<f4").tofile(f)
    return dem


def horizon_json(s, dem):
    h = horizon(dem, MPP, 2.0)
    out = dict(id=s["id"], az_step_deg=1, observer_height_m=2,
               max_range_km=round(SIZE * MPP / 2000, 2),
               note="ray-march from DEM centre, spherical curvature included; terrain beyond window edge not modelled",
               horizon_deg=[round(float(v), 3) for v in h])
    json.dump(out, open(os.path.join(D, "horizon", s["id"] + ".json"), "w"))
    return h


def horizons_azel(lat, lon, elev_km, target):
    from astroquery.jplhorizons import Horizons
    t0 = np.datetime64("2027-01-01T00:00")
    az, el = [], []
    chunk = 24 * 60  # 60 days of hourly steps per request
    for i in range(0, N_STEPS, chunk):
        m = min(chunk, N_STEPS - i)
        a = t0 + np.timedelta64(i, "h"); b = t0 + np.timedelta64(i + m - 1, "h")
        loc = dict(lon=float(lon % 360), lat=float(lat), elevation=float(elev_km), body=301)
        for attempt in range(4):
            try:
                eph = Horizons(id=str(target), location=loc, id_type=None,
                               epochs=dict(start=str(a).replace("T", " "), stop=str(b).replace("T", " "), step="60m")).ephemerides(
                    quantities="4", extra_precision=False)
                break
            except Exception as e:
                print("retry", attempt, repr(e)[:150]); time.sleep(5 * (attempt + 1))
        else:
            raise RuntimeError("Horizons failed")
        assert len(eph) == m, (len(eph), m)
        az += list(eph["AZ"]); el += list(eph["EL"])
        time.sleep(1)
    return np.array(az), np.array(el)


def ephemeris(s, elev_m):
    f = os.path.join(D, "ephemeris", s["id"] + ".json")
    sa, se = horizons_azel(s["lat"], s["lon"], elev_m / 1000, 10)
    ea, ee = horizons_azel(s["lat"], s["lon"], elev_m / 1000, 399)
    r = lambda a: [round(float(v), 3) for v in a]
    json.dump(dict(id=s["id"], start_utc=START, step_min=STEP_MIN, n=N_STEPS, source="JPL Horizons",
                   sun_az=r(sa), sun_el=r(se), earth_az=r(ea), earth_el=r(ee)), open(f, "w"))


def visible(az, el, hor):
    h = np.interp(np.asarray(az) % 360, np.arange(361), np.append(hor, hor[0]))
    return np.asarray(el) > h


def longest_run(mask):
    best = cur = 0
    for v in mask:
        cur = 0 if v else cur + 1
        best = max(best, cur)
    return best


def summarize(s, hor=None):
    e = json.load(open(os.path.join(D, "ephemeris", s["id"] + ".json")))
    hor = np.array(json.load(open(os.path.join(D, "horizon", s["id"] + ".json")))["horizon_deg"]) if hor is None else hor
    sv, ev = visible(e["sun_az"], e["sun_el"], hor), visible(e["earth_az"], e["earth_el"], hor)
    step_h = e["step_min"] / 60
    sel = np.array(e["sun_el"])
    return dict(illumination_fraction=round(float(sv.mean()), 4), longest_dark_hours=round(longest_run(sv) * step_h, 1),
                earth_visible_fraction=round(float(ev.mean()), 4), longest_no_earth_hours=round(longest_run(ev) * step_h, 1),
                mean_sun_el_when_up=round(float(sel[sv].mean()), 3) if sv.any() else 0.0)


def main():
    for d in ("dem", "horizon", "ephemeris"):
        os.makedirs(os.path.join(D, d), exist_ok=True)
    skip = "--skip-ephemeris" in sys.argv
    sites, summary = [], {}
    for s in SITES:
        print("site", s["id"], flush=True)
        dem = site_dem(s)
        horizon_json(s, dem)
        c = SIZE // 2
        elev = float(bilinear(dem, np.array(c - 0.5), np.array(c - 0.5)))
        sites.append(dict(id=s["id"], name=s["name"], lat=s["lat"], lon=s["lon"], dem_file=f"dem/{s['id']}.bin",
                          dem_size_px=SIZE, meters_per_px=MPP, elev_min_m=round(float(dem.min()), 1),
                          elev_max_m=round(float(dem.max()), 1), poi_elev_m=round(elev, 1),
                          dem_source=DEM_SOURCE, dem_url=DEM_URL))
        if not skip or not os.path.exists(os.path.join(D, "ephemeris", s["id"] + ".json")):
            ephemeris(s, elev)
        summary[s["id"]] = summarize(s)
        print(s["id"], summary[s["id"]], flush=True)
    json.dump(sites, open(os.path.join(D, "sites.json"), "w"), indent=1)
    json.dump(summary, open(os.path.join(D, "summary.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
