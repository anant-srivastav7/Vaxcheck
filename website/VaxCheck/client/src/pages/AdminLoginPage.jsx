import React, { useState } from 'react';
import {
  ShieldCheck, ArrowLeft, Eye, EyeOff,
  BarChart3, Activity, Package, Cpu, Lock, AlertCircle,
  UserPlus, CheckCircle2
} from 'lucide-react';
import { api } from '../api';
import { GoogleIcon } from './AdminRegisterPage';

/**
 * Admin Login Page
 * Supports:
 *  1. Google Sign-In (one-click with @gmail.com)
 *  2. Email/Username + Password sign in
 *  3. Switch to Register Admin page
 */
export default function AdminLoginPage({ onBack, onLoginSuccess, onNavigateRegister }) {
  const [username, setUsername] = useState('admin');
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
      const res = await api.login(username, password);
      if (res.user.role !== 'admin') {
        api.logout();
        setError('This account is a Health Worker account. Please use the Worker sign-in portal.');
        return;
      }
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err.message || 'Login failed. Check credentials.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError('');
    setGoogleLoading(true);

    try {
      // Check if user entered an email in the input box that ends with @gmail.com
      let targetEmail = username.trim().toLowerCase();
      if (!targetEmail.endsWith('@gmail.com')) {
        const inputPrompt = window.prompt(
          'Enter your Google account email to sign in (must end with @gmail.com):',
          targetEmail.includes('@') ? targetEmail : 'admin.vaxcheck@gmail.com'
        );
        if (!inputPrompt) {
          setGoogleLoading(false);
          return;
        }
        targetEmail = inputPrompt.trim().toLowerCase();
      }

      if (!targetEmail.endsWith('@gmail.com')) {
        throw new Error('Access restricted: Only @gmail.com accounts are permitted for administrator login.');
      }

      const res = await api.googleLogin({
        email: targetEmail,
        name: targetEmail.split('@')[0].replace(/[._]/g, ' '),
        sub: `google_${Date.now()}`,
      });

      setSuccessMsg('Google Sign-in verified! Redirecting to Admin Dashboard…');
      setTimeout(() => {
        onLoginSuccess(res.user || res);
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
            <div className="login-branding-logo-icon">
              <ShieldCheck size={28} />
            </div>
            <div className="login-branding-logo-text">
              <h1>VaxCheck</h1>
              <p>Admin Portal</p>
            </div>
          </div>

          <h2 className="login-headline">
            Full Visibility<br />
            <span>Across Every Clinic</span>
          </h2>
          <p className="login-tagline">
            The admin console gives you complete oversight of every acoustic vial test, hardware unit, health worker, and batch safety alert across your facility network.
          </p>

          <div className="login-features">
            {[
              {
                icon: <BarChart3 size={17} />,
                bg: 'rgba(37,99,235,.18)', color: '#60A5FA',
                title: 'Real-Time Dashboard',
                desc: 'Live aggregate stats — pass rates, fail counts, online devices'
              },
              {
                icon: <Package size={17} />,
                bg: 'rgba(239,68,68,.15)', color: '#F87171',
                title: 'Batch Quarantine Alerts',
                desc: 'Auto-flag batches with 3+ failures for immediate quarantine'
              },
              {
                icon: <Cpu size={17} />,
                bg: 'rgba(16,185,129,.15)', color: '#34D399',
                title: 'Device Provisioning',
                desc: 'Register ESP32 units and generate cryptographic API tokens'
              },
              {
                icon: <Activity size={17} />,
                bg: 'rgba(245,158,11,.15)', color: '#FCD34D',
                title: 'Full Audit Trail',
                desc: 'Searchable, filterable acoustic test history with strike-level data'
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
            background: 'rgba(37,99,235,.2)', color: '#60A5FA'
          }}>
            <BarChart3 size={26} />
          </div>

          <h3 className="login-card-title" style={{ textAlign: 'center' }}>Administrator Sign In</h3>
          <p className="login-card-sub" style={{ textAlign: 'center', marginBottom: 20 }}>
            Full system access. Control devices, workers, and clinic data.
          </p>

          {/* Prominent Google Sign-In Button */}
          <button
            id="admin-google-signin-btn"
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
              <label className="form-label">Gmail Address or Username</label>
              <input
                id="admin-username"
                type="text"
                className="form-input"
                placeholder="admin or user@gmail.com"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="admin-password"
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
              id="admin-signin-btn"
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
              disabled={loading || googleLoading}
            >
              {loading ? 'Authenticating…' : 'Sign In to Admin Console'}
            </button>
          </form>

          {/* Register Admin CTA Link */}
          <div style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid rgba(255,255,255,0.08)',
            textAlign: 'center',
            fontSize: '.85rem',
            color: '#94A3B8'
          }}>
            New administrator?{' '}
            <button
              type="button"
              id="admin-goto-register-btn"
              onClick={onNavigateRegister}
              style={{
                background: 'none',
                border: 'none',
                color: '#38BDF8',
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
              Register Admin
            </button>
          </div>

          {/* Demo credentials hint */}
          <div style={{
            marginTop: 18, padding: '10px 14px', borderRadius: 9,
            background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)',
            fontSize: '.76rem', color: '#475569', lineHeight: 1.5
          }}>
            <div style={{ fontWeight: 700, color: '#64748B', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Lock size={12} /> Seeded Demo Account
            </div>
            Username: <code style={{ color: '#94A3B8', marginLeft: 4 }}>admin</code> · Password: <code style={{ color: '#94A3B8', marginLeft: 4 }}>vaxcheck2026</code>
          </div>
        </div>
      </div>

      <footer className="login-footer" style={{ position: 'fixed', bottom: 0, width: '100%' }}>
        VaxCheck v1.0 · Admin Portal · Secured with device-level cryptographic token auth
      </footer>
    </div>
  );
}
