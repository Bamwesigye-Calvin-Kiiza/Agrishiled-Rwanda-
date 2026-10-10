import json
import os
import csv
import pandas as pd
import numpy as np
from django.shortcuts import render
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
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

try:
    import google.generativeai as genai
    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False

@csrf_exempt
def api_chatbot(request):
    history_ctx = ""
    if request.method == "POST":
        try:
            data = json.loads(request.body.decode("utf-8"))
            query = data.get("query", "").strip()
            history = data.get("history", [])
            if isinstance(history, list) and history:
                turns = [f"{h.get('role', 'user').capitalize()}: {h.get('content', '')}" for h in history[-4:]]
                history_ctx = "CONVERSATION HISTORY:\n" + "\n".join(turns) + "\n"
        except Exception:
            query = request.POST.get("query", "").strip()
    else:
        query = request.GET.get("query", "").strip()

    if not query:
        return JsonResponse({"reply": (
            "👋 **Welcome to the NISR AgriShield 360° AI Assistant!**\n\n"
            "Ask me anything about:\n"
            "• ⚙️ **Website Features**: *'How do I customize weights?'* or *'How to filter 3D map by province?'*\n"
            "• 📍 **Districts & Sectors**: Type any of Rwanda's 30 districts (*Nyagatare, Bugesera, Kayonza*) or 422 sectors\n"
            "• 👥 **NISR Poverty Microdata**: *'Highest poverty districts'* or *'EICV statistics'*\n"
            "• 🚨 **Climate & Drought Risk**: *'Drought risk ranking'* or *'Dry spell duration in Eastern Province'*\n"
            "• 📝 **MINAGRI/RAB Policy**: *'How to export deployment schedule?'* or *'SSIT solar pump subsidies'"
        )})

    cache = get_data_cache()
    d_df = cache.get("district_pred", pd.DataFrame())
    s_df = cache.get("sector_pred", pd.DataFrame())

    # 1. Try Google Gemini API with 360 Knowledge Prompt
    env_key = None
    env_path = BASE_DIR / ".env"
    if env_path.exists():
        try:
            with open(env_path, "r") as f:
                for line in f:
                    if "=" in line:
                        k, v = line.split("=", 1)
                        if k.strip() in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
                            env_key = v.strip().strip('"').strip("'")
                            break
        except Exception:
            pass

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or env_key
    
    try:
        import google.generativeai as genai
        has_genai_lib = True
    except ImportError:
        has_genai_lib = False

    if has_genai_lib and api_key:
        try:
            genai.configure(api_key=api_key)
            d_top_pov = ""
            d_top_risk = ""
            if not d_df.empty:
                top_pov = d_df.sort_values(by="eicv_poverty_pct", ascending=False).head(5)[["NAME_2", "province", "eicv_poverty_pct", "unirrigated_ha"]].to_dict(orient="records")
                top_risk = d_df.sort_values(by="predicted_stress_prob", ascending=False).head(5)[["NAME_2", "province", "predicted_stress_prob", "dry_spell_days"]].to_dict(orient="records")
                d_top_pov = f"Top Poverty Districts: {top_pov}"
                d_top_risk = f"Top Drought Risk Districts: {top_risk}"

            # Load RAG Knowledge Base text file
            kb_text = ""
            kb_path = BASE_DIR / "data" / "knowledge_base.txt"
            if kb_path.exists():
                try:
                    with open(kb_path, "r", encoding="utf-8") as f:
                        kb_text = f.read()
                except Exception:
                    pass

            system_prompt = f"""
            You are the official NISR AgriShield 360° AI Assistant for the Rwanda Agricultural Climate Resilience & SSIT Prioritization Engine.
            Developed for the National Institute of Statistics of Rwanda (NISR) Hackathon 2026.
            Official Brand Theme: Deep Navy (#071328), NISR Gold (#F4B41A), Electric Cyan (#149BFC).

            PRIMARY RAG KNOWLEDGE BASE:
            {kb_text}

            DYNAMIC REAL-TIME DATA HIGHLIGHTS:
            - {d_top_pov}
            - {d_top_risk}

            {history_ctx}
            User Question: {query}

            Instructions:
            - Use the RAG Knowledge Base and your intelligent geospatial understanding of Rwanda (including all 30 districts, 422 sectors, and Kigali neighborhoods like Kiyovu) to answer comprehensively.
            - Format your answer clearly using GitHub Markdown headings, bullet points, and reference links where appropriate.
            """
            
            for candidate_model in ["gemini-1.5-flash-latest", "gemini-2.0-flash-exp", "gemini-3.8-flash", "gemini-flash-latest"]:
                try:
                    model = genai.GenerativeModel(
                        candidate_model,
                        generation_config={"max_output_tokens": 700, "temperature": 0.3}
                    )
                    gemini_res = model.generate_content(system_prompt, request_options={"timeout": 15.0})
                    if gemini_res and gemini_res.text:
                        return JsonResponse({"reply": gemini_res.text, "engine": f"gemini_llm ({candidate_model})"})
                except Exception:
                    continue
        except Exception:
            pass
    
    import re
    q_lower = query.lower().strip()

    # Identity Handler ("what are you?", "who are you?")
    if any(k in q_lower for k in ["what are you", "who are you", "what is your name", "what do you do", "who made you", "who created you"]):
        reply = (
            "🤖 **Identity & Purpose of NISR AgriShield AI Assistant**:\n\n"
            "I am the official **NISR AgriShield AI Assistant**, an intelligent decision-support engine developed for the **National Institute of Statistics of Rwanda (NISR) Hackathon 2026**.\n\n"
            "### 🎯 What I Do:\n"
            "1. **Analyze Climate & Poverty Risk**: I query NISR EICV household poverty microdata, NISR SAS cropland statistics, CHIRPS satellite rainfall, ERA5 temperatures, and Copernicus soil moisture across all **30 districts and 422 sectors** in Rwanda.\n"
            "2. **Optimize SSIT Solar Pump Subsidies**: I calculate multi-criteria utility scores ($w_1 \\cdot \\text{Climate} + w_2 \\cdot \\text{Cropland} + w_3 \\cdot \\text{Poverty}$) with strict constraint $w_1 + w_2 + w_3 = 1.00$ to help MINAGRI & RAB target smallholder farmers under NST2 & Vision 2050.\n"
            "3. **Guide Website Operations**: I provide step-by-step instructions on customizing utility weights, navigating 3D DeckGL spatial maps, filtering by province, and exporting policy audit schedules.\n\n"
            "🔗 Official Data Portals: [NISR Portal](https://www.statistics.gov.rw) | [MINAGRI Strategy](https://www.minagri.gov.rw)"
        )
        return JsonResponse({"reply": reply})

    # Conversational Greeting Handler
    if q_lower in ["hey", "hi", "hello", "good morning", "good afternoon", "muraho", "sup", "greetings", "hey there", "hi there", "yo"]:
        reply = (
            "👋 **Muraho! Hello there!** I am the official **NISR AgriShield AI Assistant** for Rwanda's Agricultural & Climate Resilience Engine.\n\n"
            "I'm fully active and ready to assist you! What would you like to ask or explore today?\n\n"
            "• 📍 **District & Sector Microdata**: Type any location (e.g., *Nyagatare, Gisagara, Bugesera, Karangazi*)\n"
            "• 📊 **Poverty & Climate Rankings**: Ask *'What are the poorest districts?'* or *'Show drought risk rankings'*\n"
            "• ⚙️ **Website Guide & Policy Rules**: Ask *'How do I customize weights?'* or *'How does the 3D map work?'*\n"
            "• 🗺️ **Coverage Scope**: Ask *'Tell me the districts represented in the platform'*"
        )
        return JsonResponse({"reply": reply})

    # Query for districts represented

    # Query for districts represented
    if any(k in q_lower for k in ["districts represented", "what districts", "list districts", "all districts", "30 districts"]):
        reply = (
            "🗺️ **All 30 Administrative Districts Represented in NISR AgriShield**:\n\n"
            "• **Eastern Province (7)**: Bugesera, Kayonza, Nyagatare, Gatsibo, Kirehe, Ngoma, Rwamagana.\n"
            "• **Southern Province (8)**: Gisagara, Nyaruguru, Nyamagabe, Huye, Ruhango, Muhanga, Kamonyi, Nyanza.\n"
            "• **Northern Province (5)**: Burera, Gakenke, Musanze, Gicumbi, Rulindo.\n"
            "• **Western Province (7)**: Ngororero, Rutsiro, Nyamasheke, Karongi, Rubavu, Nyabihu, Rusizi.\n"
            "• **Kigali City (3)**: Nyarugenge, Gasabo, Kicukiro.\n\n"
            "📊 Every district includes underlying sector microdata across all **422 sectors** in Rwanda."
        )
        return JsonResponse({"reply": reply})

    # Query for Kiyovu
    if "kiyovu" in q_lower:
        reply = (
            "📍 **Kiyovu Sector / Neighborhood** (Nyarugenge District, Kigali City):\n\n"
            "• **Location**: Situated in central Kigali (Nyarugenge District), Kiyovu is Rwanda's primary commercial, diplomatic, and financial center.\n"
            "• **Agricultural Context**: Kiyovu is predominantly urban/commercial with 0% rainfed smallholder exposure.\n"
            "• **AgriShield Targeting**: Under AgriShield's multi-criteria optimization, urban sectors like Kiyovu receive baseline priority score (0.00), allowing MINAGRI & RAB's SSIT solar pump subsidies to be directed to high-poverty rainfed agricultural districts (e.g., Gisagara, Nyaruguru, Burera, Nyagatare).\n\n"
            "🔗 Reference: [NISR Kigali City Microdata](https://www.statistics.gov.rw)"
        )
        return JsonResponse({"reply": reply})

    # Search for District match (Word boundary match)
    if not d_df.empty and "NAME_2" in d_df.columns:
        for d in d_df["NAME_2"].unique():
            if re.search(r'\b' + re.escape(d.lower()) + r'\b', q_lower):
                row = d_df[d_df["NAME_2"] == d].iloc[0]
                p_score = f"{row['ssit_priority_score']:.3f}" if "ssit_priority_score" in row else f"{row.get('predicted_stress_prob', 0)*100:.1f}% Risk"
                reply = (
                    f"📍 **{row['NAME_2']} District Statistics** ({row['province']} Province):\n\n"
                    f"• 👥 **NISR EICV Poverty Rate**: **{row['eicv_poverty_pct']:.1f}%**\n"
                    f"• 🌾 **Unirrigated Cropland Area**: **{int(row['unirrigated_ha']):,} ha** ({100-row['irrigated_pct']:.1f}% rainfed)\n"
                    f"• 💧 **Predicted Climate Drought Risk**: **{row['predicted_stress_prob']*100:.1f}%**\n"
                    f"• ☀️ **Dry Spell Duration**: **{int(row['dry_spell_days'])} days**\n"
                    f"• 🌱 **Soil Moisture Level**: **{row['real_soil_moisture_m3_m3']:.3f} m³/m³**\n"
                    f"• 🎯 **SSIT Priority Score**: **{p_score}**\n\n"
                    f"💡 *AgriShield Recommendation*: Deploy SSIT solar pumps to mitigate rainfed vulnerability.\n"
                    f"🔗 Explore official data on [NISR Microdata Portal](https://microdata.statistics.gov.rw)."
                )
                return JsonResponse({"reply": reply, "unit": row['NAME_2']})

    # Search for Sector match (Word boundary match)
    if not s_df.empty and "NAME_3" in s_df.columns:
        for s in sorted(s_df["NAME_3"].unique(), key=len, reverse=True):
            if re.search(r'\b' + re.escape(s.lower()) + r'\b', q_lower):
                row = s_df[s_df["NAME_3"] == s].iloc[0]
                p_score = f"{row['ssit_priority_score']:.3f}" if "ssit_priority_score" in row else f"{row.get('predicted_stress_prob', 0)*100:.1f}% Risk"
                reply = (
                    f"📍 **{row['NAME_3']} Sector Statistics** ({row['NAME_2']} District, {row['province']} Province):\n\n"
                    f"• 👥 **NISR EICV Poverty Rate**: **{row['eicv_poverty_pct']:.1f}%**\n"
                    f"• 🌾 **Unirrigated Cropland**: **{int(row['unirrigated_ha']):,} ha**\n"
                    f"• 💧 **Drought Stress Risk**: **{row['predicted_stress_prob']*100:.1f}%**\n"
                    f"• ☀️ **Dry Spell Days**: **{int(row['dry_spell_days'])} days**\n"
                    f"• 🎯 **Sector Priority Score**: **{p_score}**\n\n"
                    f"🔗 Details on sector-level microdata: [NISR Portal](https://www.statistics.gov.rw)."
                )
                return JsonResponse({"reply": reply, "unit": row['NAME_3']})

    # Province / Region RAG Knowledge Handlers
    if any(k in q_lower for k in ["western province", "western region", "western rwanda"]):
        reply = (
            "🏔️ **Western Province (Western Region) Statistical Microdata Profile**:\n\n"
            "Western Province comprises **7 Districts** with high topography and distinct agricultural climate profiles:\n\n"
            "1. **Ngororero**: Poverty **43.0%** (Rank #4 Poorest) | 23,038 ha unirrigated | **67.0%** Drought Risk (Highest risk in West) | 22 dry spell days\n"
            "2. **Rutsiro**: Poverty **42.8%** (Rank #5 Poorest) | 24,056 ha unirrigated | **37.6%** Drought Risk | 17 dry spell days\n"
            "3. **Nyamasheke**: Poverty **39.5%** (Rank #9 Poorest) | 25,808 ha unirrigated | **35.6%** Drought Risk | 16 dry spell days\n"
            "4. **Karongi**: Poverty **39.0%** (Rank #10 Poorest) | 24,794 ha unirrigated | **39.2%** Drought Risk | 18 dry spell days\n"
            "5. **Nyabihu**: Poverty **37.2%** | 21,500 ha unirrigated | **22.4%** Drought Risk | 14 dry spell days\n"
            "6. **Rusizi**: Poverty **36.8%** | 27,200 ha unirrigated | **31.5%** Drought Risk | 16 dry spell days\n"
            "7. **Rubavu**: Poverty **31.0%** | 18,900 ha unirrigated | **20.1%** Drought Risk | 12 dry spell days\n\n"
            "💡 *AgriShield Regional Analysis*: High-altitude western sectors face soil erosion and localized dry spells. Pro-poor weighting prioritizes SSIT pump deployment in **Ngororero** and **Rutsiro**.\n"
            "🔗 Source: [NISR Western Province Microdata](https://microdata.statistics.gov.rw)"
        )
        return JsonResponse({"reply": reply})

    if any(k in q_lower for k in ["eastern province", "eastern region", "eastern rwanda"]):
        reply = (
            "☀️ **Eastern Province (Eastern Region) Statistical Microdata Profile**:\n\n"
            "Eastern Province is Rwanda's agricultural powerhouse but faces the country's severe **dry corridor** exposure across **7 Districts**:\n\n"
            "1. **Bugesera**: Poverty **38.4%** | 45,120 ha unirrigated | **58.4%** Drought Risk (Highest National Exposure!) | 42 dry spell days\n"
            "2. **Kayonza**: Poverty **38.0%** | 52,863 ha unirrigated | **52.1%** Drought Risk | 38 dry spell days\n"
            "3. **Kirehe**: Poverty **37.5%** | 41,200 ha unirrigated | **49.3%** Drought Risk | 35 dry spell days\n"
            "4. **Gatsibo**: Poverty **42.1%** (Rank #6 Poorest) | 45,320 ha unirrigated | **47.4%** Drought Risk | 31 dry spell days\n"
            "5. **Nyagatare**: Poverty **38.0%** | 52,863 ha unirrigated | **40.7%** Drought Risk | 38 dry spell days\n"
            "6. **Ngoma**: Poverty **36.5%** | 38,150 ha unirrigated | **41.2%** Drought Risk | 29 dry spell days\n"
            "7. **Rwamagana**: Poverty **31.2%** | 35,400 ha unirrigated | **39.5%** Drought Risk | 27 dry spell days\n\n"
            "💡 *AgriShield Policy Focus*: Over 310,000 ha of smallholder cropland in Eastern Province rely on rainfed farming, making it top priority for solar pumps under NST2.\n"
            "🔗 Reference: [MINAGRI & NISR Statistics](https://www.statistics.gov.rw)"
        )
        return JsonResponse({"reply": reply})

    if any(k in q_lower for k in ["northern province", "northern region", "northern rwanda"]):
        reply = (
            "⛰️ **Northern Province (Northern Region) Statistical Microdata Profile**:\n\n"
            "Northern Province spans **5 Districts** combining high volcanic agricultural yield with high poverty exposure:\n\n"
            "1. **Burera**: Poverty **44.5%** (Rank #3 Poorest) | 26,812 ha unirrigated | **47.4%** Drought Risk | 19 dry spell days\n"
            "2. **Gakenke**: Poverty **42.0%** (Rank #7 Poorest) | 29,722 ha unirrigated | **21.6%** Drought Risk | 14 dry spell days\n"
            "3. **Gicumbi**: Poverty **38.5%** | 32,100 ha unirrigated | **25.4%** Drought Risk | 16 dry spell days\n"
            "4. **Rulindo**: Poverty **33.2%** | 24,600 ha unirrigated | **23.0%** Drought Risk | 15 dry spell days\n"
            "5. **Musanze**: Poverty **31.5%** | 22,400 ha unirrigated | **18.2%** Drought Risk | 11 dry spell days\n\n"
            "🔗 Source: [NISR EICV Microdata](https://microdata.statistics.gov.rw)"
        )
        return JsonResponse({"reply": reply})

    if any(k in q_lower for k in ["southern province", "southern region", "southern rwanda"]):
        reply = (
            "🌾 **Southern Province (Southern Region) Statistical Microdata Profile**:\n\n"
            "Southern Province spans **8 Districts** and contains Rwanda's highest poverty headcount concentrations:\n\n"
            "1. **Gisagara**: Poverty **46.2%** (Rank #1 Poorest) | 33,574 ha unirrigated | **37.6%** Drought Risk | 19 dry spell days\n"
            "2. **Nyaruguru**: Poverty **45.1%** (Rank #2 Poorest) | 31,914 ha unirrigated | **37.6%** Drought Risk | 18 dry spell days\n"
            "3. **Nyamagabe**: Poverty **41.0%** (Rank #8 Poorest) | 30,846 ha unirrigated | **35.6%** Drought Risk | 13 dry spell days\n"
            "4. **Nyanza**: Poverty **39.8%** | 29,800 ha unirrigated | **36.2%** Drought Risk | 21 dry spell days\n"
            "5. **Ruhango**: Poverty **38.2%** | 28,900 ha unirrigated | **34.0%** Drought Risk | 19 dry spell days\n"
            "6. **Huye**: Poverty **35.2%** | 27,450 ha unirrigated | **32.1%** Drought Risk | 17 dry spell days\n"
            "7. **Muhanga**: Poverty **34.8%** | 26,100 ha unirrigated | **30.5%** Drought Risk | 16 dry spell days\n"
            "8. **Kamonyi**: Poverty **33.1%** | 25,400 ha unirrigated | **31.0%** Drought Risk | 15 dry spell days\n\n"
            "🔗 Source: [NISR Southern Province Portal](https://www.statistics.gov.rw)"
        )
        return JsonResponse({"reply": reply})

    # Platform Overview Topic (Strict check avoiding false positives)
    if any(k in q_lower for k in ["this platform", "about the platform", "about this project", "agrishield project", "what is agrishield", "hackathon project", "about the system"]):
        reply = (
            "🌐 **NISR AgriShield Rwanda Platform Overview**:\n\n"
            "**NISR AgriShield** is an AI-powered spatial decision-support engine built for the **National Institute of Statistics of Rwanda (NISR) Hackathon 2026**.\n\n"
            "### 🎯 Policy Objective\n"
            "Optimizes the spatial targeting of **Small-Scale Irrigation Technology (SSIT)** solar pump subsidies for MINAGRI & RAB under **Rwanda's NST2 & Vision 2050**.\n\n"
            "### 🧠 Core Features & Architecture\n"
            "1. **Multi-Source Data Fusion**: Integrates NISR SAS cropland statistics (896,180 ha total, 845,988 ha rainfed), NISR EICV household poverty microdata, CHIRPS satellite rainfall, ERA5 temperatures, and Copernicus soil moisture.\n"
            "2. **Machine Learning Predictive Models**: XGBoost & LightGBM trained with `StratifiedKFold` (District ROC-AUC: **0.8426**, Sector ROC-AUC: **0.9873**).\n"
            "3. **Multi-Criteria Optimization**: Utility weighting ($w_1 \\cdot \\text{Climate} + w_2 \\cdot \\text{Cropland} + w_3 \\cdot \\text{Poverty}$) with strict constraint $w_1 + w_2 + w_3 = 1.00$.\n"
            "4. **Interactive 3D DeckGL Visualizations**: Visualizes 3D priority height extrusions across 30 districts and 422 sectors.\n"
            "5. **Operational Audit Export**: Generates field deployment CSV schedules for MINAGRI / RAB officers.\n\n"
            "🔗 Official Data Portals: [NISR Portal](https://www.statistics.gov.rw) | [MINAGRI Strategy](https://www.minagri.gov.rw) | [RAB Board](https://www.rab.gov.rw)"
        )
        return JsonResponse({"reply": reply})

    # Website Usage & Navigation Topic
    if any(k in q_lower for k in ["weight", "customize", "modal", "popup", "slider", "rule", "sum", "how to use", "how do i", "navigate", "filter", "map", "export"]):
        reply = (
            "🛠️ **Website Guide & Navigation Instructions**:\n\n"
            "1. ⚙️ **Customize Utility Weights**: Click **'⚙️ Customize Weights'** in the top navigation bar. Enter weights for Climate Risk ($w_1$), Cropland ($w_2$), and Poverty ($w_3$). **Rule**: $w_1 + w_2 + w_3 = 1.00$ (100%). The modal validates live and blocks submission if the sum $\\neq 1.00$.\n"
            "2. 🌐 **3D Spatial Prioritization Map**: Hover over administrative boundaries. Polygon height represents priority score. **Bright Red** = Targeted SSIT subsidy zone under budget ceiling $K$; **Emerald Green** = Baseline area.\n"
            "3. 🔍 **Province Filter & Level Toggle**: Filter by *Eastern, Western, Northern, Southern, or Kigali City*. Toggle between **District Level (30 units)** and **Sector Level (422 units)**.\n"
            "4. 📝 **Policy Audit & Export**: Go to **'Policy Audit & Export'** tab to download official MINAGRI / RAB CSV deployment schedules.\n\n"
            "🔗 Access policy framework guidelines at [MINAGRI Policy Portal](https://www.minagri.gov.rw)."
        )
        return JsonResponse({"reply": reply})

    # Poverty Topic
    if "poverty" in q_lower or "poor" in q_lower or "eicv" in q_lower:
        if not d_df.empty:
            top_pov = d_df.sort_values(by="eicv_poverty_pct", ascending=False).head(5)
            reply = "📊 **Top 5 Most Poverty-Vulnerable Districts (NISR EICV Microdata)**:\n\n"
            for idx, r in top_pov.iterrows():
                reply += f"1. **{r['NAME_2']}** ({r['province']}): **{r['eicv_poverty_pct']:.1f}%** Poverty | {int(r['unirrigated_ha']):,} ha unirrigated\n"
            reply += "\n💡 High poverty correlates strongly with rainfed exposure. Pro-poor weighting increases subsidy priority.\n🔗 Source: [NISR EICV Reports](https://microdata.statistics.gov.rw)"
            return JsonResponse({"reply": reply})

    # Drought / Risk Topic
    if "drought" in q_lower or "risk" in q_lower or "stress" in q_lower or "dry" in q_lower or "climate" in q_lower or "rain" in q_lower:
        if not d_df.empty:
            top_risk = d_df.sort_values(by="predicted_stress_prob", ascending=False).head(5)
            reply = "🚨 **Top 5 Highest Drought Risk Districts (ML Predictions & ERA5/CHIRPS Data)**:\n\n"
            for idx, r in top_risk.iterrows():
                reply += f"1. **{r['NAME_2']}** ({r['province']}): **{r['predicted_stress_prob']*100:.1f}%** Risk Prob | {int(r['dry_spell_days'])} Dry Days | {r['real_soil_moisture_m3_m3']:.3f} m³/m³ moisture\n"
            reply += "\n🔗 Satellite Source: [CHIRPS & ERA5 Climate Data](https://www.chc.ucsb.edu/data/chirps)"
            return JsonResponse({"reply": reply})

    # Irrigation / Cropland Topic
    if "irrigation" in q_lower or "cropland" in q_lower or "water" in q_lower or "pump" in q_lower or "ssit" in q_lower or "ha" in q_lower or "farm" in q_lower:
        if not d_df.empty:
            tot_crop = int(d_df["total_cropland_ha"].sum())
            tot_unirrig = int(d_df["unirrigated_ha"].sum())
            pct_unirrig = round((tot_unirrig / tot_crop) * 100, 1)
            reply = (
                f"🌾 **Rwanda National Irrigation Statistics (NISR SAS 2026)**:\n\n"
                f"• **Total Cropland Area**: **{tot_crop:,} ha** across 30 districts & 422 sectors\n"
                f"• **Unirrigated Rainfed Cropland**: **{tot_unirrig:,} ha** ({pct_unirrig}% rainfed exposure)\n"
                f"• **National Irrigation Gap**: Over 845,000 hectares rely strictly on seasonal rainfall.\n\n"
                f"💡 *MINAGRI NST2 Target*: Subsidizing Small-Scale Irrigation Technology (SSIT) solar pumps bridges this gap.\n"
                f"🔗 Reference: [MINAGRI & RAB Strategy](https://www.minagri.gov.rw)"
            )
            return JsonResponse({"reply": reply})

    # General / Fallback 360 Welcome Response
    reply = (
        "👋 **Welcome to NISR AgriShield 360° AI Assistant!**\n\n"
        "I provide complete intelligence on Rwanda's climate, agriculture, and web platform:\n"
        "• ⚙️ **Website Features**: Ask *'How do I customize weights?'* or *'How to use 3D map?'*\n"
        "• 📍 **District & Sector Stats**: Type any location (*Nyagatare, Bugesera, Kayonza, Nyamagabe*)\n"
        "• 👥 **Poverty & EICV**: Type *'highest poverty districts'* or *'EICV microdata'\n"
        "• 🚨 **Drought & Climate**: Type *'drought risk ranking'* or *'CHIRPS rainfall statistics'*\n"
        "• 🌾 **Irrigation & SSIT**: Type *'national irrigation gap'* or *'RAB solar pump policy'\n\n"
        "🔗 Official Portals: [NISR](https://www.statistics.gov.rw) | [MINAGRI](https://www.minagri.gov.rw) | [RAB](https://www.rab.gov.rw)"
    )
    return JsonResponse({"reply": reply})

