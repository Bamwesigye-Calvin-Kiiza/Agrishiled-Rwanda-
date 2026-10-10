import pandas as pd
import numpy as np

def rank_ssit_interventions(
    df_input: pd.DataFrame, 
    budget_subsidies_units: int = 10,
    w_stress: float = 0.50,
    w_cropland: float = 0.30,
    w_poverty: float = 0.20,
    cost_per_unit_usd: float = 1200.0,
    province_filter: str = "All Rwanda"
) -> pd.DataFrame:
    """
    Ranks administrative units (Districts or Sectors) for Small-Scale Irrigation Technology (SSIT) 
    distribution under Rwanda's NST2 national strategy & Vision 2050.
    
    Formulation:
      Priority Score = w1 * Norm(Predicted Moisture Stress) + w2 * Norm(Unirrigated Cropland) + w3 * Norm(EICV Poverty)
    """
    df = df_input.copy()
    
    if province_filter != "All Rwanda" and "province" in df.columns:
        df = df[df["province"] == province_filter].copy()
        
    if df.empty:
        return df
        
    # Helper min-max normalizer
    def norm(s):
        s_min, s_max = s.min(), s.max()
        if s_max - s_min == 0:
            return pd.Series(0.5, index=s.index)
        return (s - s_min) / (s_max - s_min)
        
    # Ensure probabilities or empirical stress are present
    if "predicted_stress_prob" in df.columns:
        df["norm_stress_risk"] = norm(df["predicted_stress_prob"])
    else:
        df["norm_stress_risk"] = norm(df["empirical_moisture_stress"])
        
    df["norm_unirrigated_land"] = norm(df["unirrigated_ha"])
    df["norm_vulnerability"] = norm(df["eicv_poverty_pct"])
    
    # Normalize weights to sum to 1.0
    total_w = w_stress + w_cropland + w_poverty
    w1 = w_stress / total_w if total_w > 0 else 0.333
    w2 = w_cropland / total_w if total_w > 0 else 0.333
    w3 = w_poverty / total_w if total_w > 0 else 0.333
    
    # Multi-criteria utility score
    df["ssit_priority_score"] = (
        w1 * df["norm_stress_risk"] +
        w2 * df["norm_unirrigated_land"] +
        w3 * df["norm_vulnerability"]
    ).round(4)
    
    # Sort descending by priority score
    df = df.sort_values(by="ssit_priority_score", ascending=False).reset_index(drop=True)
    df["allocated_subsidy_rank"] = np.arange(1, len(df) + 1)
    
    # Apply ceiling K
    df["selected_for_intervention"] = df["allocated_subsidy_rank"] <= budget_subsidies_units
    df["target_status"] = df["selected_for_intervention"].map(
        {True: "🎯 High Priority (Subsidy Allocated)", False: "Baseline (Unallocated)"}
    )
    
    # Projected Protected Cropland and Investment metrics
    df["estimated_unit_cost_usd"] = cost_per_unit_usd
    df["protected_ha_estimate"] = np.where(
        df["selected_for_intervention"], 
        (df["unirrigated_ha"] * 0.15).round(), 
        0
    )
    
    return df

def calculate_summary_kpis(df_ranked: pd.DataFrame, budget_subsidies_units: int, cost_per_unit_usd: float = 1200.0):
    if df_ranked.empty:
        return {}
        
    selected = df_ranked[df_ranked["selected_for_intervention"]]
    
    total_cropland = df_ranked["total_cropland_ha"].sum()
    total_unirrigated = df_ranked["unirrigated_ha"].sum()
    avg_poverty = df_ranked["eicv_poverty_pct"].mean()
    
    units_allocated = len(selected)
    protected_ha = selected["unirrigated_ha"].sum()
    target_poverty_pct = selected["eicv_poverty_pct"].mean() if not selected.empty else 0.0
    total_investment_usd = units_allocated * cost_per_unit_usd
    
    return {
        "total_units_budgeted": budget_subsidies_units,
        "units_allocated": units_allocated,
        "total_cropland_ha": total_cropland,
        "total_unirrigated_ha": total_unirrigated,
        "protected_ha_targeted": protected_ha,
        "avg_poverty_pct": round(avg_poverty, 1),
        "target_poverty_pct": round(target_poverty_pct, 1),
        "total_investment_usd": total_investment_usd
    }

if __name__ == "__main__":
    df_d = pd.read_csv("data/processed/district_predictions.csv")
    ranked = rank_ssit_interventions(df_d, budget_subsidies_units=10)
    print("Top 5 Prioritized Districts for SSIT Subsidies:")
    print(ranked[["allocated_subsidy_rank", "NAME_2", "province", "ssit_priority_score", "selected_for_intervention"]].head(5).to_string())
