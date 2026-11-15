"""Same Sun/Earth visibility numbers as the 2027 run, for 2026 to 2034 (9 years, about half a lunar node cycle).
Horizons calls only (hourly, 365 d, cached in data/cache); DEM windows already in data/. 2027 is recomputed from
data/ephemeris so all three years go through the same code path.
Usage: python scripts/multiyear.py   -> data/multiyear.json"""
import json, os, sys, time
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lunar import ROOT
from build_data import visible, N_STEPS
from sensitivity import horizon_r, metrics
from extend_range import big_dem

D = os.path.join(ROOT, "data")
CACHE = os.path.join(D, "cache")
YEARS = tuple(range(2026, 2035))


def _query(s, target, start, stop):
    """Horizons REST API (same query astroquery sends: topocentric Moon site, quantity 4 = az/el)."""
    import urllib.parse, urllib.request
    q = dict(format="text", COMMAND=f"'{target}'", OBJ_DATA="'NO'", MAKE_EPHEM="'YES'", EPHEM_TYPE="'OBSERVER'",
             CENTER="'coord@301'", COORD_TYPE="'GEODETIC'",
             SITE_COORD=f"'{s['lon'] % 360},{s['lat']},{s['poi_elev_m'] / 1000}'",
             START_TIME=f"'{start}'", STOP_TIME=f"'{stop}'", STEP_SIZE="'60m'", QUANTITIES="'4'",
             ANG_FORMAT="'DEG'", CSV_FORMAT="'YES'", EXTRA_PREC="'NO'")
    txt = urllib.request.urlopen("https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(q), timeout=120).read().decode()
    body = txt.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
    return [(float(l.split(",")[3]), float(l.split(",")[4])) for l in body]


def horizons_year(s, year, target):
    f = os.path.join(CACHE, f"horizons_{s['id']}_{year}_{target}.json")
    if os.path.exists(f):
        d = json.load(open(f)); return np.array(d["az"]), np.array(d["el"])
    t0 = np.datetime64(f"{year}-01-01T00:00")
    az, el, chunk = [], [], 24 * 60
    for i in range(0, N_STEPS, chunk):
        m = min(chunk, N_STEPS - i)
        a = t0 + np.timedelta64(i, "h"); b = t0 + np.timedelta64(i + m - 1, "h")
        for attempt in range(3):
            try:
                eph = _query(s, target, str(a).replace("T", " "), str(b).replace("T", " "))
                break
            except Exception as e:
                print("retry", attempt, repr(e)[:150], flush=True); time.sleep(5)
        else:
            raise RuntimeError(f"Horizons failed: {s['id']} {year} {target}")
        assert len(eph) == m, (len(eph), m)
        az += [r[0] for r in eph]; el += [r[1] for r in eph]
        time.sleep(1)
    json.dump(dict(az=[float(v) for v in az], el=[float(v) for v in el]), open(f, "w"))
    return np.array(az), np.array(el)


def eph_for(s, year):
    if year == 2027:
        e = json.load(open(os.path.join(D, "ephemeris", s["id"] + ".json")))
        return dict(sun_az=e["sun_az"], sun_el=e["sun_el"], earth_az=e["earth_az"], earth_el=e["earth_el"])
    sa, se = horizons_year(s, year, 10); ea, ee = horizons_year(s, year, 399)
    return dict(sun_az=sa, sun_el=se, earth_az=ea, earth_el=ee)


def main():
    out = dict(note="Hourly Horizons ephemerides, 365 d from Jan 1 of each year, 2 m observer, 30 km rays, Sun disc centre, "
                    "same 512x512 40 m DEM windows. 2027 is the existing ephemeris. spread_pts = (max - min over all the "
                    "years) * 100 for the fractions; spread_h for the longest spells.", sites={})
    for s in json.load(open(os.path.join(D, "sites.json"))):
        dem = big_dem(s)
        hor = horizon_r(dem, s["meters_per_px"], 2.0, 30000)
        years = {}
        for y in YEARS:
            m = metrics(eph_for(s, y), hor)
            years[str(y)] = {k: m[k] for k in ("sun_frac", "earth_frac", "longest_dark_h", "longest_no_earth_h")}
        sp = lambda k, f: round((max(v[k] for v in years.values()) - min(v[k] for v in years.values())) * f, 2)
        out["sites"][s["id"]] = dict(years=years, spread_pts=dict(sun=sp("sun_frac", 100), earth=sp("earth_frac", 100)),
                                     spread_h=dict(longest_dark=sp("longest_dark_h", 1), longest_no_earth=sp("longest_no_earth_h", 1)))
        print(s["id"], json.dumps(out["sites"][s["id"]]), flush=True)
    json.dump(out, open(os.path.join(D, "multiyear.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
