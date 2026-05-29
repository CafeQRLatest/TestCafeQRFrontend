import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../utils/api';
import { FaArrowLeft, FaSync, FaBan, FaCheckCircle, FaTrash, FaCogs, FaClock, FaBug, FaDatabase, FaArrowDown, FaEye, FaServer, FaDownload } from 'react-icons/fa';
import { isKnownOffline } from '../../utils/networkState';
import { getQueuedOperations, discardSyncQueueEntry, markOperationPending, getLastSyncTime } from '../../utils/offlineStore';
import { reconnectAndSync, bootstrapOfflineData } from '../../utils/offlineSync';

export default function OfflineSyncPage() {
  const [offline, setOffline] = useState(false);
  const [syncQueue, setSyncQueue] = useState([]);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedOp, setSelectedOp] = useState(null);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [config, setConfig] = useState({ autoSyncEnabled: true, syncInterval: 60, leaseBlockSize: 100, failOpenPayments: false, localEncryption: false });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // PWA install prompt
    const onInstallPrompt = (e) => { e.preventDefault(); setDeferredPrompt(e); setShowInstall(true); };
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', () => setShowInstall(false));

    const saved = localStorage.getItem('cafeqr_offline_config');
    if (saved) { try { setConfig(JSON.parse(saved)); } catch (e) {} }

    (async () => {
      if (!isKnownOffline()) {
        try {
          const r = await api.get('/api/v1/configurations');
          if (r.data.success && r.data.data) {
            const d = r.data.data;
            const m = { autoSyncEnabled: d.offlineSyncEnabled ?? true, syncInterval: d.offlineSyncInterval ?? 60, leaseBlockSize: d.offlineLeaseBlockSize ?? 100, failOpenPayments: d.offlineFailOpenPayments ?? false, localEncryption: d.offlineLocalEncryption ?? false };
            setConfig(m); localStorage.setItem('cafeqr_offline_config', JSON.stringify(m));
          }
        } catch (e) {}
      }
    })();

    setOffline(isKnownOffline());
    loadQ();
    const onNet = (e) => setOffline(e?.detail?.offline ?? isKnownOffline());
    window.addEventListener('cafeqr-network-state', onNet);
    window.addEventListener('online', () => setOffline(isKnownOffline()));
    window.addEventListener('offline', () => setOffline(isKnownOffline()));
    window.addEventListener('cafeqr-sync-queue-changed', loadQ);
    return () => {
      window.removeEventListener('cafeqr-network-state', onNet);
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null); setShowInstall(false);
  };

  const loadQ = async () => {
    try { setSyncQueue((await getQueuedOperations()) || []); setLastSyncTime(await getLastSyncTime()); }
    catch (e) {} finally { setLoading(false); }
  };

  const handleSyncNow = async () => {
    if (syncing) return;
    setSyncing(true); setSyncResult(null);
    try {
      const r = await reconnectAndSync(); await loadQ();
      if (r && !r.skipped) setSyncResult({ ok: true, msg: `Pushed ${r.sync?.pushed || 0} operations.` });
      else if (r?.offline) setSyncResult({ ok: false, msg: 'Still offline — sync skipped.' });
      else setSyncResult({ ok: true, msg: 'Already in sync.' });
    } catch (e) { setSyncResult({ ok: false, msg: e.message || 'Sync failed.' }); }
    finally { setSyncing(false); }
  };

  const handleBootstrap = async () => {
    if (syncing) return;
    setSyncing(true); setSyncResult(null);
    try {
      const r = await bootstrapOfflineData({ forceProbe: true });
      setSyncResult(r ? { ok: true, msg: 'Catalog snapshot downloaded.' } : { ok: false, msg: 'Bootstrap failed.' });
    } catch (e) { setSyncResult({ ok: false, msg: e.message || 'Bootstrap failed.' }); }
    finally { setSyncing(false); }
  };

  const handleDiscard = async (id) => {
    if (!confirm('Discard this entry?')) return;
    await discardSyncQueueEntry(id); await loadQ();
    if (selectedOp?.id === id) setSelectedOp(null);
  };

  const handleRetry = async (id) => { await markOperationPending(id); await loadQ(); };

  const handleCfg = async (key, value) => {
    const u = { ...config, [key]: value };
    setConfig(u); localStorage.setItem('cafeqr_offline_config', JSON.stringify(u));
    if (!isKnownOffline()) {
      try {
        const r = await api.get('/api/v1/configurations');
        if (r.data.success && r.data.data)
          await api.put('/api/v1/configurations', { ...r.data.data, offlineSyncEnabled: u.autoSyncEnabled, offlineSyncInterval: u.syncInterval, offlineLeaseBlockSize: u.leaseBlockSize, offlineFailOpenPayments: u.failOpenPayments, offlineLocalEncryption: u.localEncryption });
      } catch (e) {}
    }
  };

  const exportJSON = () => {
    const a = document.createElement('a');
    a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(syncQueue, null, 2));
    a.download = `cafeqr-queue-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const factoryReset = () => {
    if (confirm('This permanently deletes all local IndexedDB data. Proceed?')) {
      indexedDB.deleteDatabase('cafeqr-offline').onsuccess = () => { alert('Reset. Reloading…'); window.location.reload(); };
    }
  };

  return (
    <DashboardLayout title="Offline Sync">
      <Head><title>Offline Sync | Cafe QR</title></Head>

      <div className="page">

        {/* ── HEADER ── */}
        <div className="hdr">
          <div className="hdr-l">
            <Link href="/owner/main-menu" className="back"><FaArrowLeft /> Main Menu</Link>
            <div className="hdr-row">
              <h1 className="hdr-title">Offline Sync</h1>
              <span className={`pill ${offline ? 'pill-warn' : 'pill-ok'}`}>
                <span className={`dot ${offline ? '' : 'dot-pulse'}`} />
                {offline ? 'Offline' : 'Online'}
              </span>
            </div>
          </div>
          <div className="hdr-r">
            {/* PWA Install — shown when browser prompt is ready and online */}
            {showInstall && !offline && (
              <button className="btn-install" onClick={handleInstall}>
                <FaDownload /> Install App
              </button>
            )}
            {syncResult && (
              <div className={`result ${syncResult.ok ? 'res-ok' : 'res-err'}`}>
                {syncResult.ok ? <FaCheckCircle /> : <FaBan />}
                <span>{syncResult.msg}</span>
              </div>
            )}
            <button className="btn-sec" onClick={handleBootstrap} disabled={syncing}><FaArrowDown /> Catalog</button>
            <button className={`btn-pri${syncing ? ' btn-busy' : ''}`} onClick={handleSyncNow} disabled={syncing}>
              <FaSync className={syncing ? 'spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>
        </div>

        {/* ── STATS ── */}
        <div className="stats">
          <div className="stat">
            <div className="stat-ico" style={{background:'#fff4e6', color:'#FF7A00'}}><FaDatabase /></div>
            <div>
              <div className="stat-n">{loading ? '—' : syncQueue.length}</div>
              <div className="stat-l">Pending Ops</div>
            </div>
          </div>
          <div className="stat-sep" />
          <div className="stat">
            <div className="stat-ico" style={{background:'#eff6ff', color:'#3b82f6'}}><FaClock /></div>
            <div>
              <div className="stat-n">{lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—'}</div>
              <div className="stat-l">Last Sync</div>
            </div>
          </div>
          <div className="stat-sep" />
          <div className="stat">
            <div className="stat-ico" style={{background:'#f5f3ff', color:'#7c3aed'}}><FaServer /></div>
            <div>
              <div className="stat-n" style={{color: offline ? '#d97706' : '#059669'}}>{offline ? 'Paused' : 'Active'}</div>
              <div className="stat-l">Sync Engine</div>
            </div>
          </div>
          <div className="stat-sep" />
          <div className="stat stat-cta" onClick={handleSyncNow}>
            <div className="stat-ico" style={{background:'#fff4e6', color:'#FF7A00'}}>
              <FaSync className={syncing ? 'spin' : ''} />
            </div>
            <div>
              <div className="stat-n cta-n">{syncing ? 'Running…' : 'Force Sync'}</div>
              <div className="stat-l">Click to trigger</div>
            </div>
          </div>
        </div>

        {/* ── BODY GRID ── */}
        <div className="grid">

          {/* Queue */}
          <div className="card">
            <div className="card-hd">
              <div className="card-ht">
                <FaBug />
                Queue Explorer
                <span className={`chip ${syncQueue.length > 0 ? 'chip-o' : 'chip-g'}`}>
                  {syncQueue.length > 0 ? syncQueue.length : 'Clean'}
                </span>
              </div>
              <span className="tag">IndexedDB</span>
            </div>

            {loading ? (
              <div className="cstate"><div className="ring" /><span className="cstate-txt">Loading queue…</span></div>
            ) : syncQueue.length === 0 ? (
              <div className="cstate">
                <div className="ok-ring"><FaCheckCircle className="ok-ico" /></div>
                <div className="empty-t">Queue is empty</div>
                <div className="empty-s">All offline operations have been synced to the server.</div>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>Time</th><th>Method</th><th>Resource</th><th>Status</th><th style={{textAlign:'right'}}>Actions</th></tr>
                  </thead>
                  <tbody>
                    {syncQueue.map(op => {
                      const st = String(op.status || '').toUpperCase();
                      const sc = st === 'CONFLICT' ? 'c' : op.attempts > 3 ? 'f' : 'q';
                      return (
                        <tr key={op.id} className={selectedOp?.id === op.id ? 'tr-hi' : ''}>
                          <td className="td-t">{new Date(op.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td>
                          <td><span className={`method m-${String(op.method).toLowerCase()}`}>{op.method}</span></td>
                          <td><div className="rn">{op.entity||'unknown'}</div><div className="rp">{op.path}</div></td>
                          <td><span className={`st st-${sc}`}>{sc==='c'?'CONFLICT':sc==='f'?'FAILED':'QUEUED'}</span></td>
                          <td style={{textAlign:'right'}}>
                            <div className="acts">
                              <button className="ab" onClick={() => setSelectedOp(op)} title="Inspect"><FaEye /></button>
                              <button className="ab ab-g" onClick={() => handleRetry(op.id)} title="Retry"><FaSync /></button>
                              <button className="ab ab-r" onClick={() => handleDiscard(op.id)} title="Discard"><FaTrash /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="right">

            {selectedOp && (
              <div className="card">
                <div className="card-hd">
                  <div className="card-ht"><FaEye /> Details</div>
                  <button className="close-x" onClick={() => setSelectedOp(null)}>✕</button>
                </div>
                <div className="card-p">
                  <div className="kvs">
                    <div className="kv"><div className="kk">Key</div><div className="kv-v mono">{selectedOp.id}</div></div>
                    {selectedOp.dependsOnOperationId && <div className="kv"><div className="kk">Depends On</div><div className="kv-v mono amber">{selectedOp.dependsOnOperationId}</div></div>}
                    <div className="kv"><div className="kk">Created</div><div className="kv-v">{new Date(selectedOp.createdAt).toLocaleString()}</div></div>
                    <div className="kv"><div className="kk">Attempts</div><div className="kv-v">{selectedOp.attempts || 0}</div></div>
                    {selectedOp.lastError && <div className="kv"><div className="kk" style={{color:'#dc2626'}}>Error</div><div className="err-v">{selectedOp.lastError}</div></div>}
                    <div className="kv"><div className="kk">Payload</div><pre className="payload">{JSON.stringify(selectedOp.payload, null, 2)}</pre></div>
                  </div>
                </div>
              </div>
            )}

            {/* Config */}
            <div className="card">
              <div className="card-hd">
                <div className="card-ht"><FaCogs /> Config</div>
                <span className="tag">Local</span>
              </div>
              <div className="cfg-list">
                <div className="cfg-row">
                  <div><div className="cfg-n">Auto-Sync</div><div className="cfg-d">Replay queue on reconnect</div></div>
                  <label className="tgl"><input type="checkbox" checked={config.autoSyncEnabled} onChange={e => handleCfg('autoSyncEnabled', e.target.checked)} /><span className="tgl-t" /></label>
                </div>
                <div className="cfg-sep" />
                <div className="cfg-blk">
                  <div className="cfg-blk-hd"><div className="cfg-n">Sync Interval</div><span className="vbadge">{config.syncInterval}s</span></div>
                  <input type="range" min="30" max="300" step="30" value={config.syncInterval} onChange={e => handleCfg('syncInterval', +e.target.value)} className="rng" />
                  <div className="rng-m"><span>30s</span><span>1m</span><span>3m</span><span>5m</span></div>
                </div>
                <div className="cfg-blk">
                  <div className="cfg-blk-hd"><div className="cfg-n">Lease Block</div><span className="vbadge">{config.leaseBlockSize}</span></div>
                  <input type="number" min="10" max="500" step="10" value={config.leaseBlockSize} onChange={e => handleCfg('leaseBlockSize', +e.target.value)} className="num" />
                </div>
                <div className="cfg-sep" />
                <div className="cfg-row">
                  <div><div className="cfg-n">Credit Offline</div><div className="cfg-d">B2B credit during dropout</div></div>
                  <label className="tgl"><input type="checkbox" checked={config.failOpenPayments} onChange={e => handleCfg('failOpenPayments', e.target.checked)} /><span className="tgl-t" /></label>
                </div>
                <div className="cfg-row" style={{borderBottom:'none'}}>
                  <div><div className="cfg-n">Encrypt IndexedDB</div><div className="cfg-d">Encrypt payloads at rest</div></div>
                  <label className="tgl"><input type="checkbox" checked={config.localEncryption} onChange={e => handleCfg('localEncryption', e.target.checked)} /><span className="tgl-t" /></label>
                </div>
              </div>
            </div>

            {/* Diagnostics */}
            <div className="card">
              <div className="card-hd"><div className="card-ht"><FaBug /> Diagnostics</div></div>
              <div className="card-p">
                <div className="diag">
                  <button className="d-btn" onClick={exportJSON}><FaArrowDown /> Export Queue JSON</button>
                  <button className="d-btn d-red" onClick={factoryReset}><FaTrash /> Factory Reset DB</button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <style jsx>{`
        .page {
          font-family: 'Inter', -apple-system, sans-serif;
          max-width: 1280px;
          margin: 0 auto;
          padding: 4px 20px 40px;
          color: #1e293b;
        }

        /* HEADER */
        .hdr { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; margin-bottom: 16px; flex-wrap: wrap; }
        .hdr-l { display: flex; flex-direction: column; gap: 6px; }
        .back { display: inline-flex; align-items: center; gap: 6px; color: #94a3b8; font-size: 12px; font-weight: 500; text-decoration: none; transition: color .2s; }
        .back:hover { color: #FF7A00; }
        .hdr-row { display: flex; align-items: center; gap: 12px; }
        .hdr-title { font-family: 'Outfit', sans-serif; font-size: 22px; font-weight: 700; margin: 0; letter-spacing: -0.03em; color: #0f172a; }

        .pill { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; padding: 4px 11px; border-radius: 20px; }
        .pill-ok   { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
        .pill-warn { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
        .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .dot-pulse { animation: dp 1.8s ease-in-out infinite; }
        @keyframes dp { 0%,100%{opacity:1} 50%{opacity:.3} }

        .hdr-r { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

        /* Install button */
        .btn-install {
          display: inline-flex; align-items: center; gap: 7px;
          background: #f0fdf4; color: #15803d;
          border: 1px solid #86efac; border-radius: 9px;
          padding: 8px 16px; font-size: 12px; font-weight: 700;
          cursor: pointer; transition: all .2s;
        }
        .btn-install:hover { background: #dcfce7; border-color: #4ade80; }

        .result { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; padding: 7px 12px; border-radius: 8px; max-width: 260px; }
        .res-ok  { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
        .res-err { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }

        .btn-pri { display: inline-flex; align-items: center; gap: 8px; background: #FF7A00; color: #fff; border: none; border-radius: 9px; padding: 9px 20px; font-size: 13px; font-weight: 700; cursor: pointer; transition: background .2s, transform .1s; white-space: nowrap; }
        .btn-pri:hover { background: #e06900; }
        .btn-pri:active { transform: scale(.97); }
        .btn-busy { background: #e2e8f0 !important; color: #94a3b8 !important; cursor: not-allowed; }
        .btn-sec { display: inline-flex; align-items: center; gap: 7px; background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; border-radius: 9px; padding: 8px 16px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all .2s; white-space: nowrap; }
        .btn-sec:hover { background: #f1f5f9; color: #1e293b; border-color: #cbd5e1; }

        .spin { animation: spin .9s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* STATS */
        .stats { display: flex; align-items: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 20px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .stat { display: flex; align-items: center; gap: 12px; flex: 1; }
        .stat-cta { cursor: pointer; padding: 6px 10px; border-radius: 10px; transition: background .2s; }
        .stat-cta:hover { background: #fff4e6; }
        .stat-sep { width: 1px; height: 36px; background: #e2e8f0; margin: 0 20px; flex-shrink: 0; }
        .stat-ico { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
        .stat-n { font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 700; color: #0f172a; line-height: 1; }
        .cta-n { color: #FF7A00 !important; }
        .stat-l { font-size: 11px; color: #94a3b8; margin-top: 3px; font-weight: 500; }

        /* GRID */
        .grid { display: grid; grid-template-columns: 1fr 300px; gap: 14px; align-items: start; }
        @media (max-width: 1024px) { .grid { grid-template-columns: 1fr; } }
        .right { display: flex; flex-direction: column; gap: 14px; }

        /* CARD */
        .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .card-hd { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px; border-bottom: 1px solid #f1f5f9; background: #f8fafc; }
        .card-ht { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #334155; }
        .card-p { padding: 14px 16px; }

        .chip { font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 20px; }
        .chip-o { background: #fff4e6; color: #FF7A00; border: 1px solid #fed7aa; }
        .chip-g { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
        .tag { font-size: 10px; font-weight: 700; color: #94a3b8; background: #f1f5f9; padding: 2px 8px; border-radius: 5px; text-transform: uppercase; letter-spacing: .05em; border: 1px solid #e2e8f0; }

        /* STATE */
        .cstate { padding: 48px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .ring { width: 28px; height: 28px; border: 2px solid #e2e8f0; border-top-color: #FF7A00; border-radius: 50%; animation: spin .9s linear infinite; }
        .cstate-txt { color: #94a3b8; font-size: 13px; }
        .ok-ring { width: 56px; height: 56px; border-radius: 50%; background: #f0fdf4; border: 1px solid #bbf7d0; display: flex; align-items: center; justify-content: center; }
        .ok-ico { font-size: 22px; color: #22c55e; }
        .empty-t { font-size: 15px; font-weight: 700; color: #0f172a; }
        .empty-s { font-size: 12px; color: #94a3b8; max-width: 260px; line-height: 1.6; }

        /* TABLE */
        .tbl-wrap { overflow-x: auto; margin: 0 -1px; }
        .tbl { width: 100%; border-collapse: collapse; }
        .tbl th { padding: 9px 14px; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid #f1f5f9; text-align: left; background: #f8fafc; }
        .tbl td { padding: 11px 14px; font-size: 12px; color: #475569; border-bottom: 1px solid #f8fafc; vertical-align: middle; }
        .tbl tbody tr:last-child td { border-bottom: none; }
        .tbl tbody tr:hover td { background: #f8fafc; }
        .tr-hi td { background: #fff7ed !important; }
        .td-t { color: #94a3b8; font-size: 11px; white-space: nowrap; }

        .method { display: inline-block; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 4px; text-transform: uppercase; }
        .m-post   { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
        .m-put    { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
        .m-patch  { background: #faf5ff; color: #7c3aed; border: 1px solid #e9d5ff; }
        .m-delete { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }

        .rn { font-weight: 600; color: #1e293b; text-transform: capitalize; font-size: 12px; }
        .rp { font-size: 10px; color: #94a3b8; font-family: monospace; margin-top: 1px; }

        .st { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; }
        .st-q { background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; }
        .st-c { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
        .st-f { background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; font-weight: 800; }

        .acts { display: flex; gap: 4px; justify-content: flex-end; }
        .ab { width: 26px; height: 26px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff; color: #94a3b8; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; transition: all .15s; }
        .ab:hover { background: #f1f5f9; color: #334155; border-color: #cbd5e1; }
        .ab-g:hover { background: #f0fdf4; color: #15803d; border-color: #86efac; }
        .ab-r:hover { background: #fef2f2; color: #dc2626; border-color: #fca5a5; }

        /* INSPECTOR */
        .close-x { background: none; border: none; color: #94a3b8; font-size: 14px; cursor: pointer; transition: color .15s; }
        .close-x:hover { color: #1e293b; }
        .kvs { display: flex; flex-direction: column; gap: 12px; }
        .kv { display: flex; flex-direction: column; gap: 3px; }
        .kk { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .06em; }
        .kv-v { font-size: 12px; color: #334155; font-weight: 500; }
        .kv-v.mono { font-family: monospace; font-size: 10px; background: #f8fafc; padding: 4px 8px; border-radius: 6px; border: 1px solid #e2e8f0; overflow-x: auto; display: block; color: #334155; }
        .kv-v.amber { color: #b45309; }
        .err-v { background: #fef2f2; color: #dc2626; font-family: monospace; font-size: 10px; padding: 8px; border-radius: 6px; border: 1px solid #fecaca; line-height: 1.5; white-space: pre-wrap; margin-top: 2px; }
        .payload { background: #0f172a; color: #67e8f9; font-family: monospace; font-size: 10px; padding: 10px; border-radius: 8px; max-height: 160px; overflow: auto; margin: 2px 0 0; border: 1px solid #1e293b; }

        /* CONFIG */
        .cfg-list { display: flex; flex-direction: column; }
        .cfg-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; }
        .cfg-sep { height: 8px; background: #f8fafc; border-top: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; }
        .cfg-blk { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 8px; }
        .cfg-blk-hd { display: flex; align-items: center; justify-content: space-between; }
        .cfg-n { font-size: 12px; font-weight: 600; color: #334155; }
        .cfg-d { font-size: 11px; color: #94a3b8; margin-top: 2px; }
        .vbadge { font-size: 11px; font-weight: 700; color: #FF7A00; background: #fff4e6; padding: 2px 9px; border-radius: 10px; border: 1px solid #fed7aa; }

        /* Toggle */
        .tgl { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; }
        .tgl input { opacity: 0; width: 0; height: 0; }
        .tgl-t { position: absolute; inset: 0; cursor: pointer; background: #e2e8f0; border-radius: 20px; transition: .25s; }
        .tgl-t:before { position: absolute; content: ''; width: 14px; height: 14px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: .25s; box-shadow: 0 1px 3px rgba(0,0,0,.15); }
        .tgl input:checked + .tgl-t { background: #FF7A00; }
        .tgl input:checked + .tgl-t:before { transform: translateX(16px); }

        /* Range */
        .rng { -webkit-appearance: none; width: 100%; height: 4px; border-radius: 2px; background: #e2e8f0; outline: none; }
        .rng::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #FF7A00; cursor: pointer; box-shadow: 0 0 0 3px rgba(255,122,0,.15); }
        .rng-m { display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; font-weight: 600; margin-top: 4px; }

        /* Number */
        .num { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 11px; font-size: 13px; color: #334155; font-weight: 600; outline: none; width: 100%; transition: border-color .2s; }
        .num:focus { border-color: #FF7A00; }

        /* DIAGNOSTICS */
        .diag { display: flex; flex-direction: column; gap: 8px; }
        .d-btn { width: 100%; border-radius: 8px; padding: 9px 12px; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px; transition: all .15s; background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; }
        .d-btn:hover { background: #f1f5f9; color: #334155; border-color: #cbd5e1; }
        .d-red { color: #dc2626 !important; border-color: #fecaca !important; background: #fef2f2 !important; }
        .d-red:hover { background: #fee2e2 !important; border-color: #fca5a5 !important; }

        @media (max-width: 768px) {
          .hdr { flex-direction: column; align-items: flex-start; gap: 12px; }
          .hdr-r { width: 100%; flex-wrap: wrap; }
          .stats { flex-wrap: wrap; gap: 10px; }
          .stat-sep { display: none; }
          .stat { width: 45%; }
        }
      `}</style>
    </DashboardLayout>
  );
}
