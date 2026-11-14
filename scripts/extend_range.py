"""Extend the horizon ray-march to 30 km using a larger LDEM window (1600 x 1600 px at 40 m = 64 km wide).
Writes data/horizon/<id>.json (30 km range), data/summary.json, and caches the big window in data/cache/.
Usage: python scripts/extend_range.py"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lunar import window, horizon, ROOT, CACHE
from build_data import SITES, summarize, MPP

D = os.path.join(ROOT, "data")
BIG, RANGE_KM = 1600, 30.0


def edge_window(s):
    """Like lunar.window but pixels outside the 85S-90S tile become -1e5 m (no terrain, never blocks a ray)."""
    import lunar
    half = BIG * MPP / 2
    k = (np.arange(BIG) + 0.5) * MPP - half
    east, north = np.meshgrid(k, -k)
    lat, lon = lunar.local_to_latlon(s["lat"], s["lon"], east, north)
    rr, cc = lunar.to_pix(lat, lon, lunar.DEM_N, lunar.DEM_RES)
    ok = (rr >= 0) & (rr <= lunar.DEM_N - 4) & (cc >= 0) & (cc <= lunar.DEM_N - 4)
    pad = 3
    r0, r1 = int(np.floor(rr[ok].min())) - pad, int(np.ceil(rr[ok].max())) + pad + 1
    c0, c1 = int(np.floor(cc[ok].min())) - pad, int(np.ceil(cc[ok].max())) + pad + 1
    blk = lunar.fetch_rows(max(r0, 0), min(r1, lunar.DEM_N), max(c0, 0), min(c1, lunar.DEM_N))
    out = np.full((BIG, BIG), -1e5, np.float32)
    out[ok] = lunar.bilinear(blk, rr[ok] - max(r0, 0), cc[ok] - max(c0, 0)) * 1000.0
    print(s["id"], "pixels outside tile:", int((~ok).sum()), flush=True)
    return out


def big_dem(s):
    f = os.path.join(CACHE, f"bigdem_{s['id']}.npy")
    if not os.path.exists(f):
        np.save(f, edge_window(s))
    return np.load(f)


def horizon_range(dem, obs_h=2.0, max_range_km=RANGE_KM):
    import lunar
    n = dem.shape[0]
    c = n / 2 - 0.5
    z0 = lunar.bilinear(dem, np.array(c), np.array(c)) + obs_h
    d = np.arange(1, n) * MPP * 0.5
    d = d[d <= max_range_km * 1000 + 1e-6]
    out = np.empty(360)
    for az in range(360):
        a = np.radians(az)
        rr = c - d * np.cos(a) / MPP; cc = c + d * np.sin(a) / MPP
        ok = (rr >= 0) & (rr <= n - 1) & (cc >= 0) & (cc <= n - 1)
        z = lunar.bilinear(dem, rr[ok], cc[ok]) - d[ok] ** 2 / (2 * lunar.R)
        out[az] = np.degrees(np.arctan2(z - z0, d[ok])).max()
    return out


def main():
    summary = {}
    for s in SITES:
        dem = big_dem(s)
        h = horizon_range(dem)
        out = dict(id=s["id"], az_step_deg=1, observer_height_m=2, max_range_km=RANGE_KM,
                   note="ray-march from DEM centre on a 64 km LDEM window, spherical curvature included; terrain beyond 30 km not modelled",
                   horizon_deg=[round(float(v), 3) for v in h])
        json.dump(out, open(os.path.join(D, "horizon", s["id"] + ".json"), "w"))
        summary[s["id"]] = summarize(s, h)
        print(s["id"], summary[s["id"]], flush=True)
    json.dump(summary, open(os.path.join(D, "summary.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
