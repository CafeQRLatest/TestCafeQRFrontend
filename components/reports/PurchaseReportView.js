import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useCurrencyDecimals } from '../../hooks/useCurrencyConfig';
import { useRouter } from 'next/router';
import api from '../../utils/api';
import NiceSelect from '../NiceSelect';
import { useNotification } from '../../context/NotificationContext';
import { formatTzDate, businessTimeToUtc } from '../../utils/timezoneUtils';
import {
  FaChartBar, FaBoxes, FaBuilding, FaCreditCard, FaReceipt,
  FaFileCsv, FaFileExcel, FaSearch, FaPlus, FaShoppingBag, FaClock,
  FaChartLine, FaFileInvoice, FaMoneyBillWave, FaWallet, FaMobileAlt
} from 'react-icons/fa';

const REPORT_TIMEOUT_MS = 30000;

const PURCHASE_TABS = [
  { key: 'purch_summary', label: 'Overview', icon: <FaChartBar /> },
  { key: 'purch_orders', label: 'Purchase Orders', icon: <FaReceipt /> },
  { key: 'purch_items', label: 'Items Bought', icon: <FaBoxes /> },
  { key: 'purch_vendors', label: 'Suppliers', icon: <FaBuilding /> },
  { key: 'purch_payments', label: 'Payments Made', icon: <FaCreditCard /> },
];

export default function PurchaseReportView({
  dateFrom,
  dateTo,
  selectedOrgId,
  selectedTerminalId,
  config,
  isSuperAdmin,
  timezone,
  SYM = '',
  setViewingDoc: propSetViewingDoc,
  onViewDoc,
  viewDocument
}) {
  const currencyDecimals = useCurrencyDecimals();
  const router = useRouter();
  const { notify } = useNotification();
  const setViewingDoc = (doc) => {
    if (onViewDoc) {
      onViewDoc(doc.order || doc, doc.type || 'order');
    } else if (viewDocument) {
      viewDocument(doc.order || doc, doc.type || 'order');
    } else if (propSetViewingDoc) {
      propSetViewingDoc(doc);
    }
  };
  const [subTab, setSubTab] = useState('purch_summary');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Data states
  const [purchSummary, setPurchSummary] = useState(null);
  const [purchOrders, setPurchOrders] = useState([]);
  const [purchItems, setPurchItems] = useState([]);
  const [purchVendors, setPurchVendors] = useState([]);
  const [purchPayments, setPurchPayments] = useState([]);

  // Sub-tab filters
  const [purchStatusFilter, setPurchStatusFilter] = useState('ALL');
  const [purchSearchTerm, setPurchSearchTerm] = useState('');
  const [purchPage, setPurchPage] = useState(0);

  const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals });
  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const formatReportDate = (val) => formatTzDate(val, timezone || 'Asia/Kolkata', { format: 'short' });

  const toInstant = (dtLocal, isEnd = false) => {
    if (!dtLocal) return undefined;
    const val = isEnd && dtLocal.length === 16 ? `${dtLocal}:59` : dtLocal;
    try { return businessTimeToUtc(val, timezone); } catch { return undefined; }
  };

  // Each load gets a sequence number; responses from superseded loads (e.g. an older date range
  // that resolves after a newer one) are dropped so the table always matches the current filters.
  const loadSeqRef = useRef(0);

  const loadSubTab = useCallback(async (tabKey) => {
    const seq = ++loadSeqRef.current;
    const isCurrent = () => seq === loadSeqRef.current;
    setLoading(true);
    setLoadError(null);
    const fromVal = toInstant(dateFrom);
    const toVal = toInstant(dateTo, true);
    const params = { from: fromVal, to: toVal, fromDate: fromVal, toDate: toVal };
    if (selectedOrgId) {
      params.orgId = selectedOrgId;
      params.branchId = selectedOrgId;
    }
    if (selectedTerminalId) {
      params.terminalId = selectedTerminalId;
    }

    try {
      if (tabKey === 'purch_summary') {
        const res = await api.get('/api/v1/purchase/orders/reports/summary', { params, timeout: REPORT_TIMEOUT_MS });
        if (isCurrent() && res.data?.success) setPurchSummary(res.data.data || null);
        return;
      }
      if (tabKey === 'purch_orders') {
        const p = {
          ...params,
          size: 200,
          page: purchPage,
          status: purchStatusFilter !== 'ALL' ? purchStatusFilter : undefined
          // Search is applied client-side (PO no. + vendor name); sending it to the server
          // refetched on every keystroke and the server only matches PO no./reference.
        };
        const res = await api.get('/api/v1/purchase/orders', { params: p, timeout: REPORT_TIMEOUT_MS });
        if (isCurrent() && res.data?.success) setPurchOrders(res.data.data?.content || res.data.data || []);
        return;
      }
      if (tabKey === 'purch_items') {
        const res = await api.get('/api/v1/purchase/orders/reports/item-wise', { params, timeout: REPORT_TIMEOUT_MS });
        if (isCurrent() && res.data?.success) setPurchItems(res.data.data || []);
        return;
      }
      if (tabKey === 'purch_vendors') {
        const res = await api.get('/api/v1/purchase/orders/reports/vendor-wise', { params, timeout: REPORT_TIMEOUT_MS });
        if (isCurrent() && res.data?.success) setPurchVendors(res.data.data || []);
        return;
      }
      if (tabKey === 'purch_payments') {
        const res = await api.get('/api/v1/purchase/orders/reports/payment-breakdown', { params, timeout: REPORT_TIMEOUT_MS });
        if (isCurrent() && res.data?.success) setPurchPayments(res.data.data || []);
        return;
      }
    } catch (err) {
      if (!isCurrent()) return;
      console.error('Purchase report error:', err);
      const msg = err?.response?.data?.message || 'Failed to load procurement report';
      setLoadError(msg);
      notify('error', msg);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [dateFrom, dateTo, purchPage, purchStatusFilter, selectedOrgId, selectedTerminalId, timezone, notify]);

  useEffect(() => {
    loadSubTab(subTab);
  }, [subTab, loadSubTab]);

  const exportCSV = (headers, rows, filename) => {
    if (!rows.length) return notify('error', 'No data to export');
    const csv = [headers.join(','), ...rows].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const exportExcel = async (data, sheetName, filename) => {
    if (!data.length) return notify('error', 'No data');
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      notify('error', 'Excel export failed');
    }
  };

  // ── India GST purchase register (line-level, for GSTR-2B reconciliation / ITC) ──
  const [gstExporting, setGstExporting] = useState(null); // null | 'csv' | 'excel'

  const fetchGstRegister = async () => {
    const fromVal = toInstant(dateFrom);
    const toVal = toInstant(dateTo, true);
    const params = { from: fromVal, to: toVal };
    if (selectedOrgId) params.orgId = selectedOrgId;
    const res = await api.get('/api/v1/purchase/orders/reports/gst-register', { params });
    if (!res.data?.success) throw new Error(res.data?.message || 'Failed to load GST register');
    return res.data.data || [];
  };

  const gstDate = (val) => formatTzDate(val, timezone || 'Asia/Kolkata', { format: 'date' });
  const num = (v) => (v === null || v === undefined || v === '' ? '' : Number(v));

  const GST_LINE_COLUMNS = [
    ['Supplier GSTIN', r => r.supplierGstin || ''],
    ['Supplier Name', r => r.supplierName || ''],
    ['Registration Type', r => r.supplierRegistrationType],
    ['Supplier State Code', r => r.supplierStateCode || ''],
    ['Supplier State', r => r.supplierState || ''],
    ['Supplier Invoice No', r => r.supplierInvoiceNo || ''],
    ['Invoice Date', r => gstDate(r.invoiceDate)],
    ['PO / Bill No', r => r.orderNo || ''],
    ['Invoice Type', r => r.invoiceType],
    ['Invoice Value', r => num(r.invoiceValue)],
    ['Place of Supply', r => r.placeOfSupply || ''],
    ['Supply Type', r => (r.supplyType === 'INTER_STATE' ? 'Inter-State' : 'Intra-State')],
    ['Reverse Charge', r => r.reverseCharge],
    ['Branch', r => r.branchName || ''],
    ['Branch GSTIN', r => r.recipientGstin || ''],
    ['Line No', r => r.lineNo],
    ['Item Code', r => r.productCode || ''],
    ['Item Name', r => r.itemName || ''],
    ['Category', r => r.categoryName || ''],
    ['HSN/SAC', r => r.hsnCode || ''],
    ['UQC', r => r.uqc || ''],
    ['Quantity', r => num(r.quantity)],
    ['Rate (Excl. GST)', r => num(r.rateExTax)],
    ['Discount', r => num(r.discountAmount)],
    ['Taxable Value', r => num(r.taxableValue)],
    ['GST Rate %', r => num(r.gstRate)],
    ['IGST Rate %', r => num(r.igstRate)],
    ['IGST Amount', r => num(r.igstAmount)],
    ['CGST Rate %', r => num(r.cgstRate)],
    ['CGST Amount', r => num(r.cgstAmount)],
    ['SGST/UTGST Rate %', r => num(r.sgstRate)],
    ['SGST/UTGST Amount', r => num(r.sgstAmount)],
    ['Cess Amount', r => num(r.cessAmount)],
    ['Total Tax', r => num(r.totalTax)],
    ['Line Total', r => num(r.lineTotal)],
    ['ITC Eligibility', r => r.itcEligibility || ''],
    ['ITC IGST', r => num(r.itcIgst)],
    ['ITC CGST', r => num(r.itcCgst)],
    ['ITC SGST/UTGST', r => num(r.itcSgst)],
    ['ITC Cess', r => num(r.itcCess)],
    ['Payment Status', r => r.paymentStatus || ''],
    ['Remarks', r => r.remarks || ''],
  ];

  const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

  // Invoice × rate rows in GSTR-2 B2B layout
  const buildGstB2B = (rows) => {
    const map = new Map();
    rows.forEach(r => {
      const key = `${r.orderId}|${r.gstRate ?? 0}`;
      if (!map.has(key)) {
        map.set(key, {
          'Supplier GSTIN': r.supplierGstin || '',
          'Supplier Name': r.supplierName || '',
          'Invoice Number': r.supplierInvoiceNo || r.orderNo || '',
          'Invoice Date': gstDate(r.invoiceDate),
          'Invoice Value': num(r.invoiceValue),
          'Place Of Supply': r.placeOfSupply || '',
          'Reverse Charge': r.reverseCharge,
          'Invoice Type': r.invoiceType,
          'Rate': num(r.gstRate),
          'Taxable Value': 0,
          'Integrated Tax Paid': 0,
          'Central Tax Paid': 0,
          'State/UT Tax Paid': 0,
          'Cess Paid': 0,
          'Eligibility For ITC': r.itcEligibility || '',
          'Availed ITC Integrated Tax': 0,
          'Availed ITC Central Tax': 0,
          'Availed ITC State/UT Tax': 0,
          'Availed ITC Cess': 0,
        });
      }
      const g = map.get(key);
      g['Taxable Value'] = round2(g['Taxable Value'] + Number(r.taxableValue || 0));
      g['Integrated Tax Paid'] = round2(g['Integrated Tax Paid'] + Number(r.igstAmount || 0));
      g['Central Tax Paid'] = round2(g['Central Tax Paid'] + Number(r.cgstAmount || 0));
      g['State/UT Tax Paid'] = round2(g['State/UT Tax Paid'] + Number(r.sgstAmount || 0));
      g['Cess Paid'] = round2(g['Cess Paid'] + Number(r.cessAmount || 0));
      g['Availed ITC Integrated Tax'] = round2(g['Availed ITC Integrated Tax'] + Number(r.itcIgst || 0));
      g['Availed ITC Central Tax'] = round2(g['Availed ITC Central Tax'] + Number(r.itcCgst || 0));
      g['Availed ITC State/UT Tax'] = round2(g['Availed ITC State/UT Tax'] + Number(r.itcSgst || 0));
      g['Availed ITC Cess'] = round2(g['Availed ITC Cess'] + Number(r.itcCess || 0));
    });
    return [...map.values()];
  };

  // HSN-wise summary of inward supplies
  const buildGstHsn = (rows) => {
    const map = new Map();
    rows.filter(r => r.lineNo > 0).forEach(r => {
      const key = `${r.hsnCode || ''}|${r.uqc || ''}|${r.gstRate ?? 0}`;
      if (!map.has(key)) {
        map.set(key, {
          'HSN/SAC': r.hsnCode || '(missing)',
          'Description': r.itemName || '',
          'UQC': r.uqc || '',
          'Total Quantity': 0,
          'Total Value': 0,
          'Rate': num(r.gstRate),
          'Taxable Value': 0,
          'Integrated Tax Amount': 0,
          'Central Tax Amount': 0,
          'State/UT Tax Amount': 0,
          'Cess Amount': 0,
        });
      }
      const g = map.get(key);
      g['Total Quantity'] = Math.round((g['Total Quantity'] + Number(r.quantity || 0)) * 1000) / 1000;
      g['Total Value'] = round2(g['Total Value'] + Number(r.lineTotal || 0));
      g['Taxable Value'] = round2(g['Taxable Value'] + Number(r.taxableValue || 0));
      g['Integrated Tax Amount'] = round2(g['Integrated Tax Amount'] + Number(r.igstAmount || 0));
      g['Central Tax Amount'] = round2(g['Central Tax Amount'] + Number(r.cgstAmount || 0));
      g['State/UT Tax Amount'] = round2(g['State/UT Tax Amount'] + Number(r.sgstAmount || 0));
      g['Cess Amount'] = round2(g['Cess Amount'] + Number(r.cessAmount || 0));
    });
    return [...map.values()].sort((a, b) => String(a['HSN/SAC']).localeCompare(String(b['HSN/SAC'])));
  };

  const gstPeriodSuffix = () => `${(dateFrom || '').slice(0, 10)}_to_${(dateTo || '').slice(0, 10)}`;

  const exportGstCSV = async () => {
    setGstExporting('csv');
    try {
      const rows = await fetchGstRegister();
      if (!rows.length) return notify('error', 'No purchases to export in this period (draft, void and cancelled purchases are excluded from GST)');
      const headers = GST_LINE_COLUMNS.map(([h]) => csvCell(h));
      const body = rows.map(r => GST_LINE_COLUMNS.map(([, fn]) => csvCell(fn(r))).join(','));
      // BOM so Excel opens ₹ / non-ASCII names correctly
      const csv = '﻿' + [headers.join(','), ...body].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `purchase_gst_register_${gstPeriodSuffix()}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) {
      notify('error', err?.response?.data?.message || err.message || 'GST export failed');
    } finally {
      setGstExporting(null);
    }
  };

  const exportGstExcel = async () => {
    setGstExporting('excel');
    try {
      const rows = await fetchGstRegister();
      if (!rows.length) return notify('error', 'No purchases to export in this period (draft, void and cancelled purchases are excluded from GST)');
      const XLSX = await import('xlsx');
      const lineData = rows.map(r => Object.fromEntries(GST_LINE_COLUMNS.map(([h, fn]) => [h, fn(r)])));
      const b2b = buildGstB2B(rows);
      const hsn = buildGstHsn(rows);
      const issues = rows.filter(r => r.remarks).map(r => ({
        'PO / Bill No': r.orderNo, 'Supplier Invoice No': r.supplierInvoiceNo || '',
        'Supplier': r.supplierName || '', 'Line No': r.lineNo, 'Item Name': r.itemName || '', 'Issue': r.remarks,
      }));

      const wb = XLSX.utils.book_new();
      const addSheet = (data, name, widths) => {
        const ws = XLSX.utils.json_to_sheet(data);
        if (widths) ws['!cols'] = widths.map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, name);
      };
      addSheet(lineData, 'Purchase Register', GST_LINE_COLUMNS.map(([h]) => Math.max(12, h.length + 2)));
      addSheet(b2b, 'B2B Invoices');
      addSheet(hsn, 'HSN Summary');
      if (issues.length) addSheet(issues, 'Data Issues', [14, 18, 24, 8, 28, 60]);
      XLSX.writeFile(wb, `purchase_gst_register_${gstPeriodSuffix()}.xlsx`);
    } catch (err) {
      notify('error', err?.response?.data?.message || err.message || 'GST Excel export failed');
    } finally {
      setGstExporting(null);
    }
  };

  // Render Sub Tabs
  const renderSummary = () => {
    if (!purchSummary && !loading) return <div className="rpt-purch-empty">No purchase data for selected range</div>;
    const totalPurch = Number(purchSummary?.totalPurchases || 0);
    const totalPaid = Number(purchSummary?.totalPaid || 0);
    const totalDue = Number(purchSummary?.totalUnpaid || 0);
    const totalTax = Number(purchSummary?.totalTax || 0);
    const avgOrderVal = Number(purchSummary?.averageOrderValue || 0);
    const totalOrders = Number(purchSummary?.totalOrders || 0);

    // Tax name comes from the tenant's config (GST in India, VAT in SA/UAE/KSA, …), never hard-coded.
    const taxName = config?.tax_label_global || config?.taxLabelGlobal || 'Tax';
    const paidPct = totalPurch > 0 ? Math.min(100, Math.round((totalPaid / totalPurch) * 100)) : 0;

    const cards = [
      { label: 'Total Purchases', hint: 'Value of all orders, excluding cancelled', val: `${SYM}${fmt(totalPurch)}`, color: '#f97316', bg: '#fff7ed', icon: <FaShoppingBag /> },
      { label: 'Paid to Suppliers', hint: 'Amount already paid', val: `${SYM}${fmt(totalPaid)}`, color: '#10b981', bg: '#ecfdf5', icon: <FaReceipt /> },
      { label: 'Still to Pay', hint: 'Amount you owe suppliers', val: `${SYM}${fmt(totalDue)}`, color: '#ef4444', bg: '#fef2f2', icon: <FaClock /> },
      { label: 'Number of Orders', hint: 'Purchase orders in this period', val: totalOrders, color: '#3b82f6', bg: '#eff6ff', icon: <FaBoxes /> },
      { label: 'Average Order', hint: 'Typical value of one order', val: `${SYM}${fmt(avgOrderVal)}`, color: '#8b5cf6', bg: '#f5f3ff', icon: <FaChartLine /> },
      (config?.taxEnabled !== false) && { label: `${taxName} Paid on Purchases`, hint: 'Tax included in your purchases', val: `${SYM}${fmt(totalTax)}`, color: '#0ea5e9', bg: '#f0f9ff', icon: <FaFileInvoice /> },
    ].filter(Boolean);

    const statusCounts = purchSummary?.statusCounts || {};
    const paymentCounts = purchSummary?.paymentStatusCounts || {};

    const ORDER_STATUS = {
      DRAFT: { label: 'Draft', color: '#94a3b8' },
      CONFIRMED: { label: 'Ordered, not received', color: '#f59e0b' },
      COMPLETED: { label: 'Received', color: '#10b981' },
      VOID: { label: 'Cancelled', color: '#ef4444' },
      CANCELLED: { label: 'Cancelled', color: '#ef4444' },
    };
    const PAY_STATUS = {
      PAID: { label: 'Paid', color: '#10b981' },
      PARTIAL: { label: 'Partly paid', color: '#f59e0b' },
      PENDING: { label: 'Not paid yet', color: '#ef4444' },
      UNPAID: { label: 'Not paid yet', color: '#ef4444' },
    };
    const titleCase = (s) => String(s).toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
    // Merge statuses that share a friendly label (e.g. VOID + CANCELLED) and size bars by share.
    const toRows = (counts, map) => {
      const merged = {};
      Object.entries(counts).forEach(([st, cnt]) => {
        const m = map[String(st).toUpperCase()] || { label: titleCase(st), color: '#64748b' };
        merged[m.label] = { ...m, count: (merged[m.label]?.count || 0) + Number(cnt || 0) };
      });
      const rows = Object.values(merged).sort((a, b) => b.count - a.count);
      const total = rows.reduce((s, r) => s + r.count, 0);
      return rows.map(r => ({ ...r, pct: total > 0 ? Math.round((r.count / total) * 100) : 0 }));
    };
    const orderRows = toRows(statusCounts, ORDER_STATUS);
    const payRows = toRows(paymentCounts, PAY_STATUS);

    const renderBreakdown = (title, subtitle, rows, emptyText) => (
      <div className="rpt-purch-panel">
        <div className="rpt-purch-panel-title">{title}</div>
        <div className="rpt-purch-panel-sub">{subtitle}</div>
        {rows.length === 0 && <span className="rpt-purch-dim">{emptyText}</span>}
        {rows.map(r => (
          <div key={r.label} className="rpt-purch-brow">
            <span className="rpt-purch-brow-dot" style={{ background: r.color }} />
            <span className="rpt-purch-brow-label">{r.label}</span>
            <span className="rpt-purch-brow-bar"><span style={{ width: `${r.pct}%`, background: r.color }} /></span>
            <span className="rpt-purch-brow-count">{r.count} {r.count === 1 ? 'order' : 'orders'}</span>
          </div>
        ))}
      </div>
    );

    return (
      <>
        <div className="rpt-purch-toolbar">
          <button className="rpt-purch-btn" onClick={() => exportCSV(
            ['Metric', 'Value'],
            [
              ['Total Purchases', totalPurch],
              ['Paid to Suppliers', totalPaid],
              ['Still to Pay', totalDue],
              ['Number of Orders', totalOrders],
              ['Average Order', avgOrderVal],
              [`${taxName} Paid on Purchases`, totalTax]
            ].map(row => row.map(csvCell).join(',')),
            'procurement_summary'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-purch-btn" onClick={() => exportExcel(
            [
              { Metric: 'Total Purchases', Value: totalPurch },
              { Metric: 'Paid to Suppliers', Value: totalPaid },
              { Metric: 'Still to Pay', Value: totalDue },
              { Metric: 'Number of Orders', Value: totalOrders },
              { Metric: 'Average Order', Value: avgOrderVal },
              { Metric: `${taxName} Paid on Purchases`, Value: totalTax }
            ],
            'Purchases Overview', 'purchases_overview'
          )}><FaFileExcel /> Excel</button>
        </div>

        <div className="rpt-purch-kpi-grid">
          {cards.map((c, i) => (
            <div key={i} className="rpt-purch-kpi" style={{ borderTop: `3px solid ${c.color}` }}>
              <div className="rpt-purch-kpi-icon" style={{ background: c.bg, color: c.color }}>{c.icon}</div>
              <div className="rpt-purch-kpi-data">
                <span className="rpt-purch-kpi-label">{c.label}</span>
                <span className="rpt-purch-kpi-val">{c.val}</span>
                <span className="rpt-purch-kpi-hint">{c.hint}</span>
              </div>
            </div>
          ))}
        </div>

        {totalPurch > 0 && (
          <div className="rpt-purch-panel rpt-purch-progress">
            <div className="rpt-purch-progress-head">
              <span className="rpt-purch-panel-title" style={{ margin: 0 }}>How much have you paid?</span>
              <span className="rpt-purch-progress-pct">{paidPct}% paid</span>
            </div>
            <div className="rpt-purch-progress-track">
              <span style={{ width: `${paidPct}%` }} />
            </div>
            <div className="rpt-purch-progress-legend">
              <span><i style={{ background: '#10b981' }} />Paid {SYM}{fmt(totalPaid)}</span>
              <span><i style={{ background: '#fecaca' }} />Still to pay {SYM}{fmt(totalDue)}</span>
            </div>
          </div>
        )}

        <div className="rpt-purch-dist-grid">
          {renderBreakdown('Orders by Status', 'Where your purchase orders are', orderRows, 'No orders in this period')}
          {renderBreakdown('Orders by Payment', 'Which orders are paid', payRows, 'No payments in this period')}
        </div>
      </>
    );
  };

  const renderOrders = () => {
    const filtered = (purchOrders || []).filter(po => {
      const q = purchSearchTerm.toLowerCase().trim();
      const matchSearch = !q || (
        (po.orderNo || '').toLowerCase().includes(q) ||
        (po.vendorName || po.vendor?.name || '').toLowerCase().includes(q)
      );
      const poStatus = (po.orderStatus || po.status || '').toUpperCase();
      // Same rule as the backend: "Cancelled" covers both VOID and CANCELLED.
      const matchStatus = purchStatusFilter === 'ALL'
        || poStatus === purchStatusFilter
        || (purchStatusFilter === 'VOID' && poStatus === 'CANCELLED');
      return matchSearch && matchStatus;
    });

    return (
      <>
        <div className="rpt-purch-toolbar">
          <NiceSelect
            value={purchStatusFilter}
            onChange={setPurchStatusFilter}
            options={[
              // Values must match stored order_status (DRAFT, CONFIRMED, COMPLETED, VOID).
              { value: 'ALL', label: 'All Statuses' },
              { value: 'DRAFT', label: 'Draft' },
              { value: 'CONFIRMED', label: 'Ordered, not received' },
              { value: 'COMPLETED', label: 'Received' },
              { value: 'VOID', label: 'Cancelled' },
            ]}
            style={{ width: 150 }}
          />
          <div style={{ position: 'relative', width: 220 }}>
            <input
              type="text"
              placeholder="Search PO # or Vendor…"
              value={purchSearchTerm}
              onChange={e => setPurchSearchTerm(e.target.value)}
              className="rpt-purch-search-input"
            />
            <FaSearch className="rpt-purch-search-icon" />
          </div>
          <button
            className="rpt-purch-btn"
            disabled={!!gstExporting}
            title="GST purchase register: supplier GSTIN, HSN, UQC, taxable value, CGST/SGST/IGST, ITC"
            onClick={exportGstCSV}
          ><FaFileCsv /> {gstExporting === 'csv' ? 'Preparing…' : 'CSV'}</button>
          <button
            className="rpt-purch-btn"
            disabled={!!gstExporting}
            title="GST workbook: Purchase Register, B2B Invoices (GSTR-2B layout), HSN Summary, Data Issues"
            onClick={exportGstExcel}
          ><FaFileExcel /> {gstExporting === 'excel' ? 'Preparing…' : 'Excel'}</button>
        </div>

        {filtered.length === 0 ? (
          <div className="rpt-purch-empty">No purchase invoices match the search filter</div>
        ) : (
          <div className="rpt-purch-tbl-wrap">
            <table className="rpt-purch-tbl">
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Date</th>
                  <th>Supplier / Vendor</th>
                  <th>Order Status</th>
                  <th>Payment Status</th>
                  <th className="r">Total Amount</th>
                  <th className="r">Amount Due</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((po, idx) => (
                  <tr key={po.id || idx}>
                    <td>
                      <span
                        className="rpt-purch-mono-link"
                        onClick={() => setViewingDoc && setViewingDoc({ order: po, type: 'order' })}
                      >
                        {po.orderNo || `PO-${po.id}`}
                      </span>
                    </td>
                    <td>{formatReportDate(po.orderDate || po.createdAt || po.transactionDate)}</td>
                    <td style={{ fontWeight: 600, color: '#1e293b' }}>{po.vendorName || po.vendor?.name || '—'}</td>
                    <td><span className={`rpt-purch-st ${(po.orderStatus || po.status || '').toLowerCase()}`}>{po.orderStatus || po.status || '—'}</span></td>
                    <td><span className={`rpt-purch-st ${(po.paymentStatus || '').toLowerCase()}`}>{po.paymentStatus || '—'}</span></td>
                    <td className="r rpt-purch-amt">{SYM}{fmt(po.grandTotal ?? po.totalAmount ?? 0)}</td>
                    {(() => {
                      // The list API has no amountDue, so derive it from the payment status.
                      // Cancelled orders owe nothing; partly paid ones need the order's payments for an exact figure.
                      const pay = String(po.paymentStatus || '').toUpperCase();
                      const st = String(po.orderStatus || po.status || '').toUpperCase();
                      const total = Number(po.grandTotal ?? po.totalAmount ?? 0);
                      if (po.amountDue != null) {
                        const due = Number(po.amountDue);
                        return <td className="r" style={{ fontWeight: 700, color: due > 0 ? '#ef4444' : '#10b981' }}>{SYM}{fmt(due)}</td>;
                      }
                      if (pay === 'PARTIAL') {
                        return <td className="r" style={{ fontWeight: 700, color: '#f59e0b' }}>Part paid</td>;
                      }
                      // Nothing is owed on paid, voided/cancelled or draft (not yet placed) orders.
                      const due = (pay === 'PAID' || pay === 'VOID' || st === 'VOID' || st === 'CANCELLED' || st === 'DRAFT') ? 0 : total;
                      return <td className="r" style={{ fontWeight: 700, color: due > 0 ? '#ef4444' : '#10b981' }}>{SYM}{fmt(due)}</td>;
                    })()}
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="rpt-purch-btn"
                        style={{ padding: '4px 8px', fontSize: '10px', display: 'inline-flex' }}
                        onClick={() => setViewingDoc && setViewingDoc({ order: po, type: 'order' })}
                      >
                        <FaReceipt /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  };

  const renderItems = () => {
    const filtered = (purchItems || []).filter(item => {
      const q = purchSearchTerm.toLowerCase().trim();
      return !q || (item.productName || item.itemName || '').toLowerCase().includes(q) ||
        (item.categoryName || '').toLowerCase().includes(q);
    });

    const totalSpend = filtered.reduce((acc, i) => acc + Number(i.totalSpent ?? i.totalSpend ?? 0), 0);
    const totalQty = filtered.reduce((acc, i) => acc + Number(i.totalQuantity || 0), 0);

    return (
      <>
        <div className="rpt-purch-toolbar">
          <div style={{ position: 'relative', width: 240 }}>
            <input
              type="text"
              placeholder="Search Item or Category…"
              value={purchSearchTerm}
              onChange={e => setPurchSearchTerm(e.target.value)}
              className="rpt-purch-search-input"
            />
            <FaSearch className="rpt-purch-search-icon" />
          </div>
          <button className="rpt-purch-btn" onClick={() => exportCSV(
            ['Item Name', 'Category', 'Qty Bought', 'Average Cost', 'Total Cost', 'Orders'],
            filtered.map(item => [
              item.productName || item.itemName,
              item.categoryName || '—',
              item.totalQuantity || 0,
              item.avgUnitCost ?? item.averageUnitCost ?? 0,
              item.totalSpent ?? item.totalSpend ?? 0,
              item.orderCount || 0
            ].map(csvCell).join(',')),
            'item_procurement'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-purch-btn" onClick={() => exportExcel(
            filtered.map(item => ({
              'Item': item.productName || item.itemName,
              'Category': item.categoryName || '—',
              'Qty Bought': Number(item.totalQuantity || 0),
              'Average Cost': Number(item.avgUnitCost ?? item.averageUnitCost ?? 0),
              'Total Cost': Number(item.totalSpent ?? item.totalSpend ?? 0),
              'Orders': Number(item.orderCount || 0)
            })),
            'Item Procurement', 'item_procurement'
          )}><FaFileExcel /> Excel</button>
        </div>

        {filtered.length === 0 ? (
          <div className="rpt-purch-empty">No item procurement data for selected range</div>
        ) : (
          <div className="rpt-purch-tbl-wrap">
            <table className="rpt-purch-tbl">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th className="r">Qty Bought</th>
                  <th className="r">Average Cost</th>
                  <th className="r">Total Cost</th>
                  <th className="r">Orders</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => (
                  <tr key={item.productId || idx}>
                    <td style={{ fontWeight: 700, color: '#1e293b' }}>{item.productName || item.itemName}</td>
                    <td><span className="rpt-purch-pill">{item.categoryName || 'General'}</span></td>
                    <td className="r" style={{ fontWeight: 600 }}>{Number(item.totalQuantity || 0).toLocaleString('en-IN')}</td>
                    <td className="r">{SYM}{fmt(item.avgUnitCost ?? item.averageUnitCost)}</td>
                    <td className="r rpt-purch-amt">{SYM}{fmt(item.totalSpent ?? item.totalSpend)}</td>
                    <td className="r">{item.orderCount || 0}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                  <td colSpan={2}>Total ({filtered.length} items)</td>
                  <td className="r">{totalQty.toLocaleString('en-IN')}</td>
                  <td className="r">—</td>
                  <td className="r rpt-purch-amt" style={{ color: '#f97316' }}>{SYM}{fmt(totalSpend)}</td>
                  <td className="r">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </>
    );
  };

  const renderVendors = () => {
    const filtered = (purchVendors || []).filter(v => {
      const q = purchSearchTerm.toLowerCase().trim();
      return !q || (v.vendorName || '').toLowerCase().includes(q);
    });

    const totalOrders = filtered.reduce((acc, v) => acc + Number(v.orderCount || 0), 0);
    const totalBilled = filtered.reduce((acc, v) => acc + Number(v.totalBilled || 0), 0);
    const totalPaid = filtered.reduce((acc, v) => acc + Number(v.totalPaid || 0), 0);
    const totalDue = filtered.reduce((acc, v) => acc + Number(v.outstandingBalance || 0), 0);

    return (
      <>
        <div className="rpt-purch-toolbar">
          <div style={{ position: 'relative', width: 240 }}>
            <input
              type="text"
              placeholder="Search Vendor Name…"
              value={purchSearchTerm}
              onChange={e => setPurchSearchTerm(e.target.value)}
              className="rpt-purch-search-input"
            />
            <FaSearch className="rpt-purch-search-icon" />
          </div>
          <button className="rpt-purch-btn" onClick={() => exportCSV(
            ['Vendor Name', 'POs Placed', 'Total Billed', 'Total Paid', 'Outstanding Balance'],
            filtered.map(v => [
              v.vendorName,
              v.orderCount || 0,
              v.totalBilled || 0,
              v.totalPaid || 0,
              v.outstandingBalance || 0
            ].map(csvCell).join(',')),
            'vendor_procurement'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-purch-btn" onClick={() => exportExcel(
            filtered.map(v => ({
              'Vendor Name': v.vendorName,
              'POs Placed': Number(v.orderCount || 0),
              'Total Billed': Number(v.totalBilled || 0),
              'Total Paid': Number(v.totalPaid || 0),
              'Outstanding Balance': Number(v.outstandingBalance || 0)
            })),
            'Vendor Procurement', 'vendor_procurement'
          )}><FaFileExcel /> Excel</button>
        </div>

        {filtered.length === 0 ? (
          <div className="rpt-purch-empty">No vendor procurement data for selected range</div>
        ) : (
          <div className="rpt-purch-tbl-wrap">
            <table className="rpt-purch-tbl">
              <thead>
                <tr>
                  <th>Vendor / Supplier</th>
                  <th className="r">Orders Count</th>
                  <th className="r">Total Billed</th>
                  <th className="r">Total Paid</th>
                  <th className="r">Outstanding Balance</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v, idx) => (
                  <tr key={v.vendorId || idx}>
                    <td style={{ fontWeight: 700, color: '#1e293b' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FaBuilding style={{ color: '#94a3b8' }} />
                        <span>{v.vendorName || 'Direct / Cash Supplier'}</span>
                      </div>
                    </td>
                    <td className="r" style={{ fontWeight: 600 }}>{v.orderCount || 0}</td>
                    <td className="r rpt-purch-amt">{SYM}{fmt(v.totalBilled)}</td>
                    <td className="r" style={{ color: '#10b981', fontWeight: 700 }}>{SYM}{fmt(v.totalPaid)}</td>
                    <td className="r" style={{ color: Number(v.outstandingBalance || 0) > 0 ? '#ef4444' : '#64748b', fontWeight: 800 }}>
                      {SYM}{fmt(v.outstandingBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                  <td>Total ({filtered.length} vendors)</td>
                  <td className="r">{totalOrders}</td>
                  <td className="r rpt-purch-amt">{SYM}{fmt(totalBilled)}</td>
                  <td className="r" style={{ color: '#10b981' }}>{SYM}{fmt(totalPaid)}</td>
                  <td className="r" style={{ color: totalDue > 0 ? '#ef4444' : '#10b981' }}>{SYM}{fmt(totalDue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </>
    );
  };

  const renderPayments = () => {
    const rawList = Array.isArray(purchPayments) ? purchPayments : [];
    const payMap = {};
    rawList.forEach(p => {
      const method = String(p.paymentMethod || 'OTHER').toUpperCase();
      const amt = Number(p.totalAmount || 0);
      const count = Number(p.orderCount || 1);
      if (method === 'MIXED') {
        const half = Math.round((amt / 2) * 100) / 100;
        const rem = amt - half;
        if (!payMap['CASH']) payMap['CASH'] = { paymentMethod: 'CASH', totalAmount: 0, orderCount: 0 };
        payMap['CASH'].totalAmount += half;
        payMap['CASH'].orderCount += count;

        if (!payMap['ONLINE']) payMap['ONLINE'] = { paymentMethod: 'ONLINE', totalAmount: 0, orderCount: 0 };
        payMap['ONLINE'].totalAmount += rem;
        payMap['ONLINE'].orderCount += count;
      } else {
        const key = p.paymentMethod || 'OTHER';
        if (!payMap[key]) payMap[key] = { ...p, paymentMethod: key, totalAmount: 0, orderCount: 0 };
        payMap[key].totalAmount += amt;
        payMap[key].orderCount += count;
      }
    });
    const list = Object.values(payMap).sort((a, b) => b.totalAmount - a.totalAmount);
    const totalOutflow = list.reduce((s, p) => s + Number(p.totalAmount || 0), 0);

    return (
      <>
        <div className="rpt-purch-toolbar">
          <button className="rpt-purch-btn" onClick={() => exportCSV(
            ['Payment Method', 'Outflow Amount', 'Transaction Count', 'Share %'],
            list.map(p => {
              const amt = Number(p.totalAmount || 0);
              const share = totalOutflow > 0 ? ((amt / totalOutflow) * 100).toFixed(1) : '0';
              return [p.paymentMethod || 'Other', amt, p.orderCount || 0, `${share}%`].map(csvCell).join(',');
            }),
            'purchase_payment_breakdown'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-purch-btn" onClick={() => exportExcel(
            list.map(p => {
              const amt = Number(p.totalAmount || 0);
              const share = totalOutflow > 0 ? ((amt / totalOutflow) * 100).toFixed(1) : '0';
              return {
                'Payment Method': p.paymentMethod || 'Other',
                'Outflow Amount': amt,
                'Transaction Count': Number(p.orderCount || 0),
                'Share %': `${share}%`
              };
            }),
            'Purchase Payments', 'purchase_payment_breakdown'
          )}><FaFileExcel /> Excel</button>
        </div>

        {list.length === 0 ? (
          <div className="rpt-purch-empty">No payment outflow records for selected range</div>
        ) : (
          <>
            <div className="rpt-purch-pay-grid">
              {list.map((p, i) => {
                const amt = Number(p.totalAmount || 0);
                const pct = totalOutflow > 0 ? Number(((amt / totalOutflow) * 100).toFixed(1)) : 0;
                const avgAmount = p.orderCount > 0 ? amt / p.orderCount : 0;
                const method = String(p.paymentMethod || '').toUpperCase();
                let theme = { color: '#6366f1', bg: '#f5f3ff', grad: 'linear-gradient(135deg, #8b5cf6, #6366f1)', icon: <FaWallet /> };
                if (method.includes('CASH')) {
                  theme = { color: '#10b981', bg: '#ecfdf4', grad: 'linear-gradient(135deg, #10b981, #059669)', icon: <FaMoneyBillWave /> };
                } else if (method.includes('CARD') || method.includes('DEBIT') || method.includes('CREDIT')) {
                  theme = { color: '#3b82f6', bg: '#eff6ff', grad: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', icon: <FaCreditCard /> };
                } else if (method.includes('ONLINE') || method.includes('UPI')) {
                  theme = { color: '#ea580c', bg: '#fff7ed', grad: 'linear-gradient(135deg, #f97316, #ea580c)', icon: <FaMobileAlt /> };
                }

                return (
                  <div key={p.paymentMethod || i} className="rpt-purch-pay-card" style={{ borderTop: `2.5px solid ${theme.color}` }}>
                    <div className="rpt-purch-pay-card-header">
                      <div className="rpt-purch-pay-icon-box" style={{ background: theme.bg, color: theme.color }}>
                        {theme.icon}
                      </div>
                      <div className="rpt-purch-pay-method-info">
                        <span className="rpt-purch-pay-method-name">{p.paymentMethod || 'OTHER'}</span>
                        <span className="rpt-purch-pay-meta">{p.orderCount || 0} txns · {pct}%</span>
                      </div>
                    </div>
                    <div className="rpt-purch-pay-body">
                      <div className="rpt-purch-pay-amt">{SYM}{fmt(amt)}</div>
                      <div className="rpt-purch-pay-avg">Avg: {SYM}{fmt(avgAmount)}</div>
                    </div>
                    <div className="rpt-purch-pay-bar-wrapper">
                      <div className="rpt-purch-pay-bar-fill" style={{ width: `${pct}%`, background: theme.grad }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </>
    );
  };

  // Show the full-page loader only on first load of a tab; afterwards keep the old rows visible.
  const hasTabData = (tabKey) => ({
    purch_summary: !!purchSummary,
    purch_orders: purchOrders.length > 0,
    purch_items: purchItems.length > 0,
    purch_vendors: purchVendors.length > 0,
    purch_payments: purchPayments.length > 0,
  })[tabKey];

  const subTabContent = {
    purch_summary: renderSummary,
    purch_orders: renderOrders,
    purch_items: renderItems,
    purch_vendors: renderVendors,
    purch_payments: renderPayments,
  };

  return (
    <div className="rpt-purch-view">
      <div className="rpt-purch-subtabs">
        {PURCHASE_TABS.map(t => (
          <button
            key={t.key}
            className={`rpt-purch-subtab ${subTab === t.key ? 'active' : ''}`}
            onClick={() => setSubTab(t.key)}
            title={t.label}
          >
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </div>

      {loadError && <div className="rpt-purch-error">{loadError}</div>}

      <div className="rpt-purch-body">
        {loading && !hasTabData(subTab) ? (
          <div className="rpt-purch-loading">Aggregating procurement records…</div>
        ) : (
          <>
            {loading && <div className="rpt-purch-refreshing">Refreshing…</div>}
            {subTabContent[subTab]?.()}
          </>
        )}
      </div>

      <style jsx global>{`
        .rpt-purch-view { width: 100%; display: flex; flex-direction: column; gap: 14px; }
        .rpt-purch-subtabs { display: flex; gap: 4px; overflow-x: auto; padding: 4px 0 10px; -webkit-overflow-scrolling: touch; }
        .rpt-purch-subtab { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 10px; border: 1px solid #e2e8f0; background: #fff; color: #64748b; font-size: 11px; font-weight: 700; cursor: pointer; transition: .2s; white-space: nowrap; }
        .rpt-purch-subtab:hover { border-color: #f97316; color: #f97316; }
        .rpt-purch-subtab.active { background: #f97316; color: #fff; border-color: #f97316; box-shadow: 0 4px 10px rgba(249,115,22,.2); }

        .rpt-purch-toolbar { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; flex-wrap: wrap; }
        .rpt-purch-btn { padding: 8px 14px; border-radius: 10px; border: 1.5px solid #f97316; background: #fff; color: #f97316; font-size: 10px; font-weight: 800; display: flex; align-items: center; gap: 6px; cursor: pointer; transition: .2s; }
        .rpt-purch-btn:hover { background: #fff7ed; transform: translateY(-1px); }

        .rpt-purch-search-input { width: 100%; height: 36px; padding: 6px 12px 6px 30px; border: 1.5px solid #e2e8f0; border-radius: 10px; font-size: 12px; outline: none; }
        .rpt-purch-search-icon { position: absolute; left: 10px; top: 11px; color: #94a3b8; font-size: 11px; }

        .rpt-purch-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
        .rpt-purch-kpi { background: #fff; padding: 14px 16px; border-radius: 12px; border: 1px solid #eef2f7; display: grid; grid-template-areas: "label icon" "value icon" "hint hint"; grid-template-columns: 1fr auto; align-items: center; gap: 4px 10px; min-height: 92px; transition: .2s; }
        .rpt-purch-kpi:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(15,23,42,.05); }
        .rpt-purch-kpi-icon { grid-area: icon; width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 15px; align-self: start; }
        .rpt-purch-kpi-data { display: contents; }
        .rpt-purch-kpi-label { grid-area: label; font-size: 12px; font-weight: 700; color: #475569; }
        .rpt-purch-kpi-val { grid-area: value; font-size: 20px; font-weight: 800; color: #0f172a; font-variant-numeric: tabular-nums; }
        .rpt-purch-kpi-hint { grid-area: hint; font-size: 11px; color: #94a3b8; }

        .rpt-purch-progress { margin-top: 14px; }
        .rpt-purch-progress-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .rpt-purch-progress-pct { font-size: 13px; font-weight: 800; color: #10b981; }
        .rpt-purch-progress-track { height: 10px; border-radius: 999px; background: #fee2e2; overflow: hidden; }
        .rpt-purch-progress-track > span { display: block; height: 100%; background: #10b981; border-radius: 999px; transition: width .4s; }
        .rpt-purch-progress-legend { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 8px; font-size: 12px; color: #475569; font-variant-numeric: tabular-nums; }
        .rpt-purch-progress-legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }

        .rpt-purch-dist-grid { margin-top: 14px; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
        .rpt-purch-panel { background: #fff; border: 1px solid #eef2f7; border-radius: 12px; padding: 16px; }
        .rpt-purch-panel-title { font-size: 13px; font-weight: 800; color: #1e293b; margin-bottom: 2px; }
        .rpt-purch-panel-sub { font-size: 11px; color: #94a3b8; margin-bottom: 12px; }
        .rpt-purch-brow { display: grid; grid-template-columns: 10px minmax(110px, 1fr) 2fr auto; align-items: center; gap: 10px; padding: 6px 0; font-size: 12px; }
        .rpt-purch-brow-dot { width: 8px; height: 8px; border-radius: 50%; }
        .rpt-purch-brow-label { font-weight: 600; color: #334155; }
        .rpt-purch-brow-bar { height: 6px; background: #f1f5f9; border-radius: 999px; overflow: hidden; }
        .rpt-purch-brow-bar > span { display: block; height: 100%; border-radius: 999px; }
        .rpt-purch-brow-count { font-weight: 700; color: #0f172a; white-space: nowrap; font-variant-numeric: tabular-nums; }
        @media (max-width: 480px) { .rpt-purch-brow { grid-template-columns: 10px 1fr auto; } .rpt-purch-brow-bar { display: none; } }
        .rpt-purch-pill-group { display: flex; flex-wrap: wrap; gap: 6px; }
        .rpt-purch-tag { display: flex; align-items: center; gap: 6px; padding: 5px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 11px; }
        .rpt-purch-tag-label { font-weight: 700; color: #334155; }
        .rpt-purch-tag-badge { background: #f97316; color: #fff; border-radius: 999px; padding: 1px 6px; font-size: 9.5px; font-weight: 800; }
        .rpt-purch-dim { color: #94a3b8; font-size: 11px; }

        .rpt-purch-tbl-wrap { background: #fff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: auto; box-shadow: 0 1px 3px rgba(0,0,0,.02); }
        .rpt-purch-tbl { width: 100%; border-collapse: collapse; min-width: 620px; }
        .rpt-purch-tbl th { background: #fff; padding: 8px 16px; text-align: left; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #FF7A00; }
        .rpt-purch-tbl td { padding: 8px 16px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #475569; vertical-align: middle; white-space: nowrap; }
        .rpt-purch-tbl .r { text-align: right; }
        .rpt-purch-mono-link { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; color: #f97316; background: #fff7ed; padding: 4px 8px; border-radius: 6px; cursor: pointer; }
        .rpt-purch-mono-link:hover { background: #ffedd5; }
        .rpt-purch-pill { font-size: 9px; font-weight: 700; padding: 3px 8px; border-radius: 20px; background: #f1f5f9; color: #475569; text-transform: uppercase; }
        .rpt-purch-st { font-size: 9px; font-weight: 800; padding: 3px 8px; border-radius: 6px; text-transform: uppercase; }
        .rpt-purch-st.completed, .rpt-purch-st.paid { background: #ecfdf5; color: #10b981; }
        .rpt-purch-st.billed { background: #eff6ff; color: #3b82f6; }
        .rpt-purch-st.draft, .rpt-purch-st.unpaid { background: #fff7ed; color: #f97316; }
        .rpt-purch-st.cancelled, .rpt-purch-st.void { background: #fef2f2; color: #ef4444; }
        .rpt-purch-amt { font-weight: 800; color: #1e293b; }

        .rpt-purch-pay-grid { display: flex; flex-wrap: wrap; gap: 12px; }
        .rpt-purch-pay-card { flex: 1 1 230px; max-width: 300px; background: #fff; padding: 12px 14px; border-radius: 12px; border: 1px solid #f1f5f9; box-shadow: 0 1px 3px rgba(0,0,0,.02); display: flex; flex-direction: column; gap: 8px; }
        .rpt-purch-pay-card:hover { transform: translateY(-2px); box-shadow: 0 6px 14px rgba(0,0,0,0.04); }
        .rpt-purch-pay-card-header { display: flex; align-items: center; gap: 10px; }
        .rpt-purch-pay-icon-box { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 13px; }
        .rpt-purch-pay-method-info { display: flex; flex-direction: column; gap: 1px; }
        .rpt-purch-pay-method-name { font-size: 11px; font-weight: 800; color: #1e293b; text-transform: uppercase; }
        .rpt-purch-pay-meta { font-size: 10px; color: #94a3b8; font-weight: 600; }
        .rpt-purch-pay-body { display: flex; justify-content: space-between; align-items: baseline; }
        .rpt-purch-pay-amt { font-size: 16px; font-weight: 850; color: #1e293b; }
        .rpt-purch-pay-avg { font-size: 10.5px; color: #64748b; font-weight: 600; }
        .rpt-purch-pay-bar-wrapper { height: 4px; background: #f1f5f9; border-radius: 2px; overflow: hidden; }
        .rpt-purch-pay-bar-fill { height: 100%; border-radius: 2px; }

        .rpt-purch-refreshing { font-size: 11px; font-weight: 700; color: #f97316; margin-bottom: 6px; }
        .rpt-purch-loading, .rpt-purch-empty { text-align: center; padding: 60px 20px; color: #94a3b8; font-weight: 700; font-size: 14px; }
        .rpt-purch-error { margin-bottom: 16px; padding: 12px 14px; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; border-radius: 12px; font-size: 12px; font-weight: 800; }
      `}</style>
    </div>
  );
}
