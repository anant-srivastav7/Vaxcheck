import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, ArrowLeft, Eye, EyeOff, Building2,
  Mail, Phone, MapPin, Lock, User, AlertCircle, CheckCircle2,
  Activity, ArrowRight, UserCheck, Clock, Send, ExternalLink
} from 'lucide-react';
import { api } from '../api';
import { GoogleIcon } from './AdminRegisterPage';

/**
 * Healthcare Worker Registration Page
 * Collects name, mobile no, email, password, clinic (dropdown of registered clinics),
 * supervising admin (dropdown of active admins), and address.
 * On success: shows a "pending approval" screen instead of logging in.
 */
export default function WorkerRegisterPage({ onBack, onNavigateLogin, onRegisterSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    mobileNo: '',
    email: '',
    clinicId: '',
    adminId: '',
    address: '',
    password: '',
    confirmPassword: '',
  });

  const [clinics, setClinics] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loadingClinics, setLoadingClinics] = useState(true);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  // Holds the response data once registration request is submitted
  const [requestSubmitted, setRequestSubmitted] = useState(null);

  useEffect(() => {
    loadDropdownData();
  }, []);

  async function loadDropdownData() {
    setLoadingClinics(true);
    try {
      const [clinicsData, adminsData] = await Promise.all([
        api.getClinics().catch(() => []),
        api.getAdmins().catch(() => []),
      ]);

      const validClinics = Array.isArray(clinicsData) ? clinicsData : [];
      const validAdmins = Array.isArray(adminsData) ? adminsData : [];

      setClinics(validClinics);
      setAdmins(validAdmins);

      // Set default clinic if available
      if (validClinics.length > 0) {
        setFormData((prev) => ({ ...prev, clinicId: validClinics[0]._id }));
      }
      // Do not auto-select admin — worker must choose their supervising administrator
      setFormData((prev) => ({ ...prev, adminId: '' }));
    } catch (err) {
      console.warn('Could not load dropdown options:', err);
    } finally {
      setLoadingClinics(false);
    }
  }

  const emailTrimmed = formData.email.trim().toLowerCase();
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!formData.mobileNo.trim()) {
      setError('Please enter your mobile phone number.');
      return;
    }
    if (!isEmailValid) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!formData.clinicId) {
      setError('Please select the clinic you are serving from the dropdown.');
      return;
    }
    if (!formData.adminId) {
      setError('Please select the supervising administrator you will be working under.');
      return;
    }
    if (!formData.address.trim()) {
      setError('Please enter your facility or residential address.');
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
      const selectedClinic = clinics.find((c) => c._id === formData.clinicId);
      const selectedAdmin = admins.find((a) => a.id === formData.adminId);

      const res = await api.registerWorker({
        name: formData.name.trim(),
        mobileNo: formData.mobileNo.trim(),
        email: emailTrimmed,
        clinicId: formData.clinicId,
        clinicName: selectedClinic?.name || '',
        adminId: formData.adminId || null,
        adminName: selectedAdmin?.full_name || '',
        address: formData.address.trim(),
        password: formData.password,
      });

      // Backend returns 202 with pending_approval flag — show success screen
      if (res.pending_approval) {
        setRequestSubmitted(res);
      } else {
        // Fallback: older flow (shouldn't happen)
        setSuccessMsg('Registration request submitted!');
      }
    } catch (err) {
      setError(err.message || 'Worker registration failed. Please check your details.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignUp() {
    setError('');
    setGoogleLoading(true);

    try {
      let targetEmail = emailTrimmed;
      if (!targetEmail || !targetEmail.includes('@')) {
        const inputPrompt = window.prompt(
          'Enter your Google account email address for Health Worker access:',
          'worker.station@gmail.com'
        );
        if (!inputPrompt) {
          setGoogleLoading(false);
          return;
        }
        targetEmail = inputPrompt.trim().toLowerCase();
      }

      const res = await api.googleLogin({
        email: targetEmail,
        name: formData.name || targetEmail.split('@')[0].replace(/[._]/g, ' '),
        sub: `google_worker_${Date.now()}`,
        role: 'worker',
      });

      setSuccessMsg('Google verification successful! Initializing worker testing portal…');
      setTimeout(() => {
        onRegisterSuccess(res.user || res);
      }, 800);
    } catch (err) {
      setError(err.message || 'Google registration failed.');
    } finally {
      setGoogleLoading(false);
    }
  }

  // ── Pending Approval Screen ──────────────────────────────────────────────────
  if (requestSubmitted) {
    return (
      <div className="login-root">
        <div className="login-split-left" style={{ padding: '36px 48px' }}>
          <div className="login-branding">
            <div className="login-branding-logo">
              <div className="login-branding-logo-icon" style={{ background: 'linear-gradient(135deg, #10B981, #0EA5E9)' }}>
                <ShieldCheck size={28} />
              </div>
              <div className="login-branding-logo-text">
                <h1>VaxCheck</h1>
                <p>Registration Submitted</p>
              </div>
            </div>
            <h2 className="login-headline" style={{ fontSize: '2.2rem' }}>
              Request Sent to<br />
              <span style={{ color: '#34D399' }}>Your Administrator</span>
            </h2>
            <p className="login-tagline">
              Your registration request is now under review. Your administrator will verify your details and approve your account. You will receive an email notification once the decision is made.
            </p>
            <div className="login-features">
              <div className="login-feature">
                <div className="login-feature-icon" style={{ background: 'rgba(16,185,129,.18)', color: '#34D399' }}>
                  <Send size={17} />
                </div>
                <div className="login-feature-text">
                  <h4>Notification Dispatched</h4>
                  <p>A request email has been sent to {requestSubmitted.supervisor_name || 'your administrator'} ({requestSubmitted.supervisor_email || 'Facility Admin'}).</p>
                </div>
              </div>
              <div className="login-feature">
                <div className="login-feature-icon" style={{ background: 'rgba(251,191,36,.15)', color: '#FCD34D' }}>
                  <Clock size={17} />
                </div>
                <div className="login-feature-text">
                  <h4>Awaiting Admin Approval</h4>
                  <p>The administrator will review your credentials and approve your account.</p>
                </div>
              </div>
              <div className="login-feature">
                <div className="login-feature-icon" style={{ background: 'rgba(14,165,233,.15)', color: '#38BDF8' }}>
                  <Mail size={17} />
                </div>
                <div className="login-feature-text">
                  <h4>Confirmation Email</h4>
                  <p>You will receive a confirmation email at <strong>{requestSubmitted.worker_email}</strong> with your login link once approved.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="login-split-right" style={{ flex: '0 0 480px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 28px' }}>
          <div className="login-card" style={{ maxWidth: 420, width: '100%', padding: '40px 32px', textAlign: 'center' }}>
            {/* Success icon */}
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(14,165,233,0.2))',
              border: '2px solid rgba(52,211,153,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px',
              boxShadow: '0 0 32px rgba(16,185,129,0.25)'
            }}>
              <CheckCircle2 size={40} color="#34D399" />
            </div>

            <h3 style={{ color: '#F8FAFC', fontWeight: 800, fontSize: '1.4rem', margin: '0 0 10px' }}>
              Request Submitted!
            </h3>
            <p style={{ color: '#94A3B8', fontSize: '.9rem', lineHeight: 1.6, margin: '0 0 20px' }}>
              An email notification has been dispatched to administrator{' '}
              <span style={{ color: '#34D399', fontWeight: 700 }}>
                {requestSubmitted.supervisor_name || 'your administrator'}
              </span>
              {requestSubmitted.supervisor_email ? (
                <> (<strong>{requestSubmitted.supervisor_email}</strong>)</>
              ) : null}.
              <br /><br />
              Once approved, a confirmation email with your login link will be sent to{' '}
              <span style={{ color: '#38BDF8', fontWeight: 600 }}>{requestSubmitted.worker_email}</span>.
            </p>

            {/* Test / Dev preview link */}
            {requestSubmitted.email_preview_url && (
              <div style={{
                background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)',
                borderRadius: 10, padding: '10px 14px', marginBottom: 20, textAlign: 'center'
              }}>
                <a
                  href={requestSubmitted.email_preview_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    color: '#38BDF8', fontSize: '.84rem', fontWeight: 700, textDecoration: 'none'
                  }}
                >
                  <ExternalLink size={14} />
                  <span>Preview Email Sent to Admin ↗</span>
                </a>
              </div>
            )}

            {/* Info card */}
            <div style={{
              background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)',
              borderRadius: 12, padding: '14px 18px', marginBottom: 28, textAlign: 'left'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Clock size={15} color="#FCD34D" />
                <span style={{ color: '#FCD34D', fontWeight: 700, fontSize: '.85rem' }}>Pending Admin Approval</span>
              </div>
              <p style={{ color: '#94A3B8', fontSize: '.82rem', margin: 0, lineHeight: 1.5 }}>
                You will <strong style={{ color: '#F8FAFC' }}>not</strong> be able to log in until your administrator approves your account. This typically takes a few hours.
              </p>
            </div>

            {/* Clinic & Admin info */}
            <div style={{ textAlign: 'left', marginBottom: 28 }}>
              {requestSubmitted.clinic_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Building2 size={14} color="#10B981" />
                  <span style={{ color: '#94A3B8', fontSize: '.83rem' }}>Clinic: <strong style={{ color: '#F1F5F9' }}>{requestSubmitted.clinic_name}</strong></span>
                </div>
              )}
              {requestSubmitted.supervisor_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <UserCheck size={14} color="#A78BFA" />
                  <span style={{ color: '#94A3B8', fontSize: '.83rem' }}>Admin: <strong style={{ color: '#F1F5F9' }}>{requestSubmitted.supervisor_name}</strong></span>
                </div>
              )}
            </div>

            {/* Go to Sign In button */}
            <button
              type="button"
              onClick={onNavigateLogin}
              style={{
                width: '100%', padding: '13px',
                borderRadius: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'linear-gradient(135deg, #10B981, #0EA5E9)',
                color: '#fff', border: 'none',
                boxShadow: '0 4px 14px rgba(16,185,129,.35)',
                cursor: 'pointer', fontSize: '.95rem',
              }}
            >
              <span>Go to Worker Sign In</span>
              <ArrowRight size={17} />
            </button>

            <button
              type="button"
              onClick={onBack}
              style={{
                marginTop: 14, background: 'none', border: 'none',
                color: '#64748B', cursor: 'pointer', fontSize: '.85rem',
                textDecoration: 'underline'
              }}
            >
              Back to role selection
            </button>
          </div>
        </div>
      </div>
    );
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
            <div className="login-branding-logo-icon" style={{ background: 'linear-gradient(135deg, #10B981, #0EA5E9)' }}>
              <ShieldCheck size={28} />
            </div>
            <div className="login-branding-logo-text">
              <h1>VaxCheck</h1>
              <p>Worker Registration</p>
            </div>
          </div>

          <h2 className="login-headline" style={{ fontSize: '2.4rem' }}>
            Join Your Clinic's<br />
            <span style={{ color: '#34D399' }}>Testing Workforce</span>
          </h2>
          <p className="login-tagline">
            Register your health worker station profile. Operate solenoid acoustic hardware, log vaccine vial status, and protect immunization safety under your clinic administrator.
          </p>

          <div className="login-features">
            <div className="login-feature">
              <div className="login-feature-icon" style={{ background: 'rgba(16,185,129,.18)', color: '#34D399' }}>
                <Building2 size={17} />
              </div>
              <div className="login-feature-text">
                <h4>Admin-Provisioned Clinic Selection</h4>
                <p>Connect straight to clinics created and governed by facility administrators.</p>
              </div>
            </div>

            <div className="login-feature">
              <div className="login-feature-icon" style={{ background: 'rgba(14,165,233,.15)', color: '#38BDF8' }}>
                <UserCheck size={17} />
              </div>
              <div className="login-feature-text">
                <h4>Direct Administrative Oversight</h4>
                <p>Assign your profile under your supervising medical director or chief administrator.</p>
              </div>
            </div>

            <div className="login-feature">
              <div className="login-feature-icon" style={{ background: 'rgba(245,158,11,.15)', color: '#FCD34D' }}>
                <Activity size={17} />
              </div>
              <div className="login-feature-text">
                <h4>Hardware Solenoid Triggering</h4>
                <p>Full access to the ESP32 vial acoustic testing station and live result logging.</p>
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
              background: 'rgba(16,185,129,.2)', color: '#34D399', marginBottom: 12
            }}>
              <Activity size={24} />
            </div>
            <h3 className="login-card-title">Register Health Worker</h3>
            <p className="login-card-sub" style={{ marginBottom: 12 }}>
              Create your clinic testing station credentials.
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
            marginBottom: 20, color: '#64748B', fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.06em'
          }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.09)' }} />
            <span>or enter worker details</span>
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
                <User size={14} style={{ color: '#34D399' }} /> Full Name
              </label>
              <input
                type="text"
                name="name"
                className="form-input"
                placeholder="Nurse Jane Doe, RN"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            {/* Mobile Number & Email side-by-side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Mobile Number */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Phone size={14} style={{ color: '#38BDF8' }} /> Mobile No.
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

              {/* Email Address */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Mail size={14} style={{ color: '#FCD34D' }} /> Email
                </label>
                <input
                  type="email"
                  name="email"
                  className="form-input"
                  placeholder="jane.doe@clinic.org"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            {/* Clinic Dropdown (Populated with clinics registered by admin) */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Building2 size={14} style={{ color: '#10B981' }} /> Clinic / Hospital Name
                </span>
                <span style={{ fontSize: '.72rem', color: '#34D399', fontWeight: 600 }}>
                  Admin-Registered
                </span>
              </label>

              {loadingClinics ? (
                <div style={{ fontSize: '.84rem', color: '#94A3B8', padding: '8px 0' }}>Loading registered clinics…</div>
              ) : clinics.length === 0 ? (
                <div style={{ fontSize: '.82rem', color: '#FCA5A5', padding: '6px 0' }}>
                  No clinics found. Please contact your administrator.
                </div>
              ) : (
                <select
                  name="clinicId"
                  className="form-select"
                  value={formData.clinicId}
                  onChange={handleChange}
                  required
                  style={{ width: '100%', cursor: 'pointer' }}
                >
                  <option value="" disabled>Select your clinic / medical facility</option>
                  {clinics.map((clinic) => (
                    <option key={clinic._id} value={clinic._id}>
                      {clinic.name} {clinic.location ? `— (${clinic.location})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Supervising Admin Dropdown */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <UserCheck size={14} style={{ color: '#A78BFA' }} /> Working Under Which Admin
                </span>
                <span style={{ fontSize: '.72rem', color: '#A78BFA', fontWeight: 600 }}>
                  Facility Supervisor
                </span>
              </label>

              {admins.length === 0 ? (
                <div style={{ fontSize: '.82rem', color: '#94A3B8', padding: '6px 0' }}>
                  No specific administrator listed (Default Central Admin will oversee)
                </div>
              ) : (
                <select
                  name="adminId"
                  className="form-select"
                  value={formData.adminId}
                  onChange={handleChange}
                  required
                  style={{ width: '100%', cursor: 'pointer' }}
                >
                  <option value="">-- Select Supervising Administrator --</option>
                  {admins.map((adm) => (
                    <option key={adm.id} value={adm.id}>
                      {adm.full_name} {adm.email ? `(${adm.email})` : ''} {adm.clinic_name ? `— ${adm.clinic_name}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Facility / Residential Address */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={14} style={{ color: '#F87171' }} /> Facility / Station Address
              </label>
              <input
                type="text"
                name="address"
                className="form-input"
                placeholder="Station 2, Pediatric Cold-Chain Wing, New Delhi"
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
              className="btn btn-lg"
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
                background: 'linear-gradient(135deg, #10B981, #0EA5E9)',
                color: '#fff',
                border: 'none',
                boxShadow: '0 4px 14px rgba(16,185,129,.4)'
              }}
              disabled={loading || googleLoading}
            >
              <Send size={17} />
              <span>{loading ? 'Sending Request…' : 'Send Registration Request'}</span>
            </button>
          </form>

          {/* Switch to Login Link */}
          <div style={{
            marginTop: 20,
            textAlign: 'center',
            fontSize: '.85rem',
            color: '#94A3B8',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 16
          }}>
            Already have a worker account?{' '}
            <button
              type="button"
              onClick={onNavigateLogin}
              style={{
                background: 'none',
                border: 'none',
                color: '#34D399',
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
