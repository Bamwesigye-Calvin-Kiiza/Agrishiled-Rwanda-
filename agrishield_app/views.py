import json
import os
import csv
import pandas as pd
import numpy as np
from django.shortcuts import render
from django.http import JsonResponse, HttpResponse
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Dynamic Data Cache Loader with File Modification Check
DATA_CACHE = {}
LAST_MODIFIED = {}

def get_data_cache():
    # File paths
    d_pred_path = BASE_DIR / "data/processed/district_predictions.csv"
    d_shap_path = BASE_DIR / "data/processed/district_shap_values.csv"
    d_geo_path = BASE_DIR / "data/raw/rwanda_districts_lvl2.json"
    
    s_pred_path = BASE_DIR / "data/processed/sector_predictions.csv"
    s_shap_path = BASE_DIR / "data/processed/sector_shap_values.csv"
    s_geo_path = BASE_DIR / "data/raw/rwanda_sectors_lvl3.json"
    
    metrics_path = BASE_DIR / "data/processed/model_metrics.json"

    # Check if files changed on disk
    current_mod = {
        "d_pred": d_pred_path.stat().st_mtime if d_pred_path.exists() else 0,
        "d_shap": d_shap_path.stat().st_mtime if d_shap_path.exists() else 0,
        "s_pred": s_pred_path.stat().st_mtime if s_pred_path.exists() else 0,
        "s_shap": s_shap_path.stat().st_mtime if s_shap_path.exists() else 0,
        "metrics": metrics_path.stat().st_mtime if metrics_path.exists() else 0,
    }

    if not DATA_CACHE or current_mod != LAST_MODIFIED:
        DATA_CACHE["district_pred"] = pd.read_csv(d_pred_path) if d_pred_path.exists() else pd.DataFrame()
        DATA_CACHE["district_shap"] = pd.read_csv(d_shap_path) if d_shap_path.exists() else pd.DataFrame()
        
        if d_geo_path.exists():
            with open(d_geo_path, "r") as f:
                DATA_CACHE["district_geo"] = json.load(f)

        DATA_CACHE["sector_pred"] = pd.read_csv(s_pred_path) if s_pred_path.exists() else pd.DataFrame()
        DATA_CACHE["sector_shap"] = pd.read_csv(s_shap_path) if s_shap_path.exists() else pd.DataFrame()
        
        if s_geo_path.exists():
            with open(s_geo_path, "r") as f:
                DATA_CACHE["sector_geo"] = json.load(f)

        if metrics_path.exists():
            with open(metrics_path, "r") as f:
                DATA_CACHE["metrics"] = json.load(f)

        LAST_MODIFIED.update(current_mod)

    return DATA_CACHE

def min_max_norm(series):
    s_min, s_max = series.min(), series.max()
    if s_max - s_min == 0:
        return pd.Series(0.5, index=series.index)
    return (series - s_min) / (s_max - s_min)

def perform_simulation(params):
    cache = get_data_cache()
    level = params.get("level", "district")
    level_key = "district" if "district" in level.lower() else "sector"
    name_col = "NAME_2" if level_key == "district" else "NAME_3"
    
    df_raw = cache[f"{level_key}_pred"].copy()
    geo_raw = cache[f"{level_key}_geo"]

    province = params.get("province", "All Rwanda")
    if province != "All Rwanda" and "province" in df_raw.columns:
        df = df_raw[df_raw["province"] == province].copy()
    else:
        df = df_raw.copy()

    w_stress = float(params.get("w_stress", 0.50))
    w_cropland = float(params.get("w_cropland", 0.30))
    w_poverty = float(params.get("w_poverty", 0.20))
    
    budget_units = int(params.get("budget_units", 10 if level_key == "district" else 40))
    cost_per_unit = float(params.get("unit_cost", 1200.0))

    total_w = w_stress + w_cropland + w_poverty
    w1 = w_stress / total_w if total_w > 0 else 0.333
    w2 = w_cropland / total_w if total_w > 0 else 0.333
    w3 = w_poverty / total_w if total_w > 0 else 0.333

    df["norm_stress"] = min_max_norm(df["predicted_stress_prob"])
    df["norm_cropland"] = min_max_norm(df["unirrigated_ha"])
    df["norm_poverty"] = min_max_norm(df["eicv_poverty_pct"])

    df["ssit_priority_score"] = (
        w1 * df["norm_stress"] +
        w2 * df["norm_cropland"] +
        w3 * df["norm_poverty"]
    ).round(4)

    df = df.sort_values(by="ssit_priority_score", ascending=False).reset_index(drop=True)
    df["allocated_subsidy_rank"] = np.arange(1, len(df) + 1)
    df["selected_for_intervention"] = df["allocated_subsidy_rank"] <= budget_units
    df["target_status"] = df["selected_for_intervention"].map(
        {True: "🎯 Target Allocated", False: "Baseline (Unallocated)"}
    )

    # KPI Summaries
    total_cropland_ha = int(df["total_cropland_ha"].sum())
    total_unirrigated_ha = int(df["unirrigated_ha"].sum())
    selected_df = df[df["selected_for_intervention"]]
    target_units_count = len(selected_df)
    protected_ha_targeted = int(selected_df["unirrigated_ha"].sum())
    target_poverty_share = round(float(selected_df["eicv_poverty_pct"].mean()), 1) if not selected_df.empty else 0.0
    total_investment_usd = float(target_units_count * cost_per_unit)

    kpis = {
        "total_cropland_ha": total_cropland_ha,
        "total_unirrigated_ha": total_unirrigated_ha,
        "target_units_count": target_units_count,
        "protected_ha_targeted": protected_ha_targeted,
        "target_share_pct": round(protected_ha_targeted / total_unirrigated_ha * 100, 1) if total_unirrigated_ha > 0 else 0,
        "target_poverty_share": target_poverty_share,
        "total_investment_usd": total_investment_usd,
        "cost_per_unit": cost_per_unit,
        "level_key": level_key,
        "total_units_count": len(df)
    }

    # Format GeoJSON features for Deck.gl 3D Extruded rendering
    rank_lookup = {row[name_col]: row for _, row in df.iterrows()}
    map_features = []
    
    elev_scale = 25000 if level_key == "district" else 12000

    for feat in geo_raw["features"]:
        feat_props = feat["properties"]
        unit_name = feat_props.get(name_col)
        
        if unit_name in rank_lookup:
            row_data = rank_lookup[unit_name]
            updated_props = dict(feat_props)
            updated_props.update({
                "unit_name": unit_name,
                "province": row_data["province"],
                "ssit_priority_score": float(row_data["ssit_priority_score"]),
                "allocated_subsidy_rank": int(row_data["allocated_subsidy_rank"]),
                "target_status": row_data["target_status"],
                "predicted_stress_prob": float(row_data["predicted_stress_prob"]),
                "real_soil_moisture_m3_m3": float(row_data["real_soil_moisture_m3_m3"]),
                "dry_spell_days": int(row_data["dry_spell_days"]),
                "eicv_poverty_pct": float(row_data["eicv_poverty_pct"]),
                "unirrigated_ha": int(row_data["unirrigated_ha"]),
                "selected_for_intervention": bool(row_data["selected_for_intervention"]),
                "fill_color": [239, 68, 68, 220] if row_data["selected_for_intervention"] else [16, 185, 129, 140],
                "elevation_m": float(row_data["ssit_priority_score"] * elev_scale)
            })
            map_features.append({"type": feat["type"], "geometry": feat["geometry"], "properties": updated_props})

    deck_geojson = {"type": "FeatureCollection", "features": map_features}

    rankings = df.to_dict(orient="records")

    return {
        "kpis": kpis,
        "rankings": rankings,
        "geojson": deck_geojson
    }

def index_view(request):
    cache = get_data_cache()
    metrics = cache["metrics"]
    initial_sim = perform_simulation({"level": "district", "budget_units": 10})

    context = {
        "metrics": metrics,
        "initial_sim": initial_sim,
        "district_names": sorted(cache["district_pred"]["NAME_2"].unique().tolist()) if not cache["district_pred"].empty else [],
        "sector_names": sorted(cache["sector_pred"]["NAME_3"].unique().tolist()) if not cache["sector_pred"].empty else []
    }
    return render(request, "agrishield_app/index.html", context)

def api_simulate(request):
    params = request.GET.dict() if request.method == "GET" else json.loads(request.body.decode("utf-8"))
    sim_result = perform_simulation(params)
    return JsonResponse(sim_result)

def api_shap(request):
    cache = get_data_cache()
    level = request.GET.get("level", "district")
    level_key = "district" if "district" in level.lower() else "sector"
    name_col = "NAME_2" if level_key == "district" else "NAME_3"
    unit_name = request.GET.get("unit", "")

    shap_df = cache[f"{level_key}_shap"]
    
    if shap_df.empty or name_col not in shap_df.columns:
        return JsonResponse({"error": "SHAP dataset missing"}, status=404)

    match = shap_df[shap_df[name_col] == unit_name]
    if match.empty:
        match = shap_df.iloc[[0]]
        unit_name = match.iloc[0][name_col]

    row = match.iloc[0]
    shap_cols = [c for c in shap_df.columns if c.startswith("shap_")]
    
    feature_contributions = []
    for c in shap_cols:
        feat_name = c.replace("shap_", "")
        val = round(float(row[c]), 4)
        feature_contributions.append({
            "feature": feat_name,
            "shap_value": val
        })

    return JsonResponse({
        "unit_name": unit_name,
        "level": level_key,
        "contributions": feature_contributions
    })

def api_export_csv(request):
    params = request.GET.dict()
    sim_result = perform_simulation(params)
    rankings = sim_result["rankings"]

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="agrishield_rwanda_ssit_deployment_{params.get("level", "district")}.csv"'

    writer = csv.writer(response)
    writer.writerow([
        "Rank", "Administrative Unit", "Province", "Priority Score",
        "Target Status", "Predicted Drought Risk (Prob)", "Unirrigated Cropland (ha)",
        "EICV Poverty Rate (%)", "Dry Spell Days", "Soil Moisture (m³/m³)"
    ])

    name_col = "NAME_2" if "district" in params.get("level", "district").lower() else "NAME_3"

    for r in rankings:
        writer.writerow([
            r.get("allocated_subsidy_rank"),
            r.get(name_col),
            r.get("province"),
            r.get("ssit_priority_score"),
            r.get("target_status"),
            r.get("predicted_stress_prob"),
            r.get("unirrigated_ha"),
            r.get("eicv_poverty_pct"),
            r.get("dry_spell_days"),
            r.get("real_soil_moisture_m3_m3")
        ])

    return response

def api_metrics(request):
    cache = get_data_cache()
    return JsonResponse(cache["metrics"])
