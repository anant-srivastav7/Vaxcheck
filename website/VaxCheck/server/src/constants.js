/**
 * constants.js
 * Application-wide constants and enumerations.
 */

export const DB_NAME = 'vaxcheck';

export const USER_ROLES = Object.freeze({
  ADMIN: 'admin',
  WORKER: 'worker',
});

export const TEST_VERDICTS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  INCONCLUSIVE: 'INCONCLUSIVE',
});

export const COMMAND_TYPES = Object.freeze({
  START_TEST: 'START_TEST',
  CALIBRATE: 'CALIBRATE',
  REBOOT: 'REBOOT',
});

export const COMMAND_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

/** A batch is "concerning" when fail_count >= this OR fail_rate >= BATCH_FAIL_RATE_THRESHOLD */
export const BATCH_FAIL_COUNT_THRESHOLD = 3;
export const BATCH_FAIL_RATE_THRESHOLD = 0.30;

/** Device is considered online if last heartbeat was within this many ms */
export const DEVICE_ONLINE_THRESHOLD_MS = 60_000;

/** Python sidecar URL for real ESP32 hardware integration */
export const PYTHON_SIDECAR_URL = process.env.PYTHON_SIDECAR_URL || 'http://localhost:5001';
