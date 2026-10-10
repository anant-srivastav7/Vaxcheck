import pandas as pd
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.svm import SVC
from sklearn.model_selection import cross_val_score
import joblib
import os
import shutil

def main():
    csv_path = r"c:\Users\Anant Srivastav\OneDrive\Desktop\VaxcheckSoftware\results\features_all.csv"
    if not os.path.exists(csv_path):
        print(f"Error: CSV not found at {csv_path}")
        return

    df = pd.read_csv(csv_path)
    
    # Filter to specific groups
    df = df[df['group'].isin(['damaged', 'healthy'])]
    
    # Create labels: damaged=0, healthy=1
    label_map = {'damaged': 0, 'healthy': 1}
    y = df['group'].map(label_map).values
    
    # Input features, EXACT order
    features = ["onset_ms", "snr_db", "tau_env_ms", "tau_env_r2", "prony_freq_hz", "prony_tau_ms", "prony_r", "band_mid_pct", "band_high_pct", "ring_energy"]
    X = df[features].values
    
    pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("feature_select", SelectKBest(score_func=f_classif, k=9)),
        ("svm", SVC(C=1, gamma="scale", kernel="rbf", probability=True, random_state=42))
    ])
    
    scores = cross_val_score(pipeline, X, y, cv=5)
    print(f"Cross-validation accuracy: {scores.mean():.4f} (+/- {scores.std():.4f})")
    
    pipeline.fit(X, y)
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    local_model_path = os.path.join(script_dir, 'vaxcheck_svm_best_practice.joblib')
    joblib.dump(pipeline, local_model_path)
    print(f"Model saved to {local_model_path}")
    
    root_results_dir = r"c:\Users\Anant Srivastav\OneDrive\Desktop\VaxcheckSoftware\results"
    os.makedirs(root_results_dir, exist_ok=True)
    shutil.copy(local_model_path, os.path.join(root_results_dir, 'vaxcheck_svm_best_practice.joblib'))
    print(f"Model also saved to {root_results_dir}")

if __name__ == "__main__":
    main()
