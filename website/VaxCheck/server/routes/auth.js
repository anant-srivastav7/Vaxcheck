const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { createSession, destroySession, requireUserAuth } = require('../middleware/auth');

/**
 * POST /api/v1/auth/login
 * Health worker / admin login
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.prepare(`
    SELECT u.id, u.username, u.password_hash, u.full_name, u.role, u.clinic_id, u.is_active, c.name as clinic_name
    FROM users u
    LEFT JOIN clinics c ON u.clinic_id = c.id
    WHERE u.username = ?
  `).get(username.trim());

  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = createSession(user);

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      clinic_id: user.clinic_id,
      clinic_name: user.clinic_name
    }
  });
});

/**
 * GET /api/v1/auth/me
 * Current user profile
 */
router.get('/me', requireUserAuth, (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.role, u.clinic_id, c.name as clinic_name
    FROM users u
    LEFT JOIN clinics c ON u.clinic_id = c.id
    WHERE u.id = ?
  `).get(req.user.id);

  res.json(user);
});

/**
 * POST /api/v1/auth/logout
 */
router.post('/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    destroySession(authHeader.slice(7).trim());
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * GET /api/v1/auth/workers
 * List workers for assignment or display
 */
router.get('/workers', (req, res) => {
  const workers = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.role, u.clinic_id, c.name as clinic_name, u.is_active
    FROM users u
    LEFT JOIN clinics c ON u.clinic_id = c.id
    ORDER BY u.full_name ASC
  `).all();

  res.json(workers);
});

/**
 * POST /api/v1/auth/users
 * Admin creates new worker
 */
router.post('/users', (req, res) => {
  const { username, password, full_name, role = 'worker', clinic_id } = req.body;

  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'Username, password, and full_name are required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const userId = 'usr-' + uuidv4().substring(0, 8);

  db.prepare(`
    INSERT INTO users (id, username, password_hash, full_name, role, clinic_id, created_at, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(userId, username, passwordHash, full_name, role, clinic_id || null, new Date().toISOString());

  res.status(201).json({
    success: true,
    user: { id: userId, username, full_name, role, clinic_id }
  });
});

module.exports = router;
