/**
 * models/Test.model.js
 *
 * Single acoustic vial test result submitted by an ESP32 device.
 * Each test may include an array of per-strike acoustic features
 * (peak amplitude, decay time constant, dominant frequency).
 */

import mongoose, { Schema } from 'mongoose';
import { TEST_VERDICTS } from '../constants.js';

/** Embedded sub-document for a single solenoid strike measurement */
const strikeSchema = new Schema(
  {
    strikeNumber:         { type: Number, required: true },
    peakAmplitude:        { type: Number, default: null },
    decayTimeConstant:    { type: Number, default: null },
    dominantFrequencyHz:  { type: Number, default: null },
    snrDb:                { type: Number, default: null },
    confidence:           { type: Number, default: null },
    ringEnergy:           { type: Number, default: null },
    onsetMs:              { type: Number, default: null },
    tauEnvR2:             { type: Number, default: null },
    pronyTauMs:           { type: Number, default: null },
    pronyR:               { type: Number, default: null },
    bandMidPct:           { type: Number, default: null },
    bandHighPct:          { type: Number, default: null },
    peakPctFs:            { type: Number, default: null },
    clipPct:              { type: Number, default: null },
    qualityFlags:         { type: [String], default: [] },
    wavPath:              { type: String, default: null },
  },
  { _id: false }
);

const testSchema = new Schema(
  {
    device: {
      type: Schema.Types.ObjectId,
      ref: 'Device',
      required: true,
    },
    /** Worker who initiated the test (nullable for hardware-triggered tests) */
    worker: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    /** Reference to the vial batch barcode string (not an ObjectId) */
    vialBatchId: {
      type: String,
      required: [true, 'vialBatchId is required'],
      index: true,
    },
    testedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    classificationResult: {
      type: String,
      enum: Object.values(TEST_VERDICTS),
      required: [true, 'classificationResult is required'],
    },
    confidenceScore: {
      type: Number,
      min: 0,
      max: 1,
      required: [true, 'confidenceScore is required'],
    },
    strikesUsed: {
      type: Number,
      default: 1,
    },
    /** Per-strike acoustic feature vectors from the TinyML analysis */
    strikes: [strikeSchema],
    notes: {
      type: String,
      default: '',
    },
    qualityGates: {
      passed: { type: Boolean, default: true },
      failures: { type: [String], default: [] },
    },
    connectionMode: {
      type: String,
      default: 'usb_serial',
    },
  },
  { timestamps: true }
);

export const Test = mongoose.model('Test', testSchema);
