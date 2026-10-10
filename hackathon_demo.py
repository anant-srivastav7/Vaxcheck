"""
VaxCheck — Hackathon Demo (XGBoost classifier, no website)
============================================================
A single self-contained Python script that:

  1. (once) Trains an XGBoost classifier on features_all.csv
  2. Drops a model file (vaxcheck_xgb_model.pkl) into the working dir
  3. Then enters a loop where you point it at a new WAV file and it
     tells you PASS / FAIL / INCONCLUSIVE with confidence, the same way
     the worker-facing UI would.

Run:
    conda activate vaxcheck
    python hackathon_demo.py

    T  -> (re-)train on features_all.csv
    C  -> classify a new WAV file you specify
    S  -> scan ./live_captures/ for every WAV and classify each
    L  -> scan ./live_captures/ once and watch for new files (auto demo)
    Q  -> quit

Point the script at a features_all.csv that's already been produced by
your analyze_strikes.py step. The script trains on every strike with a
known group ('healthy' or 'damaged'), drops NaNs, keeps it simple.

For honest framing in the hackathon pitch:
  - 8 vials -> Cohen's d for tau_env dropped from -16 (n=2) to 0.00 (n=8)
  - Signal is below the population-detection threshold right now
  - The model still works as a working classifier with reasonable but
    not dramatic separation (~tau ~70ms in both groups); perfect for
    showing the pipeline works, not for claiming a clinical-grade claim
"""
import csv
import glob
import os
import sys
import time
import warnings

# point at your analyzer
HERE = os.path.dirname(os.path.abspath(__file__))
ANALYSIS_DIR = os.path.join(HERE, "analysis")
if ANALYSIS_DIR not in sys.path:
    sys.path.append(ANALYSIS_DIR)

import joblib
import numpy as np
import pandas as pd
from xgboost import XGBClassifier, plot_importance
from sklearn.model_selection import LeaveOneGroupOut
from sklearn.metrics import classification_report

from analyze_strikes import analyze_file   # the same function capture_strikes.py uses
import matplotlib
matplotlib.use("Agg")

# === CONFIG ============================================================
CSV_PATH          = os.path.join(HERE, "results", "features_all.csv")
MODEL_PATH        = os.path.join(HERE, "vaxcheck_xgb_model.pkl")
LIVE_CAPTURES_DIR = os.path.join(HERE, "live_captures")

FEATURE_COLS = [
    "onset_ms", "peak", "snr_db", "tau_env_ms", "tau_env_r2",
    "prony_freq_hz", "prony_tau_ms", "prony_r",
    "band_low_pct", "band_mid_pct", "band_high_pct", "ring_energy",
]

CONF_HIGH = 0.9
CONF_LOW  = 0.4


# === TRAIN / RE-LOAD ===================================================
def train(quiet=False):
    if not os.path.exists(CSV_PATH):
        sys.exit(f"missing features_all.csv at {CSV_PATH}\n"
                 "produce it by running: python analysis/analyze_strikes.py")

    df = pd.read_csv(CSV_PATH)
    df = df[df["group"].isin(["healthy", "damaged"])].copy()
    df = df.dropna(subset=["tau_env_ms"])        # only strikes with a real fit
    if len(df) == 0:
        sys.exit("no usable rows after filtering")

    df["label"] = (df["group"] == "damaged").astype(int)
    X, y, groups = df[FEATURE_COLS], df["label"], df["vial"]

    # leave-one-vial-out -- the honest number
    logo = LeaveOneGroupOut()
    all_preds, all_true = [], []
    if not quiet:
        print("[logo] leave-one-vial-out validation:")
    for train_idx, test_idx in logo.split(X, y, groups):
        m = XGBClassifier(n_estimators=100, max_depth=3,
                          learning_rate=0.1, eval_metric="logloss")
        m.fit(X.iloc[train_idx], y.iloc[train_idx])
        p = m.predict(X.iloc[test_idx])
        held_out = df["vial"].iloc[test_idx].unique()[0]
        if not quiet:
            print(f"   held-out vial {held_out}:  "
                  f"predicted={[int(x) for x in p]},  actual={y.iloc[test_idx].tolist()}")
        all_preds.extend([int(x) for x in p])
        all_true.extend([int(x) for x in y.iloc[test_idx]])

    if not quiet:
        print()
        print(classification_report(all_true, all_preds,
                                    target_names=["healthy", "damaged"]))

    model = XGBClassifier(n_estimators=100, max_depth=3,
                          learning_rate=0.1, eval_metric="logloss")
    model.fit(X, y)
    joblib.dump(model, MODEL_PATH)
    if not quiet:
        print(f"[ok] saved model -> {MODEL_PATH}")

    # importance plot
    try:
        import matplotlib.pyplot as plt
        plot_importance(model, max_num_features=len(FEATURE_COLS))
        plt.tight_layout()
        plt.savefig(os.path.join(HERE, "feature_importance.png"))
        if not quiet:
            print("[ok] feature_importance.png saved (open it after training)")
    except Exception as e:
        print(f"(importance plot skipped: {e})")


def load_model():
    if not os.path.exists(MODEL_PATH):
        print(f"[!] model missing at {MODEL_PATH}, training now from {CSV_PATH}")
        train()
    return joblib.load(MODEL_PATH)


# === INFERENCE =========================================================
def band_and_verdict(raw_conf, predicted_class):
    if raw_conf >= CONF_HIGH:
        return predicted_class, "High"
    if raw_conf < CONF_LOW:
        return "INCONCLUSIVE", "Low"
    return "INCONCLUSIVE", "Medium"


def quality_flags(feat):
    return {
        "saturation":         (feat.get("peak") or 0) > 0.95 * 32767,
        "poor_fit":           (feat.get("tau_env_r2") or 0) < 0.3,
        "high_ambient_noise": (feat.get("snr_db") or 0) < 10,
        "onset_timing_anomaly": (feat.get("onset_ms") or 0) > 50,
    }


def classify_one(model, wav_path):
    feat = analyze_file(wav_path)
    feat_for_display = {k: feat.get(k) for k in FEATURE_COLS}
    row = []
    bad = []
    for col in FEATURE_COLS:
        v = feat.get(col)
        if v is None or (isinstance(v, float) and np.isnan(v)):
            row.append(0.0)
            bad.append(col)
        else:
            row.append(float(v))
    X_one = pd.DataFrame([row], columns=FEATURE_COLS)

    proba = model.predict_proba(X_one)[0]              # [prob_healthy, prob_damaged]
    confidence = float(np.max(proba))
    predicted  = "FAIL" if proba[1] > 0.5 else "PASS"
    verdict, band = band_and_verdict(confidence, predicted)
    flags = quality_flags(feat_for_display)
    if bad:
        flags["poor_fit"] = True

    print()
    print("=" * 64)
    print(f" WAV    : {os.path.basename(wav_path)}")
    print("-" * 64)
    print(f" VERDICT: {verdict}    (band: {band})")
    print(f" raw P  : healthy={proba[0]:.2f}  damaged={proba[1]:.2f}")
    print(f" flags  : {flags}")
    print(f" features used:")
    for k, v in feat_for_display.items():
        shown = "NaN" if (v is None or (isinstance(v, float) and np.isnan(v))) else f"{v:.3f}"
        print(f"    {k:18s} = {shown}")
    print("=" * 64)
    print()

    return verdict


# === SCAN MODES ========================================================
def scan_all(model, dirpath, quiet=False):
    """Run classify_one against every *.wav in dir, in order."""
    wavs = sorted(glob.glob(os.path.join(dirpath, "*.wav")))
    if not wavs:
        if not quiet:
            print(f"[scan] no WAVs in {dirpath}")
        return
    for w in wavs:
        classify_one(model, w)


def watch_loop(model, dirpath):
    """Live demo: every 'press Enter' refreshes classification on all
    new files in dirpath. Files already classified move to a sibling
    'consumed/' subfolder to avoid double-running."""
    os.makedirs(dirpath, exist_ok=True)
    consumed = os.path.join(dirpath, "consumed")
    os.makedirs(consumed, exist_ok=True)
    print(f"[watch] dropping new WAVs into: {dirpath}")
    print("        each batch of new files prints a verdict and moves")
    print("        them to ./consumed/  -- press Enter to re-scan.")
    print()
    while True:
        new_files = sorted(glob.glob(os.path.join(dirpath, "*.wav")))
        if new_files:
            for w in new_files:
                classify_one(model, w)
                os.rename(w, os.path.join(consumed, os.path.basename(w)))
        try:
            input("(press Enter to scan again, Ctrl-C to quit) ")
        except (EOFError, KeyboardInterrupt):
            return


# === MENU ==============================================================
def show_menu(model):
    while True:
        print()
        print("==========================================")
        print(" VaxCheck Hackathon Demo - main menu")
        print("==========================================")
        print(f" model    : {MODEL_PATH}")
        print(f" features : {CSV_PATH}")
        print(f" live dir : {LIVE_CAPTURES_DIR}")
        print()
        print(" T  -- (re-)train model on features_all.csv")
        print(" C  -- classify one WAV (you'll be prompted for path)")
        print(" S  -- classify every WAV in ./live_captures/")
        print(" W  -- 'watch mode': drop new WAVs and they auto-classify")
        print(" Q  -- quit")
        choice = input("> ").strip().upper()
        if choice == "T":
            train()
        elif choice == "C":
            p = input("  WAV path: ").strip().strip('"').strip("'")
            if not p:
                continue
            if not os.path.exists(p):
                print(f"  [!] file not found: {p}")
                continue
            classify_one(model, p)
        elif choice == "S":
            scan_all(model, LIVE_CAPTURES_DIR)
        elif choice == "W":
            watch_loop(model, LIVE_CAPTURES_DIR)
        elif choice == "Q":
            return
        else:
            print(f"  [!] unknown option: {choice}")


# === ENTRY =============================================================
def main():
    warnings.filterwarnings("ignore", category=UserWarning)

    if len(sys.argv) >= 2 and sys.argv[1] in ("train", "t"):
        train()
        return

    model = load_model()
    show_menu(model)


if __name__ == "__main__":
    main()
