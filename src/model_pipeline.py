import os
import json
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.model_selection import GroupKFold, StratifiedKFold
from sklearn.metrics import roc_auc_score, f1_score, accuracy_score, precision_score, recall_score
import shap

def train_and_explain_level(data_path: str, name_col: str = "NAME_2", level_tag: str = "district"):
    if not os.path.exists(data_path):
        raise FileNotFoundError(f"Missing input dataset: {data_path}")
        
    df = pd.read_csv(data_path)
    
    # 1. Target Label: Top 40% empirical moisture stress threshold
    threshold = df["empirical_moisture_stress"].quantile(0.60)
    df["yield_stress_label"] = (df["empirical_moisture_stress"] >= threshold).astype(int)
    
    features = [
        "real_precip_mm", 
        "real_temp_c", 
        "real_soil_moisture_m3_m3", 
        "dry_spell_days",
        "unirrigated_ha",
        "eicv_poverty_pct"
    ]
    
    X = df[features]
    y = df["yield_stress_label"]
    
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    
    oof_preds_prob = np.zeros(len(df))
    models = []
    fold_metrics = []
    
    min_child = 2 if level_tag == "district" else 5
    
    params = {
        "objective": "binary",
        "metric": "auc",
        "boosting_type": "gbdt",
        "learning_rate": 0.05,
        "num_leaves": 15,
        "max_depth": 4,
        "min_child_samples": min_child,
        "min_data_in_leaf": min_child,
        "feature_fraction": 0.85,
        "verbose": -1,
        "random_state": 42
    }
    
    print(f"\n[{level_tag.upper()}] Training LightGBM (min_child_samples={min_child}) with Stratified K-Fold CV...")
    
    for fold, (train_idx, val_idx) in enumerate(skf.split(X, y)):
        X_train, y_train = X.iloc[train_idx], y.iloc[train_idx]
        X_val, y_val = X.iloc[val_idx], y.iloc[val_idx]
        
        train_data = lgb.Dataset(X_train, label=y_train)
        val_data = lgb.Dataset(X_val, label=y_val, reference=train_data)
        
        model = lgb.train(
            params,
            train_data,
            num_boost_round=250,
            valid_sets=[val_data],
            callbacks=[lgb.early_stopping(stopping_rounds=25, verbose=False)]
        )
        
        preds = model.predict(X_val, num_iteration=model.best_iteration)
        oof_preds_prob[val_idx] = preds
        models.append(model)
        
        auc = roc_auc_score(y_val, preds) if len(np.unique(y_val)) > 1 else 0.5000
            
        fold_metrics.append({
            "fold": fold + 1,
            "auc": round(auc, 4),
            "sample_count": len(val_idx)
        })
        print(f"  Fold {fold+1} [{level_tag}]: AUC = {auc:.4f}")
        
    overall_auc = roc_auc_score(y, oof_preds_prob)
    
    # Dynamic decision threshold selection based on target prior / max F1
    best_f1, best_thresh = 0, 0.5
    for th in np.linspace(0.2, 0.6, 41):
        score = f1_score(y, (oof_preds_prob >= th).astype(int), zero_division=0)
        if score > best_f1:
            best_f1, best_thresh = score, th
            
    oof_preds_binary = (oof_preds_prob >= best_thresh).astype(int)
    overall_f1 = f1_score(y, oof_preds_binary, zero_division=0)
    overall_acc = accuracy_score(y, oof_preds_binary)
    overall_prec = precision_score(y, oof_preds_binary, zero_division=0)
    overall_rec = recall_score(y, oof_preds_binary, zero_division=0)
    
    print(f"✅ [{level_tag.upper()}] Stratified CV (Optimal Thresh={best_thresh:.2f}) Overall AUC: {overall_auc:.4f} | F1: {overall_f1:.4f} | Accuracy: {overall_acc:.4f} | Precision: {overall_prec:.4f} | Recall: {overall_rec:.4f}")
    
    df["predicted_stress_prob"] = np.round(oof_preds_prob, 4)
    
    # Train full model using LGBMClassifier for TreeSHAP
    clf = lgb.LGBMClassifier(
        n_estimators=120,
        learning_rate=0.05,
        max_depth=4,
        num_leaves=15,
        min_child_samples=min_child,
        random_state=42,
        verbose=-1
    )
    clf.fit(X, y)
    
    explainer = shap.TreeExplainer(clf)
    shap_values = explainer.shap_values(X)
    
    if isinstance(shap_values, list):
        shap_matrix = shap_values[1] if len(shap_values) > 1 else shap_values[0]
    else:
        shap_matrix = shap_values
        
    mean_abs_shap = np.mean(np.abs(shap_matrix), axis=0)
    shap_importance_df = pd.DataFrame({
        "feature": features,
        "mean_shap": np.round(mean_abs_shap, 4)
    }).sort_values(by="mean_shap", ascending=False).reset_index(drop=True)
    
    # Save outputs
    out_preds_path = f"data/processed/{level_tag}_predictions.csv"
    out_shap_path = f"data/processed/{level_tag}_shap_values.csv"
    
    df.to_csv(out_preds_path, index=False)
    
    shap_df = pd.DataFrame(shap_matrix, columns=[f"shap_{f}" for f in features])
    shap_df[name_col] = df[name_col]
    shap_df["province"] = df["province"]
    shap_df.to_csv(out_shap_path, index=False)
    
    summary = {
        "level": level_tag,
        "overall_auc": round(overall_auc, 4),
        "overall_f1": round(overall_f1, 4),
        "overall_acc": round(overall_acc, 4),
        "overall_precision": round(overall_prec, 4),
        "overall_recall": round(overall_rec, 4),
        "fold_metrics": fold_metrics,
        "feature_importances": shap_importance_df.to_dict(orient="records"),
        "features": features
    }
    
    return df, summary, shap_matrix

def run_full_pipeline():
    d_df, d_summary, _ = train_and_explain_level(
        "data/processed/sas_district_baseline.csv", 
        name_col="NAME_2", 
        level_tag="district"
    )
    
    s_df, s_summary, _ = train_and_explain_level(
        "data/processed/sas_sector_baseline.csv", 
        name_col="NAME_3", 
        level_tag="sector"
    )
    
    combined_metrics = {
        "district": d_summary,
        "sector": s_summary
    }
    
    with open("data/processed/model_metrics.json", "w") as f:
        json.dump(combined_metrics, f, indent=2)
        
    print("\n✅ Multi-level LightGBM modeling & TreeSHAP explainability pipeline complete!")

if __name__ == "__main__":
    run_full_pipeline()
