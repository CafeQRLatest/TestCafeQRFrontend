import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { useCurrencySymbol } from './useCurrencySymbol';
import { getBusinessNow, getLocalISOString, businessTimeToUtc } from '../utils/timezoneUtils';

const STATUS_CFG = {
  DRAFT:     { label: 'Draft',     color: '#64748b', bg: '#f1f5f9', dot: '#94a3b8', border: '#cbd5e1' },
  CONFIRMED: { label: 'Completed', color: '#b45309', bg: '#fffbeb', dot: '#f59e0b', border: '#fde68a' },
  COMPLETED: { label: 'Received',  color: '#059669', bg: '#ecfdf5', dot: '#10b981', border: '#6ee7b7' },
  CANCELLED: { label: 'Cancelled', color: '#dc2626', bg: '#fef2f2', dot: '#ef4444', border: '#fca5a5' },
  VOID:      { label: 'Voided',    color: '#dc2626', bg: '#fef2f2', dot: '#ef4444', border: '#fca5a5' },
};

const blankPO = () => ({
  orderNo:        '', // Managed by backend DocumentSequenceService
  orderType:      'PURCHASE',
  orderStatus:    'DRAFT',
  paymentStatus:  'PENDING',
  paymentMethod:  '',
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
  const { timezone, userRole, orgId } = useAuth();
  const currencySymbol = useCurrencySymbol();

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
  const [historyPage,    setHistoryPage]    = useState({ number: 0, size: 20, totalPages: 0, totalElements: 0 });
  const [paymentTypes,   setPaymentTypes]   = useState([]);

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

  // Lazy initialize filter dates when timezone initializes (Same day default: Today 00:00 to Today 23:59)
  useEffect(() => {
    if (timezone && !fromDate) {
      const now = getBusinessNow();
      setFromDate(`${getLocalDate(now)}T00:00`);
      setToDate(`${getLocalDate(now)}T23:59`);
    }
  }, [timezone, getBusinessNow, fromDate]);

  /* ── filters ── */
  const [filterStatus, setFilterStatus] = useState('CONFIRMED_COMPLETED');
  const [filterVendor, setFilterVendor] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterPayMethod, setFilterPayMethod] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  // Debounced search — only fires fetchHistory 350ms after user stops typing
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchDebounceRef = useRef(null);
  const handleFilterSearchChange = useCallback((value) => {
    setFilterSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 350);
  }, []);

  /* ── current PO ── */
  const [po, setPo] = useState(blankPO());
  const [warehouseStock, setWarehouseStock] = useState({});
  const [fetchingStock, setFetchingStock] = useState(false);

  const fetchWarehouseStock = useCallback(async (whId) => {
    if (!whId) {
      setWarehouseStock({});
      return;
    }
    setFetchingStock(true);
    try {
      const resp = await api.get(`/api/v1/inventory/stock-overview/${whId}`);
      if (resp.data.success) {
        const stockMap = {};
        (resp.data.data || []).forEach(item => {
          const qty = item.currentQuantity !== undefined ? Number(item.currentQuantity) : (Number(item.currentStock) || 0);
          stockMap[item.productId] = (stockMap[item.productId] || 0) + qty;
        });
        setWarehouseStock(stockMap);
      }
    } catch {
      /* silent fallback */
    } finally {
      setFetchingStock(false);
    }
  }, []);

  useEffect(() => {
    fetchWarehouseStock(po.warehouseId);
  }, [po.warehouseId, fetchWarehouseStock]);

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
      const r = await api.get('/api/v1/purchase/orders/drafts');
      if (r.data.success) setDrafts(r.data.data || []);
    } catch { /* silent */ }
  }, []);

  const fetchHistory = useCallback(async (pageNum = 0) => {
    setHistoryLoading(true);
    try {
      const fromUtc = fromDate ? businessTimeToUtc(fromDate, timezone) : null;
      const toUtc = toDate ? businessTimeToUtc(toDate, timezone) : null;
      const params = {
        status: filterStatus === 'ALL' ? null : filterStatus,
        vendorId: filterVendor || null,
        warehouseId: filterWarehouse || null,
        paymentMethod: filterPayMethod || null,
        searchTerm: debouncedSearch || null,
        fromDate: fromUtc,
        toDate: toUtc,
        page: pageNum,
        size: historyPage.size || 20
      };
      const r = await api.get('/api/v1/purchase/orders', { params });
      if (r.data.success) {
        const payload = r.data.data || {};
        setHistory(payload.content || []);
        setHistoryPage({
          number: payload.number || 0,
          size: payload.size || historyPage.size || 20,
          totalPages: payload.totalPages || 0,
          totalElements: payload.totalElements || 0,
        });
      }
    } catch { toast('Failed to load history', 'error'); }
    finally { setHistoryLoading(false); }
  }, [filterStatus, filterVendor, filterWarehouse, filterPayMethod, debouncedSearch, fromDate, toDate, timezone, historyPage.size, toast]);

  /* ── load master data ── */
  useEffect(() => {
    const load = async () => {
      try {
        const currentOrgId = orgId || (typeof window !== 'undefined' ? (require('js-cookie').default.get('orgId') || '') : '');
        const isSuperAdmin = userRole === 'SUPER_ADMIN';
        const params = currentOrgId ? { orgId: currentOrgId } : {};

        const [vR, wR, pR, ptR] = await Promise.all([
          api.get('/api/v1/purchasing/vendors', { params }),
          api.get('/api/v1/warehouses', { params }),
          api.get('/api/v1/products', { params }),
          api.get('/api/v1/payment-types', { params: { ...params, applicableFor: 'PURCHASES' } }).catch(() => ({ data: { data: [] } })),
        ]);

        const rawVendors = vR.data.success ? vR.data.data || [] : [];
        const rawWarehouses = wR.data.success ? wR.data.data || [] : [];

        const filteredVendors = rawVendors.filter((v) => {
          if (!currentOrgId || isSuperAdmin) return true;
          const vOrg = String(v.organizationId || v.organization_id || v.orgId || v.org_id || '');
          return !vOrg || String(vOrg) === String(currentOrgId);
        });

        const filteredWarehouses = rawWarehouses.filter((w) => {
          if (!currentOrgId || isSuperAdmin) return true;
          const wOrg = String(w.organizationId || w.organization_id || w.orgId || w.org_id || '');
          return !wOrg || String(wOrg) === String(currentOrgId);
        });

        setVendors(filteredVendors);
        setWarehouses(filteredWarehouses);
        if (filteredWarehouses.length > 0) {
          const defaultWh = filteredWarehouses.find(w => w.isDefault) || filteredWarehouses[0];
          if (defaultWh) {
            setPo(p => ({ ...p, warehouseId: p.warehouseId || defaultWh.id }));
          }
        }
        setProducts(  pR.data.success
          ? (pR.data.data || []).filter(p => p.isactive !== 'N' && p.isActive !== false && !p.hasIngredients)
          : []);

        if (ptR?.data?.success && ptR.data.data) {
          setPaymentTypes(ptR.data.data);
        }
      } catch {
        toast('Failed to load data — please refresh', 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
    fetchDrafts();
  }, [fetchDrafts, toast, orgId, userRole]);

  useEffect(() => {
    if (view === 'history' && fromDate) fetchHistory();
  }, [view, fromDate, toDate, filterStatus, filterVendor, filterWarehouse, filterPayMethod, debouncedSearch, fetchHistory]);

  /* ── product actions ── */
  const addProduct = useCallback((product, selectedVariant = null) => {
    const variantId = selectedVariant ? selectedVariant.id : null;
    const variantLabel = selectedVariant ? selectedVariant.label : null;

    const existingLine = po.lines.find(l => 
      String(l.productId) === String(product.id) && 
      (variantId ? String(l.variantId) === String(variantId) : !l.variantId)
    );

    if (existingLine) {
      toast(`${product.name}${variantLabel ? ` (${variantLabel})` : ''} is already in the list`, 'error');
      return;
    }

    let initialUnitPrice = 0;
    if (selectedVariant && selectedVariant.costPrice !== undefined && selectedVariant.costPrice !== null && Number(selectedVariant.costPrice) > 0) {
      // Use variant-specific purchase cost price
      initialUnitPrice = Number(selectedVariant.costPrice);
    } else if (product.costPrice !== undefined && product.costPrice !== null && Number(product.costPrice) > 0) {
      // Use base product purchase cost price
      initialUnitPrice = Number(product.costPrice);
    }
    // Do NOT fall back to sale price (product.price / overridePrice) — leave 0 so user fills it in

    const displayName = variantLabel ? `${product.name} (${variantLabel})` : product.name;

    const line = recalcLine({
      productId:      product.id,
      variantId:      variantId,
      productName:    displayName,
      productCode:    product.productCode || '',
      categoryName:   product.categoryName || '',
      unitOfMeasure:  product.uomName || 'units',
      quantity:       1,
      unitPrice:      initialUnitPrice,
      taxRate:        product.taxRate || 0,
      discountAmount: 0,
      taxAmount:      0,
      lineTotal:      initialUnitPrice,
    });
    const lines = [line, ...po.lines];
    setPo(p => ({ ...p, lines, ...calcTotals(lines) }));
    setProductSearch('');
    setShowSuggestions(false);
    setErrors(prev => {
      const next = { ...prev };
      delete next.lines;
      return next;
    });
  }, [po.lines, recalcLine, calcTotals, setErrors]);

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
  const validate = useCallback((paymentMethodOverride = null) => {
    const e = {};
    if (!po.vendorId) e.vendorId = 'Please select a vendor / supplier';
    if (!po.warehouseId) e.warehouseId = 'Please select a receiving warehouse';
    if (!po.lines || !po.lines.length) e.lines = 'Cart is empty. Please add at least one product.';
    const effectivePaymentMethod = paymentMethodOverride ?? po.paymentMethod;
    if (!effectivePaymentMethod) e.paymentMethod = 'Cannot complete purchase order: Payment type not set in payment type master for purchase';
    setErrors(e);

    if (Object.keys(e).length > 0) {
      const missing = [];
      if (e.vendorId) missing.push('Vendor');
      if (e.warehouseId) missing.push('Warehouse');
      if (e.lines) missing.push('Products in Cart');
      if (e.paymentMethod) missing.push('Payment Method');

      if (e.lines && missing.length === 1) {
        toast('No products in cart! Please add at least one product before continuing.', 'error');
      } else {
        toast(`Please fill all mandatory fields: ${missing.join(', ')}`, 'error');
      }
      return false;
    }
    return true;
  }, [po.vendorId, po.warehouseId, po.lines, po.paymentMethod, setErrors, toast]);

  /* ── save ── */
  const handleSave = useCallback(async (targetStatus, paymentOverride = null) => {
    // paymentOverride = { paymentMethod, paymentStatus, paymentSplits? } from PurchasePaymentPopup
    const effectivePaymentMethod = paymentOverride?.paymentMethod ?? po.paymentMethod;
    const effectivePaymentStatus = paymentOverride?.paymentStatus ?? po.paymentStatus;
    const effectivePaymentSplits = paymentOverride?.paymentSplits ?? null;

    if (targetStatus !== 'DRAFT') {
      if (!effectivePaymentMethod) {
        setErrors(prev => ({
          ...prev,
          paymentMethod: 'Cannot complete purchase order: Payment type not set in payment type master for purchase'
        }));
        toast('Cannot complete purchase order: Payment type not set in payment type master for purchase', 'error');
        return;
      }
      if (!validate(effectivePaymentMethod)) {
        return;
      }
    }
    if (targetStatus === 'DRAFT') {
      if (!po.vendorId && !po.warehouseId && (!po.lines || !po.lines.length)) {
        toast('Nothing to save yet. Please fill mandatory fields: Vendor, Warehouse, or Products.', 'error');
        return;
      }
    }
    setSaving(true);
    try {
      const activeOrg = typeof window !== 'undefined' ? localStorage.getItem('pos_org_id') : null;
      const payload = {
        orderType: 'PURCHASE',
        orgId: activeOrg || null,
        orderStatus: targetStatus,
        isReceived: targetStatus === 'COMPLETED' || Boolean(po.isReceived),
        paymentStatus: effectivePaymentStatus || 'PENDING',
        paymentMethod: effectivePaymentMethod || null,
        paymentSplits: effectivePaymentSplits || null,
        vendorId: po.vendorId || null,
        warehouseId: po.warehouseId || null,
        orderDate: po.orderDate ? new Date(po.orderDate).toISOString() : new Date().toISOString(),
        expectedDate: po.expectedDate && !isNaN(new Date(po.expectedDate).getTime()) ? new Date(po.expectedDate).toISOString() : null,
        reference: po.reference || null,
        description: po.description || null,
        totalAmount: parseFloat(po.totalAmount) || 0,
        totalTaxAmount: parseFloat(po.totalTaxAmount) || 0,
        grandTotal: parseFloat(po.grandTotal) || 0,
        lines: po.lines.map((l) => ({
          productId: l.productId || l.id || null,
          variantId: l.variantId || null,
          productName: l.productName || l.name || '',
          quantity: parseFloat(l.quantity) || 1,
          unitPrice: parseFloat(l.unitPrice) || 0,
          unitOfMeasure: l.unitOfMeasure || 'units',
          taxRate: parseFloat(l.taxRate) || 0,
          taxAmount: parseFloat(l.taxAmount) || 0,
          discountAmount: parseFloat(l.discountAmount) || 0,
          lineTotal: parseFloat(l.lineTotal) || 0,
        })),
      };
      const idempotencyKey = po.sourceLocalRef || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `po_${Date.now()}`);
      payload.sourceLocalRef = idempotencyKey;

      const resp = po.id
        ? await api.patch(`/api/v1/purchase/orders/${po.id}`, payload)
        : await api.post('/api/v1/purchase/orders', payload, {
            headers: { 'Idempotency-Key': idempotencyKey }
          });

      if (resp.data.success) {
        const msg =
          targetStatus === 'COMPLETED' ? '✅ Order received — stock updated!' :
          targetStatus === 'CANCELLED' ? 'Order has been cancelled' :
          targetStatus === 'CONFIRMED' ? '📦 Order confirmed!' :
          '💾 Draft saved successfully!';
        toast(msg, 'success');
        setPo(blankPO());
        setStep(1);
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

  /* ── load draft / edit order ── */
  const loadDraft = useCallback(async (d) => {
    let fullOrder = d;
    const orderId = d.id || d.orderId;
    if (orderId && (!d.lines || !Array.isArray(d.lines) || d.lines.length === 0)) {
      try {
        const res = await api.get(`/api/v1/purchase/orders/${orderId}`);
        if (res.data?.data) {
          fullOrder = res.data.data;
        }
      } catch (err) {
        console.warn('Could not fetch full PO lines for editing:', err);
      }
    }

    const rawLines = fullOrder.lines || [];
    const loadedLines = rawLines.map(l => {
      const pId = l.productId || l.id;
      const prod = products.find(p => String(p.id) === String(pId));
      return recalcLine({
        productId:      pId,
        variantId:      l.variantId || null,
        productName:    l.productName || prod?.name || 'Unknown Item',
        productCode:    l.productCode || prod?.productCode || '',
        categoryName:   l.categoryName || prod?.categoryName || '',
        unitOfMeasure:  l.unitOfMeasure || prod?.unitOfMeasure || 'units',
        quantity:       parseFloat(l.quantity) || 1,
        unitPrice:      parseFloat(l.unitPrice ?? l.price ?? 0),
        taxRate:        parseFloat(l.taxRate ?? 0),
        discountAmount: parseFloat(l.discountAmount ?? 0),
        taxAmount:      parseFloat(l.taxAmount ?? 0),
        lineTotal:      parseFloat(l.lineTotal ?? 0),
      });
    });

    const isCredit = (fullOrder.paymentMethod || '').toUpperCase() === 'CREDIT' || (fullOrder.paymentStatus || '').toUpperCase() === 'PENDING';
    const effectivePaymentMethod = fullOrder.paymentMethod ? fullOrder.paymentMethod.toUpperCase() : (isCredit ? 'CREDIT' : '');
    const effectivePaymentStatus = fullOrder.paymentStatus ? fullOrder.paymentStatus.toUpperCase() : (isCredit ? 'PENDING' : 'PAID');

    setPo({
      id:            fullOrder.id,
      orderNo:       fullOrder.orderNo,
      orderType:     'PURCHASE',
      orderStatus:   fullOrder.orderStatus || 'DRAFT',
      isReceived:    Boolean(fullOrder.isReceived),
      paymentStatus: effectivePaymentStatus,
      paymentMethod: effectivePaymentMethod,
      vendorId:      fullOrder.vendorId ? String(fullOrder.vendorId) : '',
      warehouseId:   fullOrder.warehouseId ? String(fullOrder.warehouseId) : '',
      orderDate:     fullOrder.orderDate ? String(fullOrder.orderDate).slice(0, 16) : new Date().toISOString().slice(0, 16),
      reference:     fullOrder.reference || fullOrder.referenceNo || '',
      description:   fullOrder.description || '',
      lines:         loadedLines,
      totalAmount:    parseFloat(fullOrder.totalAmount || 0),
      totalTaxAmount: parseFloat(fullOrder.totalTaxAmount || 0),
      grandTotal:     parseFloat(fullOrder.grandTotal || 0),
    });

    setShowDraftModal(false);
    setErrors({});
    setView('form');
    setStep(1);
    toast(`Loaded order ${fullOrder.orderNo || ''}`, 'success');
  }, [products, recalcLine, setView, toast]);

  const startFresh = useCallback(() => {
    setPo(blankPO());
    setErrors({});
    setStep(1);
    toast('Cleared all', 'success');
  }, [toast]);

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

  const payMethodOptions = useMemo(() => {
    let list = [];
    if (!paymentTypes || paymentTypes.length === 0) {
      list = [
        { value: 'CASH', label: 'Cash', paymentType: 'CASH' },
        { value: 'BANK_TRANSFER', label: 'Bank Transfer', paymentType: 'BANK_TRANSFER' },
        { value: 'UPI', label: 'UPI / Digital', paymentType: 'UPI' },
        { value: 'CARD', label: 'Card', paymentType: 'CARD' },
        { value: 'CHEQUE', label: 'Cheque', paymentType: 'CHEQUE' },
        { value: 'CREDIT', label: 'Credit', paymentType: 'CREDIT' }
      ];
    } else {
      list = paymentTypes
        .filter(pt => {
          const act = pt.isActive ?? pt.isactive ?? 'Y';
          const isPur = pt.purchase === 'Y' || (Array.isArray(pt.applicableFor) ? pt.applicableFor.includes('PURCHASES') : pt.applicableFor === 'PURCHASES');
          return act === 'Y' && isPur !== false;
        })
        .map(pt => ({
          value: (pt.paymentType || '').toUpperCase() === 'CREDIT' ? 'CREDIT' : (pt.displayName ? pt.displayName.toUpperCase().replace(/\s+/g, '_') : (pt.paymentType || 'OTHERS')),
          label: pt.displayName || pt.paymentType,
          paymentType: pt.paymentType
        }));
    }

    if (!list.some(opt => opt.value === 'CREDIT' || opt.paymentType === 'CREDIT')) {
      list.push({ value: 'CREDIT', label: 'Credit', paymentType: 'CREDIT' });
    }
    return list;
  }, [paymentTypes]);

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
    paymentTypes,
    payMethodOptions,
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
    historyPage,
    setHistoryPage,
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
    filterSearch,
    setFilterSearch,
    handleFilterSearchChange,
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
    warehouseStock,
    fetchingStock,
    STATUS_CFG
  };
}
