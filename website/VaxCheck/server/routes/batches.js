const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { evaluateBatchAlert } = require('./tests');

/**
 * GET /api/v1/batches
 * List all batches with aggregate statistics and concerning flags
 */
router.get('/', (req, res) => {
  const query = `
    SELECT 
      vb.id,
      vb.vaccine_name,
      vb.manufacturer,
      vb.first_seen_at,
      vb.notes,
      COUNT(t.id) as total_tests,
      SUM(CASE WHEN t.classification_result = 'PASS' THEN 1 ELSE 0 END) as pass_count,
      SUM(CASE WHEN t.classification_result = 'FAIL' THEN 1 ELSE 0 END) as fail_count,
      SUM(CASE WHEN t.classification_result = 'INCONCLUSIVE' THEN 1 ELSE 0 END) as inconclusive_count,
      MIN(t.tested_at) as first_tested_at,
      MAX(t.tested_at) as last_tested_at
    FROM vial_batches vb
    LEFT JOIN tests t ON vb.id = t.vial_batch_id
    GROUP BY vb.id
    ORDER BY fail_count DESC, last_tested_at DESC
  `;

  const batches = db.prepare(query).all().map(b => {
    const total = b.total_tests || 0;
    const fails = b.fail_count || 0;
    const failRate = total > 0 ? Number(((fails / total) * 100).toFixed(1)) : 0;
    const isConcerning = fails >= 3 || (total >= 3 && failRate >= 30.0);

    return {
      ...b,
      fail_rate: failRate,
      is_concerning: isConcerning,
      alert_status: fails >= 3 ? 'CRITICAL_QUARANTINE' : (isConcerning ? 'WARNING_MONITOR' : 'NORMAL')
    };
  });

  res.json(batches);
});

/**
 * GET /api/v1/batches/:batch_id
 * Detailed view of a specific vaccine batch including all tests
 */
router.get('/:batch_id', (req, res) => {
  const { batch_id } = req.params;

  let batch = db.prepare(`
    SELECT 
      vb.id,
      vb.vaccine_name,
      vb.manufacturer,
      vb.first_seen_at,
      vb.notes,
      COUNT(t.id) as total_tests,
      SUM(CASE WHEN t.classification_result = 'PASS' THEN 1 ELSE 0 END) as pass_count,
      SUM(CASE WHEN t.classification_result = 'FAIL' THEN 1 ELSE 0 END) as fail_count,
      SUM(CASE WHEN t.classification_result = 'INCONCLUSIVE' THEN 1 ELSE 0 END) as inconclusive_count
    FROM vial_batches vb
    LEFT JOIN tests t ON vb.id = t.vial_batch_id
    WHERE vb.id = ?
    GROUP BY vb.id
  `).get(batch_id);

  if (!batch) {
    // If not explicitly in vial_batches table yet, check if tests exist
    const testCheck = db.prepare('SELECT COUNT(*) as count FROM tests WHERE vial_batch_id = ?').get(batch_id);
    if (testCheck.count === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    batch = {
      id: batch_id,
      vaccine_name: 'Unregistered Batch',
      manufacturer: 'Unknown',
      first_seen_at: new Date().toISOString(),
      notes: null,
      total_tests: testCheck.count,
      pass_count: 0,
      fail_count: 0,
      inconclusive_count: 0
    };
  }

  const tests = db.prepare(`
    SELECT 
      t.id,
      t.device_id,
      d.name as device_name,
      c.name as clinic_name,
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
    LEFT JOIN users u ON t.user_id = u.id
    WHERE t.vial_batch_id = ?
    ORDER BY t.tested_at DESC
  `).all(batch_id);

  const alert = evaluateBatchAlert(batch_id);

  const total = batch.total_tests || 0;
  const fails = batch.fail_count || 0;
  const failRate = total > 0 ? Number(((fails / total) * 100).toFixed(1)) : 0;

  res.json({
    ...batch,
    fail_rate: failRate,
    is_concerning: fails >= 3 || (total >= 3 && failRate >= 30.0),
    alert,
    tests
  });
});

module.exports = router;
