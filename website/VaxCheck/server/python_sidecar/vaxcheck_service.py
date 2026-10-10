import os
import sys
import time
import math
import wave
import struct
import json
import logging
from datetime import datetime
from threading import Lock

from flask import Flask, request, jsonify
from flask_cors import CORS
import serial
import serial.tools.list_ports
import joblib

# Setup path for analyze_strikes
sys.path.append(r"c:\Users\Anant Srivastav\OneDrive\Desktop\VaxcheckSoftware")
try:
    from analyze_strikes import analyze_file
except ImportError:
    logging.warning("Could not import analyze_file from analyze_strikes.py")
    def analyze_file(filepath):
        # Fallback dummy for testing if file missing
        return {}

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)

# Global serial port singleton and lock
serial_port = None
serial_lock = Lock()
MODEL_FILENAMES = [
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "vaxcheck_svm_best_practice.joblib"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "results", "vaxcheck_svm_best_practice.joblib"),
    r"c:\Users\Anant Srivastav\OneDrive\Desktop\VaxcheckSoftware\results\vaxcheck_svm_best_practice.joblib",
    "vaxcheck_svm_best_practice.joblib"
]
model = None

FEATURES_ORDER = ["onset_ms", "snr_db", "tau_env_ms", "tau_env_r2", "prony_freq_hz", "prony_tau_ms", "prony_r", "band_mid_pct", "band_high_pct", "ring_energy"]

def load_model():
    global model
    for p in MODEL_FILENAMES:
        if os.path.exists(p):
            try:
                model = joblib.load(p)
                logging.info(f"Loaded SVM model from {os.path.abspath(p)}")
                return model
            except Exception as e:
                logging.error(f"Error loading model from {p}: {e}")
    logging.error("vaxcheck_svm_best_practice.joblib not found. Run train_model.py first.")
    return None

load_model()

def clean_dict(d):
    """Recursively clean dict for JSON serialization (convert numpy scalars, NaNs, Infs to None/native types)."""
    import numpy as np
    for k, v in list(d.items()):
        if isinstance(v, dict):
            clean_dict(v)
        elif isinstance(v, (np.floating, float)):
            if math.isnan(v) or math.isinf(v):
                d[k] = None
            else:
                d[k] = float(v)
        elif isinstance(v, (np.integer, int)):
            d[k] = int(v)
        elif isinstance(v, (np.bool_, bool)):
            d[k] = bool(v)
        elif isinstance(v, (np.ndarray, list)):
            cleaned_list = []
            for x in v:
                if isinstance(x, (np.floating, float)):
                    cleaned_list.append(None if (math.isnan(x) or math.isinf(x)) else float(x))
                elif isinstance(x, (np.integer, int)):
                    cleaned_list.append(int(x))
                elif isinstance(x, dict):
                    cleaned_list.append(clean_dict(x))
                else:
                    cleaned_list.append(x)
            d[k] = cleaned_list
    return d

def auto_detect_serial():
    ports = serial.tools.list_ports.comports()
    # 1. Look for USB/Serial or ESP32 identifiers
    for port in ports:
        desc = (port.description or "").lower()
        if any(k in desc for k in ["cp210", "ch340", "ch341", "esp32", "usb", "serial", "uart"]):
            try:
                s = serial.Serial(port.device, 921600, timeout=2)
                s.close()
                return port.device
            except Exception:
                continue
    # 2. Try any available port
    for port in ports:
        try:
            s = serial.Serial(port.device, 921600, timeout=2)
            s.close()
            return port.device
        except Exception:
            continue
    # 3. Try COM12 as specific fallback
    try:
        s = serial.Serial("COM12", 921600, timeout=2)
        s.close()
        return "COM12"
    except Exception:
        pass
    return None

def connect_serial(port_name=None):
    global serial_port
    with serial_lock:
        if serial_port and serial_port.is_open:
            if port_name is None or serial_port.port == port_name:
                return True
            else:
                serial_port.close()
        
        if not port_name:
            port_name = auto_detect_serial()
            if not port_name:
                return False
                
        try:
            serial_port = serial.Serial(port_name, 921600, timeout=10)
            time.sleep(0.5)  # Allow USB UART bridge to stabilize
            serial_port.reset_input_buffer()
            logging.info(f"Connected to serial port {port_name}")
            return True
        except Exception as e:
            logging.error(f"Failed to connect to {port_name}: {e}")
            return False

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "serial_connected": serial_port is not None and serial_port.is_open,
        "serial_port": serial_port.port if (serial_port and serial_port.is_open) else None,
        "model_loaded": model is not None
    })

@app.route('/serial/status', methods=['GET'])
def serial_status():
    if serial_port and serial_port.is_open:
        return jsonify({"connected": True, "port": serial_port.port})
    return jsonify({"connected": False})

@app.route('/serial/connect', methods=['POST'])
def serial_connect():
    data = request.json or {}
    port = data.get("port")
    success = connect_serial(port)
    return jsonify({"connected": success, "port": serial_port.port if success else None})

@app.route('/serial/disconnect', methods=['POST'])
def serial_disconnect():
    global serial_port
    with serial_lock:
        if serial_port and serial_port.is_open:
            serial_port.close()
    return jsonify({"connected": False})

def evaluate_quality_gates(features, prediction, wav_data):
    # Check if all zeros
    is_silence = all(x == 0 for x in wav_data)
    
    failures = []
    if is_silence:
        failures.append("audio is all zeros (microphone/silence problem)")
    
    snr = features.get('snr_db')
    if snr is None or (isinstance(snr, float) and math.isnan(snr)) or snr < 10:
        failures.append("SNR < 10 dB")
        
    peak_pct = features.get('peak_pct_fs')
    if peak_pct is None or (isinstance(peak_pct, float) and math.isnan(peak_pct)) or peak_pct < 15 or peak_pct > 95:
        failures.append("peak < 15% or > 95% of full scale (peak_pct_fs)")
        
    tau_env = features.get('tau_env_ms')
    if tau_env is None or (isinstance(tau_env, float) and math.isnan(tau_env)):
        failures.append("tau_env_ms is NaN")
        
    conf = prediction.get('confidence', 0)
    if conf < 0.6:
        failures.append("model confidence < 0.6")
        
    passed = len(failures) == 0
    return {"passed": passed, "failures": failures}

def process_file_and_predict(wav_path, strike_number, wav_data):
    features = analyze_file(wav_path)
    
    feature_vector = []
    for f in FEATURES_ORDER:
        val = features.get(f, float('nan'))
        feature_vector.append(val)
    
    prediction = {"class": None, "label": None, "confidence": 0, "probabilities": []}
    
    if model is not None:
        X = [feature_vector]
        proba = model.predict_proba(X)[0]
        pred_class = int(model.predict(X)[0])
        conf = float(proba[pred_class])
        
        prediction = {
            "class": pred_class,
            "label": "healthy" if pred_class == 1 else "damaged",
            "confidence": conf,
            "probabilities": [float(p) for p in proba]
        }
        
    qg = evaluate_quality_gates(features, prediction, wav_data)
    
    return {
        "strike_number": strike_number,
        "wav_path": wav_path,
        "features": features,
        "prediction": prediction,
        "quality_gates": qg
    }

CAPTURES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "captures")
os.makedirs(CAPTURES_DIR, exist_ok=True)

def read_binary_frame():
    """Synchronize to ESP32 binary frame header [0x56, 0x58, 0x01, 0x00, fs(2), N(2)] and read int16 samples."""
    MAGIC0, MAGIC1, TAG = 0x56, 0x58, 0x01
    
    # Read initial 8-byte header window
    hdr = b""
    t0 = time.time()
    while len(hdr) < 8:
        chunk = serial_port.read(8 - len(hdr))
        if not chunk:
            if time.time() - t0 > 10.0:
                raise TimeoutError("Timeout waiting for ESP32 frame header (check if firmware is running)")
            continue
        hdr += chunk
        
    # Slide 1 byte at a time until magic bytes match: 'V', 'X', TAG (0x01), reserved (0x00)
    while not (hdr[0] == MAGIC0 and hdr[1] == MAGIC1 and hdr[2] == TAG and hdr[3] == 0x00):
        b = serial_port.read(1)
        if not b:
            if time.time() - t0 > 15.0:
                raise TimeoutError(f"Timeout syncing to frame magic bytes (buffer: {hdr[:8].hex()})")
            continue
        hdr = hdr[1:] + b
        
    # Big-endian sample rate (fs) and sample count (N)
    fs = (hdr[4] << 8) | hdr[5]
    n_samples = (hdr[6] << 8) | hdr[7]
    
    if not (8000 <= fs <= 96000 and 1000 <= n_samples <= 65535):
        raise ValueError(f"Invalid frame header values: fs={fs}, N={n_samples}")
        
    logging.info(f"ESP32 Frame Synced: fs={fs} Hz, N={n_samples} samples")
    
    # Read payload: n_samples * 2 bytes of little-endian int16 samples
    samples_bytes = b""
    bytes_to_read = n_samples * 2
    t_payload = time.time()
    while len(samples_bytes) < bytes_to_read:
        chunk = serial_port.read(bytes_to_read - len(samples_bytes))
        if not chunk:
            if time.time() - t_payload > 10.0:
                raise TimeoutError(f"Timeout reading sample data: received {len(samples_bytes)} of {bytes_to_read} bytes")
            continue
        samples_bytes += chunk
        
    samples = struct.unpack(f"<{n_samples}h", samples_bytes)
    return fs, n_samples, samples, samples_bytes

@app.route('/strike', methods=['POST'])
def strike():
    data = request.json or {}
    count = data.get("count", 3)
    delay_s = float(data.get("delay_s", 10.0))
    
    if not serial_port or not serial_port.is_open:
        return jsonify({"error": "Serial port not connected"}), 400
        
    strikes_res = []
    
    with serial_lock:
        for i in range(count):
            try:
                # Flush input buffer before sending strike command
                serial_port.reset_input_buffer()
                serial_port.write(b'S')
                serial_port.flush()
                
                fs, N, samples, samples_bytes = read_binary_frame()
                
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                wav_path = os.path.join(CAPTURES_DIR, f"strike_{timestamp}.wav")
                
                with wave.open(wav_path, 'wb') as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(fs)
                    wf.writeframes(samples_bytes)
                    
                strike_res = process_file_and_predict(wav_path, i+1, samples)
                strikes_res.append(strike_res)
                
            except Exception as e:
                logging.error(f"Error during strike {i+1}: {e}")
                strikes_res.append({
                    "strike_number": i+1,
                    "error": str(e)
                })
                
            if i < count - 1 and delay_s > 0:
                time.sleep(delay_s)
                
    # Aggregate results
    valid_strikes = [s for s in strikes_res if "error" not in s]
    
    if not valid_strikes:
        return jsonify({"error": "All strikes failed", "strikes": strikes_res}), 500
        
    # Majority voting and quality gate evaluation
    passes = 0
    fails = 0
    inconclusive = 0
    
    sum_tau = 0
    sum_freq = 0
    sum_snr = 0
    sum_conf = 0
    count_valid = len(valid_strikes)
    
    all_failures = []
    for s in valid_strikes:
        sum_tau += s["features"].get("tau_env_ms", 0) if not math.isnan(s["features"].get("tau_env_ms", float('nan'))) else 0
        sum_freq += s["features"].get("prony_freq_hz", 0) if not math.isnan(s["features"].get("prony_freq_hz", float('nan'))) else 0
        sum_snr += s["features"].get("snr_db", 0) if not math.isnan(s["features"].get("snr_db", float('nan'))) else 0
        sum_conf += s["prediction"].get("confidence", 0)
        
        qg_passed = s["quality_gates"]["passed"]
        if not qg_passed:
            inconclusive += 1
            for f in s["quality_gates"].get("failures", []):
                if f not in all_failures:
                    all_failures.append(f)
        elif s["prediction"]["class"] == 1:
            passes += 1
        elif s["prediction"]["class"] == 0:
            fails += 1
            
    if len(valid_strikes) < count:
        inconclusive += 1
        all_failures.append(f"{count - len(valid_strikes)} strike(s) timed out or had communication errors")
            
    if inconclusive > 0 or passes == fails:
        final_verdict = "INCONCLUSIVE"
        disp_verdict = "Retest Needed"
    elif passes > fails:
        final_verdict = "PASS"
        disp_verdict = "Healthy"
    else:
        final_verdict = "FAIL"
        disp_verdict = "Damaged"
        
    agg = {
        "mean_tau_env_ms": sum_tau / count_valid,
        "mean_prony_freq_hz": sum_freq / count_valid,
        "mean_snr_db": sum_snr / count_valid,
        "mean_confidence": sum_conf / count_valid
    }
    
    res = {
        "verdict": final_verdict,
        "display_verdict": disp_verdict,
        "confidence": sum_conf / count_valid,
        "strikes": strikes_res,
        "aggregate": agg,
        "quality_gates": {"passed": len(all_failures) == 0 and inconclusive == 0, "failures": all_failures}
    }
    
    return jsonify(clean_dict(res))

@app.route('/analyze-wav', methods=['POST'])
def analyze_wav_ep():
    data = request.json or {}
    wav_path = data.get("wav_path")
    if not wav_path or not os.path.exists(wav_path):
        return jsonify({"error": "WAV file not found"}), 404
        
    try:
        with wave.open(wav_path, 'rb') as wf:
            n_samples = wf.getnframes()
            samples_bytes = wf.readframes(n_samples)
            if wf.getsampwidth() == 2:
                samples = struct.unpack(f"<{n_samples}h", samples_bytes)
            else:
                samples = []
    except:
        samples = []
        
    res = process_file_and_predict(wav_path, 1, samples)
    
    final_verdict = "INCONCLUSIVE"
    disp_verdict = "Retest Needed"
    
    if res["quality_gates"]["passed"]:
        if res["prediction"]["class"] == 1:
            final_verdict = "PASS"
            disp_verdict = "Healthy"
        else:
            final_verdict = "FAIL"
            disp_verdict = "Damaged"
            
    out = {
        "verdict": final_verdict,
        "display_verdict": disp_verdict,
        "confidence": res["prediction"]["confidence"],
        "strikes": [res],
        "aggregate": {
            "mean_tau_env_ms": res["features"].get("tau_env_ms"),
            "mean_prony_freq_hz": res["features"].get("prony_freq_hz"),
            "mean_snr_db": res["features"].get("snr_db"),
            "mean_confidence": res["prediction"]["confidence"]
        },
        "quality_gates": res["quality_gates"]
    }
    return jsonify(clean_dict(out))

if __name__ == '__main__':
    # Connect serial on startup if possible
    connect_serial()
    app.run(host='0.0.0.0', port=5001)
