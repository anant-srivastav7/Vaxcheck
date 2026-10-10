import React, { useState, useEffect } from 'react';
import {
  User, Mail, Phone, MapPin, Building2, ShieldCheck,
  LogOut, ArrowLeft, Calendar, Key, CheckCircle, Clock,
  Cpu, Activity, RefreshCw
} from 'lucide-react';
import { api } from '../api';

/**
 * Admin Profile Page
 * Displays full administrator details and offers a sign out action.
 */
export default function AdminProfilePage({ user: initialUser, onLogout, onBackToDashboard }) {
  const [user, setUser] = useState(initialUser || {});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadLatestProfile();
  }, []);

  async function loadLatestProfile() {
    setLoading(true);
    try {
      const latest = await api.getMe();
      if (latest) {
        setUser(latest);
        // update local storage cache as well
        localStorage.setItem('vax_user_profile', JSON.stringify(latest));
      }
    } catch (err) {
      console.warn('Could not refresh profile from server, using cached profile:', err);
    } finally {
      setLoading(false);
    }
  }

  const fullName = user.full_name || user.name || 'Administrator';
  const email = user.email || (user.username && user.username.includes('@') ? user.username : 'Not provided');
  const mobileNo = user.mobile_no || user.mobileNo || 'Not provided';
  const clinicName = user.clinic_name || user.clinicName || 'Central Health Facility';
  const address = user.address || user.clinic_location || 'Not provided';
  const username = user.username || 'admin';
  const role = user.role ? user.role.toUpperCase() : 'ADMINISTRATOR';
  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'AD';

  const joinedDate = user.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Active Member';

  return (
    <div className="page-content" style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Top Breadcrumb & Return Action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <button
          className="btn btn-secondary"
          onClick={onBackToDashboard}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <ArrowLeft size={16} />
          <span>Back to Dashboard</span>
        </button>

        <button
          className="btn btn-secondary"
          onClick={loadLatestProfile}
          disabled={loading}
          title="Refresh Profile Data"
          style={{ padding: '8px 12px' }}
        >
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {/* Main Profile Header Card */}
      <div
        className="card"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          padding: '30px 34px',
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
          color: '#fff',
          borderRadius: 20,
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
          marginBottom: 26,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div
            style={{
              width: 78,
              height: 78,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #2563EB, #38BDF8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.8rem',
              fontWeight: 800,
              color: '#fff',
              boxShadow: '0 6px 20px rgba(37,99,235,0.4)',
              border: '3px solid rgba(255,255,255,0.2)',
            }}
          >
            {initials}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
                {fullName}
              </h2>
              <span
                style={{
                  background: 'rgba(56,189,248,0.16)',
                  color: '#38BDF8',
                  border: '1px solid rgba(56,189,248,0.3)',
                  padding: '4px 10px',
                  borderRadius: 20,
                  fontSize: '.74rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <ShieldCheck size={13} />
                {role}
              </span>
            </div>

            <p style={{ color: '#94A3B8', fontSize: '.92rem', margin: 0 }}>
              System Owner & Facility Oversight Authority
            </p>
          </div>
        </div>

        {/* Header Sign Out Action */}
        <button
          className="btn"
          onClick={onLogout}
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            color: '#F87171',
            padding: '12px 22px',
            borderRadius: 12,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#EF4444';
            e.currentTarget.style.color = '#FFFFFF';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
            e.currentTarget.style.color = '#F87171';
          }}
        >
          <LogOut size={17} />
          <span>Log Out</span>
        </button>
      </div>

      {/* Details Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 26 }}>
        {/* Personal & Account Info */}
        <div className="card" style={{ padding: 26, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(37,99,235,0.1)', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Account Information</h3>
              <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: 0 }}>Admin identity & credentials</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Full Name */}
            <div>
              <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
                Full Name
              </span>
              <div style={{ fontSize: '.95rem', fontWeight: 600, color: 'var(--text-main)', marginTop: 2 }}>
                {fullName}
              </div>
            </div>

            {/* Username */}
            <div>
              <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
                System Username
              </span>
              <div style={{ fontSize: '.95rem', fontWeight: 600, color: 'var(--text-main)', marginTop: 2 }}>
                <code style={{ background: 'var(--surface-alt)', padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', color: 'var(--primary)' }}>
                  {username}
                </code>
              </div>
            </div>

            {/* Gmail */}
            <div>
              <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
                Gmail Address
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Mail size={15} color="#475569" />
                <span style={{ fontSize: '.95rem', fontWeight: 600, color: 'var(--text-main)' }}>{email}</span>
                {email.endsWith('@gmail.com') && (
                  <span style={{ background: '#ECFDF5', color: '#065F46', fontSize: '.72rem', padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>
                    Verified Gmail
                  </span>
                )}
              </div>
            </div>

            {/* Mobile Number */}
            <div>
              <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
                Mobile Number
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Phone size={15} color="#475569" />
                <span style={{ fontSize: '.95rem', fontWeight: 600, color: 'var(--text-main)' }}>{mobileNo}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Clinic & Facility Info */}
        <div className="card" style={{ padding: 26, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(16,185,129,0.1)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Serving Facility</h3>
              <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: 0 }}>Assigned hospital / clinic</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Clinic Name */}
            <div>
              <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
                Clinic / Hospital Name
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Building2 size={15} color="#10B981" />
                <span style={{ fontSize: '.95rem', fontWeight: 700, color: 'var(--text-main)' }}>{clinicName}</span>
              </div>
            </div>

            {/* Facility Address */}
            <div>
              <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
                Facility Physical Address
              </span>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 4 }}>
                <MapPin size={15} color="#64748B" style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontSize: '.95rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{address}</span>
              </div>
            </div>

            {/* Account Registration Date */}
            <div>
              <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
                Registered Since
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Calendar size={15} color="#64748B" />
                <span style={{ fontSize: '.95rem', color: 'var(--text-secondary)' }}>{joinedDate}</span>
              </div>
            </div>

            {/* Storage status */}
            <div>
              <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
                Database Status
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                <span style={{ fontSize: '.88rem', fontWeight: 600, color: '#065F46' }}>
                  Persisted in MongoDB Atlas
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Permissions & Oversight Summary */}
      <div className="card" style={{ padding: 26, borderRadius: 16, marginBottom: 26 }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 14 }}>
          Administrator Privileges & Station Scope
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {[
            {
              icon: <CheckCircle size={16} color="#10B981" />,
              title: 'Batch Quarantine Control',
              desc: 'Authority to flag vaccine lots with 3+ freeze failures.',
            },
            {
              icon: <Cpu size={16} color="#2563EB" />,
              title: 'ESP32 Device Provisioning',
              desc: 'Generate hardware tokens and register acoustic units.',
            },
            {
              icon: <Activity size={16} color="#8B5CF6" />,
              title: 'Audit Trail Inspection',
              desc: 'Review waveform harmonics and ML classifier logs.',
            },
          ].map((item, idx) => (
            <div
              key={idx}
              style={{
                background: 'var(--surface-alt)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <div style={{ marginTop: 2 }}>{item.icon}</div>
              <div>
                <h4 style={{ fontSize: '.88rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                  {item.title}
                </h4>
                <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: '3px 0 0' }}>
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Actions Card */}
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          padding: '20px 24px',
          borderRadius: 16,
          background: 'var(--surface-alt)',
          border: '1px solid var(--border)',
        }}
      >
        <div>
          <h4 style={{ fontSize: '.95rem', fontWeight: 700, margin: 0 }}>End Administrator Session</h4>
          <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', margin: 0 }}>
            Securely revoke this active console token and return to the main landing screen.
          </p>
        </div>

        <button
          className="btn btn-danger"
          onClick={onLogout}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px' }}
        >
          <LogOut size={16} />
          <span>Log Out</span>
        </button>
      </div>
    </div>
  );
}
