const express = require('express');
const router = express.Router();
const { db } = require('../db');

/**
 * GET /api/v1/stats/overview
 * Platform-wide or clinic-specific statistics
 */
router.get('/overview', (req, res) => {
  const { clinic_id } = req.query;

  let baseTestWhere = 'WHERE 1=1';
  const params = [];

  if (clinic_id) {
    baseTestWhere += ' AND d.clinic_id = ?';
    params.push(clinic_id);
  }

  const testStats = db.prepare(`
    SELECT 
      COUNT(t.id) as total_tests,
      SUM(CASE WHEN t.classification_result = 'PASS' THEN 1 ELSE 0 END) as pass_count,
      SUM(CASE WHEN t.classification_result = 'FAIL' THEN 1 ELSE 0 END) as fail_count,
      SUM(CASE WHEN t.classification_result = 'INCONCLUSIVE' THEN 1 ELSE 0 END) as inconclusive_count,
      AVG(t.confidence_score) as avg_confidence
    FROM tests t
    JOIN devices d ON t.device_id = d.id
    ${baseTestWhere}
  `).get(...params);

  // Active online devices
  const now = Date.now();
  const devices = db.prepare(`
    SELECT id, name, last_seen_at, battery_level, is_active
    FROM devices
    ${clinic_id ? 'WHERE clinic_id = ?' : ''}
  `).all(...(clinic_id ? [clinic_id] : []));

  const onlineDevicesCount = devices.filter(d => {
    if (!d.last_seen_at || !d.is_active) return false;
    return (now - new Date(d.last_seen_at).getTime()) <= 60 * 1000;
  }).length;

  // Batch stats: count batches and concerning batches
  const batches = db.prepare(`
    SELECT 
      vb.id,
      COUNT(t.id) as total,
      SUM(CASE WHEN t.classification_result = 'FAIL' THEN 1 ELSE 0 END) as fails
    FROM vial_batches vb
    JOIN tests t ON vb.id = t.vial_batch_id
    GROUP BY vb.id
  `).all();

  const totalBatches = batches.length;
  const concerningBatches = batches.filter(b => b.fails >= 3 || (b.total >= 3 && (b.fails / b.total) >= 0.3)).length;

  const totalTests = testStats.total_tests || 0;
  const passCount = testStats.pass_count || 0;
  const failCount = testStats.fail_count || 0;
  const incCount = testStats.inconclusive_count || 0;
  const passRate = totalTests > 0 ? Number(((passCount / totalTests) * 100).toFixed(1)) : 0;
  const failRate = totalTests > 0 ? Number(((failCount / totalTests) * 100).toFixed(1)) : 0;

  res.json({
    total_tests: totalTests,
    pass_count: passCount,
    fail_count: failCount,
    inconclusive_count: incCount,
    pass_rate: passRate,
    fail_rate: failRate,
    avg_confidence: testStats.avg_confidence ? Number((testStats.avg_confidence * 100).toFixed(1)) : 0,
    total_devices: devices.length,
    online_devices: onlineDevicesCount,
    total_batches: totalBatches,
    concerning_batches: concerningBatches
  });
});

module.exports = router;
