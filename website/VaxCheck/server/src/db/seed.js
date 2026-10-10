/**
 * src/db/seed.js
 *
 * One-shot seed script — populates the MongoDB database with:
 *   - 1 clinic
 *   - 1 admin user  (admin / vaxcheck2026)
 *   - 2 worker users (nurse_sarah, tech_alex / vaxcheck2026)
 *   - 2 ESP32 devices
 *   - Sample vial batches and test results
 *
 * Run once: npm run seed
 * Safe to re-run — skips existing records.
 */

import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env', import.meta.url) });

import mongoose from 'mongoose';
import { connectDB } from './index.js';
import { Clinic } from '../models/Clinic.model.js';
import { User } from '../models/User.model.js';
import { Device } from '../models/Device.model.js';
import { VialBatch } from '../models/VialBatch.model.js';
import { Test } from '../models/Test.model.js';
import crypto from 'crypto';

async function seed() {
  await connectDB();
  console.log('\n🌱 Starting seed...\n');

  // ── Clinic ──────────────────────────────────────────────────────────────────
  let clinic = await Clinic.findOne({ name: 'St. Jude Health Center' });
  if (!clinic) {
    clinic = await Clinic.create({
      name: 'St. Jude Health Center',
      location: 'Nairobi, Kenya',
    });
    console.log('✅ Created clinic:', clinic.name);
  } else {
    console.log('⏭️  Clinic already exists');
  }

  // ── Admin User ───────────────────────────────────────────────────────────────
  let admin = await User.findOne({ username: 'admin' });
  if (!admin) {
    admin = await User.create({
      username: 'admin',
      passwordHash: 'vaxcheck2026',
      fullName: 'System Administrator',
      role: 'admin',
      clinic: clinic._id,
    });
    console.log('✅ Created admin user: admin / vaxcheck2026');
  } else {
    console.log('⏭️  Admin user already exists');
  }

  // ── Worker Users ─────────────────────────────────────────────────────────────
  const workers = [
    { username: 'nurse_sarah', fullName: 'Sarah Kimani', role: 'worker' },
    { username: 'tech_alex',   fullName: 'Alex Omondi',  role: 'worker' },
  ];

  const workerDocs = [];
  for (const w of workers) {
    let user = await User.findOne({ username: w.username });
    if (!user) {
      user = await User.create({
        username: w.username,
        passwordHash: 'vaxcheck2026',
        fullName: w.fullName,
        role: w.role,
        clinic: clinic._id,
      });
      console.log(`✅ Created worker: ${w.username} / vaxcheck2026`);
    } else {
      console.log(`⏭️  Worker ${w.username} already exists`);
    }
    workerDocs.push(user);
  }

  // ── Devices ──────────────────────────────────────────────────────────────────
  const deviceDefs = [
    { name: 'ESP32-Unit-01', token: 'vax_tok_' + crypto.randomBytes(20).toString('hex') },
    { name: 'ESP32-Unit-02', token: 'vax_tok_' + crypto.randomBytes(20).toString('hex') },
  ];

  const deviceDocs = [];
  for (const d of deviceDefs) {
    let device = await Device.findOne({ name: d.name });
    if (!device) {
      device = await Device.create({
        name: d.name,
        clinic: clinic._id,
        authToken: d.token,
        firmwareVersion: 'v1.0.0-tinyML',
        lastSeenAt: new Date(),
        batteryLevel: 0.85,
      });
      console.log(`✅ Created device: ${d.name} (token: ${device.authToken})`);
    } else {
      console.log(`⏭️  Device ${d.name} already exists`);
    }
    deviceDocs.push(device);
  }

  // ── Vial Batches ─────────────────────────────────────────────────────────────
  const batchDefs = [
    { batchId: 'BCG-LOT-2024-A', vaccineName: 'BCG Vaccine', manufacturer: 'Serum Institute' },
    { batchId: 'OPV-LOT-2024-B', vaccineName: 'Oral Polio Vaccine', manufacturer: 'Bharat Biotech' },
    { batchId: 'MMR-LOT-2024-C', vaccineName: 'MMR Vaccine', manufacturer: 'Merck' },
  ];

  const batchDocs = [];
  for (const b of batchDefs) {
    let batch = await VialBatch.findOne({ batchId: b.batchId });
    if (!batch) {
      batch = await VialBatch.create(b);
      console.log(`✅ Created batch: ${b.batchId}`);
    } else {
      console.log(`⏭️  Batch ${b.batchId} already exists`);
    }
    batchDocs.push(batch);
  }

  // ── Sample Tests ─────────────────────────────────────────────────────────────
  const existingTestCount = await Test.countDocuments();
  if (existingTestCount === 0) {
    const results = ['PASS', 'PASS', 'PASS', 'FAIL', 'PASS', 'FAIL', 'PASS', 'INCONCLUSIVE', 'FAIL', 'PASS'];
    const device = deviceDocs[0];
    const worker = workerDocs[0];
    const batch = batchDocs[0];

    for (let i = 0; i < results.length; i++) {
      const verdict = results[i];
      const confidence = verdict === 'PASS'
        ? 0.85 + Math.random() * 0.1
        : verdict === 'FAIL'
        ? 0.72 + Math.random() * 0.1
        : 0.55 + Math.random() * 0.1;

      await Test.create({
        device: device._id,
        worker: worker._id,
        vialBatchId: batch.batchId,
        testedAt: new Date(Date.now() - (results.length - i) * 1000 * 60 * 10),
        classificationResult: verdict,
        confidenceScore: Number(confidence.toFixed(4)),
        strikesUsed: 3,
        strikes: [
          { strikeNumber: 1, peakAmplitude: 0.65, decayTimeConstant: 0.012, dominantFrequencyHz: 1240 },
          { strikeNumber: 2, peakAmplitude: 0.61, decayTimeConstant: 0.011, dominantFrequencyHz: 1235 },
          { strikeNumber: 3, peakAmplitude: 0.63, decayTimeConstant: 0.013, dominantFrequencyHz: 1242 },
        ],
        notes: '',
      });
    }

    console.log(`✅ Created ${results.length} sample test results`);
  } else {
    console.log(`⏭️  Tests already exist (${existingTestCount} records)`);
  }

  console.log('\n✨ Seed complete!\n');
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
