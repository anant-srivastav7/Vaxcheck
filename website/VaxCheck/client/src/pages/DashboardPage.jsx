import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, AlertOctagon, AlertTriangle, Cpu, Play, ArrowRight,
  Activity, Clock, ChevronRight, CheckCircle, RefreshCw, Users,
  UserCheck, UserPlus, Phone, Mail, MapPin, Building2, Copy, Check,
  Search, XCircle, CheckCircle2
} from 'lucide-react';
import { api } from '../api';

export default function DashboardPage({
  user,
  onStartTest,
  onSelectTest,
  onSelectBatch,
  onNavigateToWorkers
}) {
  const [stats, setStats] = useState(null);
  const [recentTests, setRecentTests] = useState([]);
  const [concerningBatches, setConcerningBatches] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [pendingWorkers, setPendingWorkers] = useState([]);
  const [approvingId, setApprovingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvalMsg, setApprovalMsg] = useState('');
  const [workerFilter, setWorkerFilter] = useState('under_me'); // 'under_me' | 'all'
  const [workerSearch, setWorkerSearch] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [loading, setLoading] = useState(true);

  const adminName = user?.full_name || user?.name || 'Administrator';
  const adminId = user?.id || user?._id;

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 12000);
    return () => clearInterval(interval);
  }, []);

  async function loadDashboardData() {
    try {
      const [statsData, testsData, batchesData, workersData] = await Promise.all([
        api.getStatsOverview().catch(() => null),
        api.getTests({ limit: 8 }).catch(() => ({ tests: [] })),
        api.getBatches().catch(() => []),
        api.getWorkers().catch(() => [])
      ]);
      setStats(statsData);
      setRecentTests(testsData.tests || []);
      setConcerningBatches((batchesData || []).filter(b => b.is_concerning));
      setWorkers(Array.isArray(workersData) ? workersData : (workersData?.workers || []));

      // Load pending approval requests
      const pendingData = await api.getPendingWorkers().catch(() => []);
      setPendingWorkers(Array.isArray(pendingData) ? pendingData : []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }

  // Active approved workers only (pending requests are shown in Pending Worker Registrations below)
  const activeWorkers = workers.filter((w) => !w.account_status || w.account_status === 'active');

  // Filter active workers reporting to this admin
  const supervisedWorkers = activeWorkers.filter((w) => {
    if (w.is_supervised_by_me) return true;
    if (adminId && w.supervisor_admin_id && w.supervisor_admin_id.toString() === adminId.toString()) return true;
    if (adminName && w.supervisor_admin_name && w.supervisor_admin_name.toLowerCase().trim() === adminName.toLowerCase().trim()) return true;
    if (!w.supervisor_admin_name && user?.clinic_id && w.clinic_id && w.clinic_id.toString() === user.clinic_id.toString()) return true;
    return false;
  });

  const displayedWorkers = (workerFilter === 'under_me' ? supervisedWorkers : activeWorkers).filter((w) => {
    if (!workerSearch.trim()) return true;
    const q = workerSearch.toLowerCase().trim();
    return (
      (w.full_name && w.full_name.toLowerCase().includes(q)) ||
      (w.username && w.username.toLowerCase().includes(q)) ||
      (w.email && w.email.toLowerCase().includes(q)) ||
      (w.mobile_no && w.mobile_no.toLowerCase().includes(q)) ||
      (w.clinic_name && w.clinic_name.toLowerCase().includes(q))
    );
  });

  function handleCopyInvite() {
    const regUrl = `${window.location.origin}/#worker-register`;
    const text = `VaxCheck Worker Registration Guide:\n1. Go to: ${regUrl}\n2. Enter your Name, Mobile, Email & Address\n3. Select Supervising Administrator: "${adminName}"\n4. Select Clinic: "${user?.clinic_name || user?.clinicName || 'Central Clinic'}"`;
    navigator.clipboard?.writeText(text);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2500);
  }

  async function handleApprove(workerId, workerName) {
    setApprovingId(workerId);
    setApprovalMsg('');
    try {
      await api.approveWorker(workerId);
      setApprovalMsg(`✅ ${workerName}'s account has been approved. They will receive an email.`);
      setPendingWorkers((prev) => prev.filter((w) => w.id !== workerId));
      // Refresh workers list
      const workersData = await api.getWorkers().catch(() => []);
      setWorkers(Array.isArray(workersData) ? workersData : (workersData?.workers || []));
    } catch (err) {
      setApprovalMsg(`❌ Failed to approve: ${err.message}`);
    } finally {
      setApprovingId(null);
    }
  }

  async function handleReject(workerId, workerName) {
    const reason = window.prompt(
      `Reject ${workerName}'s registration request?\n\nOptional: Enter a reason to include in the rejection email (leave blank for generic message):`,
      ''
    );
    // null means user clicked Cancel
    if (reason === null) return;

    setRejectingId(workerId);
    setApprovalMsg('');
    try {
      await api.rejectWorker(workerId, reason.trim());
      setApprovalMsg(`Registration request from ${workerName} has been rejected.`);
      setPendingWorkers((prev) => prev.filter((w) => w.id !== workerId));
    } catch (err) {
      setApprovalMsg(`❌ Failed to reject: ${err.message}`);
    } finally {
      setRejectingId(null);
    }
  }

  return (
    <div className="page-content">
      {/* Top Welcome & Quick Action */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '20px',
        marginBottom: '28px'
      }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
            Vaccine Safety Station Dashboard
          </h2>
          <p style={{ color: '#64748B', fontSize: '0.95rem' }}>
            Acoustic freeze damage verification • {user?.clinic_name || user?.clinicName || 'St. Jude Health Center'} • Supervised by <strong>{adminName}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={handleCopyInvite}
            title="Copy onboarding guidance for new workers"
          >
            {copiedInvite ? <Check size={16} color="#10B981" /> : <Copy size={16} />}
            <span>{copiedInvite ? 'Invite Copied!' : 'Worker Invite Guide'}</span>
          </button>

          <button
            className="btn btn-primary btn-large"
            style={{ boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)' }}
            onClick={onStartTest}
          >
            <Play size={20} fill="white" />
            <span>START NEW VIAL TEST</span>
          </button>
        </div>
      </div>

      {/* Actionable Batch Safety Warning if detected */}
      {concerningBatches.length > 0 && (
        <div className="alert-banner critical">
          <AlertOctagon size={28} />
          <div style={{ flex: 1 }}>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 800 }}>
              CRITICAL COLD-CHAIN ALERT: {concerningBatches.length} Vaccine Batch(es) Flagged
            </h4>
            <p style={{ fontSize: '0.92rem', marginBottom: '8px' }}>
              Multiple vials have failed acoustic freeze-check. Immediately quarantine affected inventory to prevent administration.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {concerningBatches.map(b => (
                <button
                  key={b.id}
                  className="btn btn-danger"
                  style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                  onClick={() => onSelectBatch(b.id)}
                >
                  <span>Quarantine Batch {b.id} ({b.fail_count} Fails / {b.total_tests} Tests)</span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="stats-grid" style={{ marginBottom: '26px' }}>
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Total Vials Tested</span>
            <div className="stat-icon" style={{ background: '#EFF6FF', color: '#2563EB' }}>
              <Activity size={20} />
            </div>
          </div>
          <div className="stat-value">{stats?.total_tests || 0}</div>
          <div className="stat-sub">Across all registered devices</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Pass Rate (Safe)</span>
            <div className="stat-icon" style={{ background: '#ECFDF5', color: '#10B981' }}>
              <ShieldCheck size={20} />
            </div>
          </div>
          <div className="stat-value" style={{ color: '#059669' }}>
            {stats?.pass_rate || 0}%
          </div>
          <div className="stat-sub">{stats?.pass_count || 0} confirmed intact vials</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Freeze Damage Detected</span>
            <div className="stat-icon" style={{ background: '#FEF2F2', color: '#EF4444' }}>
              <AlertOctagon size={20} />
            </div>
          </div>
          <div className="stat-value" style={{ color: '#DC2626' }}>
            {stats?.fail_count || 0}
          </div>
          <div className="stat-sub">Quarantined / discarded</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">ESP32 Hardware Online</span>
            <div className="stat-icon" style={{ background: '#F0FDF4', color: '#16A34A' }}>
              <Cpu size={20} />
            </div>
          </div>
          <div className="stat-value">
            {stats?.online_devices || 0} / {stats?.total_devices || 0}
          </div>
          <div className="stat-sub">Ready for acoustic triggers</div>
        </div>

        {/* 5th Stat Card: Supervised Workers */}
        <div
          className="stat-card"
          style={{ cursor: 'pointer', border: '1px solid rgba(37,99,235,0.2)' }}
          onClick={() => {
            const el = document.getElementById('supervised-workers-section');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
          title="Click to view Supervised Workers section"
        >
          <div className="stat-header">
            <span className="stat-label">Supervised Workers</span>
            <div className="stat-icon" style={{ background: '#EFF6FF', color: '#2563EB' }}>
              <Users size={20} />
            </div>
          </div>
          <div className="stat-value" style={{ color: '#2563EB' }}>
            {supervisedWorkers.length}
          </div>
          <div className="stat-sub">
            {supervisedWorkers.filter(w => w.is_active !== false).length} active under {adminName}
          </div>
        </div>
      </div>

      {/* ── Registered Workers Section ── */}
      <div id="supervised-workers-section" className="card" style={{ marginBottom: '28px' }}>
        <div className="card-header" style={{ flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(37,99,235,0.12)', color: '#2563EB',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Users size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="card-title">Registered Workers Working Under You</span>
                <span style={{
                  padding: '2px 8px', borderRadius: 12,
                  fontSize: '.75rem', fontWeight: 800,
                  background: '#EFF6FF', color: '#2563EB', border: '1px solid rgba(37,99,235,0.2)'
                }}>
                  {supervisedWorkers.length} Assigned
                </span>
              </div>
              <div style={{ fontSize: '.78rem', color: '#64748B', marginTop: 2 }}>
                Healthcare personnel operating testing stations under <strong>{adminName}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Filter Toggle */}
            <div style={{ display: 'flex', background: '#F1F5F9', padding: 3, borderRadius: 8, gap: 4 }}>
              <button
                type="button"
                onClick={() => setWorkerFilter('under_me')}
                style={{
                  border: 'none',
                  background: workerFilter === 'under_me' ? '#fff' : 'transparent',
                  color: workerFilter === 'under_me' ? '#0F172A' : '#64748B',
                  fontWeight: 700,
                  fontSize: '.78rem',
                  padding: '5px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  boxShadow: workerFilter === 'under_me' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 5
                }}
              >
                <UserCheck size={13} />
                <span>Assigned to You ({supervisedWorkers.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setWorkerFilter('all')}
                style={{
                  border: 'none',
                  background: workerFilter === 'all' ? '#fff' : 'transparent',
                  color: workerFilter === 'all' ? '#0F172A' : '#64748B',
                  fontWeight: 700,
                  fontSize: '.78rem',
                  padding: '5px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  boxShadow: workerFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 5
                }}
              >
                <Building2 size={13} />
                <span>All Network ({activeWorkers.length})</span>
              </button>
            </div>

            {/* Quick Search */}
            <div style={{ position: 'relative', width: 180 }}>
              <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: 28, paddingRight: 8, height: 32, fontSize: '.8rem' }}
                placeholder="Search staff…"
                value={workerSearch}
                onChange={(e) => setWorkerSearch(e.target.value)}
              />
            </div>

            <button
              className="btn btn-secondary"
              style={{ padding: '6px 10px', fontSize: '0.8rem' }}
              onClick={loadDashboardData}
              title="Refresh workers"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        <div className="data-table-container">
          {displayedWorkers.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: '#EFF6FF', color: '#2563EB',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px'
              }}>
                <Users size={24} />
              </div>
              <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>
                {workerFilter === 'under_me'
                  ? 'No Healthcare Workers Registered Under Your Supervision Yet'
                  : 'No Workers Found'}
              </h4>
              <p style={{ maxWidth: 480, margin: '0 auto 16px', color: '#64748B', fontSize: '.88rem', lineHeight: 1.5 }}>
                {workerFilter === 'under_me' ? (
                  <>
                    When staff register on the Worker Registration page, they select{' '}
                    <strong style={{ color: '#0F172A' }}>{adminName}</strong> in the{' '}
                    <em>Supervising Administrator</em> dropdown to appear under your management.
                  </>
                ) : (
                  'No healthcare workers match your search query.'
                )}
              </p>
              {workerFilter === 'under_me' && (
                <button
                  className="btn btn-primary"
                  style={{ fontSize: '.82rem', padding: '7px 14px' }}
                  onClick={handleCopyInvite}
                >
                  <Copy size={14} />
                  <span>Copy Registration Instructions</span>
                </button>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Contact Info</th>
                  <th>Clinic Facility</th>
                  <th>Supervision</th>
                  <th>Acoustic Tests</th>
                  <th>Registered</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {displayedWorkers.map((w) => {
                  const initials = (w.full_name || w.username || 'HW')
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((x) => x[0])
                    .join('')
                    .toUpperCase();

                  const isSupervised =
                    w.is_supervised_by_me ||
                    (adminId && w.supervisor_admin_id && w.supervisor_admin_id.toString() === adminId.toString()) ||
                    (adminName && w.supervisor_admin_name && w.supervisor_admin_name.toLowerCase().trim() === adminName.toLowerCase().trim());

                  return (
                    <tr key={w.id || w.username}>
                      {/* Worker Profile */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ position: 'relative' }}>
                            <div style={{
                              width: 34, height: 34, borderRadius: '50%',
                              background: 'linear-gradient(135deg, #10B981, #0EA5E9)',
                              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 800, fontSize: '.78rem'
                            }}>
                              {initials}
                            </div>
                            <span style={{
                              position: 'absolute', bottom: 0, right: 0,
                              width: 8, height: 8, borderRadius: '50%',
                              background: w.is_active !== false ? '#10B981' : '#94A3B8',
                              border: '1.5px solid #fff'
                            }} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '.88rem' }}>
                              {w.full_name || w.username}
                            </div>
                            <div style={{ fontSize: '.74rem', color: '#64748B' }}>
                              @{w.username}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contact Details */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {w.email ? (
                            <a
                              href={`mailto:${w.email}`}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.8rem', color: '#2563EB', textDecoration: 'none' }}
                            >
                              <Mail size={12} />
                              <span>{w.email}</span>
                            </a>
                          ) : (
                            <span style={{ fontSize: '.78rem', color: '#94A3B8' }}>No email</span>
                          )}
                          {w.mobile_no && (
                            <a
                              href={`tel:${w.mobile_no}`}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.76rem', color: '#475569', textDecoration: 'none' }}
                            >
                              <Phone size={11} />
                              <span>{w.mobile_no}</span>
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Facility */}
                      <td>
                        <div style={{ fontWeight: 600, color: '#1E293B', fontSize: '.84rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Building2 size={13} color="#0EA5E9" />
                          <span>{w.clinic_name || 'Central Health Facility'}</span>
                        </div>
                        {w.address && (
                          <div style={{ fontSize: '.74rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                            <MapPin size={10} />
                            <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {w.address}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Supervision */}
                      <td>
                        {isSupervised ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 8px', borderRadius: 6,
                            background: 'rgba(16,185,129,0.12)', color: '#059669',
                            fontSize: '.75rem', fontWeight: 700
                          }}>
                            <ShieldCheck size={12} />
                            <span>Reports to You</span>
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 8px', borderRadius: 6,
                            background: 'rgba(100,116,139,0.08)', color: '#475569',
                            fontSize: '.75rem', fontWeight: 600
                          }}>
                            <span>{w.supervisor_admin_name ? `Reports to ${w.supervisor_admin_name}` : 'Unassigned'}</span>
                          </span>
                        )}
                      </td>

                      {/* Acoustic Tests */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{
                            fontWeight: 800, fontSize: '.88rem',
                            color: (w.tests_count || 0) > 0 ? '#2563EB' : '#94A3B8'
                          }}>
                            {w.tests_count || 0}
                          </span>
                          <span style={{ fontSize: '.74rem', color: '#64748B' }}>vials</span>
                        </div>
                        {w.last_tested_at && (
                          <div style={{ fontSize: '.7rem', color: '#94A3B8' }}>
                            Last: {new Date(w.last_tested_at).toLocaleDateString()}
                          </div>
                        )}
                      </td>

                      {/* Joined Date */}
                      <td>
                        <span style={{ fontSize: '.8rem', color: '#475569' }}>
                          {w.created_at
                            ? new Date(w.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                            : 'Active'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '.76rem' }}
                          onClick={() => onNavigateToWorkers ? onNavigateToWorkers() : null}
                          title="View in Personnel Directory"
                        >
                          <span>Manage</span>
                          <ChevronRight size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Pending Worker Approval Requests ── */}
      {pendingWorkers.length > 0 && (
        <div className="card" style={{ border: '1px solid rgba(251,191,36,0.35)', background: 'rgba(251,191,36,0.04)' }}>
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                background: 'rgba(251,191,36,0.2)', color: '#F59E0B',
                borderRadius: 8, width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Clock size={18} />
              </div>
              <span className="card-title">Pending Worker Registrations</span>
              <span style={{
                background: '#EF4444', color: '#fff', borderRadius: 999,
                padding: '2px 9px', fontSize: '.78rem', fontWeight: 700
              }}>{pendingWorkers.length}</span>
            </div>
            <span style={{ color: '#94A3B8', fontSize: '.82rem' }}>
              Review and approve or reject these registration requests
            </span>
          </div>

          {approvalMsg && (
            <div style={{
              margin: '0 0 12px', padding: '10px 16px', borderRadius: 8,
              background: approvalMsg.startsWith('❌') ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
              border: `1px solid ${approvalMsg.startsWith('❌') ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
              color: approvalMsg.startsWith('❌') ? '#FCA5A5' : '#6EE7B7',
              fontSize: '.85rem',
            }}>
              {approvalMsg}
            </div>
          )}

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Clinic</th>
                  <th>Contact</th>
                  <th>Requested</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingWorkers.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0F172A' }}>{w.full_name}</div>
                      <div style={{ fontSize: '.78rem', color: '#64748B' }}>{w.email}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: '.85rem', color: '#475569' }}>{w.clinic_name || '—'}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: '.82rem', color: '#64748B' }}>{w.mobile_no || '—'}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: '.8rem', color: '#475569' }}>
                        {w.requested_at
                          ? new Date(w.requested_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <button
                          className="btn btn-primary"
                          style={{ padding: '5px 14px', fontSize: '.8rem', background: 'linear-gradient(135deg,#10B981,#059669)', boxShadow: 'none' }}
                          disabled={approvingId === w.id || rejectingId === w.id}
                          onClick={() => handleApprove(w.id, w.full_name)}
                          title="Approve this worker's registration"
                        >
                          {approvingId === w.id ? (
                            <span>Approving…</span>
                          ) : (
                            <><CheckCircle2 size={13} /><span>Approve</span></>
                          )}
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '5px 12px', fontSize: '.8rem', color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)' }}
                          disabled={approvingId === w.id || rejectingId === w.id}
                          onClick={() => handleReject(w.id, w.full_name)}
                          title="Reject this registration request"
                        >
                          {rejectingId === w.id ? (
                            <span>Rejecting…</span>
                          ) : (
                            <><XCircle size={13} /><span>Reject</span></>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Recent Tests Table ── */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={20} color="#2563EB" />
            <span className="card-title">Recent Acoustic Test Activity</span>
          </div>
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.82rem' }} onClick={loadDashboardData}>
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Verdict</th>
                <th>Vial Batch</th>
                <th>Confidence</th>
                <th>Hardware Device</th>
                <th>Tester</th>
                <th>Time</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recentTests.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                    No test records found. Start a test above!
                  </td>
                </tr>
              ) : (
                recentTests.map((t) => (
                  <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => onSelectTest(t.id)}>
                    <td>
                      <span className={`badge-verdict ${t.classification_result.toLowerCase()}`}>
                        {t.classification_result === 'PASS' && <ShieldCheck size={14} />}
                        {t.classification_result === 'FAIL' && <AlertOctagon size={14} />}
                        {t.classification_result === 'INCONCLUSIVE' && <AlertTriangle size={14} />}
                        <span>{t.classification_result}</span>
                      </span>
                    </td>
                    <td>
                      <strong>{t.vial_batch_id}</strong>
                      <div style={{ fontSize: '0.78rem', color: '#64748B' }}>{t.vaccine_name}</div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700 }}>
                        {(t.confidence_score * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td>{t.device_name}</td>
                    <td>{t.worker_name || 'Clinic Worker'}</td>
                    <td>{new Date(t.tested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>
                      <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
                        <span>Inspect</span>
                        <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
