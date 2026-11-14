"""Independent horizon check (far field, 4 to 30 km; closer than 4 km a 40 m cell is wider than 1 degree of azimuth gaps open): instead of ray-marching, take every DEM cell within 30 km of the site, compute its
elevation angle (with curvature drop d^2/2R) and azimuth, and keep the maximum per 1 degree azimuth bin.
No interpolation along rays, different code path from lunar.horizon. Compared with the ray-march restricted to the same 4-30 km band.
Usage: python scripts/independent_horizon.py -> data/independent_horizon.json"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lunar import R, ROOT
from build_data import SITES, MPP, visible, longest_run
from extend_range import big_dem, BIG

D = os.path.join(ROOT, "data")


def main():
    k = (np.arange(BIG) + 0.5 - BIG / 2) * MPP
    east, north = np.meshgrid(k, -k)
    dist = np.hypot(east, north)
    az = (np.degrees(np.arctan2(east, north)) + 360) % 360
    out = {}
    for s in SITES:
        dem = big_dem(s)
        z0 = dem[BIG // 2 - 1:BIG // 2 + 1, BIG // 2 - 1:BIG // 2 + 1].mean() + 2.0
        ok = (dist >= 4000) & (dist <= 30000) & (dem > -9e4)
        ang = np.degrees(np.arctan2(dem[ok] - dist[ok] ** 2 / (2 * R) - z0, dist[ok]))
        # a cell at azimuth a also bounds the neighbouring bins by +-half its angular width: use +-0.5 deg bins around each integer
        hor = np.full(360, -90.0)
        a = az[ok]
        for off in (-0.5, 0.0, 0.5):
            b = np.round(a + off).astype(int) % 360
            np.maximum.at(hor, b, ang)
        full = np.array(json.load(open(os.path.join(D, "horizon", s["id"] + ".json")))["horizon_deg"])
        import lunar
        c = BIG / 2 - 0.5
        z0r = lunar.bilinear(dem, np.array(c), np.array(c)) + 2.0
        dd = np.arange(1, BIG) * MPP * 0.5; dd = dd[(dd >= 4000) & (dd <= 30000)]
        ref = np.empty(360)
        for q in range(360):
            aa = np.radians(q); rr = c - dd * np.cos(aa) / MPP; cc = c + dd * np.sin(aa) / MPP
            ref[q] = np.degrees(np.arctan2(lunar.bilinear(dem, rr, cc) - dd ** 2 / (2 * R) - z0r, dd)).max()
        e = json.load(open(os.path.join(D, "ephemeris", s["id"] + ".json")))
        res = {}
        for name, h in (("ray_march_4_30km", ref), ("all_cells_4_30km", hor), ("ray_march_full_0_30km", full)):
            sv, ev = visible(e["sun_az"], e["sun_el"], h), visible(e["earth_az"], e["earth_el"], h)
            res[name] = dict(sun=round(float(sv.mean()), 4), longest_dark_h=int(longest_run(sv)), earth=round(float(ev.mean()), 4))
        d = hor - ref
        res["horizon_diff_deg"] = dict(mean=round(float(d.mean()), 3), mean_abs=round(float(np.abs(d).mean()), 3), max_abs=round(float(np.abs(d).max()), 3))
        out[s["id"]] = res
        print(s["id"], json.dumps(res), flush=True)
    json.dump(out, open(os.path.join(D, "independent_horizon.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
