"""Sensitivity of the horizon and the 2027 Sun/Earth results to ray-march range and observer height.
Uses the 64 km DEM window (extend_range.big_dem) and the ephemerides in data/.
Usage: python scripts/sensitivity.py   -> data/sensitivity.json"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lunar import bilinear, R, ROOT
from build_data import visible, longest_run
from extend_range import big_dem

D = os.path.join(ROOT, "data")
RANGES_KM = (2.5, 5.0, 7.5, 10.24, 20.0, 30.0)
HEIGHTS = (0.0, 2.0, 5.0)


def horizon_r(dem, mpp, obs_h, max_range_m):
    n = dem.shape[0]
    c = n / 2 - 0.5
    z0 = bilinear(dem, np.array(c), np.array(c)) + obs_h
    d = np.arange(1, n) * mpp * 0.5
    d = d[d <= max_range_m + 1e-6]
    out = np.empty(360)
    for az in range(360):
        a = np.radians(az)
        rr = c - d * np.cos(a) / mpp; cc = c + d * np.sin(a) / mpp
        ok = (rr >= 0) & (rr <= n - 1) & (cc >= 0) & (cc <= n - 1)
        z = bilinear(dem, rr[ok], cc[ok]) - d[ok] ** 2 / (2 * R)
        out[az] = np.degrees(np.arctan2(z - z0, d[ok])).max() if ok.any() else 0.0
    return out


def metrics(e, hor):
    sv = visible(e["sun_az"], e["sun_el"], hor); ev = visible(e["earth_az"], e["earth_el"], hor)
    return dict(sun_frac=round(float(sv.mean()), 4), sun_visible_h=int(sv.sum()), longest_dark_h=int(longest_run(sv)),
                earth_frac=round(float(ev.mean()), 4), earth_visible_h=int(ev.sum()), longest_no_earth_h=int(longest_run(ev)),
                horizon_mean_deg=round(float(hor.mean()), 3), horizon_max_deg=round(float(hor.max()), 3))


def main():
    out = dict(note="2027 hourly ephemeris (1 h steps), Sun disc centre, 1600x1600 40 m DEM windows (64 km). "
                    "Range = max ray length; largest range = 30 km. Differences are vs the 30 km run.", sites={})
    for s in json.load(open(os.path.join(D, "sites.json"))):
        mpp = s["meters_per_px"]
        dem = big_dem(s)
        e = json.load(open(os.path.join(D, "ephemeris", s["id"] + ".json")))
        rec = dict(by_range_2m={}, by_height_10km={})
        full = horizon_r(dem, mpp, 2.0, RANGES_KM[-1] * 1000)
        for rk in RANGES_KM:
            hor = horizon_r(dem, mpp, 2.0, rk * 1000)
            m = metrics(e, hor)
            m["max_horizon_change_vs_full_deg"] = round(float(np.abs(full - hor).max()), 3)
            m["azimuths_changed_over_0.1deg"] = int((np.abs(full - hor) > 0.1).sum())
            rec["by_range_2m"][str(rk)] = m
        for h in HEIGHTS:
            rec["by_height_10km"][str(int(h))] = metrics(e, horizon_r(dem, mpp, h, RANGES_KM[-1] * 1000))
        out["sites"][s["id"]] = rec
        print(s["id"], json.dumps(rec))
    json.dump(out, open(os.path.join(D, "sensitivity.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
