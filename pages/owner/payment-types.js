// pages/owner/payment-types.js — Payment Types Master (branch-wise)
import React, { useState, useEffect, useMemo } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import CafeQRPopup from '../../components/CafeQRPopup';
import api from '../../utils/api';
import {
  FaPlus, FaSearch, FaChevronRight, FaCreditCard,
  FaCheckCircle, FaTrash
} from 'react-icons/fa';
import NiceSelect from '../../components/NiceSelect';
import { isFeatureEnabled } from '../../utils/moduleVisibility';

// ─── Constants ───────────────────────────────────────────────────────────────

const CONTEXTS = ['SALES', 'PURCHASES', 'EXPENSES'];

const CONTEXT_META = {
  SALES:     { label: 'Sales',     color: '#16a34a', bg: '#f0fdf4' },
  PURCHASES: { label: 'Purchases', color: '#0284c7', bg: '#f0f9ff' },
  EXPENSES:  { label: 'Expenses',  color: '#dc2626', bg: '#fef2f2' },
};

const DEFAULT_FORM = {
  displayName: '',
  paymentType: 'OTHERS',
  sales: 'Y',
  purchase: 'Y',
  expense: 'Y',
  ledgerRef: '',
  sortOrder: 0,
  description: '',
  isActive: 'Y',
  isactive: 'Y',
  orgId: '',
};

// ─── Page Entry ──────────────────────────────────────────────────────────────

export default function PaymentTypesPage() {
  return (
    <RoleGate allowedRoles={['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'STAFF']} requiredMenu="Configurations">
      <PaymentTypesContent />
    </RoleGate>
  );
}

// ─── Main Content ────────────────────────────────────────────────────────────

function PaymentTypesContent() {
  const { userRole } = useAuth();
  const isSuperAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ROLE_SUPER_ADMIN';

  const { notify, showConfirm } = useNotification();
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCtx, setFilterCtx] = useState('ALL');
  const [selected, setSelected] = useState(null);
  const [config, setConfig] = useState(null);

  const purchaseEnabled = isFeatureEnabled(config, 'purchaseEnabled');

  const branchFilterOptions = useMemo(() => {
    const list = [
      { value: 'ALL', label: 'All Branches' }
    ];
    branches.forEach(b => {
      list.push({ value: b.id, label: b.name });
    });
    return list;
  }, [branches]);

  const branchFormOptions = useMemo(() => {
    return branches.map(b => ({ value: b.id, label: b.name }));
  }, [branches]);

  const paymentTypeOptions = [
    { value: 'CREDIT', label: 'Credit' },
    { value: 'OTHERS', label: 'Others' }
  ];

  useEffect(() => {
    if (isSuperAdmin) {
      fetchBranches();
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    fetchPaymentTypes();
  }, [selectedBranchId]);

  useEffect(() => {
    let active = true;
    const params = {};
    if (isSuperAdmin && selectedBranchId !== 'ALL') {
      params.orgId = selectedBranchId;
    }
    api.get('/api/v1/configurations', { params })
      .then(res => {
        if (active && res.data?.success) {
          setConfig(res.data.data);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [selectedBranchId, isSuperAdmin]);

  const fetchBranches = async () => {
    try {
      const resp = await api.get('/api/v1/organizations');
      if (resp.data.success) {
        setBranches(resp.data.data || []);
      }
    } catch (err) {
      console.error('Failed to load organizations:', err);
    }
  };

  const fetchPaymentTypes = async () => {
    setLoading(true);
    try {
      const params = {};
      if (isSuperAdmin && selectedBranchId !== 'ALL') {
        params.orgId = selectedBranchId;
      }
      const res = await api.get('/api/v1/purchasing/payment-types', { params });
      if (res.data.success) setPaymentTypes(res.data.data || []);
    } catch (err) {
      console.error('Failed to load payment types:', err);
      notify('error', 'Failed to load payment types');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selected.displayName?.trim()) { notify('error', 'Display name is required'); return; }
    if (isSuperAdmin && !selected.orgId) { notify('error', 'Select a branch/organization'); return; }
    if (selected.sales !== 'Y' && selected.purchase !== 'Y' && selected.expense !== 'Y') {
      notify('error', 'Select at least one applicable context');
      return;
    }
    const sortVal = parseInt(selected.sortOrder);
    if (isNaN(sortVal) || sortVal < 0) {
      notify('error', 'Sort order is required and must be a non-negative number');
      return;
    }
    // Check sort order duplicates within the targeted organization
    const targetOrgId = selected.orgId || null;
    const duplicateSort = paymentTypes.find(pt =>
      pt.id !== selected.id &&
      pt.sortOrder === sortVal &&
      pt.orgId === targetOrgId
    );
    if (duplicateSort) {
      notify('error', `Sort order ${sortVal} is already assigned to "${duplicateSort.displayName}"`);
      return;
    }

    setSaving(true);
    try {
      const isNew = !selected.id;
      const url = isNew
        ? '/api/v1/purchasing/payment-types'
        : `/api/v1/purchasing/payment-types/${selected.id}`;
      const payload = {
        ...selected,
        purchase: purchaseEnabled ? (selected.purchase || 'N') : 'N',
        isActive: selected.isActive ?? selected.isactive ?? 'Y',
        isactive: selected.isActive ?? selected.isactive ?? 'Y'
      };
      if (!isSuperAdmin) {
        delete payload.orgId; // backend resolves orgId automatically for non-superadmins
      }
      const resp = await (isNew ? api.post(url, payload) : api.put(url, payload));
      if (resp.data.success) {
        notify('success', isNew ? 'Payment type created!' : 'Payment type updated!');
        fetchPaymentTypes();
        setSelected(null);
      }
    } catch (err) {
      notify('error', err?.response?.data?.message || 'Failed to save payment type');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id, name) => {
    showConfirm({
      title: 'Delete Payment Type',
      message: `Delete "${name}"? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await api.delete(`/api/v1/purchasing/payment-types/${id}`);
          notify('success', 'Payment type deleted');
          fetchPaymentTypes();
        } catch (err) {
          notify('error', 'Failed to delete payment type');
        }
      }
    });
  };

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return paymentTypes.filter(pt => {
      const matchSearch = !term ||
        pt.displayName?.toLowerCase().includes(term) ||
        pt.ledgerRef?.toLowerCase().includes(term);
      const matchCtx = filterCtx === 'ALL' ||
        (filterCtx === 'SALES' && pt.sales === 'Y') ||
        (filterCtx === 'PURCHASES' && pt.purchase === 'Y') ||
        (filterCtx === 'EXPENSES' && pt.expense === 'Y');
      return matchSearch && matchCtx;
    });
  }, [paymentTypes, searchTerm, filterCtx]);

  const openNew = () => setSelected({
    ...DEFAULT_FORM,
    orgId: (isSuperAdmin && selectedBranchId !== 'ALL') ? selectedBranchId : ''
  });
  const openEdit = pt => {
    const act = pt.isActive ?? pt.isactive ?? 'Y';
    setSelected({
      ...pt,
      orgId: pt.orgId || '',
      isActive: act,
      isactive: act
    });
  };

  const getBranchName = (orgId) => {
    const b = branches.find(x => x.id === orgId);
    return b ? b.name : '—';
  };

  if (loading) return (
    <div className="loading-state">
      <FaCreditCard style={{ fontSize: 32, color: '#FF7A00', marginBottom: 12 }} />
      <span>Loading Payment Types...</span>
    </div>
  );

  return (
    <DashboardLayout title="Payment Types" showBack={true} backUrl="/admin/organization">
      <div className="erp-container">
        <div className="erp-main-card">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <header className="erp-header">
            <div className="erp-page-title">
              <FaCreditCard className="page-icon" />
              Payment Types
            </div>
            <div className="erp-actions">
              <button className="erp-btn primary" onClick={openNew}>
                <FaPlus /> <span className="btn-label">New Payment Type</span>
              </button>
            </div>
          </header>

          {/* ── Filter Bar ──────────────────────────────────────────────── */}
          <div className="erp-filter-bar">
            <div className="erp-search-field">
              <FaSearch />
              <input
                placeholder="Search by name..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            
            {/* Super Admin Branch Selector Filter */}
            {isSuperAdmin && (
              <div className="branch-filter-container" style={{ minWidth: '180px' }}>
                <NiceSelect
                  value={selectedBranchId}
                  onChange={setSelectedBranchId}
                  options={branchFilterOptions}
                  placeholder="Select Branch..."
                  maxHeight={250}
                  style={{ height: '38px', borderRadius: '10px' }}
                />
              </div>
            )}

            <div className="ctx-filter-tabs">
              {['ALL', ...CONTEXTS.filter(ctx => ctx !== 'PURCHASES' || purchaseEnabled)].map(ctx => (
                <button
                  key={ctx}
                  className={`ctx-tab ${filterCtx === ctx ? 'active' : ''}`}
                  onClick={() => setFilterCtx(ctx)}
                  style={filterCtx === ctx && ctx !== 'ALL' ? {
                    background: '#FF7A00',
                    color: 'white',
                    borderColor: '#FF7A00',
                  } : {}}
                >
                  {ctx === 'ALL' ? 'All' : CONTEXT_META[ctx].label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Desktop Table ───────────────────────────────────────────── */}
          <div className="erp-table-wrapper">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Display Name</th>
                  {isSuperAdmin && <th>Branch</th>}
                  <th>Type</th>
                  <th>Sales</th>
                  {purchaseEnabled && <th>Purchases</th>}
                  <th>Expenses</th>
                  <th>Ledger Ref</th>
                  <th>Sort</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(pt => (
                  <tr key={pt.id} className="clickable-row" onClick={() => openEdit(pt)}>
                    <td>
                      <div className="name-row">
                        <span className="name-text">{pt.displayName}</span>
                      </div>
                    </td>
                    {isSuperAdmin && (
                      <td style={{ color: '#475569', fontWeight: 600 }}>
                        {getBranchName(pt.orgId)}
                      </td>
                    )}
                    <td>
                      <span className="type-badge" style={{
                        background: pt.paymentType === 'CREDIT' ? '#fff7ed' : '#f8fafc',
                        color: pt.paymentType === 'CREDIT' ? '#ea580c' : '#64748b',
                        border: `1px solid ${pt.paymentType === 'CREDIT' ? '#fed7aa' : '#e2e8f0'}`,
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '600'
                      }}>
                        {pt.paymentType === 'CREDIT' ? 'Credit' : 'Others'}
                      </span>
                    </td>
                    <td>
                      {pt.sales === 'Y'
                        ? <FaCheckCircle style={{ color: '#22c55e' }} />
                        : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    {purchaseEnabled && (
                      <td>
                        {pt.purchase === 'Y'
                          ? <FaCheckCircle style={{ color: '#22c55e' }} />
                          : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                    )}
                    <td>
                      {pt.expense === 'Y'
                        ? <FaCheckCircle style={{ color: '#22c55e' }} />
                        : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td><span className="ledger-text">{pt.ledgerRef || '—'}</span></td>
                    <td style={{ color: '#64748b', fontWeight: 600 }}>{pt.sortOrder ?? 0}</td>
                    <td>
                      <span className={`status-pill ${(pt.isActive ?? pt.isactive ?? 'Y') === 'Y' ? 'active' : 'inactive'}`}>
                        <span className="status-dot" />
                        {(pt.isActive ?? pt.isactive ?? 'Y') === 'Y' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td onClick={e => e.stopPropagation()} className="row-actions">
                      <button className="table-btn" onClick={() => openEdit(pt)}>
                        <FaChevronRight />
                      </button>
                      <button className="table-btn delete" onClick={() => handleDelete(pt.id, pt.displayName)}>
                        <FaTrash />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={isSuperAdmin ? 10 : 9} className="empty-state">
                      <div className="empty-icon"><FaCreditCard /></div>
                      <div className="empty-msg">No payment types found</div>
                      <div className="empty-sub">
                        {searchTerm || filterCtx !== 'ALL'
                          ? 'Try changing your search or filter'
                          : 'Create your first payment type to get started'}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Form Popup ──────────────────────────────────────────────────── */}
        {selected && (
          <CafeQRPopup
            title={selected.id ? 'Edit Payment Type' : 'New Payment Type'}
            onClose={() => setSelected(null)}
            onSave={handleSave}
            saveLabel={selected.id ? 'Update' : 'Create'}
            isSaving={saving}
            icon={FaCreditCard}
          >
            <div className="drawer-form">

              {/* Display Name */}
              <div className="input-group">
                <label>Display Name *</label>
                <input
                  value={selected.displayName}
                  onChange={e => setSelected({ ...selected, displayName: e.target.value })}
                  placeholder="e.g. Cash, UPI — GPay, HDFC Credit Card"
                />
              </div>

              {/* Super Admin Branch/Organization Selector */}
              {isSuperAdmin && (
                <div className="input-group">
                  <label>Branch / Organization *</label>
                  <NiceSelect
                    value={selected.orgId || ''}
                    onChange={val => setSelected({ ...selected, orgId: val })}
                    options={branchFormOptions}
                    placeholder="Select Branch..."
                    maxHeight={250}
                    style={{ height: '38px', borderRadius: '8px' }}
                  />
                </div>
              )}

              {/* Payment Type */}
              <div className="input-group">
                <label>Payment Type *</label>
                <NiceSelect
                  value={selected.paymentType}
                  onChange={val => setSelected({ ...selected, paymentType: val })}
                  options={paymentTypeOptions}
                  placeholder="Select Type..."
                  maxHeight={200}
                  style={{ height: '38px', borderRadius: '8px' }}
                />
              </div>

              {/* Sort Order & Ledger Ref */}
              <div className="input-row">
                <div className="input-group">
                  <label>Sort Order</label>
                  <input
                    type="number"
                    min="0"
                    value={selected.sortOrder ?? ''}
                    onChange={e => setSelected({ ...selected, sortOrder: e.target.value === '' ? '' : parseInt(e.target.value) })}
                  />
                </div>
                <div className="input-group">
                  <label>Ledger Reference <span className="optional-tag">(Optional)</span></label>
                  <input
                    value={selected.ledgerRef || ''}
                    onChange={e => setSelected({ ...selected, ledgerRef: e.target.value })}
                    placeholder="e.g. CASH_ACCT, BANK_HDFC"
                  />
                </div>
              </div>

              {/* Applicable For */}
              <div className="input-group">
                <label>Applicable For *</label>
                <div className="ctx-toggle-row">
                  <button
                    type="button"
                    className={`ctx-toggle-btn ${selected.sales === 'Y' ? 'active' : ''}`}
                    style={selected.sales === 'Y' ? { background: '#FF7A00', borderColor: '#FF7A00', color: 'white' } : {}}
                    onClick={() => setSelected({ ...selected, sales: selected.sales === 'Y' ? 'N' : 'Y' })}
                  >
                    {selected.sales === 'Y' && <FaCheckCircle style={{ fontSize: 10 }} />}
                    Sales
                  </button>
                  {purchaseEnabled && (
                    <button
                      type="button"
                      className={`ctx-toggle-btn ${selected.purchase === 'Y' ? 'active' : ''}`}
                      style={selected.purchase === 'Y' ? { background: '#FF7A00', borderColor: '#FF7A00', color: 'white' } : {}}
                      onClick={() => setSelected({ ...selected, purchase: selected.purchase === 'Y' ? 'N' : 'Y' })}
                    >
                      {selected.purchase === 'Y' && <FaCheckCircle style={{ fontSize: 10 }} />}
                      Purchases
                    </button>
                  )}
                  <button
                    type="button"
                    className={`ctx-toggle-btn ${selected.expense === 'Y' ? 'active' : ''}`}
                    style={selected.expense === 'Y' ? { background: '#FF7A00', borderColor: '#FF7A00', color: 'white' } : {}}
                    onClick={() => setSelected({ ...selected, expense: selected.expense === 'Y' ? 'N' : 'Y' })}
                  >
                    {selected.expense === 'Y' && <FaCheckCircle style={{ fontSize: 10 }} />}
                    Expenses
                  </button>
                </div>
              </div>

              {/* Description */}
              <div className="input-group">
                <label>Description <span className="optional-tag">(Optional)</span></label>
                <textarea
                  rows={2}
                  value={selected.description || ''}
                  onChange={e => setSelected({ ...selected, description: e.target.value })}
                  placeholder="Notes about this payment type..."
                />
              </div>

              {/* Toggles */}
              <div className="control-row">
                <label>Active</label>
                <div
                  className={`erp-switch ${(selected.isActive ?? selected.isactive ?? 'Y') === 'Y' ? 'active' : ''}`}
                  onClick={() => {
                    const nextVal = (selected.isActive ?? selected.isactive ?? 'Y') === 'Y' ? 'N' : 'Y';
                    setSelected({ ...selected, isActive: nextVal, isactive: nextVal });
                  }}
                >
                  <div className="switch-knob" />
                </div>
              </div>
            </div>
          </CafeQRPopup>
        )}
      </div>

      <style jsx>{`
        .erp-container { padding: 24px 40px; background: #f8fafc; min-height: calc(100vh - 80px); }
        .erp-main-card { background: white; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }

        /* Header */
        .erp-header { padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; border-radius: 20px 20px 0 0; }
        .erp-page-title { font-size: 16px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 10px; }
        .page-icon { color: #FF7A00; font-size: 18px; }
        .erp-actions { display: flex; align-items: center; gap: 12px; }
        .erp-btn { padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; border: none; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s; }
        .erp-btn.primary { background: #FF7A00; color: white; box-shadow: 0 2px 4px rgba(255,122,0,0.2); }
        .erp-btn.primary:hover { background: #ea580c; transform: translateY(-1px); }

        /* Filter Bar */
        .erp-filter-bar { padding: 12px 24px; display: flex; align-items: center; gap: 16px; border-bottom: 1px solid #f1f5f9; flex-wrap: wrap; }
        .erp-search-field { flex: 1; max-width: 300px; position: relative; display: flex; align-items: center; background: #f8fafc; border-radius: 10px; padding: 0 14px; border: 1px solid #e2e8f0; height: 38px; }
        .erp-search-field svg { color: #94a3b8; font-size: 13px; margin-right: 10px; flex-shrink: 0; }
        .erp-search-field input { border: none; background: transparent; font-size: 13px; font-weight: 500; color: #0f172a; width: 100%; outline: none; }
        .erp-search-field input::placeholder { color: #94a3b8; }
        
        .branch-filter-container { display: flex; align-items: center; }
        .branch-filter-select {
          padding: 8px 14px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
          background: #f8fafc;
          outline: none;
          cursor: pointer;
          transition: border-color 0.2s;
        }
        .branch-filter-select:focus {
          border-color: #FF7A00;
        }

        .ctx-filter-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
        .ctx-tab { padding: 5px 12px; border-radius: 20px; border: 1px solid #e2e8f0; background: white; color: #64748b; font-size: 11.5px; font-weight: 700; cursor: pointer; transition: all 0.15s; }
        .ctx-tab:hover { border-color: #FF7A00; color: #FF7A00; }
        .ctx-tab.active { background: #FF7A00; color: white; border-color: #FF7A00; }

        /* Table */
        .erp-table-wrapper { overflow-x: auto; }
        .erp-table { width: 100%; border-collapse: collapse; }
        .erp-table th { text-align: left; padding: 12px 16px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #FF7A00; background: #fafbff; }
        .erp-table td { padding: 11px 16px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #475569; vertical-align: middle; }
        .clickable-row { cursor: pointer; transition: background 0.15s; }
        .clickable-row:hover { background: #fffbf5; }
        .name-row { display: flex; align-items: center; gap: 10px; }
        .name-text { font-weight: 700; color: #0f172a; }
        .ledger-text { font-family: 'Inter', monospace; font-size: 11.5px; color: #64748b; }
        .status-pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 12px; font-size: 11px; font-weight: 700; }
        .status-pill.active { background: #f0fdf4; color: #166534; }
        .status-pill.inactive { background: #fef2f2; color: #ef4444; }
        .status-dot { width: 5px; height: 5px; border-radius: 50%; }
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

        /* Form / Popup */
        .drawer-form { display: flex; flex-direction: column; gap: 18px; }
        .input-group { display: flex; flex-direction: column; gap: 6px; }
        .input-group label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; }
        .input-group input, .input-group textarea, .input-group select {
          padding: 9px 12px; border-radius: 8px; border: 1.5px solid #e2e8f0;
          font-size: 13px; font-weight: 500; color: #0f172a; font-family: inherit;
          background: white; outline: none; transition: border-color 0.2s;
        }
        .input-group input:focus, .input-group textarea:focus, .input-group select:focus {
          border-color: #FF7A00; box-shadow: 0 0 0 3px rgba(255,122,0,0.08);
        }
        .input-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .optional-tag { font-size: 10px; color: #94a3b8; font-weight: 500; text-transform: none; }

        /* Applicable For Toggles */
        .ctx-toggle-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .ctx-toggle-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 8px; border: 1.5px solid #e2e8f0;
          background: white; color: #64748b; font-size: 12px; font-weight: 700;
          cursor: pointer; transition: all 0.15s; font-family: inherit;
        }
        /* Custom Nice Dropdown */
        .nice-select-trigger {
          display: flex; align-items: center; justify-content: space-between;
          padding: 9px 12px; border-radius: 8px; border: 1.5px solid #e2e8f0;
          font-size: 13px; font-weight: 600; color: #0f172a; cursor: pointer;
          background: white; transition: all 0.2s;
        }
        .nice-select-trigger:hover { border-color: #FF7A00; }
        .nice-select-trigger svg.chevron.open { transform: rotate(180deg); }
        .nice-select-options {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          background: white; border: 1px solid #e2e8f0; border-radius: 8px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
          z-index: 10; overflow: hidden; padding: 4px;
        }
        .nice-select-option {
          padding: 8px 12px; font-size: 13px; font-weight: 500; color: #475569;
          border-radius: 6px; cursor: pointer; transition: all 0.15s;
        }
        .nice-select-option:hover { background: #fff7ed; color: #FF7A00; }
        .nice-select-option.active { background: #FF7A00; color: white; }

        /* Toggle switches */
        .control-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #fcfdfe; border: 1px solid #f1f5f9; border-radius: 10px; }
        .control-row label { font-size: 11.5px; font-weight: 700; color: #64748b; }
        .erp-switch { width: 44px; height: 24px; background: #cbd5e1; border-radius: 100px; position: relative; cursor: pointer; transition: background 0.3s; }
        .erp-switch.active { background: #FF7A00; }
        .switch-knob { width: 18px; height: 18px; background: white; border-radius: 50%; position: absolute; top: 3px; left: 3px; transition: left 0.25s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 1px 2px rgba(0,0,0,0.12); }
        .erp-switch.active .switch-knob { left: calc(100% - 21px); }

        /* Loading */
        .loading-state { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; font-weight: 700; color: #0f172a; font-size: 16px; background: #f8fafc; }

        @media (max-width: 768px) {
          .erp-container { padding: 10px; }
          .erp-header { padding: 14px 16px; flex-direction: column; gap: 12px; align-items: stretch; }
          .erp-actions button { flex: 1; justify-content: center; }
          .btn-label { display: none; }
          .erp-filter-bar { padding: 10px 14px; flex-direction: column; align-items: stretch; }
          .erp-search-field { max-width: none; }
          .branch-filter-container { width: 100%; }
          .branch-filter-select { width: 100%; }
          .ctx-filter-tabs { justify-content: flex-start; }
          .input-row { grid-template-columns: 1fr !important; gap: 12px !important; }
          .ctx-toggle-row { gap: 6px; }
        }
      `}</style>
    </DashboardLayout>
  );
}
