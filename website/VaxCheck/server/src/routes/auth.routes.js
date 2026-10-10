import { Router } from 'express';
import {
  login,
  logout,
  getMe,
  listWorkers,
  createUser,
  registerAdmin,
  googleAuth,
  listAdmins,
  registerWorker,
  getPendingWorkers,
  approveWorker,
  rejectWorker,
} from '../controllers/auth.controller.js';
import { verifyJWT, requireAdmin } from '../middlewares/auth.middleware.js';

const router = Router();

// Public routes
router.post('/login', login);
router.post('/logout', logout);
router.post('/register-admin', registerAdmin);
router.post('/register-worker', registerWorker);
router.post('/google', googleAuth);
router.get('/admins', listAdmins);

// Authenticated routes
router.get('/me', verifyJWT, getMe);
router.get('/workers', verifyJWT, listWorkers);
router.post('/users', verifyJWT, createUser);

// Admin-only: Worker approval flow
router.get('/pending-workers', verifyJWT, requireAdmin, getPendingWorkers);
router.post('/workers/:id/approve', verifyJWT, requireAdmin, approveWorker);
router.post('/workers/:id/reject', verifyJWT, requireAdmin, rejectWorker);

export default router;
