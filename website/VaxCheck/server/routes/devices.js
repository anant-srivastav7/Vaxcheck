const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { requireDeviceAuth, optionalUserAuth } = require('../middleware/auth');

/**
 * Helper to determine if a device is online based on last_seen_at
 * Threshold: 60 seconds
 */
function isDeviceOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  const lastSeen = new Date(lastSeenAt).getTime();
  const now = Date.now();
  return (now - lastSeen) <= 60 * 1000;
}

/**
 * GET /api/v1/devices
 * List registered devices
 */
router.get('/', optionalUserAuth, (req, res) => {
  const { clinic_id } = req.query;

  let query = `
    SELECT 
      d.id,
      d.name,
      d.clinic_id,
      c.name as clinic_name,
      d.is_active,
      d.registered_at,
      d.last_seen_at,
      d.battery_level,
      d.firmware_version,
      d.auth_token,
      (SELECT COUNT(*) FROM tests WHERE device_id = d.id) as total_tests_run
    FROM devices d
    LEFT JOIN clinics c ON d.clinic_id = c.id
    WHERE 1=1
  `;

  const params = [];

  if (clinic_id) {
    query += ' AND d.clinic_id = ?';
    params.push(clinic_id);
  }

  query += ' ORDER BY d.registered_at DESC';

  const devices = db.prepare(query).all(...params).map(dev => ({
    ...dev,
    is_online: isDeviceOnline(dev.last_seen_at)
  }));

  res.json(devices);
});

/**
 * POST /api/v1/devices
 * Admin registers a new device and generates its permanent API token
 */
router.post('/', (req, res) => {
  const { name, clinic_id, firmware_version } = req.body;

  if (!name || !clinic_id) {
    return res.status(400).json({ error: 'Device name and clinic_id are required' });
  }

  // Check clinic exists
  const clinic = db.prepare('SELECT id, name FROM clinics WHERE id = ?').get(clinic_id);
  if (!clinic) {
    return res.status(404).json({ error: 'Clinic not found' });
  }

  const deviceId = 'dev-' + Math.random().toString(36).substring(2, 6) + '-' + Date.now().toString(36).substring(4);
  const authToken = 'vax_tok_' + uuidv4().replace(/-/g, '');
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO devices (id, name, clinic_id, auth_token, is_active, registered_at, last_seen_at, battery_level, firmware_version)
    VALUES (?, ?, ?, ?, 1, ?, NULL, 1.0, ?)
  `).run(deviceId, name, clinic_id, authToken, now, firmware_version || 'v1.0.0-tinyML');

  res.status(201).json({
    success: true,
    message: 'Device registered successfully. Flash this authentication token to the ESP32 firmware.',
    device: {
      id: deviceId,
      name,
      clinic_id,
      clinic_name: clinic.name,
      auth_token: authToken,
      registered_at: now,
      firmware_version: firmware_version || 'v1.0.0-tinyML'
    }
  });
});

/**
 * GET /api/v1/devices/:device_id/status
 * Get status and battery for a single device
 */
router.get('/:device_id/status', (req, res) => {
  const { device_id } = req.params;

  const device = db.prepare(`
    SELECT 
      d.id,
      d.name,
      d.clinic_id,
      c.name as clinic_name,
      d.is_active,
      d.registered_at,
      d.last_seen_at,
      d.battery_level,
      d.firmware_version,
      (SELECT COUNT(*) FROM tests WHERE device_id = d.id) as total_tests_run,
      (SELECT tested_at FROM tests WHERE device_id = d.id ORDER BY tested_at DESC LIMIT 1) as last_test_at
    FROM devices d
    LEFT JOIN clinics c ON d.clinic_id = c.id
    WHERE d.id = ?
  `).get(device_id);

  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  res.json({
    ...device,
    is_online: isDeviceOnline(device.last_seen_at)
  });
});

/**
 * POST /api/v1/devices/:device_id/start_test
 * Web application triggers a remote test on an online device.
 * Enqueues a START_TEST command for the ESP32 to poll.
 */
router.post('/:device_id/start_test', (req, res) => {
  const { device_id } = req.params;
  const { vial_batch_id, worker_id } = req.body;

  if (!vial_batch_id) {
    return res.status(400).json({ error: 'vial_batch_id is required to start a test' });
  }

  const device = db.prepare('SELECT id, name, last_seen_at, is_active FROM devices WHERE id = ?').get(device_id);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  const isOnline = isDeviceOnline(device.last_seen_at);
  const commandId = 'cmd-' + uuidv4().substring(0, 8);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO device_commands (id, device_id, command_type, payload, created_at, status)
    VALUES (?, ?, 'START_TEST', ?, ?, 'PENDING')
  `).run(commandId, device_id, JSON.stringify({ vial_batch_id, worker_id: worker_id || null }), now);

  res.json({
    success: true,
    message: 'Test command sent to device queue.',
    command_id: commandId,
    device_id,
    device_name: device.name,
    is_device_online: isOnline,
    status: 'PENDING',
    poll_instructions: `ESP32 will pick up this command within its poll interval (typically ~3-5s).`
  });
});

/**
 * GET /api/v1/devices/:device_id/pending_commands
 * Polled by ESP32 to receive remote instructions (e.g. START_TEST)
 */
router.get('/:device_id/pending_commands', requireDeviceAuth, (req, res) => {
  const { device_id } = req.params;

  // Retrieve pending commands for this device
  const commands = db.prepare(`
    SELECT id, device_id, command_type, payload, created_at, status
    FROM device_commands
    WHERE device_id = ? AND status = 'PENDING'
    ORDER BY created_at ASC
  `).all(device_id);

  // Parse JSON payloads
  const formatted = commands.map(cmd => {
    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(cmd.payload || '{}');
    } catch {
      parsedPayload = {};
    }
    return {
      ...cmd,
      payload: parsedPayload
    };
  });

  res.json({ commands: formatted });
});

/**
 * POST /api/v1/devices/:device_id/commands/:command_id/ack
 * ESP32 acknowledges execution of a command
 */
router.post('/:device_id/commands/:command_id/ack', requireDeviceAuth, (req, res) => {
  const { command_id } = req.params;
  const { status = 'COMPLETED' } = req.body;

  const validStatuses = ['ACKNOWLEDGED', 'COMPLETED', 'FAILED'];
  const updateStatus = validStatuses.includes(status) ? status : 'COMPLETED';

  db.prepare(`
    UPDATE device_commands 
    SET status = ?, acknowledged_at = ?
    WHERE id = ?
  `).run(updateStatus, new Date().toISOString(), command_id);

  res.json({ success: true, command_id, status: updateStatus });
});

/**
 * POST /api/v1/devices/:device_id/heartbeat
 * ESP32 check-in reporting battery level and telemetry
 */
router.post('/:device_id/heartbeat', requireDeviceAuth, (req, res) => {
  const { device_id } = req.params;
  const { battery_level, firmware_version } = req.body;

  const updates = [];
  const params = [];

  updates.push('last_seen_at = ?');
  params.push(new Date().toISOString());

  if (battery_level !== undefined && battery_level !== null) {
    updates.push('battery_level = ?');
    params.push(parseFloat(battery_level));
  }

  if (firmware_version) {
    updates.push('firmware_version = ?');
    params.push(firmware_version);
  }

  params.push(device_id);

  db.prepare(`UPDATE devices SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  res.json({ success: true, timestamp: new Date().toISOString() });
});

module.exports = router;
