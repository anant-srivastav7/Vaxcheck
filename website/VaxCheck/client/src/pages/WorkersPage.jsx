import React, { useState, useEffect } from 'react';
import {
  Users, UserCheck, UserPlus, Phone, Mail, MapPin, Building2,
  Calendar, Search, ShieldCheck, Activity, RefreshCw, ChevronRight,
  ExternalLink, CheckCircle2, Clock, AlertCircle, Copy, Check, XCircle
} from 'lucide-react';
import { api } from '../api';

/**
 * WorkersPage
 * Dedicated interface for viewing and managing healthcare workers
 * working under the logged-in administrator or across facilities.
 */
export default function WorkersPage({ user, onSelectTest, onStartTest }) {
  const [workers, setWorkers] = useState([]);
  const [pendingWorkers, setPendingWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('tab') === 'pending' ? 'pending' : 'active';
    } catch {
      return 'active';
    }
  }); // 'active' | 'pending'
  const [filterScope, setFilterScope] = useState('under_me'); // 'under_me' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedWorkerForModal, setSelectedWorkerForModal] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [approvalMsg, setApprovalMsg] = useState('');

  const adminName = user?.full_name || user?.name || 'Administrator';
  const adminId = user?.id || user?._id;

  useEffect(() => {
    loadWorkers();
  }, []);

  async function loadWorkers() {
    setLoading(true);
    setError('');
    try {
      const [data, pendingData] = await Promise.all([
        api.getWorkers(),
        api.getPendingWorkers().catch(() => []),
      ]);
      const list = Array.isArray(data) ? data : (data?.workers || []);
      setWorkers(list);
      setPendingWorkers(Array.isArray(pendingData) ? pendingData : []);
    } catch (err) {
      console.error('Failed to load workers:', err);
      setError(err.message || 'Could not load registered workers.');
    } finally {
      setLoading(false);
    }
  }

  // Active approved workers only (pending workers are managed in the Pending Approval tab)
  const activeWorkers = workers.filter((w) => !w.account_status || w.account_status === 'active');

  // Determine which workers are supervised by this admin
  const supervisedWorkers = activeWorkers.filter((w) => {
    if (w.is_supervised_by_me) return true;
    if (adminId && w.supervisor_admin_id && w.supervisor_admin_id.toString() === adminId.toString()) return true;
    if (adminName && w.supervisor_admin_name && w.supervisor_admin_name.toLowerCase().trim() === adminName.toLowerCase().trim()) return true;
    // Fallback: if supervisor is unset but worker is at same clinic
    if (!w.supervisor_admin_name && user?.clinic_id && w.clinic_id && w.clinic_id.toString() === user.clinic_id.toString()) return true;
    return false;
  });

  const displayedList = (filterScope === 'under_me' ? supervisedWorkers : activeWorkers).filter((w) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (w.full_name && w.full_name.toLowerCase().includes(q)) ||
      (w.username && w.username.toLowerCase().includes(q)) ||
      (w.email && w.email.toLowerCase().includes(q)) ||
      (w.mobile_no && w.mobile_no.toLowerCase().includes(q)) ||
      (w.clinic_name && w.clinic_name.toLowerCase().includes(q)) ||
      (w.address && w.address.toLowerCase().includes(q))
    );
  });

  const activeCount = displayedList.filter((w) => w.is_active !== false).length;
  const totalTestsConducted = displayedList.reduce((acc, w) => acc + (w.tests_count || 0), 0);

  function handleCopyInvite() {
    const regUrl = `${window.location.origin}/#worker-register`;
    const text = `VaxCheck Worker Registration:\n1. Open ${regUrl}\n2. Enter your details\n3. Select Supervising Admin: "${adminName}"\n4. Select Clinic: "${user?.clinic_name || 'Central Clinic'}"`;
    navigator.clipboard?.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  }

  async function handleApprove(workerId, workerName) {
    setApprovingId(workerId);
    setApprovalMsg('');
    try {
      const res = await api.approveWorker(workerId);
      setApprovalMsg(
        <span>
          ✅ <strong>{workerName}</strong>'s account approved.
          {res?.email_preview_url ? (
            <a
              href={res.email_preview_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginLeft: 10, color: '#38BDF8', fontWeight: 700, textDecoration: 'underline' }}
            >
              Preview Worker Confirmation Email ↗
            </a>
          ) : (
            ' Confirmation email sent.'
          )}
        </span>
      );
      setPendingWorkers((prev) => prev.filter((w) => w.id !== workerId));
      // Refresh active workers list
      const data = await api.getWorkers().catch(() => []);
      setWorkers(Array.isArray(data) ? data : (data?.workers || []));
    } catch (err) {
      setApprovalMsg(`❌ Failed to approve: ${err.message}`);
    } finally {
      setApprovingId(null);
    }
  }

  async function handleReject(workerId, workerName) {
    const reason = window.prompt(
      `Reject ${workerName}'s registration request?\n\nOptional reason (included in rejection email):`,
      ''
    );
    if (reason === null) return;
    setRejectingId(workerId);
    setApprovalMsg('');
    try {
      const res = await api.rejectWorker(workerId, reason.trim());
      setApprovalMsg(
        <span>
          Registration request from <strong>{workerName}</strong> rejected.
          {res?.email_preview_url ? (
            <a
              href={res.email_preview_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginLeft: 10, color: '#38BDF8', fontWeight: 700, textDecoration: 'underline' }}
            >
              Preview Worker Rejection Email ↗
            </a>
          ) : null}
        </span>
      );
      setPendingWorkers((prev) => prev.filter((w) => w.id !== workerId));
    } catch (err) {
      setApprovalMsg(`❌ Failed to reject: ${err.message}`);
    } finally {
      setRejectingId(null);
    }
  }

  return (
    <div className="page-content">
      {/* Top Header */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '20px',
        marginBottom: '24px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'rgba(37,99,235,0.15)', color: '#2563EB',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Users size={20} />
            </div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>
              Registered Healthcare Workers
            </h2>
          </div>
          <p style={{ color: '#64748B', fontSize: '0.92rem' }}>
            Personnel reporting to <strong>{adminName}</strong> ({user?.clinic_name || 'Central Facility'})
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={loadWorkers}
            disabled={loading}
            title="Refresh Worker Roster"
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCopyInvite}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {copiedLink ? <Check size={16} color="#4ADE80" /> : <Copy size={16} />}
            <span>{copiedLink ? 'Instructions Copied!' : 'Copy Worker Invite'}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Supervised Workers</span>
            <div className="stat-icon" style={{ background: '#EFF6FF', color: '#2563EB' }}>
              <Users size={18} />
            </div>
          </div>
          <div className="stat-value">{supervisedWorkers.length}</div>
          <div className="stat-sub">Reporting directly to your account</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Active & On Duty</span>
            <div className="stat-icon" style={{ background: '#ECFDF5', color: '#10B981' }}>
              <UserCheck size={18} />
            </div>
          </div>
          <div className="stat-value" style={{ color: '#059669' }}>{activeCount}</div>
          <div className="stat-sub">Authorized for testing stations</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Tests by Team</span>
            <div className="stat-icon" style={{ background: '#F5F3FF', color: '#8B5CF6' }}>
              <Activity size={18} />
            </div>
          </div>
          <div className="stat-value" style={{ color: '#7C3AED' }}>{totalTestsConducted}</div>
          <div className="stat-sub">Acoustic vials verified by staff</div>
        </div>

        {/* Pending Approvals KPI */}
        <div
          className="stat-card"
          style={{ cursor: pendingWorkers.length > 0 ? 'pointer' : 'default', border: pendingWorkers.length > 0 ? '1px solid rgba(251,191,36,0.4)' : undefined }}
          onClick={() => pendingWorkers.length > 0 && setActiveTab('pending')}
          title={pendingWorkers.length > 0 ? 'Click to review pending requests' : undefined}
        >
          <div className="stat-header">
            <span className="stat-label">Pending Requests</span>
            <div className="stat-icon" style={{ background: pendingWorkers.length > 0 ? '#FFFBEB' : '#F8FAFC', color: pendingWorkers.length > 0 ? '#F59E0B' : '#94A3B8' }}>
              <Clock size={18} />
            </div>
          </div>
          <div className="stat-value" style={{ color: pendingWorkers.length > 0 ? '#D97706' : '#94A3B8' }}>{pendingWorkers.length}</div>
          <div className="stat-sub">{pendingWorkers.length > 0 ? 'Click to review & approve' : 'No pending approvals'}</div>
        </div>
      </div>

      {/* Tab Bar: Active Workers | Pending Requests */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        <button
          type="button"
          className={`btn ${activeTab === 'active' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '8px 18px', fontSize: '.88rem', borderRadius: 9 }}
          onClick={() => setActiveTab('active')}
        >
          <UserCheck size={15} />
          <span>Active Workers</span>
          <span style={{
            marginLeft: 6, padding: '2px 7px', borderRadius: 10, fontSize: '.74rem',
            background: activeTab === 'active' ? 'rgba(255,255,255,0.25)' : '#E2E8F0',
            color: activeTab === 'active' ? '#fff' : '#334155'
          }}>{workers.length}</span>
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '8px 18px', fontSize: '.88rem', borderRadius: 9, position: 'relative' }}
          onClick={() => setActiveTab('pending')}
        >
          <Clock size={15} />
          <span>Pending Approval</span>
          {pendingWorkers.length > 0 && (
            <span style={{
              marginLeft: 6, padding: '2px 7px', borderRadius: 10, fontSize: '.74rem',
              background: activeTab === 'pending' ? 'rgba(255,255,255,0.25)' : '#EF4444',
              color: '#fff', fontWeight: 700
            }}>{pendingWorkers.length}</span>
          )}
        </button>
      </div>

      {/* Pending Requests Panel */}
      {activeTab === 'pending' && (
        <div className="card" style={{ marginBottom: 24, border: '1px solid rgba(251,191,36,0.3)' }}>
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} color="#F59E0B" />
              <span className="card-title">Pending Registration Requests</span>
              {pendingWorkers.length > 0 && (
                <span style={{ background: '#EF4444', color: '#fff', borderRadius: 999, padding: '2px 9px', fontSize: '.78rem', fontWeight: 700 }}>
                  {pendingWorkers.length}
                </span>
              )}
            </div>
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
          {pendingWorkers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
              <CheckCircle2 size={36} color="#10B981" style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0F172A', marginBottom: 6 }}>All Clear!</div>
              <div style={{ fontSize: '.88rem' }}>No pending registration requests. All workers are approved.</div>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Worker</th>
                    <th>Clinic</th>
                    <th>Mobile</th>
                    <th>Address</th>
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
                      <td><span style={{ fontSize: '.85rem' }}>{w.clinic_name || '—'}</span></td>
                      <td><span style={{ fontSize: '.82rem', color: '#64748B' }}>{w.mobile_no || '—'}</span></td>
                      <td><span style={{ fontSize: '.8rem', color: '#64748B' }}>{w.address ? w.address.slice(0, 30) + (w.address.length > 30 ? '…' : '') : '—'}</span></td>
                      <td>
                        <span style={{ fontSize: '.8rem', color: '#475569' }}>
                          {w.requested_at ? new Date(w.requested_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                          <button
                            className="btn btn-primary"
                            style={{ padding: '5px 14px', fontSize: '.8rem', background: 'linear-gradient(135deg,#10B981,#059669)', boxShadow: 'none' }}
                            disabled={approvingId === w.id || rejectingId === w.id}
                            onClick={() => handleApprove(w.id, w.full_name)}
                          >
                            {approvingId === w.id ? <span>Approving…</span> : <><CheckCircle2 size={13} /><span>Approve</span></>}
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '5px 12px', fontSize: '.8rem', color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)' }}
                            disabled={approvingId === w.id || rejectingId === w.id}
                            onClick={() => handleReject(w.id, w.full_name)}
                          >
                            {rejectingId === w.id ? <span>Rejecting…</span> : <><XCircle size={13} /><span>Reject</span></>}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Filter and Search Bar */}
      {activeTab === 'active' && (
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{
          padding: '16px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          borderBottom: '1px solid var(--border)'
        }}>
          {/* Scope Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className={`btn ${filterScope === 'under_me' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '7px 14px', fontSize: '.86rem', borderRadius: 8 }}
              onClick={() => setFilterScope('under_me')}
            >
              <UserCheck size={15} />
              <span>Assigned to You</span>
              <span style={{
                marginLeft: 6,
                padding: '2px 7px',
                borderRadius: 10,
                fontSize: '.74rem',
                background: filterScope === 'under_me' ? 'rgba(255,255,255,0.25)' : '#E2E8F0',
                color: filterScope === 'under_me' ? '#fff' : '#334155'
              }}>
                {supervisedWorkers.length}
              </span>
            </button>

            <button
              type="button"
              className={`btn ${filterScope === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '7px 14px', fontSize: '.86rem', borderRadius: 8 }}
              onClick={() => setFilterScope('all')}
            >
              <Building2 size={15} />
              <span>All Network Workers</span>
              <span style={{
                marginLeft: 6,
                padding: '2px 7px',
                borderRadius: 10,
                fontSize: '.74rem',
                background: filterScope === 'all' ? 'rgba(255,255,255,0.25)' : '#E2E8F0',
                color: filterScope === 'all' ? '#fff' : '#334155'
              }}>
                {workers.length}
              </span>
            </button>
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', minWidth: 260, flex: 1, maxWidth: 360 }}>
            <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: 36, paddingRight: 12, height: 38, fontSize: '.88rem' }}
              placeholder="Search by name, email, clinic…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Worker Table / List */}
        <div className="data-table-container">
          {loading ? (
            <div style={{ padding: '50px 20px', textAlign: 'center', color: '#64748B' }}>
              <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
              <div>Loading registered healthcare workers…</div>
            </div>
          ) : displayedList.length === 0 ? (
            <div style={{ padding: '60px 24px', textAlign: 'center' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: '#EFF6FF', color: '#2563EB',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <Users size={32} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>
                {filterScope === 'under_me'
                  ? 'No Workers Registered Under Your Supervision Yet'
                  : 'No Healthcare Workers Found'}
              </h3>
              <p style={{ maxWidth: 520, margin: '0 auto 20px', color: '#64748B', fontSize: '.92rem', lineHeight: 1.6 }}>
                {filterScope === 'under_me' ? (
                  <>
                    When healthcare personnel register on the Worker Registration portal, they should choose{' '}
                    <strong style={{ color: '#0F172A' }}>{adminName}</strong> in the{' '}
                    <em>Supervising Administrator</em> dropdown. They will immediately appear on your dashboard.
                  </>
                ) : (
                  'No matching worker records found for your search query.'
                )}
              </p>
              {filterScope === 'under_me' && (
                <div style={{ display: 'inline-flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button className="btn btn-primary" onClick={handleCopyInvite}>
                    <Copy size={15} />
                    <span>Copy Worker Onboarding Guide</span>
                  </button>
                  <button className="btn btn-secondary" onClick={() => setFilterScope('all')}>
                    <span>View All Network Workers ({workers.length})</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Worker Name & ID</th>
                  <th>Contact Details</th>
                  <th>Assigned Clinic</th>
                  <th>Supervisor</th>
                  <th>Acoustic Tests</th>
                  <th>Joined Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedList.map((worker) => {
                  const initials = (worker.full_name || worker.username || 'HW')
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join('')
                    .toUpperCase();

                  const isSupervised =
                    worker.is_supervised_by_me ||
                    (adminId && worker.supervisor_admin_id && worker.supervisor_admin_id.toString() === adminId.toString()) ||
                    (adminName && worker.supervisor_admin_name && worker.supervisor_admin_name.toLowerCase().trim() === adminName.toLowerCase().trim());

                  return (
                    <tr key={worker.id || worker.username} style={{ cursor: 'pointer' }} onClick={() => setSelectedWorkerForModal(worker)}>
                      {/* Worker Profile */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ position: 'relative' }}>
                            <div style={{
                              width: 38, height: 38, borderRadius: '50%',
                              background: 'linear-gradient(135deg, #10B981, #0EA5E9)',
                              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 800, fontSize: '.84rem'
                            }}>
                              {initials}
                            </div>
                            <span style={{
                              position: 'absolute', bottom: 0, right: 0,
                              width: 10, height: 10, borderRadius: '50%',
                              background: worker.is_active !== false ? '#10B981' : '#94A3B8',
                              border: '2px solid #fff'
                            }} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '.92rem' }}>
                              {worker.full_name || worker.username}
                            </div>
                            <div style={{ fontSize: '.78rem', color: '#64748B' }}>
                              @{worker.username}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {worker.email ? (
                            <a
                              href={`mailto:${worker.email}`}
                              onClick={(e) => e.stopPropagation()}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.82rem', color: '#2563EB', textDecoration: 'none' }}
                            >
                              <Mail size={12} />
                              <span>{worker.email}</span>
                            </a>
                          ) : (
                            <span style={{ fontSize: '.8rem', color: '#94A3B8' }}>No email</span>
                          )}

                          {worker.mobile_no && (
                            <a
                              href={`tel:${worker.mobile_no}`}
                              onClick={(e) => e.stopPropagation()}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.78rem', color: '#475569', textDecoration: 'none' }}
                            >
                              <Phone size={11} />
                              <span>{worker.mobile_no}</span>
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Clinic */}
                      <td>
                        <div style={{ fontWeight: 600, color: '#1E293B', fontSize: '.86rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Building2 size={13} color="#0EA5E9" />
                          <span>{worker.clinic_name || 'Central Health Hub'}</span>
                        </div>
                        {worker.address && (
                          <div style={{ fontSize: '.76rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <MapPin size={11} />
                            <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {worker.address}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Supervisor status */}
                      <td>
                        {isSupervised ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '4px 9px', borderRadius: 6,
                            background: 'rgba(16,185,129,0.12)', color: '#059669',
                            fontSize: '.78rem', fontWeight: 700
                          }}>
                            <ShieldCheck size={13} />
                            <span>Reports to You</span>
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '4px 9px', borderRadius: 6,
                            background: 'rgba(100,116,139,0.08)', color: '#475569',
                            fontSize: '.78rem', fontWeight: 600
                          }}>
                            <span>{worker.supervisor_admin_name ? `Reports to ${worker.supervisor_admin_name}` : 'Unassigned'}</span>
                          </span>
                        )}
                      </td>

                      {/* Tests */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontWeight: 800, fontSize: '.9rem',
                            color: (worker.tests_count || 0) > 0 ? '#2563EB' : '#94A3B8'
                          }}>
                            {worker.tests_count || 0}
                          </span>
                          <span style={{ fontSize: '.76rem', color: '#64748B' }}>tests</span>
                        </div>
                        {worker.last_tested_at && (
                          <div style={{ fontSize: '.72rem', color: '#94A3B8', marginTop: 2 }}>
                            Last: {new Date(worker.last_tested_at).toLocaleDateString()}
                          </div>
                        )}
                      </td>

                      {/* Joined Date */}
                      <td>
                        <div style={{ fontSize: '.82rem', color: '#475569' }}>
                          {worker.created_at
                            ? new Date(worker.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                            : 'Active Staff'}
                        </div>
                      </td>

                      {/* Action */}
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '5px 10px', fontSize: '.78rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedWorkerForModal(worker);
                          }}
                        >
                          <span>Details</span>
                          <ChevronRight size={13} />
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
      )} {/* end activeTab === 'active' */}

      {/* Worker Detail Modal */}
      {selectedWorkerForModal && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 20
          }}
          onClick={() => setSelectedWorkerForModal(null)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 16, overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '20px 24px',
              background: 'linear-gradient(135deg, #0F172A, #1E293B)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #10B981, #0EA5E9)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: '1rem'
                }}>
                  {(selectedWorkerForModal.full_name || selectedWorkerForModal.username || 'HW')
                    .substring(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                    {selectedWorkerForModal.full_name}
                  </h3>
                  <div style={{ color: '#38BDF8', fontSize: '.82rem' }}>
                    @{selectedWorkerForModal.username} · Health Worker
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedWorkerForModal(null)}
                style={{
                  background: 'rgba(255,255,255,0.1)', border: 'none',
                  color: '#fff', width: 32, height: 32, borderRadius: '50%',
                  cursor: 'pointer', fontSize: '1.2rem', display: 'flex',
                  alignItems: 'center', justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: 10 }}>
                  <div style={{ fontSize: '.74rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Clinic Affiliation</div>
                  <div style={{ fontWeight: 700, color: '#0F172A', marginTop: 4 }}>{selectedWorkerForModal.clinic_name || 'Central Health Hub'}</div>
                  <div style={{ fontSize: '.76rem', color: '#64748B', marginTop: 2 }}>{selectedWorkerForModal.clinic_location || selectedWorkerForModal.address || 'Standard Clinic'}</div>
                </div>

                <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: 10 }}>
                  <div style={{ fontSize: '.74rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Supervising Administrator</div>
                  <div style={{ fontWeight: 700, color: '#0F172A', marginTop: 4 }}>{selectedWorkerForModal.supervisor_admin_name || adminName}</div>
                  <div style={{ fontSize: '.76rem', color: '#059669', marginTop: 2, fontWeight: 600 }}>Active Relationship</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '.88rem', color: '#334155' }}>
                  <Mail size={16} color="#2563EB" />
                  <span>Email:</span>
                  <strong style={{ color: '#0F172A' }}>{selectedWorkerForModal.email || 'Not provided'}</strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '.88rem', color: '#334155' }}>
                  <Phone size={16} color="#10B981" />
                  <span>Mobile Phone:</span>
                  <strong style={{ color: '#0F172A' }}>{selectedWorkerForModal.mobile_no || 'Not provided'}</strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '.88rem', color: '#334155' }}>
                  <MapPin size={16} color="#F59E0B" />
                  <span>Address:</span>
                  <strong style={{ color: '#0F172A' }}>{selectedWorkerForModal.address || 'Facility Quarters'}</strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '.88rem', color: '#334155' }}>
                  <Activity size={16} color="#8B5CF6" />
                  <span>Acoustic Tests Performed:</span>
                  <strong style={{ color: '#0F172A' }}>{selectedWorkerForModal.tests_count || 0} vials analyzed</strong>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 14, borderTop: '1px solid #E2E8F0' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSelectedWorkerForModal(null)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    const wid = selectedWorkerForModal.id;
                    setSelectedWorkerForModal(null);
                    onSelectTest && onSelectTest(null);
                  }}
                >
                  <Activity size={15} />
                  <span>View Test Audit Trail</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
