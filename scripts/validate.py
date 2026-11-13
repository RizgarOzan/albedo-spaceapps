"""Compare modelled illumination / Earth visibility with NASA LOLA published maps (Mazarico et al. 2011 method).
Usage: .venv/Scripts/python scripts/validate.py   (needs data/summary.json from build_data.py)"""
import json, os, sys
import numpy as np, requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lunar import *

D = os.path.join(ROOT, "data")
FILES = {"sun": "AVGVISIB_85S_060M_201608.IMG", "earth": "AVGVISIB_85S_060M_201608_EARTH.IMG"}


def load(name):
    os.makedirs(CACHE, exist_ok=True)
    f = os.path.join(CACHE, name)
    if not os.path.exists(f):
        open(f, "wb").write(requests.get(ILL_BASE + name, timeout=600).content)
    return np.fromfile(f, "<i2").reshape(ILL_N, ILL_N) * 4e-5


def err(model, pub):
    return dict(abs_err=round(model - pub, 4), rel_err_pct=round(100 * (model - pub) / pub, 1) if pub else None)


def main():
    maps = {k: load(v) for k, v in FILES.items()}
    sites = {s["id"]: s for s in json.load(open(os.path.join(D, "sites.json")))}
    summ = json.load(open(os.path.join(D, "summary.json")))
    out = dict(
        published_products={
            "sun": ILL_BASE + FILES["sun"], "earth": ILL_BASE + FILES["earth"],
            "citation": "NASA PGDA 'Lunar Polar Illumination' https://pgda.gsfc.nasa.gov/products/69 ; method: Mazarico et al. 2011, "
                        "Icarus 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030; LDEM_85S_060M, hourly steps over 18.6 yr, "
                        "fraction of timesteps sunlit by any fraction of the solar disc (sun) / Earth visible (earth), at surface height.",
        },
        comparisons=[], literature=[])
    for sid, s in sites.items():
        r, c = to_pix(s["lat"], s["lon"], ILL_N, ILL_RES)
        ri, ci = int(round(r)), int(round(c))
        for key, mk in (("sun", "illumination_fraction"), ("earth", "earth_visible_fraction")):
            m = maps[key]
            patch = m[ri - 2:ri + 3, ci - 2:ci + 3]  # 5x5 px = 300 m
            pub = float(bilinear(m, np.array(r), np.array(c)))
            out["comparisons"].append(dict(
                site=sid, quantity=mk, modelled=summ[sid][mk], published_at_poi=round(pub, 4),
                published_300m_patch_min=round(float(patch.min()), 4), published_300m_patch_max=round(float(patch.max()), 4),
                **err(summ[sid][mk], pub)))
    # sensitivity: published products count the Sun as lit if ANY fraction of the disc is visible, at 0 m height
    from build_data import visible, longest_run
    out["sensitivity"] = []
    for sid, st in sites.items():
        dem = np.fromfile(os.path.join(D, st["dem_file"]), "<f4").reshape(st["dem_size_px"], -1)
        e = json.load(open(os.path.join(D, "ephemeris", sid + ".json")))
        for h in (2.0, 0.0):
            hor = horizon(dem, st["meters_per_px"], h)
            for limb in (0.0, 0.2667):
                v = visible(e["sun_az"], np.array(e["sun_el"]) + limb, hor)
                out["sensitivity"].append(dict(site=sid, observer_h_m=h, sun_limb_deg=limb,
                    illumination_fraction=round(float(v.mean()), 4), longest_dark_hours=float(longest_run(v))))
    sh = summ["shackleton"]
    out["literature"].append(dict(
        source="Mazarico et al. 2011, Icarus 211, abstract (NTRS 20120010094): location near Shackleton rim sunlit continuously ~240 days, longest total darkness ~1.5 days",
        url="https://ntrs.nasa.gov/citations/20120010094", site="shackleton",
        published_longest_dark_hours=36.0, modelled_longest_dark_hours=sh["longest_dark_hours"],
        **{k: v for k, v in err(sh["longest_dark_hours"], 36.0).items()},
        caveat="Published value is for the single best rim location over 18.6 yr, 0 m height; ours is a specific rim pixel, 2 m observer, 2027 only."))
    json.dump(out, open(os.path.join(D, "validation.json"), "w"), indent=1)
    for c in out["comparisons"]:
        print(c)
    print(out["literature"])


if __name__ == "__main__":
    main()
