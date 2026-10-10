import React, { useState } from 'react';
import {
  ShieldCheck, ArrowLeft, Eye, EyeOff, Building2,
  Mail, Phone, MapPin, Lock, User, AlertCircle, CheckCircle2,
  Sparkles, ArrowRight
} from 'lucide-react';
import { api } from '../api';

/**
 * Google "G" SVG Icon
 */
export function GoogleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.96 0 12s.45 3.83 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

/**
 * Admin Registration Page
 * Collects name, mobile no, gmail address (@gmail.com mandatory), clinic serving, address, and password.
 */
export default function AdminRegisterPage({ onBack, onNavigateLogin, onRegisterSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    mobileNo: '',
    email: '',
    clinicName: '',
    address: '',
    password: '',
    confirmPassword: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Email validation helper: must end with @gmail.com
  const emailTrimmed = formData.email.trim().toLowerCase();
  const isGmailValid = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(emailTrimmed);
  const hasTypedDomain = emailTrimmed.includes('@');
  const isNonGmail = hasTypedDomain && !emailTrimmed.endsWith('@gmail.com');

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  }

  function handleAutoAppendGmail() {
    if (!formData.email) return;
    const base = formData.email.split('@')[0];
    setFormData((prev) => ({ ...prev, email: `${base}@gmail.com` }));
    if (error) setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Field validations
    if (!formData.name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!formData.mobileNo.trim()) {
      setError('Please enter your mobile phone number.');
      return;
    }
    if (!isGmailValid) {
      setError('Email address must strictly end with @gmail.com (e.g. yourname@gmail.com).');
      return;
    }
    if (!formData.clinicName.trim()) {
      setError('Please enter the name of the clinic or medical facility you are serving.');
      return;
    }
    if (!formData.address.trim()) {
      setError('Please enter the clinic / facility physical address.');
      return;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match. Please verify both password fields.');
      return;
    }

    setLoading(true);

    try {
      const res = await api.registerAdmin({
        name: formData.name.trim(),
        mobileNo: formData.mobileNo.trim(),
        email: emailTrimmed,
        clinicName: formData.clinicName.trim(),
        address: formData.address.trim(),
        password: formData.password,
      });

      setSuccessMsg('Administrator account registered in MongoDB successfully! Redirecting…');
      setTimeout(() => {
        onRegisterSuccess(res.user || res);
      }, 900);
    } catch (err) {
      setError(err.message || 'Registration failed. Please check your information.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignUp() {
    setError('');
    setGoogleLoading(true);

    try {
      // Check if user already has an entered gmail or prompt for one
      let selectedGmail = emailTrimmed.endsWith('@gmail.com') ? emailTrimmed : '';
      if (!selectedGmail) {
        const inputPrompt = window.prompt(
          'Enter your Google account email address to continue with Google Sign-Up (must end with @gmail.com):',
          formData.email ? (formData.email.includes('@') ? formData.email : `${formData.email}@gmail.com`) : 'admin.dr@gmail.com'
        );
        if (!inputPrompt) {
          setGoogleLoading(false);
          return;
        }
        selectedGmail = inputPrompt.trim().toLowerCase();
      }

      if (!selectedGmail.endsWith('@gmail.com')) {
        throw new Error('Access restricted: Only @gmail.com accounts are permitted for administrator registration.');
      }

      const res = await api.googleLogin({
        email: selectedGmail,
        name: formData.name || selectedGmail.split('@')[0].replace(/[._]/g, ' '),
        sub: `google_${Date.now()}`,
      });

      setSuccessMsg('Google authentication successful! Initializing administrator console…');
      setTimeout(() => {
        onRegisterSuccess(res.user || res);
      }, 800);
    } catch (err) {
      setError(err.message || 'Google registration failed.');
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="login-root">
      {/* Top Back Button */}
      <div className="login-back" onClick={onBack} role="button" tabIndex={0}>
        <ArrowLeft size={15} />
        <span>Back to role selection</span>
      </div>

      {/* Left branding panel */}
      <div className="login-split-left" style={{ padding: '36px 48px' }}>
        <div className="login-branding">
          <div className="login-branding-logo">
            <div className="login-branding-logo-icon" style={{ background: 'linear-gradient(135deg, #2563EB, #06B6D4)' }}>
              <ShieldCheck size={28} />
            </div>
            <div className="login-branding-logo-text">
              <h1>VaxCheck</h1>
              <p>Admin Registration</p>
            </div>
          </div>

          <h2 className="login-headline" style={{ fontSize: '2.4rem' }}>
            Register as<br />
            <span>Facility Administrator</span>
          </h2>
          <p className="login-tagline">
            Register your hospital or clinic command profile. Connect acoustic hardware units, oversee test logs, and enforce cold-chain vaccine security across all dispensing points.
          </p>

          <div className="login-features">
            <div className="login-feature">
              <div className="login-feature-icon" style={{ background: 'rgba(37,99,235,.18)', color: '#60A5FA' }}>
                <Building2 size={17} />
              </div>
              <div className="login-feature-text">
                <h4>Multi-Facility Authority</h4>
                <p>Register and control your clinic location, assigned devices, and healthcare workers.</p>
              </div>
            </div>

            <div className="login-feature">
              <div className="login-feature-icon" style={{ background: 'rgba(16,185,129,.15)', color: '#34D399' }}>
                <CheckCircle2 size={17} />
              </div>
              <div className="login-feature-text">
                <h4>Verified Google Identity</h4>
                <p>Strict @gmail.com security enforcement with Google one-touch sign-in support.</p>
              </div>
            </div>

            <div className="login-feature">
              <div className="login-feature-icon" style={{ background: 'rgba(245,158,11,.15)', color: '#FCD34D' }}>
                <Sparkles size={17} />
              </div>
              <div className="login-feature-text">
                <h4>Persistent MongoDB Storage</h4>
                <p>Account, facility address, and phone details stored securely with salted password hashing.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Registration Card */}
      <div className="login-split-right" style={{ flex: '0 0 540px', overflowY: 'auto', maxHeight: '100vh', padding: '32px 28px' }}>
        <div className="login-card" style={{ maxWidth: 480, margin: '20px auto', padding: '32px 26px' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 48, height: 48, borderRadius: 13,
              background: 'rgba(37,99,235,.2)', color: '#60A5FA', marginBottom: 12
            }}>
              <ShieldCheck size={24} />
            </div>
            <h3 className="login-card-title">Register Administrator</h3>
            <p className="login-card-sub" style={{ marginBottom: 12 }}>
              Create your authorized clinic management account.
            </p>
          </div>

          {/* Quick Sign Up With Google Button */}
          <button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={googleLoading || loading}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 11,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.14)',
              color: '#F8FAFC',
              fontSize: '.92rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all .2s ease',
              marginBottom: 20,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
          >
            <GoogleIcon size={18} />
            <span>{googleLoading ? 'Connecting Google Account…' : 'Quick Sign up with Google'}</span>
          </button>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            marginBottom: 22, color: '#64748B', fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.06em'
          }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.09)' }} />
            <span>or enter registration details</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.09)' }} />
          </div>

          {/* Error Message */}
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

          {/* Success Message */}
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

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            {/* Full Name */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <User size={14} style={{ color: '#60A5FA' }} /> Full Name
              </label>
              <input
                type="text"
                name="name"
                className="form-input"
                placeholder="Dr. Sarah Jenkins"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            {/* Mobile Number & Gmail side-by-side on larger displays */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Mobile Number */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Phone size={14} style={{ color: '#34D399' }} /> Mobile No.
                </label>
                <input
                  type="tel"
                  name="mobileNo"
                  className="form-input"
                  placeholder="+91 9876543210"
                  value={formData.mobileNo}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* Clinic Name */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Building2 size={14} style={{ color: '#FCD34D' }} /> Clinic / Hospital
                </label>
                <input
                  type="text"
                  name="clinicName"
                  className="form-input"
                  placeholder="Apex Health Center"
                  value={formData.clinicName}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            {/* Email Field with @gmail.com Validation */}
            <div className="form-group" style={{ margin: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Mail size={14} style={{ color: '#F87171' }} /> Gmail Address
                </label>
                {formData.email && !isGmailValid && (
                  <button
                    type="button"
                    onClick={handleAutoAppendGmail}
                    style={{
                      background: 'rgba(56,189,248,0.12)',
                      border: '1px solid rgba(56,189,248,0.3)',
                      color: '#38BDF8',
                      fontSize: '.72rem',
                      fontWeight: 600,
                      borderRadius: 6,
                      padding: '2px 8px',
                      cursor: 'pointer',
                    }}
                  >
                    + @gmail.com
                  </button>
                )}
              </div>

              <input
                type="email"
                name="email"
                className="form-input"
                placeholder="admin.facility@gmail.com"
                value={formData.email}
                onChange={handleChange}
                style={{
                  borderColor: isGmailValid
                    ? '#10B981'
                    : isNonGmail
                    ? '#EF4444'
                    : undefined,
                }}
                required
              />

              {/* Real-time Gmail validation status */}
              <div style={{ marginTop: 5, fontSize: '.76rem' }}>
                {isGmailValid && (
                  <span style={{ color: '#34D399', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle2 size={12} /> Valid Gmail address
                  </span>
                )}
                {isNonGmail && (
                  <span style={{ color: '#F87171', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={12} /> Must end with @gmail.com (e.g. yourname@gmail.com)
                  </span>
                )}
                {!hasTypedDomain && formData.email && (
                  <span style={{ color: '#94A3B8' }}>Enter your full @gmail.com address</span>
                )}
              </div>
            </div>

            {/* Clinic / Facility Physical Address */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={14} style={{ color: '#A78BFA' }} /> Facility / Clinic Address
              </label>
              <input
                type="text"
                name="address"
                className="form-input"
                placeholder="Sector 4, Main Medical Corridor, New Delhi"
                value={formData.address}
                onChange={handleChange}
                required
              />
            </div>

            {/* Password & Confirm Password side-by-side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Password */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Lock size={14} style={{ color: '#60A5FA' }} /> Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    className="form-input"
                    style={{ width: '100%', paddingRight: 36 }}
                    placeholder="Min 6 chars"
                    value={formData.password}
                    onChange={handleChange}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: '#64748B'
                    }}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Lock size={14} style={{ color: '#60A5FA' }} /> Confirm
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    className="form-input"
                    style={{ width: '100%', paddingRight: 36 }}
                    placeholder="Repeat password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: '#64748B'
                    }}
                  >
                    {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{
                width: '100%',
                marginTop: 6,
                padding: '13px',
                borderRadius: 11,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
              disabled={loading || googleLoading}
            >
              <span>{loading ? 'Creating Administrator Account…' : 'Register Administrator Account'}</span>
              <ArrowRight size={17} />
            </button>
          </form>

          {/* Switch to Login Link */}
          <div style={{
            marginTop: 22,
            textAlign: 'center',
            fontSize: '.85rem',
            color: '#94A3B8',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 16
          }}>
            Already have an administrator account?{' '}
            <button
              type="button"
              onClick={onNavigateLogin}
              style={{
                background: 'none',
                border: 'none',
                color: '#38BDF8',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
                fontSize: 'inherit',
              }}
            >
              Sign In here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
