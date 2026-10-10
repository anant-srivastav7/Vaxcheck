/**
 * models/DeviceCommand.model.js
 *
 * Queued command sent from the web app to an ESP32 device.
 * The ESP32 polls GET /devices/:id/pending_commands and ACKs via POST.
 */

import mongoose, { Schema } from 'mongoose';
import { COMMAND_TYPES, COMMAND_STATUSES } from '../constants.js';

const deviceCommandSchema = new Schema(
  {
    device: {
      type: Schema.Types.ObjectId,
      ref: 'Device',
      required: true,
      index: true,
    },
    commandType: {
      type: String,
      enum: Object.values(COMMAND_TYPES),
      required: true,
    },
    /** Arbitrary JSON payload — e.g. { vial_batch_id, worker_id } for START_TEST */
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: Object.values(COMMAND_STATUSES),
      default: COMMAND_STATUSES.PENDING,
      index: true,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export const DeviceCommand = mongoose.model('DeviceCommand', deviceCommandSchema);
