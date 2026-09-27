import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import api from '../../utils/api';
import NiceSelect from '../NiceSelect';
import { useNotification } from '../../context/NotificationContext';
import { formatTzDate } from '../../utils/timezoneUtils';
import {
  FaChartBar, FaBoxes, FaBuilding, FaCreditCard, FaReceipt,
  FaFileCsv, FaFileExcel, FaSearch, FaPlus, FaShoppingBag, FaClock,
  FaChartLine, FaFileInvoice
} from 'react-icons/fa';

const PURCHASE_TABS = [
  { key: 'purch_summary', label: 'Procurement Summary', icon: <FaChartBar /> },
  { key: 'purch_orders', label: 'Purchase Invoices', icon: <FaReceipt /> },
  { key: 'purch_items', label: 'Item Procurement', icon: <FaBoxes /> },
  { key: 'purch_vendors', label: 'Vendor Analysis', icon: <FaBuilding /> },
  { key: 'purch_payments', label: 'Payment Outflow', icon: <FaCreditCard /> },
];

export default function PurchaseReportView({
  dateFrom,
  dateTo,
  selectedOrgId,
  selectedTerminalId,
  config,
  isSuperAdmin,
  timezone,
  SYM = '₹',
  setViewingDoc: propSetViewingDoc,
  onViewDoc,
  viewDocument
}) {
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

  const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const toInstant = (dtLocal) => {
    if (!dtLocal) return undefined;
    try { return new Date(dtLocal + ':00').toISOString(); } catch { return undefined; }
  };

  const loadSubTab = useCallback(async (tabKey) => {
    setLoading(true);
    setLoadError(null);
    const params = { from: toInstant(dateFrom), to: toInstant(dateTo) };
    if (isSuperAdmin && selectedOrgId) params.orgId = selectedOrgId;
    if (isSuperAdmin && selectedTerminalId) params.terminalId = selectedTerminalId;

    try {
      if (tabKey === 'purch_summary') {
        const res = await api.get('/api/v1/purchase/orders/reports/summary', { params });
        if (res.data?.success) setPurchSummary(res.data.data || null);
        return;
      }
      if (tabKey === 'purch_orders') {
        const p = { ...params, size: 200, page: purchPage, status: purchStatusFilter !== 'ALL' ? purchStatusFilter : undefined };
        const res = await api.get('/api/v1/purchase/orders', { params: p });
        if (res.data?.success) setPurchOrders(res.data.data?.content || res.data.data || []);
        return;
      }
      if (tabKey === 'purch_items') {
        const res = await api.get('/api/v1/purchase/orders/reports/item-wise', { params });
        if (res.data?.success) setPurchItems(res.data.data || []);
        return;
      }
      if (tabKey === 'purch_vendors') {
        const res = await api.get('/api/v1/purchase/orders/reports/vendor-wise', { params });
        if (res.data?.success) setPurchVendors(res.data.data || []);
        return;
      }
      if (tabKey === 'purch_payments') {
        const res = await api.get('/api/v1/purchase/orders/reports/payment-breakdown', { params });
        if (res.data?.success) setPurchPayments(res.data.data || []);
        return;
      }
    } catch (err) {
      console.error('Purchase report error:', err);
      const msg = err?.response?.data?.message || 'Failed to load procurement report';
      setLoadError(msg);
      notify('error', msg);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, purchPage, purchStatusFilter, isSuperAdmin, selectedOrgId, selectedTerminalId, notify]);

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

  // Render Sub Tabs
  const renderSummary = () => {
    if (!purchSummary && !loading) return <div className="rpt-purch-empty">No purchase data for selected range</div>;
    const totalPurch = Number(purchSummary?.totalPurchases || 0);
    const totalPaid = Number(purchSummary?.totalPaid || 0);
    const totalDue = Number(purchSummary?.totalDue || 0);
    const totalTax = Number(purchSummary?.totalTax || 0);
    const avgOrderVal = Number(purchSummary?.avgOrderValue || 0);
    const totalOrders = Number(purchSummary?.totalOrders || 0);

    const cards = [
      { label: 'Procurement Spend', val: `${SYM}${fmt(totalPurch)}`, color: '#f97316', bg: '#fff7ed', icon: <FaShoppingBag /> },
      { label: 'Paid Outflow', val: `${SYM}${fmt(totalPaid)}`, color: '#10b981', bg: '#ecfdf5', icon: <FaReceipt /> },
      { label: 'Outstanding Payables', val: `${SYM}${fmt(totalDue)}`, color: '#ef4444', bg: '#fef2f2', icon: <FaClock /> },
      { label: 'Purchase Orders', val: totalOrders, color: '#3b82f6', bg: '#eff6ff', icon: <FaBoxes /> },
      { label: 'Avg Order Value', val: `${SYM}${fmt(avgOrderVal)}`, color: '#8b5cf6', bg: '#f5f3ff', icon: <FaChartLine /> },
      (config?.taxEnabled !== false) && { label: 'Input Tax (GST)', val: `${SYM}${fmt(totalTax)}`, color: '#0ea5e9', bg: '#f0f9ff', icon: <FaFileInvoice /> },
    ].filter(Boolean);

    const statusCounts = purchSummary?.ordersByStatus || {};
    const paymentCounts = purchSummary?.ordersByPaymentStatus || {};

    return (
      <>
        <div className="rpt-purch-toolbar">
          <button className="rpt-purch-btn" onClick={() => exportCSV(
            ['Metric', 'Value'],
            [
              ['Total Procurement Spend', totalPurch],
              ['Total Paid Outflow', totalPaid],
              ['Total Outstanding Payables', totalDue],
              ['Total Purchase Orders', totalOrders],
              ['Average Order Value', avgOrderVal],
              ['Input Tax', totalTax]
            ].map(row => row.map(csvCell).join(',')),
            'procurement_summary'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-purch-btn" onClick={() => exportExcel(
            [
              { Metric: 'Total Procurement Spend', Value: totalPurch },
              { Metric: 'Total Paid Outflow', Value: totalPaid },
              { Metric: 'Total Outstanding Payables', Value: totalDue },
              { Metric: 'Total Purchase Orders', Value: totalOrders },
              { Metric: 'Average Order Value', Value: avgOrderVal },
              { Metric: 'Input Tax', Value: totalTax }
            ],
            'Procurement Summary', 'procurement_summary'
          )}><FaFileExcel /> Excel</button>
        </div>

        <div className="rpt-purch-kpi-grid">
          {cards.map((c, i) => (
            <div key={i} className="rpt-purch-kpi" style={{ borderLeft: `4px solid ${c.color}` }}>
              <div className="rpt-purch-kpi-icon" style={{ background: c.bg, color: c.color }}>{c.icon}</div>
              <div className="rpt-purch-kpi-data">
                <span className="rpt-purch-kpi-label">{c.label}</span>
                <span className="rpt-purch-kpi-val">{c.val}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Status Distribution */}
        <div className="rpt-purch-dist-grid">
          <div className="rpt-purch-panel">
            <div className="rpt-purch-panel-title">Order Lifecycle Breakdown</div>
            <div className="rpt-purch-pill-group">
              {Object.entries(statusCounts).map(([st, cnt]) => (
                <div key={st} className="rpt-purch-tag">
                  <span className="rpt-purch-tag-label">{st}</span>
                  <span className="rpt-purch-tag-badge">{cnt}</span>
                </div>
              ))}
              {Object.keys(statusCounts).length === 0 && <span className="rpt-purch-dim">No order breakdown available</span>}
            </div>
          </div>

          <div className="rpt-purch-panel">
            <div className="rpt-purch-panel-title">Settlement Status Breakdown</div>
            <div className="rpt-purch-pill-group">
              {Object.entries(paymentCounts).map(([st, cnt]) => (
                <div key={st} className="rpt-purch-tag">
                  <span className="rpt-purch-tag-label">{st}</span>
                  <span
                    className="rpt-purch-tag-badge"
                    style={{ background: st === 'PAID' ? '#10b981' : st === 'UNPAID' ? '#ef4444' : '#f59e0b' }}
                  >
                    {cnt}
                  </span>
                </div>
              ))}
              {Object.keys(paymentCounts).length === 0 && <span className="rpt-purch-dim">No payment breakdown available</span>}
            </div>
          </div>
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
      const matchStatus = purchStatusFilter === 'ALL' || (po.status || '').toUpperCase() === purchStatusFilter;
      return matchSearch && matchStatus;
    });

    return (
      <>
        <div className="rpt-purch-toolbar">
          <NiceSelect
            value={purchStatusFilter}
            onChange={setPurchStatusFilter}
            options={[
              { value: 'ALL', label: 'All Statuses' },
              { value: 'BILLED', label: 'Billed' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'DRAFT', label: 'Draft' },
              { value: 'CANCELLED', label: 'Cancelled' },
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
          <button className="rpt-purch-btn" onClick={() => exportCSV(
            ['PO Number', 'Date', 'Supplier', 'Status', 'Payment Status', 'Total Amount', 'Amount Due'],
            filtered.map(po => [
              po.orderNo,
              formatTzDate(po.createdAt || po.transactionDate, timezone, { format: 'short' }),
              po.vendorName || po.vendor?.name || '—',
              po.status,
              po.paymentStatus || '—',
              po.grandTotal || po.totalAmount || 0,
              po.amountDue || 0
            ].map(csvCell).join(',')),
            'purchase_invoices'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-purch-btn" onClick={() => exportExcel(
            filtered.map(po => ({
              'PO Number': po.orderNo,
              'Date': formatTzDate(po.createdAt || po.transactionDate, timezone, { format: 'short' }),
              'Supplier': po.vendorName || po.vendor?.name || '—',
              'Status': po.status,
              'Payment Status': po.paymentStatus || '—',
              'Total Amount': Number(po.grandTotal || po.totalAmount || 0),
              'Amount Due': Number(po.amountDue || 0)
            })),
            'Purchase Invoices', 'purchase_invoices'
          )}><FaFileExcel /> Excel</button>
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
                    <td>{formatTzDate(po.createdAt || po.transactionDate, timezone, { format: 'short' })}</td>
                    <td style={{ fontWeight: 600, color: '#1e293b' }}>{po.vendorName || po.vendor?.name || '—'}</td>
                    <td><span className={`rpt-purch-st ${(po.status || '').toLowerCase()}`}>{po.status || 'DRAFT'}</span></td>
                    <td><span className={`rpt-purch-st ${(po.paymentStatus || '').toLowerCase()}`}>{po.paymentStatus || '—'}</span></td>
                    <td className="r rpt-purch-amt">{SYM}{fmt(po.grandTotal ?? po.totalAmount ?? 0)}</td>
                    <td className="r" style={{ fontWeight: 700, color: Number(po.amountDue || 0) > 0 ? '#ef4444' : '#10b981' }}>
                      {SYM}{fmt(po.amountDue || 0)}
                    </td>
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

    const totalSpend = filtered.reduce((acc, i) => acc + Number(i.totalSpend || 0), 0);
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
            ['Item Name', 'Category', 'Units Procured', 'Avg Unit Cost', 'Total Spend', 'Orders Count'],
            filtered.map(item => [
              item.productName || item.itemName,
              item.categoryName || '—',
              item.totalQuantity || 0,
              item.averageUnitCost || 0,
              item.totalSpend || 0,
              item.orderCount || 0
            ].map(csvCell).join(',')),
            'item_procurement'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-purch-btn" onClick={() => exportExcel(
            filtered.map(item => ({
              'Item Name': item.productName || item.itemName,
              'Category': item.categoryName || '—',
              'Units Procured': Number(item.totalQuantity || 0),
              'Avg Unit Cost': Number(item.averageUnitCost || 0),
              'Total Spend': Number(item.totalSpend || 0),
              'Orders Count': Number(item.orderCount || 0)
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
                  <th>Item / Ingredient Name</th>
                  <th>Category</th>
                  <th className="r">Units Procured</th>
                  <th className="r">Avg Unit Cost</th>
                  <th className="r">Total Spend</th>
                  <th className="r">POs Placed</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => (
                  <tr key={item.productId || idx}>
                    <td style={{ fontWeight: 700, color: '#1e293b' }}>{item.productName || item.itemName}</td>
                    <td><span className="rpt-purch-pill">{item.categoryName || 'General'}</span></td>
                    <td className="r" style={{ fontWeight: 600 }}>{Number(item.totalQuantity || 0).toLocaleString('en-IN')}</td>
                    <td className="r">{SYM}{fmt(item.averageUnitCost)}</td>
                    <td className="r rpt-purch-amt">{SYM}{fmt(item.totalSpend)}</td>
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

    const totalBilled = filtered.reduce((acc, v) => acc + Number(v.totalPurchases || 0), 0);
    const totalPaid = filtered.reduce((acc, v) => acc + Number(v.totalPaid || 0), 0);
    const totalDue = filtered.reduce((acc, v) => acc + Number(v.totalDue || 0), 0);

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
              v.totalOrders || 0,
              v.totalPurchases || 0,
              v.totalPaid || 0,
              v.totalDue || 0
            ].map(csvCell).join(',')),
            'vendor_procurement'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-purch-btn" onClick={() => exportExcel(
            filtered.map(v => ({
              'Vendor Name': v.vendorName,
              'POs Placed': Number(v.totalOrders || 0),
              'Total Billed': Number(v.totalPurchases || 0),
              'Total Paid': Number(v.totalPaid || 0),
              'Outstanding Balance': Number(v.totalDue || 0)
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
                    <td className="r" style={{ fontWeight: 600 }}>{v.totalOrders || 0}</td>
                    <td className="r rpt-purch-amt">{SYM}{fmt(v.totalPurchases)}</td>
                    <td className="r" style={{ color: '#10b981', fontWeight: 700 }}>{SYM}{fmt(v.totalPaid)}</td>
                    <td className="r" style={{ color: Number(v.totalDue || 0) > 0 ? '#ef4444' : '#64748b', fontWeight: 800 }}>
                      {SYM}{fmt(v.totalDue)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                  <td>Total ({filtered.length} vendors)</td>
                  <td className="r">—</td>
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
    const list = Array.isArray(purchPayments) ? purchPayments : [];
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
              {list.map((p, idx) => {
                const amt = Number(p.totalAmount || 0);
                const pct = totalOutflow > 0 ? Math.round((amt / totalOutflow) * 100) : 0;
                return (
                  <div key={p.paymentMethod || idx} className="rpt-purch-pay-card">
                    <div className="rpt-purch-pay-card-header">
                      <div className="rpt-purch-pay-icon-box" style={{ background: '#fff7ed', color: '#f97316' }}>
                        <FaCreditCard />
                      </div>
                      <div className="rpt-purch-pay-method-info">
                        <span className="rpt-purch-pay-method-name">{p.paymentMethod || 'OTHER'}</span>
                        <span className="rpt-purch-pay-meta">{p.orderCount || 0} disbursements</span>
                      </div>
                    </div>
                    <div className="rpt-purch-pay-body">
                      <span className="rpt-purch-pay-amt">{SYM}{fmt(amt)}</span>
                      <span className="rpt-purch-pay-avg">{pct}% of outflow</span>
                    </div>
                    <div className="rpt-purch-pay-bar-wrapper">
                      <div className="rpt-purch-pay-bar-fill" style={{ width: `${pct}%`, background: '#f97316' }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '24px' }} className="rpt-purch-tbl-wrap">
              <table className="rpt-purch-tbl">
                <thead>
                  <tr>
                    <th>Disbursement Method</th>
                    <th className="r">Payments Count</th>
                    <th className="r">Total Disbursed</th>
                    <th className="r">Share of Outflow</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p, idx) => {
                    const amt = Number(p.totalAmount || 0);
                    const pct = totalOutflow > 0 ? ((amt / totalOutflow) * 100).toFixed(1) : '0';
                    return (
                      <tr key={idx}>
                        <td style={{ fontWeight: 700, color: '#1e293b' }}>{p.paymentMethod || 'OTHER'}</td>
                        <td className="r">{p.orderCount || 0}</td>
                        <td className="r rpt-purch-amt">{SYM}{fmt(amt)}</td>
                        <td className="r" style={{ fontWeight: 700, color: '#f97316' }}>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                    <td>Total Outflow</td>
                    <td className="r">{list.reduce((acc, p) => acc + Number(p.orderCount || 0), 0)}</td>
                    <td className="r rpt-purch-amt" style={{ color: '#f97316' }}>{SYM}{fmt(totalOutflow)}</td>
                    <td className="r">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </>
    );
  };

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
        {loading ? (
          <div className="rpt-purch-loading">Aggregating procurement records…</div>
        ) : (
          subTabContent[subTab]?.()
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

        .rpt-purch-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
        .rpt-purch-kpi { background: #fff; padding: 16px; border-radius: 16px; border: 1px solid #f1f5f9; display: grid; grid-template-areas: "label icon" "value icon"; grid-template-columns: 1fr auto; align-items: center; gap: 6px 12px; min-height: 85px; }
        .rpt-purch-kpi:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(0,0,0,.03); }
        .rpt-purch-kpi-icon { grid-area: icon; width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .rpt-purch-kpi-data { display: contents; }
        .rpt-purch-kpi-label { grid-area: label; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .5px; }
        .rpt-purch-kpi-val { grid-area: value; font-size: 20px; font-weight: 850; color: #1e293b; }

        .rpt-purch-dist-grid { margin-top: 18px; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
        .rpt-purch-panel { background: #fff; border: 1px solid #f1f5f9; border-radius: 16px; padding: 18px; }
        .rpt-purch-panel-title { font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 14px; }
        .rpt-purch-pill-group { display: flex; flex-wrap: wrap; gap: 8px; }
        .rpt-purch-tag { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 12px; }
        .rpt-purch-tag-label { font-weight: 700; color: #334155; }
        .rpt-purch-tag-badge { background: #f97316; color: #fff; border-radius: 999px; padding: 1px 7px; font-size: 10px; font-weight: 800; }
        .rpt-purch-dim { color: #94a3b8; font-size: 12px; }

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
        .rpt-purch-st.cancelled { background: #fef2f2; color: #ef4444; }
        .rpt-purch-amt { font-weight: 800; color: #1e293b; }

        .rpt-purch-pay-grid { display: flex; flex-wrap: wrap; gap: 16px; }
        .rpt-purch-pay-card { flex: 1 1 260px; max-width: 320px; background: #fff; padding: 16px; border-radius: 16px; border: 1px solid #f1f5f9; box-shadow: 0 1px 3px rgba(0,0,0,.02); display: flex; flex-direction: column; gap: 12px; }
        .rpt-purch-pay-card:hover { transform: translateY(-4px); box-shadow: 0 12px 20px rgba(0,0,0,0.06); }
        .rpt-purch-pay-card-header { display: flex; align-items: center; gap: 12px; }
        .rpt-purch-pay-icon-box { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .rpt-purch-pay-method-info { display: flex; flex-direction: column; gap: 2px; }
        .rpt-purch-pay-method-name { font-size: 12px; font-weight: 800; color: #1e293b; text-transform: uppercase; }
        .rpt-purch-pay-meta { font-size: 11px; color: #94a3b8; font-weight: 600; }
        .rpt-purch-pay-body { display: flex; justify-content: space-between; align-items: baseline; }
        .rpt-purch-pay-amt { font-size: 20px; font-weight: 850; color: #1e293b; }
        .rpt-purch-pay-avg { font-size: 11px; color: #64748b; font-weight: 600; }
        .rpt-purch-pay-bar-wrapper { height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
        .rpt-purch-pay-bar-fill { height: 100%; border-radius: 3px; }

        .rpt-purch-loading, .rpt-purch-empty { text-align: center; padding: 60px 20px; color: #94a3b8; font-weight: 700; font-size: 14px; }
        .rpt-purch-error { margin-bottom: 16px; padding: 12px 14px; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; border-radius: 12px; font-size: 12px; font-weight: 800; }
      `}</style>
    </div>
  );
}
