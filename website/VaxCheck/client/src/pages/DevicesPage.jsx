import React, { useState, useEffect } from 'react';
import {
  Cpu, Plus, Battery, BatteryCharging, Radio, CheckCircle,
  AlertCircle, RefreshCw, Copy, Check
} from 'lucide-react';
import { api } from '../api';

export default function DevicesPage({ onOpenRegisterModal }) {
  const [devices, setDevices] = useState([]);
  const [clinics, setClinics] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 8000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      const [devs, cls] = await Promise.all([
        api.getDevices(),
        api.getClinics()
      ]);
      setDevices(devs);
      setClinics(cls);
    } catch (err) {
      console.error('Failed to load devices:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
            Hardware Testing Units & Device Inventory
          </h2>
          <p style={{ color: '#64748B', fontSize: '0.95rem' }}>
            ESP32 microcontrollers deployed across clinic stations
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={loadData}>
            <RefreshCw size={16} />
            <span>Poll Telemetry</span>
          </button>
          <button className="btn btn-primary" onClick={onOpenRegisterModal}>
            <Plus size={18} />
            <span>Register New Device</span>
          </button>
        </div>
      </div>

      {/* Device Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '20px',
        marginBottom: '32px'
      }}>
        {devices.map(dev => (
          <div key={dev.id} className="card" style={{ marginBottom: 0, border: dev.is_online ? '2px solid #93C5FD' : '1px solid #E2E8F0' }}>
            <div className="card-header" style={{ background: dev.is_online ? '#F0F9FF' : '#F8FAFC' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '38px', height: '38px', borderRadius: '10px',
                  background: dev.is_online ? '#2563EB' : '#64748B', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Cpu size={20} />
                </div>
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>{dev.name}</h4>
                  <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#64748B' }}>
                    {dev.id}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className={`status-dot ${dev.is_online ? 'online' : 'offline'}`} />
                <span style={{
                  fontSize: '0.75rem', fontWeight: 800,
                  color: dev.is_online ? '#059669' : '#64748B'
                }}>
                  {dev.is_online ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
            </div>

            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <span className="stat-label">Clinic Assignment</span>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{dev.clinic_name || 'Unassigned'}</div>
                </div>

                <div>
                  <span className="stat-label">Battery Level</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                    <Battery size={16} color="#10B981" />
                    <span>{Math.round((dev.battery_level || 1.0) * 100)}%</span>
                  </div>
                </div>

                <div>
                  <span className="stat-label">Total Tests Run</span>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#2563EB' }}>
                    {dev.total_tests_run || 0}
                  </div>
                </div>

                <div>
                  <span className="stat-label">Firmware</span>
                  <div style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: '#475569' }}>
                    {dev.firmware_version || 'v1.0.0'}
                  </div>
                </div>
              </div>

              <div style={{
                fontSize: '0.78rem', color: '#64748B', borderTop: '1px solid #F1F5F9',
                paddingTop: '12px', display: 'flex', justifyContent: 'space-between'
              }}>
                <span>Last Telemetry Heartbeat:</span>
                <span style={{ fontWeight: 600 }}>
                  {dev.last_seen_at ? new Date(dev.last_seen_at).toLocaleTimeString() : 'Never'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Clinics Directory */}
      <div className="card">
        <div className="card-header">
          <h4 className="card-title">Clinic Locations & Regional Network</h4>
        </div>
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Clinic Facility</th>
                <th>Location / Depot</th>
                <th>Active Devices</th>
                <th>Total Tests Logged</th>
              </tr>
            </thead>
            <tbody>
              {clinics.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.location || 'Central Facility'}</td>
                  <td>
                    <span style={{ fontWeight: 700, color: '#2563EB' }}>{c.device_count || 0}</span> units
                  </td>
                  <td>
                    <strong>{c.total_tests || 0}</strong> tests
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
