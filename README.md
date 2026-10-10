# VaxCheck — Acoustic Vaccine Vial Integrity Verification

VaxCheck is an end-to-end hardware, machine learning, and web platform designed to detect cold-chain freeze damage in sealed vaccine vials non-destructively using calibrated solenoid acoustic excitation and TinyML/SVM resonance ring-down analysis.

---

## System Architecture

`	ext
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
`

---

## Key Features

1. **Non-Destructive Testing**: Test sealed vials without opening or contaminating the vaccine.
2. **Real Hardware Integration**:
   - ESP32 drives IRLZ44N MOSFET gate for calibrated solenoid impact.
   - High-fidelity ICS-43434 MEMS digital I2S microphone captures 32 kHz acoustic ring-down.
3. **Machine Learning Pipeline**:
   - 10 extracted acoustic features: onset_ms, snr_db, 	au_env_ms, 	au_env_r2, prony_freq_hz, prony_tau_ms, prony_r, and_mid_pct, and_high_pct, 
ing_energy.
   - Pipeline: SimpleImputer -> StandardScaler -> SelectKBest(k=9) -> SVC(rbf, probability=True).
4. **Strict Quality Gates**:
   - Audio silence / zero check
   - SNR >= 10 dB
   - Peak amplitude between 15% and 95% full scale
   - Finite exponential decay constant (tau)
   - Model confidence >= 0.60
5. **Multi-Strike Protocol**: Fires 3 standardized strikes in ~5 seconds with multi-strike majority voting.
6. **Digital Health Cloud**: Automatic sync with MongoDB Atlas, complete test history, and batch-level freeze warnings.

---

## Repository Structure

`	ext
VaxcheckSoftware/
├── analyze_strikes.py           # Feature extraction engine (Hilbert, Prony, FFT)
├── capture_strikes.py           # Standalone serial recorder CLI
├── hackathon_demo.py            # Diagnostic demo script
├── silent_test.py               # Solenoid-off noise floor calibration
├── start_vaxcheck.bat           # 1-click launcher for all 3 web services
├── firmware/
│   └── VaxCheck_capture__2_.ino # Direct-drive ESP32 firmware (921,600 baud)
├── data/                        # Training audio datasets (Healthy & Damaged)
├── model/                       # Jupyter notebooks and model development
├── results/                     # Extracted CSV features and trained joblib models
└── website/
    └── VaxCheck/
        ├── client/              # React 19 + Vite web interface
        └── server/              # Node.js Express backend + Python sidecar
            ├── src/             # Express routes, controllers, and models
            └── python_sidecar/  # Flask service (vaxcheck_service.py)
`

---

## Quick Start

### 1. Prerequisites
- **Node.js** (v18+)
- **Python** (3.10+) with pyserial, lask, lask-cors, 
umpy, scipy, scikit-learn, joblib
- **ESP32** flashed with irmware/VaxCheck_capture__2_.ino (COM port on Windows or /dev/ttyUSB0 on Linux)

### 2. Environment Setup
Create website/VaxCheck/server/.env based on website/VaxCheck/server/.env.example:
`env
MONGODB_URI=your_mongodb_connection_string
PORT=5000
CORS_ORIGIN=http://localhost:3000
JWT_SECRET=your_jwt_secret
CLIENT_URL=http://localhost:3000
`

### 3. Install Dependencies
`ash
# Python Sidecar
cd website/VaxCheck/server/python_sidecar
pip install -r requirements.txt

# Node.js Server
cd ../
npm install

# React Frontend
cd ../client
npm install
`

### 4. Run the Application
You can launch all services at once on Windows using:
`ash
start_vaxcheck.bat
`

Or run them in separate terminals:
- **Terminal 1 (Python Hardware Sidecar)**:
  `ash
  cd website/VaxCheck/server
  python python_sidecar/vaxcheck_service.py
  `
- **Terminal 2 (Node.js Backend)**:
  `ash
  cd website/VaxCheck/server
  npm start
  `
- **Terminal 3 (React Frontend)**:
  `ash
  cd website/VaxCheck/client
  npm run dev
  `

Open [http://localhost:3000](http://localhost:3000) in your browser.
