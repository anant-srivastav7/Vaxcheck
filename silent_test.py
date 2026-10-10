#!/usr/bin/env python3
"""
VaxCheck — Silent-Capture Test
------------------------------
Drives VaxCheck_capture.ino with the 'Q' command: ESP32 records
its 800 ms window WITHOUT firing the solenoid.  Saves the WAV and
prints diagnostics that tell you if your rig has continuous ambient
noise (vibration, fan hum, EMI pickup), or if it's truly quiet.

What to do:
    Run this script THREE TIMES in slightly different rig states:

    (a) ESP32 powered, mic wired, but NO vial mounted, NO solenoid
        battery attached.  Captures the absolute noise floor --
        mic's own noise + ESP32 + whatever ambient noise reaches
        the bare rig.

    (b) Solenoid battery attached, no vial.  Tests whether the
        50 ms pulse driver (driven a moment, never fires since
        'Q' is sent) injects EM noise at boot.  Use this to check
        whether your solenoid rail is leaking into the mic.

    (c) Vial mounted, no solenoid battery.  Tests whether the
        mounted vial picks up rig-borne vibration even without a
        strike -- i.e., is the mount itself acting as a coupling
        to room vibrations?

Usage:
    python silent_test.py --port COM5
    (Linux: --port /dev/ttyUSB0)

Threshold given in the printed table: an RMS value below 1000
for case (a) is essentially "silent."  Above that, you have a
continuous noise source to track.

Requires:  pyserial, numpy
"""

import argparse
import glob
import math
import os
import sys
import wave

import numpy as np

try:
    import serial
except ImportError:
    sys.exit("pyserial not installed -- pip install pyserial")

MAGIC0, MAGIC1, TAG = 0x56, 0x58, 0x01


def find_port():
    for pat in ("/dev/ttyUSB*", "/dev/ttyACM*", "COM*"):
        for p in sorted(glob.glob(pat)):
            return p
    sys.exit("No serial port found. Pass --port explicitly.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", default=None)
    ap.add_argument("--label", default="silent",
                    help="label used for the saved file name")
    ap.add_argument("--baud", type=int, default=921600)
    args = ap.parse_args()

    port = args.port or find_port()
    print(f"VaxCheck silent test -> {port} @ {args.baud}")

    ser = serial.Serial(port, args.baud, timeout=10)
    ser.reset_input_buffer()

    # 'Q' triggers a capture-only cycle in the firmware (no solenoid fire)
    print("  sending 'Q' (capture-only, no strike)...")
    ser.write(b"Q")

    # Drain any preamble text ("CAP\n")
    hdr = b""
    while len(hdr) < 8:
        hdr += ser.read(8 - len(hdr))
        if not hdr:
            sys.exit("timeout waiting for header -- is firmware flashed? "
                     "Did you upload VaxCheck_capture.ino?")
    # Sync to the magic header if firmware printed "CAP" first
    while hdr[0] != MAGIC0 or hdr[1] != MAGIC1 or hdr[2] != TAG:
        hdr = hdr[1:] + ser.read(1)

    fs = (hdr[4] << 8) | hdr[5]
    n  = (hdr[6] << 8) | hdr[7]

    payload = b""
    while len(payload) < n * 2:
        chunk = ser.read(n * 2 - len(payload))
        if not chunk:
            break
        payload += chunk
    if len(payload) != n * 2:
        sys.exit(f"payload short {len(payload)}/{n*2}")

    # ----- analyse the silent capture -----
    samples = np.frombuffer(payload, dtype="<i2").astype(np.float64)
    secs    = n / fs
    rms     = float(np.sqrt(np.mean(samples * samples)))
    peak    = int(np.max(np.abs(samples)))

    # quarter-window RMS to see if noise is stationary or bursting
    q = n // 4
    rms_q = [float(np.sqrt(np.mean(samples[i:i+q] ** 2))) for i in range(0, n, q)]

    # rough frequency-content histogram (energy only)
    spec = np.abs(np.fft.rfft(samples - samples.mean()))
    freqs = np.fft.rfftfreq(n, 1.0 / fs)
    edges = [(0, 200), (200, 1000), (1000, 4000), (4000, 8000)]
    bands = []
    for lo, hi in edges:
        mask = (freqs >= lo) & (freqs < hi)
        bands.append(100.0 * spec[mask].sum() / max(spec.sum(), 1e-30))

    # save the WAV under data/silent/<label>.wav
    out_dir = os.path.join("data", "silent")
    os.makedirs(out_dir, exist_ok=True)
    wav_path = os.path.join(out_dir, f"{args.label}.wav")
    with wave.open(wav_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(fs)
        w.writeframes(payload)

    # ----- report -----
    print()
    print("================ SILENT-CAPTURE RESULT ================")
    print(f"  capture        : {secs*1000:.0f} ms  ({n} samples @ {fs} Hz)")
    print(f"  saved to       : {wav_path}")
    print()
    print(f"  OVERALL RMS    : {rms:8.1f}     (out of 32767 max, 0=silent)")
    print(f"  OVERALL peak   : {peak:8d}     (max int16 = 32767 = saturating)")
    print()
    print("  per-quarter RMS (is the noise stationary?):")
    labels = [" 0 - {n//4}", "n//4 - n//2", "n//2 - 3n//4", "3n//4 - n"]
    for lbl, val in zip(labels, rms_q):
        print(f"    ~{lbl:>16s}  : {val:8.1f}")
    print()
    print("  rough frequency content (% of total energy):")
    band_labels = ["<200 Hz   ", "<1 kHz    ", "1-4 kHz   ", "4-8 kHz   "]
    for lbl, val in zip(band_labels, bands):
        bar = "#" * int(round(val / 2))
        print(f"    {lbl}: {val:5.1f}%  {bar}")
    print()

    # verdict
    print("  --- verdict ---")
    if peak > 30000:
        print("  PEAK is near saturation -> rig is over-driven even without a strike.")
        print("  Suggest: check mic distance, gain, share grounds between 3V3 rails.")
    elif rms < 1000:
        print("  RMS < 1000 and peak well below saturation: environment is QUIET.")
        print("  If you're still seeing saturation on actual strikes, the strike itself")
        print("  is the over-driving source -- mic too close, or solenoid putting energy")
        print("  into the mic through shared rails or vibration.")
    elif rms < 5000:
        print("  RMS in [1000, 5000]: small continuous noise source.  Likely a fan or")
        print("  the rig sitting on a slightly vibrating surface.  Move the rig or")
        print("  decouple it from the bench.")
    else:
        print("  RMS >= 5000: significant continuous noise.  Check for:")
        print("    - a fan or AC unit pointed at the rig")
        print("    - the solenoid's power rail injecting through shared grounds")
        print("    - the base vibrating against its mounting surface")
        print("    - mic wiring picking up switching noise")
    print()
    print("  Re-run with --label <something_else> for cases (b) and (c)")


if __name__ == "__main__":
    main()
