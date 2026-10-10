import { Router } from 'express';
import { listBatches, getBatch } from '../controllers/batch.controller.js';

const router = Router();

router.get('/', listBatches);
router.get('/:batch_id', getBatch);

export default router;
