import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import DashboardLayout from '../../components/DashboardLayout';
import ModuleGate from '../../components/ModuleGate';
import api from '../../utils/api';
import { FaArrowLeft, FaSync, FaBan, FaCheckCircle, FaTrash, FaCogs, FaClock, FaBug, FaDatabase, FaArrowDown, FaEye, FaServer, FaDownload } from 'react-icons/fa';
import { isKnownOffline } from '../../utils/networkState';
import { getQueuedOperations, discardSyncQueueEntry, markOperationPending, getLastSyncTime } from '../../utils/offlineStore';
import { reconnectAndSync, bootstrapOfflineData } from '../../utils/offlineSync';
import { toDisplayItems } from '../../utils/printUtils';
export default function OfflineSyncPage() {
  const [offline, setOffline] = useState(false);
  const [syncQueue, setSyncQueue] = useState([]);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedOp, setSelectedOp] = useState(null);
  const [detailTab, setDetailTab] = useState('structured');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [config, setConfig] = useState({ autoSyncEnabled: false, syncInterval: 60, leaseBlockSize: 100, failOpenPayments: false, localEncryption: false, creditEnabled: false });
  const [modal, setModal] = useState(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const showConfirm = (message, onConfirm) => {
    setModal({
      type: 'confirm',
      message,
      onConfirm: () => {
        onConfirm();
        setModal(null);
      },
      onCancel: () => setModal(null)
    });
  };

  const showAlert = (message, onAlert) => {
    setModal({
      type: 'alert',
      message,
      onConfirm: () => {
        if (onAlert) onAlert();
        setModal(null);
      }
    });
  };

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
            const m = { autoSyncEnabled: d.offlineSyncEnabled ?? false, syncInterval: d.offlineSyncInterval ?? 60, leaseBlockSize: d.offlineLeaseBlockSize ?? 100, failOpenPayments: d.offlineFailOpenPayments ?? false, localEncryption: d.offlineLocalEncryption ?? false, creditEnabled: d.creditEnabled ?? false };
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

  const renderPayloadView = (op) => {
    if (!op || !op.payload) return null;

    const isOrder = op.entity === 'orders' || op.path?.includes('/orders');
    if (!isOrder) {
      return <pre className="payload">{JSON.stringify(op.payload, null, 2)}</pre>;
    }

    const payload = op.payload;
    const items = toDisplayItems(payload);
    
    // Status Badge Helpers
    const getStatusStyle = (status) => {
      const s = String(status || '').toUpperCase();
      if (s === 'COMPLETED' || s === 'PAID') {
        return { background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', width: 'fit-content', textTransform: 'uppercase' };
      }
      if (s === 'DRAFT' || s === 'PENDING') {
        return { background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', width: 'fit-content', textTransform: 'uppercase' };
      }
      return { background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', width: 'fit-content', textTransform: 'uppercase' };
    };

    return (
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
        
        {/* Section 1: Order Metadata */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
          {payload.orderNo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Order No</span>
              <span style={{ fontSize: '12px', color: '#FF7A00', fontWeight: '700', fontFamily: 'monospace' }}>{payload.orderNo}</span>
            </div>
          )}
          {payload.tableNumber && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Table</span>
              <span style={{ fontSize: '12px', color: '#0f172a', fontWeight: '700' }}>Table {payload.tableNumber}</span>
            </div>
          )}
          {payload.orderType && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Order Type</span>
              <span style={{ fontSize: '11px', color: '#334155', fontWeight: '600' }}>{payload.orderType}</span>
            </div>
          )}
          {payload.orderStatus && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</span>
              <span style={getStatusStyle(payload.orderStatus)}>{payload.orderStatus}</span>
            </div>
          )}
          {payload.paymentStatus && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payment</span>
              <span style={getStatusStyle(payload.paymentStatus)}>{payload.paymentStatus}</span>
            </div>
          )}
          {payload.customerName && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Customer</span>
              <span style={{ fontSize: '11px', color: '#334155', fontWeight: '600' }}>{payload.customerName}</span>
            </div>
          )}
        </div>

        {/* Section 2: Items List */}
        {items.length > 0 && (
          <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
            <span style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '8px' }}>
              Items ({items.length})
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', maxHeight: '160px', overflowY: 'auto' }}>
              {items.map((item, idx) => {
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '11px', paddingBottom: idx === items.length - 1 ? '0' : '6px', borderBottom: idx === items.length - 1 ? 'none' : '1px dashed #f1f5f9' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name || 'Unknown Product'}</span>
                      {item.variant_name && <span style={{ fontSize: '9px', color: '#94a3b8', marginTop: '1px' }}>{item.variant_name}</span>}
                    </div>
                    <span style={{ color: '#64748b', fontWeight: '700', fontSize: '10px', padding: '2px 6px', background: '#f1f5f9', borderRadius: '4px' }}>x{item.quantity}</span>
                    <span style={{ fontWeight: '700', color: '#334155', minWidth: '65px', textAlign: 'right' }}>₹{Number(item.line_total).toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Section 3: Summary / Totals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {payload.subTotal !== undefined && (
            <div style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748b' }}>
              <span>Subtotal</span>
              <span style={{ fontWeight: '600' }}>₹{Number(payload.subTotal).toFixed(2)}</span>
            </div>
          )}
          {payload.taxAmount !== undefined && (
            <div style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748b' }}>
              <span>Tax</span>
              <span style={{ fontWeight: '600' }}>₹{Number(payload.taxAmount).toFixed(2)}</span>
            </div>
          )}
          {payload.discountAmount !== undefined && payload.discountAmount > 0 && (
            <div style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#dc2626' }}>
              <span>Discount</span>
              <span style={{ fontWeight: '600' }}>-₹{Number(payload.discountAmount).toFixed(2)}</span>
            </div>
          )}
          {(payload.grandTotal !== undefined || payload.total !== undefined) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#0f172a', fontWeight: '700', borderTop: '1px solid #e2e8f0', paddingTop: '10px', marginTop: '4px' }}>
              <span>Grand Total</span>
              <span style={{ fontSize: '14px', color: '#FF7A00' }}>₹{Number(payload.grandTotal || payload.total || 0).toFixed(2)}</span>
            </div>
          )}
        </div>

      </div>
    );
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
    showConfirm('Discard this entry?', async () => {
      await discardSyncQueueEntry(id); await loadQ();
      if (selectedOp?.id === id) setSelectedOp(null);
      setSelectedIds(prev => prev.filter(x => x !== id));
    });
  };

  const handleRetry = async (id) => { await markOperationPending(id); await loadQ(); };

  const handleBulkRetry = async () => {
    if (selectedIds.length === 0) return;
    for (const id of selectedIds) {
      await markOperationPending(id);
    }
    await loadQ();
    setSelectedIds([]);
  };

  const handleBulkDiscard = async () => {
    if (selectedIds.length === 0) return;
    showConfirm(`Discard the ${selectedIds.length} selected entries?`, async () => {
      for (const id of selectedIds) {
        await discardSyncQueueEntry(id);
      }
      await loadQ();
      if (selectedIds.includes(selectedOp?.id)) setSelectedOp(null);
      setSelectedIds([]);
    });
  };

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

  // Export ALL entries from IndexedDB including SYNCED ones (emergency recovery)
  const exportFullDB = async () => {
    try {
      const dbReq = indexedDB.open('cafeqr-offline');
      dbReq.onsuccess = () => {
        const db = dbReq.result;
        const allData = {};
        const storeNames = Array.from(db.objectStoreNames);
        let remaining = storeNames.length;
        if (remaining === 0) {
          showAlert('Database is empty.');
          db.close();
          return;
        }
        const tx = db.transaction(storeNames, 'readonly');
        storeNames.forEach(name => {
          const store = tx.objectStore(name);
          const req = store.getAll();
          req.onsuccess = () => {
            allData[name] = req.result || [];
            remaining--;
            if (remaining === 0) {
              const a = document.createElement('a');
              a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(allData, null, 2));
              a.download = `cafeqr-full-backup-${Date.now()}.json`;
              document.body.appendChild(a); a.click(); a.remove();
              db.close();
            }
          };
        });
      };
      dbReq.onerror = () => showAlert('Failed to open database.');
    } catch (e) {
      showAlert('Export failed: ' + e.message);
    }
  };

  const factoryReset = () => {
    showConfirm('This permanently deletes all local IndexedDB data. Proceed?', () => {
      indexedDB.deleteDatabase('cafeqr-offline').onsuccess = () => {
        showAlert('Reset. Reloading…', () => {
          window.location.reload();
        });
      };
    });
  };

  return (
    <DashboardLayout title="Offline Sync">
      <Head><title>Offline Sync | Cafe QR</title></Head>
      <ModuleGate>
      <div className="page">

        {/* ── HEADER ACTIONS ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className={`pill ${offline ? 'pill-warn' : 'pill-ok'}`}>
              <span className={`dot ${offline ? '' : 'dot-pulse'}`} />
              {offline ? 'Offline' : 'Online'}
            </span>
            {syncResult && (
              <div className={`result ${syncResult.ok ? 'res-ok' : 'res-err'}`} style={{ margin: 0 }}>
                {syncResult.ok ? <FaCheckCircle /> : <FaBan />}
                <span>{syncResult.msg}</span>
              </div>
            )}
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {showInstall && !offline && (
              <button className="btn-install" onClick={handleInstall}>
                <FaDownload /> Install App
              </button>
            )}
            <button className="btn-sec" onClick={() => setShowConfigModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <FaCogs /> Settings
            </button>
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
          
          <div className="stat">
            <div className="stat-ico" style={{background:'#eff6ff', color:'#3b82f6'}}><FaClock /></div>
            <div>
              <div className="stat-n">{lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—'}</div>
              <div className="stat-l">Last Sync</div>
            </div>
          </div>
          
          <div className="stat">
            <div className="stat-ico" style={{background:'#f5f3ff', color:'#7c3aed'}}><FaServer /></div>
            <div>
              <div className="stat-n" style={{color: offline ? '#d97706' : '#059669'}}>{offline ? 'Paused' : 'Active'}</div>
              <div className="stat-l">Sync Engine</div>
            </div>
          </div>
          
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
              <>
                {selectedIds.length > 0 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#fff7ed',
                    borderBottom: '1px solid #fed7aa',
                    padding: '10px 16px',
                    fontSize: '12px',
                    color: '#c2410c',
                    fontWeight: '600'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ background: '#ffedd5', color: '#ea580c', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' }}>
                        {selectedIds.length} Selected
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button 
                        onClick={handleBulkRetry}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: '#fff',
                          border: '1px solid #fdba74',
                          borderRadius: '6px',
                          padding: '5px 12px',
                          color: '#ea580c',
                          fontSize: '11px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                      >
                        <FaSync /> Retry Selected
                      </button>
                      <button 
                        onClick={handleBulkDiscard}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: '#fee2e2',
                          border: '1px solid #fca5a5',
                          borderRadius: '6px',
                          padding: '5px 12px',
                          color: '#b91c1c',
                          fontSize: '11px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                      >
                        <FaTrash /> Discard Selected
                      </button>
                    </div>
                  </div>
                )}
                <div className="erp-table-wrapper desk-only">
                  <table className="erp-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px', textAlign: 'center', paddingRight: '0' }}>
                          <input 
                            type="checkbox" 
                            checked={syncQueue.length > 0 && selectedIds.length === syncQueue.length} 
                            onChange={(e) => {
                              if (e.target.checked) setSelectedIds(syncQueue.map(op => op.id));
                              else setSelectedIds([]);
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                        </th>
                        <th>Time</th>
                        <th>Method</th>
                        <th>Resource</th>
                        <th>Status</th>
                        <th style={{textAlign:'right'}}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syncQueue.map(op => {
                        const st = String(op.status || '').toUpperCase();
                        const sc = st === 'CONFLICT' ? 'c' : op.attempts > 3 ? 'f' : 'q';
                        return (
                          <tr key={op.id} className={selectedOp?.id === op.id ? 'tr-hi' : ''}>
                            <td style={{ width: '40px', textAlign: 'center', paddingRight: '0' }}>
                              <input 
                                type="checkbox" 
                                checked={selectedIds.includes(op.id)} 
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedIds(prev => [...prev, op.id]);
                                  else setSelectedIds(prev => prev.filter(x => x !== op.id));
                                }}
                                style={{ cursor: 'pointer' }}
                              />
                            </td>
                            <td className="td-t">
                              <div style={{ color: '#475569', fontWeight: '500' }}>
                                {new Date(op.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                              </div>
                              <div style={{ fontSize: '10px', marginTop: '2px' }}>
                                {new Date(op.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </td>
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
              </>
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
                    <div className="kv">
                      <div className="kk-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div className="kk">Payload</div>
                        <div className="tab-switch" style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '2px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                          <button
                            type="button"
                            className="tab-btn"
                            style={{
                              fontSize: '10px',
                              fontWeight: '700',
                              border: 'none',
                              background: detailTab === 'structured' ? '#fff' : 'transparent',
                              color: detailTab === 'structured' ? '#FF7A00' : '#64748b',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              boxShadow: detailTab === 'structured' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                              transition: 'all 0.15s'
                            }}
                            onClick={() => setDetailTab('structured')}
                          >
                            Structured
                          </button>
                          <button
                            type="button"
                            className="tab-btn"
                            style={{
                              fontSize: '10px',
                              fontWeight: '700',
                              border: 'none',
                              background: detailTab === 'json' ? '#fff' : 'transparent',
                              color: detailTab === 'json' ? '#FF7A00' : '#64748b',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              boxShadow: detailTab === 'json' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                              transition: 'all 0.15s'
                            }}
                            onClick={() => setDetailTab('json')}
                          >
                            JSON
                          </button>
                        </div>
                      </div>
                      {detailTab === 'structured' ? renderPayloadView(selectedOp) : <pre className="payload">{JSON.stringify(selectedOp.payload, null, 2)}</pre>}
                    </div>
                  </div>
                </div>
              </div>
            )}


            {/* Diagnostics */}
            <div className="card">
              <div className="card-hd"><div className="card-ht"><FaBug /> Diagnostics</div></div>
              <div className="card-p">
                <div className="diag">
                  <button className="d-btn" onClick={exportJSON}><FaArrowDown /> Export Queue JSON</button>
                  <button className="d-btn" onClick={exportFullDB}><FaDatabase /> Export Full Database</button>
                  <button className="d-btn d-red" onClick={factoryReset}><FaTrash /> Factory Reset DB</button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {showConfigModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9990,
          padding: '20px'
        }}>
          <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '440px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'Inter', sans-serif"
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid #f1f5f9'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', color: '#0f172a', fontSize: '15px' }}>
                <FaCogs style={{ color: '#FF7A00' }} /> Offline Sync Settings
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="cfg-list" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#334155' }}>Auto-Sync</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Replay queue on reconnect</div>
                  </div>
                  <label className="tgl"><input type="checkbox" checked={config.autoSyncEnabled} onChange={e => handleCfg('autoSyncEnabled', e.target.checked)} /><span className="tgl-t" /></label>
                </div>
                
                <div style={{ height: '1px', background: '#e2e8f0' }} />
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#334155' }}>Sync Interval</div>
                    <span className="vbadge">{config.syncInterval}s</span>
                  </div>
                  <input type="range" min="30" max="300" step="30" value={config.syncInterval} onChange={e => handleCfg('syncInterval', +e.target.value)} className="rng" />
                  <div className="rng-m"><span>30s</span><span>1m</span><span>3m</span><span>5m</span></div>
                </div>

                <div style={{ height: '1px', background: '#e2e8f0' }} />
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#334155' }}>Lease Block</div>
                    <span className="vbadge">{config.leaseBlockSize}</span>
                  </div>
                  <input type="number" min="10" max="500" step="10" value={config.leaseBlockSize} onChange={e => handleCfg('leaseBlockSize', +e.target.value)} className="num" />
                </div>
                
                {config.creditEnabled && (
                  <>
                    <div style={{ height: '1px', background: '#e2e8f0' }} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#334155' }}>Credit Offline</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>B2B credit during dropout</div>
                      </div>
                      <label className="tgl"><input type="checkbox" checked={config.failOpenPayments} onChange={e => handleCfg('failOpenPayments', e.target.checked)} /><span className="tgl-t" /></label>
                    </div>
                  </>
                )}

                <div style={{ height: '1px', background: '#e2e8f0' }} />
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#334155' }}>Encrypt IndexedDB</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Encrypt payloads at rest</div>
                  </div>
                  <label className="tgl"><input type="checkbox" checked={config.localEncryption} onChange={e => handleCfg('localEncryption', e.target.checked)} /><span className="tgl-t" /></label>
                </div>

              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '12px 20px',
              borderTop: '1px solid #f1f5f9',
              background: '#f8fafc',
              borderRadius: '0 0 12px 12px'
            }}>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                style={{
                  padding: '8px 20px',
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#fff',
                  background: '#FF7A00',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = '#e06900'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = '#FF7A00'; }}
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {modal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '400px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            fontFamily: "'Inter', sans-serif"
          }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '700',
              color: '#0f172a',
              margin: 0
            }}>
              {modal.type === 'confirm' ? 'Confirmation' : 'Notification'}
            </h3>
            
            <p style={{
              fontSize: '14px',
              color: '#475569',
              margin: 0,
              lineHeight: 1.5
            }}>
              {modal.message}
            </p>
            
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '8px'
            }}>
              {modal.type === 'confirm' && (
                <button
                  type="button"
                  onClick={modal.onCancel}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#64748b',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={modal.onConfirm}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#fff',
                  background: '#FF7A00',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = '#e06900'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = '#FF7A00'; }}
              >
                {modal.type === 'confirm' ? 'Confirm' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

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
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
        @media (max-width: 1024px) { .stats { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 640px) { .stats { grid-template-columns: 1fr; } }
        .stat { display: flex; align-items: center; gap: 14px; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.02), 0 4px 6px -1px rgba(0,0,0,0.01); transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .stat:hover { transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02); }
        .stat-cta { cursor: pointer; border: 1px solid #ffe8cc; }
        .stat-cta:hover { background: #fffbf7; border-color: #ffd8a8; }
        .stat-cta:active { transform: translateY(0); }
        .stat-ico { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
        .stat-n { font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1; }
        .cta-n { color: #FF7A00 !important; }
        .stat-l { font-size: 11px; color: #94a3b8; margin-top: 5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }

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
        .erp-table-wrapper { overflow-x: auto; margin: 0 -1px; }
        .erp-table { width: 100%; border-collapse: collapse; }
        .erp-table th { text-align: left; padding: 14px 16px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #FF7A00; background: #fff; }
        .erp-table td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #475569; vertical-align: middle; }
        .erp-table tbody tr:hover td { background: #f8fafc; }
        .tr-hi td { background: #fff7ed !important; }
        .td-t { color: #94a3b8; font-size: 12px; white-space: nowrap; }

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

        /* STRUCTURED PAYLOAD */
        .structured-payload { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 12px; margin-top: 4px; }
        .sp-section { width: 100%; }
        .sp-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        .sp-field { display: flex; flex-direction: column; gap: 2px; }
        .sp-lbl-sub { font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
        .sp-val { font-size: 11px; color: #334155; font-weight: 600; text-transform: capitalize; }
        .sp-val.highlight { color: #FF7A00; font-family: monospace; font-size: 11px; }
        .badge-draft { background: #f1f5f9; color: #475569; padding: 1px 6px; border-radius: 4px; font-size: 9px; display: inline-block; width: fit-content; text-transform: uppercase; font-weight: 700; }
        .badge-completed { background: #dcfce7; color: #15803d; padding: 1px 6px; border-radius: 4px; font-size: 9px; display: inline-block; width: fit-content; text-transform: uppercase; font-weight: 700; }
        .badge-void { background: #fef2f2; color: #991b1b; padding: 1px 6px; border-radius: 4px; font-size: 9px; display: inline-block; width: fit-content; text-transform: uppercase; font-weight: 700; }
        .badge-paid { background: #dcfce7; color: #15803d; padding: 1px 6px; border-radius: 4px; font-size: 9px; display: inline-block; width: fit-content; text-transform: uppercase; font-weight: 700; }
        .badge-unpaid { background: #fef3c7; color: #b45309; padding: 1px 6px; border-radius: 4px; font-size: 9px; display: inline-block; width: fit-content; text-transform: uppercase; font-weight: 700; }
        .sp-items { display: flex; flex-direction: column; gap: 6px; max-height: 140px; overflow-y: auto; background: #fff; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0; }
        .sp-item-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; padding: 4px 0; border-bottom: 1px dashed #f1f5f9; }
        .sp-item-row:last-child { border-bottom: none; }
        .sp-item-desc { display: flex; flex-direction: column; flex: 1; min-width: 0; }
        .sp-item-name { font-weight: 600; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sp-item-sub { font-size: 9px; color: #94a3b8; }
        .sp-item-qty { color: #64748b; font-weight: 700; font-size: 10px; width: 30px; text-align: center; }
        .sp-item-total { font-weight: 700; color: #334155; text-align: right; }
        .sp-total-grid { display: flex; flex-direction: column; gap: 5px; }
        .sp-total-row { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #64748b; }
        .sp-total-row.discount { color: #dc2626; }
        .sp-total-row.final { font-size: 13px; color: #0f172a; border-top: 1px dashed #e2e8f0; padding-top: 6px; margin-top: 2px; }

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
      </ModuleGate>
    </DashboardLayout>
  );
}
