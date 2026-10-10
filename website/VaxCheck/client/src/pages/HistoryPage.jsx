import React, { useState, useEffect } from 'react';
import {
  Search, Filter, ShieldCheck, AlertOctagon, AlertTriangle,
  ChevronRight, Calendar, Cpu, RefreshCw
} from 'lucide-react';
import { api } from '../api';

export default function HistoryPage({ onSelectTest }) {
  const [tests, setTests] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchBatch, setSearchBatch] = useState('');
  const [selectedVerdict, setSelectedVerdict] = useState('');
  const [selectedDevice, setSelectedDevice] = useState('');
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    api.getDevices().then(d => setDevices(d)).catch(console.error);
    loadTests();
  }, [searchBatch, selectedVerdict, selectedDevice]);

  async function loadTests() {
    setLoading(true);
    try {
      const res = await api.getTests({
        vial_batch_id: searchBatch,
        classification_result: selectedVerdict,
        device_id: selectedDevice,
        limit: 100
      });
      setTests(res.tests || []);
      setTotalCount(res.total || 0);
    } catch (err) {
      console.error('Failed to load tests:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
            Vaccine Test Records & Audit Trail
          </h2>
          <p style={{ color: '#64748B', fontSize: '0.95rem' }}>
            {totalCount} total acoustic verification tests logged
          </p>
        </div>

        <button className="btn btn-secondary" onClick={loadTests}>
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <input
            type="text"
            className="form-input"
            style={{ width: '100%', paddingLeft: '38px', height: '42px' }}
            placeholder="Search by Vial Batch ID..."
            value={searchBatch}
            onChange={(e) => setSearchBatch(e.target.value)}
          />
          <Search size={18} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
        </div>

        <div style={{ flex: '1 1 180px' }}>
          <select
            className="form-select"
            style={{ width: '100%', height: '42px' }}
            value={selectedVerdict}
            onChange={(e) => setSelectedVerdict(e.target.value)}
          >
            <option value="">All Verdicts</option>
            <option value="PASS">PASS (Safe)</option>
            <option value="FAIL">FAIL (Freeze Damaged)</option>
            <option value="INCONCLUSIVE">INCONCLUSIVE (Retest)</option>
          </select>
        </div>

        <div style={{ flex: '1 1 200px' }}>
          <select
            className="form-select"
            style={{ width: '100%', height: '42px' }}
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
          >
            <option value="">All Testing Units</option>
            {devices.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Verdict</th>
                <th>Vial Batch ID</th>
                <th>Product</th>
                <th>Confidence</th>
                <th>Strikes</th>
                <th>Hardware Device</th>
                <th>Clinic</th>
                <th>Tested Timestamp</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                    Loading audit trail...
                  </td>
                </tr>
              ) : tests.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                    No matching test records found.
                  </td>
                </tr>
              ) : (
                tests.map((t) => (
                  <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => onSelectTest(t.id)}>
                    <td>
                      <span className={`badge-verdict ${t.classification_result.toLowerCase()}`}>
                        {t.classification_result === 'PASS' && <ShieldCheck size={14} />}
                        {t.classification_result === 'FAIL' && <AlertOctagon size={14} />}
                        {t.classification_result === 'INCONCLUSIVE' && <AlertTriangle size={14} />}
                        <span>{t.classification_result}</span>
                      </span>
                    </td>
                    <td>
                      <strong>{t.vial_batch_id}</strong>
                    </td>
                    <td>{t.vaccine_name || 'Vaccine Stock'}</td>
                    <td>
                      <strong>{(t.confidence_score * 100).toFixed(0)}%</strong>
                    </td>
                    <td>{t.strikes_used} strikes</td>
                    <td>{t.device_name}</td>
                    <td>{t.clinic_name || 'Main Clinic'}</td>
                    <td>{new Date(t.tested_at).toLocaleString()}</td>
                    <td>
                      <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                        <span>Detail</span>
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
  );
}
