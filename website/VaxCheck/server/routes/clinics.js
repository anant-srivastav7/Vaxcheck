const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');

/**
 * GET /api/v1/clinics
 * List clinics with device count and test count
 */
router.get('/', (req, res) => {
  const clinics = db.prepare(`
    SELECT 
      c.id,
      c.name,
      c.location,
      c.created_at,
      COUNT(DISTINCT d.id) as device_count,
      COUNT(DISTINCT t.id) as total_tests
    FROM clinics c
    LEFT JOIN devices d ON c.id = d.clinic_id AND d.is_active = 1
    LEFT JOIN tests t ON d.id = t.device_id
    GROUP BY c.id
    ORDER BY c.name ASC
  `).all();

  res.json(clinics);
});

/**
 * POST /api/v1/clinics
 * Create clinic
 */
router.post('/', (req, res) => {
  const { name, location } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Clinic name is required' });
  }

  const id = 'clinic-' + uuidv4().substring(0, 8);
  const now = new Date().toISOString();

  db.prepare('INSERT INTO clinics (id, name, location, created_at) VALUES (?, ?, ?, ?)').run(id, name, location || null, now);

  res.status(201).json({ id, name, location, created_at: now });
});

module.exports = router;
