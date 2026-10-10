#!/usr/bin/env python3
"""
VaxCheck — Baseline strike analyzer
-----------------------------------
Processes the WAV files recorded by capture_strikes.py (or any WAVs
placed under data/<vial>/...), computing per strike:

  * onset detection + latency
  * peak amplitude (first 5 ms after onset)
  * RMS/peak SNR vs the pre-strike noise floor
  * Hilbert-envelope decay time constant  tau_env (simple, robust)
  * Prony-method dominant pole: tau_prony + dominant frequency
  * spectral band energy fractions (first 60 ms)
  * total ring energy

Then aggregates per vial (mean / std / CV across strikes — your
repeatability metric) and per condition (frozen vs control), with
Cohen's d and a Welch t-test per feature.

Folder naming determines the condition:
    Damaged_A, Damaged_B, FROZEN_A, BAD1  ...  -> 'damaged'   (freeze-damaged)
    Healthy_A, Healthy_B, C1, GOOD1       ...  -> 'healthy'   (room-temp control)
Anything else is left ungrouped (group stats skipped).

Usage:
    python analyze_strikes.py --data ./data --out ./results
    python analyze_strikes.py --data ./data --out ./results --no-plots

Requires:  numpy  (matplotlib optional, for plots)
"""

import argparse
import glob
import math
import os
import sys
import wave

import numpy as np

# ----------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------

def read_wav(path):
    with wave.open(path, "rb") as w:
        fs = w.getframerate()
        n = w.getnframes()
        raw = w.readframes(n)
    x = np.frombuffer(raw, dtype="<i2").astype(np.float64)
    if n % 2:                      # paranoia: odd-length frames
        x = x[: n - 1]
    return x, fs


def rms(x):
    return float(np.sqrt(np.mean(np.asarray(x, dtype=float) ** 2))) if len(x) else 0.0


def nmean(x):
    """NaN-tolerant mean; returns NaN if no finite values."""
    a = np.asarray(x, dtype=float)
    a = a[np.isfinite(a)]
    return float(np.mean(a)) if a.size else float("nan")


def hilbert_env(x):
    """Analytic-signal envelope via FFT pair (numpy only)."""
    n = len(x)
    if n == 0:
        return np.zeros(0)
    X = np.fft.fft(x)
    H = np.zeros(n)
    H[0] = 1
    H[1 : (n + 1) // 2] = 2
    if n % 2 == 0 and n // 2 > 0:
        H[n // 2] = 1
    return np.abs(np.fft.ifft(X * H))


def envelope_tau(x, fs, onset, gate_ms=8.0, tail_guard=3.0, frac=0.25,
                 max_ms=300.0):
    """
    Fit log(env) ~ -t/tau on the Hilbert envelope from onset+gate_ms
    until the envelope falls below max(tail_guard x noise, frac x
    envelope-at-gate).  The frac floor is important: fitting into the
    noise-floored tail flattens log(env) and biases tau long, and a
    short-ring vial dies fast, so a signal-referenced cutoff self-scales
    to the actual ring length.  Returns (tau_ms, r2).
    """
    env = hilbert_env(x)
    pre = x[max(0, onset - int(0.05 * fs)) : onset]
    noise = max(float(np.percentile(np.abs(pre), 50)), 1e-3) if pre.size else 1e-3

    i0 = onset + int(gate_ms * fs / 1000.0)
    i1 = min(onset + int(max_ms * fs / 1000.0), len(env))
    if i0 >= len(env) - 5:
        # onset too close to the end of the file: not enough ring left
        # to fit (truncated / late-onset capture).
        return float("nan"), float("nan")
    cutoff = max(tail_guard * noise, frac * env[i0])
    while i1 > i0 + 5 and env[i1 - 1] < cutoff:
        i1 -= 1
    if i1 - i0 < int(0.008 * fs):
        return float("nan"), float("nan")

    t = np.arange(i0, i1) / fs
    y = np.log(np.maximum(env[i0:i1], 1e-12))
    A = np.vstack([t - t[0], np.ones_like(t)]).T
    coef, _, _, _ = np.linalg.lstsq(A, y, rcond=None)
    slope = coef[0]
    if slope >= 0:
        return float("nan"), float("nan")
    resid = y - (A @ coef)
    ss_res = float(np.sum(resid ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    return -1000.0 / slope, r2


def prony(x, fs, order=4):
    """
    Prony's method via Levinson-Durbin linear prediction on the
    autocorrelation sequence.  Returns dominant pole info:
    (freq_hz, tau_ms, |r|) or None.  x should be a short segment
    (e.g. first 200 ms after onset), normalized internally.
    """
    n = len(x)
    if n < 4 * order + 10:
        return None
    x = x - x.mean()
    peak = float(np.max(np.abs(x)))
    if peak < 1e-9:
        return None
    x = x / peak

    r = np.correlate(x, x, "full")[n - 1 :] / n   # biased autocorr

    a = np.zeros(order + 1)
    a[0] = 1.0
    err = r[0]
    for k in range(1, order + 1):
        if err <= 1e-12:
            return None
        acc = r[k]                          # + sum a_j r[k-j]  (YW form)
        if k > 1:
            acc += np.dot(a[1:k], r[k - 1:0:-1])
        gamma = -acc / err                  # reflection coefficient
        a[1 : k + 1] += gamma * a[k - 1 :: -1][:k]
        a[k] = gamma
        err *= 1.0 - gamma * gamma
        if err <= 1e-15:
            break

    roots = np.roots(a[::-1])
    poles = []
    for z in roots:
        rr = abs(z)
        if rr < 0.70 or rr > 1.03:
            continue
        if rr > 1.0:
            # Pole stabilization: autocorrelation-based AR on a short
            # noisy record often places a slowly-decaying pole a hair
            # OUTSIDE the unit circle (|z| just over 1), which would
            # flip the sign of tau.  Reflect it back inside — same
            # frequency, symmetric decay rate.
            rr = 1.0 / rr
        rr = min(rr, 1.0 - 1e-9)               # guard exact circle
        freq = abs(float(np.angle(z))) * fs / (2 * np.pi)
        if freq < 400 or freq > fs / 2 - 1:
            continue
        tau_ms = -1.0 / (math.log(rr) * fs) * 1000.0
        poles.append((tau_ms, freq, rr))
    if not poles:
        return None
    # dominant pole: slowest decaying (largest |r|) — most robust
    tau_ms, freq, rr = max(poles, key=lambda p: p[2])
    return freq, tau_ms, rr


def band_energies(x, fs):
    """Energy fraction (%) in four bands over the whole segment."""
    n = len(x)
    if n < 128:
        return [0.0] * 4
    win = np.hanning(n)
    X = np.fft.rfft(x * win)
    P = np.abs(X) ** 2
    freqs = np.fft.rfftfreq(n, 1.0 / fs)
    edges = [(0, 1000), (1000, 3000), (3000, 6000), (6000, 12000)]
    fracs = []
    for lo, hi in edges:
        mask = (freqs >= lo) & (freqs < hi)
        fracs.append(100.0 * P[mask].sum() / max(P.sum(), 1e-30))
    return fracs


def dominant_freq(x, fs, onset, lo=1000.0, hi=12000.0):
    """
    Peak frequency of the ring: argmax PSD of the first 20 ms after
    onset (NOT 50 ms — a freeze-damaged vial's ring can be fully
    decayed within 50 ms, so a long window would lock onto the noise
    floor instead of the ring), restricted to the plausible ring band,
    with quadratic interpolation for sub-bin accuracy.
    """
    seg = x[onset : onset + int(0.020 * fs)]
    n = len(seg)
    if n < 128:
        return float("nan")
    X = np.fft.rfft(seg * np.hanning(n))
    P = np.abs(X) ** 2
    freqs = np.fft.rfftfreq(n, 1.0 / fs)
    P = P.copy()
    P[(freqs < lo) | (freqs > hi)] = 0.0
    i = int(np.argmax(P))
    if i == 0 or i >= len(freqs) - 1:
        return float(freqs[i])
    a, b, c = P[i - 1], P[i], P[i + 1]
    denom = a - 2 * b + c
    delta = 0.5 * (a - c) / denom if abs(denom) > 1e-12 else 0.0
    return float(freqs[i] + delta * (freqs[1] - freqs[0]))


def bandpass_fft(x, fs, fc, half_frac=0.15):
    """
    Zero-phase FFT bandpass around fc with smooth (tanh) edges.
    Returns (filtered_signal).  Simple, no scipy, fine for a
    one-shot analysis of a short window.
    """
    n = len(x)
    f = np.fft.fftfreq(n, 1.0 / fs)
    lo, hi = fc * (1 - half_frac), fc * (1 + half_frac)
    H = 0.5 * (1 + np.tanh((np.abs(f) - lo) / 40.0)) * \
        0.5 * (1 + np.tanh((hi - np.abs(f)) / 40.0))
    X = np.fft.fft(x)
    X *= H
    return np.fft.ifft(X).real


def highpass_fft(x, fs, fc=2400.0, edge=200.0):
    """
    Zero-phase FFT high-pass (interference guard).

    WHY THIS EXISTS: electrical interference (USB/serial ground noise,
    ~1.0-1.5 kHz range) couples into captures with energy concentrated
    below ~1.5 kHz, while the vial ring lives at 3-7 kHz.  Running all
    ring-feature extraction on the high-passed signal removes the
    interference without touching the physics we measure.

    Used for: onset detection, SNR, dominant-frequency search, Prony /
    envelope tau, band percentages, ring energy.
    NOT used for: clip_pct and peak (clipping happens in the mic BEFORE
    any filtering, so it must be measured on the raw samples).
    """
    n = len(x)
    f = np.fft.fftfreq(n, 1.0 / fs)
    H = 0.5 * (1 + np.tanh((np.abs(f) - fc) / edge))
    X = np.fft.fft(x)
    X *= H
    return np.fft.ifft(X).real


# ----------------------------------------------------------------------
# per-strike feature extraction
# ----------------------------------------------------------------------

def detect_onset(x, fs):
    """
    Robust strike-onset detection for impulsive signals.

    Strategy: find the 10 ms frame with the most energy (the strike),
    then refine the exact onset as the first sample inside that frame
    that exceeds a threshold set from the QUIETEST 50 ms window in the
    signal (not blindly the first 50 ms — trigger latency varies).
    Returns (onset_index, noise_window).
    """
    n = len(x)
    flen = int(0.010 * fs)
    hop = int(0.005 * fs)
    if n < 3 * flen:
        return 0, x[: min(int(0.05 * fs), n)]

    # frame energies over the whole signal
    E = np.array([float(np.sum(x[i : i + flen] ** 2))
                  for i in range(0, n - flen + 1, hop)])
    p = int(np.argmax(E)) * hop                    # start of loudest frame

    # noise window = quietest 50 ms that lies ENTIRELY BEFORE the loudest
    # frame.  (An earlier version took the quietest 10 ms frame and then
    # read a 50 ms window starting there -- if that frame sat just before
    # the strike, the window overhung into the ring and wrecked the SNR
    # estimate on ~10% of files.  Searching full 50 ms windows constrained
    # to end before the strike fixes that.)
    nwin = int(0.050 * fs)
    hi = max(1, p - nwin)
    if hi <= nwin:
        # The loudest event starts within the first 50 ms -- there is no
        # clean pre-event window (e.g. a command-locked burst at t=0).
        # Fall back to the quietest 50 ms window in the last 350 ms of
        # the file: in an 800 ms capture the ring is long dead by then.
        lo2 = max(0, n - int(0.350 * fs))
        if n - nwin > lo2:
            Eq = np.array([float(np.sum(x[i : i + nwin] ** 2))
                           for i in range(lo2, n - nwin + 1, hop)])
            jmin = lo2 + int(np.argmin(Eq)) * hop
            noise_win = x[jmin : jmin + nwin]
        else:
            noise_win = x[:nwin]      # very short file; best effort
    else:
        Eq = np.array([float(np.sum(x[i : i + nwin] ** 2))
                       for i in range(0, hi - nwin + 1, hop)])
        jmin = int(np.argmin(Eq)) * hop
        noise_win = x[jmin : jmin + nwin]
    sd_n = float(np.std(noise_win)) if noise_win.size else 1.0

    thr = 6.0 * max(sd_n, 1e-6)
    onset = p
    for i in range(p, min(p + flen, n)):
        if abs(x[i]) > thr:
            onset = i
            break
    return onset, noise_win


def analyze_file(path):
    """Extract all per-strike features from one WAV."""
    x, fs = read_wav(path)
    n = len(x)

    # Raw-domain diagnostics: clipping & absolute peak happen in the
    # mic before any filtering, so measure them on the raw signal.
    # (kept here so both domains are computed from one read)
    x_hp = highpass_fft(x, fs)          # interference guard, see docstring

    onset, noise_win = detect_onset(x_hp, fs)

    seg_peak = x[onset : min(onset + int(0.005 * fs), n)]
    peak = float(np.max(np.abs(seg_peak))) if seg_peak.size else 0.0

    rms_pre = rms(noise_win)
    rms_ring = rms(x_hp[onset : min(onset + int(0.050 * fs), n)])
    snr_db = 20.0 * math.log10(max(rms_ring / max(rms_pre, 1e-9), 1e-9))

    # --- dominant resonance + single-mode tau -------------------------
    # Filtering to the dominant mode first makes BOTH estimators robust:
    # the envelope fit is no longer flattened by the multi-mode sum, and
    # AR/Prony order-2 is sufficient (kills the model-order fragility).
    f_dom = dominant_freq(x_hp, fs, onset)
    fc = f_dom if math.isfinite(f_dom) else 4000.0
    fc = min(max(fc, 2500.0), 11000.0)          # keep in the ring band;
                                                # 2500 floor rejects the
                                                # ~1-1.5 kHz electrical tone
    y_band = bandpass_fft(x_hp, fs, fc)

    tau_env, r2_env = envelope_tau(y_band, fs, onset)

    seg_prony = y_band[onset : min(onset + int(0.200 * fs), n)]
    pr = prony(seg_prony, fs, order=2)          # single complex pole pair
    if pr is None:
        prony_freq, prony_tau, prony_r = float("nan"), float("nan"), float("nan")
    else:
        prony_freq, prony_tau, prony_r = pr

    band_win = x_hp[onset : min(onset + int(0.060 * fs), n)]
    b = band_energies(band_win, fs)

    ring_energy = rms(x_hp[onset : min(onset + int(0.050 * fs), n)]) ** 2

    # --- clipping / saturation diagnostics -----------------------------
    # int16 full scale is 32767. If the mic rails, the waveform top is
    # squared off and EVERY decay-time estimate becomes meaningless.
    seg_clip = x[onset : min(onset + int(0.050 * fs), n)]
    if seg_clip.size:
        clip_pct = 100.0 * float(np.mean(np.abs(seg_clip) >= 0.98 * 32767.0))
    else:
        clip_pct = 0.0

    return {
        "file": os.path.basename(path),
        "onset_ms": round(onset / fs * 1000.0, 3),
        "peak": round(peak, 1),
        "peak_pct_fs": round(100.0 * peak / 32767.0, 1),
        "clip_pct": round(clip_pct, 2),
        "snr_db": round(snr_db, 2),
        "tau_env_ms": round(tau_env, 3) if math.isfinite(tau_env) else float("nan"),
        "tau_env_r2": round(r2_env, 3) if math.isfinite(r2_env) else float("nan"),
        "prony_freq_hz": round(prony_freq, 1) if math.isfinite(prony_freq) else float("nan"),
        "prony_tau_ms": round(prony_tau, 3) if math.isfinite(prony_tau) else float("nan"),
        "prony_r": round(prony_r, 4) if math.isfinite(prony_r) else float("nan"),
        "band_low_pct": round(b[0], 2),
        "band_mid_pct": round(b[1], 2),
        "band_high_pct": round(b[2] + b[3], 2),
        "ring_energy": round(ring_energy, 2),
    }


# ----------------------------------------------------------------------
# grouping + stats
# ----------------------------------------------------------------------

def classify_vial(name):
    """Substring-based, NOT startswith().

    Why: a folder spelled `heathy1` (typo, missing 'l') does not start with
    HEALTHY, so it silently fell through to "unknown" -- which meant the
    "damaged vs healthy" panels were plotting the damaged class only.
    Substring matching survives typos and prefixes like `vial_healthy_2`.
    """
    up = name.upper()
    bad = ("FREEZ", "FROZE", "FRZ", "FD", "BAD", "DAMAGED", "NEG", "ICE", "FROST")
    good = ("HEA", "CTRL", "CONTROL", "GOOD", "ROOM", "POS", "OK", "RT", "AMB")
    if any(k in up for k in bad):
        return "damaged"
    if any(k in up for k in good):
        return "healthy"
    return "unknown"


def welch_t(x, y):
    x = np.asarray(x, dtype=float); y = np.asarray(y, dtype=float)
    if x.size < 2 or y.size < 2:
        return float("nan"), 1.0
    vx, vy = x.var(ddof=1), y.var(ddof=1)
    denom = (vx / x.size + vy / y.size)
    if denom <= 0:
        return float("nan"), 1.0
    t = (x.mean() - y.mean()) / math.sqrt(denom)
    df = denom ** 2 / ((vx / x.size) ** 2 / (x.size - 1) +
                       (vy / y.size) ** 2 / (y.size - 1)) if (x.size > 1 and y.size > 1) else 1.0
    from math import erf, sqrt
    # two-sided t-test p-value via incomplete beta (numpy has no t cdf;
    # use scipy-free approximation with erf for large df, else report t)
    if df > 60:
        p = 2 * (1 - 0.5 * (1 + erf(abs(t) / sqrt(2))))
    else:
        p = float("nan")  # needs scipy for exact small-df p; report t only
    return t, p


def cohens_d(x, y):
    x = np.asarray(x, dtype=float); y = np.asarray(y, dtype=float)
    if x.size < 2 or y.size < 2:
        return float("nan")
    sp = math.sqrt(((x.size - 1) * x.var(ddof=1) + (y.size - 1) * y.var(ddof=1)) /
                   (x.size + y.size - 2)) if x.size + y.size > 2 else 1.0
    if sp == 0:
        return float("nan")
    return (x.mean() - y.mean()) / sp


# ----------------------------------------------------------------------
# noise-floor mode (solenoid-off captures)
# ----------------------------------------------------------------------

RING_BAND_EDGE = 2400.0     # below = interference territory, above = ring


def analyze_noise_file(path):
    """
    Noise-floor analysis for EVENTLESS captures (solenoid powered off, or
    silent_test.py 'Q' captures).  There is no strike and no ring here,
    so onset/tau/prony are meaningless -- this measures the FLOOR:

      peak, total RMS            how loud the floor is
      LF-RMS (< 2.4 kHz)         interference territory (USB/serial noise)
      HF-RMS (>= 2.4 kHz)        the ring band -- the only part that can
                                 corrupt measurements (analyzer high-passes
                                 at 2.4 kHz, so LF noise is invisible to it)
      LF tone detection          the ~1.2 kHz electrical fingerprint
      per-quarter RMS            stationary vs bursty floor
    """
    x, fs = read_wav(path)
    n = len(x)
    r = {"file": os.path.basename(path),
         "peak": round(float(np.max(np.abs(x))) if n else 0.0, 1),
         "rms": round(rms(x), 1)}

    if r["peak"] == 0:
        r.update({"lf_rms": 0.0, "hf_rms": 0.0, "tone_hz": float("nan"),
                  "bursty": False, "verdict": "DEAD MIC (all zeros)"})
        return r

    q = max(1, n // 4)
    qr = [rms(x[i * q : min((i + 1) * q, n)]) for i in range(4)]
    r["bursty"] = bool(max(qr) > 3 * max(min(qr), 1e-9))

    xh = highpass_fft(x, fs)
    hf_rms = rms(xh)
    r["hf_rms"] = round(hf_rms, 1)
    r["lf_rms"] = round(math.sqrt(max(r["rms"] ** 2 - hf_rms ** 2, 0.0)), 1)

    # narrowband tone hunt below the ring edge (electrical fingerprint)
    tone_hz = float("nan")
    if n >= 512:
        P = np.abs(np.fft.rfft(x * np.hanning(n))) ** 2
        fr = np.fft.rfftfreq(n, 1.0 / fs)
        lf_mask = fr < RING_BAND_EDGE
        P_lf = np.where(lf_mask, P, 0.0)
        if P_lf.max() > 0:
            i = int(np.argmax(P_lf))
            med = float(np.median(P_lf[lf_mask])) if lf_mask.any() else 0.0
            if P_lf[i] > 50 * max(med, 1e-30):        # narrow spike = tone
                tone_hz = float(fr[i])
    r["tone_hz"] = round(tone_hz, 1) if math.isfinite(tone_hz) else float("nan")

    if r["hf_rms"] < 300:
        r["verdict"] = "CLEAN (ring band quiet)"
    elif r["hf_rms"] < 1000:
        r["verdict"] = "GRAY (mostly below band)"
    else:
        r["verdict"] = "BAD (noise in ring band)"
    return r


def run_noise_report(wavs, out_dir):
    """Print + save the noise-floor report for eventless captures."""
    print("=== NOISE-FLOOR REPORT (solenoid-off / silent captures) ===")
    print(f"  {'file':26s} {'peak':>7s} {'RMS':>7s} {'LF<2.4k':>8s} "
          f"{'HF>=2.4k':>8s} {'tone Hz':>8s}  verdict")
    rows = []
    for w in wavs:
        try:
            r = analyze_noise_file(w)
        except Exception as e:
            print(f"  {os.path.basename(w):26s} !! {e}")
            continue
        rows.append(r)
        tone = ("%.0f" % r["tone_hz"]) if math.isfinite(r["tone_hz"]) else "-"
        burst = " [bursty]" if r["bursty"] else ""
        print(f"  {r['file']:26s} {r['peak']:7.0f} {r['rms']:7.0f} "
              f"{r['lf_rms']:8.0f} {r['hf_rms']:8.0f} {tone:>8s}  "
              f"{r['verdict']}{burst}")

    if not rows:
        sys.exit("no files could be analyzed")

    import csv
    with open(os.path.join(out_dir, "noise_report.csv"), "w", newline="") as f:
        wcsv = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        wcsv.writeheader()
        wcsv.writerows(rows)

    hf = [r["hf_rms"] for r in rows]
    worst = max(rows, key=lambda r: r["hf_rms"])
    print(f"\n  files analyzed : {len(rows)}")
    print(f"  mean HF-RMS    : {sum(hf)/len(hf):.0f}   worst file: "
          f"{worst['file']} ({worst['hf_rms']:.0f})")
    dead = [r for r in rows if "DEAD" in r["verdict"]]
    if dead:
        print("  !! DEAD MIC on %d file(s): all-zero audio." % len(dead))
    print("\n  Interpretation (HF-RMS = noise inside the ring band):")
    print("    < 300   -> CLEAN: analyzer's 2.4 kHz high-pass makes this")
    print("               noise invisible; go strike real vials")
    print("    300-1000-> GRAY: proceed, but judge strike batches by")
    print("               SNR > 15 dB and tau fit R2, not raw peak")
    print("    > 1000  -> BAD: noise reaches the ring band; hardware fix")
    print("               first (laptop on battery, different USB cable/")
    print("               port, then a USB isolator board)")
    print(f"\n[noise report saved to {out_dir}/noise_report.csv]")


# ----------------------------------------------------------------------
# main
# ----------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="VaxCheck baseline analyzer")
    ap.add_argument("--data", default="data", help="root data dir (data/<vial>/*.wav)")
    ap.add_argument("--out", default="results", help="output dir")
    ap.add_argument("--no-plots", action="store_true")
    ap.add_argument("--noise", action="store_true",
                    help="noise-floor mode: analyze eventless captures "
                         "(solenoid off / silent_test.py) instead of "
                         "strikes.  Reports LF/HF split, tone detection, "
                         "and whether the noise can reach the ring band.")
    args = ap.parse_args()

    all_wavs = sorted(glob.glob(os.path.join(args.data, "*", "*.wav")))
    if args.noise:
        wavs = all_wavs                    # include silent/ & noise/ folders
    else:
        # strike mode: exclude known eventless-capture folders so noise
        # recordings can never pollute features_all.csv / training
        def _is_noise_folder(p):
            d = os.path.basename(os.path.dirname(p)).lower()
            return ("noise" in d) or ("floor" in d) or (d == "silent")
        wavs = [f for f in all_wavs if not _is_noise_folder(f)]

    if not wavs:
        sys.exit(f"No WAV files found under {args.data}/<vial>/. "
                 f"Record strikes first (capture_strikes.py) or point --data elsewhere.")

    os.makedirs(args.out, exist_ok=True)

    if args.noise:
        run_noise_report(wavs, args.out)
        return

    rows = []
    for w in wavs:
        try:
            r = analyze_file(w)
            vial = os.path.basename(os.path.dirname(w))
            r["vial"] = vial
            r["group"] = classify_vial(vial)
            rows.append(r)
            print(f"  {os.path.basename(w):24s} tau_env={r['tau_env_ms']:7.2f} ms "
                  f"tau_prony={r['prony_tau_ms']:7.2f} ms f={r['prony_freq_hz']:7.1f} Hz "
                  f"SNR={r['snr_db']:6.1f} dB")
        except Exception as e:
            print(f"  !! {os.path.basename(w)}: {e}")

    if not rows:
        sys.exit("No files could be analyzed.")

    import csv
    feats = ["file", "vial", "group", "onset_ms", "peak", "peak_pct_fs",
             "clip_pct", "snr_db",
             "tau_env_ms", "tau_env_r2", "prony_freq_hz", "prony_tau_ms",
             "prony_r", "band_low_pct", "band_mid_pct", "band_high_pct",
             "ring_energy"]
    with open(os.path.join(args.out, "features_all.csv"), "w", newline="") as f:
        wcsv = csv.DictWriter(f, fieldnames=feats, extrasaction="ignore")
        wcsv.writeheader()
        for r in rows:
            wcsv.writerow(r)

    # --- per-vial aggregation -----------------------------------------
    print("\n=== Per-vial repeatability (CV across strikes) ===")
    per_vial = {}
    for r in rows:
        per_vial.setdefault(r["vial"], []).append(r)
    print(f"{'vial':8s} {'grp':9s} {'n':>3s} {'tau_env_ms':>11s} {'CV%':>6s} "
          f"{'tau_prony_ms':>12s} {'CV%':>6s} {'freq_Hz':>8s} {'SNR':>6s}")
    for vial in sorted(per_vial):
        rs = per_vial[vial]
        te = [r["tau_env_ms"] for r in rs]
        tp = [r["prony_tau_ms"] for r in rs]
        fr = [r["prony_freq_hz"] for r in rs]
        sn = [r["snr_db"] for r in rs]
        def cv(a):
            a = np.asarray(a, dtype=float)
            a = a[np.isfinite(a)]
            return 100 * a.std(ddof=1) / max(abs(a.mean()), 1e-9) if a.size > 1 else float("nan")
        g = classify_vial(vial)
        print(f"{vial:8s} {g:9s} {len(rs):3d} {nmean(te):11.2f} {cv(te):6.1f} "
              f"{nmean(tp):12.2f} {cv(tp):6.1f} {nmean(fr):8.1f} {nmean(sn):6.1f}")

    # --- group comparison ---------------------------------------------
    groups = {}
    for r in rows:
        if r["group"] != "unknown":
            groups.setdefault(r["group"], []).append(r)

    if "damaged" in groups and "healthy" in groups:
        print("\n=== Group comparison (damaged vs healthy) ===")
        lines = []
        for feat in ["tau_env_ms", "prony_tau_ms", "prony_freq_hz", "peak",
                     "snr_db", "band_low_pct", "band_mid_pct", "band_high_pct",
                     "ring_energy"]:
            d = [r[feat] for r in groups["damaged"] if math.isfinite(r[feat])]
            h = [r[feat] for r in groups["healthy"] if math.isfinite(r[feat])]
            if not d or not h:
                continue
            t, p = welch_t(d, h)
            d_val = cohens_d(d, h)
            lines.append(
                f"{feat:16s}  damaged={np.mean(d):10.3f}±{np.std(d):6.3f} "
                f"healthy={np.mean(h):10.3f}±{np.std(h):6.3f}  "
                f"Cohen's d={d_val:7.2f}  t={t:7.2f}")
        print("\n".join(lines))
        with open(os.path.join(args.out, "comparison.txt"), "w") as f:
            f.write("\n".join(lines) + "\n")
        print(f"\n[comparison saved to {args.out}/comparison.txt]")

    # --- capture-quality report ------------------------------------------
    n = len(rows)
    nan_tau = sum(1 for r in rows if not math.isfinite(r["tau_env_ms"]))
    clips = [r.get("clip_pct", 0.0) for r in rows
             if math.isfinite(r.get("clip_pct", float("nan")))]
    peaks = [r.get("peak_pct_fs", float("nan")) for r in rows
             if math.isfinite(r.get("peak_pct_fs", float("nan")))]
    grp_ct = {}
    for r in rows:
        grp_ct[r["group"]] = grp_ct.get(r["group"], 0) + 1
    print("\n=== CAPTURE QUALITY ===")
    print(f"  strikes analyzed     : {n}")
    print(f"  group counts         : {grp_ct}")
    if peaks:
        print(f"  peak (% of full scale): mean {sum(peaks)/len(peaks):.1f}%  "
              f"min {min(peaks):.1f}%  max {max(peaks):.1f}%   (target 25-75%)")
    if clips:
        nbad = sum(1 for c in clips if c > 0.5)
        print(f"  clipped strikes      : {nbad}/{len(clips)}  "
              f"(>0.5% of samples at full scale; mean {sum(clips)/len(clips):.2f}%)")
        if nbad:
            print("  !! MIC IS SATURATING. tau_env / prony are fitted to a squared-off")
            print("     waveform and cannot separate the classes. Move the mic farther")
            print("     away, lower the solenoid rail, or shorten the pulse until the")
            print("     peak lands around 8,000-25,000 (25-75% of 32767).")
    print(f"  tau_env fit failures : {nan_tau}/{n} (NaN)")
    if nan_tau > 0.25 * n:
        print("  !! >25% of strikes failed the envelope fit. Usually clipping or a")
        print("     strike that is too weak/noisy. Fix capture before trusting stats.")
    if grp_ct.get("unknown"):
        print(f"  !! {grp_ct['unknown']} strikes have group='unknown'. Check vial folder")
        print("     names -- they must contain 'freeze'/'fd' or 'healthy'/'ctrl'.")
    if "healthy" not in grp_ct or "damaged" not in grp_ct:
        print("  !! The damaged-vs-healthy comparison is EMPTY for one class.")


    # --- plots (optional) ----------------------------------------------
    if not args.no_plots:
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt

            vials = sorted(per_vial)
            tau_by_vial = [nmean([r["tau_env_ms"] for r in per_vial[v]]) for v in vials]
            colors = ["#d62728" if classify_vial(v) == "damaged" else
                      "#2ca02c" if classify_vial(v) == "healthy" else "#999999"
                      for v in vials]

            fig, axes = plt.subplots(2, 2, figsize=(11, 8))

            ax = axes[0, 0]
            ax.bar(range(len(vials)), tau_by_vial, color=colors)
            for v, t in zip(vials, tau_by_vial):
                vals = [r["tau_env_ms"] for r in per_vial[v]]
                ax.errorbar(vials.index(v), t, yerr=np.nanstd(vals),
                            fmt="k.", capsize=4)
            ax.set_xticks(range(len(vials))); ax.set_xticklabels(vials, rotation=45)
            ax.set_title("tau_env per vial (mean +/- std across strikes)")
            ax.set_ylabel("tau_env (ms)")

            ax = axes[0, 1]
            for g, col in (("damaged", "#d62728"), ("healthy", "#2ca02c")):
                if g in groups:
                    ts = [r["tau_env_ms"] for r in groups[g]]
                    ax.scatter(np.random.normal(0, 0.08, len(ts)), ts,
                               color=col, alpha=0.7, label=g, s=60)
            ax.axhline(nmean([r["tau_env_ms"] for r in
                              groups.get("damaged", [])]),
                       color="#d62728", ls="--", lw=1)
            ax.axhline(nmean([r["tau_env_ms"] for r in
                              groups.get("healthy", [])]),
                       color="#2ca02c", ls="--", lw=1)
            ax.set_xticks([])
            ax.set_title("tau_env: damaged vs healthy strikes")
            ax.set_ylabel("tau_env (ms)")
            ax.legend()

            ax = axes[1, 0]
            for r in rows[:4]:
                x, fs = read_wav(os.path.join(args.data, r["vial"], r["file"]))
                t = np.arange(len(x)) / fs * 1000
                ax.plot(t, x / (np.max(np.abs(x)) or 1), lw=0.8, alpha=0.7,
                        label=f'{r["vial"]}:{r["file"][-6:-4]}')
            ax.set_xlim(0, 300)
            ax.set_xlabel("ms"); ax.set_title("first 300 ms of a few strikes (normalized)")
            ax.legend(fontsize=7)

            ax = axes[1, 1]
            for g, col in (("damaged", "#d62728"), ("healthy", "#2ca02c")):
                if g in groups:
                    fr = [r["prony_freq_hz"] for r in groups[g] if math.isfinite(r["prony_freq_hz"])]
                    ax.scatter(np.random.normal(0, 0.08, len(fr)), fr,
                               color=col, alpha=0.7, label=g, s=60)
            ax.set_xticks([])
            ax.set_title("dominant resonant frequency (Prony)")
            ax.set_ylabel("Hz")
            ax.legend()

            fig.tight_layout()
            png = os.path.join(args.out, "baseline_report.png")
            fig.savefig(png, dpi=110)
            print(f"[plot saved to {png}]")
        except ImportError:
            print("[matplotlib not installed — skipping plots]")

    print("\nDone. See results/features_all.csv for per-strike numbers, "
          "results/comparison.txt for the effect-size table.")


if __name__ == "__main__":
    main()