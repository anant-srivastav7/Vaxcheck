import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Test } from '../models/Test.model.js';
import { VialBatch } from '../models/VialBatch.model.js';
import { Device } from '../models/Device.model.js';
import { Clinic } from '../models/Clinic.model.js';
import { User } from '../models/User.model.js';
import { PYTHON_SIDECAR_URL, TEST_VERDICTS } from '../constants.js';
import { evaluateBatchAlert } from './test.controller.js';

export const getHardwareStatus = asyncHandler(async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_SIDECAR_URL}/health`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    res.status(200).json(new ApiResponse(200, data, 'Hardware sidecar status retrieved'));
  } catch (error) {
    res.status(200).json(new ApiResponse(200, {
      status: "degraded",
      message: "Python sidecar is unreachable",
      error: error.message
    }, 'Hardware sidecar status retrieved (degraded)'));
  }
});

export const connectHardware = asyncHandler(async (req, res) => {
  const { port } = req.body;
  const response = await fetch(`${PYTHON_SIDECAR_URL}/serial/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, errorData.error || 'Failed to connect hardware');
  }
  
  const data = await response.json();
  res.status(200).json(new ApiResponse(200, data, 'Hardware connected successfully'));
});

export const disconnectHardware = asyncHandler(async (req, res) => {
  const response = await fetch(`${PYTHON_SIDECAR_URL}/serial/disconnect`, {
    method: 'POST',
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, errorData.error || 'Failed to disconnect hardware');
  }
  
  const data = await response.json();
  res.status(200).json(new ApiResponse(200, data, 'Hardware disconnected successfully'));
});

export const triggerStrike = asyncHandler(async (req, res) => {
  const { vial_batch_id, vaccine_name, strikes_count, worker_id } = req.body;
  
  if (!vial_batch_id) {
    throw new ApiError(400, 'vial_batch_id is required');
  }

  // 1. Call sidecar
  const count = strikes_count || 3;
  const delay_s = req.body.delay_s !== undefined ? Number(req.body.delay_s) : 1.2;
  const response = await fetch(`${PYTHON_SIDECAR_URL}/strike`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count, delay_s }),
    signal: AbortSignal.timeout(30000), // 30s timeout
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, errorData.error || 'Failed to trigger strike');
  }

  const sidecarResult = await response.json();

  // 2. Setup Device/Clinic
  let clinic = await Clinic.findOne();
  if (!clinic) {
    clinic = await Clinic.create({
      name: 'Default Clinic',
      location: 'Local',
      contactInfo: 'support@vaxcheck.internal'
    });
  }

  let device = await Device.findOne({ authToken: 'vax_tok_demo_solenoid_unit_01' });
  if (!device) {
    device = await Device.create({
      name: 'ESP32 USB Solenoid Unit',
      authToken: 'vax_tok_demo_solenoid_unit_01',
      clinic: clinic._id,
      isActive: true,
    });
  }

  // 3. Upsert VialBatch
  await VialBatch.findOneAndUpdate(
    { batchId: vial_batch_id },
    {
      $setOnInsert: {
        batchId: vial_batch_id,
        vaccineName: vaccine_name || 'Generic Vaccine',
        manufacturer: 'Unknown',
      },
    },
    { upsert: true, new: true }
  );

  // 4. Determine Verdict
  let verdict = TEST_VERDICTS.INCONCLUSIVE;
  if (sidecarResult.verdict === 'PASS' || sidecarResult.verdict === 'FAIL') {
    verdict = sidecarResult.verdict;
  } else if (sidecarResult.overall_result) {
    verdict = sidecarResult.overall_result;
  }

  // 5. Build Strikes
  const strikes = (sidecarResult.strikes || []).map(s => ({
    strikeNumber: s.strike_number || 1,
    peakAmplitude: s.features?.peak_pct_fs != null ? s.features.peak_pct_fs / 100 : null,
    decayTimeConstant: s.features?.tau_env_ms ?? null,
    dominantFrequencyHz: s.features?.prony_freq_hz ?? null,
    snrDb: s.features?.snr_db ?? null,
    confidence: s.prediction?.confidence ?? null,
    ringEnergy: s.features?.ring_energy ?? null,
    onsetMs: s.features?.onset_ms ?? null,
    tauEnvR2: s.features?.tau_env_r2 ?? null,
    pronyTauMs: s.features?.prony_tau_ms ?? null,
    pronyR: s.features?.prony_r ?? null,
    bandMidPct: s.features?.band_mid_pct ?? null,
    bandHighPct: s.features?.band_high_pct ?? null,
    peakPctFs: s.features?.peak_pct_fs ?? null,
    clipPct: s.features?.clip_pct ?? null,
    qualityFlags: s.quality_gates?.failures || [],
    wavPath: s.wav_path ?? null,
  }));

  // Resolve worker ObjectId if valid
  let workerRef = null;
  if (worker_id) {
    const w = await User.findById(worker_id).catch(() => null);
    if (w) workerRef = w._id;
  }

  // 6. Create Test
  const test = await Test.create({
    device: device._id,
    worker: workerRef,
    vialBatchId: vial_batch_id,
    testedAt: new Date(),
    classificationResult: verdict,
    confidenceScore: sidecarResult.confidence ?? 0.5,
    strikesUsed: count,
    strikes,
    qualityGates: {
      passed: sidecarResult.quality_gates?.passed ?? true,
      failures: sidecarResult.quality_gates?.failures || [],
    },
    connectionMode: 'usb_serial',
    notes: 'Real ESP32 acoustic test via USB serial',
  });

  // 7. Evaluate Batch Alert
  const batchAlert = await evaluateBatchAlert(vial_batch_id);

  res.status(201).json(new ApiResponse(201, {
    test_id: test._id,
    vial_batch_id: test.vialBatchId,
    vaccine_name: vaccine_name || 'Generic Vaccine',
    classification_result: test.classificationResult,
    confidence_score: test.confidenceScore,
    tested_at: test.testedAt,
    strikes_used: test.strikesUsed,
    strikes: test.strikes,
    quality_gates: test.qualityGates,
    batch_alert: batchAlert,
    sidecar_data: sidecarResult,
  }, 'Test completed successfully'));
});

export const analyzeWav = asyncHandler(async (req, res) => {
  const { wav_path } = req.body;
  
  if (!wav_path) {
    throw new ApiError(400, 'wav_path is required');
  }

  const response = await fetch(`${PYTHON_SIDECAR_URL}/analyze-wav`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wav_path }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, errorData.error || 'Failed to analyze wav');
  }

  const data = await response.json();
  res.status(200).json(new ApiResponse(200, data, 'WAV analyzed successfully'));
});
