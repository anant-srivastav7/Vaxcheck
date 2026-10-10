/**
 * controllers/stats.controller.js
 *
 * Handles: platform-wide or clinic-specific overview statistics.
 */

import { Test } from '../models/Test.model.js';
import { Device } from '../models/Device.model.js';
import { VialBatch } from '../models/VialBatch.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  TEST_VERDICTS,
  DEVICE_ONLINE_THRESHOLD_MS,
  BATCH_FAIL_COUNT_THRESHOLD,
  BATCH_FAIL_RATE_THRESHOLD,
} from '../constants.js';

/**
 * GET /api/v1/stats/overview
 * Returns aggregated counts for the admin dashboard.
 */
const getOverview = asyncHandler(async (req, res) => {
  const { clinic_id } = req.query;

  // Device filter
  const deviceFilter = clinic_id ? { clinic: clinic_id } : {};
  const devices = await Device.find(deviceFilter).select('lastSeenAt isActive batteryLevel');

  const deviceIds = devices.map((d) => d._id);
  const onlineCount = devices.filter((d) => {
    if (!d.lastSeenAt || !d.isActive) return false;
    return Date.now() - new Date(d.lastSeenAt).getTime() <= DEVICE_ONLINE_THRESHOLD_MS;
  }).length;

  // Test stats via aggregation
  const testMatch = deviceIds.length ? { device: { $in: deviceIds } } : {};
  const testAgg = await Test.aggregate([
    { $match: testMatch },
    {
      $group: {
        _id: null,
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
        avg_confidence: { $avg: '$confidenceScore' },
      },
    },
  ]);

  const testStats = testAgg[0] || {
    total_tests: 0,
    pass_count: 0,
    fail_count: 0,
    inconclusive_count: 0,
    avg_confidence: 0,
  };

  // Batch alert counts
  const batches = await VialBatch.find();
  let concerningBatches = 0;

  await Promise.all(
    batches.map(async (b) => {
      const agg = await Test.aggregate([
        { $match: { vialBatchId: b.batchId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            fails: {
              $sum: { $cond: [{ $eq: ['$classificationResult', TEST_VERDICTS.FAIL] }, 1, 0] },
            },
          },
        },
      ]);
      if (agg.length) {
        const { total, fails } = agg[0];
        if (
          fails >= BATCH_FAIL_COUNT_THRESHOLD ||
          (total >= BATCH_FAIL_COUNT_THRESHOLD && fails / total >= BATCH_FAIL_RATE_THRESHOLD)
        ) {
          concerningBatches++;
        }
      }
    })
  );

  const total = testStats.total_tests;
  const passRate = total > 0 ? Number(((testStats.pass_count / total) * 100).toFixed(1)) : 0;
  const failRate = total > 0 ? Number(((testStats.fail_count / total) * 100).toFixed(1)) : 0;

  return res.status(200).json(
    new ApiResponse(200, {
      total_tests: total,
      pass_count: testStats.pass_count,
      fail_count: testStats.fail_count,
      inconclusive_count: testStats.inconclusive_count,
      pass_rate: passRate,
      fail_rate: failRate,
      avg_confidence: testStats.avg_confidence
        ? Number((testStats.avg_confidence * 100).toFixed(1))
        : 0,
      total_devices: devices.length,
      online_devices: onlineCount,
      total_batches: batches.length,
      concerning_batches: concerningBatches,
    })
  );
});

export { getOverview };
