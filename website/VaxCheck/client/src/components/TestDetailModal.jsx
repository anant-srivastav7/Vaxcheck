import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, AlertTriangle, AlertOctagon, Activity, Cpu, Calendar, User, CheckCircle2 } from 'lucide-react';
import { api } from '../api';

export default function TestDetailModal({ testId, onClose }) {
  const [test, setTest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!testId) return;
    setLoading(true);
    api.getTestDetail(testId)
      .then(data => setTest(data))
      .catch(err => setError(err.message || 'Failed to load test details'))
      .finally(() => setLoading(false));
  }, [testId]);

  if (!testId) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0 }}>Vial Test Audit Record</h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>
              ID: {testId}
            </p>
          </div>
          <button
            className="btn btn-secondary"
            style={{ padding: '6px 10px', borderRadius: '50%' }}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
              Loading test telemetry and strike acoustics...
            </div>
          )}

          {error && (
            <div style={{ padding: '14px', background: '#FEF2F2', color: '#991B1B', borderRadius: '8px' }}>
              {error}
            </div>
          )}

          {test && (
            <>
              {/* Verdict Header Badge */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderRadius: '12px',
                marginBottom: '20px',
                backgroundColor: test.classification_result === 'PASS' ? '#ECFDF5' :
                  test.classification_result === 'FAIL' ? '#FEF2F2' : '#FFFBEB',
                border: `2px solid ${
                  test.classification_result === 'PASS' ? '#10B981' :
                  test.classification_result === 'FAIL' ? '#EF4444' : '#F59E0B'
                }`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {test.classification_result === 'PASS' && <ShieldCheck size={32} color="#10B981" />}
                  {test.classification_result === 'FAIL' && <AlertOctagon size={32} color="#EF4444" />}
                  {test.classification_result === 'INCONCLUSIVE' && <AlertTriangle size={32} color="#F59E0B" />}
                  <div>
                    <div style={{
                      fontWeight: 800,
                      fontSize: '1.2rem',
                      color: test.classification_result === 'PASS' ? '#065F46' :
                        test.classification_result === 'FAIL' ? '#991B1B' : '#92400E'
                    }}>
                      {test.classification_result === 'PASS' ? 'PASS — SAFE TO ADMINISTER' :
                       test.classification_result === 'FAIL' ? 'FAIL — FREEZE DAMAGE DETECTED' :
                       'INCONCLUSIVE — RETEST REQUIRED'}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
                      Confidence: {(test.confidence_score * 100).toFixed(1)}% • Strikes Analyzed: {test.strikes_used}
                    </div>
                  </div>
                </div>
              </div>

              {/* Batch Alert if present */}
              {test.batch_alert && (
                <div className="alert-banner critical" style={{ padding: '12px 16px', marginBottom: '20px' }}>
                  <AlertTriangle size={20} />
                  <div>
                    <h4 style={{ fontSize: '0.92rem', marginBottom: '2px' }}>Batch Safety Warning</h4>
                    <p style={{ fontSize: '0.85rem' }}>{test.batch_alert.alert_message}</p>
                  </div>
                </div>
              )}

              {/* Meta Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '14px',
                marginBottom: '20px',
                background: '#F8FAFC',
                padding: '16px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0'
              }}>
                <div>
                  <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>Vial Batch ID</span>
                  <div style={{ fontWeight: 700, fontSize: '0.98rem', color: '#0F172A' }}>{test.vial_batch_id}</div>
                  <span style={{ fontSize: '0.8rem', color: '#475569' }}>{test.vaccine_name || 'Vaccine Product'}</span>
                </div>

                <div>
                  <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>Testing Hardware Unit</span>
                  <div style={{ fontWeight: 700, fontSize: '0.98rem', color: '#0F172A' }}>{test.device_name}</div>
                  <span style={{ fontSize: '0.8rem', color: '#475569' }}>Firmware: {test.firmware_version || 'v1.0.0'}</span>
                </div>

                <div>
                  <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>Clinic Location</span>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{test.clinic_name || 'Main Clinic'}</div>
                </div>

                <div>
                  <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>Tested At</span>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                    {new Date(test.tested_at).toLocaleString()}
                  </div>
                </div>
              </div>

              {test.notes && (
                <div style={{ marginBottom: '20px', fontSize: '0.88rem', color: '#475569', fontStyle: 'italic' }}>
                  "{test.notes}"
                </div>
              )}

              {/* Per-Strike Acoustic Features */}
              <div className="strike-detail-card">
                <h3>
                  <Activity size={18} />
                  <span>Acoustic Waveform & Solenoid Telemetry</span>
                </h3>
                <p style={{ fontSize: '0.82rem', color: '#94A3B8', marginBottom: '14px' }}>
                  Raw feature extraction from on-device I2S microphone ring-down (TinyML FFT inputs).
                </p>

                {test.strikes && test.strikes.length > 0 ? (
                  <div className="strike-grid">
                    {test.strikes.map((s) => (
                      <div key={s.strike_number} className="strike-col">
                        <h4>
                          <span>Strike #{s.strike_number}</span>
                          <CheckCircle2 size={15} color="#38BDF8" />
                        </h4>
                        <div className="metric-row">
                          <span className="metric-name">Dominant Res. Freq:</span>
                          <span className="metric-val" style={{
                            color: s.dominant_frequency_hz < 3500 ? '#F87171' : '#34D399'
                          }}>
                            {s.dominant_frequency_hz ? `${s.dominant_frequency_hz} Hz` : 'N/A'}
                          </span>
                        </div>
                        <div className="metric-row">
                          <span className="metric-name">Decay Time (τ):</span>
                          <span className="metric-val">
                            {s.decay_time_constant ? `${s.decay_time_constant} ms` : 'N/A'}
                          </span>
                        </div>
                        <div className="metric-row">
                          <span className="metric-name">Peak Amplitude:</span>
                          <span className="metric-val">
                            {s.peak_amplitude !== null ? s.peak_amplitude : 'N/A'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.85rem', color: '#94A3B8', padding: '10px 0' }}>
                    No per-strike acoustic features recorded for this legacy test.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close Record
          </button>
        </div>
      </div>
    </div>
  );
}
