import { Router } from 'express';
import { submitTests, listTests, getTest } from '../controllers/test.controller.js';
import { verifyDeviceToken, optionalJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// ESP32 submits results
router.post('/', verifyDeviceToken, submitTests);

// Web / admin reads
router.get('/', optionalJWT, listTests);
router.get('/:test_id', optionalJWT, getTest);

export default router;
