/**
 * controllers/batch.controller.js
 *
 * Handles: list all batches with aggregate stats, get single batch detail.
 */

import { VialBatch } from '../models/VialBatch.model.js';
import { Test } from '../models/Test.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { evaluateBatchAlert } from './test.controller.js';
import {
  TEST_VERDICTS,
  BATCH_FAIL_COUNT_THRESHOLD,
  BATCH_FAIL_RATE_THRESHOLD,
} from '../constants.js';

/** Aggregate test stats for a batch by its batchId string */
async function getBatchStats(batchId) {
  const agg = await Test.aggregate([
    { $match: { vialBatchId: batchId } },
    {
      $group: {
        _id: '$vialBatchId',
        total_tests: { $sum: 1 },
        pass_count: {
          $sum: { $cond: [{ $eq: ['$classificationResult', TEST_VERDICTS.PASS] }, 1, 0] },
        },
        fail_count: {
          $sum: { $cond: [{ $eq: ['$classificationResult', TEST_VERDICTS.FAIL] }, 1, 0] },
        },
        inconclusive_count: {
          $sum: {
            $cond: [{ $eq: ['$classificationResult', TEST_VERDICTS.INCONCLUSIVE] }, 1, 0],
          },
        },
        first_tested_at: { $min: '$testedAt' },
        last_tested_at: { $max: '$testedAt' },
      },
    },
  ]);

  if (!agg.length) {
    return {
      total_tests: 0,
      pass_count: 0,
      fail_count: 0,
      inconclusive_count: 0,
      first_tested_at: null,
      last_tested_at: null,
    };
  }

  return agg[0];
}

/**
 * GET /api/v1/batches
 * All vaccine batches with aggregated test statistics and alert status.
 */
const listBatches = asyncHandler(async (_req, res) => {
  const batches = await VialBatch.find().sort({ createdAt: -1 });

  const withStats = await Promise.all(
    batches.map(async (b) => {
      const stats = await getBatchStats(b.batchId);
      const total = stats.total_tests;
      const fails = stats.fail_count;
      const failRate = total > 0 ? Number(((fails / total) * 100).toFixed(1)) : 0;
      const isConcerning =
        fails >= BATCH_FAIL_COUNT_THRESHOLD ||
        (total >= BATCH_FAIL_COUNT_THRESHOLD && fails / total >= BATCH_FAIL_RATE_THRESHOLD);

      return {
        id: b.batchId,
        vaccine_name: b.vaccineName,
        manufacturer: b.manufacturer,
        first_seen_at: b.createdAt,
        notes: b.notes,
        ...stats,
        fail_rate: failRate,
        is_concerning: isConcerning,
        alert_status: fails >= BATCH_FAIL_COUNT_THRESHOLD
          ? 'CRITICAL_QUARANTINE'
          : isConcerning
          ? 'WARNING_MONITOR'
          : 'NORMAL',
      };
    })
  );

  // Sort: concerning first, then by latest test
  withStats.sort((a, b) => {
    if (b.is_concerning !== a.is_concerning) return b.is_concerning ? 1 : -1;
    return new Date(b.last_tested_at) - new Date(a.last_tested_at);
  });

  return res.status(200).json(new ApiResponse(200, withStats));
});

/**
 * GET /api/v1/batches/:batch_id
 * Detailed batch view including all individual tests.
 */
const getBatch = asyncHandler(async (req, res) => {
  const batchId = req.params.batch_id;

  let batch = await VialBatch.findOne({ batchId });

  // If not in VialBatch collection yet, check if tests reference it
  if (!batch) {
    const count = await Test.countDocuments({ vialBatchId: batchId });
    if (!count) throw new ApiError(404, 'Batch not found');

    // Synthetic batch entry
    batch = { batchId, vaccineName: 'Unregistered Batch', manufacturer: 'Unknown', notes: '', createdAt: new Date() };
  }

  const stats = await getBatchStats(batchId);
  const total = stats.total_tests;
  const fails = stats.fail_count;
  const failRate = total > 0 ? Number(((fails / total) * 100).toFixed(1)) : 0;
  const isConcerning =
    fails >= BATCH_FAIL_COUNT_THRESHOLD ||
    (total >= BATCH_FAIL_COUNT_THRESHOLD && fails / total >= BATCH_FAIL_RATE_THRESHOLD);

  const tests = await Test.find({ vialBatchId: batchId })
    .sort({ testedAt: -1 })
    .populate({
      path: 'device',
      select: 'name clinic',
      populate: { path: 'clinic', select: 'name' },
    })
    .populate('worker', 'fullName');

  const formattedTests = tests.map((t) => ({
    id: t._id,
    device_id: t.device?._id,
    device_name: t.device?.name,
    clinic_name: t.device?.clinic?.name,
    tested_at: t.testedAt,
    received_at: t.createdAt,
    classification_result: t.classificationResult,
    confidence_score: t.confidenceScore,
    strikes_used: t.strikesUsed,
    notes: t.notes,
    worker_name: t.worker?.fullName || null,
  }));

  const alert = await evaluateBatchAlert(batchId);

  return res.status(200).json(
    new ApiResponse(200, {
      id: batch.batchId || batch._id,
      vaccine_name: batch.vaccineName,
      manufacturer: batch.manufacturer,
      first_seen_at: batch.createdAt,
      notes: batch.notes,
      ...stats,
      fail_rate: failRate,
      is_concerning: isConcerning,
      alert,
      tests: formattedTests,
    })
  );
});

export { listBatches, getBatch };
