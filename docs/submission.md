# Submission text (NASA Space Apps 2026, team Albedo, challenge: Lunar Landing Site Navigator)

Project Name: Lunar Light Clock

High-Level Project Summary:
Lunar Light Clock shows when the Sun and the Earth are visible from three candidate landing sites near the Moon's south pole (Shackleton rim, Nobile rim, Malapert summit). It combines the LRO LOLA elevation model with JPL Horizons positions of the Sun and Earth, so a mission planner can slide through a year of dates and compare sites in one page, no install needed.

Link to Project Demo: https://drive.google.com/file/d/1rPj176F5zUi0JRNA2u6bpzinZuVr6UCI/view
Link to Final Project: https://rizgarozan.github.io/albedo-spaceapps/web/

Detailed Project Description:
On the Shackleton rim the Sun can stay below the horizon for 102 hours in a row in 2027. Mission planners must pick a site fast, and the south pole makes it hard: the Sun skims the horizon, so a few metres of terrain decide power, and Earth is often below the horizon. Planners need to know, for a site and a date, whether the Sun gives power and whether Earth is in line of sight for communication. Our pipeline reads the LOLA 20 m south polar DEM, resamples a 20 km wide window around each site to 40 m, and ray-marches (rays reach 10 km, the window's half width) a 360 degree horizon (2 m observer, sphere curvature). Hourly Sun and Earth azimuth/elevation for 2027 come from JPL Horizons. A body is visible when its elevation is above the horizon at its azimuth. The browser viewer (three.js, static files) shows the terrain, the horizon, the Sun/Earth tracks, a date slider, a landing-site navigator (click any point, get its Sun and Earth score) and a site comparison table with illumination fraction, longest darkness and longest time without Earth.
Validation: we compared our Sun and Earth visibility with the NASA/LOLA-team average visibility maps. at the three site points our Sun fractions are 2 to 8 points above NASA's (+1.9, +6.7, +8.0) and our Earth fractions 1 to 8 points below (-7.8, -0.6, -5.0). The comparison is not independent for site choice, the DEM range is limited to 10 km and one year is compared with an 18.6-year average (2026 and 2028 differ from 2027 by 0.2 to 2.3 points in Sun fraction). Full numbers and caveats are in docs/validation.md. Treat results as +-10 points.

Use of Super Intelligence (SI):
We used AI coding assistants (Anthropic Claude models, plus free open-weight models served through OpenRouter) to write the data pipeline, the browser viewer, the navigator, the tests and the slide text, under our direction. We reviewed the code and ran the scripts and tests ourselves. AI does not produce any number shown in the app: every value comes from NASA LOLA elevation data and JPL Horizons positions, and the validation compares them with NASA's published maps. AI-written text was checked by us against the data and the repository documents.

NASA Data:
LRO LOLA LDEM_85S_20M_FLOAT (PDS Geosciences Node); JPL Horizons ephemerides; NASA/LOLA-team AVGVISIB_85S_060M_201608 Sun and Earth visibility maps (NASA PGDA).

Space Agency Partner Data and Other References:
Mazarico et al. 2011, Icarus 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030; three.js (MIT); astropy, astroquery, numpy (BSD); NASA Moon Trek and Quickmap were used for orientation only. Code: https://github.com/RizgarOzan/albedo-spaceapps

Slides (max 7, English): 1 title and team; 2 problem (lighting and Earth link at the south pole); 3 data (LOLA DEM, Horizons); 4 method (horizon ray march); 5 demo screenshot; 6 validation numbers and limits; 7 next steps and references.
