const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, 'vaxcheck.db');
const db = new Database(dbPath);

// Enable WAL mode for high concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clinics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      clinic_id TEXT REFERENCES clinics(id),
      auth_token TEXT NOT NULL UNIQUE,
      is_active INTEGER DEFAULT 1,
      registered_at TEXT NOT NULL,
      last_seen_at TEXT,
      battery_level REAL,
      firmware_version TEXT DEFAULT 'v1.0.0-tinyML'
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('worker', 'admin')),
      clinic_id TEXT REFERENCES clinics(id),
      created_at TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS vial_batches (
      id TEXT PRIMARY KEY,
      vaccine_name TEXT,
      manufacturer TEXT,
      first_seen_at TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS tests (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(id),
      user_id TEXT REFERENCES users(id),
      vial_batch_id TEXT NOT NULL,
      tested_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      classification_result TEXT NOT NULL CHECK(classification_result IN ('PASS', 'FAIL', 'INCONCLUSIVE')),
      confidence_score REAL NOT NULL,
      strikes_used INTEGER NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS strikes (
      id TEXT PRIMARY KEY,
      test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      strike_number INTEGER NOT NULL,
      peak_amplitude REAL,
      decay_time_constant REAL,
      dominant_frequency_hz REAL,
      UNIQUE(test_id, strike_number)
    );

    CREATE TABLE IF NOT EXISTS device_commands (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(id),
      command_type TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL,
      acknowledged_at TEXT,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'ACKNOWLEDGED', 'COMPLETED', 'EXPIRED'))
    );
  `);

  seedInitialData();
}

function seedInitialData() {
  const clinicCount = db.prepare('SELECT COUNT(*) as count FROM clinics').get().count;
  if (clinicCount > 0) return;

  console.log('Seeding initial VaxCheck database with clinics, users, devices, and realistic historical tests...');

  // Seed Clinics
  const clinic1Id = 'clinic-st-jude';
  const clinic2Id = 'clinic-eastside';
  const clinic3Id = 'clinic-mobile';

  const insertClinic = db.prepare('INSERT INTO clinics (id, name, location, created_at) VALUES (?, ?, ?, ?)');
  insertClinic.run(clinic1Id, 'St. Jude Community Health Center', 'Central District, Bldg A', new Date().toISOString());
  insertClinic.run(clinic2Id, 'Eastside Primary Care Clinic', 'Eastside District, Suite 204', new Date().toISOString());
  insertClinic.run(clinic3Id, 'Regional Mobile Outreach Unit #3', 'Mobile Services Depot', new Date().toISOString());

  // Seed Users
  const passwordHash = bcrypt.hashSync('vaxcheck2026', 10);
  const insertUser = db.prepare('INSERT INTO users (id, username, password_hash, full_name, role, clinic_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  
  const adminId = 'usr-admin-01';
  const worker1Id = 'usr-worker-01';
  const worker2Id = 'usr-worker-02';

  insertUser.run(adminId, 'admin', passwordHash, 'Dr. Elena Vance (Lead Admin)', 'admin', clinic1Id, new Date().toISOString());
  insertUser.run(worker1Id, 'nurse_sarah', passwordHash, 'Nurse Sarah Jenkins, RN', 'worker', clinic1Id, new Date().toISOString());
  insertUser.run(worker2Id, 'tech_mark', passwordHash, 'Mark Torres (Field Tech)', 'worker', clinic3Id, new Date().toISOString());

  // Seed Devices
  const dev1Id = 'dev-vax-001';
  const dev2Id = 'dev-vax-002';
  const dev3Id = 'dev-vax-003';

  const insertDevice = db.prepare(`
    INSERT INTO devices (id, name, clinic_id, auth_token, is_active, registered_at, last_seen_at, battery_level, firmware_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date();
  const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const justNow = new Date(now.getTime() - 15 * 1000).toISOString();

  insertDevice.run(dev1Id, 'ESP32 Solenoid Unit #1 (Clinic Desk)', clinic1Id, 'vax_tok_demo_solenoid_unit_01', 1, new Date().toISOString(), justNow, 0.94, 'v1.1.2-tinyML');
  insertDevice.run(dev2Id, 'ESP32 Solenoid Unit #2 (Cold Chain Storage)', clinic1Id, 'vax_tok_cold_chain_unit_02', 1, new Date().toISOString(), justNow, 0.82, 'v1.1.2-tinyML');
  insertDevice.run(dev3Id, 'ESP32 Mobile Field Unit #3', clinic3Id, 'vax_tok_mobile_unit_03', 1, new Date().toISOString(), tenMinsAgo, 0.65, 'v1.0.8-tinyML');

  // Seed Batches
  const insertBatch = db.prepare('INSERT INTO vial_batches (id, vaccine_name, manufacturer, first_seen_at, notes) VALUES (?, ?, ?, ?, ?)');
  insertBatch.run('MOD-2024-B882', 'Spikevax Bivalent (mRNA)', 'Moderna Biotech', new Date(now.getTime() - 48 * 3600 * 1000).toISOString(), 'Lot received via cold transport chain');
  insertBatch.run('PFI-2024-X419', 'Comirnaty (mRNA 30mcg)', 'Pfizer-BioNTech', new Date(now.getTime() - 72 * 3600 * 1000).toISOString(), 'Reported possible refrigerator door ajar incident on Oct 6');
  insertBatch.run('VAR-2024-V09', 'Varivax (Live Attenuated)', 'Merck & Co.', new Date(now.getTime() - 24 * 3600 * 1000).toISOString(), 'Standard pediatric inventory');
  insertBatch.run('FLU-2024-F771', 'Fluzone High-Dose', 'Sanofi Pasteur', new Date(now.getTime() - 12 * 3600 * 1000).toISOString(), 'Seasonal senior influenza stock');

  // Seed Historical Tests demonstrating acoustic differences:
  // - Frozen/Freeze-damaged vials: lower peak amplitude, longer decay / ringing changes, frequency shift down (~3100-3300 Hz vs normal ~4800-5100 Hz due to ice crystal formation changing vial acoustic resonance).
  const insertTest = db.prepare(`
    INSERT INTO tests (id, device_id, user_id, vial_batch_id, tested_at, received_at, classification_result, confidence_score, strikes_used, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertStrike = db.prepare(`
    INSERT INTO strikes (id, test_id, strike_number, peak_amplitude, decay_time_constant, dominant_frequency_hz)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // 1. Batch MOD-2024-B882 (Healthy Batch - all PASS)
  for (let i = 1; i <= 5; i++) {
    const testId = uuidv4();
    const testTime = new Date(now.getTime() - (20 - i) * 3600 * 1000).toISOString();
    insertTest.run(testId, dev1Id, worker1Id, 'MOD-2024-B882', testTime, testTime, 'PASS', 0.93 + (i * 0.01), 3, `Routine pre-admin vial #${i}`);
    insertStrike.run(uuidv4(), testId, 1, 0.87, 14.1, 4850.2);
    insertStrike.run(uuidv4(), testId, 2, 0.85, 13.9, 4855.0);
    insertStrike.run(uuidv4(), testId, 3, 0.86, 14.0, 4852.8);
  }

  // 2. Batch PFI-2024-X419 (Damaged Batch - Multiple FAILs, triggering actionable batch alert!)
  // 4 FAILs, 1 INCONCLUSIVE, 1 PASS -> clearly triggers the "3 or more failures" warning!
  const pfiOutcomes = [
    { res: 'FAIL', conf: 0.94, freq: 3120.5, amp: 0.41, decay: 34.2, note: 'Vial acoustic response dull; resonant frequency shift detected' },
    { res: 'FAIL', conf: 0.91, freq: 3090.0, amp: 0.39, decay: 36.5, note: 'Freeze damage signature confirmed by TinyML' },
    { res: 'PASS', conf: 0.82, freq: 4790.0, amp: 0.81, decay: 15.2, note: 'Passed, but lower confidence' },
    { res: 'FAIL', conf: 0.96, freq: 3105.0, amp: 0.40, decay: 35.0, note: 'Severe resonance dampening' },
    { res: 'FAIL', conf: 0.93, freq: 3140.2, amp: 0.43, decay: 33.8, note: 'Acoustic waveform confirms freeze-thaw agglomeration' },
    { res: 'INCONCLUSIVE', conf: 0.58, freq: 4100.0, amp: 0.62, decay: 22.0, note: 'Boundary classification; retest recommended' },
  ];

  pfiOutcomes.forEach((item, idx) => {
    const testId = uuidv4();
    const testTime = new Date(now.getTime() - (15 - idx * 2) * 3600 * 1000).toISOString();
    insertTest.run(testId, dev2Id, worker1Id, 'PFI-2024-X419', testTime, testTime, item.res, item.conf, 3, item.note);
    for (let s = 1; s <= 3; s++) {
      const freqVar = (Math.random() - 0.5) * 20;
      const ampVar = (Math.random() - 0.5) * 0.04;
      insertStrike.run(uuidv4(), testId, s, Number((item.amp + ampVar).toFixed(3)), Number((item.decay + (s * 0.2)).toFixed(1)), Number((item.freq + freqVar).toFixed(1)));
    }
  });

  // 3. Batch VAR-2024-V09 (Mix of PASS and 1 Inconclusive)
  for (let i = 1; i <= 3; i++) {
    const testId = uuidv4();
    const testTime = new Date(now.getTime() - (6 - i) * 3600 * 1000).toISOString();
    const isInc = (i === 2);
    insertTest.run(
      testId, dev1Id, worker1Id, 'VAR-2024-V09', testTime, testTime,
      isInc ? 'INCONCLUSIVE' : 'PASS',
      isInc ? 0.61 : 0.92,
      3,
      isInc ? 'Microphone background noise detected on strike 2' : 'Passed clean acoustic check'
    );
    insertStrike.run(uuidv4(), testId, 1, 0.84, 14.5, 4920.0);
    insertStrike.run(uuidv4(), testId, 2, isInc ? 0.98 : 0.83, isInc ? 8.2 : 14.4, isInc ? 2400.0 : 4915.0);
    insertStrike.run(uuidv4(), testId, 3, 0.85, 14.3, 4922.0);
  }

  console.log('VaxCheck database seeded successfully!');
}

module.exports = {
  db,
  initDatabase,
};
