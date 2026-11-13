from astroquery.jplhorizons import Horizons
t=Horizons(id='301',location='500@399',epochs={'start':'2026-11-14','stop':'2026-11-15','step':'12h'})
print(t.vectors()['x','y','z'])
