import { Router } from 'express';
import { listClinics, getClinic, createClinic } from '../controllers/clinic.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', listClinics);
router.get('/:clinic_id', getClinic);
router.post('/', verifyJWT, createClinic);

export default router;
