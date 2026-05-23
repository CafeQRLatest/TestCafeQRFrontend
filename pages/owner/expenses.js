import React, { useState, useEffect, useMemo, useCallback } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import NiceSelect from '../../components/NiceSelect';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import CafeQRPopup from '../../components/CafeQRPopup';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import { formatTzDate } from '../../utils/timezoneUtils';
import { FaTrash, FaEdit, FaCog, FaWallet, FaTag, FaFileAlt, FaUndo, FaPlus, FaFileExcel, FaFileCsv, FaFilePdf } from 'react-icons/fa';

const PAY_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' }
];

const SCOPE_ALL = 'ALL';
const SCOPE_GLOBAL = 'GLOBAL';

export default function Expenses() {
  const { timezone, userRole, orgId } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [formCategories, setFormCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('');
  const [filterBranch, setFilterBranch] = useState(SCOPE_ALL);
  const [filterPayMethod, setFilterPayMethod] = useState('');
  const [filterStatus, setFilterStatus] = useState('ACTIVE');
  const [branches, setBranches] = useState([]);
  
  const getLocalDate = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getBusinessNow = () => {
    const now = new Date();
    if (!timezone) return now;
    try {
      const match = timezone.match(/UTC([+-])(\d+):(\d+)/);
      if (match) {
        const sign = match[1] === '+' ? 1 : -1;
        const hours = parseInt(match[2]);
        const mins = parseInt(match[3]);
        const targetOffset = sign * (hours * 60 + mins);
        const localOffset = -now.getTimezoneOffset();
        const diff = targetOffset - localOffset;
        return new Date(now.getTime() + diff * 60000);
      }
    } catch (e) {}
    return now;
  };

  const [dateFrom, setDateFrom] = useState(() => `${getLocalDate(getBusinessNow())}T00:00`);
  const [dateTo, setDateTo] = useState(() => `${getLocalDate(getBusinessNow())}T23:59`);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [fDate, setFDate] = useState('');
  const [fTime, setFTime] = useState('');
  const [fCatId, setFCatId] = useState('');
  const [fAmount, setFAmount] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fMethod, setFMethod] = useState('');
  const [fBranchId, setFBranchId] = useState('');
  const [saving, setSaving] = useState(false);

  const [showCatMgr, setShowCatMgr] = useState(false);
  const [catName, setCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [editCatId, setEditCatId] = useState(null);
  const [editCatName, setEditCatName] = useState('');
  const [catActiveFilter, setCatActiveFilter] = useState(true);

  const { notify, showConfirm } = useNotification();

  const isSuperAdmin = useMemo(() => {
    const role = userRole?.toUpperCase() || '';
    return role.includes('SUPER_ADMIN') || role.includes('ADMIN');
  }, [userRole]);

  const toScopeParams = useCallback((value) => {
    if (value === SCOPE_GLOBAL) return { scope: 'GLOBAL' };
    if (!value || value === SCOPE_ALL) return { scope: 'ALL' };
    return { scope: 'BRANCH', branchId: value };
  }, []);

  const toWriteScope = useCallback((value) => {
    if (value === SCOPE_GLOBAL) return { scope: 'GLOBAL', branchId: null };
    return { scope: 'BRANCH', branchId: value || null };
  }, []);

  const loadCategoriesForScope = useCallback(async (scopeValue) => {
    const res = await api.get('/api/v1/expense-categories', { params: toScopeParams(scopeValue) });
    if (res.data.success) {
      setFormCategories(res.data.data || []);
      return res.data.data || [];
    }
    return [];
  }, [toScopeParams]);

  // Convert a local datetime string like '2026-05-21T00:00' to ISO-8601 UTC Instant
  const toInstant = (dtLocal) => {
    if (!dtLocal) return undefined;
    try { return new Date(`${dtLocal}:00`).toISOString(); } catch { return undefined; }
  };

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Build server-side query params — backend ExpenseSearchCriteria supports all of these
      const expParams = {
        fromDate:  toInstant(dateFrom),
        toDate:    toInstant(dateTo),
        categoryId:    filterCat       || undefined,
        paymentMethod: filterPayMethod || undefined,
        status:        filterStatus    || 'ACTIVE',
        size:       500,  // fetch all records in the period — avoids pagination data loss
        page:       0,
        sort:       'orderDate,desc',
        ...toScopeParams(isSuperAdmin ? filterBranch : orgId),
      };

      const [catRes, expRes, orgRes] = await Promise.allSettled([
        api.get('/api/v1/expense-categories', { params: toScopeParams(isSuperAdmin ? filterBranch : orgId) }),
        api.get('/api/v1/expenses', { params: expParams }),
        isSuperAdmin ? api.get('/api/v1/organizations') : Promise.resolve({ data: { success: true, data: [] } })
      ]);

      if (catRes.status === 'fulfilled' && catRes.value.data.success) {
        setCategories(catRes.value.data.data || []);
      } else if (!silent) {
        notify('error', catRes.reason?.response?.data?.message || 'Expense categories could not be loaded');
      }
      if (expRes.status === 'fulfilled' && expRes.value.data.success) {
        const responseData = expRes.value.data.data;
        // Backend returns a Page<ExpenseResponse>; extract the content array
        const data = Array.isArray(responseData) ? responseData : (responseData?.content || []);
        setExpenses(data);
      } else {
        throw expRes.reason || new Error('Expenses could not be loaded');
      }
      if (orgRes.status === 'fulfilled' && orgRes.value.data.success) setBranches(orgRes.value.data.data || []);
    } catch (e) {
      console.error('Expense Load Error:', e);
      notify('error', 'Failed to load expense data');
    } finally {
      setLoading(false);
    }
  // Reload whenever any filter changes — all filtering is now server-side
  }, [dateFrom, dateTo, filterCat, filterBranch, filterPayMethod, filterStatus, isSuperAdmin, notify, orgId, toScopeParams]);

  useEffect(() => { 
    if (userRole) loadData(); 
  }, [userRole, loadData]);

  // ALL filtering (date, category, branch, status, payment method) is now server-side.
  // The backend ExpenseSpecification handles payment method via the 'reference' column
  // on the Expense entity (set by ExpenseService.buildExpenseEntity).
  const filtered = expenses;

  // Both totals are based on the full server-returned dataset (already period-filtered)
  const totalVisible = useMemo(() => filtered.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0), [filtered]);
  const totalAll    = useMemo(() => expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0), [expenses]);

  const openAdd = () => {
    setEditing(null);
    const now = getBusinessNow();
    setFDate(getLocalDate(now));
    setFTime(now.toTimeString().slice(0,5));
    setFCatId(''); setFAmount(''); setFDesc(''); setFMethod('CASH');
    setFBranchId(isSuperAdmin ? (orgId || SCOPE_GLOBAL) : (orgId || ''));
    setShowForm(true);
  };

  const openEdit = (exp) => {
    setEditing(exp);
    const d = new Date(exp.expenseDate);
    setFDate(getLocalDate(d));
    setFTime(d.toTimeString().slice(0,5));
    setFCatId(exp.categoryId || '');
    setFAmount(String(exp.amount || ''));
    setFMethod(exp.paymentMethod || 'CASH');
    setFDesc(exp.description || '');
    setFBranchId(exp.scope === SCOPE_GLOBAL || !exp.orgId ? SCOPE_GLOBAL : exp.orgId);
    setShowForm(true);
  };

  useEffect(() => {
    if (showForm && fBranchId) {
      loadCategoriesForScope(fBranchId).catch(() => {
        notify('error', 'Expense categories could not be loaded for this scope');
      });
    }
  }, [showForm, fBranchId, loadCategoriesForScope, notify]);

  const handleSubmit = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (!fAmount || parseFloat(fAmount) <= 0) return notify('error', 'Enter a valid amount');
    if (!fCatId) return notify('error', 'Select a category');
    if (isSuperAdmin && (!fBranchId || fBranchId === SCOPE_ALL)) return notify('error', 'Select Organization or a branch');
    setSaving(true);
    try {
      const scopePayload = toWriteScope(isSuperAdmin ? fBranchId : orgId);
      // Expenses are immutable Order records — only CREATE is allowed
      const payload = {
        categoryId: fCatId,
        expenseDate: new Date(`${fDate}T${fTime}:00`).toISOString(),
        amount: parseFloat(fAmount),
        description: fDesc || null,
        paymentMethod: fMethod || 'CASH',
        ...scopePayload
      };
      
      if (editing) {
        await api.put(`/api/v1/expenses/${editing.id}`, payload);
        notify('success', 'Expense updated successfully (Old voided)');
      } else {
        const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
        await api.post('/api/v1/expenses', payload, { headers: { 'Idempotency-Key': idempotencyKey } });
        notify('success', 'Expense recorded successfully');
      }
      setShowForm(false);
      await loadData(true);
    } catch (err) { 
      notify('error', err.response?.data?.message || 'Failed to save'); 
    } finally { 
      setSaving(false); 
    }
  };

  const addCategory = async () => {
    if (!catName.trim()) return;
    setCatSaving(true);
    try {
      const categoryScope = showForm
        ? fBranchId
        : (isSuperAdmin ? (filterBranch === SCOPE_ALL ? SCOPE_GLOBAL : filterBranch) : orgId);
      const res = await api.post('/api/v1/expense-categories', {
        name: catName.trim(),
        sortOrder: 99,
        ...toWriteScope(categoryScope)
      });
      if (res.data.success) {
        const newCat = res.data.data;
        setCatName('');
        notify('success', 'Category added');
        await loadData(true);
        if (showForm && fBranchId) await loadCategoriesForScope(fBranchId);
        // Auto-select the new category in the form
        if (newCat && newCat.id) setFCatId(newCat.id);
        // Close manager to return to form
        setShowCatMgr(false);
      }
    } catch (e) { notify('error', 'Failed to add category'); }
    finally { setCatSaving(false); }
  };



  const toggleCatActive = (cat) => {
    const isY = cat.active === true;
    
    showConfirm({
      title: isY ? 'Mark Inactive?' : 'Restore Category?',
      message: `Are you sure you want to ${isY ? 'mark as inactive' : 'restore'} "${cat.name}"?`,
      type: isY ? 'error' : 'success',
      onConfirm: async () => {
        try {
          await api.put(`/api/v1/expense-categories/${cat.id}`, { 
            name: cat.name,
            sortOrder: cat.sortOrder || 0,
            active: !isY
          });
          notify('success', `Category ${isY ? 'marked inactive' : 'restored'}`);
          await loadData(true);
          if (showForm && fBranchId) await loadCategoriesForScope(fBranchId);
        } catch (e) { notify('error', 'Operation failed'); }
      }
    });
  };

  const prettyMethod = (m) => {
    const method = PAY_METHODS.find(p => p.value === m);
    return method ? method.label : (m || 'Other');
  };

  const handleDelete = async (id) => {
    showConfirm({
      title: 'Delete Expense?',
      message: 'This action will permanently remove this record from the accounts.',
      type: 'error',
      onConfirm: async () => {
        try {
          await api.delete(`/api/v1/expenses/${id}`);
          notify('success', 'Expense record deleted');
          await loadData(true);
        } catch (e) { notify('error', 'Failed to delete record'); }
      }
    });
  };

  const exportToCSV = (data) => {
    if (!data.length) return notify('error', 'No data to export');
    const headers = ['Date,Document No,Category,Description,Payment Mode,Amount'];
    const rows = data.map(r => {
      const d = new Date(r.expenseDate);
      const cat = categories.find(c => String(c.id) === String(r.categoryId));
      return `"${formatTzDate(d, timezone, { format: 'datetime' })}",${r.referenceNumber || ''},"${cat?.name || r.categoryName || ''}","${(r.description || '').replace(/"/g, '""')}",${r.paymentMethod},${r.amount}`;
    });
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `expenses_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToExcel = async (data) => {
    if (!data.length) return notify('error', 'No data to export');
    try {
      const XLSX = await import('xlsx');
      const formatted = data.map(r => {
        const cat = categories.find(c => String(c.id) === String(r.categoryId));
        return {
          'Date': formatTzDate(r.expenseDate, timezone, { format: 'datetime' }),
          'Document No': r.referenceNumber,
          'Category': cat?.name || r.categoryName,
          'Description': r.description,
          'Payment Mode': r.paymentMethod,
          'Amount': r.amount
        };
      });
      const ws = XLSX.utils.json_to_sheet(formatted);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Expenses");
      XLSX.writeFile(wb, `expenses_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch (e) { notify('error', 'Excel export failed'); }
  };

  const sym = '₹';
  const visibleCategories = showForm ? formCategories : categories;
  const branchFilterOptions = [
    { value: SCOPE_ALL, label: 'All Branches' },
    { value: SCOPE_GLOBAL, label: 'Organization' },
    ...branches.map(b => ({ value: b.id, label: b.name }))
  ];
  const expenseScopeOptions = [
    { value: SCOPE_GLOBAL, label: 'Organization' },
    ...branches.map(b => ({ value: b.id, label: b.name }))
  ];

  return (
    <DashboardLayout title="Expenses">
      <div className="exp-page">


        {/* Action Bar */}
        <div className="exp-action-bar">
          <button className="eab-btn primary" onClick={openAdd}><FaPlus /> Add Expense</button>
          <button className="eab-btn ghost" onClick={() => setShowCatMgr(true)}><FaCog /> Categories</button>
          <button className="eab-btn export" onClick={() => exportToExcel(filtered)}><FaFileExcel /> Excel</button>
          <button className="eab-btn export" onClick={() => exportToCSV(filtered)}><FaFileCsv /> CSV</button>
        </div>

        {/* Filter Bar — single row */}
        <div className="exp-filter-bar">
          <div className="exp-dates">
            <PremiumDateTimePicker value={dateFrom} onChange={setDateFrom} />
            <span className="date-sep">→</span>
            <PremiumDateTimePicker value={dateTo} onChange={setDateTo} />
          </div>
          <NiceSelect
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: 'ACTIVE', label: 'Completed' },
              { value: 'VOID', label: 'Voided' }
            ]}
            placeholder="All Status"
          />
          <NiceSelect
            options={[
              { value: '', label: 'All Categories' },
              ...categories.map(c => ({ value: c.id, label: c.name }))
            ]}
            value={filterCat}
            onChange={setFilterCat}
          />
          <NiceSelect
            options={[
              { value: '', label: 'All Payments' },
              ...PAY_METHODS
            ]}
            value={filterPayMethod}
            onChange={setFilterPayMethod}
          />
          {isSuperAdmin && (
            <NiceSelect
              options={branchFilterOptions}
              value={filterBranch}
              onChange={setFilterBranch}
            />
          )}
        </div>


        {/* ── TABLE / EMPTY ── */}
        {loading ? (
          <div className="exp-loading">
            <div className="loading-spinner" />
            <span>Synchronizing records…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="erp-empty-state">
            <div className="empty-ic"><FaFileAlt /></div>
            <div className="empty-title">No Transaction History</div>
            <div className="empty-sub">Adjust your filters or record your first expense.</div>
            <button className="exp-btn primary" style={{marginTop:20}} onClick={openAdd}><FaPlus /> Add First Expense</button>
          </div>
        ) : (
          <>
            <div className="erp-table-wrapper desk-only">
               <table className="erp-table">
                  <thead>
                    <tr>
                      <th style={{ width: '160px' }}>Expense No</th>
                      <th style={{ width: '140px' }}>Date</th>
                      <th style={{ width: '150px' }}>Category</th>
                      <th>Notes</th>
                      <th style={{ width: '120px' }}>Payment Type</th>
                      <th style={{ width: '120px' }}>Updated By</th>
                      <th className="text-right" style={{ width: '110px' }}>Amount</th>
                      <th style={{ width: '100px' }}>Status</th>
                      <th style={{ width: '90px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => {
                      const d = new Date(r.expenseDate);
                      const cat = categories.find(c => String(c.id) === String(r.categoryId));
                      const isVoid = filterStatus === 'VOID';
                      return (
                        <tr key={r.id} className={`erp-tr${isVoid ? ' voided-row' : ''}`}>
                          <td>
                            <span className="row-docno">{r.referenceNumber || '—'}</span>
                          </td>
                          <td>
                            <div className="row-date">
                              <span className="rd-d">{formatTzDate(d, timezone, { format: 'date', year: undefined })}</span>
                              <span className="rd-t">{formatTzDate(d, timezone, { format: 'time' })}</span>
                            </div>
                          </td>
                          <td>
                            <div className="row-cat">
                              <span className="rc-text">{cat ? cat.name : (r.categoryName || 'Uncategorized')}</span>
                            </div>
                          </td>
                          <td>
                            <div className="row-note">
                              <span>{r.description || '—'}</span>
                            </div>
                          </td>
                          <td>
                            <div className="row-pay">
                              <span className={`method-tag ${r.paymentMethod?.toLowerCase()}`}>{prettyMethod(r.paymentMethod)}</span>
                            </div>
                          </td>
                          <td>
                            <span className="row-ub">
                              {r.updatedBy ? (r.updatedBy.includes('@') ? r.updatedBy.split('@')[0] : r.updatedBy) : 'SYSTEM'}
                            </span>
                          </td>
                          <td className="text-right">
                            <span className="row-amt">{sym}{parseFloat(r.amount).toFixed(2)}</span>
                          </td>
                          <td>
                            <span className={`status-tag ${isVoid ? 'void' : 'active'}`}>
                              {isVoid ? 'Voided' : 'Completed'}
                            </span>
                          </td>
                          <td>
                            <div className="row-acts">
                              {!isVoid && (
                                <>
                                  <button className="ract-btn edit" onClick={() => openEdit(r)} title="Edit"><FaEdit /></button>
                                  <button className="ract-btn danger" onClick={() => handleDelete(r.id)} title="Delete"><FaTrash /></button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
               </table>
            </div>

            <div className="mob-list phn-only">
              {filtered.map(r => {
                const d = new Date(r.expenseDate);
                const cat = categories.find(c => String(c.id) === String(r.categoryId));
                const isVoid = filterStatus === 'VOID';
                return (
                  <div className={`mob-card${isVoid ? ' void' : ''}`} key={r.id}>
                    <div className="mc-top">
                      <div className="mc-left">
                        <span className="row-docno">{r.referenceNumber || '—'}</span>
                        <span className={`st-badge ${isVoid ? 'void' : 'active'}`}>
                          {isVoid ? 'Voided' : 'Completed'}
                        </span>
                        <div className="mc-meta-row" style={{marginTop:8}}>
                          <span className="rd-d">{formatTzDate(d, timezone, { format: 'date', year: undefined })}</span>
                          <span className="rd-t">{formatTzDate(d, timezone, { format: 'time' })}</span>
                        </div>
                      </div>
                      <div className="mc-amt-badge">
                        <span className="row-amt">{sym}{parseFloat(r.amount).toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="mc-mid">
                      <div className="mc-meta-row">
                        <span className="rc-text">{cat ? cat.name : (r.categoryName || 'Uncategorized')}</span>
                      </div>
                      {r.description && (
                        <div className="mc-note">{r.description}</div>
                      )}
                    </div>
                    <div className="mc-btm">
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <div className="mc-pay-pill">
                          <FaWallet style={{fontSize:8}} />
                          <span>{prettyMethod(r.paymentMethod)}</span>
                        </div>
                        {r.updatedBy && (
                          <div style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', background: '#f1f5f9', padding: '4px 8px', borderRadius: '12px' }}>
                            <span>By: {r.updatedBy.includes('@') ? r.updatedBy.split('@')[0] : r.updatedBy}</span>
                          </div>
                        )}
                      </div>
                      {/* Hide Edit/Delete for voided records — matches desktop behavior */}
                      {!isVoid && (
                        <div className="mc-acts">
                          <button className="ract-btn" onClick={() => openEdit(r)}><FaEdit /></button>
                          <button className="ract-btn danger" onClick={() => handleDelete(r.id)}><FaTrash /></button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {showForm && (
        <CafeQRPopup
          title={editing ? 'Modify Transaction' : 'Record New Expense'}
          icon={editing ? FaEdit : FaPlus}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSave={handleSubmit}
          saveLabel={editing ? 'Save Changes' : 'Complete'}
          cancelLabel="Cancel"
          isSaving={saving}
          maxWidth="440px"
        >
          <div className="mdl-field">
            <label className="mdl-lbl">Expense Date <span className="req">*</span></label>
            <PremiumDateTimePicker 
              value={`${fDate}T${fTime}`} 
              onChange={val => {
                setFDate(val.slice(0, 10));
                setFTime(val.slice(11, 16));
              }} 
            />
          </div>

          {isSuperAdmin && (
            <div className="mdl-field">
              <label className="mdl-lbl">Expense Scope <span className="req">*</span></label>
              <NiceSelect 
                value={fBranchId} 
                onChange={(value) => {
                  setFBranchId(value);
                  setFCatId('');
                }} 
                options={expenseScopeOptions}
                placeholder="Select scope…"
              />
            </div>
          )}

          <div className="mdl-field">
            <div className="lbl-row">
              <label className="mdl-lbl">Category <span className="req">*</span></label>
              <button type="button" className="lbl-act" onClick={() => setShowCatMgr(true)}><FaPlus /> New</button>
            </div>
            <NiceSelect 
              value={fCatId} 
              onChange={setFCatId} 
              options={formCategories.filter(c => c.active !== false).map(c => ({ value: c.id, label: c.name }))}
              placeholder="Select category…"
            />
          </div>

          <div className="mdl-row">
            <div className="mdl-field">
              <label className="mdl-lbl">Amount <span className="req">*</span></label>
              <div className="amt-input-w">
                <span className="amt-pre">{sym}</span>
                <input 
                  className="amt-input" 
                  type="number" 
                  step="0.01" 
                  value={fAmount} 
                  onChange={e => setFAmount(e.target.value)} 
                  placeholder="0.00" 
                  required 
                />
              </div>
            </div>
            <div className="mdl-field">
              <label className="mdl-lbl">Payment Mode <span className="req">*</span></label>
              <NiceSelect 
                value={fMethod} 
                onChange={setFMethod} 
                options={PAY_METHODS}
              />
            </div>
          </div>

          <div className="mdl-field">
            <label className="mdl-lbl">Reference / Notes</label>
            <textarea 
              className="mdl-txt" 
              value={fDesc} 
              onChange={e => setFDesc(e.target.value)} 
              placeholder="Brief description of the expense…"
              rows={2}
            />
          </div>
        </CafeQRPopup>
      )}

      {showCatMgr && (
        <CafeQRPopup
          title="Expense Categories"
          icon={FaCog}
          onClose={() => setShowCatMgr(false)}
          onCancel={() => setShowCatMgr(false)}
          cancelLabel="Close"
          maxWidth="500px"
        >
          <div className="cat-add-box">
            <input 
              className="cat-add-in" 
              value={catName} 
              onChange={e => setCatName(e.target.value)} 
              placeholder="New category name…" 
            />
            <button className="cat-add-btn" onClick={addCategory} disabled={catSaving}>
              {catSaving ? '…' : <FaPlus />}
            </button>
          </div>
          <div className="cat-filter-tabs">
            <button 
              type="button" 
              className={`cat-tab ${catActiveFilter ? 'on' : ''}`} 
              onClick={() => setCatActiveFilter(true)}
            >
              Active
            </button>
            <button 
              type="button" 
              className={`cat-tab ${!catActiveFilter ? 'on' : ''}`} 
              onClick={() => setCatActiveFilter(false)}
            >
              Inactive
            </button>
          </div>

          <div className="cat-list">
            {visibleCategories
              .filter(c => (catActiveFilter ? c.active !== false : c.active === false))
              .map(c => (
                <div key={c.id} className={`cat-item ${c.active === false ? 'inactive' : ''}`}>
                  <div className="cat-item-left">
                    <div className="cat-dot" />
                    <span className="cat-n">{c.name}</span>
                  </div>
                  <button className={`cat-tog ${c.active === false ? 'restore' : 'deactivate'}`} onClick={() => toggleCatActive(c)}>
                    {c.active === false ? <><FaUndo /> Restore</> : 'Deactivate'}
                  </button>
                </div>
              ))}
            {visibleCategories.filter(c => catActiveFilter ? c.active !== false : c.active === false).length === 0 && (
              <div className="cat-empty">No {catActiveFilter ? 'active' : 'inactive'} categories found</div>
            )}
          </div>
        </CafeQRPopup>
      )}

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        .exp-page { width: 100%; max-width: 100%; position: relative; box-sizing: border-box; padding: 0 20px 40px; font-family: 'Inter', sans-serif; }

        /* ── ACTION BAR ── */
        .exp-action-bar { display: flex; justify-content: flex-end; align-items: center; gap: 6px; margin-bottom: 14px; padding-top: 4px; }
        .eab-btn { display: inline-flex; align-items: center; gap: 5px; padding: 7px 13px; border-radius: 8px; border: none; font: 600 11px 'Inter', sans-serif; cursor: pointer; transition: all 0.2s; white-space: nowrap; letter-spacing: 0.1px; }
        .eab-btn svg { font-size: 11px; }
        .eab-btn.primary { background: linear-gradient(135deg, #f97316, #ea580c); color: #fff; box-shadow: 0 3px 10px rgba(249,115,22,0.3); }
        .eab-btn.primary:hover { transform: translateY(-1px); box-shadow: 0 5px 14px rgba(249,115,22,0.4); }
        .eab-btn.ghost { background: #fff; color: #475569; border: 1px solid #e2e8f0; }
        .eab-btn.ghost:hover { border-color: #f97316; color: #f97316; background: #fff7ed; }
        .eab-btn.export { background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; }
        .eab-btn.export:hover { background: #f1f5f9; color: #1e293b; border-color: #cbd5e1; }

        .exp-filter-bar { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; margin-bottom: 20px; background: #fff; padding: 8px 12px; border-radius: 14px; border: 1px solid #e8edf5; box-shadow: 0 2px 10px rgba(0,0,0,0.04); position: relative; z-index: 100; }
        .exp-dates { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .exp-dates > :global(.premium-dt-picker) { width: 235px !important; }
        .date-sep { color: #cbd5e1; font-weight: 300; flex-shrink: 0; font-size: 16px; }
        
        /* Make other filters smaller/compact */
        .exp-filter-bar > :global(.nice-select), 
        .exp-filter-bar > :global(.nice-select-wrapper) { 
          flex-shrink: 0; 
          min-width: 115px !important; 
          max-width: 135px !important; 
        }
        .exp-filter-bar :global(.nice-select-trigger) {
          padding: 6px 10px !important;
          height: 36px !important;
        }
        .exp-filter-bar :global(.nice-select-trigger span) {
          font-size: 12px !important;
          font-weight: 700 !important;
        }

        /* ── SELECT / PICKER OVERRIDES ── */
        :global(.nice-select-trigger), :global(.dt-trigger), :global(.premium-dt-picker), :global(.nice-select) { border: 1.5px solid #e2e8f0 !important; border-radius: 12px !important; transition: 0.25s !important; background: #f8fafc !important; }
        :global(.nice-select-trigger:hover), :global(.dt-trigger:hover), :global(.premium-dt-picker:hover) { background: #fff7ed !important; border-color: #f97316 !important; }

        /* ── TABLE ── */
        .erp-table-wrapper { width: 100%; background: #fff; border-radius: 20px; border: 1px solid #f1f5f9; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.04); margin-top: 8px; }
        .erp-table { width: 100%; border-collapse: collapse; }
        .erp-table thead { background: linear-gradient(180deg, #f8fafc, #f1f5f9); }
        .erp-table th { padding: 8px 12px; text-align: left; font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #e8edf5; }
        .erp-table td { padding: 8px 12px; border-bottom: 1px solid #f8fafc; vertical-align: middle; }
        .erp-table tr:last-child td { border-bottom: none; }
        .erp-tr { transition: background 0.15s; border-left: 3px solid transparent; }
        .erp-tr:hover td { background: #fafbff; }
        .erp-tr:hover { border-left-color: #f97316; }
        .voided-row { opacity: 0.65; background: #fef2f2 !important; border-left: 3px solid #ef4444 !important; }
        .voided-row td { background: transparent !important; }
        .voided-row .row-docno { color: #991b1b; }
        .voided-row .row-amt { color: #94a3b8; }

        .row-docno { font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 700; color: #475569; letter-spacing: 0.3px; white-space: nowrap; }
        .row-date { display: flex; flex-direction: column; gap: 2px; }
        .rd-d { font-size: 11px; font-weight: 700; color: #1e293b; }
        .rd-t { font-size: 9px; font-weight: 500; color: #94a3b8; }
        .rc-text { font-size: 11px; font-weight: 700; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }
        .row-note { font-size: 11px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px; }
        .row-ub { font-size: 11px; font-weight: 600; color: #475569; white-space: nowrap; }
        .row-amt { font-size: 13.5px; font-weight: 900; color: #dc2626; }

        .method-tag { font-size: 11px; font-weight: 700; color: #475569; white-space: nowrap; }
        .method-tag.cash { color: #c2410c; }
        .method-tag.card { color: #1d4ed8; }
        .method-tag.upi { color: #a21caf; }
        .method-tag.bank_transfer { color: #15803d; }
        .method-tag.cheque { color: #a16207; }

        .status-tag { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block; }
        .status-tag.active { color: #15803d; }
        .status-tag.void { color: #b91c1c; }

        .text-right { text-align: right !important; }
        .row-acts { display: flex; gap: 6px; justify-content: flex-end; }
        .ract-btn { width: 28px; height: 28px; border-radius: 8px; border: 1px solid #f1f5f9; background: #fff; color: #94a3b8; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; font-size: 11px; }
        .ract-btn.edit:hover { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; transform: scale(1.08); }
        .ract-btn.danger:hover { background: #fef2f2; color: #ef4444; border-color: #fecaca; transform: scale(1.08); }

        /* ── LOADING & EMPTY ── */
        .exp-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 80px 20px; color: #94a3b8; font-size: 14px; font-weight: 600; background: #fff; border-radius: 20px; border: 1px solid #f1f5f9; margin-top: 8px; }
        .loading-spinner { width: 40px; height: 40px; border: 3px solid #f1f5f9; border-top-color: #f97316; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .erp-empty-state { text-align: center; padding: 80px 20px; display: flex; flex-direction: column; align-items: center; background: #fff; border-radius: 20px; border: 1px dashed #e2e8f0; margin-top: 8px; }
        .empty-ic { font-size: 48px; color: #e2e8f0; margin-bottom: 16px; }
        .empty-title { font-size: 18px; font-weight: 800; color: #1e293b; margin-bottom: 8px; }
        .empty-sub { font-size: 13px; color: #94a3b8; }

        /* ── MOBILE CARDS ── */
        .mob-list { display: flex; flex-direction: column; gap: 10px; width: 100%; }
        .mob-card { background: #fff; border-radius: 14px; padding: 12px 14px; border: 1px solid #f1f5f9; box-shadow: 0 4px 16px rgba(0,0,0,0.04); border-left: 4px solid #f97316; }
        .mob-card.void { border-left-color: #ef4444; background: #fff8f8; }
        .mc-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
        .mc-left { display: flex; flex-direction: column; gap: 4px; }
        .mc-amt-badge { background: #fef2f2; padding: 4px 8px; border-radius: 8px; border: 1px solid rgba(239,68,68,0.1); }
        .mc-amt-badge .row-amt { font-size: 14px; }
        .mc-mid { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
        .mc-meta-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .mc-note { font-size: 11px; color: #64748b; line-height: 1.4; background: #f8fafc; padding: 6px 10px; border-radius: 8px; border: 1px solid #f1f5f9; }
        .mc-btm { display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid #f1f5f9; }
        .mc-pay-pill { display: flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; background: #f1f5f9; padding: 4px 8px; border-radius: 12px; }
        .mc-acts { display: flex; gap: 6px; }

        /* ── MODAL ── */
        .mdl-field { display: flex; flex-direction: column; margin-bottom: 16px; }
        .mdl-field:last-child { margin-bottom: 0; }
        .mdl-lbl { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px; }
        .mdl-lbl .req { color: #ef4444; }
        .lbl-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .lbl-row .mdl-lbl { margin-bottom: 0; }
        .lbl-act { border: none; background: none; color: #f97316; font-size: 10px; font-weight: 700; cursor: pointer; padding: 0; display: flex; align-items: center; gap: 4px; }
        .mdl-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
        .amt-input-w { position: relative; display: flex; align-items: center; }
        .amt-pre { position: absolute; left: 12px; font-weight: 800; color: #94a3b8; font-size: 14px; z-index: 1; }
        .amt-input { width: 100%; padding: 11px 12px 11px 28px; border-radius: 12px; border: 1.5px solid #e2e8f0; background: #f8fafc; font-size: 15px; font-weight: 800; color: #1e293b; outline: none; transition: 0.2s; box-sizing: border-box; }
        .amt-input:focus { border-color: #f97316; background: #fff; box-shadow: 0 0 0 4px rgba(249,115,22,0.08); }
        .amt-input::-webkit-outer-spin-button,
        .amt-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .amt-input[type=number] { -moz-appearance: textfield; }
        .mdl-txt { padding: 11px 14px; border-radius: 12px; border: 1.5px solid #e2e8f0; background: #f8fafc; font-size: 13px; font-weight: 500; color: #475569; outline: none; transition: 0.2s; resize: none; width: 100%; font-family: inherit; box-sizing: border-box; }
        .mdl-txt:focus { border-color: #f97316; background: #fff; box-shadow: 0 0 0 4px rgba(249,115,22,0.08); }

        /* ── CATEGORY MANAGER ── */
        .cat-add-box { display: flex; gap: 8px; margin-bottom: 14px; }
        .cat-add-in { flex: 1; padding: 11px 14px; border-radius: 12px; border: 1.5px solid #e2e8f0; background: #f8fafc; font-size: 13px; font-weight: 600; color: #1e293b; outline: none; transition: 0.2s; }
        .cat-add-in:focus { border-color: #f97316; background: #fff; box-shadow: 0 0 0 4px rgba(249,115,22,0.08); }
        .cat-add-btn { background: linear-gradient(135deg, #f97316, #ea580c); color: #fff; border: none; width: 42px; height: 42px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 4px 12px rgba(249,115,22,0.3); transition: 0.2s; flex-shrink: 0; }
        .cat-add-btn:hover { transform: scale(1.05); }
        .cat-filter-tabs { display: flex; gap: 6px; margin-bottom: 14px; padding: 4px; background: #f1f5f9; border-radius: 14px; }
        .cat-tab { flex: 1; border: none; background: none; padding: 9px; border-radius: 10px; font-size: 11px; font-weight: 700; color: #94a3b8; cursor: pointer; transition: 0.2s; }
        .cat-tab.on { background: #fff; color: #f97316; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .cat-list { display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto; padding-right: 4px; }
        .cat-list::-webkit-scrollbar { width: 4px; }
        .cat-list::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
        .cat-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .cat-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: #f8fafc; border-radius: 12px; border: 1px solid #f1f5f9; transition: 0.2s; }
        .cat-item:hover { border-color: #e2e8f0; background: #fff; }
        .cat-item.inactive { opacity: 0.55; }
        .cat-item-left { display: flex; align-items: center; gap: 10px; }
        .cat-dot { width: 8px; height: 8px; border-radius: 50%; background: #f97316; flex-shrink: 0; }
        .cat-item.inactive .cat-dot { background: #94a3b8; }
        .cat-n { font-size: 12px; font-weight: 700; color: #475569; }
        .cat-tog { border: none; padding: 5px 12px; border-radius: 8px; font-size: 10px; font-weight: 700; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 5px; }
        .cat-tog.deactivate { background: #fef2f2; color: #dc2626; }
        .cat-tog.deactivate:hover { background: #fee2e2; }
        .cat-tog.restore { background: #f0fdf4; color: #16a34a; }
        .cat-tog.restore:hover { background: #dcfce7; }
        .cat-empty { text-align: center; padding: 24px; color: #94a3b8; font-size: 12px; font-weight: 600; }

        /* ── RESPONSIVE ── */
        @media (min-width: 769px) { .phn-only { display: none !important; } }
        @media (max-width: 768px) {
          .exp-page { padding: 0 12px 24px; }
          .desk-only { display: none !important; }
          .exp-hero { flex-direction: column; align-items: flex-start; gap: 20px; padding: 20px; }
          .exp-header-actions { width: 100%; flex-wrap: wrap; }
          .exp-filter-bar { flex-direction: column; align-items: stretch; gap: 12px; }
          .exp-filter-grp { flex-direction: column; align-items: stretch; }
          .exp-filter-actions { flex-wrap: wrap; }
          .exp-dates { flex-direction: column; }
          .exp-dates > :global(.premium-dt-picker) { width: 100% !important; }
          .exp-kpi-row { grid-template-columns: 1fr; }
          .mdl-row { grid-template-columns: 1fr; }
        }

        /* ── PRINT ── */
        @media print {
          @page { margin: 1cm; size: auto; }
          :global(body), :global(html) { background: #fff !important; }
          .exp-hero, .exp-filter-bar, .exp-kpi-row, .tbl-exp-btn, .ract-btn, .phn-only { display: none !important; }
          :global(.sidebar), :global(.topbar), :global(.top-bar), :global(.header), :global(nav) { display: none !important; }
          .erp-table-wrapper { width: 100% !important; border: 1.5px solid #000 !important; box-shadow: none !important; }
          .erp-table th { background: #f1f5f9 !important; color: #000 !important; border-bottom: 2px solid #000 !important; }
          .erp-table td { color: #000 !important; border-bottom: 1px solid #eee !important; }
        }
      `}</style>

    </DashboardLayout>
  );
}
