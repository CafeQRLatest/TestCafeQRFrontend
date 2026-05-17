import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import NiceSelect from '../../components/NiceSelect';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import api from '../../utils/api';
import { formatTzDate } from '../../utils/timezoneUtils';
import {
  FaSearch, FaWarehouse, FaTag, FaTrash, FaPlus, FaMinus,
  FaFolderOpen, FaBoxOpen, FaCheckCircle, FaExclamationCircle,
  FaSave, FaFileInvoiceDollar, FaArrowLeft, FaCalendarAlt,
  FaHashtag, FaTruck, FaTimesCircle, FaClipboardList,
  FaPercentage, FaChevronRight, FaSync, FaFileAlt,
  FaInfoCircle, FaShoppingCart, FaUserTie
} from 'react-icons/fa';

// ─── Status Configuration ───────────────────────────────────────────────────
const STATUS_CFG = {
  DRAFT:     { label: 'Draft',     color: '#64748b', bg: '#f1f5f9', dot: '#94a3b8', border: '#cbd5e1' },
  CONFIRMED: { label: 'Confirmed', color: '#b45309', bg: '#fffbeb', dot: '#f59e0b', border: '#fde68a' },
  COMPLETED: { label: 'Received',  color: '#059669', bg: '#ecfdf5', dot: '#10b981', border: '#6ee7b7' },
  CANCELLED: { label: 'Cancelled', color: '#dc2626', bg: '#fef2f2', dot: '#ef4444', border: '#fca5a5' },
};

// ─── Workflow Steps ─────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'Supplier',  icon: <FaUserTie /> },
  { id: 2, label: 'Products',  icon: <FaShoppingCart /> },
];

// ─── Blank PO factory ───────────────────────────────────────────────────────
const blankPO = () => ({
  orderNo:        '', // Managed by backend DocumentSequenceService
  orderType:      'PURCHASE',
  orderStatus:    'DRAFT',
  paymentStatus:  'PENDING',
  paymentMethod:  'CASH',
  vendorId:       '',
  warehouseId:    '',
  orderDate:      new Date().toISOString().slice(0, 16),
  expectedDate:   new Date().toISOString().slice(0, 16),
  reference:      '',
  description:    '',
  lines:          [],
  totalAmount:    0,
  totalTaxAmount: 0,
  grandTotal:     0,
});

// ────────────────────────────────────────────────────────────────────────────
export default function PurchaseOrdersPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']}>
      <PurchaseContent />
    </RoleGate>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function PurchaseContent() {
  const { timezone } = useAuth();
  /* ── master data ── */
  const [vendors,    setVendors]    = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products,   setProducts]   = useState([]);

  /* ── ui state ── */
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [view,           setView]           = useState('form');   // 'form' | 'history'
  const [step,           setStep]           = useState(1);        // 1-3 on mobile
  const [errors,         setErrors]         = useState({});
  const [message,        setMessage]        = useState(null);
  const [msgType,        setMsgType]        = useState('success');
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [drafts,         setDrafts]         = useState([]);
  const [history,        setHistory]        = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  /* ── product search ── */
  const [productSearch,   setProductSearch]   = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef  = useRef(null);
  const searchInp  = useRef(null);
  const linesEndRef = useRef(null);

  /* ── filters ── */
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
  });
  const [toDate, setToDate] = useState(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.toISOString().slice(0, 16);
  });
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterVendor, setFilterVendor] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterPayMethod, setFilterPayMethod] = useState('');

  /* ── current PO ── */
  const [po, setPo] = useState(blankPO());

  /* ── load master data ── */
  useEffect(() => {
    const load = async () => {
      try {
        const [vR, wR, pR] = await Promise.all([
          api.get('/api/v1/purchasing/vendors'),
          api.get('/api/v1/warehouses'),
          api.get('/api/v1/products'),
        ]);
        setVendors(   vR.data.success ? vR.data.data || [] : []);
        setWarehouses(wR.data.success ? wR.data.data || [] : []);
        setProducts(  pR.data.success
          ? (pR.data.data || []).filter(p => p.isactive !== 'N' && p.isActive !== false)
          : []);
      } catch {
        toast('Failed to load data — please refresh', 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
    fetchDrafts();

    const onOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target))
        setShowSuggestions(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  useEffect(() => {
    if (view === 'history') fetchHistory();
  }, [view, fromDate, toDate, filterStatus, filterVendor, filterWarehouse, filterPayMethod]);

  /* ── helpers ── */
  const toast = (msg, type = 'success') => {
    setMessage(msg); setMsgType(type);
    setTimeout(() => setMessage(null), 3500);
  };

  const calcTotals = (lines) => {
    const totalAmount    = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0), 0);
    const totalTaxAmount = lines.reduce((s, l) => s + (parseFloat(l.taxAmount) || 0), 0);
    const grandTotal     = lines.reduce((s, l) => s + (parseFloat(l.lineTotal) || 0), 0);
    return {
      totalAmount:    +totalAmount.toFixed(2),
      totalTaxAmount: +totalTaxAmount.toFixed(2),
      grandTotal:     +grandTotal.toFixed(2),
    };
  };

  const recalcLine = (line) => {
    const qty   = parseFloat(line.quantity)       || 0;
    const price = parseFloat(line.unitPrice)      || 0;
    const tax   = parseFloat(line.taxRate)        || 0;
    const disc  = parseFloat(line.discountAmount) || 0;
    const sub   = qty * price - disc;
    return {
      ...line,
      taxAmount: +(sub * tax / 100).toFixed(2),
      lineTotal: +(sub + sub * tax / 100).toFixed(2),
    };
  };

  /* ── draft fetching ── */
  const fetchDrafts = async () => {
    try {
      const r = await api.get('/api/v1/orders/type/PURCHASE');
      if (r.data.success) setDrafts((r.data.data || []).filter(o => o.orderStatus === 'DRAFT'));
    } catch { /* silent */ }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const params = {
        type: 'PURCHASE',
        status: filterStatus === 'ALL' ? null : filterStatus,
        vendorId: filterVendor || null,
        warehouseId: filterWarehouse || null,
        paymentMethod: filterPayMethod || null,
        fromDate: fromDate ? new Date(fromDate).toISOString() : null,
        toDate: toDate ? new Date(toDate).toISOString() : null
      };
      const r = await api.get('/api/v1/orders/search', { params });
      if (r.data.success) setHistory(r.data.data || []);
    } catch { toast('Failed to load history', 'error'); }
    finally { setHistoryLoading(false); }
  };

  /* ── product actions ── */
  const addProduct = (product) => {
    if (po.lines.find(l => String(l.productId) === String(product.id))) {
      toast(`${product.name} is already in the list`, 'error');
      return;
    }
    const line = recalcLine({
      productId:      product.id,
      productName:    product.name,
      productCode:    product.productCode || '',
      categoryName:   product.categoryName || '',
      unitOfMeasure:  product.uomName || 'units',
      quantity:       1,
      unitPrice:      product.price || 0,
      taxRate:        product.taxRate   || 0,
      discountAmount: 0,
      taxAmount:      0,
      lineTotal:      product.price || 0,
    });
    const lines = [line, ...po.lines];
    setPo(p => ({ ...p, lines, ...calcTotals(lines) }));
    setProductSearch('');
    setShowSuggestions(false);
    // scroll to top of list
    setTimeout(() => linesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  };

  const updateLine = (idx, field, val) => {
    const lines = po.lines.map((l, i) => i === idx ? recalcLine({ ...l, [field]: val }) : l);
    setPo(p => ({ ...p, lines, ...calcTotals(lines) }));
  };

  const removeLine = (idx) => {
    const lines = po.lines.filter((_, i) => i !== idx);
    setPo(p => ({ ...p, lines, ...calcTotals(lines) }));
  };

  /* ── validation ── */
  const validate = () => {
    const e = {};
    if (!po.vendorId)   e.vendorId   = 'Please select a vendor';
    if (!po.warehouseId) e.warehouseId = 'Please select a warehouse';
    if (!po.lines.length) e.lines    = 'Add at least one product';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /* ── save ── */
  const handleSave = async (targetStatus) => {
    if (targetStatus !== 'DRAFT' && !validate()) {
      toast('Please fix the errors before continuing', 'error');
      return;
    }
    if (targetStatus === 'DRAFT') {
      if (!po.vendorId && !po.warehouseId && !po.lines.length) {
        toast('Nothing to save yet', 'error'); return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        ...po,
        orderStatus: targetStatus,
        paymentStatus: po.paymentStatus,
        orderDate: new Date(po.orderDate).toISOString(),
        lines: po.lines.map(({ productId, variantId, productName, quantity, unitPrice, unitOfMeasure, taxRate, taxAmount, discountAmount, lineTotal }) =>
          ({ productId, variantId, productName, quantity, unitPrice, unitOfMeasure, taxRate, taxAmount, discountAmount, lineTotal })
        ),
      };
      const resp = po.id
        ? await api.put(`/api/v1/orders/${po.id}`, payload)
        : await api.post('/api/v1/orders', payload);

      if (resp.data.success) {
        const saved = resp.data.data;
        const msg =
          targetStatus === 'COMPLETED' ? '✅ Order received — stock updated!' :
          targetStatus === 'CANCELLED' ? 'Order has been cancelled' :
          targetStatus === 'CONFIRMED' ? '📦 Order confirmed!' :
          '💾 Draft saved successfully!';
        toast(msg, 'success');

        if (targetStatus === 'DRAFT') {
          setPo(p => ({ ...p, id: saved.id, orderStatus: 'DRAFT' }));
        } else {
          setPo(blankPO());
          setStep(1);
        }
        fetchDrafts();
        setErrors({});
      }
    } catch (e) {
      toast(e.response?.data?.message || 'Could not save. Please try again.', 'error');
    } finally {
      setSaving(false);
      setShowCancelConfirm(false);
    }
  };

  /* ── load draft ── */
  const loadDraft = (d) => {
    setPo({
      id:            d.id,
      orderNo:       d.orderNo,
      orderType:     'PURCHASE',
      orderStatus:   d.orderStatus,
      paymentStatus: d.paymentStatus || 'PENDING',
      paymentMethod: d.paymentMethod || 'CASH',
      vendorId:      d.vendorId   ? String(d.vendorId)   : '',
      warehouseId:   d.warehouseId ? String(d.warehouseId) : '',
      orderDate:     d.orderDate   ? String(d.orderDate).slice(0, 10)   : new Date().toISOString().slice(0, 10),
      expectedDate:  d.expectedDate ? String(d.expectedDate).slice(0, 10) : '',
      reference:     d.reference   || '',
      description:   d.description || '',
      lines: (d.lines || []).map(l => {
        const prod = products.find(p => String(p.id) === String(l.productId));
        return recalcLine({
          productId:      l.productId,
          productName:    prod?.name      || l.productName   || 'Unknown',
          productCode:    prod?.productCode || l.productCode  || '',
          categoryName:   prod?.categoryName || l.categoryName || '',
          unitOfMeasure:  l.unitOfMeasure || 'units',
          quantity:       parseFloat(l.quantity)  || 1,
          unitPrice:      parseFloat(l.unitPrice)  || 0,
          taxRate:        parseFloat(l.taxRate)    || 0,
          discountAmount: parseFloat(l.discountAmount) || 0,
          taxAmount:      parseFloat(l.taxAmount)  || 0,
          lineTotal:      parseFloat(l.lineTotal)  || 0,
        });
      }),
      totalAmount:    parseFloat(d.totalAmount)    || 0,
      totalTaxAmount: parseFloat(d.totalTaxAmount) || 0,
      grandTotal:     parseFloat(d.grandTotal)     || 0,
    });
    setShowDraftModal(false);
    setErrors({});
    toast(`Loaded draft ${d.orderNo}`, 'success');
  };

  /* ── derived ── */
  const vendorOptions    = vendors.map(v => ({ value: String(v.id), label: v.name }));
  const warehouseOptions = warehouses.map(w => ({ value: String(w.id), label: w.name }));
  const selectedVendor   = vendors.find(v => String(v.id) === String(po.vendorId));
  const selectedWarehouse = warehouses.find(w => String(w.id) === String(po.warehouseId));
  const isLocked         = po.orderStatus === 'COMPLETED' || po.orderStatus === 'CANCELLED';
  const statusCfg        = STATUS_CFG[po.orderStatus] || STATUS_CFG.DRAFT;

  const filteredProducts = productSearch.trim() === ''
    ? products.slice(0, 12)
    : products.filter(p =>
        (p.name || '').toLowerCase().includes(productSearch.toLowerCase()) ||
        (p.productCode || '').toLowerCase().includes(productSearch.toLowerCase())
      ).slice(0, 20);

  /* ── step completion check ── */
  const stepOk = {
    1: !!(po.vendorId && po.warehouseId),
    2: po.lines.length > 0,
    3: true,
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <DashboardLayout title="Purchase Orders" showBack>
        <div className="po-skeleton-wrapper">
          <div className="sk-header" />
          <div className="sk-body">
            <div className="sk-left">
              <div className="sk-card" /><div className="sk-card" /><div className="sk-card tall" />
            </div>
            <div className="sk-sidebar"><div className="sk-card" /></div>
          </div>
          <style jsx>{SKELETON_CSS}</style>
        </div>
      </DashboardLayout>
    );
  }

  // ── HISTORY VIEW ──────────────────────────────────────────────────────────
  if (view === 'history') {
    return (
      <DashboardLayout title="Purchase Orders" showBack>
        <div className="po-wrap">
          {/* toolbar */}
          <div className="hist-toolbar">
            <div className="hist-toolbar-left">
              <button className="btn-back" onClick={() => setView('form')}>
                <FaArrowLeft /> Back to New PO
              </button>
              
              <div className="hist-filters">
                <div className="h-filter-group" style={{width: 220}}>
                  <PremiumDateTimePicker value={fromDate} onChange={setFromDate} />
                </div>
                <span className="h-filter-sep">to</span>
                <div className="h-filter-group" style={{width: 220}}>
                  <PremiumDateTimePicker value={toDate} onChange={setToDate} />
                </div>

                <div className="h-filter-group" style={{width: 140}}>
                  <NiceSelect 
                    value={filterStatus} 
                    onChange={setFilterStatus} 
                    options={[
                      { value: 'ALL', label: 'All Status' },
                      { value: 'DRAFT', label: 'Drafts' },
                      { value: 'CONFIRMED', label: 'Confirmed' },
                      { value: 'COMPLETED', label: 'Received' },
                      { value: 'CANCELLED', label: 'Cancelled' }
                    ]}
                  />
                </div>

                <div className="h-filter-group" style={{width: 160}}>
                  <NiceSelect 
                    value={filterVendor} 
                    onChange={setFilterVendor} 
                    options={[{ value: '', label: 'All Vendors' }, ...vendorOptions]}
                  />
                </div>

                <div className="h-filter-group" style={{width: 160}}>
                  <NiceSelect 
                    value={filterWarehouse} 
                    onChange={setFilterWarehouse} 
                    options={[{ value: '', label: 'All Warehouses' }, ...warehouseOptions]}
                  />
                </div>

                <div className="h-filter-group" style={{width: 140}}>
                  <NiceSelect 
                    value={filterPayMethod} 
                    onChange={setFilterPayMethod} 
                    options={[
                      { value: '', label: 'All Payments' },
                      { value: 'CASH', label: 'Cash' },
                      { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
                      { value: 'UPI', label: 'UPI / Digital' },
                      { value: 'CARD', label: 'Card' },
                      { value: 'CHEQUE', label: 'Cheque' }
                    ]}
                  />
                </div>


              </div>
            </div>

          </div>

          {historyLoading
            ? <div className="po-spinner-box"><div className="po-spinner" /><span>Loading orders...</span></div>
            : history.length === 0
              ? (
                <div className="po-empty-state">
                  <FaFileInvoiceDollar className="empty-ico" />
                  <h3>No Purchase Orders yet</h3>
                  <p>Create your first PO to start tracking supplier orders</p>
                  <button className="btn-primary" onClick={() => setView('form')}>
                    <FaPlus /> Create Purchase Order
                  </button>
                </div>
              )
              : (
                <>
                  {/* Desktop table */}
                  <div className="hist-table-wrap">
                    <table className="hist-table">
                      <thead>
                        <tr>
                          <th>PO#</th><th>Date</th><th>Vendor</th>
                          <th>Warehouse</th><th>Items</th><th>Total</th>
                          <th>Status</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map(o => {
                          const cfg = STATUS_CFG[o.orderStatus] || STATUS_CFG.DRAFT;
                          const v   = vendors.find(x => String(x.id) === String(o.vendorId));
                          const w   = warehouses.find(x => String(x.id) === String(o.warehouseId));
                          return (
                            <tr key={o.id} className="hist-row">
                              <td><code className="po-code">{o.orderNo}</code></td>
                              <td className="muted">{formatTzDate(o.orderDate, timezone, { format: 'date' })}</td>
                              <td><strong>{v?.name || '—'}</strong></td>
                              <td className="muted">{w?.name || '—'}</td>
                              <td><span className="pill">{(o.lines || []).length}</span></td>
                              <td><strong>₹{parseFloat(o.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
                              <td>
                                <span className="status-badge" style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}>
                                  <i style={{ background: cfg.dot }} />{cfg.label}
                                </span>
                              </td>
                              <td>
                                {o.orderStatus === 'DRAFT' && (
                                  <button className="btn-edit" onClick={() => { loadDraft(o); setView('form'); }}>
                                    Edit <FaChevronRight />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile card list */}
                  <div className="hist-mobile-list">
                    {history.map(o => {
                      const cfg = STATUS_CFG[o.orderStatus] || STATUS_CFG.DRAFT;
                      const v   = vendors.find(x => String(x.id) === String(o.vendorId));
                      return (
                        <div key={o.id} className="hist-card">
                          <div className="hc-top">
                            <code className="po-code">{o.orderNo}</code>
                            <span className="status-badge" style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}>
                              <i style={{ background: cfg.dot }} />{cfg.label}
                            </span>
                          </div>
                          <div className="hc-vendor">{v?.name || 'Unknown Vendor'}</div>
                          <div className="hc-meta">
                            <span>{formatTzDate(o.orderDate, timezone, { format: 'date', year: undefined })}</span>
                            <span>{(o.lines || []).length} items</span>
                          </div>
                          <div className="hc-bottom">
                            <strong className="hc-total">₹{parseFloat(o.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                            {o.orderStatus === 'DRAFT' && (
                              <button className="btn-edit sm" onClick={() => { loadDraft(o); setView('form'); }}>
                                Edit <FaChevronRight />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )
          }
        </div>
        <style jsx>{MAIN_CSS}</style>
        <style jsx>{SKELETON_CSS}</style>
        {message && <Toast msg={message} type={msgType} onClose={() => setMessage(null)} />}
      </DashboardLayout>
    );
  }

  // ── FORM VIEW ─────────────────────────────────────────────────────────────
  return (
    <DashboardLayout title="Purchase Orders" showBack>
      <div className="po-wrap">

        {/* ── Top bar ──────────────────────────────────── */}
        {/* ── Action toolbar consolidated into card header ── */}

        {/* ── Stepper (mobile / tablet only) ─────────── */}
        <div className="po-stepper">
          {STEPS.map((s, i) => {
            const done    = stepOk[s.id];
            const current = step === s.id;
            return (
              <React.Fragment key={s.id}>
                <button
                  className={`step-btn ${current ? 'active' : ''} ${done ? 'done' : ''}`}
                  onClick={() => setStep(s.id)}
                >
                  <span className="step-circle">{done && !current ? <FaCheckCircle /> : s.icon}</span>
                  <span className="step-label">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && <div className={`step-line ${stepOk[s.id] ? 'done' : ''}`} />}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Main form grid ────────────────────────── */}
        <div className="po-grid">

          {/* ── LEFT: content ──────────────────────── */}
          <div className="po-main">

            {/* STEP 1: Supplier & Details  */}
            <div className={`po-card ${step !== 1 ? 'mobile-hidden' : ''}`} id="step-supplier">
              <div className="card-header">
                <div className="ch-main">
                  <div className="card-title">Supplier & Delivery</div>
                  <div className="card-sub">Select where you&apos;re buying from and delivering to</div>
                </div>
                <div className="card-actions">
                  <button className="btn-header-ghost" onClick={() => { fetchHistory(); setView('history'); }}>
                    <FaClipboardList /> PO History
                  </button>
                  {drafts.length > 0 && (
                    <button className="btn-header-amber" onClick={() => setShowDraftModal(true)}>
                      <FaFolderOpen /> Drafts ({drafts.length})
                    </button>
                  )}
                </div>
              </div>

              <div className="field-grid">
                {/* Vendor */}
                <div className={`field-group ${errors.vendorId ? 'has-error' : ''}`}>
                  <label className="field-label"><FaUserTie className="lbl-icon" /> Vendor / Supplier <span className="req">*</span></label>
                  <NiceSelect
                    placeholder="Choose a supplier..."
                    options={vendorOptions}
                    value={po.vendorId ? String(po.vendorId) : ''}
                    onChange={(v) => { setPo(p => ({ ...p, vendorId: v })); setErrors(e => ({ ...e, vendorId: '' })); }}
                    disabled={isLocked}
                  />
                  {errors.vendorId && <span className="field-error"><FaExclamationCircle /> {errors.vendorId}</span>}
                  {vendors.length === 0 && <span className="field-hint"><FaInfoCircle /> No vendors found — add vendors from Partners &gt; Vendors</span>}
                </div>

                {/* Warehouse */}
                <div className={`field-group ${errors.warehouseId ? 'has-error' : ''}`}>
                  <label className="field-label"><FaWarehouse className="lbl-icon" /> Receiving Warehouse <span className="req">*</span></label>
                  <NiceSelect
                    placeholder="Choose delivery location..."
                    options={warehouseOptions}
                    value={po.warehouseId ? String(po.warehouseId) : ''}
                    onChange={(v) => { setPo(p => ({ ...p, warehouseId: v })); setErrors(e => ({ ...e, warehouseId: '' })); }}
                    disabled={isLocked}
                  />
                  {errors.warehouseId && <span className="field-error"><FaExclamationCircle /> {errors.warehouseId}</span>}
                </div>

                {/* Order Date */}
                <div className="field-group">
                  <label className="field-label"><FaCalendarAlt className="lbl-icon" /> Order Date</label>
                  <PremiumDateTimePicker 
                    value={po.orderDate} 
                    onChange={(v) => setPo(p => ({ ...p, orderDate: v }))}
                    disabled={isLocked}
                  />
                </div>

                {/* Expected delivery */}
                <div className="field-group">
                  <label className="field-label"><FaCalendarAlt className="lbl-icon" /> Expected Delivery</label>
                  <PremiumDateTimePicker 
                    value={po.expectedDate} 
                    onChange={(v) => setPo(p => ({ ...p, expectedDate: v }))}
                    disabled={isLocked}
                  />
                </div>

                {/* Reference */}
                <div className={`field-group span-2 ${errors.reference ? 'has-error' : ''}`}>
                  <label className="field-label"><FaHashtag className="lbl-icon" /> Supplier Invoice / Reference</label>
                  <input type="text" className="field-input" placeholder="e.g. INV-2024-0042"
                    value={po.reference} onChange={(e) => setPo(p => ({ ...p, reference: e.target.value }))} disabled={isLocked} />
                  <span className="field-hint">Used for reconciliation with supplier bills</span>
                </div>


              </div>

              {/* Mobile: Next */}
              <div className="step-nav mobile-only">
                <button className="btn-primary full"
                  onClick={() => { if (!po.vendorId || !po.warehouseId) { setErrors({ vendorId: !po.vendorId ? 'Required' : '', warehouseId: !po.warehouseId ? 'Required' : '' }); return; } setStep(2); }}>
                  Next: Add Products <FaChevronRight />
                </button>
              </div>
            </div>

            {/* STEP 2: Products */}
            <div className={`po-card no-inner-pad ${step !== 2 ? 'mobile-hidden' : ''}`} id="step-products">
              <div className="card-header padded">
                <div className="ch-main">
                  <FaShoppingCart className="card-icon" />
                  <div>
                    <div className="card-title">Order Items</div>
                    <div className="card-sub">Search and add products to this purchase order</div>
                  </div>
                </div>
                <div className="card-actions">
                  {po.lines.length > 0 && !isLocked && (
                    <button className="btn-header-danger" onClick={() => { if(confirm('Clear all items?')) setPo(p=>({...p, lines:[]})); }}>
                      <FaTrash /> Clear All
                    </button>
                  )}
                  {po.lines.length > 0 && (
                    <span className="items-badge">{po.lines.length} item{po.lines.length > 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>

              {/* Search bar */}
              {!isLocked && (
                <div className="product-search-wrap padded" ref={searchRef}>
                  <div className={`product-search-bar ${showSuggestions ? 'open' : ''}`}>
                    <FaSearch className="ps-icon" />
                    <input
                      ref={searchInp}
                      type="text"
                      placeholder="Search by product name or SKU..."
                      value={productSearch}
                      autoComplete="off"
                      onChange={(e) => { setProductSearch(e.target.value); setShowSuggestions(true); }}
                      onFocus={() => setShowSuggestions(true)}
                    />
                    {productSearch
                      ? <button className="ps-clear" onClick={() => { setProductSearch(''); searchInp.current?.focus(); }}>×</button>
                      : <span className="ps-hint">Tap to search</span>
                    }
                  </div>

                  {showSuggestions && (
                    <div className="ps-dropdown">
                      {products.length === 0 ? (
                        <div className="ps-empty">No products configured. Add products in Product Management.</div>
                      ) : filteredProducts.length === 0 ? (
                        <div className="ps-empty">No match for &quot;<strong>{productSearch}</strong>&quot;</div>
                      ) : (
                        <>
                          {!productSearch && <div className="ps-section-label">Recent Products</div>}
                          {filteredProducts.map(p => (
                            <button key={p.id} className="ps-item" onClick={() => addProduct(p)}>
                              <div className="ps-item-left">
                                <div className="ps-item-avatar">{p.name?.charAt(0)?.toUpperCase()}</div>
                                <div>
                                  <div className="ps-item-name">{p.name}</div>
                                  <div className="ps-item-meta">
                                    {p.categoryName && <span>{p.categoryName}</span>}
                                    {p.productCode && <span>#{p.productCode}</span>}
                                  </div>
                                </div>
                              </div>
                              <div className="ps-item-right">
                                {p.price > 0 && <div className="ps-item-price">₹{parseFloat(p.price).toFixed(2)}</div>}
                                <div className="ps-item-unit">{p.uomName || 'units'}</div>
                              </div>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Line items */}
              <div ref={linesEndRef} />
              {errors.lines && (
                <div className="inline-error padded"><FaExclamationCircle /> {errors.lines}</div>
              )}

              {po.lines.length === 0 ? (
                <div className="lines-empty-premium">
                  <div className="empty-graphic">
                    <div className="blob" />
                    <FaBoxOpen className="lines-empty-icon" />
                  </div>
                  <h3>Your order is empty</h3>
                  <p>Start typing in the search bar above to build your procurement list.</p>
                  <div className="empty-hint">
                    <FaInfoCircle /> Professional tip: SKU search is faster for high-volume orders.
                  </div>
                </div>
              ) : (
                <>
                  {/* ── Desktop table ── */}
                  <table className="lines-table">
                    <thead>
                      <tr>
                        <th className="tc-num">#</th>
                        <th>Product</th>
                        <th className="tc-qty">Quantity</th>
                        <th className="tc-price">Unit Price</th>
                        <th className="tc-tax">Tax %</th>
                        <th className="tc-total">Line Total</th>
                        {!isLocked && <th className="tc-del"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {po.lines.map((line, idx) => (
                        <tr key={idx} className="line-row">
                          <td className="tc-num"><span className="line-num">{idx + 1}</span></td>
                          <td>
                            <div className="line-name">{line.productName}</div>
                            <div className="line-meta">
                              {line.productCode && <span>#{line.productCode}</span>}
                              {line.categoryName && <span className="orange">{line.categoryName}</span>}
                              <span className="muted">{line.unitOfMeasure}</span>
                            </div>
                          </td>
                          <td className="tc-qty">
                            <div className="qty-ctrl">
                              <button className="qty-btn" onClick={() => updateLine(idx, 'quantity', Math.max(0.001, (parseFloat(line.quantity) || 0) - 1))} disabled={isLocked}><FaMinus /></button>
                              <input type="number" className="qty-inp" min="0.001" step="0.001"
                                value={line.quantity}
                                onChange={(e) => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                disabled={isLocked} />
                              <button className="qty-btn" onClick={() => updateLine(idx, 'quantity', (parseFloat(line.quantity) || 0) + 1)} disabled={isLocked}><FaPlus /></button>
                            </div>
                          </td>
                          <td className="tc-price">
                            <div className="price-wrap">
                              <span className="currency-prefix">₹</span>
                              <input type="number" className="price-inp" min="0" step="0.01"
                                value={line.unitPrice}
                                onChange={(e) => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                                disabled={isLocked} />
                            </div>
                          </td>
                          <td className="tc-tax">
                            <div className="price-wrap">
                              <input type="number" className="tax-inp" min="0" max="100" step="0.01"
                                value={line.taxRate}
                                onChange={(e) => updateLine(idx, 'taxRate', parseFloat(e.target.value) || 0)}
                                disabled={isLocked} />
                              <span className="currency-suffix">%</span>
                            </div>
                          </td>
                          <td className="tc-total">
                            <div className="total-amount">₹{parseFloat(line.lineTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                            {parseFloat(line.taxAmount) > 0 && (
                              <div className="total-tax">incl. ₹{parseFloat(line.taxAmount).toFixed(2)} tax</div>
                            )}
                          </td>
                          {!isLocked && (
                            <td className="tc-del">
                              <button className="del-btn" onClick={() => removeLine(idx)} title="Remove item"><FaTrash /></button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* ── Mobile cards ── */}
                  <div className="mobile-lines">
                    {po.lines.map((line, idx) => (
                      <div key={idx} className="mobile-line-card">
                        <div className="mlc-head">
                          <div>
                            <div className="mlc-name">{line.productName}</div>
                            <div className="mlc-meta">
                              {line.productCode && <span>#{line.productCode}</span>}
                              {line.categoryName && <span className="orange">{line.categoryName}</span>}
                            </div>
                          </div>
                          <div className="mlc-head-right">
                            <div className="mlc-total">₹{parseFloat(line.lineTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                            {!isLocked && <button className="del-btn sm" onClick={() => removeLine(idx)}><FaTrash /></button>}
                          </div>
                        </div>
                        <div className="mlc-controls">
                          <div className="mlc-field">
                            <label>Quantity</label>
                            <div className="qty-ctrl sm">
                              <button className="qty-btn" onClick={() => updateLine(idx, 'quantity', Math.max(0.001, (parseFloat(line.quantity)||0) - 1))} disabled={isLocked}><FaMinus /></button>
                              <input type="number" className="qty-inp" value={line.quantity}
                                onChange={(e) => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)} disabled={isLocked} />
                              <button className="qty-btn" onClick={() => updateLine(idx, 'quantity', (parseFloat(line.quantity)||0) + 1)} disabled={isLocked}><FaPlus /></button>
                            </div>
                          </div>
                          <div className="mlc-field">
                            <label>Unit Price</label>
                            <div className="price-wrap">
                              <span className="currency-prefix">₹</span>
                              <input type="number" className="price-inp" value={line.unitPrice}
                                onChange={(e) => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)} disabled={isLocked} />
                            </div>
                          </div>
                          <div className="mlc-field">
                            <label>Tax %</label>
                            <div className="price-wrap">
                              <input type="number" className="tax-inp" value={line.taxRate}
                                onChange={(e) => updateLine(idx, 'taxRate', parseFloat(e.target.value) || 0)} disabled={isLocked} />
                              <span className="currency-suffix">%</span>
                            </div>
                          </div>
                        </div>
                        {parseFloat(line.taxAmount) > 0 && (
                          <div className="mlc-tax-note">Includes ₹{parseFloat(line.taxAmount).toFixed(2)} tax</div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Mobile: nav */}
              <div className="step-nav mobile-only padded">
                <button className="btn-ghost" onClick={() => setStep(1)}><FaArrowLeft /> Back</button>
                <div className="flex-1" />
                {/* Step 3 removed, so no "Review Order" next button needed here */}
              </div>
            </div>

            {/* STEP 3 was removed as per user request */}
          </div>

          {/* ── RIGHT: Summary sidebar ─────────────── */}
          <div className="po-sidebar">
            <div className="po-card summary-card">
              <div className="summary-title">Order Summary</div>

              {/* Doc info strip */}
              <div className="summary-info-block">
                <InfoRow label="Document" value={po.orderNo ? <code className="po-code">{po.orderNo}</code> : <span className="pill">NEW-PO</span>} />
                <InfoRow label="Vendor"   value={selectedVendor?.name     || <em className="not-set">Not selected</em>} />
                <InfoRow label="To"       value={selectedWarehouse?.name  || <em className="not-set">Not selected</em>} />
                <InfoRow label="Date"     value={formatTzDate(po.orderDate, timezone, { format: 'date' })} />
                {po.reference && <InfoRow label="Ref" value={po.reference} />}
                
                {!isLocked && (
                  <>
                    <div className="summary-payment-row">
                      <span className="info-label">Payment Status</span>
                      <NiceSelect
                        placeholder="Status"
                        options={[
                          { value: 'PENDING', label: 'Pending / Credit' },
                          { value: 'PAID', label: 'Paid' }
                        ]}
                        value={po.paymentStatus}
                        onChange={(v) => setPo(p => ({ ...p, paymentStatus: v }))}
                      />
                    </div>
                    
                    <div className="summary-payment-row no-border">
                      <span className="info-label">Payment Mode</span>
                      <NiceSelect
                        placeholder="Select Mode"
                        options={[
                          { value: 'CASH', label: 'Cash' },
                          { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
                          { value: 'UPI', label: 'UPI / Digital' },
                          { value: 'CARD', label: 'Card' },
                          { value: 'CHEQUE', label: 'Cheque' }
                        ]}
                        value={po.paymentMethod}
                        onChange={(v) => setPo(p => ({ ...p, paymentMethod: v }))}
                      />
                    </div>
                  </>
                )}
                {isLocked && <InfoRow label="Paid Via" value={po.paymentMethod} />}
              </div>

              {/* Notes & Remarks (Relocated to Summary) */}
              <div className="summary-notes-group">
                <label className="notes-label"><FaFileAlt /> Notes & Remarks</label>
                <textarea 
                  className="summary-notes-area" 
                  disabled={isLocked}
                  placeholder="Instructions, remarks..."
                  value={po.description}
                  onChange={(e) => setPo(p => ({ ...p, description: e.target.value }))}
                />
              </div>

              {/* Financials */}
              <div className="financials-box">
                <div className="fin-row"><span>Items</span><span>{po.lines.length}</span></div>
                <div className="fin-row"><span>Subtotal</span><span>₹{parseFloat(po.totalAmount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</span></div>
                {parseFloat(po.totalTaxAmount) > 0 && (
                  <div className="fin-row tax"><span>Tax</span><span>+₹{parseFloat(po.totalTaxAmount).toLocaleString('en-IN',{minimumFractionDigits:2})}</span></div>
                )}
                <div className="fin-divider" />
                <div className="fin-row grand"><span>Grand Total</span><span>₹{parseFloat(po.grandTotal||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</span></div>
              </div>



              {/* Actions */}
              {!isLocked ? (
                <div className="action-col">
                  <button className="btn-primary full" disabled={saving} onClick={() =>
                    handleSave(po.orderStatus === 'CONFIRMED' ? 'COMPLETED' : 'CONFIRMED')}>
                    {saving
                      ? <><span className="btn-spin" /> Saving...</>
                      : po.orderStatus === 'CONFIRMED'
                        ? <><FaCheckCircle /> Mark as Received</>
                        : <><FaTruck /> Confirm & Send Order</>}
                  </button>
                  <button className="btn-outline full" disabled={saving || (!po.vendorId && !po.warehouseId && !po.lines.length)}
                    onClick={() => handleSave('DRAFT')}>
                    <FaSave /> Save as Draft
                  </button>
                  {po.id && (
                    <button className="btn-danger full" onClick={() => setShowCancelConfirm(true)}>
                      <FaTimesCircle /> Cancel Order
                    </button>
                  )}
                </div>
              ) : (
                <div className="locked-notice" style={{ borderColor: statusCfg.border, background: statusCfg.bg }}>
                  <span style={{ color: statusCfg.color }}>
                    {po.orderStatus === 'COMPLETED' ? <FaCheckCircle /> : <FaTimesCircle />}
                  </span>
                  <span style={{ color: statusCfg.color }}>
                    {po.orderStatus === 'COMPLETED' ? 'Received. Stock updated.' : 'Order cancelled.'}
                  </span>
                </div>
              )}
              {(isLocked || true) && (
                <button className="btn-new-po" onClick={() => { setPo(blankPO()); setErrors({}); setStep(1); }}>
                  <FaPlus /> {isLocked ? 'Create New PO' : 'Start Fresh'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Mobile sticky bar ─────────────────────────── */}
        {po.lines.length > 0 && !isLocked && (
          <div className="mobile-bar">
            <div className="mb-left">
              <div className="mb-total">₹{parseFloat(po.grandTotal||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</div>
              <div className="mb-count">{po.lines.length} item{po.lines.length>1?'s':''} added</div>
            </div>
            <div className="mb-right">
              <button className="mb-save" onClick={() => handleSave('DRAFT')} disabled={saving} title="Save Draft"><FaSave /></button>
              <button className="mb-confirm" onClick={() => handleSave(po.orderStatus === 'CONFIRMED' ? 'COMPLETED' : 'CONFIRMED')} disabled={saving}>
                {saving ? '...' : po.orderStatus === 'CONFIRMED' ? 'Receive' : 'Confirm'}
              </button>
            </div>
          </div>
        )}

        {/* ── Draft modal ───────────────────────────────── */}
        {showDraftModal && (
          <div className="modal-overlay" onClick={() => setShowDraftModal(false)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-head">
                <span><FaFolderOpen /> Saved Drafts ({drafts.length})</span>
                <button className="modal-close" onClick={() => setShowDraftModal(false)}>×</button>
              </div>
              <div className="modal-body">
                {drafts.map(d => {
                  const v = vendors.find(x => String(x.id) === String(d.vendorId));
                  const w = warehouses.find(x => String(x.id) === String(d.warehouseId));
                  return (
                    <button key={d.id} className="draft-tile" onClick={() => loadDraft(d)}>
                      <div className="dt-head">
                        <code>{d.orderNo}</code>
                        <span className="dt-date">{formatTzDate(d.orderDate, timezone, { format: 'date', year: undefined })}</span>
                      </div>
                      <div className="dt-route">{v?.name || 'No Vendor'} → {w?.name || 'No Warehouse'}</div>
                      <div className="dt-foot">
                        <span>{(d.lines||[]).length} item{(d.lines||[]).length!==1?'s':''}</span>
                        <strong>₹{parseFloat(d.grandTotal||0).toFixed(2)}</strong>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Cancel confirm ────────────────────────────── */}
        {showCancelConfirm && (
          <div className="modal-overlay" onClick={() => setShowCancelConfirm(false)}>
            <div className="modal-box confirm-box" onClick={e => e.stopPropagation()}>
              <div className="modal-head">
                <span><FaTimesCircle style={{color:'#ef4444'}}/> Cancel Order?</span>
                <button className="modal-close" onClick={() => setShowCancelConfirm(false)}>×</button>
              </div>
              <div className="modal-body">
                <p className="confirm-msg">Are you sure you want to cancel <strong>{po.orderNo}</strong>? This action cannot be undone.</p>
                <div className="confirm-actions">
                  <button className="btn-ghost" onClick={() => setShowCancelConfirm(false)}>Keep Order</button>
                  <button className="btn-danger" disabled={saving} onClick={() => handleSave('CANCELLED')}>
                    {saving ? 'Cancelling...' : 'Yes, Cancel'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Toast ─────────────────────────────────────── */}
      {message && <Toast msg={message} type={msgType} onClose={() => setMessage(null)} />}

      <style jsx>{MAIN_CSS}</style>
      <style jsx>{SKELETON_CSS}</style>
    </DashboardLayout>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function InfoRow({ label, value }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className="info-value">{value}</span>
    </div>
  );
}

function Toast({ msg, type, onClose }) {
  return (
    <div className={`po-toast ${type}`} onClick={onClose}>
      {type === 'success' ? <FaCheckCircle /> : <FaExclamationCircle />}
      <span>{msg}</span>
      <button className="toast-x">×</button>
    </div>
  );
}

// ─── Skeleton CSS ────────────────────────────────────────────────────────────
const SKELETON_CSS = `
  @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
  .po-skeleton-wrapper { padding: 0; }
  .sk-header { height: 72px; border-radius: 12px; margin-bottom: 20px;
    background: linear-gradient(90deg,#f0f4f8 25%,#e2e8f0 50%,#f0f4f8 75%);
    background-size: 800px 100%; animation: shimmer 1.4s infinite; }
  .sk-body { display: flex; gap: 20px; }
  .sk-left { flex: 1; display: flex; flex-direction: column; gap: 16px; }
  .sk-sidebar { width: 300px; flex-shrink: 0; }
  .sk-card { border-radius: 12px; height: 180px;
    background: linear-gradient(90deg,#f0f4f8 25%,#e2e8f0 50%,#f0f4f8 75%);
    background-size: 800px 100%; animation: shimmer 1.4s infinite; }
  .sk-card.tall { height: 320px; }
  @media(max-width:768px){ .sk-body{flex-direction:column} .sk-sidebar{width:100%} }
`;

// ─── Main CSS ────────────────────────────────────────────────────────────────
const MAIN_CSS = `
  /* ── Wrapper ─────────────────────────────────── */
  .po-wrap {
    width:100%; padding-bottom:120px;
    font-family:'Plus Jakarta Sans',sans-serif;
  }

  /* ── Top bar ─────────────────────────────────── */
  .po-topbar {
    display:flex; justify-content:space-between; align-items:center;
    margin-bottom:20px; gap:12px; flex-wrap:wrap;
    background:white; border-radius:14px; padding:14px 18px;
    border:1px solid #e2e8f0; border-top:3px solid #f97316;
    box-shadow:0 2px 8px rgba(0,0,0,0.04);
  }
  .po-topbar-left  { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .po-topbar-right { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .po-icon-box {
    width:44px; height:44px; border-radius:12px;
    background:linear-gradient(135deg,#fff7ed,#ffedd5);
    border:1px solid #fed7aa; display:flex; align-items:center;
    justify-content:center; color:#f97316; font-size:20px; flex-shrink:0;
  }
  .po-docno  { font-size:17px; font-weight:900; color:#0f172a; letter-spacing:-0.03em; }
  .po-subtitle { font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase; }

  /* ── Stepper ─────────────────────────────────── */
  .po-stepper { display:none; }

  /* ── Minimal Top Bar ────────────────────────── */
  .po-minimal-top {
    display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 12px;
  }
  .btn-top-new {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 14px; border-radius: 10px;
    background: #f97316; border: none;
    color: white; font-size: 12px; font-weight: 800;
    cursor: pointer; transition: 0.2s;
    box-shadow: 0 4px 12px rgba(249, 115, 22, 0.2);
  }
  .btn-top-new:hover { background: #ea6c0f; transform: translateY(-1px); }
  
  .btn-top-history {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 14px; border-radius: 10px;
    background: white; border: 1.5px solid #e2e8f0;
    color: #64748b; font-size: 12px; font-weight: 800;
    cursor: pointer; transition: 0.2s;
  }
  .btn-top-history:hover { border-color: #0f172a; color: #0f172a; background: #f8fafc; }

  /* ── Grid ────────────────────────────────────── */
  .po-grid {
    display:flex; gap:20px; align-items:flex-start;
  }
  .po-main    { flex:1; min-width:0; display:flex; flex-direction:column; gap:16px; }
  .po-sidebar { width:300px; flex-shrink:0; position:sticky; top:80px; }

  /* ── Cards ───────────────────────────────────── */
  .po-card {
    background:white; border-radius:12px; border:1px solid #e2e8f0;
    padding:16px; box-shadow:0 1px 4px rgba(0,0,0,0.04);
    transition:box-shadow 0.2s;
  }
  .po-card:focus-within { box-shadow:0 0 0 3px rgba(249,115,22,0.08); border-color:#fed7aa; }
  .po-card.no-inner-pad { padding:0; }
  .padded { padding:16px; }

  /* ── Card Header ─────────────────────────────── */
  .card-header {
    display:flex; align-items:center; justify-content:space-between; gap:12px;
    margin-bottom:14px;
  }
  .ch-main { display:flex; align-items:center; }
  .card-title { font-size:14px; font-weight:800; color:#0f172a; }
  
  .card-actions { display:flex; align-items:center; gap:8px; }
  .btn-header-ghost {
    display:flex; align-items:center; gap:6px;
    padding:6px 10px; border-radius:8px; background:transparent;
    border:1.5px solid #e2e8f0; color:#64748b;
    font-size:11px; font-weight:800; cursor:pointer; transition:0.2s;
  }
  .btn-header-ghost:hover { border-color:#0f172a; color:#0f172a; background:#f8fafc; }
  .btn-header-ghost.sm { padding:6px 8px; }
  
  .btn-header-amber {
    display:flex; align-items:center; gap:6px;
    padding:6px 10px; border-radius:8px; background:#fff7ed;
    border:1.5px solid #fed7aa; color:#f97316;
    font-size:11px; font-weight:800; cursor:pointer; transition:0.2s;
  }
  .btn-header-amber:hover { background:#ffedd5; border-color:#f97316; }
  .btn-header-danger {
    display:flex; align-items:center; gap:6px;
    padding:6px 10px; border-radius:8px; background:#fef2f2;
    border:1.5px solid #fee2e2; color:#ef4444;
    font-size:11px; font-weight:800; cursor:pointer; transition:0.2s;
  }
  .btn-header-danger:hover { background:#fee2e2; border-color:#ef4444; }

  .items-badge {
    margin-left:auto; background:#fff7ed; border:1px solid #fed7aa;
    color:#f97316; font-size:11px; font-weight:800;
    padding:4px 10px; border-radius:20px; flex-shrink:0;
  }

  /* ── Field Grid ──────────────────────────────── */
  .field-grid {
    display:grid; grid-template-columns:repeat(3, 1fr); gap:12px 16px;
  }
  .field-group { display:flex; flex-direction:column; gap:4px; }
  .field-group.span-2 { grid-column:span 2; }
  .field-group.span-3 { grid-column:span 3; }
  .field-group.has-error .field-input { border-color:#ef4444 !important; }
  .field-group.no-margin { margin-bottom: 0; }

  .field-label {
    font-size:10px; font-weight:800; color:#64748b;
    text-transform:uppercase; letter-spacing:0.06em;
    display:flex; align-items:center; gap:6px;
  }
  .lbl-icon { color:#f97316; font-size:10px; }
  .req      { color:#ef4444; font-size:12px; }

  .field-input {
    background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:8px;
    padding:8px 12px; font-size:12px; font-weight:700; color:#0f172a;
    font-family:inherit; outline:none; width:100%; box-sizing:border-box; transition:0.2s;
  }
  .field-input:focus { border-color:#f97316; background:white; box-shadow:0 0 0 3px rgba(249,115,22,0.10); }
  .field-input:disabled { opacity:0.55; cursor:not-allowed; }

  .field-error {
    font-size:11px; font-weight:700; color:#ef4444;
    display:flex; align-items:center; gap:5px;
  }
  .field-hint {
    font-size:11px; font-weight:600; color:#94a3b8;
    display:flex; align-items:center; gap:5px;
  }

  /* Overrides for custom components to be smaller in this form */
  :global(.po-wrap .nice-select) { height:36px !important; line-height:36px !important; font-size:12px !important; border-radius:8px !important; }
  :global(.po-wrap .nice-select .current) { font-weight:700 !important; }
  :global(.po-wrap .dt-trigger) { padding:6px 12px !important; border-radius:8px !important; }
  :global(.po-wrap .dt-input) { font-size:12px !important; }

  /* ── Product Search ──────────────────────────── */
  .product-search-wrap { position:relative; }
  .product-search-bar {
    display:flex; align-items:center; gap:14px;
    border:1.5px solid #e2e8f0; border-radius:14px;
    height:56px; padding:0 20px; background:white;
    transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor:text;
  }
  .product-search-bar.open, .product-search-bar:focus-within {
    border-color:#f97316; box-shadow:0 12px 30px -10px rgba(249,115,22,0.15);
    transform:translateY(-1px);
  }
  .ps-icon  { color:#f97316; font-size:20px; flex-shrink:0; }
  .product-search-bar input {
    flex:1; border:none; outline:none;
    font-size:16px; font-weight:600; color:#0f172a;
    font-family:inherit; background:transparent;
  }
  .product-search-bar input::placeholder { color:#94a3b8; }
  .ps-clear { width:28px; height:28px; border-radius:8px; background:#f1f5f9; border:none; font-size:18px; color:#64748b; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:0.2s; }
  .ps-clear:hover { background:#ef4444; color:white; }
  .ps-hint  { font-size:10px; font-weight:800; color:#cbd5e1; text-transform:uppercase; letter-spacing:0.04em; }

  .ps-dropdown {
    position:absolute; top:100%; left:0; right:0;
    background:white; border:2px solid #f97316; border-top:none;
    border-radius:0 0 12px 12px;
    box-shadow:0 16px 40px rgba(0,0,0,0.12); z-index:1000;
    max-height:360px; overflow-y:auto;
  }
  .ps-section-label { padding:8px 16px 4px; font-size:10px; font-weight:800; color:#94a3b8; text-transform:uppercase; }
  .ps-item {
    width:100%; display:flex; justify-content:space-between; align-items:center;
    padding:12px 16px; border:none; background:transparent;
    cursor:pointer; text-align:left; transition:0.15s; border-bottom:1px solid #f8fafc;
  }
  .ps-item:last-child { border-bottom:none; }
  .ps-item:hover { background:#fff7ed; }
  .ps-item-left  { display:flex; align-items:center; gap:12px; }
  .ps-item-avatar {
    width:36px; height:36px; border-radius:10px;
    background:linear-gradient(135deg,#fff7ed,#fed7aa);
    color:#f97316; font-weight:900; font-size:15px;
    display:flex; align-items:center; justify-content:center; flex-shrink:0;
  }
  .ps-item-name  { font-size:14px; font-weight:700; color:#0f172a; }
  .ps-item-meta  { display:flex; gap:8px; font-size:11px; font-weight:700; color:#94a3b8; margin-top:2px; }
  .ps-item-right { text-align:right; }
  .ps-item-price { font-size:14px; font-weight:900; color:#0f172a; }
  .ps-item-unit  { font-size:10px; font-weight:700; color:#94a3b8; }
  .ps-empty { padding:24px; text-align:center; font-size:13px; font-weight:600; color:#94a3b8; }

  /* ── Lines empty ─────────────────────────────── */
  /* ── Lines empty premium ────────────────────── */
  .lines-empty-premium {
    padding:80px 40px; text-align:center;
    display:flex; flex-direction:column; align-items:center;
  }
  .empty-graphic { position:relative; margin-bottom:24px; }
  .empty-graphic .blob {
    position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
    width:120px; height:120px; background:#fff7ed; border-radius:40% 60% 70% 30% / 40% 50% 60% 50%;
    animation:blob 8s linear infinite; z-index:0;
  }
  @keyframes blob {
    0%, 100% { border-radius:40% 60% 70% 30% / 40% 50% 60% 50%; transform:translate(-50%,-50%) rotate(0deg); }
    33% { border-radius:70% 30% 50% 50% / 30% 30% 70% 70%; transform:translate(-50%,-50%) rotate(120deg); }
    66% { border-radius:30% 60% 70% 40% / 50% 60% 30% 60%; transform:translate(-50%,-50%) rotate(240deg); }
  }
  .lines-empty-icon { font-size:48px; color:#fed7aa; position:relative; z-index:1; }
  .lines-empty-premium h3 { font-size:20px; font-weight:800; color:#0f172a; margin:0 0 8px; }
  .lines-empty-premium p  { font-size:14px; font-weight:600; color:#64748b; max-width:320px; line-height:1.6; margin:0 0 20px; }
  .empty-hint {
    display:inline-flex; align-items:center; gap:8px;
    padding:8px 16px; background:#f8fafc; border-radius:100px;
    font-size:11px; font-weight:700; color:#94a3b8;
  }
  .empty-hint svg { color:#f97316; }

  .inline-error {
    display:flex; align-items:center; gap:8px;
    font-size:12px; font-weight:700; color:#ef4444;
    background:#fef2f2; border:1px solid #fca5a5;
    border-radius:8px; padding:10px 14px; margin:0 20px 12px;
  }

  /* ── Lines table ─────────────────────────────── */
  .lines-table { width:100%; border-collapse:collapse; }
  .lines-table th {
    padding:10px 16px; font-size:10px; font-weight:800;
    color:#94a3b8; text-transform:uppercase; text-align:left;
    border-bottom:2px solid #f1f5f9; white-space:nowrap;
  }
  .line-row td   { padding:14px 16px; border-bottom:1px solid #f8fafc; vertical-align:middle; }
  .line-row:last-child td { border-bottom:none; }
  .line-row:hover td { background:#fafafa; }

  .tc-num   { width:44px; }
  .tc-qty   { width:170px; }
  .tc-price { width:130px; }
  .tc-tax   { width:100px; }
  .tc-total { width:130px; text-align:right; }
  .tc-del   { width:44px; text-align:center; }

  .line-num {
    width:26px; height:26px; border-radius:8px;
    background:#f1f5f9; color:#64748b;
    font-size:11px; font-weight:800;
    display:inline-flex; align-items:center; justify-content:center;
  }
  .line-name  { font-size:14px; font-weight:800; color:#0f172a; }
  .line-meta  { display:flex; gap:8px; margin-top:3px; font-size:10px; font-weight:700; }
  .line-meta .muted  { color:#cbd5e1; }
  .line-meta .orange { color:#f97316; text-transform:uppercase; }
  .total-amount { font-size:14px; font-weight:900; color:#0f172a; text-align:right; }
  .total-tax    { font-size:10px; font-weight:600; color:#94a3b8; text-align:right; margin-top:2px; }

  /* ── Qty Control ─────────────────────────────── */
  .qty-ctrl {
    display:flex; align-items:center;
    background:#f8fafc; border:1.5px solid #e2e8f0;
    border-radius:10px; padding:3px; width:fit-content;
  }
  .qty-ctrl.sm .qty-btn  { width:28px; height:28px; }
  .qty-ctrl.sm .qty-inp  { width:40px; }
  .qty-btn {
    width:32px; height:32px; border-radius:7px;
    border:none; background:white; cursor:pointer;
    color:#0f172a; display:flex; align-items:center;
    justify-content:center; font-size:10px;
    box-shadow:0 1px 3px rgba(0,0,0,0.06); transition:0.15s;
  }
  .qty-btn:hover:not(:disabled) { background:#0f172a; color:white; }
  .qty-btn:disabled { opacity:0.4; cursor:not-allowed; }
  .qty-inp {
    width:48px; text-align:center; background:transparent;
    border:none; outline:none; font-size:14px;
    font-weight:800; color:#0f172a; font-family:inherit;
    -moz-appearance:textfield;
  }
  .qty-inp::-webkit-inner-spin-button,
  .qty-inp::-webkit-outer-spin-button { -webkit-appearance:none; }

  /* Price / Tax inputs */
  .price-wrap { display:flex; align-items:center; border:1.5px solid #e2e8f0; border-radius:10px; overflow:hidden; transition:0.2s; }
  .price-wrap:focus-within { border-color:#f97316; box-shadow:0 0 0 3px rgba(249,115,22,0.08); }
  .currency-prefix { padding:0 0 0 12px; font-size:13px; font-weight:800; color:#94a3b8; flex-shrink:0; }
  .currency-suffix { padding:0 10px 0 4px; font-size:13px; font-weight:800; color:#94a3b8; flex-shrink:0; }
  .price-inp, .tax-inp {
    flex:1; border:none; outline:none; padding:10px 8px;
    font-size:13px; font-weight:700; color:#0f172a;
    font-family:inherit; background:transparent;
    -moz-appearance:textfield;
  }
  .price-inp::-webkit-inner-spin-button,
  .tax-inp::-webkit-inner-spin-button { -webkit-appearance:none; }
  .tax-inp { width:50px; }

  /* Del btn */
  .del-btn {
    width:34px; height:34px; border-radius:8px;
    background:#fef2f2; border:none; color:#ef4444;
    cursor:pointer; display:flex; align-items:center; justify-content:center;
    font-size:13px; transition:0.15s;
  }
  .del-btn:hover { background:#ef4444; color:white; }
  .del-btn.sm    { width:30px; height:30px; font-size:11px; }

  /* ── Notes ───────────────────────────────────── */
  .summary-notes-group { margin-bottom: 18px; padding-top: 10px; border-top: 1px dashed #e2e8f0; }
  .notes-label { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.03em; }
  .summary-notes-area {
    width: 100%; box-sizing: border-box; min-height: 80px; max-height: 200px;
    border: 1.5px solid #cbd5e1; border-radius: 10px;
    padding: 10px 12px; font-family: inherit;
    font-size: 12px; font-weight: 600; color: #0f172a;
    resize: vertical; outline: none; background: white; transition: all 0.2s;
  }
  .summary-notes-area:focus { border-color: #f97316; background: white; box-shadow: 0 4px 12px rgba(249,115,22,0.12); }
  .summary-notes-area:disabled { background: #f8fafc; color: #94a3b8; cursor: not-allowed; border-color: #e2e8f0; }
  .summary-notes-area::placeholder { color: #94a3b8; }

  /* ── Summary Sidebar ─────────────────────────── */
  .summary-card   { }
  .summary-title  { font-size:14px; font-weight:900; color:#0f172a; margin-bottom:16px; }
  .summary-info-block { display:flex; flex-direction:column; gap:8px; margin-bottom:18px; }
  .info-row  { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
  .info-label { font-size:11px; font-weight:700; color:#94a3b8; flex-shrink:0; }
  .info-value { font-size:12px; font-weight:700; color:#1e293b; text-align:right; word-break:break-word; }
  .not-set   { font-style:italic; color:#cbd5e1; font-weight:600; font-size:12px; }

  .financials-box { background:#f8fafc; border-radius:10px; padding:14px; margin-bottom:18px; }
  .fin-row   { display:flex; justify-content:space-between; font-size:12px; font-weight:600; color:#475569; margin-bottom:6px; }
  .fin-row.tax   { color:#d97706; }
  .fin-row.grand { font-size:15px; font-weight:900; color:#0f172a; margin:0; }
  .fin-divider   { height:1px; background:#e2e8f0; margin:10px 0; }
  
  .summary-payment-row { display:flex; flex-direction:column; gap:6px; margin-top:8px; border-top:1px solid #f1f5f9; padding-top:12px; }
  .summary-payment-row.no-border { border-top:none; padding-top:0; margin-top:12px; }
  .sidebar-select {
    width:100%; padding:10px; border-radius:8px; border:1.5px solid #e2e8f0;
    font-size:12px; font-weight:700; color:#0f172a; font-family:inherit;
    background:#f8fafc; outline:none; transition:0.2s;
  }
  .sidebar-select:focus { border-color:#f97316; background:white; }

  /* Status picker */
  .status-picker { margin-bottom:16px; }
  .status-picker-label { font-size:10px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px; }
  .status-picker-grid  { display:flex; flex-direction:column; gap:6px; }
  .status-opt {
    display:flex; align-items:center; gap:8px;
    padding:9px 12px; border-radius:8px;
    border:1.5px solid #e2e8f0; background:white;
    font-size:12px; font-weight:700; color:#64748b;
    cursor:pointer; transition:0.15s; text-align:left;
  }
  .status-opt i { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .status-opt.sel { font-weight:800; }
  .status-opt:hover:not(.sel) { background:#f8fafc; }

  /* Action stack */
  .action-col { display:flex; flex-direction:column; gap:10px; }

  /* Locked notice */
  .locked-notice {
    display:flex; align-items:center; gap:10px;
    padding:12px 14px; border-radius:10px; border:1.5px solid;
    font-size:12px; font-weight:700; margin-bottom:12px;
  }

  /* New PO btn */
  .btn-new-po {
    width:100%; display:flex; align-items:center; justify-content:center; gap:8px;
    padding:11px; border-radius:10px; background:transparent;
    border:1.5px dashed #e2e8f0; color:#94a3b8;
    font-size:13px; font-weight:700; cursor:pointer; transition:0.2s; margin-top:4px;
  }
  .btn-new-po:hover { border-color:#f97316; color:#f97316; background:#fff7ed; }

  /* ── Buttons ─────────────────────────────────── */
  .btn-primary {
    display:inline-flex; align-items:center; justify-content:center; gap:8px;
    padding:13px 20px; border-radius:12px; background:#f97316; border:none;
    color:white; font-size:14px; font-weight:800; cursor:pointer; transition:0.2s;
    box-shadow:0 4px 14px rgba(249,115,22,0.25); font-family:inherit;
  }
  .btn-primary.full { width:100%; }
  .btn-primary:hover:not(:disabled) { background:#ea6c0f; transform:translateY(-1px); box-shadow:0 8px 20px rgba(249,115,22,0.3); }
  .btn-primary:disabled { opacity:0.6; cursor:not-allowed; transform:none; }

  .btn-outline {
    display:inline-flex; align-items:center; justify-content:center; gap:8px;
    padding:11px 20px; border-radius:12px; background:white;
    border:2px solid #e2e8f0; color:#0f172a;
    font-size:13px; font-weight:700; cursor:pointer; transition:0.2s; font-family:inherit;
  }
  .btn-outline.full { width:100%; }
  .btn-outline:hover:not(:disabled) { border-color:#0f172a; background:#f8fafc; }
  .btn-outline:disabled { opacity:0.5; cursor:not-allowed; }

  .btn-danger {
    display:inline-flex; align-items:center; justify-content:center; gap:8px;
    padding:10px 20px; border-radius:10px; background:white;
    border:1.5px solid #fca5a5; color:#ef4444;
    font-size:12px; font-weight:700; cursor:pointer; transition:0.2s; font-family:inherit;
  }
  .btn-danger.full { width:100%; }
  .btn-danger:hover:not(:disabled) { background:#fef2f2; border-color:#ef4444; }
  .btn-danger:disabled { opacity:0.5; cursor:not-allowed; }

  .btn-ghost {
    display:inline-flex; align-items:center; gap:8px;
    padding:9px 16px; border-radius:10px;
    background:white; border:1.5px solid #e2e8f0; color:#475569;
    font-size:13px; font-weight:700; cursor:pointer; transition:0.2s; font-family:inherit;
  }
  .btn-ghost:hover { background:#f8fafc; border-color:#cbd5e1; }
  .btn-ghost.sm { padding:9px 12px; }

  .btn-amber {
    display:inline-flex; align-items:center; gap:8px;
    padding:9px 14px; border-radius:10px;
    background:#fffbeb; border:1.5px solid #fde68a; color:#b45309;
    font-size:13px; font-weight:700; cursor:pointer; transition:0.2s; font-family:inherit;
  }
  .btn-amber:hover { background:#fef9c3; }

  .btn-back    { @extend .btn-primary; }
  .btn-refresh {
    width:36px; height:36px; border-radius:10px;
    background:white; border:1.5px solid #e2e8f0; color:#64748b;
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; transition:0.2s;
  }
  .btn-refresh:hover { border-color:#f97316; color:#f97316; }
  .btn-edit {
    display:inline-flex; align-items:center; gap:6px;
    padding:7px 12px; border-radius:8px;
    background:#fff7ed; border:1.5px solid #fed7aa; color:#f97316;
    font-size:12px; font-weight:700; cursor:pointer; transition:0.15s; white-space:nowrap;
  }
  .btn-edit:hover { background:#f97316; color:white; }
  .btn-edit.sm { padding:6px 10px; font-size:11px; }

  .btn-spin {
    width:16px; height:16px;
    border:2px solid rgba(255,255,255,0.3); border-top-color:white;
    border-radius:50%; animation:spin 0.7s linear infinite; flex-shrink:0;
  }

  /* ── Status Badge ────────────────────────────── */
  .status-badge {
    display:inline-flex; align-items:center; gap:6px;
    padding:4px 10px; border-radius:20px; border:1px solid;
    font-size:11px; font-weight:800; text-transform:uppercase;
    white-space:nowrap;
  }
  .status-badge.topbar { font-size:10px; }
  .status-badge i { width:7px; height:7px; border-radius:50%; flex-shrink:0; }

  /* ── History Toolbar (Premium) ───────────────── */
  .hist-toolbar {
    display:flex; justify-content:space-between; align-items:center;
    margin-bottom:20px; gap:16px; flex-wrap:wrap;
    background:white; padding:12px 16px; border-radius:14px; 
    border:1px solid #e2e8f0; border-top: 3px solid #f97316;
    box-shadow: 0 4px 12px rgba(0,0,0,0.03);
  }
  .hist-toolbar-left { display:flex; align-items:center; gap:12px; flex-wrap:wrap; flex: 1; }
  .hist-toolbar-right { display:flex; align-items:center; gap:12px; }
  .hist-count { font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; }

  .hist-filters { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .h-filter-group { min-width: 120px; }
  .h-filter-sep { font-size: 11px; font-weight: 800; color: #cbd5e1; margin: 0 2px; }
  
  :global(.po-wrap .nice-select),
  :global(.po-wrap .dt-trigger),
  :global(.po-wrap .premium-dt-picker) {
    border: 1.5px solid #f97316 !important;
    border-radius: 12px !important;
    background: #fff !important;
    transition: 0.2s !important;
  }
  
  :global(.po-wrap .nice-select:hover),
  :global(.po-wrap .dt-trigger:hover),
  :global(.po-wrap .premium-dt-picker:hover) {
    background: #fff7ed !important;
    border-color: #ea580c !important;
  }

  .btn-apply-filter { display: none; }

  .hist-table-wrap { background:white; border-radius:12px; border:1px solid #e2e8f0; overflow-x:auto; }
  .hist-table { width:100%; border-collapse:collapse; min-width:680px; }
  .hist-table th {
    padding:12px 16px; font-size:10px; font-weight:800;
    color:#94a3b8; text-transform:uppercase; text-align:left;
    border-bottom:2px solid #f1f5f9; white-space:nowrap;
  }
  .hist-row td  { padding:14px 16px; border-bottom:1px solid #f8fafc; vertical-align:middle; }
  .hist-row:last-child td { border-bottom:none; }
  .hist-row:hover td { background:#fafafa; }

  .po-code { font-family:monospace; font-size:13px; font-weight:800; color:#f97316; background:#fff7ed; padding:3px 8px; border-radius:6px; }
  .muted   { color:#64748b; font-size:12px; }
  .orange  { color:#f97316; }
  .pill    { background:#f1f5f9; color:#64748b; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:800; }

  .hist-mobile-list { display:none; }
  .hist-card {
    background:white; border-radius:12px; border:1px solid #e2e8f0;
    padding:16px; margin-bottom:12px; box-shadow:0 1px 4px rgba(0,0,0,0.04);
  }
  .hc-top    { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
  .hc-vendor { font-size:15px; font-weight:800; color:#0f172a; margin-bottom:6px; }
  .hc-meta   { display:flex; gap:12px; font-size:11px; font-weight:700; color:#94a3b8; margin-bottom:10px; }
  .hc-bottom { display:flex; justify-content:space-between; align-items:center; }
  .hc-total  { font-size:18px; font-weight:900; color:#0f172a; }

  /* ── Empty State ─────────────────────────────── */
  .po-empty-state {
    text-align:center; padding:80px 24px;
    background:white; border-radius:12px; border:1px solid #e2e8f0;
  }
  .empty-ico { font-size:52px; color:#e2e8f0; display:block; margin-bottom:16px; }
  .po-empty-state h3 { font-size:20px; font-weight:800; color:#1e293b; margin:0 0 8px; }
  .po-empty-state p  { font-size:13px; color:#94a3b8; font-weight:600; margin:0 0 24px; }

  /* ── Mobile lines ────────────────────────────── */
  .mobile-lines { display:none; }
  .mobile-line-card {
    border:1.5px solid #e2e8f0; border-radius:10px; padding:14px 16px;
    margin:0 16px 10px; background:#fafafa;
  }
  .mlc-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; }
  .mlc-name { font-size:14px; font-weight:800; color:#0f172a; }
  .mlc-meta { display:flex; gap:8px; font-size:10px; font-weight:700; margin-top:3px; }
  .mlc-head-right { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
  .mlc-total { font-size:16px; font-weight:900; color:#0f172a; }
  .mlc-controls { display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end; }
  .mlc-field { display:flex; flex-direction:column; gap:5px; }
  .mlc-field label { font-size:9px; font-weight:800; color:#94a3b8; text-transform:uppercase; }
  .mlc-tax-note { font-size:10px; font-weight:600; color:#94a3b8; margin-top:8px; }

  /* ── Mobile bar ─────────────────────────────── */
  .mobile-bar { display:none; }

  /* ── Mobile step nav ─────────────────────────── */
  .step-nav { display:none; }

  /* ── Modal ───────────────────────────────────── */
  .modal-overlay {
    position:fixed; inset:0; background:rgba(15,23,42,0.45);
    backdrop-filter:blur(6px); z-index:2000;
    display:flex; align-items:center; justify-content:center; padding:20px;
  }
  .modal-box {
    background:white; width:100%; max-width:480px; border-radius:16px;
    box-shadow:0 24px 60px rgba(0,0,0,0.2); overflow:hidden;
    animation:modalIn 0.25s cubic-bezier(0.23,1,0.32,1);
    border: 1px solid #e2e8f0; border-top: 3px solid #f97316;
  }
  .confirm-box { max-width:380px; }
  @keyframes modalIn  { from{opacity:0;transform:scale(0.95) translateY(10px)} to{opacity:1;transform:none} }
  .modal-head {
    padding:18px 20px; border-bottom:1px solid #f1f5f9;
    display:flex; justify-content:space-between; align-items:center;
    font-size:15px; font-weight:800; color:#0f172a;
  }
  .modal-close {
    width:32px; height:32px; border-radius:8px; background:#f1f5f9;
    border:none; font-size:20px; color:#64748b; cursor:pointer;
    display:flex; align-items:center; justify-content:center; line-height:1;
  }
  .modal-body { padding:16px; max-height:420px; overflow-y:auto; }

  .draft-tile {
    width:100%; text-align:left; padding:14px; border:1.5px solid #f1f5f9;
    border-radius:10px; margin-bottom:8px; cursor:pointer;
    transition:0.2s; background:white; display:block;
  }
  .draft-tile:hover { border-color:#f97316; background:#fff7ed; }
  .dt-head { display:flex; justify-content:space-between; margin-bottom:4px; }
  .dt-date { font-size:11px; color:#94a3b8; font-weight:600; }
  .dt-route { font-size:12px; font-weight:700; color:#334155; margin-bottom:8px; }
  .dt-foot  { display:flex; justify-content:space-between; font-size:11px; font-weight:600; color:#94a3b8; }

  .confirm-msg { font-size:14px; font-weight:600; color:#475569; line-height:1.6; margin:4px 0 20px; }
  .confirm-actions { display:flex; gap:10px; justify-content:flex-end; }

  /* ── Toast ───────────────────────────────────── */
  .po-toast {
    position:fixed; bottom:24px; right:24px; z-index:9999;
    padding:13px 18px; border-radius:12px; background:#1e293b;
    color:white; display:flex; align-items:center; gap:12px;
    font-weight:700; font-size:13px; cursor:pointer;
    box-shadow:0 20px 50px rgba(0,0,0,0.2); max-width:360px;
    animation:toastIn 0.3s cubic-bezier(0.23,1,0.32,1);
  }
  @keyframes toastIn { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
  .po-toast.success { border-left:4px solid #10b981; }
  .po-toast.error   { border-left:4px solid #ef4444; }
  .toast-x { background:none; border:none; color:rgba(255,255,255,0.5); font-size:18px; cursor:pointer; margin-left:auto; line-height:1; }

  /* ── Spinner ─────────────────────────────────── */
  .po-spinner-box {
    display:flex; align-items:center; justify-content:center;
    gap:14px; padding:60px; font-size:14px; font-weight:700; color:#94a3b8;
  }
  .po-spinner {
    width:32px; height:32px; border:3px solid #f1f5f9;
    border-top-color:#f97316; border-radius:50%; animation:spin 0.7s linear infinite;
  }
  @keyframes spin { to{transform:rotate(360deg)} }
  .spin { animation:spin 0.7s linear infinite; }

  /* ═══════════════════════════════════════════════
     RESPONSIVE — Tablet (641–1024px)
  ═══════════════════════════════════════════════ */
  @media(max-width:1024px) {
    .po-grid      { flex-direction:column; }
    .po-sidebar   { width:100%; position:static; }
    /* Summary turns horizontal on tablet */
    .summary-info-block { flex-direction:row; flex-wrap:wrap; gap:12px; }
    .info-row     { flex-direction:column; gap:2px; min-width:120px; }
    .info-value   { text-align:left; }
    .financials-box { display:flex; gap:16px; flex-wrap:wrap; align-items:center; }
    .fin-row      { flex:1; flex-direction:column; gap:2px; margin:0; }
    .fin-row.grand { border-left:2px solid #e2e8f0; padding-left:16px; }
    .fin-divider  { display:none; }
    .status-picker-grid { flex-direction:row; flex-wrap:wrap; }
    .status-opt   { flex:1; min-width:100px; justify-content:center; }
    .action-col   { flex-direction:row; flex-wrap:wrap; }
    .btn-primary.full, .btn-outline.full, .btn-danger.full { flex:1; min-width:140px; }
    .btn-new-po   { width:auto; flex:0 0 auto; }
  }

  @media(max-width:768px) {
    .field-grid   { grid-template-columns:1fr; }
    .field-group.span-2 { grid-column:1; }
    .field-group.span-3 { grid-column:1; }
  }

  /* ═══════════════════════════════════════════════
     RESPONSIVE — Mobile (≤640px)
  ═══════════════════════════════════════════════ */
  @media(max-width:640px) {
    .po-wrap { padding-bottom:140px; }

    /* Topbar compact */
    .po-topbar { padding:12px 14px; gap:10px; }
    .po-topbar-right { flex-wrap:nowrap; }
    .po-docno { font-size:14px; }

    /* Stepper shown on mobile */
    .po-stepper {
      display:flex; align-items:center; justify-content:center;
      background:white; border-radius:12px; border:1px solid #e2e8f0;
      padding:14px 16px; margin-bottom:16px; gap:0;
      overflow-x:auto; -webkit-overflow-scrolling:touch;
    }
    .step-btn {
      display:flex; flex-direction:column; align-items:center; gap:6px;
      background:none; border:none; cursor:pointer; padding:8px 14px;
      flex-shrink:0; position:relative;
    }
    .step-circle {
      width:38px; height:38px; border-radius:50%; border:2px solid #e2e8f0;
      display:flex; align-items:center; justify-content:center;
      font-size:15px; color:#94a3b8; background:white; transition:0.2s;
    }
    .step-btn.active .step-circle { border-color:#f97316; color:#f97316; background:#fff7ed; }
    .step-btn.done .step-circle   { border-color:#10b981; color:#10b981; background:#ecfdf5; }
    .step-btn.active.done .step-circle { border-color:#f97316; color:#f97316; background:#fff7ed; }
    .step-label { font-size:10px; font-weight:800; color:#94a3b8; text-transform:uppercase; white-space:nowrap; }
    .step-btn.active .step-label  { color:#f97316; }
    .step-btn.done .step-label    { color:#10b981; }
    .step-line {
      flex:1; height:2px; background:#e2e8f0; min-width:24px; max-width:48px;
      border-radius:2px; margin-bottom:18px; transition:0.3s;
    }
    .step-line.done { background:#10b981; }

    /* Cards hidden by step */
    .mobile-hidden { display:none !important; }

    /* Step nav buttons */
    .step-nav {
      display:flex; justify-content:space-between; align-items:center;
      gap:10px; margin-top:20px; padding-top:16px;
      border-top:1px solid #f1f5f9;
    }
    .step-nav.padded { margin:16px 20px 0; padding:16px 0 20px; }
    .step-nav button { flex:1; }

    /* Table → mobile cards */
    .lines-table    { display:none; }
    .mobile-lines   { display:block; padding-bottom:8px; }

    /* History */
    .hist-table-wrap { display:none; }
    .hist-mobile-list { display:block; }

    /* Mobile sticky bar */
    .mobile-bar {
      display:flex; position:fixed; bottom:0; left:0; right:0;
      background:#0f172a; padding:14px 18px;
      align-items:center; justify-content:space-between;
      z-index:1000; box-shadow:0 -8px 32px rgba(0,0,0,0.2);
      border-top:1px solid rgba(255,255,255,0.08);
    }
    .mb-left   { display:flex; flex-direction:column; }
    .mb-total  { font-size:20px; font-weight:900; color:#f97316; }
    .mb-count  { font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; }
    .mb-right  { display:flex; gap:8px; align-items:center; }
    .mb-save   {
      width:46px; height:46px; border-radius:12px;
      background:rgba(255,255,255,0.1); border:1.5px solid rgba(255,255,255,0.15);
      color:white; font-size:17px; cursor:pointer;
      display:flex; align-items:center; justify-content:center; transition:0.15s;
    }
    .mb-save:hover { background:rgba(255,255,255,0.2); }
    .mb-confirm {
      padding:0 22px; height:46px; border-radius:12px;
      background:#f97316; border:none; color:white;
      font-weight:800; font-size:14px; cursor:pointer; transition:0.15s;
    }
    .mb-confirm:hover { background:#ea6c0f; }
    .mb-confirm:disabled { opacity:0.6; }

    /* Toast on mobile */
    .po-toast { left:16px; right:16px; bottom:80px; max-width:none; }

    /* Topbar history button text hidden */
    .hist-txt { display:none; }

    /* Modal full-screen on tiny screens */
    .modal-overlay { padding:0; align-items:flex-end; }
    .modal-box { border-radius:20px 20px 0 0; max-width:100%; }
    .modal-body { max-height:60vh; }
  }

  /* ═══════════════════════════════════════════════
     Large Desktop (>1400px) — wider grid
  ═══════════════════════════════════════════════ */
  @media(min-width:1400px) {
    .po-sidebar { width:340px; }
    .field-grid { grid-template-columns:1fr 1fr 1fr; }
    .field-group.span-2 { grid-column: span 2; }
    .field-group.span-3 { grid-column: span 3; }
    .field-group.no-margin { margin-bottom: 0; }
  }

  /* ── misc utils ──────────────────────────────── */
  .mobile-only { display:none; }
  @media(max-width:640px) { .mobile-only { display:flex; } }
`;
