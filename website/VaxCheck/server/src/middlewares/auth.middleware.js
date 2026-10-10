/**
 * middlewares/auth.middleware.js
 *
 * Two authentication strategies:
 *
 *  1. verifyJWT          — for human users (Admin / Worker) via Bearer token
 *  2. verifyDeviceToken  — for ESP32 hardware via x-device-token header
 *  3. optionalJWT        — attaches user if token present, never blocks
 */

import jwt from 'jsonwebtoken';
import { User } from '../models/User.model.js';
import { Device } from '../models/Device.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** Middleware: require a valid JWT — used on protected user routes */
const verifyJWT = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError(401, 'Unauthorized — no token provided');
  }

  const token = authHeader.slice(7).trim();

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new ApiError(401, 'Unauthorized — invalid or expired token');
  }

  const user = await User.findById(decoded._id).select('-passwordHash');

  if (!user || !user.isActive) {
    throw new ApiError(401, 'Unauthorized — account not found or deactivated');
  }

  req.user = user;
  next();
});

/** Middleware: require a valid ESP32 device auth token */
const verifyDeviceToken = asyncHandler(async (req, _res, next) => {
  const token =
    req.headers['x-device-token'] ||
    req.headers['authorization']?.replace('Bearer ', '').trim();

  if (!token) {
    throw new ApiError(401, 'Device authentication required — provide x-device-token header');
  }

  const device = await Device.findOne({ authToken: token, isActive: true }).populate('clinic');

  if (!device) {
    throw new ApiError(401, 'Invalid or revoked device token');
  }

  req.device = device;
  next();
});

/** Middleware: attach user if a valid JWT is present, but don't block if absent */
const optionalJWT = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7).trim();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded._id).select('-passwordHash');
    if (user && user.isActive) req.user = user;
  } catch {
    // silently ignore invalid tokens on optional routes
  }

  next();
});

/** Middleware: require admin role (must be used after verifyJWT) */
const requireAdmin = (req, _res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    throw new ApiError(403, 'Forbidden — administrator access required');
  }
  next();
};

export { verifyJWT, verifyDeviceToken, optionalJWT, requireAdmin };
