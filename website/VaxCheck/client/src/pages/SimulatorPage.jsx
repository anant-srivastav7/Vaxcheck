import React, { useState, useEffect } from 'react';
import {
  Terminal, Play, RefreshCw, Send, ShieldAlert, CheckCircle2,
  FileCode, ExternalLink, Activity, ArrowRight, Radio
} from 'lucide-react';
import { api } from '../api';

export default function SimulatorPage() {
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [targetBatchId, setTargetBatchId] = useState('PFI-2024-X419');
  const [forcedVerdict, setForcedVerdict] = useState('FAIL');
  const [simMode, setSimMode] = useState('single'); // 'single' or 'batch_sync'

  const [loading, setLoading] = useState(false);
  const [logMessages, setLogMessages] = useState([]);
  const [lastPayload, setLastPayload] = useState(null);
  const [lastResponse, setLastResponse] = useState(null);

  useEffect(() => {
    api.getDevices().then(data => {
      setDevices(data);
      if (data.length > 0) setSelectedDeviceId(data[0].id);
    }).catch(console.error);

    appendLog('Simulator Ready. Connected to VaxCheck v1 Device API.');
  }, []);

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  function appendLog(msg) {
    const timestamp = new Date().toLocaleTimeString();
    setLogMessages(prev => [`[${timestamp}] ${msg}`, ...prev.slice(0, 40)]);
  }

  // Execute genuine HTTP POST to /api/v1/tests
  async function runSimulation(verdictOverride = null) {
    if (!selectedDevice) {
      appendLog('ERROR: No device selected.');
      return;
    }

    const verdict = verdictOverride || forcedVerdict;
    setLoading(true);

    try {
      if (simMode === 'single') {
        appendLog(`[ESP32 -> /api/v1/tests] Firing Solenoid 3 strikes on batch: ${targetBatchId}`);

        // Generate realistic acoustic features
        const strikes = [];
        for (let s = 1; s <= 3; s++) {
          if (verdict === 'PASS') {
            strikes.push({
              strike_number: s,
              peak_amplitude: Number((0.85 + Math.random() * 0.08).toFixed(3)),
              decay_time_constant: Number((14.0 + Math.random() * 1.5).toFixed(1)),
              dominant_frequency_hz: Number((4850 + (Math.random() - 0.5) * 40).toFixed(1))
            });
          } else if (verdict === 'FAIL') {
            strikes.push({
              strike_number: s,
              peak_amplitude: Number((0.40 + Math.random() * 0.06).toFixed(3)),
              decay_time_constant: Number((34.0 + Math.random() * 3.0).toFixed(1)),
              dominant_frequency_hz: Number((3110 + (Math.random() - 0.5) * 50).toFixed(1))
            });
          } else {
            strikes.push({
              strike_number: s,
              peak_amplitude: Number((0.60 + Math.random() * 0.08).toFixed(3)),
              decay_time_constant: Number((22.0 + Math.random() * 2.5).toFixed(1)),
              dominant_frequency_hz: Number((4050 + (Math.random() - 0.5) * 80).toFixed(1))
            });
          }
        }

        const confidence = verdict === 'PASS' ? 0.94 : (verdict === 'FAIL' ? 0.92 : 0.60);

        const payload = {
          device_id: selectedDevice.id,
          device_auth_token: selectedDevice.auth_token,
          vial_batch_id: targetBatchId,
          timestamp: new Date().toISOString(),
          classification_result: verdict,
          confidence_score: confidence,
          strikes_used: 3,
          notes: `Simulated ESP32 run [${verdict}]`,
          strikes
        };

        setLastPayload(payload);

        const res = await api.submitDeviceTest(payload, selectedDevice.auth_token);
        setLastResponse(res);
        appendLog(`HTTP 201 Created: Inserted test ${res.test_ids[0]}.`);
        if (res.batch_alert) {
          appendLog(`*** BATCH ALERT: ${res.batch_alert.alert_message} ***`);
        }
      } else {
        // Offline Sync Simulation: 4 historical tests stored on flash
        appendLog(`[ESP32 Offline Sync] Simulating reconnect: posting 4 queued results from LittleFS...`);

        const tests = [
          {
            vial_batch_id: targetBatchId,
            timestamp: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
            classification_result: 'FAIL',
            confidence_score: 0.91,
            strikes_used: 3,
            strikes: [{ strike_number: 1, peak_amplitude: 0.39, decay_time_constant: 35.1, dominant_frequency_hz: 3100.0 }]
          },
          {
            vial_batch_id: targetBatchId,
            timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
            classification_result: 'FAIL',
            confidence_score: 0.95,
            strikes_used: 3,
            strikes: [{ strike_number: 1, peak_amplitude: 0.38, decay_time_constant: 36.2, dominant_frequency_hz: 3090.0 }]
          },
          {
            vial_batch_id: targetBatchId,
            timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
            classification_result: 'PASS',
            confidence_score: 0.88,
            strikes_used: 3,
            strikes: [{ strike_number: 1, peak_amplitude: 0.82, decay_time_constant: 14.8, dominant_frequency_hz: 4830.0 }]
          },
          {
            vial_batch_id: targetBatchId,
            timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
            classification_result: 'FAIL',
            confidence_score: 0.93,
            strikes_used: 3,
            strikes: [{ strike_number: 1, peak_amplitude: 0.41, decay_time_constant: 34.0, dominant_frequency_hz: 3125.0 }]
          }
        ];

        const batchPayload = {
          device_id: selectedDevice.id,
          device_auth_token: selectedDevice.auth_token,
          tests
        };

        setLastPayload(batchPayload);

        const res = await api.submitDeviceTest(batchPayload, selectedDevice.auth_token);
        setLastResponse(res);
        appendLog(`HTTP 201 Created: Batched sync saved ${res.inserted_count} queued tests.`);
        if (res.batch_alert) {
          appendLog(`*** BATCH ALERT TRIGGERED: ${res.batch_alert.alert_message} ***`);
        }
      }
    } catch (err) {
      appendLog(`ERROR: ${err.message}`);
      setLastResponse({ error: err.message });
    } finally {
      setLoading(false);
    }
  }

  // Test Authentication Rejection
  async function testAuthRejection() {
    appendLog('[Security Test] Submitting test with INVALID/FORGED device token...');
    try {
      await api.submitDeviceTest({
        device_id: 'fake-device',
        vial_batch_id: 'INTRUDER-TEST',
        classification_result: 'PASS',
        confidence_score: 0.99,
        strikes_used: 1
      }, 'fake_forged_token_12345');
      appendLog('WARNING: Should have been rejected!');
    } catch (err) {
      appendLog(`SUCCESS: Server rejected forged token with: "${err.message}" (HTTP 401)`);
    }
  }

  return (
    <div className="page-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
            ESP32 Hardware Simulator & Wire Protocol Inspector
          </h2>
          <p style={{ color: '#64748B', fontSize: '0.95rem' }}>
            Exercises genuine HTTP wire contracts against <code>/api/v1/tests</code> with real cryptographic tokens.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <a
            href="http://localhost:5000/api/docs"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
          >
            <ExternalLink size={16} />
            <span>OpenAPI Swagger UI</span>
          </a>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '28px' }}>
        {/* Simulator Control Panel */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <h3 className="card-title">Microcontroller Simulator Controls</h3>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Simulated Hardware Unit</label>
              <select
                className="form-select"
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
              >
                {devices.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.is_online ? 'Online' : 'Idle'})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Target Vaccine Batch</label>
              <input
                type="text"
                className="form-input"
                value={targetBatchId}
                onChange={(e) => setTargetBatchId(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Simulation Mode</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className={`btn ${simMode === 'single' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setSimMode('single')}
                >
                  <span>Single Live Test</span>
                </button>
                <button
                  type="button"
                  className={`btn ${simMode === 'batch_sync' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setSimMode('batch_sync')}
                >
                  <span>Offline Sync Queue (4 Vials)</span>
                </button>
              </div>
            </div>

            {simMode === 'single' && (
              <div className="form-group">
                <label className="form-label">Simulated TinyML Acoustic Outcome</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn"
                    style={{
                      backgroundColor: forcedVerdict === 'PASS' ? '#10B981' : '#ECFDF5',
                      color: forcedVerdict === 'PASS' ? 'white' : '#065F46',
                      borderColor: '#10B981', fontWeight: 700
                    }}
                    onClick={() => setForcedVerdict('PASS')}
                  >
                    PASS (4850 Hz)
                  </button>

                  <button
                    type="button"
                    className="btn"
                    style={{
                      backgroundColor: forcedVerdict === 'FAIL' ? '#EF4444' : '#FEF2F2',
                      color: forcedVerdict === 'FAIL' ? 'white' : '#991B1B',
                      borderColor: '#EF4444', fontWeight: 700
                    }}
                    onClick={() => setForcedVerdict('FAIL')}
                  >
                    FAIL (3110 Hz)
                  </button>

                  <button
                    type="button"
                    className="btn"
                    style={{
                      backgroundColor: forcedVerdict === 'INCONCLUSIVE' ? '#F59E0B' : '#FFFBEB',
                      color: forcedVerdict === 'INCONCLUSIVE' ? 'white' : '#92400E',
                      borderColor: '#F59E0B', fontWeight: 700
                    }}
                    onClick={() => setForcedVerdict('INCONCLUSIVE')}
                  >
                    INCONCLUSIVE
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '12px' }}
                onClick={() => runSimulation()}
                disabled={loading}
              >
                <Play size={18} fill="white" />
                <span>
                  {simMode === 'single' ? `Dispatch Simulated ${forcedVerdict} Test` : 'Dispatch Batched Offline Sync'}
                </span>
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ borderColor: '#EF4444', color: '#DC2626' }}
                onClick={testAuthRejection}
              >
                <ShieldAlert size={16} />
                <span>Test Anti-Spoofing (Reject Unauthenticated Request)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Terminal & Logs */}
        <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="card-header" style={{ background: '#0F172A', color: 'white', borderBottom: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={18} color="#38BDF8" />
              <h3 className="card-title" style={{ color: 'white', fontSize: '1rem' }}>
                Hardware Bus & Protocol Console
              </h3>
            </div>
          </div>

          <div style={{
            background: '#0B132B', color: '#38BDF8', padding: '16px',
            fontFamily: 'monospace', fontSize: '0.82rem', flex: 1,
            overflowY: 'auto', maxHeight: '340px', lineHeight: 1.6
          }}>
            {logMessages.map((log, idx) => (
              <div key={idx} style={{
                color: log.includes('ERROR') ? '#F87171' :
                       log.includes('ALERT') ? '#FBBF24' :
                       log.includes('SUCCESS') ? '#34D399' : '#38BDF8'
              }}>
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Wire Contract Telemetry Inspector */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileCode size={20} color="#2563EB" />
            <h3 className="card-title">Wire-Level JSON Payload Inspector</h3>
          </div>
          <span style={{ fontSize: '0.82rem', color: '#64748B' }}>
            Exact JSON sent/received by physical ESP32
          </span>
        </div>

        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '6px', color: '#475569' }}>
              POST /api/v1/tests (Request Body)
            </div>
            <pre style={{
              background: '#0F172A', color: '#F8FAFC', padding: '16px',
              borderRadius: '8px', fontSize: '0.78rem', overflowX: 'auto', maxHeight: '280px'
            }}>
              {lastPayload ? JSON.stringify(lastPayload, null, 2) : '// Run simulation to view JSON body'}
            </pre>
          </div>

          <div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '6px', color: '#475569' }}>
              HTTP Response (Server Status & Batch Alert)
            </div>
            <pre style={{
              background: '#0F172A', color: '#F8FAFC', padding: '16px',
              borderRadius: '8px', fontSize: '0.78rem', overflowX: 'auto', maxHeight: '280px'
            }}>
              {lastResponse ? JSON.stringify(lastResponse, null, 2) : '// Awaiting server response'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
