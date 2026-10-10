const { db } = require('../db');

// In-memory user token map for lightweight stateful worker sessions
const userSessions = new Map();

/**
 * Middleware: Verify ESP32 Hardware Device Token
 * Checks Authorization header (Bearer <token>) OR req.body.device_auth_token
 */
function requireDeviceAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.body && req.body.device_auth_token) {
    token = req.body.device_auth_token;
  } else if (req.headers['x-device-token']) {
    token = req.headers['x-device-token'];
  }

  if (!token) {
    return res.status(401).json({
      error: 'Device Authentication Required',
      message: 'Missing device authentication token. Supply via "Authorization: Bearer <token>" or "device_auth_token" body field.'
    });
  }

  const device = db.prepare('SELECT * FROM devices WHERE auth_token = ?').get(token);

  if (!device) {
    return res.status(401).json({
      error: 'Invalid Device Token',
      message: 'The provided device token does not match any registered hardware unit.'
    });
  }

  if (!device.is_active) {
    return res.status(403).json({
      error: 'Device Deactivated',
      message: 'This testing device has been deactivated by an administrator.'
    });
  }

  // If path or body specifies device_id, verify it matches the token's device
  const pathDeviceId = req.params.device_id;
  const bodyDeviceId = req.body && req.body.device_id;
  const expectedId = pathDeviceId || bodyDeviceId;

  if (expectedId && expectedId !== device.id) {
    return res.status(403).json({
      error: 'Device Identity Mismatch',
      message: `Token belongs to device "${device.id}" but request targeted "${expectedId}".`
    });
  }

  // Update device last_seen_at
  db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), device.id);

  req.device = device;
  next();
}

/**
 * Register a user session token upon login
 */
function createSession(user) {
  const token = 'vax_usr_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  userSessions.set(token, {
    userId: user.id,
    username: user.username,
    role: user.role,
    clinic_id: user.clinic_id,
    createdAt: Date.now()
  });
  return token;
}

function destroySession(token) {
  userSessions.delete(token);
}

/**
 * Middleware: Verify Health Worker / Admin User Session
 */
function requireUserAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  // For low-friction tablet mode, also allow session token in x-auth-token header
  if (!token && req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'];
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const session = userSessions.get(token);
  if (!session) {
    // If not found in memory (e.g. server restart), check if token format matches or find by ID
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }

  const user = db.prepare('SELECT id, username, full_name, role, clinic_id, is_active FROM users WHERE id = ?').get(session.userId);
  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'User account not active.' });
  }

  req.user = user;
  next();
}

/**
 * Optional User Auth: attaches user if token present, but doesn't block
 */
function optionalUserAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (authHeader) {
    token = authHeader;
  }

  if (token && userSessions.has(token)) {
    const session = userSessions.get(token);
    req.user = db.prepare('SELECT id, username, full_name, role, clinic_id FROM users WHERE id = ?').get(session.userId);
  }
  next();
}

module.exports = {
  requireDeviceAuth,
  requireUserAuth,
  optionalUserAuth,
  createSession,
  destroySession,
};
