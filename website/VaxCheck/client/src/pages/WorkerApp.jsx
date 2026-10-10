import React, { useState } from 'react';
import {
  ShieldCheck, Activity, Clock, Package, LogOut, ChevronRight, AlertTriangle
} from 'lucide-react';
import GuidedTestPage from './GuidedTestPage';
import HistoryPage from './HistoryPage';
import BatchesPage from './BatchesPage';
import WorkerProfilePage from './WorkerProfilePage';
import TestDetailModal from '../components/TestDetailModal';
import { api } from '../api';

/**
 * Worker Application Shell
 * Focused, low-friction sidebar with only what a health worker needs:
 * - Test a vial (primary action)
 * - View today's history
 * - Check batch status
 * - Worker Station Profile
 */
export default function WorkerApp({ user, onLogout }) {
  const [currentPage, setCurrentPage] = useState('test');
  const [selectedTestId, setSelectedTestId] = useState(null);
  const [initialBatchForView, setInitialBatchForView] = useState(null);

  function handleNavigateToBatch(batchId) {
    setInitialBatchForView(batchId);
    setCurrentPage('batches');
  }

  const pageTitle = {
    test:    'Vaccine Vial Acoustic Test',
    history: 'My Recent Tests',
    batches: 'Vaccine Batch Safety',
    profile: 'Healthcare Worker Station Profile',
  }[currentPage] || 'Worker Station';

  return (
    <div className="app-layout">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon" style={{ background: 'linear-gradient(135deg, #10B981, #0EA5E9)' }}>
            <ShieldCheck size={22} />
          </div>
          <div className="brand-info">
            <h1>VaxCheck</h1>
            <span className="brand-badge" style={{ background: 'rgba(16,185,129,.15)', color: '#34D399' }}>
              Health Worker
            </span>
          </div>
        </div>

        <div className="nav-section-title">Testing Station</div>
        <ul className="nav-menu">
          <li className={`nav-item ${currentPage === 'test' ? 'active' : ''}`} onClick={() => setCurrentPage('test')}>
            <Activity size={17} />
            <span>Test a Vial</span>
          </li>
          <li className={`nav-item ${currentPage === 'history' ? 'active' : ''}`} onClick={() => setCurrentPage('history')}>
            <Clock size={17} />
            <span>Test History</span>
          </li>
          <li
            className={`nav-item ${currentPage === 'batches' ? 'active' : ''}`}
            onClick={() => { setInitialBatchForView(null); setCurrentPage('batches'); }}
          >
            <Package size={17} />
            <span>Batch Safety</span>
          </li>
        </ul>

        {/* Quick help card */}
        <div style={{
          margin: '16px 4px', padding: '14px',
          background: 'rgba(16,185,129,.07)', border: '1px solid rgba(16,185,129,.2)',
          borderRadius: 12
        }}>
          <div style={{ fontSize: '.76rem', fontWeight: 700, color: '#34D399', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            How to Test a Vial
          </div>
          {['Scan or enter vial batch barcode', 'Select your ESP32 testing device', 'Press TRIGGER or the hardware button', 'Read instant PASS / FAIL result'].map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6, fontSize: '.78rem', color: '#64748B' }}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%', background: 'rgba(16,185,129,.25)',
                color: '#34D399', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.68rem', fontWeight: 800, flexShrink: 0, marginTop: 1
              }}>{i + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>

        {/* Worker footer card */}
        <div className="sidebar-footer">
          <div
            className={`user-card ${currentPage === 'profile' ? 'active' : ''}`}
            onClick={() => setCurrentPage('profile')}
            style={{
              cursor: 'pointer',
              border: currentPage === 'profile' ? '1px solid rgba(16,185,129,0.5)' : undefined,
              background: currentPage === 'profile' ? 'rgba(16,185,129,0.15)' : undefined,
            }}
            title="Click to view Healthcare Worker Profile"
          >
            <div className="user-avatar worker">
              {((user.full_name || user.name || 'HW').substring(0, 2)).toUpperCase()}
            </div>
            <div className="user-details">
              <div className="user-name">{user.full_name || user.name || 'Healthcare Worker'}</div>
              <div className="user-role" style={{ color: '#34D399', fontWeight: 600 }}>
                {user.clinic_name || 'Clinic Worker'} · View Profile
              </div>
            </div>
            <ChevronRight size={15} color="#94A3B8" />
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="main-wrapper">
        <header className="topbar">
          <div className="topbar-title">
            <h2>{pageTitle}</h2>
            <p>{user.clinic_name || 'Your Clinic'} · Signed in as {user.full_name}</p>
          </div>
          <div className="topbar-actions">
            {currentPage !== 'test' && (
              <button className="btn btn-primary" onClick={() => setCurrentPage('test')}>
                <Activity size={16} /><span>New Vial Test</span>
              </button>
            )}
          </div>
        </header>

        <main style={{ flex: 1, overflowY: 'auto' }}>
          {currentPage === 'test' && (
            <GuidedTestPage
              currentUser={user}
              onNavigateToBatch={handleNavigateToBatch}
            />
          )}
          {currentPage === 'profile' && (
            <WorkerProfilePage
              user={user}
              onLogout={onLogout}
              onBackToStation={() => setCurrentPage('test')}
            />
          )}
          {currentPage === 'history' && (
            <HistoryPage onSelectTest={id => setSelectedTestId(id)} />
          )}
          {currentPage === 'batches' && (
            <BatchesPage
              initialBatchId={initialBatchForView}
              onSelectTest={id => setSelectedTestId(id)}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <TestDetailModal testId={selectedTestId} onClose={() => setSelectedTestId(null)} />
    </div>
  );
}
