import requests
r=requests.get('https://api.nasa.gov/DONKI/FLR',params={'startDate':'2026-11-01','endDate':'2026-11-10','api_key':'DEMO_KEY'},timeout=30)
print(r.status_code,len(r.json()) if r.ok else r.text[:100])
