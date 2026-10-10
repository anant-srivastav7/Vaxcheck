#!/usr/bin/env python3
"""
VaxCheck — PC-side strike recorder
----------------------------------
Drives the strike-and-capture cycle with the ESP32 firmware
(VaxCheck_capture.ino): sends the fire command, reads the binary
frame the ESP32 streams back, and saves each strike as a WAV file.

Usage:
    python capture_strikes.py --port COM3 --vial Damaged_A --strikes 5

Flags:
    --port     serial port of the ESP32  (default: auto-detect)
    --vial     vial ID used in file names and log
    --strikes  how many strikes to record (default 5)
    --data     output directory (default ./data,  => data/<vial>/)
    --no-fire  don't send the fire command; only read whatever the
               ESP32 streams (for manual-button strikes)
    --baud     serial baud (default 921600; keep in sync with sketch)

Requires:  pyserial      (pip install pyserial)
"""

import argparse
import csv
import glob
import os
import sys
import time
import wave

try:
    import serial
except ImportError:
    sys.exit("pyserial not installed — run:  pip install pyserial")

MAGIC0, MAGIC1, TAG = 0x56, 0x58, 0x01


def find_port():
    candidates = []
    for pat in ("/dev/ttyUSB*", "/dev/ttyACM*", "COM*"):
        candidates += sorted(glob.glob(pat))
    if not candidates:
        sys.exit("No serial port found. Pass --port explicitly, or check drivers.")
    return candidates[0]


def main():
    ap = argparse.ArgumentParser(description="VaxCheck strike recorder")
    ap.add_argument("--port", default=None)
    ap.add_argument("--vial", default="TEST")
    ap.add_argument("--strikes", type=int, default=5)
    ap.add_argument("--data", default="data")
    ap.add_argument("--no-fire", action="store_true")
    ap.add_argument("--baud", type=int, default=921600)
    args = ap.parse_args()

    port = args.port or find_port()
    out_dir = os.path.join(args.data, args.vial)
    os.makedirs(out_dir, exist_ok=True)
    log_path = os.path.join(out_dir, "log.csv")
    if not os.path.exists(log_path):
        with open(log_path, "w", newline="") as f:
            csv.writer(f).writerow(["time", "vial", "strike", "fs", "n_samples"])

    print(f"VaxCheck recorder -> {port} @ {args.baud} baud")
    print(f"Output: {out_dir}")

    ser = serial.Serial(port, args.baud, timeout=10)
    time.sleep(0.5)                     # let firmware finish booting
    ser.reset_input_buffer()

    for i in range(1, args.strikes + 1):
        input(f"\nStrike {i}/{args.strikes} for '{args.vial}' — "
              f"press Enter to fire & record (Ctrl-C to stop)...")

        if args.no_fire:
            ser.write(b"Q")     # firmware: capture WITHOUT firing (silent)
        else:
            ser.write(b"S")     # firmware: fire solenoid + capture

        # ---- read the binary frame ---------------------------------
        # ESP32 prints a "CAP" text line first, then: 8-byte header
        # [0x56 0x58 0x01 0x00][fs high][fs low][N high][N low]
        # followed by N int16 little-endian samples.
        t0 = time.time()
        hdr = b""
        while len(hdr) < 8:
            hdr += ser.read(8 - len(hdr))
            if not hdr:
                sys.exit("timeout waiting for frame header")
        if not (hdr[0] == MAGIC0 and hdr[1] == MAGIC1 and hdr[2] == TAG):
            print(f"  WARNING: unexpected bytes before frame: {hdr.hex()} "
                  f"(draining until magic)")
            while hdr[0] != MAGIC0 or hdr[1] != MAGIC1:
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
            sys.exit(f"  ! payload short: {len(payload)}/{n*2} bytes")

        elapsed = time.time() - t0
        secs = n / fs
        print(f"  captured {n} samples @ {fs} Hz -> {secs*1000:.0f} ms "
              f"window (read in {elapsed:.2f}s)")

        # ---- save wav + log --------------------------------------------
        wav_path = os.path.join(out_dir, f"{args.vial}_{i:02d}.wav")
        with wave.open(wav_path, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(fs)
            w.writeframes(payload)

        with open(log_path, "a", newline="") as f:
            csv.writer(f).writerow(
                [time.strftime("%Y-%m-%d %H:%M:%S"), args.vial, i, fs, n])

        print(f"  saved {wav_path}")
        if i < args.strikes:
            print("  (wait >=10 s for the fluid to settle before next strike)")

    print(f"\nDone. Log: {log_path}")


if __name__ == "__main__":
    main()
