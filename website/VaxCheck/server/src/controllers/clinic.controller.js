/**
 * controllers/clinic.controller.js
 *
 * Handles: list clinics, get single clinic.
 */

import { Clinic } from '../models/Clinic.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/v1/clinics
 */
const listClinics = asyncHandler(async (_req, res) => {
  const clinics = await Clinic.find().sort({ name: 1 });
  return res.status(200).json(new ApiResponse(200, clinics));
});

/**
 * GET /api/v1/clinics/:clinic_id
 */
const getClinic = asyncHandler(async (req, res) => {
  const clinic = await Clinic.findById(req.params.clinic_id);
  if (!clinic) throw new ApiError(404, 'Clinic not found');
  return res.status(200).json(new ApiResponse(200, clinic));
});

/**
 * POST /api/v1/clinics
 */
const createClinic = asyncHandler(async (req, res) => {
  const { name, location } = req.body;
  if (!name) throw new ApiError(400, 'Clinic name is required');

  const clinic = await Clinic.create({ name, location });
  return res.status(201).json(new ApiResponse(201, clinic, 'Clinic created'));
});

export { listClinics, getClinic, createClinic };
