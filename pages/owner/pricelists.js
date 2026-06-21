// pages/owner/pricelists.js — Price List Masters (standalone)
import React, { useState, useEffect } from 'react';
import { useNotification } from '../../context/NotificationContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import NiceSelect from '../../components/NiceSelect';
import CafeQRPopup from '../../components/CafeQRPopup';
import api from '../../utils/api';
import { FaPlus, FaSearch, FaChevronRight, FaTags, FaCalendarAlt, FaTimes, FaCheckCircle, FaTrash } from 'react-icons/fa';

export default function PricelistsPage() {
  return (<RoleGate allowedRoles={['ADMIN', 'SUPER_ADMIN', 'MANAGER']} requiredMenu="Product Management"><PricelistsContent /></RoleGate>);
}

function PricelistsContent() {
  const { notify, showConfirm } = useNotification();
  const [pricelists, setPricelists] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [selected, setSelected] = useState(null);

  useEffect(() => { Object.assign(fetchData(), { fetchCurrencies: true }); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [plRes, curRes] = await Promise.all([
        api.get('/api/v1/purchasing/pricelists'),
        api.get('/api/v1/purchasing/currencies')
      ]);
      if (plRes.data.success) setPricelists(plRes.data.data || []);
      if (curRes.data.success) setCurrencies(curRes.data.data || []);
    } catch (err) { console.error('Failed to load:', err); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!selected.name?.trim()) { notify('error', 'Name is required'); return; }
    setSaving(true);
    try {
      const isNew = !selected.id;
      const url = isNew ? '/api/v1/purchasing/pricelists' : `/api/v1/purchasing/pricelists/${selected.id}`;
      const resp = await (isNew ? api.post(url, selected) : api.put(url, selected));
      if (resp.data.success) { notify('success', isNew ? 'Price List created!' : 'Price List updated!'); fetchData(); setSelected(null); }
    } catch (err) { notify('error', 'Failed to save price list'); }
    finally { setSaving(false); }
  };

  const handleDelete = (id, name) => {
    showConfirm({ title: 'Delete Price List', message: `Delete "${name}"?`, onConfirm: async () => {
      try { await api.delete(`/api/v1/purchasing/pricelists/${id}`); notify('success', 'Price list deleted'); fetchData(); }
      catch (err) { notify('error', 'Failed to delete'); }
    }});
  };

  const addVersion = () => {
    setSelected({ ...selected, versions: [...(selected.versions || []), { name: '', startDate: new Date().toISOString().slice(0, 16), endDate: '', isActive: 'Y' }] });
  };

  const filtered = pricelists.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'ALL' || p.pricelistType === typeFilter;
    return matchesSearch && matchesType;
  });

  if (loading) return <div className="loading-state"><span>Loading Price Lists...</span></div>;

  return (
    <DashboardLayout title="Price List Masters" showBack={true}>
      <div className="erp-container">
        <div className="erp-main-card">
          <header className="erp-header">
            <div className="erp-page-title"><FaTags /> Price List Masters</div>
            <div className="erp-actions">
              <button className="erp-btn primary" onClick={() => setSelected({ pricelistType: 'SALE', name: '', description: '', currencyId: null, isDefault: false, isActive: 'Y' })}><FaPlus /> <span className="btn-label">New Price List</span></button>
            </div>
          </header>

          <div className="erp-filter-bar">
            <div className="erp-search-field"><FaSearch /><input placeholder="Search price lists..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
            <div className="erp-filter-pills">
              <button className={`filter-pill ${typeFilter === 'ALL' ? 'active' : ''}`} onClick={() => setTypeFilter('ALL')}>All</button>
              <button className={`filter-pill ${typeFilter === 'SALE' ? 'active' : ''}`} onClick={() => setTypeFilter('SALE')}>Sale</button>
              <button className={`filter-pill ${typeFilter === 'PURCHASE' ? 'active' : ''}`} onClick={() => setTypeFilter('PURCHASE')}>Purchase</button>
            </div>
          </div>

          <div className="erp-table-wrapper desk-only">
            <table className="erp-table">
              <thead><tr><th>Name</th><th>Type</th><th>Default</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} onClick={() => setSelected(p)} className="clickable-row">
                    <td><span className="name-text">{p.name}</span></td>
                    <td><span className={`type-badge ${p.pricelistType === 'SALE' ? 'veg' : 'non-veg'}`}>{p.pricelistType}</span></td>
                    <td>{p.isDefault ? <FaCheckCircle style={{ color: '#22c55e' }} /> : '—'}</td>
                    <td><span className={`status-pill ${p.isActive === 'Y' ? 'active' : 'inactive'}`}><span className="status-dot"></span>{p.isActive === 'Y' ? 'Active' : 'Inactive'}</span></td>
                    <td onClick={e => e.stopPropagation()} className="row-actions">
                      <button className="table-btn" onClick={() => setSelected(p)}><FaChevronRight /></button>
                      <button className="table-btn delete" onClick={() => handleDelete(p.id, p.name)}><FaTrash /></button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={5} className="empty-state"><div className="empty-icon"><FaTags /></div><div className="empty-msg">No price lists</div><div className="empty-sub">Create price lists to manage sales and purchase pricing.</div></td></tr>}
              </tbody>
            </table>
          </div>

          <div className="erp-mobile-list mobile-only">
            {filtered.map(p => (
              <div key={p.id} className="mobile-card" onClick={() => setSelected(p)}>
                <div className="card-avatar pricelist">{p.pricelistType?.[0]}</div>
                <div className="card-info"><span className="card-name">{p.name} {p.isDefault ? '★' : ''}</span><span className="card-sub">{p.pricelistType}</span></div>
                <div className="card-action"><FaChevronRight /></div>
              </div>
            ))}
            {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>No price lists found.</div>}
          </div>
        </div>

        {/* PRICE LIST POPUP */}
        {selected && (
          <CafeQRPopup title={selected.id ? 'Edit Price List' : 'New Price List'} onClose={() => setSelected(null)} onSave={handleSave} saveLabel={selected.id ? 'Update' : 'Create'} isSaving={saving} icon={FaTags} maxWidth="750px">
            <div className="drawer-form">
              <div className="erp-section">
                <div className="section-title"><FaTags /> Price List Details</div>
                <div className="input-row"><div className="input-group"><label>Name *</label><input value={selected.name} onChange={e => setSelected({...selected, name: e.target.value})} placeholder="e.g. Standard Sale Prices" /></div><div className="input-group"><label>Type *</label><NiceSelect options={[{ value: 'SALE', label: 'Sale' }, { value: 'PURCHASE', label: 'Purchase' }]} value={selected.pricelistType || 'SALE'} onChange={val => setSelected({...selected, pricelistType: val})} /></div></div>
                <div className="input-group" style={{ marginTop: 16 }}><label>Description</label><textarea rows={2} value={selected.description || ''} onChange={e => setSelected({...selected, description: e.target.value})} placeholder="Optional notes about this price list..." /></div>
                <div className="input-row" style={{ marginTop: 16 }}>
                  <div className="input-group"><label>Currency</label><NiceSelect options={[{ value: '', label: 'Default' }, ...currencies.map(c => ({ value: c.id, label: `${c.code} (${c.symbol})` }))]} value={selected.currencyId || ''} onChange={val => setSelected({...selected, currencyId: val || null})} /></div>
                  <div className="input-group"><label>Options</label>
                    <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                      <div className="control-row" style={{ flex: 1 }}><label>Default</label><div className={`erp-switch ${selected.isDefault ? 'active' : ''}`} onClick={() => setSelected({...selected, isDefault: !selected.isDefault})}><div className="switch-knob"></div></div></div>
                      <div className="control-row" style={{ flex: 1 }}><label>Active</label><div className={`erp-switch ${selected.isActive === 'Y' ? 'active' : ''}`} onClick={() => setSelected({...selected, isActive: selected.isActive === 'Y' ? 'N' : 'Y'})}><div className="switch-knob"></div></div></div>
                    </div>
                  </div>
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
        .erp-filter-pills { display: flex; gap: 8px; }
        .filter-pill { padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; color: #64748b; background: white; border: 1px solid #e2e8f0; cursor: pointer; transition: all 0.2s; }
        .filter-pill:hover { background: #f8fafc; color: #0f172a; }
        .filter-pill.active { background: #0f172a; color: white; border-color: #0f172a; }
        .erp-table-wrapper { overflow-x: auto; }
        .erp-table { width: 100%; border-collapse: collapse; }
        .erp-table th { text-align: left; padding: 14px 16px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #FF7A00; background: #fff; }
        .erp-table td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #475569; vertical-align: middle; }
        .clickable-row { cursor: pointer; transition: background 0.15s; }
        .clickable-row:hover { background: #fffbf5; }
        .name-text { font-weight: 600; color: #0f172a; }
        .code-cell { font-family: 'Inter', monospace; color: #64748b; font-weight: 500; font-size: 12px; }
        .type-badge { padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
        .type-badge.veg { background: #f0fdf4; color: #166534; border: 1px solid #dcfce7; }
        .type-badge.non-veg { background: #fef2f2; color: #991b1b; border: 1px solid #fee2e2; }
        .status-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; border: 1px solid transparent; }
        .status-pill.active { background: #f0fdf4; color: #166534; border-color: #dcfce7; }
        .status-pill.inactive { background: #fef2f2; color: #ef4444; border-color: #fee2e2; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; }
        .status-pill.active .status-dot { background: #22c55e; }
        .status-pill.inactive .status-dot { background: #ef4444; }
        .row-actions { display: flex; gap: 4px; justify-content: flex-end; }
        .table-btn { width: 28px; height: 28px; border-radius: 6px; border: 1px solid #e2e8f0; background: white; color: #94a3b8; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 10px; transition: all 0.2s; }
        .table-btn:hover { background: #fff7ed; color: #FF7A00; border-color: #fed7aa; }
        .table-btn.delete:hover { background: #fef2f2; color: #ef4444; border-color: #fecaca; }
        .text-right { text-align: right; }
        .empty-state { text-align: center; padding: 60px 20px !important; }
        .empty-icon { font-size: 36px; color: #e2e8f0; margin-bottom: 16px; }
        .empty-msg { font-size: 16px; font-weight: 700; color: #475569; margin-bottom: 4px; }
        .empty-sub { font-size: 13px; color: #94a3b8; }
        .drawer-form { display: flex; flex-direction: column; gap: 20px; }
        .erp-section { background: #fcfdfe; padding: 16px; border-radius: 12px; border: 1px solid #f1f5f9; }
        .section-title { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 16px; text-transform: uppercase; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; }
        .input-group { display: flex; flex-direction: column; gap: 6px; }
        .input-group label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; }
        .input-group input, .input-group textarea { padding: 8px 12px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; font-weight: 500; color: #0f172a; font-family: inherit;}
        .input-group input:focus, .input-group textarea:focus { border-color: #FF7A00; outline: none; box-shadow: 0 0 0 3px rgba(255,122,0,0.08); }
        .input-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .control-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #fcfdfe; border: 1px solid #f1f5f9; border-radius: 10px; margin-top: 10px; }
        .control-row label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin: 0; }
        .erp-switch { width: 44px; height: 24px; background: #cbd5e1; border-radius: 100px; position: relative; cursor: pointer; transition: all 0.3s; }
        .erp-switch.active { background: #FF7A00; }
        .switch-knob { width: 18px; height: 18px; background: white; border-radius: 50%; position: absolute; top: 3px; left: 3px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
        .erp-switch.active .switch-knob { left: calc(100% - 21px); }
        .erp-btn { padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; border: none; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s; }
        .erp-btn.primary { background: #FF7A00; color: white; box-shadow: 0 2px 4px rgba(255, 122, 0, 0.2); }
        .erp-btn.primary:hover { background: #ea580c; transform: translateY(-1px); }
        .erp-btn.sm { padding: 6px 12px; font-size: 11px; }
        .erp-actions { display: flex; align-items: center; gap: 12px; }
        .line-item-card { background: #f8fafc; border-radius: 12px; padding: 16px; margin-top: 12px; position: relative; border: 1px solid #f1f5f9; }
        .line-remove { position: absolute; top: 8px; right: 8px; background: none; border: none; color: #ef4444; cursor: pointer; font-size: 14px; padding: 4px; border-radius: 4px; }
        .line-remove:hover { background: #fef2f2; }
        .card-avatar { width: 40px; height: 40px; border-radius: 10px; color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; flex-shrink: 0; }
        .card-avatar.pricelist { background: linear-gradient(135deg, #f59e0b, #fbbf24); }
        .loading-state { height: 100vh; display: flex; align-items: center; justify-content: center; font-weight: 600; color: #0f172a; font-size: 18px; background: #f8fafc; }
        .mobile-only { display: none; }
        @media (max-width: 768px) {
          .erp-container { padding: 12px; }
          .desk-only { display: none; }
          .mobile-only { display: block; }
          .erp-header { padding: 16px; flex-direction: column; gap: 16px; align-items: stretch; border-radius: 20px 20px 0 0; }
          .erp-actions button { flex: 1; padding: 12px !important; min-width: 0; justify-content: center; }
          .btn-label { display: none; }
          .erp-filter-bar { padding: 12px 16px; flex-direction: column; align-items: stretch; }
          .erp-search-field { max-width: none; }
          .erp-mobile-list { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
          .mobile-card { background: white; border: 1px solid #f1f5f9; border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 12px; cursor: pointer; }
          .mobile-card:active { background: #fffbf5; }
          .card-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
          .card-name { font-size: 14px; font-weight: 600; color: #0f172a; }
          .card-sub { font-size: 12px; color: #64748b; }
          .card-action { color: #94a3b8; font-size: 12px; }
          .input-row { grid-template-columns: 1fr !important; gap: 12px !important; }
        }
      `}</style>
    </DashboardLayout>
  );
}
