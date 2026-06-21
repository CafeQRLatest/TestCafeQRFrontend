// pages/owner/sequences.js — Document Sequence Configuration
import React, { useState, useEffect } from 'react';
import { useNotification } from '../../context/NotificationContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import CafeQRPopup from '../../components/CafeQRPopup';
import NiceSelect from '../../components/NiceSelect';
import api from '../../utils/api';
import { FaSearch, FaChevronRight, FaFileAlt, FaCheckCircle, FaPlus, FaFileInvoice } from 'react-icons/fa';

export default function SequencesPage() {
  return (<RoleGate allowedRoles={['ADMIN', 'SUPER_ADMIN', 'STAFF']} requiredMenu="Document Sequences"><SequencesContent /></RoleGate>);
}

function SequencesContent() {
  const { notify } = useNotification();
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => { fetchSequences(); }, []);

  const fetchSequences = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/v1/settings/sequences');
      if (res.data.success) {
        setSequences(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to load sequences:', err);
    } finally {
      setLoading(false);
    }
  };

  const getDefaultPrefix = (type) => {
    switch(type) {
      case 'SALE_ORDER': return 'SO-{YYYY}-';
      case 'PURCHASE_ORDER': return 'PO-{YYYY}-';
      case 'EXPENSE': return 'EX-{YYYY}-';
      case 'CUSTOMER_INVOICE': return 'INV-{YYYY}-';
      case 'VENDOR_BILL': return 'BILL-{YYYY}-';
      case 'EXPENSE_RECEIPT': return 'ER-{YYYY}-';
      case 'INBOUND_PAYMENT': return 'REC-{YYYY}-';
      case 'OUTBOUND_PAYMENT': return 'PAY-{YYYY}-';
      default: return '{YYYY}-';
    }
  };

  const handleSave = async () => {
    // Ensure numeric fields aren't accidentally saved as empty strings
    // Also use defaults if prefix/suffix are left as placeholders (empty)
    const payload = {
      ...selected,
      id: selected.id || null,
      prefix: selected.prefix || getDefaultPrefix(selected.documentType),
      suffix: selected.suffix || getDefaultSuffix(selected.documentType),
      paddingLength: selected.paddingLength === '' ? 7 : parseInt(selected.paddingLength),
      nextNumber: selected.nextNumber === '' ? 1 : parseInt(selected.nextNumber)
    };

    setSaving(true);
    try {
      let resp;
      if (payload.id) {
        resp = await api.put(`/api/v1/settings/sequences/${payload.id}`, payload);
      } else {
        resp = await api.post(`/api/v1/settings/sequences`, payload);
      }
      if (resp.data.success) {
        notify('success', 'Sequence configuration saved successfully!');
        fetchSequences();
        setSelected(null);
      }
    } catch (err) {
      console.error("Error saving sequence", err);
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to save sequence configuration';
      notify('error', msg);
    } finally {
      setSaving(false);
    }
  };

  const getDocTypeName = (type) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getDefaultSuffix = (type) => '-{BRANCH_CODE}';

  const resolvePlaceholder = (type, isPrefix) => {
    const year = new Date().getFullYear();
    const raw = isPrefix ? getDefaultPrefix(type) : getDefaultSuffix(type);
    return raw.replace(/{YYYY}/gi, year).replace(/{BRANCH_CODE}/gi, 'HQ');
  };

  const displayVal = (val, type, isPrefix) => {
    const def = isPrefix ? getDefaultPrefix(type) : getDefaultSuffix(type);
    if (!val || val === def) return '';
    return val;
  };

  const formatPreview = (seq) => {
    if (!seq) return '';
    const year = new Date().getFullYear();
    
    // Fallback to defaults if empty for live preview
    const rawPfx = seq.prefix || getDefaultPrefix(seq.documentType);
    const rawSfx = seq.suffix || getDefaultSuffix(seq.documentType);

    const pfx = rawPfx.replace(/{YYYY}/gi, year).replace(/{BRANCH_CODE}/gi, 'HQ');
    const sfx = rawSfx.replace(/{YYYY}/gi, year).replace(/{BRANCH_CODE}/gi, 'HQ');
    
    const nextNum = (seq.nextNumber === '' || isNaN(seq.nextNumber) || seq.nextNumber == null) ? 1 : seq.nextNumber;
    const padLen = (seq.paddingLength === '' || isNaN(seq.paddingLength) || seq.paddingLength == null) ? 7 : seq.paddingLength;
    
    const pad = String(nextNum).padStart(padLen, '0');
    return `${pfx}${pad}${sfx}`;
  };

  const filtered = sequences.filter(s => 
    s.documentType.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (s.prefix || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="loading-state"><span>Loading Configurations...</span></div>;

  return (
    <DashboardLayout title="Document Sequences" showBack={true}>
      <div className="erp-container">
        <div className="erp-main-card">
          <header className="erp-header">
            <div className="erp-page-title"><FaFileAlt /> Document Sequences</div>
            <div className="erp-actions">
              <button 
                className="erp-btn primary"
                onClick={() => setSelected({ documentType: 'SALE_ORDER', prefix: '', suffix: '', paddingLength: 7, nextNumber: 1, isActive: true })}
              >
                <FaPlus /> Add Sequence
              </button>
            </div>
          </header>

          <div className="erp-filter-bar">
            <div className="erp-search-field">
              <FaSearch />
              <input placeholder="Search sequences..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>

          <div className="erp-table-wrapper desk-only">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Document Type</th>
                  <th>Prefix</th>
                  <th>Padding</th>
                  <th>Suffix</th>
                  <th>Next Number</th>
                  <th>Live Preview</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} onClick={() => setSelected(s)} className="clickable-row">
                    <td><span className="name-text">{getDocTypeName(s.documentType)}</span></td>
                    <td><span className="code-cell">{s.prefix || '—'}</span></td>
                    <td>{s.paddingLength}</td>
                    <td><span className="code-cell">{s.suffix || '—'}</span></td>
                    <td>{s.nextNumber}</td>
                    <td><span className="preview-badge">{formatPreview(s)}</span></td>
                    <td>
                      <span className={`status-pill ${s.isActive ? 'active' : 'inactive'}`}>
                        <span className="status-dot"></span>{s.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td onClick={e => e.stopPropagation()} className="row-actions text-right">
                      <button className="table-btn" onClick={() => setSelected(s)}><FaChevronRight /></button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="empty-state">
                      <div className="empty-icon"><FaFileAlt /></div>
                      <div className="empty-msg">No sequences found</div>
                      <div className="empty-sub">Create orders or invoices to auto-initialize their sequences.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="erp-mobile-list mobile-only">
            {filtered.map(s => (
              <div key={s.id} className="mobile-card" onClick={() => setSelected(s)}>
                <div className="card-avatar config"><FaFileAlt /></div>
                <div className="card-info">
                  <span className="card-name">{getDocTypeName(s.documentType)}</span>
                  <span className="card-sub">Next: {formatPreview(s)}</span>
                </div>
                <div className="card-action"><FaChevronRight /></div>
              </div>
            ))}
          </div>
        </div>

        {selected && (
          <CafeQRPopup 
            title={`Sequence Configuration`} 
            onClose={() => setSelected(null)} 
            onSave={handleSave} 
            saveLabel="Save Rule" 
            isSaving={saving} 
            icon={FaFileInvoice}
            maxWidth="500px"
          >
            <div className="drawer-form">
              <div className="info-banner">
                Configure numbering for <strong>{getDocTypeName(selected.documentType)}</strong>. 
                Use <b>{'{YYYY}'}</b> for current year or <b>{'{BRANCH_CODE}'}</b>.
              </div>

              {!selected.id && (
                <div className="input-group">
                  <label>Document Type</label>
                  <NiceSelect
                    value={selected.documentType}
                    onChange={(val) => setSelected({...selected, documentType: val, prefix: ''})}
                    options={[
                      { label: 'Sale Order', value: 'SALE_ORDER' },
                      { label: 'Purchase Order', value: 'PURCHASE_ORDER' },
                      { label: 'Expense', value: 'EXPENSE' },
                      { label: 'Customer Invoice', value: 'CUSTOMER_INVOICE' },
                      { label: 'Vendor Bill', value: 'VENDOR_BILL' },
                      { label: 'Expense Receipt', value: 'EXPENSE_RECEIPT' },
                      { label: 'Inbound Payment', value: 'INBOUND_PAYMENT' },
                      { label: 'Outbound Payment', value: 'OUTBOUND_PAYMENT' }
                    ]}
                  />
                </div>
              )}

              <div className="input-row">
                    <div className="input-group">
                      <label>Prefix</label>
                      <input 
                        type="text" 
                        value={displayVal(selected.prefix, selected.documentType, true)}
                        placeholder={resolvePlaceholder(selected.documentType, true)}
                        onChange={(e) => setSelected({...selected, prefix: e.target.value.toUpperCase()})}
                      />
                    </div>
                    <div className="input-group">
                      <label>Suffix</label>
                      <input 
                        type="text" 
                        value={displayVal(selected.suffix, selected.documentType, false)}
                        placeholder={resolvePlaceholder(selected.documentType, false)}
                        onChange={(e) => setSelected({...selected, suffix: e.target.value.toUpperCase()})}
                      />
                    </div>
              </div>
              
              <div className="input-row">
                <div className="input-group">
                  <label>Padding Length (Zeros)</label>
                  <input 
                    type="number" 
                    value={selected.paddingLength === '' ? '' : selected.paddingLength} 
                    onChange={e => setSelected({...selected, paddingLength: e.target.value === '' ? '' : parseInt(e.target.value)})} 
                  />
                </div>
                <div className="input-group">
                  <label>Next Sequence Number</label>
                  <input 
                    type="number" 
                    value={selected.nextNumber === '' ? '' : selected.nextNumber} 
                    onChange={e => setSelected({...selected, nextNumber: e.target.value === '' ? '' : parseInt(e.target.value)})} 
                  />
                  <small style={{ fontSize: 10, color: '#ef4444' }}>Warning: Lowering this may cause duplicate document errors.</small>
                </div>
              </div>
              
              <div className="preview-box">
                <label>Live Preview:</label>
                <div className="preview-val">{formatPreview(selected)}</div>
              </div>

              <div className="control-row">
                <label>Sequence Enabled</label>
                <div className={`erp-switch ${selected.isActive ? 'active' : ''}`} onClick={() => setSelected({...selected, isActive: !selected.isActive})}>
                  <div className="switch-knob"></div>
                </div>
              </div>
            </div>
          </CafeQRPopup>
        )}
      </div>

      <style jsx>{`
        .erp-container { padding: 24px 40px; background: #f8fafc; min-height: calc(100vh - 80px); }
        .erp-main-card { background: white; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
        .erp-header { padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; background: #fff; border-radius: 20px 20px 0 0; }
        .erp-page-title { font-size: 16px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 10px; }
        .erp-filter-bar { padding: 12px 24px; display: flex; align-items: center; gap: 16px; border-bottom: 1px solid #f1f5f9; background: #fff; }
        .erp-search-field { flex: 1; max-width: 320px; position: relative; display: flex; align-items: center; background: #f8fafc; border-radius: 10px; padding: 0 14px; border: 1px solid #e2e8f0; height: 40px; }
        .erp-search-field svg { color: #94a3b8; font-size: 14px; margin-right: 10px; flex-shrink: 0; }
        .erp-search-field input { border: none; background: transparent; font-size: 13px; font-weight: 500; color: #0f172a; width: 100%; outline: none; height: 100%; }
        .erp-search-field input::placeholder { color: #94a3b8; }
        .erp-table-wrapper { overflow-x: auto; }
        .erp-table { width: 100%; border-collapse: collapse; }
        .erp-table th { text-align: left; padding: 8px 16px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #FF7A00; background: #fff; }
        .erp-table td { padding: 6px 16px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #475569; vertical-align: middle; }
        .clickable-row { cursor: pointer; transition: background 0.15s; }
        .clickable-row:hover { background: #fffbf5; }
        .name-text { font-weight: 600; color: #0f172a; }
        .code-cell { font-family: 'Inter', monospace; color: #64748b; font-weight: 500; font-size: 12px; }
        
        .preview-badge { display: inline-block; padding: 2px 8px; background: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 6px; font-family: monospace; font-size: 13px; font-weight: 600; color: #334155; }
        
        .status-pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; border: 1px solid transparent; }
        .status-pill.active { background: #f0fdf4; color: #166534; border-color: #dcfce7; }
        .status-pill.inactive { background: #fef2f2; color: #ef4444; border-color: #fee2e2; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; }
        .status-pill.active .status-dot { background: #22c55e; }
        .status-pill.inactive .status-dot { background: #ef4444; }
        .row-actions { display: flex; gap: 4px; justify-content: flex-end; }
        .table-btn { width: 28px; height: 28px; border-radius: 6px; border: 1px solid #e2e8f0; background: white; color: #94a3b8; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 10px; transition: all 0.2s; }
        .table-btn:hover { background: #fff7ed; color: #FF7A00; border-color: #fed7aa; }
        .text-right { text-align: right; }
        .empty-state { text-align: center; padding: 60px 20px !important; }
        .empty-icon { font-size: 36px; color: #e2e8f0; margin-bottom: 16px; }
        .empty-msg { font-size: 16px; font-weight: 700; color: #475569; margin-bottom: 4px; }
        .empty-sub { font-size: 13px; color: #94a3b8; }
        
        .drawer-form { display: flex; flex-direction: column; gap: 20px; }
        .info-banner { background: #f8fafc; border: 1px solid #f1f5f9; padding: 10px; border-radius: 10px; font-size: 11px; color: #64748b; }
        .preview-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 4px; align-items: center; justify-content: center; }
        .preview-box label { color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
        .preview-val { font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 700; color: #0f172a; }
        
        .input-group { display: flex; flex-direction: column; gap: 6px; }
        .input-group label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; }
        .input-group input { padding: 8px 12px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; font-weight: 500; color: #0f172a; font-family: inherit; }
        .input-group input:focus { border-color: #FF7A00; outline: none; box-shadow: 0 0 0 3px rgba(255,122,0,0.08); }
        .input-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .control-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #fcfdfe; border: 1px solid #f1f5f9; border-radius: 10px; margin-top: 10px; }
        .control-row label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin: 0; }
        .erp-switch { width: 44px; height: 24px; background: #cbd5e1; border-radius: 100px; position: relative; cursor: pointer; transition: all 0.3s; }
        .erp-switch.active { background: #FF7A00; }
        .switch-knob { width: 18px; height: 18px; background: white; border-radius: 50%; position: absolute; top: 3px; left: 3px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
        .erp-switch.active .switch-knob { left: calc(100% - 21px); }
        
        .erp-btn { display: flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 12px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s; border: none; }
        .erp-btn.primary { background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; box-shadow: 0 4px 12px rgba(249, 115, 22, 0.2); }
        .erp-btn.primary:hover { box-shadow: 0 6px 16px rgba(249, 115, 22, 0.3); transform: translateY(-1px); }
        
        .erp-select { padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #0f172a; outline: none; transition: border-color 0.2s; background: white; cursor: pointer; }
        .erp-select:focus { border-color: #f97316; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1); }

        .erp-actions { display: flex; align-items: center; gap: 12px; }
        .card-avatar { width: 40px; height: 40px; border-radius: 10px; color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; flex-shrink: 0; }
        .card-avatar.config { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
        .loading-state { height: 100vh; display: flex; align-items: center; justify-content: center; font-weight: 600; color: #0f172a; font-size: 18px; background: #f8fafc; }
        
        .mobile-only { display: none; }
        @media (max-width: 768px) {
          .erp-container { padding: 12px; }
          .desk-only { display: none; }
          .mobile-only { display: block; }
          .erp-header { padding: 16px; flex-direction: column; gap: 16px; align-items: stretch; border-radius: 20px 20px 0 0; }
          .erp-filter-bar { padding: 12px 16px; flex-direction: column; align-items: stretch; }
          .erp-search-field { max-width: none; }
          .erp-mobile-list { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
          .mobile-card { background: white; border: 1px solid #f1f5f9; border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 12px; cursor: pointer; }
          .mobile-card:active { background: #fffbf5; }
          .card-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
          .card-name { font-size: 14px; font-weight: 600; color: #0f172a; }
          .card-sub { font-size: 12px; color: #64748b; font-family: monospace; }
          .card-action { color: #94a3b8; font-size: 12px; }
          .input-row { grid-template-columns: 1fr !important; gap: 12px !important; }
        }
      `}</style>
    </DashboardLayout>
  );
}
