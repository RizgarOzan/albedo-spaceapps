"""Observer-height band (0/2/5 m) and 5x5-patch comparison against the NASA AVGVISIB maps; also writes the
published-map patches the Navigator uses (data/published/<id>_{sun,earth}.bin, 513x513 uint8 nodes at 40 m, centre node = the site, fraction*255).
Usage: .venv/Scripts/python scripts/validate_band.py   -> data/validation_band.json"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lunar import *
from build_data import visible
from extend_range import big_dem

D = os.path.join(ROOT, "data")
FILES = {"sun": "AVGVISIB_85S_060M_201608.IMG", "earth": "AVGVISIB_85S_060M_201608_EARTH.IMG"}
HEIGHTS = (0.0, 2.0, 5.0)


def horizon_at(dem, mpp, row, col, obs_h, max_range=30000.0):
    n = dem.shape[0]
    z0 = bilinear(dem, np.array(row), np.array(col)) + obs_h
    d = np.arange(1, n) * mpp * 0.5
    d = d[d <= max_range]
    out = np.empty(360)
    for az in range(360):
        a = np.radians(az)
        rr = row - d * np.cos(a) / mpp; cc = col + d * np.sin(a) / mpp
        ok = (rr >= 0) & (rr <= n - 1) & (cc >= 0) & (cc <= n - 1)
        z = bilinear(dem, rr[ok], cc[ok]) - d[ok] ** 2 / (2 * R)
        out[az] = np.degrees(np.arctan2(z - z0, d[ok])).max() if ok.any() else 0.0
    return out


def frac(e, hor, body):
    return float(visible(e[body + "_az"], e[body + "_el"], hor).mean())


def write_patches(maps, s):
    """Published maps on the viewer's frame: 513x513 nodes 40 m apart, the middle node is the site itself.
    (The earlier 256x256 patch at 80 m/px averaged four cells at the site and read 0.64 where the map says 0.87.)"""
    k = (np.arange(513) - 256) * 40.0
    east, north = np.meshgrid(k, -k)
    lat, lon = local_to_latlon(s["lat"], s["lon"], east, north)
    rr, cc = to_pix(lat, lon, ILL_N, ILL_RES)
    for key in ("sun", "earth"):
        v = np.clip(bilinear(maps[key], rr, cc), 0, 1)
        (np.round(v * 255).astype(np.uint8)).tofile(os.path.join(D, "published", f"{s['id']}_{key}.bin"))


def main():
    maps = {k: np.fromfile(os.path.join(CACHE, v), "<i2").reshape(ILL_N, ILL_N) * 4e-5 for k, v in FILES.items()}
    sites = json.load(open(os.path.join(D, "sites.json")))
    os.makedirs(os.path.join(D, "published"), exist_ok=True)
    out = dict(note="Model: 2027, Horizons, Sun disc centre, ray-march to 30 km on the 64 km window. Published: NASA AVGVISIB 60 m, 18.6 yr, 0 m.", sites={})
    for s in sites:
        mpp = s["meters_per_px"]
        dem = big_dem(s)  # 64 km window, rays capped at 30 km
        n = dem.shape[0]
        e = json.load(open(os.path.join(D, "ephemeris", s["id"] + ".json")))
        c0 = n / 2 - 0.5
        rs, cs = to_pix(s["lat"], s["lon"], ILL_N, ILL_RES)
        ri, ci = int(round(rs)), int(round(cs))
        rec = dict(range_km=30.0, poi={}, patch5x5={})
        for h in HEIGHTS:
            hor = horizon_at(dem, mpp, c0, c0, h)
            rec["poi"][str(int(h))] = dict(sun=round(frac(e, hor, "sun"), 4), earth=round(frac(e, hor, "earth"), 4))
        hcache = {}
        for key in ("sun", "earth"):
            m = maps[key]
            pub = {}; mod = {int(h): [] for h in HEIGHTS}; pubv = []
            for di in range(-2, 3):
                for dj in range(-2, 3):
                    east = (ci + dj - cs) * ILL_RES; north = -(ri + di - rs) * ILL_RES
                    row, col = c0 - north / mpp, c0 + east / mpp
                    pubv.append(float(m[ri + di, ci + dj]))
                    for h in HEIGHTS:
                        if (di, dj, h) not in hcache:
                            hcache[(di, dj, h)] = horizon_at(dem, mpp, row, col, h)
                        mod[int(h)].append(frac(e, hcache[(di, dj, h)], key))
            pubv = np.array(pubv)
            rec["patch5x5"][key] = dict(published_mean=round(float(pubv.mean()), 4), by_height={
                str(h): dict(model_mean=round(float(np.mean(v)), 4), mean_dev=round(float(np.mean(np.array(v) - pubv)), 4),
                             rmse=round(float(np.sqrt(np.mean((np.array(v) - pubv) ** 2))), 4)) for h, v in mod.items()})
        out["sites"][s["id"]] = rec
        write_patches(maps, s)
        print(s["id"], json.dumps(rec))
    json.dump(out, open(os.path.join(D, "validation_band.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
