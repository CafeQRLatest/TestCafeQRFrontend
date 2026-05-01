import React, { useState, useEffect, useMemo } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import NiceSelect from '../../components/NiceSelect';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import { FaTrash, FaEdit, FaCog, FaWallet, FaTag, FaFileAlt, FaUndo, FaPlus, FaFileExcel, FaFileCsv, FaFilePdf } from 'react-icons/fa';

const PAY_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' }
];

export default function Expenses() {
  const { timezone, userRole } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterPayMethod, setFilterPayMethod] = useState('');
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

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [catRes, expRes, orgRes] = await Promise.all([
        api.get('/api/v1/expenses/categories'),
        api.get('/api/v1/expenses'),
        isSuperAdmin ? api.get('/api/v1/organizations') : Promise.resolve({ data: { success: true, data: [] } })
      ]);
      
      if (catRes.data.success) setCategories(catRes.data.data || []);
      if (expRes.data.success) {
        // New API returns a flat list (not paginated), filtered client-side by date
        const data = Array.isArray(expRes.data.data) ? expRes.data.data : [];
        setExpenses(data.sort((a, b) => new Date(b.expenseDate) - new Date(a.expenseDate)));
      }
      if (orgRes.data.success) setBranches(orgRes.data.data || []);
    } catch (e) { 
      notify('error', 'Failed to load expense data');
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => { 
    if (userRole) loadData(); 
  }, [userRole]);

  // Client-side filtering by date range, category, branch, and payment method
  const filtered = useMemo(() => {
    let result = expenses;
    if (filterCat) result = result.filter(e => String(e.categoryId) === String(filterCat));
    if (filterBranch) result = result.filter(e => String(e.orgId) === String(filterBranch));
    if (filterPayMethod) result = result.filter(e => String(e.paymentMethod) === String(filterPayMethod));
    if (dateFrom) result = result.filter(e => e.expenseDate && e.expenseDate >= `${dateFrom}:00`);
    if (dateTo)   result = result.filter(e => e.expenseDate && e.expenseDate <= `${dateTo}:59`);
    return result;
  }, [expenses, filterCat, filterBranch, filterPayMethod, dateFrom, dateTo]);

  const totalVisible = useMemo(() => filtered.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0), [filtered]);
  const totalAll = useMemo(() => expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0), [expenses]);

  const openAdd = () => {
    setEditing(null);
    const now = getBusinessNow();
    setFDate(getLocalDate(now));
    setFTime(now.toTimeString().slice(0,5));
    setFCatId(''); setFAmount(''); setFDesc(''); setFMethod('CASH');
    setFBranchId('');
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
    setFBranchId(exp.orgId || '');
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fAmount || parseFloat(fAmount) <= 0) return notify('error', 'Enter a valid amount');
    if (!fCatId) return notify('error', 'Select a category');
    if (isSuperAdmin && !fBranchId) return notify('error', 'Select a branch');
    setSaving(true);
    try {
      // Expenses are immutable Order records — only CREATE is allowed
      const payload = {
        categoryId: fCatId,
        expenseDate: `${fDate}T${fTime}:00`,
        amount: parseFloat(fAmount),
        description: fDesc || null,
        paymentMethod: fMethod || 'CASH',
        branchId: isSuperAdmin ? fBranchId : null
      };
      await api.post('/api/v1/expenses', payload);
      notify('success', 'Expense recorded successfully');
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
      const res = await api.post('/api/v1/expenses/categories', { name: catName.trim(), sortOrder: 99 });
      if (res.data.success) {
        const newCat = res.data.data;
        setCatName('');
        notify('success', 'Category added');
        await loadData(true);
        // Auto-select the new category in the form
        if (newCat && newCat.id) setFCatId(newCat.id);
        // Close manager to return to form
        setShowCatMgr(false);
      }
    } catch (e) { notify('error', 'Failed to add category'); }
    finally { setCatSaving(false); }
  };

  const toggleCatActive = (cat) => {
    const isY = cat.isActive === true;
    
    showConfirm({
      title: isY ? 'Mark Inactive?' : 'Restore Category?',
      message: `Are you sure you want to ${isY ? 'mark as inactive' : 'restore'} "${cat.name}"?`,
      type: isY ? 'error' : 'success',
      onConfirm: async () => {
        try {
          await api.put(`/api/v1/expenses/categories/${cat.id}`, { 
            name: cat.name,
            sortOrder: cat.sortOrder || 0,
            isActive: !isY
          });
          notify('success', `Category ${isY ? 'marked inactive' : 'restored'}`);
          await loadData(true);
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
      return `"${d.toLocaleDateString()}, ${d.toLocaleTimeString()}",${r.referenceNumber || ''},"${cat?.name || r.categoryName || ''}","${(r.description || '').replace(/"/g, '""')}",${r.paymentMethod},${r.amount}`;
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
          'Date': new Date(r.expenseDate).toLocaleString(),
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

  return (
    <DashboardLayout title="Expenses">
      <div className="exp-page">
        
        {/* Tier 1: Action Header */}
        <div className="exp-header">
          <div className="exp-header-actions">
            <button className="exp-btn primary" onClick={openAdd}>+ Add Expense</button>
            <button className="exp-btn ghost" onClick={() => setShowCatMgr(true)}><FaCog /> Categories</button>
            <button className="tbl-exp-btn desk-only" onClick={() => exportToExcel(filtered)}><FaFileExcel /> Excel</button>
            <button className="tbl-exp-btn desk-only" onClick={() => exportToCSV(filtered)}><FaFileCsv /> CSV</button>
          </div>
        </div>

        {/* Tier 2: Unified Filter Bar */}
        <div className="exp-filter-bar">
          <div className="exp-filter-grp">
            <div className="exp-dates">
              <PremiumDateTimePicker 
                value={dateFrom} 
                onChange={setDateFrom} 
              />
              <span className="exp-to">→</span>
              <PremiumDateTimePicker 
                value={dateTo} 
                onChange={setDateTo} 
              />
            </div>
          </div>
          
          <div className="exp-filter-actions">
            {isSuperAdmin && (
              <div className="exp-branch-select">
                <NiceSelect
                  options={[
                    { value: '', label: 'All Branches' },
                    ...branches.map(b => ({ value: b.id, label: b.name }))
                  ]}
                  value={filterBranch}
                  onChange={setFilterBranch}
                />
              </div>
            )}
            
            <div className="exp-pay-select">
              <NiceSelect
                options={[
                  { value: '', label: 'All Payments' },
                  ...PAY_METHODS
                ]}
                value={filterPayMethod}
                onChange={setFilterPayMethod}
              />
            </div>

            <div className="exp-cat-select">
              <NiceSelect
                options={[
                  { value: '', label: 'All Categories' },
                  ...categories.filter(c => c.isActive !== false).map(c => ({ value: c.id, label: c.name }))
                ]}
                value={filterCat}
                onChange={setFilterCat}
              />
            </div>
          </div>
        </div>

        <div className="print-report-header">
          <div className="prnt-title">Expense Audit Report</div>
          <div className="prnt-meta">
            <span>Period: {new Date(dateFrom).toLocaleDateString()} - {new Date(dateTo).toLocaleDateString()}</span>
            <span>Generated: {new Date().toLocaleString()}</span>
          </div>
        </div>

        {/* Table Tier */}
        {loading ? (
          <div className="exp-loading">Synchronizing records…</div>
        ) : filtered.length === 0 ? (
          <div className="erp-empty-state">
            <div className="empty-ic"><FaFileAlt /></div>
            <div className="empty-title">No Transaction History</div>
            <div className="empty-sub">Adjust your filters or try a different search.</div>
          </div>
        ) : (
          <>
            <div className="erp-table-wrapper desk-only">
               <table className="erp-table">
                  <thead>
                    <tr>
                      <th style={{ width: '180px' }}>Doc No</th>
                      <th style={{ width: '140px' }}>Timestamp</th>
                      <th style={{ width: '150px' }}>Category</th>
                      <th>Notes</th>
                      <th style={{ width: '140px' }}>Payment</th>
                      <th className="text-right" style={{ width: '120px' }}>Value</th>
                      <th style={{ width: '100px' }}></th>
                    </tr>
                  </thead>
                 <tbody>
                   {filtered.map(r => {
                     const d = new Date(r.expenseDate);
                     const cat = categories.find(c => String(c.id) === String(r.categoryId));
                     return (
                        <tr key={r.id}>
                          <td>
                            <span className="row-docno">{r.referenceNumber || '—'}</span>
                          </td>
                          <td>
                            <div className="row-date">
                              <span className="rd-d">{d.toLocaleDateString('en-IN', {day:'2-digit', month:'short'})}</span>
                              <span className="rd-t">{d.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit', hour12:true})}</span>
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
                              <span>{prettyMethod(r.paymentMethod)}</span>
                            </div>
                          </td>
                          <td className="text-right">
                            <span className="row-amt">{sym}{parseFloat(r.amount).toFixed(2)}</span>
                          </td>
                          <td>
                            <div className="row-acts">
                              <button className="ract-btn" onClick={() => openEdit(r)} title="Edit"><FaEdit /></button>
                              <button className="ract-btn danger" onClick={() => handleDelete(r.id)} title="Delete"><FaTrash /></button>
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
                return (
                  <div className="mob-card" key={r.id}>
                    <div className="mc-top">
                      <div className="mc-left">
                        <span className="row-docno">{r.referenceNumber || '—'}</span>
                        <div className="mc-meta-row" style={{marginTop:8}}>
                          <span className="rd-d">{d.toLocaleDateString('en-IN', {day:'2-digit', month:'short'})}</span>
                          <span className="rd-t">{d.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit', hour12:true})}</span>
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
                      <div className="mc-pay-pill">
                        <FaWallet style={{fontSize:8}} />
                        <span>{prettyMethod(r.paymentMethod)}</span>
                      </div>
                      <div className="mc-acts">
                        <button className="ract-btn" onClick={() => openEdit(r)}><FaEdit /></button>
                        <button className="ract-btn danger" onClick={() => handleDelete(r.id)}><FaTrash /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {showForm && (
        <div className="mdl-ov" onClick={() => { setShowForm(false); setEditing(null); }}>
          <div className="mdl-box" onClick={e => e.stopPropagation()} style={{maxWidth:400}}>
            <div className="mdl-hdr">
              <h3 className="mdl-hdr-t">{editing ? 'Modify Transaction' : 'Record New Expense'}</h3>
              <button className="mdl-hdr-x" onClick={() => { setShowForm(false); setEditing(null); }}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="mdl-body">
                <div className="mdl-field">
                  <label className="mdl-lbl">Occurrence Date <span className="req">*</span></label>
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
                    <label className="mdl-lbl">Branch / Location <span className="req">*</span></label>
                    <NiceSelect 
                      value={fBranchId} 
                      onChange={setFBranchId} 
                      options={branches.map(b => ({ value: b.id, label: b.name }))}
                      placeholder="Select branch…"
                    />
                  </div>
                )}

                <div className="mdl-field highlight">
                  <div className="lbl-row">
                    <label className="mdl-lbl">Categorization <span className="req">*</span></label>
                    <button type="button" className="lbl-act" onClick={() => setShowCatMgr(true)}>Manage</button>
                  </div>
                  <NiceSelect 
                    value={fCatId} 
                    onChange={setFCatId} 
                    options={categories.filter(c => c.isActive !== false).map(c => ({ value: c.id, label: c.name }))}
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
              </div>
              <div className="mdl-ftr">
                <button type="button" className="mdl-btn ghost" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
                <button type="submit" className="mdl-btn primary" disabled={saving}>
                  {saving ? 'Processing…' : editing ? 'Save Changes' : 'Confirm Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCatMgr && (
        <div className="mdl-ov" onClick={() => setShowCatMgr(false)}>
          <div className="mdl-box" onClick={e => e.stopPropagation()} style={{maxWidth:500}}>
            <div className="mdl-hdr">
              <h3 className="mdl-hdr-t">Expense Categories</h3>
              <button className="mdl-hdr-x" onClick={() => setShowCatMgr(false)}>✕</button>
            </div>
            <div className="mdl-body">
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
                {categories
                  .filter(c => (catActiveFilter ? c.isActive !== false : c.isActive === false))
                  .map(c => (
                    <div key={c.id} className={`cat-item ${c.isActive === false ? 'inactive' : ''}`}>
                      <span className="cat-n">{c.name}</span>
                      <button className="cat-tog" onClick={() => toggleCatActive(c)}>
                        {c.isActive === false ? 'Restore' : 'Deactivate'}
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .exp-page { width: 100%; max-width: 100%; overflow-x: hidden; box-sizing: border-box; padding: 0 20px; }
        
        .exp-header { display: flex; justify-content: flex-end; align-items: center; margin-bottom: 24px; padding: 16px 0; border-bottom: 1px solid #f1f5f9; }
        .exp-header-actions { display: flex; align-items: center; gap: 10px; }

        .exp-filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; gap: 16px; background: #fff; padding: 12px 16px; border-radius: 16px; border: 1px solid #f1f5f9; box-shadow: 0 2px 10px rgba(0,0,0,0.02); }
        .exp-filter-grp { display: flex; align-items: center; gap: 16px; }
        .exp-filter-actions { display: flex; align-items: center; gap: 12px; }
        .exp-dates { display: flex; align-items: center; gap: 8px; }
        .exp-dates > :global(.premium-dt-picker) { width: 230px; }
        .exp-to { color: #cbd5e1; font-weight: 300; flex-shrink: 0; font-size: 18px; }
        .exp-cat-select { width: 160px; }
        .exp-pay-select { width: 140px; }
        .exp-branch-select { width: 160px; }
        
        .exp-btn{padding:10px 18px;border-radius:12px;border:none;font:700 11px 'Inter', sans-serif;cursor:pointer;display:flex;align-items:center;gap:8px;transition:.3s;letter-spacing:0.3px}
        .exp-btn.primary{background:#f97316;color:#fff;box-shadow:0 4px 12px rgba(249,115,22,0.15)}
        .exp-btn.primary:hover{background:#ea580c;transform:translateY(-1px);box-shadow:0 6px 16px rgba(249,115,22,0.2)}
        .exp-btn.ghost{background:#fff;color:#64748b;border:1px solid #f1f5f9}
        .exp-btn.ghost:hover{background:#f8fafc;color:#1e293b;border-color:#cbd5e1}
 
        .exp-table-actions { display: flex; align-items: center; }
        
        .tbl-exp-btn { background: #fff; color: #1e293b; border: 1px solid #f97316; padding: 6px 12px; border-radius: 8px; font-size: 9px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s; text-transform: uppercase; letter-spacing: 0.3px; height: 32px; }
        .tbl-exp-btn:hover { background: #f97316; color: #fff; box-shadow: 0 2px 8px rgba(249,115,22,0.15); }
        .tbl-exp-btn svg { font-size: 11px; }

        /* Responsive Fixes */
        @media (max-width: 768px) {
          .exp-header { flex-direction: column; gap: 12px; align-items: stretch; padding: 12px 0; }
          .exp-header-actions { width: 100%; flex-direction: column; align-items: stretch; }
          .exp-btn { width: 100%; justify-content: center; }
          .tbl-exp-btn { width: 100%; justify-content: center; }
          
          .exp-filter-bar { flex-direction: column; align-items: stretch; padding: 12px; gap: 12px; }
          .exp-filter-grp { flex-direction: column; align-items: stretch; width: 100%; }
          .exp-dates { flex-direction: column; width: 100%; }
          .exp-dates > :global(.premium-dt-picker) { width: 100%; }
          .exp-to { display: none; }
          .exp-cat-select { width: 100%; }
          .exp-filter-actions { width: 100%; flex-direction: column; align-items: stretch; }
        }

        .exp-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 16px; width: 100%; }
        .exp-kpi { background: #fff; padding: 10px 14px; border-radius: 10px; border: 1px solid #f1f5f9; box-shadow: none; transition: 0.2s; }
        .exp-kpi:hover { background: #fcfdfe; border-color: #e2e8f0; }
        .kpi-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
        .kpi-label { font-size: 8px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; }
        .kpi-icon-circle { width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 10px; }
        .kpi-icon-circle.red { background: #fef2f2; color: #ef4444; }
        .kpi-icon-circle.blue { background: #eff6ff; color: #3b82f6; }
        .kpi-icon-circle.orange { background: #fff7ed; color: #f97316; }
        .kpi-value { font-size: 15px; font-weight: 800; color: #1e293b; display: block; margin-bottom: 1px; }
        .kpi-value.red-text { color: #ef4444; }
        .kpi-value.orange-text { color: #f97316; }
        .kpi-subtext { font-size: 9px; color: #cbd5e1; font-weight: 500; }

        .erp-table-wrapper { width: 100%; background: #fff; border-radius: 16px; border: 1px solid #f1f5f9; overflow: hidden; margin-top: 8px; }
        .erp-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .erp-table th { background: #fff; padding: 14px 16px; text-align: left; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #f97316; }
        .erp-table td { padding: 16px; border-bottom: 1px solid #f8fafc; vertical-align: middle; color: #475569; font-size: 13px; }
        .erp-table tr:hover td { background: #fcfdfe; }

        .text-right { text-align: right !important; }
        .row-docno { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; color: #64748b; background: #f1f5f9; padding: 4px 10px; border-radius: 6px; letter-spacing: -0.2px; white-space: nowrap; }
        .rd-d { font-size: 12px; font-weight: 600; color: #1e293b; display: block; }
        .rd-t { font-size: 10px; font-weight: 500; color: #94a3b8; display: block; margin-top: 2px; }
        .rc-text { font-size: 10px; font-weight: 600; color: #475569; background: #fcfdfe; padding: 4px 10px; border-radius: 20px; border: 1px solid #f1f5f9; text-transform: uppercase; }
        .row-note { font-size: 12px; color: #64748b; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .row-pay { font-size: 12px; font-weight: 600; color: #475569; }
        .row-amt { font-size: 15px; font-weight: 800; color: #ef4444; }

        /* Premium Mobile Card Design */
        .mob-list { display: flex; flex-direction: column; gap: 16px; width: 100%; }
        .mob-card { background: #fff; border-radius: 20px; padding: 20px; border: 1px solid #f1f5f9; box-shadow: 0 10px 30px rgba(0,0,0,0.03); position: relative; overflow: hidden; }
        .mob-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: #ef4444; opacity: 0.8; }
        
        .mc-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .mc-amt-badge { background: #fef2f2; padding: 6px 12px; border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.1); }
        .mc-amt-badge .row-amt { font-size: 16px; margin: 0; }
        
        .mc-mid { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
        .mc-meta-row { display: flex; align-items: center; gap: 8px; }
        .mc-note { font-size: 12px; color: #64748b; line-height: 1.5; background: #f8fafc; padding: 10px; border-radius: 12px; border: 1px solid #f1f5f9; }
        
        .mc-btm { display: flex; justify-content: space-between; align-items: center; pt: 12px; border-top: 1px solid #f1f5f9; padding-top: 14px; }
        .mc-pay-pill { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; background: #f1f5f9; padding: 4px 10px; border-radius: 20px; }
        .mc-acts { display: flex; gap: 10px; }

        .row-acts{display:flex;gap:6px;justify-content:flex-end}
        .ract-btn{width:34px;height:34px;border-radius:10px;border:1px solid #f1f5f9;background:#fff;color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.2s;font-size:14px}
        .ract-btn:hover{background:#f8fafc;color:#1e293b;border-color:#cbd5e1;transform:scale(1.05)}
        .ract-btn.danger:hover{color:#ef4444;border-color:#fecaca;background:#fef2f2}

        /* Responsive Visibility */
        @media (min-width: 769px) { .phn-only { display: none !important; } }
        @media (max-width: 768px) {
          .exp-page { padding: 0 4px; }
          .desk-only { display: none !important; }
          .exp-controls { flex-direction: column; align-items: stretch; gap: 12px; }
          .exp-dates { width: 100%; flex-direction: column; align-items: stretch; gap: 8px; }
          .exp-dates > :global(.premium-dt-picker) { width: 100% !important; }
          .exp-to { display: none; }
          .exp-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; }
          .exp-btn { width: 100%; justify-content: center; }
          .exp-kpis { grid-template-columns: 1fr; }
        }
        /* Modal Design System */
        .mdl-ov { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 20px; }
        .mdl-box { background: #fff; border-radius: 20px; width: 100%; box-shadow: 0 20px 50px rgba(0,0,0,0.1); animation: mdl-pop 0.3s ease-out; overflow: hidden; border-top: 4px solid #f97316; }
        @keyframes mdl-pop { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .mdl-hdr { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
        .mdl-hdr-t { font-size: 14px; font-weight: 800; color: #1e293b; margin: 0; }
        .mdl-hdr-x { border: none; background: none; color: #94a3b8; font-size: 16px; cursor: pointer; padding: 4px; }
        .mdl-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
        .mdl-field { display: flex; flex-direction: column; gap: 6px; }
        .mdl-lbl { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
        .mdl-lbl .req { color: #ef4444; }
        .lbl-row { display: flex; justify-content: space-between; align-items: center; }
        .lbl-act { border: none; background: none; color: #f97316; font-size: 10px; font-weight: 700; cursor: pointer; padding: 0; }
        .mdl-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .amt-input-w { position: relative; display: flex; align-items: center; }
        .amt-pre { position: absolute; left: 12px; font-weight: 700; color: #94a3b8; font-size: 13px; }
        .amt-input { width: 100%; padding: 10px 12px 10px 28px; border-radius: 10px; border: 1px solid #f1f5f9; background: #f8fafc; font-size: 14px; font-weight: 700; color: #1e293b; outline: none; transition: 0.2s; }
        .amt-input:focus { border-color: #f97316; background: #fff; box-shadow: 0 0 0 3px rgba(249,115,22,0.05); }
        .mdl-txt { padding: 10px 12px; border-radius: 10px; border: 1px solid #f1f5f9; background: #f8fafc; font-size: 13px; font-weight: 500; color: #475569; outline: none; transition: 0.2s; resize: none; width: 100%; font-family: inherit; }
        .mdl-txt:focus { border-color: #f97316; background: #fff; }
        .mdl-ftr { padding: 16px 20px; background: #fcfdfe; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 10px; }
        .mdl-btn { padding: 10px 20px; border-radius: 10px; border: none; font-size: 11px; font-weight: 700; cursor: pointer; transition: 0.2s; }
        .mdl-btn.primary { background: #f97316; color: #fff; box-shadow: 0 4px 12px rgba(249,115,22,0.15); }
        .mdl-btn.ghost { background: #fff; color: #64748b; border: 1px solid #f1f5f9; }

        .cat-add-box { display: flex; gap: 8px; margin-bottom: 16px; }
        .cat-add-in { flex: 1; padding: 10px 12px; border-radius: 10px; border: 1px solid #f1f5f9; background: #f8fafc; font-size: 12px; outline: none; }
        .cat-add-btn { background: #f97316; color: #fff; border: none; width: 34px; height: 34px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .cat-list { display: flex; flex-direction: column; gap: 8px; max-height: 300px; overflow-y: auto; }
        .cat-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #fcfdfe; border-radius: 10px; border: 1px solid #f8fafc; }
        .cat-n { font-size: 12px; font-weight: 600; color: #475569; }
        .cat-tog { border: none; background: none; color: #f97316; font-size: 10px; font-weight: 700; cursor: pointer; }

        .cat-filter-tabs { display: flex; gap: 8px; margin-bottom: 12px; padding: 4px; background: #f1f5f9; border-radius: 12px; }
        .cat-tab { flex: 1; border: none; background: none; padding: 8px; border-radius: 8px; font-size: 11px; font-weight: 700; color: #94a3b8; cursor: pointer; transition: 0.2s; }
        .cat-tab.on { background: #fff; color: #f97316; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }

        .print-report-header { display: none; margin-bottom: 24px; border-bottom: 2px solid #1e293b; padding-bottom: 12px; }
        .prnt-title { font-size: 24px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 1px; }
        .prnt-meta { display: flex; justify-content: space-between; font-size: 11px; color: #64748b; font-weight: 600; margin-top: 8px; }

        @media print {
          @page { margin: 1cm; size: auto; }
          :global(body), :global(html) { background: #fff !important; }
          .print-report-header { display: block !important; }
          .exp-controls, .exp-kpis, .exp-table-actions, .exp-btn, .ract-btn, .phn-only { display: none !important; }
          :global(.sidebar), :global(.topbar), :global(.top-bar), :global(.header), :global(nav), :global(.mobile-nav) { display: none !important; }
          .erp-table-wrapper { width: 100% !important; border: 1.5px solid #000 !important; margin: 0 !important; padding: 0 !important; visibility: visible !important; }
          .erp-table { width: 100% !important; }
          .erp-table th { background: #f1f5f9 !important; color: #000 !important; border-bottom: 2.5px solid #000 !important; padding: 12px !important; }
          .erp-table td { color: #000 !important; border-bottom: 1px solid #eee !important; padding: 10px !important; }
          :global(.main-content), :global(.dashboard-content), :global(.content) { padding: 0 !important; margin: 0 !important; width: 100% !important; position: absolute; left: 0; top: 0; }
        }
      `}</style>

    </DashboardLayout>
  );
}
