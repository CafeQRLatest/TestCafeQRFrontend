import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { getCurrencySymbol } from '../constants/expenseScopes';

const STATUS_CFG = {
  DRAFT:     { label: 'Draft',     color: '#64748b', bg: '#f1f5f9', dot: '#94a3b8', border: '#cbd5e1' },
  CONFIRMED: { label: 'Confirmed', color: '#b45309', bg: '#fffbeb', dot: '#f59e0b', border: '#fde68a' },
  COMPLETED: { label: 'Received',  color: '#059669', bg: '#ecfdf5', dot: '#10b981', border: '#6ee7b7' },
  CANCELLED: { label: 'Cancelled', color: '#dc2626', bg: '#fef2f2', dot: '#ef4444', border: '#fca5a5' },
};

const blankPO = () => ({
  orderNo:        '', // Managed by backend DocumentSequenceService
  orderType:      'PURCHASE',
  orderStatus:    'DRAFT',
  paymentStatus:  'PENDING',
  paymentMethod:  'CREDIT',
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

export function usePurchaseOrders() {
  const { timezone, userRole, currency } = useAuth();
  const currencySymbol = getCurrencySymbol(currency);

  /* ── master data ── */
  const [vendors,    setVendors]    = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products,   setProducts]   = useState([]);

  /* ── ui state ── */
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [view,           setView]           = useState('form');   // 'form' | 'history'
  const [step,           setStep]           = useState(1);        // 1-2 steps
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

  /* ── timezone safe business dates ── */
  const getLocalDate = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getBusinessNow = useCallback(() => {
    if (!timezone) return new Date();
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      });
      const parts = Object.fromEntries(
        formatter.formatToParts(new Date()).map(p => [p.type, p.value])
      );
      return new Date(
        `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
      );
    } catch {
      return new Date();
    }
  }, [timezone]);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Lazy initialize filter dates when timezone initializes
  useEffect(() => {
    if (timezone && !fromDate) {
      const now = getBusinessNow();
      const past = new Date(now);
      past.setDate(past.getDate() - 30);
      setFromDate(`${getLocalDate(past)}T00:00`);
      setToDate(`${getLocalDate(now)}T23:59`);
    }
  }, [timezone, getBusinessNow, fromDate]);

  /* ── filters ── */
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterVendor, setFilterVendor] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterPayMethod, setFilterPayMethod] = useState('');

  /* ── current PO ── */
  const [po, setPo] = useState(blankPO());

  // Automatically sync expected Date and order Date with local timezone when empty
  useEffect(() => {
    if (timezone && !po.orderNo && po.orderStatus === 'DRAFT' && po.lines.length === 0) {
      const now = getBusinessNow();
      const nowStr = `${getLocalDate(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setPo(p => ({
        ...p,
        orderDate: nowStr,
        expectedDate: nowStr
      }));
    }
  }, [timezone, getBusinessNow, po.orderNo, po.orderStatus]);

  /* ── helpers ── */
  const toast = useCallback((msg, type = 'success') => {
    setMessage(msg); setMsgType(type);
    setTimeout(() => setMessage(null), 3500);
  }, []);

  const calcTotals = useCallback((lines) => {
    const totalAmount    = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0), 0);
    const totalTaxAmount = lines.reduce((s, l) => s + (parseFloat(l.taxAmount) || 0), 0);
    const grandTotal     = lines.reduce((s, l) => s + (parseFloat(l.lineTotal) || 0), 0);
    return {
      totalAmount:    +totalAmount.toFixed(2),
      totalTaxAmount: +totalTaxAmount.toFixed(2),
      grandTotal:     +grandTotal.toFixed(2),
    };
  }, []);

  const recalcLine = useCallback((line) => {
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
  }, []);

  /* ── draft fetching ── */
  const fetchDrafts = useCallback(async () => {
    try {
      const r = await api.get('/api/v1/orders/type/PURCHASE');
      if (r.data.success) setDrafts((r.data.data || []).filter(o => o.orderStatus === 'DRAFT'));
    } catch { /* silent */ }
  }, []);

  const fetchHistory = useCallback(async () => {
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
      if (r.data.success) setHistory(r.data.data.content || []);
    } catch { toast('Failed to load history', 'error'); }
    finally { setHistoryLoading(false); }
  }, [filterStatus, filterVendor, filterWarehouse, filterPayMethod, fromDate, toDate, toast]);

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
          ? (pR.data.data || []).filter(p => p.isactive !== 'N' && p.isActive !== false && !p.hasIngredients)
          : []);
      } catch {
        toast('Failed to load data — please refresh', 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
    fetchDrafts();
  }, [fetchDrafts, toast]);

  useEffect(() => {
    if (view === 'history' && fromDate) fetchHistory();
  }, [view, fromDate, toDate, filterStatus, filterVendor, filterWarehouse, filterPayMethod, fetchHistory]);

  /* ── product actions ── */
  const addProduct = useCallback((product) => {
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
  }, [po.lines, recalcLine, calcTotals, toast]);

  const updateLine = useCallback((idx, field, val) => {
    setPo(p => {
      const lines = p.lines.map((l, i) => i === idx ? recalcLine({ ...l, [field]: val }) : l);
      return { ...p, lines, ...calcTotals(lines) };
    });
  }, [recalcLine, calcTotals]);

  const removeLine = useCallback((idx) => {
    setPo(p => {
      const lines = p.lines.filter((_, i) => i !== idx);
      return { ...p, lines, ...calcTotals(lines) };
    });
  }, [calcTotals]);

  /* ── validation ── */
  const validate = useCallback(() => {
    const e = {};
    if (!po.vendorId)   e.vendorId   = 'Please select a vendor';
    if (!po.warehouseId) e.warehouseId = 'Please select a warehouse';
    if (!po.lines.length) e.lines    = 'Add at least one product';
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [po.vendorId, po.warehouseId, po.lines.length]);

  /* ── save ── */
  const handleSave = useCallback(async (targetStatus) => {
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
        lines: po.lines.map(({ productId, variantId, productName, quantity, unitPrice, unitOfMeasure, taxRate, taxAmount, discountAmount, lineTotal }) => ({
          productId,
          variantId,
          productName,
          quantity: parseFloat(quantity) || 0,
          unitPrice: parseFloat(unitPrice) || 0,
          unitOfMeasure,
          taxRate: parseFloat(taxRate) || 0,
          taxAmount: parseFloat(taxAmount) || 0,
          discountAmount: parseFloat(discountAmount) || 0,
          lineTotal: parseFloat(lineTotal) || 0,
        })),
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
  }, [po, validate, toast, fetchDrafts]);

  /* ── load draft ── */
  const loadDraft = useCallback((d) => {
    setPo({
      id:            d.id,
      orderNo:       d.orderNo,
      orderType:     'PURCHASE',
      orderStatus:   d.orderStatus,
      paymentStatus: d.paymentStatus || 'PENDING',
      paymentMethod: d.paymentMethod || 'CASH',
      vendorId:      d.vendorId   ? String(d.vendorId)   : '',
      warehouseId:   d.warehouseId ? String(d.warehouseId) : '',
      orderDate:     d.orderDate   ? String(d.orderDate).slice(0, 16)   : new Date().toISOString().slice(0, 16),
      expectedDate:  d.expectedDate ? String(d.expectedDate).slice(0, 16) : '',
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
  }, [products, recalcLine, toast]);

  const startFresh = useCallback(() => {
    setPo(blankPO());
    setErrors({});
    setStep(1);
  }, []);

  /* ── derived state ── */
  const vendorOptions    = useMemo(() => vendors.map(v => ({ value: String(v.id), label: v.name })), [vendors]);
  const warehouseOptions = useMemo(() => warehouses.map(w => ({ value: String(w.id), label: w.name })), [warehouses]);
  const selectedVendor   = useMemo(() => vendors.find(v => String(v.id) === String(po.vendorId)), [vendors, po.vendorId]);
  const selectedWarehouse = useMemo(() => warehouses.find(w => String(w.id) === String(po.warehouseId)), [warehouses, po.warehouseId]);
  const isLocked         = useMemo(() => po.orderStatus === 'COMPLETED' || po.orderStatus === 'CANCELLED', [po.orderStatus]);
  const statusCfg        = useMemo(() => STATUS_CFG[po.orderStatus] || STATUS_CFG.DRAFT, [po.orderStatus]);

  const filteredProducts = useMemo(() => {
    return productSearch.trim() === ''
      ? products.slice(0, 12)
      : products.filter(p =>
          (p.name || '').toLowerCase().includes(productSearch.toLowerCase()) ||
          (p.productCode || '').toLowerCase().includes(productSearch.toLowerCase())
        ).slice(0, 20);
  }, [products, productSearch]);

  const stepOk = useMemo(() => ({
    1: !!(po.vendorId && po.warehouseId),
    2: po.lines.length > 0,
    3: true,
  }), [po.vendorId, po.warehouseId, po.lines.length]);

  return {
    timezone,
    userRole,
    currencySymbol,
    vendors,
    warehouses,
    products,
    loading,
    saving,
    view,
    setView,
    step,
    setStep,
    errors,
    setErrors,
    message,
    setMessage,
    msgType,
    showDraftModal,
    setShowDraftModal,
    showCancelConfirm,
    setShowCancelConfirm,
    drafts,
    history,
    historyLoading,
    productSearch,
    setProductSearch,
    showSuggestions,
    setShowSuggestions,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    filterStatus,
    setFilterStatus,
    filterVendor,
    setFilterVendor,
    filterWarehouse,
    setFilterWarehouse,
    filterPayMethod,
    setFilterPayMethod,
    po,
    setPo,
    toast,
    calcTotals,
    recalcLine,
    fetchDrafts,
    fetchHistory,
    addProduct,
    updateLine,
    removeLine,
    validate,
    handleSave,
    loadDraft,
    startFresh,
    vendorOptions,
    warehouseOptions,
    selectedVendor,
    selectedWarehouse,
    isLocked,
    statusCfg,
    filteredProducts,
    stepOk,
    STATUS_CFG
  };
}
