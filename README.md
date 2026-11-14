# Lunar Light Clock

NASA Space Apps 2026, team Albedo. Challenge: Lunar Landing Site Navigator.

Lunar Light Clock shows when the Sun and the Earth are above the horizon at candidate landing sites near the Moon's south pole (Shackleton rim, Nobile rim, Malapert summit). You pick a date and a site in the browser and see the terrain, the horizon, the Sun and Earth tracks and a site comparison table. No install needed.

- Live demo: https://rizgarozan.github.io/albedo-spaceapps/web/
- Demo video: https://drive.google.com/file/d/1rPj176F5zUi0JRNA2u6bpzinZuVr6UCI/view
- Project text: [docs/submission.md](docs/submission.md)

## NASA data

- LRO LOLA 20 m south polar elevation model (NASA PGDA).
- Sun and Earth positions for 2027 from JPL Horizons.
- Validation against the NASA/LOLA-team average Sun and Earth visibility maps (PGDA product 69).

## How it works

A Python pipeline reads a 20 km window of the DEM around each site, ray-marches a 360 degree horizon, and compares it with the hourly Sun and Earth azimuth and elevation from Horizons. The viewer is static three.js, no server.

Known limits, stated openly: the horizon only reaches 30 km, one year is compared with an 18.6-year NASA average, and results should be read as plus or minus 10 points. Numbers and caveats are in [docs/validation.md](docs/validation.md).

## Run it

Viewer: serve the repo root with any static server and open `web/`.

Data pipeline (Python 3.11+): `pip install -r requirements.txt`, then `python scripts/build_data.py` and `python scripts/validate.py`. Steps are in [docs/data-pipeline.md](docs/data-pipeline.md).

Tests: `cd web && node --test test/logic.test.mjs`, and `node scripts/check_data.mjs`.
