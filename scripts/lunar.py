"""Shared helpers: LOLA polar stereographic geometry, DEM window fetch/resample, horizon ray-march."""
import os, numpy as np, requests

R = 1737400.0  # m, LOLA reference sphere
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "data", "cache")
DEM_URL = ("https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/"
           "lola_gdr/polar/float_img/ldem_85s_20m_float.img")
DEM_N, DEM_RES = 15168, 20.0          # LDEM_85S_20M_FLOAT: 15168^2 float32, 20 m/px, 85S-90S
ILL_BASE = "http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/"
ILL_N, ILL_RES = 5058, 60.0           # AVGVISIB_85S_060M_201608 (int16, scale 4e-5)


def to_xy(lat, lon):
    """Planetocentric lat/lon (deg, lat<0) -> polar stereographic metres (true at pole). x east-right, y up."""
    rho = 2 * R * np.tan(np.radians(90 + np.asarray(lat, float)) / 2)
    l = np.radians(lon)
    return rho * np.sin(l), rho * np.cos(l)


def to_pix(lat, lon, n, res):
    """Return (row, col) float pixel-centre indices in an n x n south-polar grid.
    Orientation verified against known crater floors (Shackleton, Faustini, Cabeus)."""
    x, y = to_xy(lat, lon)
    c = n / 2 - 0.5
    return c - y / res, c + x / res


def local_to_latlon(lat0, lon0, east, north):
    """Azimuthal-equidistant inverse around (lat0,lon0): east/north metres -> lat, lon (deg)."""
    p0, l0 = np.radians(lat0), np.radians(lon0)
    s = np.hypot(east, north) / R
    az = np.arctan2(east, north)
    lat = np.arcsin(np.sin(p0) * np.cos(s) + np.cos(p0) * np.sin(s) * np.cos(az))
    lon = l0 + np.arctan2(np.sin(az) * np.sin(s) * np.cos(p0), np.cos(s) - np.sin(p0) * np.sin(lat))
    return np.degrees(lat), np.degrees(lon)


def fetch_rows(r0, r1, c0, c1):
    """Float32 block rows r0..r1-1, cols c0..c1-1 of the 20 m LDEM via HTTP Range (whole-row band,
    cached as .npy in data/cache). File is 920 MB; only the needed row band is transferred."""
    os.makedirs(CACHE, exist_ok=True)
    f = os.path.join(CACHE, f"ldem_{r0}_{r1}.npy")
    if not os.path.exists(f):
        rb = DEM_N * 4
        h = {"Range": f"bytes={r0 * rb}-{r1 * rb - 1}"}
        resp = requests.get(DEM_URL, headers=h, timeout=600)
        assert resp.status_code == 206, resp.status_code
        np.save(f, np.frombuffer(resp.content, "<f4").reshape(r1 - r0, DEM_N)[:, c0:c1].copy())
        np.save(f + ".meta.npy", np.array([c0, c1]))
    return np.load(f)


def bilinear(a, rr, cc):
    r0 = np.floor(rr).astype(int); c0 = np.floor(cc).astype(int)
    fr = rr - r0; fc = cc - c0
    r0 = np.clip(r0, 0, a.shape[0] - 2); c0 = np.clip(c0, 0, a.shape[1] - 2)
    return (a[r0, c0] * (1 - fr) * (1 - fc) + a[r0, c0 + 1] * (1 - fr) * fc
            + a[r0 + 1, c0] * fr * (1 - fc) + a[r0 + 1, c0 + 1] * fr * fc)


def window(lat0, lon0, size_px, m_per_px):
    """Resample LDEM to local ENU grid (north up, east right) centred on the site. Returns float32 [size,size], m."""
    half = size_px * m_per_px / 2
    k = (np.arange(size_px) + 0.5) * m_per_px - half
    east, north = np.meshgrid(k, -k)  # row 0 = north
    lat, lon = local_to_latlon(lat0, lon0, east, north)
    rr, cc = to_pix(lat, lon, DEM_N, DEM_RES)
    pad = 3
    r0, r1 = int(np.floor(rr.min())) - pad, int(np.ceil(rr.max())) + pad + 1
    c0, c1 = int(np.floor(cc.min())) - pad, int(np.ceil(cc.max())) + pad + 1
    assert r0 >= 0 and c0 >= 0 and r1 <= DEM_N and c1 <= DEM_N, "window outside 85S-90S tile"
    blk = fetch_rows(r0, r1, c0, c1)
    return (bilinear(blk, rr - r0, cc - c0) * 1000.0).astype(np.float32)  # LDEM_FLOAT is in km -> m


def horizon(dem, m_per_px, obs_h=2.0):
    """Max terrain elevation angle (deg) per integer azimuth (0=N, 90=E), ray-march from the centre pixel.
    Includes spherical-curvature drop d^2/2R. Max range = half window width (edge of DEM)."""
    n = dem.shape[0]
    cy = cx = n / 2 - 0.5
    z0 = bilinear(dem, np.array(cy), np.array(cx)) + obs_h
    d = np.arange(1, n // 2) * m_per_px * 0.5
    out = np.empty(360)
    for az in range(360):
        a = np.radians(az)
        rr = cy - d * np.cos(a) / m_per_px; cc = cx + d * np.sin(a) / m_per_px
        ok = (rr >= 0) & (rr <= n - 1) & (cc >= 0) & (cc <= n - 1)
        z = bilinear(dem, rr[ok], cc[ok]) - d[ok] ** 2 / (2 * R)
        out[az] = np.degrees(np.arctan2(z - z0, d[ok])).max() if ok.any() else 0.0
    return out
