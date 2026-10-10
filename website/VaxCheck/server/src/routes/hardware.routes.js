import { Router } from 'express';
import {
  getHardwareStatus,
  connectHardware,
  disconnectHardware,
  triggerStrike,
  analyzeWav,
} from '../controllers/hardware.controller.js';
import { optionalJWT } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/status', getHardwareStatus);
router.post('/connect', optionalJWT, connectHardware);
router.post('/disconnect', optionalJWT, disconnectHardware);
router.post('/strike', optionalJWT, triggerStrike);
router.post('/analyze-wav', optionalJWT, analyzeWav);

export default router;
