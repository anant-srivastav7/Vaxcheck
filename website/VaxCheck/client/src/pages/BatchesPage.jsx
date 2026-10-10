import React, { useState, useEffect } from 'react';
import {
  AlertTriangle, AlertOctagon, ShieldCheck, ArrowLeft, Package,
  ChevronRight, Activity, Calendar, Info
} from 'lucide-react';
import { api } from '../api';

export default function BatchesPage({ initialBatchId, onSelectTest }) {
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(initialBatchId || null);
  const [batchDetail, setBatchDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    loadBatches();
  }, []);

  useEffect(() => {
    if (selectedBatchId) {
      loadBatchDetail(selectedBatchId);
    } else {
      setBatchDetail(null);
    }
  }, [selectedBatchId]);

  async function loadBatches() {
    setLoading(true);
    try {
      const data = await api.getBatches();
      setBatches(data);
    } catch (err) {
      console.error('Failed to load batches:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadBatchDetail(bId) {
    setLoadingDetail(true);
    try {
      const data = await api.getBatchDetail(bId);
      setBatchDetail(data);
    } catch (err) {
      console.error('Failed to load batch detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <div className="page-content">
      {/* Detail View for Single Batch */}
      {selectedBatchId && batchDetail ? (
        <div>
          <button
            className="btn btn-secondary"
            style={{ marginBottom: '20px' }}
            onClick={() => setSelectedBatchId(null)}
          >
            <ArrowLeft size={16} />
            <span>Back to All Vaccine Batches</span>
          </button>

          {/* Alert banner if concerning */}
          {batchDetail.alert && (
            <div className="alert-banner critical" style={{ marginBottom: '24px' }}>
              <AlertOctagon size={32} />
              <div>
                <h4 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>
                  URGENT LOT QUARANTINE: {batchDetail.alert.alert_level}
                </h4>
                <p style={{ fontSize: '0.95rem' }}>
                  {batchDetail.alert.alert_message}
                </p>
                <div style={{ marginTop: '8px', fontSize: '0.85rem', fontWeight: 700 }}>
                  Recommendation: Halt administration from lot {batchDetail.id}. Segregate cold-chain boxes for manufacturer audit.
                </div>
              </div>
            </div>
          )}

          {/* Batch Overview Card */}
          <div className="card" style={{ marginBottom: '24px' }}>
            <div className="card-header">
              <div>
                <span className="brand-badge" style={{ marginBottom: '4px' }}>Batch Lot Record</span>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{batchDetail.id}</h3>
                <p style={{ fontSize: '0.9rem', color: '#64748B' }}>
                  {batchDetail.vaccine_name || 'Vaccine Product'} • {batchDetail.manufacturer || 'Manufacturer Not Listed'}
                </p>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{
                  padding: '6px 14px', borderRadius: '999px', fontWeight: 800, fontSize: '0.88rem',
                  backgroundColor: batchDetail.is_concerning ? '#FEE2E2' : '#D1FAE5',
                  color: batchDetail.is_concerning ? '#991B1B' : '#065F46',
                  border: `1px solid ${batchDetail.is_concerning ? '#FECACA' : '#A7F3D0'}`
                }}>
                  {batchDetail.is_concerning ? 'QUARANTINE FLAGGED' : 'NORMAL INVENTORY'}
                </span>
              </div>
            </div>

            <div className="card-body">
              <div className="stats-grid" style={{ marginBottom: 0 }}>
                <div className="stat-card">
                  <span className="stat-label">Vials Tested</span>
                  <div className="stat-value">{batchDetail.total_tests || 0}</div>
                  <div className="stat-sub">From this batch lot</div>
                </div>

                <div className="stat-card">
                  <span className="stat-label">Confirmed Safe (PASS)</span>
                  <div className="stat-value" style={{ color: '#059669' }}>
                    {batchDetail.pass_count || 0}
                  </div>
                  <div className="stat-sub">No freeze injury</div>
                </div>

                <div className="stat-card">
                  <span className="stat-label">Failed (Freeze Damaged)</span>
                  <div className="stat-value" style={{ color: '#DC2626' }}>
                    {batchDetail.fail_count || 0}
                  </div>
                  <div className="stat-sub">Failure Rate: {batchDetail.fail_rate}%</div>
                </div>

                <div className="stat-card">
                  <span className="stat-label">Inconclusive</span>
                  <div className="stat-value" style={{ color: '#D97706' }}>
                    {batchDetail.inconclusive_count || 0}
                  </div>
                  <div className="stat-sub">Retest suggested</div>
                </div>
              </div>
            </div>
          </div>

          {/* Table of all tests for this batch */}
          <div className="card">
            <div className="card-header">
              <h4 className="card-title">All Vials Tested from Lot {batchDetail.id}</h4>
            </div>
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Verdict</th>
                    <th>Confidence</th>
                    <th>Testing Unit</th>
                    <th>Clinic</th>
                    <th>Tester</th>
                    <th>Tested At</th>
                    <th>Notes</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(batchDetail.tests || []).map(t => (
                    <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => onSelectTest(t.id)}>
                      <td>
                        <span className={`badge-verdict ${t.classification_result.toLowerCase()}`}>
                          {t.classification_result === 'PASS' && <ShieldCheck size={14} />}
                          {t.classification_result === 'FAIL' && <AlertOctagon size={14} />}
                          {t.classification_result === 'INCONCLUSIVE' && <AlertTriangle size={14} />}
                          <span>{t.classification_result}</span>
                        </span>
                      </td>
                      <td>{(t.confidence_score * 100).toFixed(0)}%</td>
                      <td>{t.device_name}</td>
                      <td>{t.clinic_name || 'Main'}</td>
                      <td>{t.worker_name || 'Staff'}</td>
                      <td>{new Date(t.tested_at).toLocaleString()}</td>
                      <td style={{ fontSize: '0.82rem', color: '#64748B' }}>{t.notes || '—'}</td>
                      <td>
                        <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.78rem' }}>
                          <span>Acoustics</span>
                          <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* List of all Batches */
        <div>
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              Vaccine Lot & Batch Surveillance
            </h2>
            <p style={{ color: '#64748B', fontSize: '0.95rem' }}>
              Batch-level acoustic aggregation detects systematic refrigeration failures across shipments.
            </p>
          </div>

          <div className="card">
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Batch ID</th>
                    <th>Vaccine Name</th>
                    <th>Manufacturer</th>
                    <th>Total Tested</th>
                    <th>Passed</th>
                    <th>Failed</th>
                    <th>Failure Rate</th>
                    <th>Safety Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                        Loading batch surveillance...
                      </td>
                    </tr>
                  ) : batches.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                        No batches recorded yet.
                      </td>
                    </tr>
                  ) : (
                    batches.map((b) => (
                      <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedBatchId(b.id)}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Package size={18} color={b.is_concerning ? '#EF4444' : '#2563EB'} />
                            <strong>{b.id}</strong>
                          </div>
                        </td>
                        <td>{b.vaccine_name || 'Generic Vaccine'}</td>
                        <td>{b.manufacturer || 'Unknown'}</td>
                        <td><strong>{b.total_tests || 0}</strong> vials</td>
                        <td style={{ color: '#059669', fontWeight: 600 }}>{b.pass_count || 0}</td>
                        <td style={{ color: b.fail_count > 0 ? '#DC2626' : '#64748B', fontWeight: 700 }}>
                          {b.fail_count || 0}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '50px', height: '6px', background: '#E2E8F0',
                              borderRadius: '999px', overflow: 'hidden'
                            }}>
                              <div style={{
                                width: `${b.fail_rate}%`, height: '100%',
                                backgroundColor: b.fail_rate > 20 ? '#EF4444' : '#10B981'
                              }} />
                            </div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{b.fail_rate}%</span>
                          </div>
                        </td>
                        <td>
                          {b.fail_count >= 3 ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              padding: '4px 10px', borderRadius: '999px', fontSize: '0.75rem',
                              fontWeight: 800, background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA'
                            }}>
                              <AlertOctagon size={12} />
                              QUARANTINE LOT
                            </span>
                          ) : b.is_concerning ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              padding: '4px 10px', borderRadius: '999px', fontSize: '0.75rem',
                              fontWeight: 800, background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A'
                            }}>
                              <AlertTriangle size={12} />
                              MONITOR CLOSELY
                            </span>
                          ) : (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              padding: '4px 10px', borderRadius: '999px', fontSize: '0.75rem',
                              fontWeight: 700, background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0'
                            }}>
                              <ShieldCheck size={12} />
                              SAFE
                            </span>
                          )}
                        </td>
                        <td>
                          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                            <span>Lot Audit</span>
                            <ChevronRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
