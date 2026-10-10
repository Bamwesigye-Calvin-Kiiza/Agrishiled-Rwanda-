import os
import urllib.request

# Rwanda Administrative Boundaries from GADM 4.1
# Level 2 = 30 Districts (Akarere)
# Level 3 = 416 Sectors (Umurenge)
URLS = {
    "data/raw/rwanda_districts_lvl2.json": "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_RWA_2.json",
    "data/raw/rwanda_sectors_lvl3.json": "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_RWA_3.json"
}

for dest_path, url in URLS.items():
    if not os.path.exists(dest_path):
        print(f"Downloading {dest_path}...")
        try:
            urllib.request.urlretrieve(url, dest_path)
            print(f"Successfully downloaded {dest_path}")
        except Exception as e:
            print(f"Error downloading {url}: {e}")
    else:
        print(f"File already exists: {dest_path}")
