import React from 'react';
import {
  ShieldCheck, ArrowRight, Activity, Package, BarChart3,
  Cpu, Zap, Lock, Radio
} from 'lucide-react';

/**
 * Landing Page — Role Selection
 * Shows two cards: ADMIN and WORKER.
 * Matches the architecture diagram: Landing → ADMIN | WORKER selector.
 */
export default function LandingPage({ onSelectRole }) {
  return (
    <div className="landing-root">
      {/* Top Header */}
      <header className="landing-header">
        <div className="landing-logo">
          <div className="landing-logo-icon">
            <ShieldCheck size={26} />
          </div>
          <div className="landing-logo-text">
            <h1>VaxCheck</h1>
            <p>Acoustic Vial Verification System</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 8px #10B981', display: 'inline-block' }} />
          <span style={{ fontSize: '.8rem', color: '#64748B', fontWeight: 600 }}>API Live · Port 5000</span>
        </div>
      </header>

      {/* Hero Section */}
      <main className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-eyebrow">
            <Radio size={13} />
            <span>ESP32 · TinyML · XGBoost Acoustic Analysis</span>
          </div>

          <h2 className="landing-title">
            Vaccine Cold-Chain<br />
            <span>Integrity Verification</span>
          </h2>

          <p className="landing-sub">
            VaxCheck uses solenoid-driven acoustic impulse testing and on-device machine learning to instantly detect freeze-damaged vaccine vials — protecting patients and supply chains across clinic networks.
          </p>

          {/* Role Selection Cards */}
          <div className="role-cards">
            {/* ADMIN Card */}
            <div
              className="role-card admin"
              role="button"
              tabIndex={0}
              onClick={() => onSelectRole('admin')}
              onKeyDown={e => e.key === 'Enter' && onSelectRole('admin')}
            >
              <div className="role-card-icon">
                <BarChart3 size={28} />
              </div>
              <div>
                <div className="role-card-title">Administrator</div>
                <div className="role-card-desc">
                  Manage the clinic network, register hardware units, monitor all test results, batch analytics, device inventory, and worker accounts.
                </div>
              </div>
              <div className="role-card-cta">
                <span>Sign in as Admin</span>
                <ArrowRight size={16} />
              </div>
            </div>

            {/* WORKER Card */}
            <div
              className="role-card worker"
              role="button"
              tabIndex={0}
              onClick={() => onSelectRole('worker')}
              onKeyDown={e => e.key === 'Enter' && onSelectRole('worker')}
            >
              <div className="role-card-icon">
                <Activity size={28} />
              </div>
              <div>
                <div className="role-card-title">Health Worker</div>
                <div className="role-card-desc">
                  Test individual vaccine vials using the ESP32 acoustic device. View instant PASS / FAIL / INCONCLUSIVE results and your clinic's recent activity.
                </div>
              </div>
              <div className="role-card-cta">
                <span>Sign in as Health Worker</span>
                <ArrowRight size={16} />
              </div>
            </div>
          </div>

          {/* Tech Pills */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 10,
            justifyContent: 'center', marginTop: 40
          }}>
            {[
              { icon: <Zap size={12} />,       label: 'Solenoid Impulse Testing' },
              { icon: <Cpu size={12} />,        label: 'ESP32 + I2S Microphone' },
              { icon: <ShieldCheck size={12} />, label: 'XGBoost TinyML Analysis' },
              { icon: <Lock size={12} />,       label: 'Cryptographic Device Auth' },
              { icon: <Package size={12} />,    label: 'Batch Failure Surveillance' },
            ].map(item => (
              <span key={item.label} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                color: '#94A3B8', padding: '5px 13px', borderRadius: 999,
                fontSize: '.76rem', fontWeight: 600
              }}>
                {item.icon} {item.label}
              </span>
            ))}
          </div>
        </div>
      </main>

      <footer className="login-footer">
        VaxCheck v1.0 · Built for WHO cold-chain protocol compliance · ESP32 Acoustic Analysis Platform
      </footer>
    </div>
  );
}
