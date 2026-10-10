/**
 * controllers/test.controller.js
 *
 * Handles: submit test(s) from ESP32, list/filter tests, get single test.
 *
 * Business rules:
 *  - A test is identified as "concerning" when its batch hits the thresholds
 *    defined in constants.js
 *  - Supports single and batch (offline-queued) submissions in one POST
 */

import { Test } from '../models/Test.model.js';
import { VialBatch } from '../models/VialBatch.model.js';
import { Device } from '../models/Device.model.js';
import { User } from '../models/User.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  TEST_VERDICTS,
  BATCH_FAIL_COUNT_THRESHOLD,
  BATCH_FAIL_RATE_THRESHOLD,
} from '../constants.js';

/** Evaluate whether a batch has crossed the alert thresholds */
async function evaluateBatchAlert(vialBatchId) {
  const agg = await Test.aggregate([
    { $match: { vialBatchId } },
    {
      $group: {
        _id: '$vialBatchId',
        total: { $sum: 1 },
        failCount: {
          $sum: { $cond: [{ $eq: ['$classificationResult', TEST_VERDICTS.FAIL] }, 1, 0] },
        },
        passCount: {
          $sum: { $cond: [{ $eq: ['$classificationResult', TEST_VERDICTS.PASS] }, 1, 0] },
        },
      },
    },
  ]);

  if (!agg.length || agg[0].total === 0) return null;

  const { total, failCount } = agg[0];
  const failRate = failCount / total;
  const isConcerning =
    failCount >= BATCH_FAIL_COUNT_THRESHOLD ||
    (total >= BATCH_FAIL_COUNT_THRESHOLD && failRate >= BATCH_FAIL_RATE_THRESHOLD);

  if (!isConcerning) return null;

  return {
    vial_batch_id: vialBatchId,
    total_tests: total,
    fail_count: failCount,
    fail_rate: Number((failRate * 100).toFixed(1)),
    is_concerning: true,
    alert_level: failCount >= BATCH_FAIL_COUNT_THRESHOLD ? 'CRITICAL' : 'WARNING',
    alert_message:
      failCount >= BATCH_FAIL_COUNT_THRESHOLD
        ? `CRITICAL ALERT: ${failCount} vials from batch ${vialBatchId} failed acoustic freeze testing! Immediate quarantine recommended.`
        : `WARNING: High failure rate (${(failRate * 100).toFixed(0)}%) observed for batch ${vialBatchId}.`,
  };
}

/**
 * POST /api/v1/tests
 * Device submits one or multiple test result(s).
 */
const submitTests = asyncHandler(async (req, res) => {
  const device = req.device;
  const body = req.body;

  // Normalize to array — supports single, array, or { tests: [] }
  let testsPayload = Array.isArray(body.tests)
    ? body.tests
    : Array.isArray(body)
    ? body
    : [body];

  if (!testsPayload.length) {
    throw new ApiError(400, 'No test data provided in payload');
  }

  const validVerdicts = Object.values(TEST_VERDICTS);
  const insertedIds = [];
  let lastBatchId = null;

  for (const item of testsPayload) {
    if (!item.vial_batch_id) {
      throw new ApiError(400, 'vial_batch_id is required for every test');
    }

    const verdict = (item.classification_result || '').toUpperCase();
    if (!validVerdicts.includes(verdict)) {
      throw new ApiError(
        400,
        `Invalid classification_result: "${item.classification_result}". Must be PASS, FAIL, or INCONCLUSIVE.`
      );
    }

    const confidence = parseFloat(item.confidence_score);
    if (isNaN(confidence) || confidence < 0 || confidence > 1) {
      throw new ApiError(
        400,
        `Invalid confidence_score: ${item.confidence_score}. Must be a float 0.0–1.0.`
      );
    }

    // Upsert VialBatch
    await VialBatch.findOneAndUpdate(
      { batchId: item.vial_batch_id },
      {
        $setOnInsert: {
          batchId: item.vial_batch_id,
          vaccineName: item.vaccine_name || 'Generic Vaccine',
          manufacturer: item.manufacturer || 'Unknown',
        },
      },
      { upsert: true, new: true }
    );

    // Resolve worker ObjectId if provided
    let workerRef = null;
    if (item.worker_id) {
      const w = await User.findById(item.worker_id).catch(() => null);
      if (w) workerRef = w._id;
    }

    const strikesUsed =
      parseInt(item.strikes_used, 10) ||
      (Array.isArray(item.strikes) ? item.strikes.length : 1);

    const strikes = Array.isArray(item.strikes)
      ? item.strikes.map((s, i) => ({
          strikeNumber: s.strike_number || i + 1,
          peakAmplitude: s.peak_amplitude !== undefined ? parseFloat(s.peak_amplitude) : null,
          decayTimeConstant:
            s.decay_time_constant !== undefined ? parseFloat(s.decay_time_constant) : null,
          dominantFrequencyHz:
            s.dominant_frequency_hz !== undefined
              ? parseFloat(s.dominant_frequency_hz)
              : null,
        }))
      : [];

    const test = await Test.create({
      device: device._id,
      worker: workerRef,
      vialBatchId: item.vial_batch_id,
      testedAt: item.timestamp ? new Date(item.timestamp) : new Date(),
      classificationResult: verdict,
      confidenceScore: confidence,
      strikesUsed,
      strikes,
      notes: item.notes || '',
    });

    insertedIds.push(test._id);
    lastBatchId = item.vial_batch_id;
  }

  const batchAlert = lastBatchId ? await evaluateBatchAlert(lastBatchId) : null;

  return res.status(201).json(
    new ApiResponse(201, {
      inserted_count: insertedIds.length,
      test_ids: insertedIds,
      batch_alert: batchAlert,
    }, `Successfully recorded ${insertedIds.length} test result(s)`)
  );
});

/**
 * GET /api/v1/tests
 * List and filter tests with pagination.
 */
const listTests = asyncHandler(async (req, res) => {
  const {
    clinic_id,
    device_id,
    vial_batch_id,
    classification_result,
    date_from,
    date_to,
    limit = 50,
    offset = 0,
  } = req.query;

  // Build device filter for clinic
  let deviceIds;
  if (clinic_id) {
    const devs = await Device.find({ clinic: clinic_id }).select('_id');
    deviceIds = devs.map((d) => d._id);
  }

  const match = {};
  if (deviceIds) match.device = { $in: deviceIds };
  if (device_id) match.device = device_id;
  if (vial_batch_id) match.vialBatchId = { $regex: vial_batch_id, $options: 'i' };
  if (classification_result) match.classificationResult = classification_result.toUpperCase();
  if (date_from || date_to) {
    match.testedAt = {};
    if (date_from) match.testedAt.$gte = new Date(date_from);
    if (date_to) match.testedAt.$lte = new Date(date_to);
  }

  const total = await Test.countDocuments(match);

  const tests = await Test.find(match)
    .sort({ testedAt: -1 })
    .skip(parseInt(offset, 10))
    .limit(parseInt(limit, 10))
    .populate({
      path: 'device',
      select: 'name clinic',
      populate: { path: 'clinic', select: 'name' },
    })
    .populate('worker', 'fullName');

  const formatted = tests.map((t) => ({
    id: t._id,
    device_id: t.device?._id,
    device_name: t.device?.name,
    clinic_id: t.device?.clinic?._id || null,
    clinic_name: t.device?.clinic?.name || null,
    vial_batch_id: t.vialBatchId,
    tested_at: t.testedAt,
    received_at: t.createdAt,
    classification_result: t.classificationResult,
    confidence_score: t.confidenceScore,
    strikes_used: t.strikesUsed,
    notes: t.notes,
    worker_name: t.worker?.fullName || null,
  }));

  return res.status(200).json(
    new ApiResponse(200, {
      total,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      tests: formatted,
    })
  );
});

/**
 * GET /api/v1/tests/:test_id
 * Full detail including acoustic strikes and batch alert.
 */
const getTest = asyncHandler(async (req, res) => {
  const test = await Test.findById(req.params.test_id)
    .populate({
      path: 'device',
      select: 'name firmwareVersion clinic',
      populate: { path: 'clinic', select: 'name location' },
    })
    .populate('worker', 'fullName');

  if (!test) throw new ApiError(404, 'Test record not found');

  const batchInfo = await VialBatch.findOne({ batchId: test.vialBatchId });
  const batchAlert = await evaluateBatchAlert(test.vialBatchId);

  return res.status(200).json(
    new ApiResponse(200, {
      id: test._id,
      device_id: test.device?._id,
      device_name: test.device?.name,
      firmware_version: test.device?.firmwareVersion,
      clinic_name: test.device?.clinic?.name,
      clinic_location: test.device?.clinic?.location,
      vial_batch_id: test.vialBatchId,
      vaccine_name: batchInfo?.vaccineName,
      manufacturer: batchInfo?.manufacturer,
      tested_at: test.testedAt,
      received_at: test.createdAt,
      classification_result: test.classificationResult,
      confidence_score: test.confidenceScore,
      strikes_used: test.strikesUsed,
      strikes: test.strikes,
      notes: test.notes,
      worker_name: test.worker?.fullName || null,
      batch_alert: batchAlert,
    })
  );
});

export { submitTests, listTests, getTest, evaluateBatchAlert };
