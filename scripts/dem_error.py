"""Monte Carlo of DEM vertical error: add spatially correlated noise to the 64 km DEM window and re-run
the 30 km horizon + 2027 Sun/Earth metrics. Usage: python scripts/dem_error.py -> data/dem_error.json
Noise: Gaussian field, std SIGMA_M metres, correlation length CORR_M metres (assumed, LOLA vertical error is about 1 m)."""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sensitivity import horizon_r, metrics, D
from extend_range import big_dem

SIGMA_M, CORR_M, N, RANGE_M = 1.5, 1000.0, 20, 30000.0


def gaussian_filter(a, sigma_px):
    k = np.exp(-2 * (np.pi * sigma_px) ** 2 * (np.fft.fftfreq(a.shape[0])[:, None] ** 2 + np.fft.fftfreq(a.shape[1])[None, :] ** 2))
    return np.fft.ifft2(np.fft.fft2(a) * k).real


def main():
    rng = np.random.default_rng(2026)
    out = dict(note=f"{N} runs, 2027 hourly ephemeris, 30 km, observer 2 m. DEM noise: Gaussian field std {SIGMA_M} m, "
                    f"correlation length {CORR_M:.0f} m (assumed values, not measured). Reports mean and 5-95% range.", sites={})
    for s in json.load(open(os.path.join(D, "sites.json"))):
        mpp = s["meters_per_px"]
        dem = big_dem(s)
        e = json.load(open(os.path.join(D, "ephemeris", s["id"] + ".json")))
        base = metrics(e, horizon_r(dem, mpp, 2.0, RANGE_M))
        runs = []
        for _ in range(N):
            f = gaussian_filter(rng.standard_normal(dem.shape), CORR_M / mpp)
            f *= SIGMA_M / f.std()
            runs.append(metrics(e, horizon_r(dem + f, mpp, 2.0, RANGE_M)))
        rec = dict(baseline=base)
        for k in ("sun_frac", "earth_frac", "longest_dark_h", "longest_no_earth_h"):
            v = np.array([r[k] for r in runs], float)
            rec[k] = dict(mean=round(float(v.mean()), 4), p5=round(float(np.percentile(v, 5)), 4),
                          p95=round(float(np.percentile(v, 95)), 4))
        out["sites"][s["id"]] = rec
        print(s["id"], json.dumps(rec))
    json.dump(out, open(os.path.join(D, "dem_error.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
