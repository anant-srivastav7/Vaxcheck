/**
 * VaxCheck Hardware Simulator
 * 
 * Simulates the physical ESP32 microcontroller with solenoid actuator and I2S microphone.
 * Sends REAL HTTP requests to the exact same /api/v1/tests endpoint using genuine device tokens.
 * 
 * Usage:
 *   node simulator.js --mode=single                # Run 1 simulated test
 *   node simulator.js --mode=batch --count=5       # Run 5 batched tests (offline sync simulation)
 *   node simulator.js --mode=continuous --poll=3   # Continuous listener (polls for remote test triggers & sends heartbeats)
 *   node simulator.js --verdict=FAIL --batch-id=TEST-BATCH-01  # Force specific outcome
 */

const http = require('http');

const SERVER_HOST = process.env.VAX_HOST || 'localhost';
const SERVER_PORT = process.env.VAX_PORT || 5000;
const BASE_PATH = '/api/v1';

// Parse CLI flags
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.replace(/^--/, '').split('=');
  acc[k] = v === undefined ? true : v;
  return acc;
}, {});

const MODE = args.mode || 'single';
const FORCE_VERDICT = args.verdict ? args.verdict.toUpperCase() : null;
const CUSTOM_BATCH_ID = args['batch-id'] || null;
const COUNT = parseInt(args.count, 10) || 5;
const POLL_INTERVAL = parseInt(args.poll, 10) || 3;

// Default simulated device
let deviceId = args.device || 'dev-vax-001';
let deviceToken = args.token || 'vax_tok_demo_solenoid_unit_01';

/**
 * Perform an HTTP JSON request using native Node.js http
 */
function apiRequest(method, endpoint, body = null, token = deviceToken) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const options = {
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path: `${BASE_PATH}${endpoint}`,
      method,
      headers
    };

    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseBody);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, data: parsed });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${parsed.message || parsed.error || responseBody}`));
          }
        } catch {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, data: responseBody });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
          }
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

/**
 * Generate realistic acoustic features based on physical vaccine state
 */
function generateAcousticData(verdict) {
  const strikes = [];
  const numStrikes = 3;

  for (let s = 1; s <= numStrikes; s++) {
    let peakAmp, decayMs, domFreqHz;

    if (verdict === 'PASS') {
      // Intact vial: crisp ring-down, resonant frequency ~4700-5100 Hz
      peakAmp = Number((0.82 + Math.random() * 0.12).toFixed(3));
      decayMs = Number((13.0 + Math.random() * 2.5).toFixed(1));
      domFreqHz = Number((4820 + (Math.random() - 0.5) * 80).toFixed(1));
    } else if (verdict === 'FAIL') {
      // Freeze damaged vial: protein agglomeration / ice crystals dull resonance ~3050-3250 Hz
      peakAmp = Number((0.36 + Math.random() * 0.10).toFixed(3));
      decayMs = Number((32.0 + Math.random() * 6.0).toFixed(1));
      domFreqHz = Number((3120 + (Math.random() - 0.5) * 90).toFixed(1));
    } else {
      // Inconclusive: border conditions
      peakAmp = Number((0.58 + Math.random() * 0.12).toFixed(3));
      decayMs = Number((21.0 + Math.random() * 4.0).toFixed(1));
      domFreqHz = Number((4050 + (Math.random() - 0.5) * 150).toFixed(1));
    }

    strikes.push({
      strike_number: s,
      peak_amplitude: peakAmp,
      decay_time_constant: decayMs,
      dominant_frequency_hz: domFreqHz
    });
  }

  let confidence;
  if (verdict === 'PASS') {
    confidence = Number((0.91 + Math.random() * 0.08).toFixed(2));
  } else if (verdict === 'FAIL') {
    confidence = Number((0.89 + Math.random() * 0.09).toFixed(2));
  } else {
    confidence = Number((0.52 + Math.random() * 0.14).toFixed(2));
  }

  return { strikes, confidence };
}

/**
 * Pick random or configured verdict
 */
function determineVerdict() {
  if (FORCE_VERDICT) return FORCE_VERDICT;
  const rand = Math.random();
  if (rand < 0.75) return 'PASS';
  if (rand < 0.90) return 'FAIL';
  return 'INCONCLUSIVE';
}

/**
 * Build a single realistic test payload
 */
function createTestPayload(batchId, forcedVerdict = null) {
  const verdict = forcedVerdict || determineVerdict();
  const { strikes, confidence } = generateAcousticData(verdict);
  const batches = ['MOD-2024-B882', 'PFI-2024-X419', 'VAR-2024-V09', 'FLU-2024-F771', 'ROCHE-2024-R55'];
  const finalBatchId = batchId || CUSTOM_BATCH_ID || batches[Math.floor(Math.random() * batches.length)];

  return {
    device_id: deviceId,
    device_auth_token: deviceToken,
    vial_batch_id: finalBatchId,
    timestamp: new Date().toISOString(),
    classification_result: verdict,
    confidence_score: confidence,
    strikes_used: strikes.length,
    notes: `Simulated acoustic run via ${deviceId} TinyML engine`,
    strikes
  };
}

/**
 * Register a new device via admin endpoint (demonstrates full flow)
 */
async function registerTestDevice() {
  console.log('Registering a fresh test device via /api/v1/devices...');
  try {
    const res = await apiRequest('POST', '/devices', {
      name: `Simulated ESP32 Unit #${Math.floor(Math.random() * 900 + 100)}`,
      clinic_id: 'clinic-st-jude',
      firmware_version: 'v1.1.2-tinyML-sim'
    }, null);

    deviceId = res.data.device.id;
    deviceToken = res.data.device.auth_token;
    console.log(`Successfully registered: ${deviceId}`);
    console.log(`Generated Auth Token:   ${deviceToken}\n`);
  } catch (err) {
    console.warn(`Device registration failed: ${err.message}. Falling back to default: ${deviceId}`);
  }
}

/**
 * Execute single test submission
 */
async function runSingleTest(batchId = null, verdict = null) {
  const payload = createTestPayload(batchId, verdict);
  console.log(`[ESP32 -> Server] Submitting test for vial batch: ${payload.vial_batch_id}`);
  console.log(`  Verdict: ${payload.classification_result} (Confidence: ${(payload.confidence_score * 100).toFixed(0)}%)`);
  console.log(`  Strikes: ${payload.strikes_used} acoustic solenoid impulse(s)`);

  const res = await apiRequest('POST', '/tests', payload);
  console.log(`Server Response: HTTP ${res.status}`);
  console.log(`Result:`, JSON.stringify(res.data, null, 2));

  if (res.data.batch_alert) {
    console.log(`\n========================================================`);
    console.log(`*** BATCH LEVEL SAFETY ALERT DETECTED ***`);
    console.log(res.data.batch_alert.alert_message);
    console.log(`========================================================\n`);
  }
}

/**
 * Execute batch offline queued tests submission (Sync-on-reconnect)
 */
async function runBatchSync(count = COUNT) {
  console.log(`[ESP32 Offline Sync] Simulating ${count} tests stored on flash during WiFi outage...`);
  const testsList = [];
  const batches = ['PFI-2024-X419', 'MOD-2024-B882'];

  for (let i = 0; i < count; i++) {
    const bId = batches[i % batches.length];
    const test = createTestPayload(bId);
    // Simulate historical timestamps 10 to 60 minutes in the past
    test.timestamp = new Date(Date.now() - (count - i) * 6 * 60 * 1000).toISOString();
    testsList.push(test);
  }

  const batchPayload = {
    device_id: deviceId,
    device_auth_token: deviceToken,
    tests: testsList
  };

  console.log(`Posting batched payload containing ${testsList.length} test records to /api/v1/tests...`);
  const res = await apiRequest('POST', '/tests', batchPayload);
  console.log(`Server Response: HTTP ${res.status}`);
  console.log(`Summary:`, JSON.stringify(res.data, null, 2));
}

/**
 * Continuous mode: poll for remote commands and send heartbeats
 */
async function runContinuousMode() {
  console.log(`====================================================`);
  console.log(`  VaxCheck ESP32 Hardware Simulator Running`);
  console.log(`  Device ID:  ${deviceId}`);
  console.log(`  Auth Token: ${deviceToken.substring(0, 12)}...`);
  console.log(`  Polling:    Every ${POLL_INTERVAL} seconds`);
  console.log(`====================================================`);
  console.log(`Listening for remote test commands from clinic tablet...\n`);

  let battery = 0.95;

  setInterval(async () => {
    try {
      // 1. Send Heartbeat & telemetry
      battery = Math.max(0.20, Number((battery - 0.001).toFixed(3)));
      await apiRequest('POST', `/devices/${deviceId}/heartbeat`, {
        battery_level: battery,
        firmware_version: 'v1.1.2-tinyML'
      });

      // 2. Poll for pending commands
      const res = await apiRequest('GET', `/devices/${deviceId}/pending_commands`);
      const commands = res.data.commands || [];

      for (const cmd of commands) {
        console.log(`\n[ESP32] Received remote command: ${cmd.command_type} (ID: ${cmd.id})`);

        if (cmd.command_type === 'START_TEST') {
          const batchId = (cmd.payload && cmd.payload.vial_batch_id) || 'REMOTE-BATCH-001';
          console.log(`[ESP32] Executing remote acoustic strike cycle on vial batch: ${batchId}...`);

          // Simulate physical solenoid strike delay
          await new Promise(r => setTimeout(r, 1200));

          // Submit test result
          await runSingleTest(batchId);

          // Acknowledge command completion
          await apiRequest('POST', `/devices/${deviceId}/commands/${cmd.id}/ack`, {
            status: 'COMPLETED'
          });
          console.log(`[ESP32] Command ${cmd.id} marked COMPLETED.\n`);
        }
      }
    } catch (err) {
      console.error(`[ESP32 Error] ${err.message}`);
    }
  }, POLL_INTERVAL * 1000);
}

// Main execution
(async () => {
  try {
    if (args.register) {
      await registerTestDevice();
    }

    if (MODE === 'single') {
      await runSingleTest();
    } else if (MODE === 'batch') {
      await runBatchSync();
    } else if (MODE === 'continuous') {
      await runContinuousMode();
    } else {
      console.log(`Unknown mode: ${MODE}. Available: single, batch, continuous`);
    }
  } catch (err) {
    console.error('Simulator fatal error:', err.message);
    process.exit(1);
  }
})();
