const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { requireDeviceAuth, optionalUserAuth } = require('../middleware/auth');

/**
 * Check if a batch has concerning failure patterns
 */
function evaluateBatchAlert(vialBatchId) {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_tests,
      SUM(CASE WHEN classification_result = 'FAIL' THEN 1 ELSE 0 END) as fail_count,
      SUM(CASE WHEN classification_result = 'PASS' THEN 1 ELSE 0 END) as pass_count,
      SUM(CASE WHEN classification_result = 'INCONCLUSIVE' THEN 1 ELSE 0 END) as inc_count
    FROM tests 
    WHERE vial_batch_id = ?
  `).get(vialBatchId);

  if (!stats || stats.total_tests === 0) return null;

  const failRate = stats.fail_count / stats.total_tests;
  const isConcerning = stats.fail_count >= 3 || (stats.total_tests >= 3 && failRate >= 0.30);

  if (isConcerning) {
    return {
      vial_batch_id: vialBatchId,
      total_tests: stats.total_tests,
      fail_count: stats.fail_count,
      fail_rate: Number((failRate * 100).toFixed(1)),
      is_concerning: true,
      alert_level: stats.fail_count >= 3 ? 'CRITICAL' : 'WARNING',
      alert_message: stats.fail_count >= 3
        ? `CRITICAL ALERT: ${stats.fail_count} vials from batch ${vialBatchId} have failed acoustic freeze testing! Immediate quarantine recommended.`
        : `WARNING: High failure rate (${(failRate * 100).toFixed(0)}%) observed for batch ${vialBatchId}.`
    };
  }
  return null;
}

/**
 * POST /api/v1/tests
 * Device submits completed test result(s).
 * Supports both single live tests and batched offline-queued results.
 */
router.post('/', requireDeviceAuth, (req, res) => {
  const device = req.device;
  const body = req.body;

  // Normalize into an array of tests to handle both single and batch submissions
  let testsToInsert = [];

  if (Array.isArray(body.tests)) {
    testsToInsert = body.tests;
  } else if (Array.isArray(body)) {
    testsToInsert = body;
  } else {
    testsToInsert = [body];
  }

  if (testsToInsert.length === 0) {
    return res.status(400).json({ error: 'No test data provided in payload.' });
  }

  const validVerdicts = ['PASS', 'FAIL', 'INCONCLUSIVE'];
  const insertedIds = [];
  let lastEvaluatedBatchId = null;

  // Use a transaction for atomic and fast insertion
  const insertTransaction = db.transaction((testsList) => {
    const insertTestStmt = db.prepare(`
      INSERT INTO tests (
        id, device_id, user_id, vial_batch_id, tested_at, received_at,
        classification_result, confidence_score, strikes_used, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertStrikeStmt = db.prepare(`
      INSERT INTO strikes (
        id, test_id, strike_number, peak_amplitude, decay_time_constant, dominant_frequency_hz
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const upsertBatchStmt = db.prepare(`
      INSERT INTO vial_batches (id, vaccine_name, manufacturer, first_seen_at, notes)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `);

    const now = new Date().toISOString();

    for (const item of testsList) {
      // Validate mandatory fields
      if (!item.vial_batch_id) {
        throw new Error('vial_batch_id is required for every test');
      }

      const verdict = (item.classification_result || '').toUpperCase();
      if (!validVerdicts.includes(verdict)) {
        throw new Error(`Invalid classification_result: "${item.classification_result}". Must be PASS, FAIL, or INCONCLUSIVE.`);
      }

      const confidence = parseFloat(item.confidence_score);
      if (isNaN(confidence) || confidence < 0 || confidence > 1) {
        throw new Error(`Invalid confidence_score: ${item.confidence_score}. Must be a float between 0.0 and 1.0.`);
      }

      const strikesUsed = parseInt(item.strikes_used, 10) || (Array.isArray(item.strikes) ? item.strikes.length : 1);
      const testedAt = item.timestamp || now;
      const testId = uuidv4();

      // Ensure batch exists in vial_batches
      upsertBatchStmt.run(item.vial_batch_id, item.vaccine_name || 'Generic Vaccine', item.manufacturer || 'Unknown', testedAt, null);

      insertTestStmt.run(
        testId,
        device.id,
        item.worker_id || null,
        item.vial_batch_id,
        testedAt,
        now,
        verdict,
        confidence,
        strikesUsed,
        item.notes || null
      );

      // Insert per-strike acoustic features if provided
      if (Array.isArray(item.strikes)) {
        for (let i = 0; i < item.strikes.length; i++) {
          const s = item.strikes[i];
          const strikeNumber = s.strike_number || (i + 1);
          insertStrikeStmt.run(
            uuidv4(),
            testId,
            strikeNumber,
            s.peak_amplitude !== undefined ? parseFloat(s.peak_amplitude) : null,
            s.decay_time_constant !== undefined ? parseFloat(s.decay_time_constant) : null,
            s.dominant_frequency_hz !== undefined ? parseFloat(s.dominant_frequency_hz) : null
          );
        }
      }

      insertedIds.push(testId);
      lastEvaluatedBatchId = item.vial_batch_id;
    }
  });

  try {
    insertTransaction(testsToInsert);

    // Evaluate batch alert if applicable
    const batchAlert = lastEvaluatedBatchId ? evaluateBatchAlert(lastEvaluatedBatchId) : null;

    return res.status(201).json({
      success: true,
      message: `Successfully recorded ${insertedIds.length} test result(s).`,
      inserted_count: insertedIds.length,
      test_ids: insertedIds,
      batch_alert: batchAlert
    });
  } catch (err) {
    console.error('Test submission error:', err.message);
    return res.status(400).json({
      error: 'Test Submission Failed',
      message: err.message
    });
  }
});

/**
 * GET /api/v1/tests
 * List/filter tests
 */
router.get('/', optionalUserAuth, (req, res) => {
  const {
    clinic_id,
    device_id,
    vial_batch_id,
    classification_result,
    date_from,
    date_to,
    limit = 50,
    offset = 0
  } = req.query;

  let query = `
    SELECT 
      t.id,
      t.device_id,
      d.name as device_name,
      c.id as clinic_id,
      c.name as clinic_name,
      t.vial_batch_id,
      vb.vaccine_name,
      t.tested_at,
      t.received_at,
      t.classification_result,
      t.confidence_score,
      t.strikes_used,
      t.notes,
      u.full_name as worker_name
    FROM tests t
    JOIN devices d ON t.device_id = d.id
    LEFT JOIN clinics c ON d.clinic_id = c.id
    LEFT JOIN vial_batches vb ON t.vial_batch_id = vb.id
    LEFT JOIN users u ON t.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (clinic_id) {
    query += ' AND d.clinic_id = ?';
    params.push(clinic_id);
  }
  if (device_id) {
    query += ' AND t.device_id = ?';
    params.push(device_id);
  }
  if (vial_batch_id) {
    query += ' AND t.vial_batch_id LIKE ?';
    params.push(`%${vial_batch_id}%`);
  }
  if (classification_result) {
    query += ' AND t.classification_result = ?';
    params.push(classification_result.toUpperCase());
  }
  if (date_from) {
    query += ' AND t.tested_at >= ?';
    params.push(date_from);
  }
  if (date_to) {
    query += ' AND t.tested_at <= ?';
    params.push(date_to);
  }

  // Count total matching
  const countQuery = `SELECT COUNT(*) as total FROM (${query})`;
  const total = db.prepare(countQuery).get(...params).total;

  query += ' ORDER BY t.tested_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit, 10) || 50, parseInt(offset, 10) || 0);

  const tests = db.prepare(query).all(...params);

  res.json({
    total,
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
    tests
  });
});

/**
 * GET /api/v1/tests/:test_id
 * Detailed test view including acoustic strikes
 */
router.get('/:test_id', optionalUserAuth, (req, res) => {
  const { test_id } = req.params;

  const test = db.prepare(`
    SELECT 
      t.id,
      t.device_id,
      d.name as device_name,
      d.firmware_version,
      c.name as clinic_name,
      c.location as clinic_location,
      t.vial_batch_id,
      vb.vaccine_name,
      vb.manufacturer,
      t.tested_at,
      t.received_at,
      t.classification_result,
      t.confidence_score,
      t.strikes_used,
      t.notes,
      u.full_name as worker_name
    FROM tests t
    JOIN devices d ON t.device_id = d.id
    LEFT JOIN clinics c ON d.clinic_id = c.id
    LEFT JOIN vial_batches vb ON t.vial_batch_id = vb.id
    LEFT JOIN users u ON t.user_id = u.id
    WHERE t.id = ?
  `).get(test_id);

  if (!test) {
    return res.status(404).json({ error: 'Test record not found' });
  }

  const strikes = db.prepare(`
    SELECT strike_number, peak_amplitude, decay_time_constant, dominant_frequency_hz
    FROM strikes
    WHERE test_id = ?
    ORDER BY strike_number ASC
  `).all(test_id);

  const batchAlert = evaluateBatchAlert(test.vial_batch_id);

  res.json({
    ...test,
    strikes,
    batch_alert: batchAlert
  });
});

module.exports = router;
module.exports.evaluateBatchAlert = evaluateBatchAlert;
