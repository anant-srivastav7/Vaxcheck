/**
 * models/Device.model.js
 *
 * Represents a physical ESP32 acoustic testing unit.
 * Each device has a unique cryptographic auth token that it uses to
 * authenticate API calls (heartbeats, test submissions, command polls).
 */

import mongoose, { Schema } from 'mongoose';
import { DEVICE_ONLINE_THRESHOLD_MS } from '../constants.js';

const deviceSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Device name is required'],
      trim: true,
    },
    clinic: {
      type: Schema.Types.ObjectId,
      ref: 'Clinic',
      required: [true, 'Clinic is required'],
    },
    /** Cryptographic bearer token flashed to the ESP32 firmware */
    authToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastSeenAt: {
      type: Date,
      default: null,
    },
    batteryLevel: {
      type: Number,
      min: 0,
      max: 1,
      default: 1.0,
    },
    firmwareVersion: {
      type: String,
      default: 'v1.0.0-tinyML',
    },
  },
  { timestamps: true }
);

/** Virtual: whether the device has sent a heartbeat within the threshold */
deviceSchema.virtual('isOnline').get(function () {
  if (!this.lastSeenAt) return false;
  return Date.now() - new Date(this.lastSeenAt).getTime() <= DEVICE_ONLINE_THRESHOLD_MS;
});

deviceSchema.set('toJSON', { virtuals: true });
deviceSchema.set('toObject', { virtuals: true });

export const Device = mongoose.model('Device', deviceSchema);
