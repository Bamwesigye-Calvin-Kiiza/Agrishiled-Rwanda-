# AgriShield Rwanda – End‑to‑End Project Overview

---

## 1. Problem Statement

Rwanda’s agricultural sector faces significant challenges due to climate variability, limited irrigation infrastructure, and high poverty rates in many districts. Decision‑makers need **granular, district‑ and sector‑level data** that combine:

- **Historical and projected climate variables** (precipitation, temperature, soil moisture).
- **Agricultural land use metrics** (total cropland, irrigated vs. unirrigated areas).
- **Socio‑economic indicators** (poverty percentages from the NISR EICV surveys).

Such integrated data enable evidence‑based planning for climate‑smart agriculture, targeted interventions, and resource allocation.

---

## 2. Solution Overview

The **AgriShield Rwanda** pipeline automates the creation of a comprehensive dataset that merges:

1. **Official NISR survey data** (cropland, irrigation, poverty).
2. **Real‑time climate reanalysis** from the ECMWF ERA5‑Land API (2026 season window).
3. **Geospatial centroids** derived from GADM district boundaries.
4. **Synthetic sector‑level micro‑data** generated from statistical distributions anchored on district‑level statistics.

The result is two high‑quality CSV files:
- `sas_district_baseline.csv` – one row per district (30 districts).
- `sas_sector_baseline.csv` – one row per sector (422 sectors).

These files are ready for downstream modelling, visualisation, or policy analysis.

---

## 3. Architecture Diagram

```mermaid
flowchart TD
    subgraph RawData[Raw Data Sources]
        A[District GeoJSON (GADM)]
        B[Sector GeoJSON (GADM)]
        C[NISR Survey Data (CSV/JSON)]
        D[ERA5‑Land Climate API]
    end
    subgraph Processing[Processing Steps]
        E[Extract District Centroids]
        F[Merge NISR with Centroids]
        G[Query ERA5‑Land per District]
        H[Compute Empirical Moisture Stress]
        I[Generate District CSV]
        J[Generate Sector Micro‑data]
        K[Write Processed CSVs]
    end
    subgraph Output[Outputs]
        L[ data/processed/sas_district_baseline.csv ]
        M[ data/processed/sas_sector_baseline.csv ]
    end

    A --> E --> F --> G --> H --> I --> L
    B --> J --> K --> M
    C --> F
    D --> G
```

---

## 4. Datasets Used

| Dataset | Type | Raw Source | Processed Output |
|---|---|---|---|
| **District Boundaries (GADM Level 2)** | Vector (GeoJSON) | `data/raw/rwanda_districts_lvl2.json` – downloaded from the GADM portal (global administrative boundaries). | Used only for centroid extraction; not saved separately. |
| **Sector Boundaries (GADM Level 3)** | Vector (GeoJSON) | `data/raw/rwanda_sectors_lvl3.json` – GADM Level‑3 districts‑to‑sectors mapping. | Not saved directly; feeds sector‑level synthetic generation. |
| **NISR Official Survey (EICV & SAS baseline)** | Tabular (json list in code) | Hard‑coded list in `fetch_real_climate_and_sas.py` (derived from NISR 2024‑2025 reports). | `data/processed/sas_district_baseline.csv` (30 rows). |
| **ERA5‑Land Climate Reanalysis** | Time‑series (API) | Open‑Meteo wrapper for ECMWF ERA5‑Land (2026‑01‑01 to 2026‑03‑31). | Integrated into district CSV (precip, temperature, soil moisture, dry‑spell days). |
| **Synthetic Sector Micro‑data** | Generated | Random perturbations around district statistics (Gaussian noise, uniform offsets). | `data/processed/sas_sector_baseline.csv` (422 rows). |

---

## 5. Dataset Sources & Access

- **GADM** – Global Administrative Areas. Download the Rwanda Level‑2 and Level‑3 GeoJSON files from <https://gadm.org/download_country_v3.html> (choose *Rwanda*). The files are stored under `data/raw/`.
- **NISR (National Institute of Statistics Rwanda)** – Official poverty and cropland statistics. The figures are extracted from the *EICV Poverty Rates & SAS Cropland/Irrigation Baselines* report (public PDF available on the NISR website). For this prototype the values are embedded directly in the script.
- **ERA5‑Land** – Climate reanalysis provided via the Open‑Meteo archive API (no authentication required). Example request format used in the script:
  ```
  https://archive-api.open-meteo.com/v1/archive?latitude=<lat>&longitude=<lon>&start_date=2026-01-01&end_date=2026-03-31&daily=precipitation_sum,temperature_2m_mean,soil_moisture_0_to_7cm_mean&timezone=Africa%2FKigali
  ```
- **Synthetic Generation** – Random seeds (`np.random.seed(42)`) ensure reproducibility. Distribution parameters are documented in the code comments.

---

## 6. End‑to‑End Project Description

1. **Prepare the workspace** – Ensure `data/raw/` and `data/processed/` directories exist (`os.makedirs`).
2. **Load district geometry** – Parse the GADM district GeoJSON and compute the geographic centroid for each district using a recursive point‑extraction algorithm.
3. **Load NISR survey data** – A list of dictionaries (hard‑coded) containing `total_cropland_ha`, `irrigated_pct`, and `eicv_poverty_pct` per district.
4. **Merge geometry with survey data** – Create a Pandas DataFrame (`df_nisr`) and calculate `unirrigated_ha`.
5. **Fetch climate variables** – For each district, request ERA5‑Land daily data for the 2026 season, then compute:
   - Total precipitation (mm)
   - Mean temperature (°C)
   - Mean soil moisture (m³ / m³)
   - Number of dry‑spell days (precip < 1 mm)
6. **Calculate empirical moisture stress** – Combine soil‑moisture deficit and dry‑spell intensity using a weighted formula.
7. **Save district baseline** – Write `sas_district_baseline.csv` containing all raw and derived fields.
8. **Generate sector‑level micro‑data** – Load the sector GeoJSON, iterate over each sector, and:
   - Sample random variations for soil moisture, dry days, and poverty.
   - Derive sector‑specific cropland area and unirrigated hectares.
   - Re‑compute moisture‑stress index at sector granularity.
9. **Save sector dataset** – Write `sas_sector_baseline.csv` (422 rows).
10. **Optional downstream steps** – The CSVs can be loaded into a model pipeline (`model_pipeline.py`) for forecasting, risk mapping, or policy scenario analysis.

---

## 7. References to Core Code

- **Data fetching & processing** – [`fetch_real_climate_and_sas.py`](file:///Users/mac/agrishield-rwanda/src/fetch_real_climate_and_sas.py)
- **Model training / inference pipeline** – [`model_pipeline.py`](file:///Users/mac/agrishield-rwanda/src/model_pipeline.py)
- **Provenance PDF generation** – [`generate_data_provenance_pdf.py`](file:///Users/mac/agrishield-rwanda/src/generate_data_provenance_pdf.py)

---

*This document provides a high‑level view of the AgriShield Rwanda project, suitable for stakeholders, data scientists, and developers who wish to understand or extend the pipeline.*
