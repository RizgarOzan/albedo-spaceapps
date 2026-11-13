# albedo-spaceapps

NASA Space Apps 2026 (Albedo takımı) için yerel kurulum. Push edilmez.

Kurulum: `python -m venv .venv`, sonra `.venv\Scripts\pip install numpy pandas matplotlib astropy astroquery requests spiceypy`.

Doğrulama betikleri (`.venv\Scripts\python scripts\check_*.py`):
- check_astropy.py: paketler yüklü mü, astropy hesabı. Geçti.
- check_horizons.py: JPL Horizons'dan Ay vektörleri (astroquery). Geçti.
- check_nasa_api.py: api.nasa.gov DONKI, DEMO_KEY ile. 2026-11-13'te sunucu 404/500 verdi, kod değil sunucu sorunu; kendi NASA API anahtarı (ücretsiz, hesap gerekir) Rızgar'da.
- check_unity.py: Unity CLI yolunu bulur. Geçti.

Dış kaynaklar: `external_mission-viz` (nasa/mission-viz klonu), `data/jpl_dataverse_44299.html` (JPL mission design dataset sayfası).
Rızgar'da: NASA Earthdata hesabı, kişisel api.nasa.gov anahtarı, Unity paketleri (Unity Hub/Editor içinden).
