# AgriShield Rwanda

---

## 1. Test User Credentials

To access the interactive dashboard and spatial prioritization engine:

| Field | Value |
|---|---|
| **Login URL** | `http://127.0.0.1:8000/login/` (or `/login/` on deployed server) |
| **Username** | `minagri_officer` |
| **Password** | `AgriShield2026!` |

---

## 2. What Data the Application Uses

The application integrates official agricultural statistics, socio-economic surveys, and meteorological reanalysis:

| Dataset | Source | Purpose | Link |
|---|---|---|---|
| **District Boundaries (GADM Level 2)** | GADM v4.1 | Spatial polygons and centroids for Rwanda's 30 districts | [GADM Rwanda](https://gadm.org/download_country_v3.html) |
| **Sector Boundaries (GADM Level 3)** | GADM v4.1 | Spatial polygons for Rwanda's 422 sectors | [GADM Rwanda](https://gadm.org/download_country_v3.html) |
| **NISR SAS Cropland & Irrigation Baselines** | National Institute of Statistics of Rwanda (NISR) | District cropland area (ha) and irrigated vs. unirrigated hectares | [NISR Portal](https://www.statistics.gov.rw) |
| **NISR EICV Poverty Indices** | NISR Integrated Household Living Conditions Survey (EICV) | District & sector household poverty incidence percentages | [NISR Portal](https://www.statistics.gov.rw) |
| **ERA5-Land Climate Reanalysis** | ECMWF / Open-Meteo API | Daily precipitation, mean temperature, 0–7cm soil moisture deficit, and dry spell days (<1mm) | [Open-Meteo API](https://open-meteo.com/en/docs/historical-weather-api) |

All processed datasets are available locally in the `data/processed/` directory:
- `data/processed/sas_district_baseline.csv` (30 districts)
- `data/processed/sas_sector_baseline.csv` (422 sectors)
- `data/processed/district_predictions.csv` & `sector_predictions.csv` (ML risk predictions)

---

## 3. What Information the Application Communicates

1. **Targeting High-Vulnerability Areas**: Combines climate drought risk, rainfed cropland footprint, and household poverty into a transparent, composite Small-Scale Irrigation Technology (SSIT) priority score.
2. **Impact Optimization**: Estimates total rainfed cropland hectares protected, average poverty share of targeted farmers, and subsidy budget required ($K \times \$1,200$ per solar pump unit).
3. **Machine Learning Explainability (TreeSHAP)**: Explains the algorithmic drivers behind risk predictions (e.g. soil moisture deficit vs. dry spell duration).
4. **Objective Resource Allocation**: Provides government planners (MINAGRI/RAB) with an evidence-based roadmap to distribute irrigation subsidies equitably under NST2.

---

## 4. How Users Can Interact with the Dashboard

- **Geospatial Map (3D/2D)**: Rotate, zoom, and tilt the map; hover over districts or sectors to inspect local climate and poverty statistics; toggle between District (30) and Sector (422) levels.
- **Metric Coloring**: Switch polygon fill colors to view *Allocation Status*, *Priority Score*, *Drought Risk*, *Poverty*, or *Cropland*.
- **Multi-Criteria Weight Sliders**: Adjust weights in real time ($w_1\text{ Climate} + w_2\text{ Cropland} + w_3\text{ Poverty} = 1.0$) to re-rank administrative units dynamically.
- **Budget Ceiling Slider**: Set the available pump subsidy quota ($K$) to automatically designate top-ranking targets.
- **Search Bar**: Type any district or sector name in the deployment table to instantly filter rows.
- **Manual Pump Allocations**: Click `+ Allocate Pump` or `Deallocate` on specific units, or use `+ Allocate All Identified` to commit allocations.
- **CSV Export**: Click `Export Deployment CSV` to download the finalized subsidy deployment schedule.

---

## 5. How to Run the Solution

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run migrations and collect static files
python manage.py migrate
python manage.py collectstatic --noinput

# 3. Start local development server
python manage.py runserver 8000
```

Open `http://127.0.0.1:8000/` in your browser.

---

## 6. Student Eligibility Verification

Official eligibility verification documents for both team members are provided in the [`eligibility/`](eligibility/) directory:

| Team Member | Verification Document | Link |
|---|---|---|
| **Calvin Bamwesigye Kiiza** | Student Card / Eligibility Proof | [Calvin Bamwesigye Kiiza.png](eligibility/Calvin%20Bamwesigye%20Kiiza.png) |
| **Irakoze Carine Uwase** | Student Card / Eligibility Proof | [Irakoze Carine Uwase.png](eligibility/Irakoze%20Carine%20Uwase.png) |
