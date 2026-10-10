/**
 * models/VialBatch.model.js
 *
 * Represents a labelled vaccine vial lot / batch barcode.
 * Created automatically the first time a vial from that batch is tested.
 */

import mongoose, { Schema } from 'mongoose';

const vialBatchSchema = new Schema(
  {
    /** Barcode / lot number scanned from the vial label */
    batchId: {
      type: String,
      required: [true, 'Batch ID is required'],
      unique: true,
      trim: true,
      index: true,
    },
    vaccineName: {
      type: String,
      trim: true,
      default: 'Generic Vaccine',
    },
    manufacturer: {
      type: String,
      trim: true,
      default: 'Unknown',
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

export const VialBatch = mongoose.model('VialBatch', vialBatchSchema);
