import { Router } from 'express';
import { getOverview } from '../controllers/stats.controller.js';

const router = Router();

router.get('/overview', getOverview);

export default router;
