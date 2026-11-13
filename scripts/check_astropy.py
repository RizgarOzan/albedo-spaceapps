import astropy,numpy,pandas,matplotlib,spiceypy
from astropy import units as u
from astropy.constants import G,M_earth
print('astropy',astropy.__version__,'g=',(G*M_earth/(6371*u.km)**2).to(u.m/u.s**2))
