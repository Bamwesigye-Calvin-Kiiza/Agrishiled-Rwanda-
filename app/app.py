import os
import json
import pandas as pd
import numpy as np
import streamlit as st
import pydeck as pdk
import plotly.express as px
import plotly.graph_objects as go

# ---------------------------------------------------------
# Page Configuration & Modern Glassmorphism Styling
# ---------------------------------------------------------
st.set_page_config(
    page_title="AgriShield Rwanda — SSIT Climate Resilience Engine",
    page_icon="🌾",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for high-impact visual design
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;600;700;800&display=swap');

    html, body, [class*="css"] {
        font-family: 'Plus Jakarta Sans', sans-serif;
    }

    .stApp {
        background-color: #0b0f19;
        color: #f1f5f9;
    }

    /* Glassmorphic Metric Cards */
    .metric-card {
        background: rgba(30, 41, 59, 0.7);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        padding: 20px;
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        text-align: center;
        transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .metric-card:hover {
        transform: translateY(-3px);
        border-color: rgba(16, 185, 129, 0.4);
    }
    .metric-title {
        font-size: 0.82rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #94a3b8;
        margin-bottom: 6px;
    }
    .metric-value {
        font-size: 1.85rem;
        font-weight: 800;
        color: #10b981;
    }
    .metric-sub {
        font-size: 0.78rem;
        color: #64748b;
        margin-top: 4px;
    }

    /* Sub-headers and badges */
    .badge-tag {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }
    .badge-nst2 {
        background: rgba(16, 185, 129, 0.15);
        color: #10b981;
        border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .badge-track1 {
        background: rgba(245, 158, 11, 0.15);
        color: #f59e0b;
        border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .badge-target {
        background: rgba(239, 68, 68, 0.2);
        color: #ef4444;
        border: 1px solid rgba(239, 68, 68, 0.4);
    }

    /* Section Containers */
    .glass-container {
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 16px;
        padding: 24px;
        margin-bottom: 24px;
    }

    /* Custom scrollbar */
    ::-webkit-scrollbar {
        width: 6px;
        height: 6px;
    }
    ::-webkit-scrollbar-track {
        background: #0b0f19;
    }
    ::-webkit-scrollbar-thumb {
        background: #334155;
        border-radius: 3px;
    }
</style>
""", unsafe_allow_html=True)

# ---------------------------------------------------------
# Data Loading Functions
# ---------------------------------------------------------
@st.cache_data
def load_datasets():
    # Load District Level Data
    df_district_pred = pd.read_csv("data/processed/district_predictions.csv")
    df_district_shap = pd.read_csv("data/processed/district_shap_values.csv")
    with open("data/raw/rwanda_districts_lvl2.json", "r") as f:
        geo_district = json.load(f)

    # Load Sector Level Data
    df_sector_pred = pd.read_csv("data/processed/sector_predictions.csv")
    df_sector_shap = pd.read_csv("data/processed/sector_shap_values.csv")
    with open("data/raw/rwanda_sectors_lvl3.json", "r") as f:
        geo_sector = json.load(f)

    # Load Model Metrics
    with open("data/processed/model_metrics.json", "r") as f:
        metrics = json.load(f)

    return {
        "district": {"pred": df_district_pred, "shap": df_district_shap, "geo": geo_district},
        "sector": {"pred": df_sector_pred, "shap": df_sector_shap, "geo": geo_sector},
        "metrics": metrics
    }

data_store = load_datasets()

# ---------------------------------------------------------
# Sidebar Controls
# ---------------------------------------------------------
with st.sidebar:
    st.image("https://img.icons8.com/color/96/wheat.png", width=60)
    st.title("AgriShield Rwanda")
    st.markdown("<span class='badge-tag badge-nst2'>NST2 & Vision 2050</span> <span class='badge-tag badge-track1'>NISR 2026 Hackathon</span>", unsafe_allow_html=True)
    st.markdown("---")

    st.subheader("⚙️ Policy & Model Configuration")

    # Administrative Granularity
    level = st.radio(
        "Administrative Level",
        options=["District (Level 2 - 30 Units)", "Sector (Level 3 - 422 Units)"],
        index=0
    )
    level_key = "district" if "District" in level else "sector"
    name_col = "NAME_2" if level_key == "district" else "NAME_3"

    st.markdown("---")
    st.subheader("🎯 Policy Presets")
    preset_col1, preset_col2 = st.columns(2)
    
    # Preset handler state
    if "w_stress" not in st.session_state:
        st.session_state.w_stress = 0.50
        st.session_state.w_cropland = 0.30
        st.session_state.w_poverty = 0.20

    if preset_col1.button("🎯 MINAGRI Baseline"):
        st.session_state.w_stress = 0.50
        st.session_state.w_cropland = 0.30
        st.session_state.w_poverty = 0.20
    if preset_col2.button("🚨 Drought Risk"):
        st.session_state.w_stress = 0.75
        st.session_state.w_cropland = 0.15
        st.session_state.w_poverty = 0.10
    if preset_col1.button("🤝 Pro-Poor"):
        st.session_state.w_stress = 0.20
        st.session_state.w_cropland = 0.20
        st.session_state.w_poverty = 0.60
    if preset_col2.button("⚖️ Equal Weights"):
        st.session_state.w_stress = 0.33
        st.session_state.w_cropland = 0.33
        st.session_state.w_poverty = 0.34

    st.markdown("### Multi-Criteria Utility Weights")
    w_stress = st.slider("💧 Climate Moisture Stress Risk (w1)", 0.0, 1.0, st.session_state.w_stress, 0.05)
    w_cropland = st.slider("🌾 Unirrigated Cropland Area (w2)", 0.0, 1.0, st.session_state.w_cropland, 0.05)
    w_poverty = st.slider("👥 EICV Poverty Vulnerability (w3)", 0.0, 1.0, st.session_state.w_poverty, 0.05)

    st.markdown("---")
    st.subheader("💰 Subsidy Ceiling & Investment Parameters")
    
    max_budget_units = 30 if level_key == "district" else 150
    default_budget_units = 10 if level_key == "district" else 40
    
    budget_units = st.slider(
        "SSIT Solar Pump Units Ceiling (K)",
        min_value=1,
        max_value=max_budget_units,
        value=default_budget_units,
        step=1
    )

    cost_per_unit = st.number_input(
        "Estimated SSIT Unit Cost (USD $)",
        min_value=500,
        max_value=5000,
        value=1200,
        step=100
    )

    st.markdown("---")
    st.subheader("🗺️ Regional Filter")
    provinces = ["All Rwanda", "Eastern", "Northern", "Southern", "Western", "Kigali City"]
    selected_province = st.selectbox("Province Filter", provinces, index=0)

# ---------------------------------------------------------
# Optimization Formulation Calculation
# ---------------------------------------------------------
raw_df = data_store[level_key]["pred"].copy()

if selected_province != "All Rwanda":
    df_filtered = raw_df[raw_df["province"] == selected_province].copy()
else:
    df_filtered = raw_df.copy()

# Min-max normalization function
def min_max_norm(s):
    if s.max() - s.min() == 0:
        return pd.Series(0.5, index=s.index)
    return (s - s.min()) / (s.max() - s.min())

total_w = w_stress + w_cropland + w_poverty
w1 = w_stress / total_w if total_w > 0 else 0.333
w2 = w_cropland / total_w if total_w > 0 else 0.333
w3 = w_poverty / total_w if total_w > 0 else 0.333

df_filtered["norm_stress"] = min_max_norm(df_filtered["predicted_stress_prob"])
df_filtered["norm_cropland"] = min_max_norm(df_filtered["unirrigated_ha"])
df_filtered["norm_poverty"] = min_max_norm(df_filtered["eicv_poverty_pct"])

df_filtered["ssit_priority_score"] = (
    w1 * df_filtered["norm_stress"] +
    w2 * df_filtered["norm_cropland"] +
    w3 * df_filtered["norm_poverty"]
).round(4)

df_ranked = df_filtered.sort_values(by="ssit_priority_score", ascending=False).reset_index(drop=True)
df_ranked["allocated_subsidy_rank"] = np.arange(1, len(df_ranked) + 1)
df_ranked["selected_for_intervention"] = df_ranked["allocated_subsidy_rank"] <= budget_units

df_ranked["target_status"] = df_ranked["selected_for_intervention"].map(
    {True: "🎯 Target Allocated", False: "Baseline (Unallocated)"}
)

# Metric Calculations
total_cropland_ha = df_ranked["total_cropland_ha"].sum()
total_unirrigated_ha = df_ranked["unirrigated_ha"].sum()
target_units_count = int(df_ranked["selected_for_intervention"].sum())

selected_df = df_ranked[df_ranked["selected_for_intervention"]]
protected_ha_targeted = selected_df["unirrigated_ha"].sum()
target_poverty_share = selected_df["eicv_poverty_pct"].mean() if not selected_df.empty else 0.0
total_investment_usd = target_units_count * cost_per_unit

# ---------------------------------------------------------
# Header & Key Metric Ribbon
# ---------------------------------------------------------
st.title("🌾 AgriShield Rwanda")
st.markdown(
    "**Empirical Small-Scale Irrigation Technology (SSIT) Prioritization & Climate Resilience Engine**  \n"
    "*Fusing NISR SAS Microdata & EICV Poverty Profiles with ECMWF ERA5-Land & CHIRPS Earth Observation Reanalysis*"
)

st.markdown("<br>", unsafe_allow_html=True)

m_col1, m_col2, m_col3, m_col4, m_col5, m_col6 = st.columns(6)

with m_col1:
    st.markdown(f"""
    <div class="metric-card">
        <div class="metric-title">Total Cropland</div>
        <div class="metric-value">{total_cropland_ha:,.0f} <span style="font-size: 1rem;">ha</span></div>
        <div class="metric-sub">Across {len(df_ranked)} {level_key}s</div>
    </div>
    """, unsafe_allow_html=True)

with m_col2:
    st.markdown(f"""
    <div class="metric-card">
        <div class="metric-title">Unirrigated Area</div>
        <div class="metric-value">{total_unirrigated_ha:,.0f} <span style="font-size: 1rem;">ha</span></div>
        <div class="metric-sub">Smallholder Exposure</div>
    </div>
    """, unsafe_allow_html=True)

with m_col3:
    st.markdown(f"""
    <div class="metric-card">
        <div class="metric-title">SSIT Units Ceiling</div>
        <div class="metric-value" style="color: #ef4444;">{target_units_count} <span style="font-size: 1rem;">Pumps</span></div>
        <div class="metric-sub">Allocated Target</div>
    </div>
    """, unsafe_allow_html=True)

with m_col4:
    st.markdown(f"""
    <div class="metric-card">
        <div class="metric-title">Protected Cropland</div>
        <div class="metric-value">{protected_ha_targeted:,.0f} <span style="font-size: 1rem;">ha</span></div>
        <div class="metric-sub">{ (protected_ha_targeted/total_unirrigated_ha*100):.1f}% Target Share</div>
    </div>
    """, unsafe_allow_html=True)

with m_col5:
    st.markdown(f"""
    <div class="metric-card">
        <div class="metric-title">Target Poverty Rate</div>
        <div class="metric-value" style="color: #f59e0b;">{target_poverty_share:.1f}%</div>
        <div class="metric-sub">EICV Vulnerability</div>
    </div>
    """, unsafe_allow_html=True)

with m_col6:
    st.markdown(f"""
    <div class="metric-card">
        <div class="metric-title">Required Budget</div>
        <div class="metric-value" style="color: #3b82f6;">${total_investment_usd:,.0f}</div>
        <div class="metric-sub">@ ${cost_per_unit:,.0f} / Unit</div>
    </div>
    """, unsafe_allow_html=True)

st.markdown("<br>", unsafe_allow_html=True)

# ---------------------------------------------------------
# Application Navigation Tabs
# ---------------------------------------------------------
tab_map, tab_explain, tab_data, tab_audit = st.tabs([
    "🌐 3D Spatial Prioritization Map",
    "🧠 LightGBM & TreeSHAP Explainability",
    "📊 NISR & Climate Data Explorer",
    "📝 Policy Simulation & Deployment Export"
])

# =========================================================
# TAB 1: 3D Spatial Prioritization Map
# =========================================================
with tab_map:
    st.subheader(f"🗺️ Interactive 3D SSIT Subsidy Allocation Deck ({level.split(' ')[0]})")
    st.markdown(
        "Extruded 3D polygon height represents the computed **SSIT Priority Score**. "
        "Districts/Sectors highlighted in **Bright Crimson Red** receive allocated solar pump subsidies under the budget ceiling $K$, "
        "while **Emerald Green** polygons represent baseline unirrigated regions."
    )

    # Build PyDeck GeoJSON layer
    geo_data = data_store[level_key]["geo"].copy()
    rank_lookup = {row[name_col]: row for _, row in df_ranked.iterrows()}

    map_features = []
    for feat in geo_data["features"]:
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
                "fill_color": [239, 68, 68, 220] if row_data["selected_for_intervention"] else [16, 185, 129, 140],
                "elevation_m": float(row_data["ssit_priority_score"] * (25000 if level_key == "district" else 15000))
            })
            map_features.append({"type": feat["type"], "geometry": feat["geometry"], "properties": updated_props})

    deck_geojson = {"type": "FeatureCollection", "features": map_features}

    geojson_layer = pdk.Layer(
        "GeoJsonLayer",
        deck_geojson,
        opacity=0.85,
        stroked=True,
        filled=True,
        extruded=True,
        wireframe=True,
        get_elevation="properties.elevation_m",
        get_fill_color="properties.fill_color",
        get_line_color=[255, 255, 255, 120],
        line_width_min_pixels=1,
        pickable=True
    )

    view_state = pdk.ViewState(
        latitude=-1.94,
        longitude=29.87,
        zoom=8.4 if level_key == "district" else 8.7,
        pitch=48,
        bearing=-10
    )

    tooltip_html = {
        "html": """
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 10px; background: #0f172a; color: #fff; border-radius: 8px; border: 1px solid #334155;">
            <b style="font-size: 1.1rem; color: #10b981;">{unit_name}</b> <span style="color: #94a3b8;">({province})</span><br/>
            <hr style="border-color: #334155; margin: 6px 0;"/>
            <b>SSIT Priority Score:</b> <span style="color: #f59e0b; font-weight: 800;">{ssit_priority_score}</span><br/>
            <b>Priority Rank:</b> #{allocated_subsidy_rank} <br/>
            <b>Allocation Status:</b> {target_status}<br/>
            <hr style="border-color: #334155; margin: 6px 0;"/>
            💧 <b>Predicted Drought Risk:</b> {predicted_stress_prob}<br/>
            🌱 <b>Soil Moisture:</b> {real_soil_moisture_m3_m3} m³/m³<br/>
            ☀️ <b>Dry Spell Days:</b> {dry_spell_days} days<br/>
            👥 <b>EICV Poverty Rate:</b> {eicv_poverty_pct}%<br/>
            🌾 <b>Unirrigated Area:</b> {unirrigated_ha} ha
        </div>
        """,
        "style": {"backgroundColor": "transparent", "color": "white"}
    }

    r_map = pdk.Deck(
        layers=[geojson_layer],
        initial_view_state=view_state,
        tooltip=tooltip_html,
        map_style="mapbox://styles/mapbox/dark-v11"
    )

    st.pydeck_chart(r_map, use_container_width=True)

    # Prioritized Interventions Table
    st.markdown("### 📋 Prioritized SSIT Deployment Schedule")
    
    display_cols = [
        "allocated_subsidy_rank", name_col, "province", "ssit_priority_score",
        "target_status", "predicted_stress_prob", "unirrigated_ha", "eicv_poverty_pct",
        "dry_spell_days", "real_soil_moisture_m3_m3"
    ]
    
    df_display = df_ranked[display_cols].copy()
    df_display.columns = [
        "Rank", "Administrative Unit", "Province", "Priority Score",
        "Allocation Target", "Predicted Risk (Prob)", "Unirrigated Cropland (ha)",
        "EICV Poverty Rate (%)", "Dry Spell (Days)", "Soil Moisture (m³/m³)"
    ]

    st.dataframe(
        df_display.style.highlight_max(subset=["Priority Score"], color="#10b98133"),
        use_container_width=True,
        height=340
    )

# =========================================================
# TAB 2: LightGBM & TreeSHAP Explainability
# =========================================================
with tab_explain:
    st.subheader("🧠 Machine Learning Architecture & Spatial Group Cross-Validation")
    st.markdown(
        "Standard random K-Fold cross-validation leaks spatial autocorrelation across contiguous agricultural microclimates. "
        "AgriShield enforces **Spatial Group K-Fold (Leave-One-Province-Out)** cross-validation across Rwanda's 5 provinces "
        "(Eastern, Northern, Southern, Western, Kigali City) to guarantee model generalization to unseen geographic zones."
    )

    metrics_data = data_store["metrics"][level_key]

    c_m1, c_m2, c_m3, c_m4 = st.columns(4)
    c_m1.metric("Spatial Group CV AUC", f"{metrics_data['overall_auc']:.4f}")
    c_m2.metric("Out-of-Fold F1 Score", f"{metrics_data['overall_f1']:.4f}")
    c_m3.metric("Classification Accuracy", f"{metrics_data['overall_acc']:.4f}")
    c_m4.metric("Precision / Recall", f"{metrics_data['overall_precision']:.2f} / {metrics_data['overall_recall']:.2f}")

    st.markdown("---")
    
    col_feat, col_shap = st.columns([1, 1])

    with col_feat:
        st.markdown("### 📊 Global TreeSHAP Feature Importance")
        st.markdown("Mean absolute SHAP value quantifying global impact on moisture stress prediction:")
        
        fi_df = pd.DataFrame(metrics_data["feature_importances"])
        fig_fi = px.bar(
            fi_df,
            x="mean_shap",
            y="feature",
            orientation="h",
            color="mean_shap",
            color_continuous_scale="Tealgrn",
            labels={"mean_shap": "Mean |SHAP Value|", "feature": "Physical / Survey Indicator"}
        )
        fig_fi.update_layout(
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            font=dict(color="#e2e8f0"),
            height=340,
            margin=dict(l=20, r=20, t=20, b=20)
        )
        st.plotly_chart(fig_fi, use_container_width=True)

    with col_shap:
        st.markdown("### 🔍 Local District / Sector SHAP Driver Decomposition")
        st.markdown("Select an administrative unit to unpack its exact SHAP marginal feature contributions:")
        
        shap_df = data_store[level_key]["shap"]
        unit_names = sorted(df_ranked[name_col].unique())
        selected_unit = st.selectbox(f"Select {level_key.capitalize()} for SHAP Waterfall Breakdown", unit_names)

        unit_shap_row = shap_df[shap_df[name_col] == selected_unit]
        
        if not unit_shap_row.empty:
            shap_cols = [c for c in shap_df.columns if c.startswith("shap_")]
            vals = unit_shap_row[shap_cols].values[0]
            clean_cols = [c.replace("shap_", "") for c in shap_cols]

            fig_waterfall = go.Figure(go.Waterfall(
                name="SHAP",
                orientation="v",
                measure=["relative"] * len(vals),
                x=clean_cols,
                textposition="outside",
                text=[f"{v:+.3f}" for v in vals],
                y=vals,
                connector={"line": {"color": "#64748b"}},
                decreasing={"marker": {"color": "#10b981"}},
                increasing={"marker": {"color": "#ef4444"}}
            ))
            
            fig_waterfall.update_layout(
                title=f"SHAP Marginal Contributions for {selected_unit}",
                paper_bgcolor="rgba(0,0,0,0)",
                plot_bgcolor="rgba(0,0,0,0)",
                font=dict(color="#e2e8f0"),
                height=340,
                margin=dict(l=20, r=20, t=40, b=20)
            )
            st.plotly_chart(fig_waterfall, use_container_width=True)

# =========================================================
# TAB 3: NISR Microdata & ERA5-Land Climate Explorer
# =========================================================
with tab_data:
    st.subheader("📊 NISR Survey Microdata & ECMWF ERA5-Land Explorer")
    st.markdown(
        "Explore relationships between official **NISR EICV 5/6 Poverty Profile** microdata, "
        "**Seasonal Agricultural Survey (SAS)** cropland baselines, and **ECMWF ERA5-Land reanalysis** physical soil moisture."
    )

    c_s1, c_s2 = st.columns(2)

    with c_s1:
        st.markdown("#### Bivariate Vulnerability Matrix: Soil Moisture vs Poverty")
        fig_scat = px.scatter(
            df_ranked,
            x="real_soil_moisture_m3_m3",
            y="eicv_poverty_pct",
            size="unirrigated_ha",
            color="province",
            hover_name=name_col,
            labels={
                "real_soil_moisture_m3_m3": "Volumetric Soil Moisture (0-7cm m³/m³)",
                "eicv_poverty_pct": "EICV Poverty Rate (%)",
                "province": "Province"
            },
            title="Soil Moisture Deficit vs Socioeconomic Poverty Rate"
        )
        fig_scat.update_layout(
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            font=dict(color="#e2e8f0")
        )
        st.plotly_chart(fig_scat, use_container_width=True)

    with c_s2:
        st.markdown("#### Provincial Comparison: Soil Moisture & Dry Spell Severity")
        prov_summary = df_ranked.groupby("province").agg({
            "real_soil_moisture_m3_m3": "mean",
            "dry_spell_days": "mean",
            "eicv_poverty_pct": "mean"
        }).reset_index()

        fig_prov = px.bar(
            prov_summary,
            x="province",
            y="dry_spell_days",
            color="real_soil_moisture_m3_m3",
            color_continuous_scale="Viridis_r",
            labels={
                "dry_spell_days": "Mean Dry Spell Days (<1.0mm/day)",
                "province": "Province",
                "real_soil_moisture_m3_m3": "Soil Moisture"
            },
            title="Mean Dry Spell Days by Administrative Province"
        )
        fig_prov.update_layout(
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            font=dict(color="#e2e8f0")
        )
        st.plotly_chart(fig_prov, use_container_width=True)

    st.markdown("### Raw Master Dataset Browser")
    st.dataframe(df_ranked, use_container_width=True)

# =========================================================
# TAB 4: Policy Simulation & Deployment Audit Export
# =========================================================
with tab_audit:
    st.subheader("📝 Policy Scenario Simulation & Operational Deployment Audit")
    st.markdown(
        "Compare policy mandates against alternative resource allocation scenarios "
        "and generate official **MINAGRI / RAB deployment audit schedules**."
    )

    st.markdown("### 🔄 Multi-Scenario Comparison")

    # Generate Scenarios
    scenarios = {
        "MINAGRI NST2 Baseline (50/30/20)": (0.50, 0.30, 0.20),
        "Climate Emergency Mode (75/15/10)": (0.75, 0.15, 0.10),
        "Pro-Poor Target Mode (20/20/60)": (0.20, 0.20, 0.60),
        "Equal Weighting (33/33/33)": (0.33, 0.33, 0.34)
    }

    scen_records = []
    for sc_name, (ws, wc, wp) in scenarios.items():
        temp_df = raw_df.copy()
        temp_df["norm_stress"] = min_max_norm(temp_df["predicted_stress_prob"])
        temp_df["norm_cropland"] = min_max_norm(temp_df["unirrigated_ha"])
        temp_df["norm_poverty"] = min_max_norm(temp_df["eicv_poverty_pct"])
        
        temp_df["score"] = (ws * temp_df["norm_stress"] + wc * temp_df["norm_cropland"] + wp * temp_df["norm_poverty"])
        temp_df = temp_df.sort_values(by="score", ascending=False).reset_index(drop=True)
        
        top_k = temp_df.head(budget_units)
        scen_records.append({
            "Scenario Mandate": sc_name,
            "SSIT Pumps Allocated": len(top_k),
            "Protected Cropland (ha)": f"{top_k['unirrigated_ha'].sum():,.0f}",
            "Target Avg Poverty Rate (%)": f"{top_k['eicv_poverty_pct'].mean():.1f}%",
            "Top Target Unit": top_k.iloc[0][name_col],
            "Est. Budget (USD)": f"${len(top_k) * cost_per_unit:,.0f}"
        })

    st.dataframe(pd.DataFrame(scen_records), use_container_width=True)

    st.markdown("---")
    st.markdown("### 📥 Official Deployment Schedule Export")
    st.markdown(
        "Download the optimized prioritization deployment schedule ready for administrative dispatch "
        "to MINAGRI, RAB, and district agronomists."
    )

    export_df = df_ranked[[
        "allocated_subsidy_rank", name_col, "province", "ssit_priority_score",
        "selected_for_intervention", "predicted_stress_prob", "unirrigated_ha",
        "eicv_poverty_pct", "dry_spell_days", "real_soil_moisture_m3_m3"
    ]].copy()

    csv_data = export_df.to_csv(index=False).encode('utf-8')

    st.download_button(
        label="📥 Download Official MINAGRI Deployment Schedule (CSV)",
        data=csv_data,
        file_name=f"agrishield_rwanda_ssit_prioritization_{level_key}.csv",
        mime="text/csv"
    )

    st.markdown("---")
    st.info(
        "💡 **Methodology Note**: AgriShield Rwanda combines Spatial Group K-Fold LightGBM modeling with TreeSHAP explainability "
        "to ensure 100% transparent, data-driven climate resilience under the National Strategy for Transformation (NST2)."
    )
