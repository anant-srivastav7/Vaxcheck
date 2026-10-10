import React, { useState } from 'react';
import { ShieldCheck, UserCheck, Lock, ArrowRight, User } from 'lucide-react';
import { api } from '../api';

export default function LoginModal({ isOpen, onClose, onLoginSuccess }) {
  const [username, setUsername] = useState('nurse_sarah');
  const [password, setPassword] = useState('vaxcheck2026');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleLogin(e) {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(username, password);
      onLoginSuccess(res.user);
      onClose();
    } catch (err) {
      setError(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  }

  function quickSelectUser(user) {
    setUsername(user);
    setPassword('vaxcheck2026');
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '8px',
              backgroundColor: '#EFF6FF', color: '#2563EB',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Clinic Tablet Sign-In</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>
                Select worker profile or enter credentials
              </p>
            </div>
          </div>
        </div>

        <div className="modal-body">
          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: '8px', backgroundColor: '#FEF2F2',
              color: '#991B1B', fontSize: '0.85rem', marginBottom: '16px', border: '1px solid #FECACA'
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: '18px' }}>
            <label className="form-label" style={{ fontSize: '0.82rem', marginBottom: '8px', display: 'block' }}>
              Quick Select Clinic Health Worker:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{
                  justifyContent: 'flex-start',
                  padding: '10px 14px',
                  borderColor: username === 'nurse_sarah' ? '#2563EB' : '#E2E8F0',
                  backgroundColor: username === 'nurse_sarah' ? '#EFF6FF' : 'white'
                }}
                onClick={() => quickSelectUser('nurse_sarah')}
              >
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: '#10B981', color: 'white', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700
                }}>
                  SJ
                </div>
                <div style={{ textAlign: 'left', marginLeft: '6px' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>Nurse Sarah Jenkins, RN</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>St. Jude Clinic • Health Worker</div>
                </div>
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                style={{
                  justifyContent: 'flex-start',
                  padding: '10px 14px',
                  borderColor: username === 'tech_mark' ? '#2563EB' : '#E2E8F0',
                  backgroundColor: username === 'tech_mark' ? '#EFF6FF' : 'white'
                }}
                onClick={() => quickSelectUser('tech_mark')}
              >
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: '#0EA5E9', color: 'white', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700
                }}>
                  MT
                </div>
                <div style={{ textAlign: 'left', marginLeft: '6px' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>Mark Torres</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Mobile Outreach • Field Tech</div>
                </div>
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                style={{
                  justifyContent: 'flex-start',
                  padding: '10px 14px',
                  borderColor: username === 'admin' ? '#2563EB' : '#E2E8F0',
                  backgroundColor: username === 'admin' ? '#EFF6FF' : 'white'
                }}
                onClick={() => quickSelectUser('admin')}
              >
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: '#6366F1', color: 'white', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700
                }}>
                  EV
                </div>
                <div style={{ textAlign: 'left', marginLeft: '6px' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>Dr. Elena Vance</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>System Administrator</div>
                </div>
              </button>
            </div>
          </div>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '12px', padding: '12px' }}
              disabled={loading}
            >
              {loading ? 'Authenticating...' : (
                <>
                  <span>Sign In to Station</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
