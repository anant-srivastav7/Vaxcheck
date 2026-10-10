import React, { useState, useEffect } from 'react';
import {
  BarChart3, ShieldCheck, AlertOctagon, AlertTriangle, Cpu, Package,
  Clock, Activity, Plus, LogOut, Terminal, ExternalLink, Users,
  RefreshCw, ChevronRight, Battery, Radio
} from 'lucide-react';
import DashboardPage from './DashboardPage';
import HistoryPage from './HistoryPage';
import BatchesPage from './BatchesPage';
import DevicesPage from './DevicesPage';
import SimulatorPage from './SimulatorPage';
import GuidedTestPage from './GuidedTestPage';
import AdminProfilePage from './AdminProfilePage';
import WorkersPage from './WorkersPage';
import TestDetailModal from '../components/TestDetailModal';
import DeviceRegisterModal from '../components/DeviceRegisterModal';
import { api } from '../api';

/**
 * Admin Application Shell
 * Full sidebar with all admin capabilities.
 * Shown after admin login.
 */
export default function AdminApp({ user, onLogout }) {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [selectedTestId, setSelectedTestId] = useState(null);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [initialBatchForView, setInitialBatchForView] = useState(null);
  const [concerningBatchCount, setConcerningBatchCount] = useState(0);
  const [supervisedWorkerCount, setSupervisedWorkerCount] = useState(0);

  useEffect(() => {
    checkAlerts();
    const i = setInterval(checkAlerts, 15000);
    return () => clearInterval(i);
  }, []);

  async function checkAlerts() {
    try {
      const [b, w] = await Promise.all([
        api.getBatches().catch(() => []),
        api.getWorkers().catch(() => [])
      ]);
      setConcerningBatchCount((b || []).filter(x => x.is_concerning).length);

      const workerList = Array.isArray(w) ? w : (w?.workers || []);
      const adminName = user?.full_name || user?.name;
      const adminId = user?.id || user?._id;
      const myWorkers = workerList.filter(item => {
        if (item.is_supervised_by_me) return true;
        if (adminId && item.supervisor_admin_id && item.supervisor_admin_id.toString() === adminId.toString()) return true;
        if (adminName && item.supervisor_admin_name && item.supervisor_admin_name.toLowerCase().trim() === adminName.toLowerCase().trim()) return true;
        if (!item.supervisor_admin_name && user?.clinic_id && item.clinic_id && item.clinic_id.toString() === user.clinic_id.toString()) return true;
        return false;
      });
      setSupervisedWorkerCount(myWorkers.length);
    } catch { /* ignore */ }
  }

  function navTo(page) { setCurrentPage(page); }

  function handleNavigateToBatch(batchId) {
    setInitialBatchForView(batchId);
    setCurrentPage('batches');
  }

  const pageTitle = {
    dashboard:  'Admin Dashboard',
    workers:    'Registered Healthcare Workers (Under Supervision)',
    test:       'Guided Acoustic Vial Test',
    history:    'Acoustic Test Audit Logs',
    batches:    'Vaccine Lot & Batch Surveillance',
    devices:    'ESP32 Device Management',
    simulator:  'Hardware Simulator & Protocol Inspector',
    profile:    'Administrator Profile & Facility Details',
  }[currentPage] || 'Admin Console';

  return (
    <div className="app-layout">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <ShieldCheck size={22} />
          </div>
          <div className="brand-info">
            <h1>VaxCheck</h1>
            <span className="brand-badge">Admin Console</span>
          </div>
        </div>

        <div className="nav-section-title">Overview</div>
        <ul className="nav-menu">
          <li className={`nav-item ${currentPage === 'dashboard' ? 'active' : ''}`} onClick={() => navTo('dashboard')}>
            <BarChart3 size={17} /><span>Admin Dashboard</span>
          </li>
          <li className={`nav-item ${currentPage === 'workers' ? 'active' : ''}`} onClick={() => navTo('workers')}>
            <Users size={17} /><span>Supervised Workers</span>
            {supervisedWorkerCount > 0 && <span className="nav-badge" style={{ background: '#0EA5E9' }}>{supervisedWorkerCount}</span>}
          </li>
          <li className={`nav-item ${currentPage === 'test' ? 'active' : ''}`} onClick={() => navTo('test')}>
            <Activity size={17} /><span>Test a Vial</span>
          </li>
          <li
            className={`nav-item ${currentPage === 'batches' ? 'active' : ''}`}
            onClick={() => { setInitialBatchForView(null); navTo('batches'); }}
          >
            <Package size={17} />
            <span>Vaccine Batches</span>
            {concerningBatchCount > 0 && <span className="nav-badge">{concerningBatchCount}</span>}
          </li>
          <li className={`nav-item ${currentPage === 'history' ? 'active' : ''}`} onClick={() => navTo('history')}>
            <Clock size={17} /><span>Full Test Audit Trail</span>
          </li>
        </ul>

        <div className="nav-section-title">Hardware</div>
        <ul className="nav-menu">
          <li className={`nav-item ${currentPage === 'devices' ? 'active' : ''}`} onClick={() => navTo('devices')}>
            <Cpu size={17} /><span>ESP32 Devices</span>
          </li>
          <li className={`nav-item ${currentPage === 'simulator' ? 'active' : ''}`} onClick={() => navTo('simulator')}>
            <Terminal size={17} /><span>Hardware Simulator</span>
          </li>
          <li className="nav-item" onClick={() => window.open('http://localhost:5000/api/docs', '_blank')}>
            <ExternalLink size={17} /><span>OpenAPI Spec</span>
          </li>
        </ul>

        {/* Admin footer card */}
        <div className="sidebar-footer">
          <div style={{ marginBottom: 8 }}>
            <button
              className="btn btn-secondary"
              style={{ width: '100%', fontSize: '.82rem', justifyContent: 'center' }}
              onClick={() => setIsRegisterModalOpen(true)}
            >
              <Plus size={14} /><span>Register Device</span>
            </button>
          </div>
          <div
            className={`user-card ${currentPage === 'profile' ? 'active' : ''}`}
            onClick={() => navTo('profile')}
            style={{
              cursor: 'pointer',
              border: currentPage === 'profile' ? '1px solid rgba(56,189,248,0.5)' : undefined,
              background: currentPage === 'profile' ? 'rgba(37,99,235,0.18)' : undefined,
            }}
            title="Click to view Administrator Profile"
          >
            <div className={`user-avatar admin`}>
              {((user.full_name || user.name || 'AD').substring(0, 2)).toUpperCase()}
            </div>
            <div className="user-details">
              <div className="user-name">{user.full_name || user.name || 'Administrator'}</div>
              <div className="user-role" style={{ color: '#38BDF8', fontWeight: 600 }}>
                Administrator · View Profile
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
            <p>{user.clinic_name || user.clinicName || 'All Clinics'} · Admin Session</p>
          </div>
          <div className="topbar-actions">
            {currentPage !== 'history' && (
              <button className="btn btn-secondary" onClick={() => navTo('history')}>
                <Activity size={15} /><span>View All Tests</span>
              </button>
            )}
            <button className="btn btn-primary" onClick={() => setIsRegisterModalOpen(true)}>
              <Plus size={16} /><span>Register Unit</span>
            </button>
          </div>
        </header>

        <main style={{ flex: 1, overflowY: 'auto' }}>
          {currentPage === 'dashboard' && (
            <DashboardPage
              user={user}
              onStartTest={() => navTo('test')}
              onSelectTest={id => setSelectedTestId(id)}
              onSelectBatch={handleNavigateToBatch}
              onNavigateToWorkers={() => navTo('workers')}
            />
          )}
          {currentPage === 'workers' && (
            <WorkersPage
              user={user}
              onSelectTest={id => setSelectedTestId(id)}
              onStartTest={() => navTo('test')}
            />
          )}
          {currentPage === 'profile' && (
            <AdminProfilePage
              user={user}
              onLogout={onLogout}
              onBackToDashboard={() => navTo('dashboard')}
            />
          )}
          {currentPage === 'test' && (
            <GuidedTestPage
              currentUser={user}
              onNavigateToBatch={handleNavigateToBatch}
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
          {currentPage === 'devices' && (
            <DevicesPage onOpenRegisterModal={() => setIsRegisterModalOpen(true)} />
          )}
          {currentPage === 'simulator' && <SimulatorPage />}
        </main>
      </div>

      {/* Modals */}
      <TestDetailModal testId={selectedTestId} onClose={() => setSelectedTestId(null)} />
      <DeviceRegisterModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onDeviceCreated={checkAlerts}
      />
    </div>
  );
}
