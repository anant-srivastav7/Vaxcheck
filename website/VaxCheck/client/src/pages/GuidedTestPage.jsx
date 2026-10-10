import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, AlertTriangle, AlertOctagon,
  Play, RefreshCw, Barcode, ChevronRight, Activity,
  CheckCircle2, Volume2, Database,
  Layers, Check, Waves, Usb, Cable
} from 'lucide-react';
import { api } from '../api';

function playAcousticAudio(verdict = 'PASS') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const isPass = verdict === 'PASS';
    const centerFreq = isPass ? 4850 : 3100;
    const decayTime = isPass ? 0.12 : 0.045;
    [0, 0.28, 0.56].forEach((timeOffset) => {
      const bufferSize = Math.floor(ctx.sampleRate * 0.015);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const cd = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) cd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
      const noise = ctx.createBufferSource(); noise.buffer = buffer;
      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass';
      filter.frequency.setValueAtTime(centerFreq, ctx.currentTime + timeOffset);
      filter.Q.setValueAtTime(isPass ? 16 : 3, ctx.currentTime + timeOffset);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(isPass ? 0.85 : 0.45, ctx.currentTime + timeOffset);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + timeOffset + decayTime);
      noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      noise.start(ctx.currentTime + timeOffset);
      noise.stop(ctx.currentTime + timeOffset + decayTime + 0.05);
    });
  } catch (e) { console.warn('Audio error:', e); }
}

const QUICK_BATCHES = [
  { id: 'MOD-2024-B882', label: 'Moderna Spikevax' },
  { id: 'PFI-2024-X419', label: 'Pfizer Comirnaty' },
  { id: 'VAR-2024-V09', label: 'Merck Varivax' },
  { id: 'FLU-2024-F771', label: 'Sanofi Fluzone' },
];

const VD = {
  PASS: { label: 'Healthy', color: '#10B981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.35)' },
  FAIL: { label: 'Damaged', color: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.35)' },
  INCONCLUSIVE: { label: 'Retest Needed', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.35)' },
};

export default function GuidedTestPage({ currentUser, onNavigateToBatch }) {
  const [step, setStep] = useState(1);
  const [vialBatchId, setVialBatchId] = useState('MOD-2024-B882');
  const [vaccineName, setVaccineName] = useState('Moderna Spikevax');
  const [hwStatus, setHwStatus] = useState(null);
  const [hwConnecting, setHwConnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showTech, setShowTech] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { checkHw(); const iv = setInterval(checkHw, 5000); return () => clearInterval(iv); }, []);
  useEffect(() => { const b = QUICK_BATCHES.find(x => x.id === vialBatchId); if (b) setVaccineName(b.label); }, [vialBatchId]);

  async function checkHw() {
    try {
      const d = await api.getHardwareStatus();
      setHwStatus({ sidecar_up: true, serial_connected: d.serial_connected || d.serial?.connected || false, port: d.serial_port || d.serial?.port || null });
    } catch { setHwStatus({ sidecar_up: false, serial_connected: false, port: null }); }
  }

  const hwReady = hwStatus?.sidecar_up && hwStatus?.serial_connected;

  async function connectHw() {
    setHwConnecting(true); setError('');
    try { await api.connectHardware(); await checkHw(); }
    catch (e) { setError('Failed to connect ESP32: ' + e.message); }
    finally { setHwConnecting(false); }
  }

  async function disconnectHw() {
    try { await api.disconnectHardware(); await checkHw(); }
    catch (e) { setError('Disconnect failed: ' + e.message); }
  }

  async function handleStartTest() {
    if (!vialBatchId.trim()) { setError('Enter a vial batch ID.'); return; }
    if (!hwReady) { setError('ESP32 not connected. Connect hardware first.'); return; }
    if (isTesting) return;
    setError(''); setIsTesting(true); setTestResult(null);
    try {
      const r = await api.triggerStrike(vialBatchId, vaccineName, 3, currentUser?.id || null, 1.2);
      const v = r.classification_result || r.verdict || 'INCONCLUSIVE';
      const sd = r.sidecar_data || r;
      setTestResult({
        id: r.test_id || r.id || r._id, vial_batch_id: vialBatchId, vaccine_name: vaccineName,
        classification_result: v, confidence_score: r.confidence_score ?? sd.confidence ?? 0.5,
        tested_at: r.tested_at || new Date().toISOString(),
        strikes: sd.strikes || r.strikes || [], aggregate: sd.aggregate || r.aggregate || {},
        quality_gates: sd.quality_gates || r.quality_gates || { passed: true, failures: [] },
        display_verdict: sd.display_verdict || VD[v]?.label || v,
        batch_alert: r.batch_alert || null, synced: true,
      });
      playAcousticAudio(v); setStep(3);
    } catch (e) { setError('Test failed: ' + e.message); }
    finally { setIsTesting(false); }
  }

  function playAudio() { setIsPlaying(true); playAcousticAudio(testResult?.classification_result || 'PASS'); setTimeout(() => setIsPlaying(false), 900); }
  function reset() { setTestResult(null); setStep(1); setError(''); }

  const vd = testResult ? (VD[testResult.classification_result] || VD.INCONCLUSIVE) : null;
  const agg = testResult?.aggregate || {};

  return (
    <div className="page-content" style={{ maxWidth: 1040, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '22px 28px', marginBottom: 24, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ background: hwReady ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)', color: hwReady ? '#34D399' : '#FBBF24', padding: '3px 10px', borderRadius: 999, fontSize: '.72rem', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                {hwReady ? 'ESP32 Hardware Connected' : hwStatus?.sidecar_up ? 'ESP32 Not Connected' : 'Sidecar Offline'}
              </span>
              <span style={{ color: '#64748B', fontSize: '.8rem' }}>{'• ' + (currentUser?.clinic_name || 'VaxCheck Station')}</span>
            </div>
            <h2 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#F8FAFC', margin: 0 }}>Vaccine Vial Acoustic Test</h2>
            <p style={{ color: '#94A3B8', fontSize: '.88rem', margin: '4px 0 0' }}>Real ESP32 solenoid strikes with SVM classification via server-side Python pipeline.</p>
          </div>
          <span style={{ background: 'rgba(56,189,248,0.12)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.3)', padding: '6px 14px', borderRadius: 10, fontSize: '.78rem', fontWeight: 700 }}>Real Hardware • SVM Model • USB Serial</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {[{ n:1, t:'Enter Vial ID', d:'Scan barcode or type batch ID', a: step>=1 },
            { n:2, t:'USB Strike Trigger', d:'Server sends S command via serial', a: isTesting || step>=2 },
            { n:3, t:'3 Solenoid Strikes', d:'800ms audio capture per strike', a: isTesting },
            { n:4, t:'Signal + SVM', d:'analyze_file + SVM predict', a: isTesting },
            { n:5, t:'Result On Screen', d:'Healthy / Damaged / Retest', a: step===3 }
          ].map(s => (
            <div key={s.n} style={{ background: s.a ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)', border: '1px solid '+(s.a ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.06)'), borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                <span style={{ width:18, height:18, borderRadius:'50%', background: s.a ? '#10B981' : 'rgba(255,255,255,0.1)', color: s.a ? '#fff' : '#94A3B8', fontSize:'.68rem', fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>{s.n}</span>
                <span style={{ color: s.a ? '#34D399' : '#CBD5E1', fontSize:'.78rem', fontWeight:700 }}>{s.t}</span>
              </div>
              <p style={{ color:'#94A3B8', fontSize:'.72rem', margin:0 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="alert-banner critical" style={{ marginBottom: 20 }}><AlertOctagon size={22} /><div><h4 style={{ margin:'0 0 2px' }}>System Alert</h4><p style={{ margin:0, fontSize:'.88rem' }}>{error}</p></div></div>}

      {/* STEPS 1-2 */}
      {(!testResult || step !== 3) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Card 1: Vial ID */}
          <div className="card" style={{ padding: '24px 28px', border: '1px solid #E2E8F0', borderRadius: 16 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:14 }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <span style={{ width:24, height:24, borderRadius:'50%', background:'#0F172A', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.78rem', fontWeight:800 }}>1</span>
                  <h3 style={{ fontSize:'1.2rem', fontWeight:800, color:'#0F172A', margin:0 }}>Scan or Enter Vaccine Vial Identifier</h3>
                </div>
                <p style={{ color:'#64748B', fontSize:'.88rem', margin:0 }}>Barcode from vial label, vaccine box, or cold-storage intake lot.</p>
              </div>
              <span style={{ fontSize:'.78rem', color:'#64748B', fontWeight:600 }}>Step 1 of 2</span>
            </div>
            <div style={{ position:'relative', marginTop:10 }}>
              <input type="text" className="form-input" style={{ width:'100%', fontSize:'1.2rem', fontWeight:800, letterSpacing:'.05em', padding:'14px 16px 14px 48px', borderRadius:12, border:'2px solid #CBD5E1' }} placeholder="e.g. MOD-2024-B882" value={vialBatchId} onChange={e => setVialBatchId(e.target.value.toUpperCase())} disabled={isTesting} />
              <Barcode size={24} color="#64748B" style={{ position:'absolute', left:16, top:16 }} />
            </div>
            <div style={{ marginTop:14 }}>
              <span style={{ fontSize:'.75rem', fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'.06em' }}>Quick-Select:</span>
              <div className="quick-pills" style={{ marginTop:6 }}>
                {QUICK_BATCHES.map(b => <button key={b.id} type="button" className={'pill-btn '+(vialBatchId===b.id?'active':'')} onClick={() => { setVialBatchId(b.id); setVaccineName(b.label); }} disabled={isTesting}><strong>{b.id}</strong> — {b.label}</button>)}
              </div>
            </div>
          </div>

          {/* Card 2: Hardware & Trigger */}
          <div className="card" style={{ padding: '24px 28px', border: '1px solid #E2E8F0', borderRadius: 16 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:14 }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <span style={{ width:24, height:24, borderRadius:'50%', background:'#0F172A', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.78rem', fontWeight:800 }}>2</span>
                  <h3 style={{ fontSize:'1.2rem', fontWeight:800, color:'#0F172A', margin:0 }}>Place Vial in Chamber & Trigger Test</h3>
                </div>
                <p style={{ color:'#64748B', fontSize:'.88rem', margin:0 }}>Place vial in holder against solenoid strike pin and acoustic microphone.</p>
              </div>
              <span style={{ fontSize:'.78rem', color:'#64748B', fontWeight:600 }}>Step 2 of 2</span>
            </div>

            {/* HW Status */}
            <div style={{ marginBottom:20, background: hwReady ? 'rgba(16,185,129,0.06)' : !hwStatus?.sidecar_up ? 'rgba(239,68,68,0.06)' : '#F8FAFC', border: '1.5px solid '+(hwReady ? 'rgba(16,185,129,0.35)' : !hwStatus?.sidecar_up ? 'rgba(239,68,68,0.35)' : '#E2E8F0'), borderRadius:14, padding:'16px 20px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:44, height:44, borderRadius:10, background: hwReady ? '#10B981' : hwConnecting ? '#0284C7' : !hwStatus?.sidecar_up ? '#EF4444' : '#0F172A', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}><Usb size={22} /></div>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:'.72rem', fontWeight:800, letterSpacing:'.06em', textTransform:'uppercase', background: hwReady ? 'rgba(16,185,129,0.18)' : 'rgba(100,116,139,0.14)', color: hwReady ? '#059669' : '#64748B', padding:'3px 9px', borderRadius:6, display:'inline-flex', alignItems:'center', gap:6 }}>
                        <span style={{ width:8, height:8, borderRadius:'50%', background: hwReady ? '#10B981' : '#94A3B8' }} />
                        {hwReady ? 'ESP32 Connected' : hwConnecting ? 'Connecting...' : !hwStatus?.sidecar_up ? 'Sidecar Offline' : 'ESP32 Disconnected'}
                      </span>
                      {hwStatus?.port && <span style={{ fontSize:'.76rem', color:'#64748B', fontWeight:600 }}>{hwStatus.port} @ 921,600 Baud</span>}
                    </div>
                    <h4 style={{ margin:'3px 0 1px', fontSize:'1rem', fontWeight:800, color:'#0F172A' }}>{hwReady ? 'ESP32 Solenoid Unit ('+(hwStatus.port||'USB')+')' : 'ESP32 Acoustic Testing Chamber'}</h4>
                    <p style={{ margin:0, fontSize:'.82rem', color:'#64748B' }}>{hwReady ? 'Hardware connected via server-side USB serial. Real acoustic analysis active.' : !hwStatus?.sidecar_up ? 'Start Python sidecar: python vaxcheck_service.py (port 5001)' : 'Click Connect ESP32 to auto-detect serial port.'}</p>
                  </div>
                </div>
                <div>
                  {hwReady ? <button type="button" className="btn btn-secondary" onClick={disconnectHw} style={{ fontSize:'.84rem', padding:'8px 14px' }}>Disconnect ESP32</button>
                   : hwConnecting ? <button type="button" className="btn btn-secondary" disabled style={{ fontSize:'.84rem', padding:'9px 16px' }}>Connecting...</button>
                   : <button type="button" className="btn btn-secondary" onClick={connectHw} disabled={!hwStatus?.sidecar_up} style={{ fontSize:'.84rem', padding:'9px 16px', display:'flex', alignItems:'center', gap:6, opacity: !hwStatus?.sidecar_up ? 0.5 : 1 }}><Cable size={16} color="#2563EB" /><span>Connect ESP32</span></button>}
                </div>
              </div>
            </div>

            {isTesting ? (
              <div style={{ background:'#0F172A', borderRadius:16, padding:'32px 24px', textAlign:'center' }}>
                <div style={{ width:68, height:68, borderRadius:'50%', background:'rgba(56,189,248,0.15)', border:'2px solid rgba(56,189,248,0.4)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}><Activity size={32} color="#38BDF8" className="spin" /></div>
                <h3 style={{ color:'#F8FAFC', fontSize:'1.25rem', fontWeight:800, margin:'0 0 6px' }}>Acoustic Test in Progress</h3>
                <p style={{ color:'#94A3B8', fontSize:'.88rem', margin:'0 0 6px' }}>ESP32 firing 3 strikes within ~5 seconds. Audio captured & analyzed server-side.</p>
                <p style={{ color:'#38BDF8', fontSize:'.82rem', fontWeight:700, margin:'0 0 20px' }}>~5 seconds — do not unplug USB.</p>
                <div style={{ display:'flex', justifyContent:'center', gap:12, marginBottom:20 }}>
                  {[1,2,3].map(n => <div key={n} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:999, background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(56,189,248,0.3)', color:'#94A3B8', fontSize:'.82rem', fontWeight:700 }}><Activity size={14} color="#38BDF8" /><span>Strike {n}</span></div>)}
                </div>
                <div style={{ maxWidth:360, height:8, background:'#1E293B', borderRadius:999, margin:'0 auto', overflow:'hidden' }}><div style={{ height:'100%', background:'linear-gradient(90deg,#10B981,#38BDF8)', width:'60%' }} /></div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <button type="button" className={'btn '+(hwReady?'btn-primary':'btn-secondary')} style={{ width:'100%', padding:'16px', fontSize:'1.14rem', fontWeight:800, borderRadius:12, background: hwReady ? 'linear-gradient(135deg,#2563EB,#0284C7)' : '#E2E8F0', color: hwReady ? '#fff' : '#64748B', boxShadow: hwReady ? '0 6px 20px rgba(37,99,235,0.3)' : 'none', cursor: !hwReady ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, border:'none', opacity: !hwReady ? 0.7 : 1 }} onClick={handleStartTest} disabled={!hwReady||isTesting}>
                  <Play size={20} fill={hwReady?'#fff':'#94A3B8'} /><span>TRIGGER ACOUSTIC TEST (3 STRIKES)</span>
                </button>
                {!hwReady && <div style={{ textAlign:'center', fontSize:'.84rem', color:'#64748B', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}><Cable size={15} color="#2563EB" /><span>{!hwStatus?.sidecar_up ? 'Start Python sidecar: python vaxcheck_service.py' : 'Click Connect ESP32 above.'}</span></div>}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:16, fontSize:'.78rem', color:'#64748B', marginTop:2 }}>
                  <span style={{ display:'flex', alignItems:'center', gap:4 }}><CheckCircle2 size={14} color="#10B981" /> 3 Strikes</span><span>•</span>
                  <span style={{ display:'flex', alignItems:'center', gap:4 }}><Usb size={14} color="#2563EB" /> 921600 Baud</span><span>•</span>
                  <span style={{ display:'flex', alignItems:'center', gap:4 }}><ShieldCheck size={14} color="#10B981" /> Non-Destructive</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: RESULTS */}
      {testResult && step === 3 && (
        <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
          {/* Hero */}
          <div style={{ borderRadius:16, padding:'36px 28px', textAlign:'center', background: vd.bg, border:'2px solid '+vd.border }}>
            <div style={{ width:72, height:72, borderRadius:'50%', background:vd.color, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              {testResult.classification_result==='PASS' && <ShieldCheck size={40} />}
              {testResult.classification_result==='FAIL' && <AlertOctagon size={40} />}
              {testResult.classification_result==='INCONCLUSIVE' && <AlertTriangle size={40} />}
            </div>
            <h2 style={{ fontSize:'2rem', fontWeight:900, color:vd.color, margin:'0 0 8px' }}>{testResult.display_verdict||vd.label}</h2>
            <p style={{ color:'#475569', fontSize:'1rem', margin:'0 0 16px', maxWidth:600, marginLeft:'auto', marginRight:'auto' }}>
              {testResult.classification_result==='PASS' && 'Acoustic resonance confirms fluid elasticity intact. Safe to administer.'}
              {testResult.classification_result==='FAIL' && 'Acoustic damping indicates freeze damage. Do NOT administer. Quarantine this vial.'}
              {testResult.classification_result==='INCONCLUSIVE' && 'Quality gates failed or confidence too low. Invert vial gently and retest.'}
            </p>
            {testResult.classification_result==='INCONCLUSIVE' && testResult.quality_gates?.failures?.length > 0 && (
              <div style={{ background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:10, padding:'12px 16px', maxWidth:500, margin:'0 auto 12px', textAlign:'left' }}>
                <div style={{ fontSize:'.82rem', fontWeight:700, color:'#D97706', marginBottom:6 }}>Quality Gate Failures:</div>
                <ul style={{ margin:0, paddingLeft:20, fontSize:'.82rem', color:'#92400E' }}>{testResult.quality_gates.failures.map((f,i) => <li key={i}>{f}</li>)}</ul>
              </div>
            )}
            <div style={{ maxWidth:360, margin:'14px auto 0' }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'.82rem', marginBottom:6 }}>
                <span style={{ color:'#475569' }}>SVM Confidence:</span>
                <span style={{ color:vd.color, fontWeight:800 }}>{(testResult.confidence_score*100).toFixed(1)}%</span>
              </div>
              <div style={{ height:10, background:'#E2E8F0', borderRadius:999, overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:999, width:(testResult.confidence_score*100)+'%', backgroundColor:vd.color, transition:'width 0.5s ease' }} />
              </div>
            </div>
          </div>

          {/* Acoustic Features */}
          <div className="card" style={{ padding:'24px 28px', border:'1px solid #E2E8F0', borderRadius:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}><Waves size={18} color="#0EA5E9" /><h3 style={{ fontSize:'1.1rem', fontWeight:800, color:'#0F172A', margin:0 }}>Acoustic Analysis Results</h3></div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:16, background:'#F8FAFC', borderRadius:12, padding:'18px 22px' }}>
              <div><span style={{ fontSize:'.75rem', fontWeight:700, color:'#64748B', textTransform:'uppercase' }}>Confidence</span><div style={{ fontSize:'1.3rem', fontWeight:900, color:vd.color, marginTop:2 }}>{(testResult.confidence_score*100).toFixed(1)}%</div></div>
              <div><span style={{ fontSize:'.75rem', fontWeight:700, color:'#64748B', textTransform:'uppercase' }}>Decay Time</span><div style={{ fontSize:'1.3rem', fontWeight:900, color:'#0F172A', marginTop:2 }}>{agg.mean_tau_env_ms!=null ? Number(agg.mean_tau_env_ms).toFixed(1)+' ms' : 'N/A'}</div></div>
              <div><span style={{ fontSize:'.75rem', fontWeight:700, color:'#64748B', textTransform:'uppercase' }}>Dominant Freq</span><div style={{ fontSize:'1.3rem', fontWeight:900, color:'#0F172A', marginTop:2 }}>{agg.mean_prony_freq_hz!=null ? Number(agg.mean_prony_freq_hz).toFixed(0)+' Hz' : 'N/A'}</div></div>
              <div><span style={{ fontSize:'.75rem', fontWeight:700, color:'#64748B', textTransform:'uppercase' }}>SNR</span><div style={{ fontSize:'1.3rem', fontWeight:900, color:'#0F172A', marginTop:2 }}>{agg.mean_snr_db!=null ? Number(agg.mean_snr_db).toFixed(1)+' dB' : 'N/A'}</div></div>
            </div>
          </div>

          {/* Stored Record */}
          <div className="card" style={{ padding:'24px 28px', border:'1px solid #E2E8F0', borderRadius:16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, borderBottom:'1px solid #F1F5F9', paddingBottom:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}><Database size={18} color="#2563EB" /><h3 style={{ fontSize:'1.1rem', fontWeight:800, color:'#0F172A', margin:0 }}>Stored Result</h3></div>
              <span style={{ background:'#F0FDF4', color:'#166534', border:'1px solid #BBF7D0', padding:'3px 10px', borderRadius:8, fontSize:'.76rem', fontWeight:700 }}>Saved to MongoDB</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:16, background:'#F8FAFC', borderRadius:12, padding:'18px 22px' }}>
              <div><span style={{ fontSize:'.75rem', fontWeight:700, color:'#64748B', textTransform:'uppercase' }}>Vial ID</span><div style={{ fontSize:'1rem', fontWeight:800, color:'#0F172A', marginTop:2 }}>{testResult.vial_batch_id}</div></div>
              <div><span style={{ fontSize:'.75rem', fontWeight:700, color:'#64748B', textTransform:'uppercase' }}>Vaccine</span><div style={{ fontSize:'1rem', fontWeight:700, color:'#0F172A', marginTop:2 }}>{testResult.vaccine_name}</div></div>
              <div><span style={{ fontSize:'.75rem', fontWeight:700, color:'#64748B', textTransform:'uppercase' }}>Result</span><div style={{ fontSize:'1rem', fontWeight:800, marginTop:2, color:vd.color }}>{testResult.classification_result} ({vd.label})</div></div>
              <div><span style={{ fontSize:'.75rem', fontWeight:700, color:'#64748B', textTransform:'uppercase' }}>Time</span><div style={{ fontSize:'.92rem', fontWeight:600, color:'#334155', marginTop:2 }}>{new Date(testResult.tested_at).toLocaleString()}</div></div>
              <div><span style={{ fontSize:'.75rem', fontWeight:700, color:'#64748B', textTransform:'uppercase' }}>Operator</span><div style={{ fontSize:'.92rem', fontWeight:600, color:'#334155', marginTop:2 }}>{currentUser?.full_name||currentUser?.name||'Health Worker'}</div></div>
              <div><span style={{ fontSize:'.75rem', fontWeight:700, color:'#64748B', textTransform:'uppercase' }}>Audio</span><div style={{ marginTop:4 }}><button type="button" onClick={playAudio} style={{ display:'inline-flex', alignItems:'center', gap:6, background: isPlaying ? '#2563EB' : '#EFF6FF', color: isPlaying ? '#fff' : '#2563EB', border:'1px solid rgba(37,99,235,0.25)', padding:'4px 12px', borderRadius:8, fontSize:'.82rem', fontWeight:700, cursor:'pointer' }}><Volume2 size={14} /><span>{isPlaying?'Playing...':'Play Signature'}</span></button></div></div>
            </div>
          </div>

          {/* Per-Strike */}
          {testResult.strikes?.length > 0 && (
            <div className="card" style={{ padding:'24px 28px', border:'1px solid #E2E8F0', borderRadius:16 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}><Layers size={18} color="#8B5CF6" /><h3 style={{ fontSize:'1.1rem', fontWeight:800, color:'#0F172A', margin:0 }}>Per-Strike Detail</h3></div>
                <button type="button" className="btn btn-secondary" style={{ fontSize:'.78rem', padding:'4px 10px' }} onClick={() => setShowTech(!showTech)}>{showTech?'Collapse':'Expand'}</button>
              </div>
              {showTech && <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:14 }}>
                {testResult.strikes.map((s,i) => {
                  const f = s.features||s; const p = s.prediction||{}; const q = s.quality_gates||{};
                  return (<div key={i} style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:12, padding:'14px 18px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                      <span style={{ fontWeight:800, color:'#0F172A', fontSize:'.92rem' }}>Strike {s.strike_number||i+1}</span>
                      <span style={{ fontSize:'.72rem', fontWeight:700, padding:'2px 8px', borderRadius:6, background:(p.label==='healthy'||p.class===1)?'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)', color:(p.label==='healthy'||p.class===1)?'#059669':'#DC2626' }}>
                        {p.label||(p.class===1?'healthy':p.class===0?'damaged':'—')}{p.confidence!=null?' ('+(p.confidence*100).toFixed(0)+'%)':''}
                      </span>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 16px', fontSize:'.78rem' }}>
                      <div><span style={{ color:'#64748B' }}>Decay:</span> <strong>{f.tau_env_ms!=null?Number(f.tau_env_ms).toFixed(1)+' ms':'N/A'}</strong></div>
                      <div><span style={{ color:'#64748B' }}>Freq:</span> <strong>{f.prony_freq_hz!=null?Number(f.prony_freq_hz).toFixed(0)+' Hz':'N/A'}</strong></div>
                      <div><span style={{ color:'#64748B' }}>SNR:</span> <strong>{f.snr_db!=null?Number(f.snr_db).toFixed(1)+' dB':'N/A'}</strong></div>
                      <div><span style={{ color:'#64748B' }}>Peak:</span> <strong>{f.peak_pct_fs!=null?Number(f.peak_pct_fs).toFixed(1)+'%':'N/A'}</strong></div>
                    </div>
                    {q.failures?.length > 0 && <div style={{ marginTop:6, fontSize:'.72rem', color:'#D97706' }}>{'⚠ '+q.failures.join(', ')}</div>}
                  </div>);
                })}
              </div>}
            </div>
          )}

          {testResult.batch_alert && <div className="alert-banner critical"><AlertOctagon size={22} /><div><h4 style={{ margin:'0 0 2px' }}>Batch Safety Alert</h4><p style={{ margin:0, fontSize:'.88rem' }}>{testResult.batch_alert.alert_message}</p></div></div>}

          <div style={{ display:'flex', gap:14, justifyContent:'center', flexWrap:'wrap' }}>
            {testResult.classification_result==='INCONCLUSIVE' && <button className="btn btn-primary btn-large" onClick={reset} style={{ padding:'14px 28px', fontSize:'1rem', background:'#F59E0B', border:'none', color:'#fff' }}><RefreshCw size={18} /><span>Strike Again</span></button>}
            <button className="btn btn-primary btn-large" onClick={reset} style={{ padding:'14px 28px', fontSize:'1rem' }}><RefreshCw size={18} /><span>Test Another Vial</span></button>
            <button className="btn btn-secondary btn-large" onClick={() => onNavigateToBatch(testResult.vial_batch_id)} style={{ padding:'14px 28px', fontSize:'1rem' }}><span>View Batch Summary</span><ChevronRight size={18} /></button>
          </div>
        </div>
      )}

      <div style={{ marginTop:32, padding:'20px 24px', background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:16 }}>
        <div style={{ fontSize:'.75rem', fontWeight:800, color:'#475569', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:12 }}>Key Advantages</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:14 }}>
          {[{l:'Fast',d:'~5s per 3-strike cycle'},{l:'Objective',d:'SVM on real data'},{l:'Non-destructive',d:'Vial stays sealed'},{l:'Digital Record',d:'MongoDB storage'},{l:'Accessible',d:'One-click web trigger'},{l:'Safety',d:'Prevents freeze-damaged lots'}].map((x,i) => (
            <div key={i}><div style={{ display:'flex', alignItems:'center', gap:5, color:'#0F172A', fontWeight:800, fontSize:'.86rem' }}><Check size={14} color="#10B981" /><span>{x.l}</span></div><p style={{ color:'#64748B', fontSize:'.76rem', margin:'2px 0 0' }}>{x.d}</p></div>
          ))}
        </div>
      </div>
    </div>
  );
}
