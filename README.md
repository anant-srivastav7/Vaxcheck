# VaxCheck — Acoustic Vaccine Vial Integrity Verification

### **Rapid, Non-Destructive Freeze-Damage Detection for Vaccine Cold Chains in Seconds**

![VaxCheck Hardware Testing Interface](docs/screenshots/Vaxcheck_image.png)

---

## Why It Matters

### The Invisible Cold-Chain Crisis
Vaccines like **Hepatitis B, DTP, Tetanus, and Pentavalent** permanently lose their potency when exposed to freezing temperatures. Once thawed, a freeze-damaged vial looks **completely normal to the naked eye** — healthcare workers cannot see that the medicine inside has lost its efficacy.

* **1 in 3 Shipments at Risk**: Global healthcare studies show that **14% to 35%** of vaccine cold-chain shipments and clinic refrigerators accidentally expose vaccines to sub-zero temperatures during transit or storage.
* **The Current Standard is Broken**: The only existing field procedure — the **WHO Shake Test** — takes **15 to 30 minutes**, requires intentionally freezing and **destroying a valuable control vial**, and relies on subjective visual estimation by eye.
* **The Consequence**: Clinics either discard entire batches out of caution (wasting scarce vaccines) or unknowingly administer inactive doses to children and patients.

---

### The VaxCheck Solution: Turning 30 Minutes into Seconds

VaxCheck replaces manual visual guesswork with an automated, non-invasive physical acoustic test:

| Feature |  WHO Shake Test |  VaxCheck Platform |
| :--- | :--- | :--- |
| **Test Duration** | **15 – 30 Minutes** | **Seconds** |
| **Vial Impact** | **Destructive** (sacrifices a control vial) | **100% Non-Destructive** (vial remains sterile & sealed) |
| **Diagnostic Method** | Visual human observation | **Physics-Feature Support Vector Machine (SVM)** |
| **Digital Records** | Manual paper logbooks | **Automated MongoDB Cloud Audit Trail & Batch Alerts** |
| **Field Automation** | Manual shaking by hand | **Precision ESP32 Solenoid Striker + 32 kHz MEMS Mic** |

---

### How the Physics Works

When an aluminum-adjuvanted vaccine freezes, the uniform microscopic particles bind together into heavy, coarse aggregates. VaxCheck measures this structural change through acoustic ring-down spectroscopy:

1. **Precision Tap**: An ESP32 microcontroller triggers an electromagnetic solenoid pin to gently tap the glass vial.
2. **Acoustic Ring-Down**: A high-resolution ICS-43434 I2S MEMS digital microphone captures the 32 kHz vibration signature.
3. **Physical Decay Separation**:
   * **Healthy Vials** (Smooth colloid suspension): Resonate freely with a slow exponential decay constant of **τ ≈ 40 ms**.
   * **Freeze-Damaged Vials** (Clumped heavy aggregates): The dense particle clusters absorb vibrational energy, dampening the ring **3× faster (τ ≈ 12 ms)**.
4. **Machine Learning Verdict**: Extracted physical features are classified through a trained SVM pipeline, returning **Healthy**, **Damaged**, or **Retest Needed** in real time on the web dashboard.

---

## System Architecture

```text
[ Physical Vial ]
       │
       ▼  (Solenoid Strike + ICS-43434 I2S Microphone)
[ ESP32 Unit ] (Firmware: 32 kHz, 800 ms binary frame @ 921,600 baud)
       │
       ▼  USB Serial (Binary Frame: Magic 0x56 0x58)
[ Python Sidecar Service ] (Flask @ Port 5001)
       │  • Frame Sync & 16-bit WAV writing
       │  • Feature Extraction (analyze_strikes.py)
       │  • SVM Classifier Pipeline (vaxcheck_svm_best_practice.joblib)
       │  • Quality Gates Evaluation
       ▼
[ Node.js Backend Server ] (Express @ Port 5000)
       │  • RESTful API (/api/v1/hardware, /api/v1/tests, etc.)
       │  • MongoDB Atlas Integration & Audit Trail
       │  • Batch Failure & Quarantine Alerts
       ▼
[ React 19 Web Client ] (Vite @ Port 3000)
          • Real-time Test Triggering & Hardware Telemetry
          • Healthy / Damaged / Retest Needed Classification Cards
          • Acoustic Resonance Breakdown & Audio Replay
          • Clinic Worker & Admin Inspection Dashboard
```

---

## Key Features

1. **Non-Destructive Testing**: Test sealed vials without opening or contaminating the vaccine.
2. **Real Hardware Integration**:
   - ESP32 drives IRLZ44N MOSFET gate for calibrated solenoid impact.
   - High-fidelity ICS-43434 MEMS digital I2S microphone captures 32 kHz acoustic ring-down.
3. **Machine Learning Pipeline**:
   - 10 extracted acoustic features: `onset_ms`, `snr_db`, `tau_env_ms`, `tau_env_r2`, `prony_freq_hz`, `prony_tau_ms`, `prony_r`, `band_mid_pct`, `band_high_pct`, `ring_energy`.
   - Pipeline: `SimpleImputer` → `StandardScaler` → `SelectKBest(k=9)` → `SVC(rbf, probability=True)`.
4. **Strict Quality Gates**:
   - Audio silence / zero check
   - SNR >= 10 dB
   - Peak amplitude between 15% and 95% full scale
   - Finite exponential decay constant (tau)
   - Model confidence >= 0.60
5. **Multi-Strike Protocol**: standardized strikes with ≥10 s settling time between them, majority voting across strikes.
6. **Digital Health Cloud**: Automatic sync with MongoDB Atlas, complete test history, and batch-level freeze warnings.

---

## Repository Structure

```text
VaxcheckSoftware/
├── README.md                    # Project documentation
├── start_vaxcheck.bat           # 1-click launcher for all 3 web services
├── analyze_strikes.py           # Feature extraction engine (Hilbert, Prony, FFT)
├── capture_strikes.py           # Standalone serial recorder CLI
├── hackathon_demo.py            # Diagnostic demo script
├── silent_test.py               # Solenoid-off noise floor calibration
├── docs/
│   └── screenshots/             # Hardware and UI captures
├── firmware/
│   └── VaxCheck_capture/
│       └── VaxCheck_capture.ino # Direct-drive ESP32 firmware (921,600 baud)
├── data/                        # Training audio datasets (Healthy & Damaged)
├── model/                       # Jupyter notebooks and model development
├── results/                     # Extracted CSV features and trained joblib models
└── website/
    └── VaxCheck/
        ├── client/              # React 19 + Vite web interface
        └── server/              # Node.js Express backend + Python sidecar
            ├── src/             # Express routes, controllers, and models
            └── python_sidecar/  # Flask service (vaxcheck_service.py)
```

---

## Quick Start

### 1. Prerequisites
- **Node.js** (v18+)
- **Python** (3.10+) with `pyserial`, `flask`, `flask-cors`, `numpy`, `scipy`, `scikit-learn`, `joblib`
- **ESP32** flashed with `firmware/VaxCheck_capture/VaxCheck_capture.ino` (COM port on Windows or `/dev/ttyUSB0` on Linux)

### 2. Environment Setup
Create `website/VaxCheck/server/.env` based on `website/VaxCheck/server/.env.example`:
```env
MONGODB_URI=your_mongodb_connection_string
PORT=5000
CORS_ORIGIN=http://localhost:3000
JWT_SECRET=your_jwt_secret
CLIENT_URL=http://localhost:3000
```

### 3. Install Dependencies
```bash
# Python Sidecar
cd website/VaxCheck/server/python_sidecar
pip install -r requirements.txt

# Node.js Server
cd ../
npm install

# React Frontend
cd ../client
npm install
```

### 4. Run the Application
You can launch all services at once on Windows using:
```bash
start_vaxcheck.bat
```

Or run them in separate terminals:
- **Terminal 1 (Python Hardware Sidecar)**:
  ```bash
  cd website/VaxCheck/server
  python python_sidecar/vaxcheck_service.py
  ```
- **Terminal 2 (Node.js Backend)**:
  ```bash
  cd website/VaxCheck/server
  npm start
  ```
- **Terminal 3 (React Frontend)**:
  ```bash
  cd website/VaxCheck/client
  npm run dev
  ```

Open [http://localhost:3000](http://localhost:3000) in your browser.
