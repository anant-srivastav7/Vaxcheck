/**
 * models/Clinic.model.js
 *
 * Represents a hospital / clinic that owns devices and workers.
 */

import mongoose, { Schema } from 'mongoose';

const clinicSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Clinic name is required'],
      trim: true,
    },
    location: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

export const Clinic = mongoose.model('Clinic', clinicSchema);
