import ee
import geopandas as gpd
import pandas as pd

# 1. Initialize Earth Engine (Run ee.Authenticate() once in your terminal)
ee.Initialize(project="your-gcp-project-id")

def fetch_climate_features_for_rwanda(
    start_date: str = "2026-01-01", 
    end_date: str = "2026-02-28",
    admin_geojson_path: str = "data/raw/rwanda_districts.geojson"
) -> pd.DataFrame:
    """
    Extracts CHIRPS precipitation and ERA5 soil moisture aggregated 
    by district/sector boundaries.
    """
    # Load administrative boundaries
    gdf = gpd.read_file(admin_geojson_path)
    
    # Define Rwanda geometry in GEE
    rwanda_geom = ee.Geometry.Polygon([
        [[28.86, -2.84], [30.90, -2.84], [30.90, -1.04], [28.86, -1.04], [28.86, -2.84]]
    ])

    # 1. CHIRPS Daily Precipitation
    chirps = (
        ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
        .filterBounds(rwanda_geom)
        .filterDate(start_date, end_date)
        .select("precipitation")
    )
    total_precip = chirps.sum().rename("total_precip_mm")

    # 2. Historical Baseline (2015-2025) for 30-day Anomaly
    chirps_hist = (
        ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
        .filterBounds(rwanda_geom)
        .filter(ee.Filter.dayOfYear(1, 60)) # Season A window
        .filterDate("2015-01-01", "2025-12-31")
        .select("precipitation")
    )
    mean_hist_precip = chirps_hist.sum().divide(11).rename("hist_mean_precip_mm")
    precip_anomaly = total_precip.subtract(mean_hist_precip).rename("precip_anomaly_mm")

    # 3. ERA5-Land Soil Moisture & 2m Temperature
    era5 = (
        ee.ImageCollection("ECMWF/ERA5_LAND/DAILY_AGGR")
        .filterBounds(rwanda_geom)
        .filterDate(start_date, end_date)
    )
    soil_moisture = era5.select("volumetric_soil_water_layer_1").mean().rename("soil_moisture_m3_m3")
    temp_2m = era5.select("temperature_2m").mean().subtract(273.15).rename("temperature_celsius")

    # Combine into a single multi-band raster
    composite = total_precip.addBands([precip_anomaly, soil_moisture, temp_2m])

    # Convert GeoPandas features to EE FeatureCollection
    features = []
    for _, row in gdf.iterrows():
        geom = ee.Geometry(row.geometry.__geo_interface__)
        features.append(ee.Feature(geom, {"district_name": row.get("NAME_2", row.get("name"))}))
    ee_fc = ee.FeatureCollection(features)

    # Zonal reduce over boundaries
    reduced = composite.reduceRegions(
        collection=ee_fc,
        reducer=ee.Reducer.mean(),
        scale=5000  # 5km resolution for speed
    )

    # Convert EE result to Pandas DataFrame
    records = []
    for feat in reduced.getInfo()["features"]:
        props = feat["properties"]
        records.append(props)

    df_climate = pd.DataFrame(records)
    return df_climate

if __name__ == "__main__":
    print("Testing extraction pipeline...")
    # df = fetch_climate_features_for_rwanda()
    # df.to_parquet("data/processed/climate_features.parquet")
