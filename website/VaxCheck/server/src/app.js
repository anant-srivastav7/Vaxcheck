/**
 * app.js
 *
 * Express application setup.
 * This file only configures middleware and mounts routes.
 * The actual server listen() call lives in index.js after the DB connects.
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

// Routes
import authRouter    from './routes/auth.routes.js';
import clinicRouter  from './routes/clinic.routes.js';
import deviceRouter  from './routes/device.routes.js';
import testRouter    from './routes/test.routes.js';
import batchRouter   from './routes/batch.routes.js';
import statsRouter   from './routes/stats.routes.js';
import hardwareRouter from './routes/hardware.routes.js';

// Error handler
import { errorHandler } from './middlewares/error.middleware.js';

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-device-token',
    ],
  })
);

// ── Body Parsers ──────────────────────────────────────────────────────────────
// 10 MB limit for batched offline submissions from remote clinics
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Cookie Parser ─────────────────────────────────────────────────────────────
app.use(cookieParser());

import mongoose from 'mongoose';

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    system: 'VaxCheck Vaccine Acoustic Analysis Engine',
    version: '2.0.0',
    dbState: mongoose.connection.readyState === 1 ? 'connected' : 'connecting',
    timestamp: new Date().toISOString(),
  });
});

// ── Database Readiness Guard ──────────────────────────────────────────────────
app.use('/api/v1', (req, res, next) => {
  // Allow device discovery and remote test triggers to proceed gracefully
  if (req.path.startsWith('/devices') || req.path.startsWith('/hardware')) {
    return next();
  }
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      statusCode: 503,
      success: false,
      message:
        'MongoDB Atlas connection pending. Please ensure your IP address is whitelisted (or allow 0.0.0.0/0) in MongoDB Atlas Network Access.',
    });
  }
  next();
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',    authRouter);
app.use('/api/v1/clinics', clinicRouter);
app.use('/api/v1/devices', deviceRouter);
app.use('/api/v1/tests',   testRouter);
app.use('/api/v1/batches', batchRouter);
app.use('/api/v1/stats',   statsRouter);
app.use('/api/v1/hardware', hardwareRouter);

// ── 404 for unknown API routes ────────────────────────────────────────────────
app.use('/api/*', (_req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found' });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use(errorHandler);

export { app };
