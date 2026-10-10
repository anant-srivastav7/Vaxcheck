import { Router } from 'express';
import {
  listDevices, registerDevice, getDeviceStatus,
  startTest, getPendingCommands, ackCommand, heartbeat,
} from '../controllers/device.controller.js';
import { verifyDeviceToken, optionalJWT } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', optionalJWT, listDevices);
router.post('/', registerDevice);

router.get('/:device_id/status', getDeviceStatus);
router.post('/:device_id/start_test', startTest);

// ESP32-authenticated routes
router.get('/:device_id/pending_commands', verifyDeviceToken, getPendingCommands);
router.post('/:device_id/commands/:command_id/ack', verifyDeviceToken, ackCommand);
router.post('/:device_id/heartbeat', verifyDeviceToken, heartbeat);

export default router;
