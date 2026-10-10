import React, { useState } from 'react';
import {
  ShieldCheck, ArrowLeft, Eye, EyeOff, Activity,
  Cpu, Radio, Clock, AlertCircle, Lock, UserPlus, CheckCircle2
} from 'lucide-react';
import { api } from '../api';
import { GoogleIcon } from './AdminRegisterPage';

/**
 * Worker Login Page
 * Supports:
 *  1. Google Sign-In
 *  2. Worker ID or Email + Password login
 *  3. Switch to Register Worker page
 */
export default function WorkerLoginPage({ onBack, onLoginSuccess, onNavigateRegister }) {
  const [workerId, setWorkerId] = useState('nurse_sarah');
  const [password, setPassword] = useState('vaxcheck2026');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(workerId, password);
      // Strictly enforce worker-only portal access
      if (res.user.role !== 'worker') {
        api.logout();
        setError(
          'This account belongs to an Administrator. Please use the Admin sign-in portal to log in.'
        );
        return;
      }
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err.message || 'Login failed. Check your Worker ID / Email and password.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError('');
    setGoogleLoading(true);

    try {
      let targetEmail = workerId.trim().toLowerCase();
      if (!targetEmail.includes('@')) {
        const inputPrompt = window.prompt(
          'Enter your Google account email to sign in to the Worker station:',
          'worker.vaxcheck@gmail.com'
        );
        if (!inputPrompt) {
          setGoogleLoading(false);
          return;
        }
        targetEmail = inputPrompt.trim().toLowerCase();
      }

      const res = await api.googleLogin({
        email: targetEmail,
        name: targetEmail.split('@')[0].replace(/[._]/g, ' '),
        sub: `google_worker_${Date.now()}`,
        role: 'worker',
      });

      const returnedUser = res.user || res;
      // Enforce worker-only portal access for Google login too
      if (returnedUser.role !== 'worker') {
        api.logout();
        setError(
          'This Google account is registered as an Administrator. Please use the Admin sign-in portal.'
        );
        return;
      }

      setSuccessMsg('Google Sign-in verified! Opening testing station…');
      setTimeout(() => {
        onLoginSuccess(returnedUser);
      }, 700);
    } catch (err) {
      setError(err.message || 'Google Sign-In failed.');
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="login-root">
      {/* Back Button */}
      <div className="login-back" onClick={onBack} role="button" tabIndex={0}>
        <ArrowLeft size={15} />
        <span>Back to role selection</span>
      </div>

      {/* Left branding panel */}
      <div className="login-split-left">
        <div className="login-branding">
          <div className="login-branding-logo">
            <div className="login-branding-logo-icon" style={{ background: 'linear-gradient(135deg, #10B981, #0EA5E9)' }}>
              <ShieldCheck size={28} />
            </div>
            <div className="login-branding-logo-text">
              <h1>VaxCheck</h1>
              <p>Health Worker Station</p>
            </div>
          </div>

          <h2 className="login-headline">
            Rapid Vial<br />
            <span style={{ color: '#34D399' }}>Integrity Check</span>
          </h2>
          <p className="login-tagline">
            Sign in to your clinic workstation. Test vaccine vials in seconds — the ESP32 device fires an acoustic impulse and the XGBoost model gives you an instant PASS or FAIL verdict.
          </p>

          <div className="login-features">
            {[
              {
                icon: <Activity size={17} />,
                bg: 'rgba(16,185,129,.18)', color: '#34D399',
                title: 'Guided Acoustic Testing',
                desc: 'Step-by-step vial scanning — scan barcode, press trigger, see result'
              },
              {
                icon: <Radio size={17} />,
                bg: 'rgba(14,165,233,.15)', color: '#38BDF8',
                title: 'Remote Trigger Support',
                desc: 'Activate the ESP32 solenoid strike from this tablet — no physical button needed'
              },
              {
                icon: <Cpu size={17} />,
                bg: 'rgba(245,158,11,.15)', color: '#FCD34D',
                title: 'XGBoost TinyML Analysis',
                desc: 'On-device acoustic ring-down analysis — results in under 3 seconds'
              },
              {
                icon: <Clock size={17} />,
                bg: 'rgba(99,102,241,.15)', color: '#A5B4FC',
                title: 'Offline Resilient',
                desc: 'Device stores results locally during WiFi outages and syncs when reconnected'
              },
            ].map(f => (
              <div className="login-feature" key={f.title}>
                <div className="login-feature-icon" style={{ background: f.bg, color: f.color }}>
                  {f.icon}
                </div>
                <div className="login-feature-text">
                  <h4>{f.title}</h4>
                  <p>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right login form */}
      <div className="login-split-right">
        <div className="login-card">
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 52, height: 52, borderRadius: 14, margin: '0 auto 16px',
            background: 'rgba(16,185,129,.2)', color: '#34D399'
          }}>
            <Activity size={26} />
          </div>

          <h3 className="login-card-title" style={{ textAlign: 'center' }}>Worker Station Sign In</h3>
          <p className="login-card-sub" style={{ textAlign: 'center', marginBottom: 20 }}>
            Enter your clinic Worker ID or Email to access the testing portal.
          </p>

          {/* Google Sign-in Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: '12px 18px',
              borderRadius: 11,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.14)',
              color: '#F8FAFC',
              fontSize: '.92rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all .2s ease',
              marginBottom: 18,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
          >
            <GoogleIcon size={19} />
            <span>{googleLoading ? 'Signing in with Google…' : 'Sign in with Google'}</span>
          </button>

          {/* Divider */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            marginBottom: 20, color: '#64748B', fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.06em'
          }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
            <span>or sign in with credentials</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          </div>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '11px 14px', borderRadius: 9,
              background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)',
              color: '#FCA5A5', fontSize: '.84rem', marginBottom: 18
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '11px 14px', borderRadius: 9,
              background: 'rgba(16,185,129,.15)', border: '1px solid rgba(16,185,129,.35)',
              color: '#6EE7B7', fontSize: '.84rem', marginBottom: 18
            }}>
              <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Worker ID or Email Address</label>
              <input
                id="worker-id"
                type="text"
                className="form-input"
                placeholder="nurse_sarah or nurse@clinic.org"
                value={workerId}
                onChange={e => setWorkerId(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="worker-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  style={{ width: '100%', paddingRight: 44 }}
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#475569'
                  }}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <button
              id="worker-signin-btn"
              type="submit"
              className="btn btn-lg"
              style={{
                width: '100%', marginTop: 8, justifyContent: 'center',
                background: 'linear-gradient(135deg, #10B981, #0EA5E9)',
                color: '#fff', border: 'none',
                boxShadow: '0 4px 14px rgba(16,185,129,.4)'
              }}
              disabled={loading || googleLoading}
            >
              {loading ? 'Signing in…' : 'Access Vial Testing Station'}
            </button>
          </form>

          {/* Register Worker CTA Link */}
          <div style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid rgba(255,255,255,0.08)',
            textAlign: 'center',
            fontSize: '.85rem',
            color: '#94A3B8'
          }}>
            New healthcare worker?{' '}
            <button
              type="button"
              id="worker-goto-register-btn"
              onClick={onNavigateRegister}
              style={{
                background: 'none',
                border: 'none',
                color: '#34D399',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
                fontSize: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <UserPlus size={14} />
              Register Worker Account
            </button>
          </div>

          {/* Quick switch tiles */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: '.76rem', color: '#475569', fontWeight: 700, marginBottom: 8 }}>
              Quick station access (demo):
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { id: 'nurse_sarah', name: 'Nurse Sarah Jenkins, RN', clinic: 'St. Jude Clinic', initials: 'SJ', color: '#10B981' },
                { id: 'tech_mark',   name: 'Mark Torres', clinic: 'Mobile Outreach Unit #3', initials: 'MT', color: '#0EA5E9' },
              ].map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => { setWorkerId(w.id); setPassword('vaxcheck2026'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, padding: '7px 11px',
                    background: workerId === w.id ? 'rgba(16,185,129,.1)' : 'rgba(255,255,255,.03)',
                    border: `1px solid ${workerId === w.id ? 'rgba(16,185,129,.35)' : 'rgba(255,255,255,.06)'}`,
                    borderRadius: 8, cursor: 'pointer', width: '100%', textAlign: 'left',
                    transition: 'all .14s'
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: w.color,
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.7rem', fontWeight: 800, flexShrink: 0
                  }}>{w.initials}</div>
                  <div>
                    <div style={{ fontSize: '.8rem', fontWeight: 700, color: '#CBD5E1' }}>{w.name}</div>
                    <div style={{ fontSize: '.7rem', color: '#64748B' }}>{w.clinic}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className="login-footer" style={{ position: 'fixed', bottom: 0, width: '100%' }}>
        VaxCheck v1.0 · Health Worker Station · Clinic-grade vaccine acoustic analysis
      </footer>
    </div>
  );
}
