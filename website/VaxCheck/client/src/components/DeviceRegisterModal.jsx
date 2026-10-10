import React, { useState, useEffect } from 'react';
import { X, Cpu, Copy, Check, ShieldAlert, Key } from 'lucide-react';
import { api } from '../api';

export default function DeviceRegisterModal({ isOpen, onClose, onDeviceCreated }) {
  const [name, setName] = useState('');
  const [clinicId, setClinicId] = useState('');
  const [firmwareVersion, setFirmwareVersion] = useState('v1.1.2-tinyML');
  const [clinics, setClinics] = useState([]);
  const [registeredResult, setRegisteredResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName('');
      setRegisteredResult(null);
      setCopied(false);
      setError('');
      api.getClinics().then(data => {
        setClinics(data);
        if (data.length > 0) setClinicId(data[0].id);
      }).catch(err => console.error(err));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleRegister(e) {
    e.preventDefault();
    if (!name || !clinicId) {
      setError('Please provide a device name and assign a clinic.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await api.registerDevice({
        name,
        clinic_id: clinicId,
        firmware_version: firmwareVersion
      });
      setRegisteredResult(res.device);
      if (onDeviceCreated) onDeviceCreated(res.device);
    } catch (err) {
      setError(err.message || 'Device registration failed.');
    } finally {
      setLoading(false);
    }
  }

  function handleCopyToken() {
    if (!registeredResult) return;
    navigator.clipboard.writeText(registeredResult.auth_token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '8px',
              backgroundColor: '#EFF6FF', color: '#2563EB',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Cpu size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0 }}>Register New Hardware Unit</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>
                Provision ESP32 cryptographic API token
              </p>
            </div>
          </div>
          <button className="btn btn-secondary" style={{ padding: '6px 10px', borderRadius: '50%' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div style={{ padding: '10px 14px', background: '#FEF2F2', color: '#991B1B', borderRadius: '8px', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {!registeredResult ? (
            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label className="form-label">Hardware Device Label / Identifier</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. ESP32 Solenoid Unit #4 (Intake Station)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Deploying Clinic Location</label>
                <select
                  className="form-select"
                  value={clinicId}
                  onChange={(e) => setClinicId(e.target.value)}
                  required
                >
                  {clinics.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.location || 'Main'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">ESP32 Firmware Build</label>
                <input
                  type="text"
                  className="form-input"
                  value={firmwareVersion}
                  onChange={(e) => setFirmwareVersion(e.target.value)}
                />
              </div>

              <div style={{
                background: '#F1F5F9', padding: '12px 16px', borderRadius: '8px',
                fontSize: '0.85rem', color: '#475569', marginBottom: '20px'
              }}>
                <strong>Security Guarantee:</strong> A unique API token will be generated. The server will permanently reject any acoustic submissions without this cryptographic token to prevent injection of counterfeit vaccine safety reports.
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px' }}
                disabled={loading}
              >
                {loading ? 'Provisioning Device...' : 'Generate API Key & Register Unit'}
              </button>
            </form>
          ) : (
            <div>
              <div style={{
                textAlign: 'center', padding: '20px', background: '#ECFDF5',
                borderRadius: '12px', border: '1px solid #A7F3D0', marginBottom: '20px'
              }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '50%',
                  background: '#10B981', color: 'white', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px'
                }}>
                  <Key size={26} />
                </div>
                <h4 style={{ color: '#065F46', fontSize: '1.15rem', marginBottom: '4px' }}>
                  Device Registered Successfully!
                </h4>
                <p style={{ color: '#047857', fontSize: '0.88rem' }}>
                  Unit ID: <strong>{registeredResult.id}</strong> ({registeredResult.name})
                </p>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Hardware Device API Token:</span>
                  <span style={{ color: '#EF4444', fontSize: '0.78rem', fontWeight: 700 }}>Flash into ESP32 code</span>
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    readOnly
                    value={registeredResult.auth_token}
                    style={{
                      flex: 1, padding: '10px 14px', fontFamily: 'monospace',
                      fontSize: '0.88rem', background: '#0F172A', color: '#38BDF8',
                      border: '1px solid #334155', borderRadius: '8px'
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleCopyToken}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div style={{
                background: '#0F172A', color: '#F8FAFC', padding: '14px',
                borderRadius: '8px', fontSize: '0.8rem', fontFamily: 'monospace', overflowX: 'auto'
              }}>
                <div style={{ color: '#94A3B8', marginBottom: '6px' }}>// C++ / Arduino Provisioning snippet:</div>
                <code>
                  const char* deviceId = "{registeredResult.id}";<br />
                  const char* deviceToken = "{registeredResult.auth_token}";
                </code>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: '20px' }}
                onClick={onClose}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
