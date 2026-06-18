import React, { useState, useEffect, useMemo, useCallback } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import NiceSelect from '../../components/NiceSelect';
import DocumentViewerPopup from '../../components/purchasing/DocumentViewerPopup';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import { formatTzDate, getBusinessNow } from '../../utils/timezoneUtils';
import { publishAccountingDataChanged, subscribeAccountingDataChanged } from '../../utils/accountingRealtime';
import {
  FaChartBar, FaReceipt, FaBoxes, FaCreditCard, FaFileInvoice,
  FaChartLine, FaClock, FaFileCsv, FaFileExcel, FaChevronDown,
  FaChevronRight, FaBan, FaBook, FaMoneyBillWave, FaMobileAlt, FaWallet,
  FaInfoCircle, FaCoins, FaTag
} from 'react-icons/fa';

const TABS = [
  { key: 'summary', label: 'Sales Summary', icon: <FaChartBar /> },
  { key: 'salesInvoices', label: 'Sales & Invoices', icon: <FaReceipt /> },
  { key: 'items', label: 'Item Sales', icon: <FaBoxes /> },
  { key: 'payments', label: 'Payment Methods', icon: <FaCreditCard /> },
  { key: 'tax', label: 'Tax Report', icon: <FaFileInvoice /> },
  { key: 'pnl', label: 'Profit & Loss', icon: <FaChartLine /> },
  { key: 'hourly', label: 'Hourly Trends', icon: <FaClock /> },
];
const CREDIT_TAB = { key: 'credit', label: 'Credit Sales', icon: <FaBook /> };

const SYM = '₹';

function reportErrorMessage(err) {
  const status = err?.response?.status;
  if (status === 401 || status === 403) {
    return 'Your session or branch access expired. Please sign in again or reselect the branch.';
  }
  return err?.response?.data?.message || 'Failed to load report data';
}

export default function Reports() {
  const { timezone, orgId, userRole } = useAuth();
  const { notify, showConfirm } = useNotification();
  const isSuperAdmin = userRole === 'SUPER_ADMIN';
  const [tab, setTab] = useState('summary');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const bizNow = getBusinessNow(timezone);
  const getLocalDate = (d = bizNow) => {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  const [dateFrom, setDateFrom] = useState(() => `${getLocalDate()}T00:00`);
  const [dateTo, setDateTo] = useState(() => `${getLocalDate()}T23:59`);

  // Superadmin org/terminal filter states
  const [organizations, setOrganizations] = useState([]);
  const [allTerminals, setAllTerminals] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [selectedTerminalId, setSelectedTerminalId] = useState('');

  // Load organisations and terminals for superadmin
  useEffect(() => {
    if (!isSuperAdmin) return;
    Promise.all([
      api.get('/api/v1/organizations'),
      api.get('/api/v1/terminals')
    ]).then(([orgRes, termRes]) => {
      if (orgRes.data?.success) setOrganizations(orgRes.data.data || []);
      if (termRes.data?.success) setAllTerminals(termRes.data.data || []);
    }).catch(() => {});
  }, [isSuperAdmin]);

  // When org changes, clear terminal selection
  const handleOrgChange = (val) => {
    setSelectedOrgId(val);
    setSelectedTerminalId('');
  };

  // Terminals filtered by selected org
  const filteredTerminals = useMemo(() => {
    if (!selectedOrgId) return allTerminals;
    return allTerminals.filter(t => t.orgId === selectedOrgId || t.organization?.id === selectedOrgId);
  }, [allTerminals, selectedOrgId]);

  // Data states
  const [summary, setSummary] = useState(null);
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [taxData, setTaxData] = useState([]);
  const [pnl, setPnl] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [hourly, setHourly] = useState([]);
  const [invoiceFilter, setInvoiceFilter] = useState('ALL');
  const [viewingDoc, setViewingDoc] = useState(null);
  const [config, setConfig] = useState(null);
  const [creditReport, setCreditReport] = useState(null);
  const [voidingInvoice, setVoidingInvoice] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidingInProgress, setVoidingInProgress] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState(null);

  const toInstant = (dtLocal) => {
    if (!dtLocal) return undefined;
    try { return new Date(dtLocal + ':00').toISOString(); } catch { return undefined; }
  };

  const loadTab = useCallback(async (t) => {
    setLoading(true);
    setLoadError(null);
    const baseParams = { from: toInstant(dateFrom), to: toInstant(dateTo) };
    // Append org/terminal filter for superadmin
    if (isSuperAdmin && selectedOrgId) baseParams.orgId = selectedOrgId;
    if (isSuperAdmin && selectedTerminalId) baseParams.terminalId = selectedTerminalId;
    const params = baseParams;
    try {
      const ep = {
        summary: '/api/v1/reports/sales-summary',
        salesInvoices: '/api/v1/reports/sales-invoices',
        items: '/api/v1/reports/item-wise',
        payments: '/api/v1/reports/payment-breakdown',
        tax: '/api/v1/reports/tax-summary',
        pnl: '/api/v1/reports/profit-loss',
        hourly: '/api/v1/reports/hourly',
        credit: '/api/v1/credit/report',
      }[t];
      if (!ep) return;
      const p = t === 'salesInvoices' ? { ...params, type: invoiceFilter } : params;
      if (t === 'pnl') {
        setPnl(null);
        setReconciliation(null);
        const [pnlRes, reconciliationRes] = await Promise.allSettled([
          api.get(ep, { params: p }),
          api.get('/api/v1/accounting/reconciliation', { params })
        ]);
        if (pnlRes.status === 'fulfilled' && pnlRes.value.data?.success) {
          setPnl(pnlRes.value.data.data);
        }
        if (reconciliationRes.status === 'fulfilled' && reconciliationRes.value.data?.success) {
          setReconciliation(reconciliationRes.value.data.data || null);
        }
        if (pnlRes.status === 'rejected') {
          throw pnlRes.reason;
        }
        return;
      }
      const res = await api.get(ep, { params: p });
      if (res.data?.success) {
        const d = res.data.data;
        if (t === 'summary') setSummary(d);
        else if (t === 'salesInvoices') setSalesInvoices(d || []);
        else if (t === 'items') setItems(d || []);
        else if (t === 'payments') setPayments(d || []);
        else if (t === 'tax') setTaxData(d || []);
        else if (t === 'hourly') setHourly(d || []);
        else if (t === 'credit') setCreditReport(d || null);
      }
    } catch (e) {
      console.error('Report load error:', e);
      const message = reportErrorMessage(e);
      setLoadError(message);
      notify('error', message);
    } finally { setLoading(false); }
  }, [dateFrom, dateTo, invoiceFilter, notify, isSuperAdmin, selectedOrgId, selectedTerminalId]);

  useEffect(() => { loadTab(tab); }, [tab, loadTab, orgId, selectedOrgId, selectedTerminalId]);

  useEffect(() => {
    let active = true;
    const params = {};
    if (isSuperAdmin && selectedOrgId) {
      params.orgId = selectedOrgId;
    }
    api.get('/api/v1/configurations', { params })
      .then(res => {
        if (!active) return;
        const nextConfig = res.data?.data || null;
        setConfig(nextConfig);
        if (tab === 'credit' && !nextConfig?.creditEnabled) {
          setTab('summary');
        }
      })
      .catch(() => {
        if (active) setConfig(null);
      });
    return () => { active = false; };
  }, [orgId, tab, isSuperAdmin, selectedOrgId]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let timerId = null;
    const scheduleRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      if (timerId) window.clearTimeout(timerId);
      timerId = window.setTimeout(() => loadTab(tab), 500);
    };
    const handleVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };

    const unsubscribe = subscribeAccountingDataChanged(scheduleRefresh);
    window.addEventListener('focus', scheduleRefresh);
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      if (timerId) window.clearTimeout(timerId);
      unsubscribe?.();
      window.removeEventListener('focus', scheduleRefresh);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [loadTab, tab]);

  const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtMaybe = (v) => (v === null || v === undefined ? '—' : `${SYM}${fmt(v)}`);
  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const isVoidTransaction = (tx) => ['VOID', 'VOIDED'].some(s =>
    String(tx?.invoiceStatus || '').toUpperCase() === s ||
    String(tx?.invoiceDocStatus || '').toUpperCase() === s ||
    String(tx?.orderStatus || '').toUpperCase() === s
  );
  const branchLabel = (tx) => tx?.branchName || tx?.branchCode || (tx?.branchId ? String(tx.branchId).slice(0, 8) : '—');
  const visibleTabs = useMemo(() => {
    let list = TABS;
    if (config && !config.taxEnabled) {
      list = TABS.filter(t => t.key !== 'tax');
    }
    return config?.creditEnabled ? [...list, CREDIT_TAB] : list;
  }, [config]);

  const exportCSV = (headers, rows, filename) => {
    if (!rows.length) return notify('error', 'No data to export');
    const csv = [headers.join(','), ...rows].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `${filename}_${getLocalDate()}.csv`;
    a.click();
  };

  const exportExcel = async (data, sheetName, filename) => {
    if (!data.length) return notify('error', 'No data');
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `${filename}_${getLocalDate()}.xlsx`);
    } catch { notify('error', 'Excel export failed'); }
  };

  const viewDocument = async (tx, type) => {
    if (tx.orderId) {
      try {
        const { data } = await api.get(`/api/v1/orders/${tx.orderId}`);
        if (data?.data) {
          setViewingDoc({ order: data.data, type });
        } else {
          setViewingDoc({ order: tx, type });
        }
      } catch (err) {
        console.warn('Failed to load full order details:', err);
        setViewingDoc({ order: tx, type });
      }
    } else {
      setViewingDoc({ order: tx, type });
    }
  };

  const handleVoid = (inv) => {
    const invoiceId = inv.invoiceId || inv.id;
    if (!invoiceId) return notify('error', 'No order/invoice is linked to this row');
    setVoidingInvoice(inv);
    setVoidReason('');
  };

  const submitVoid = async () => {
    if (!voidingInvoice || voidingInProgress) return;
    const invoiceId = voidingInvoice.invoiceId || voidingInvoice.id;
    setVoidingInProgress(true);
    try {
      await api.post(`/api/v1/reports/invoices/${invoiceId}/void`, { reason: voidReason });
      notify('success', 'Order cancelled successfully');
      publishAccountingDataChanged({
        source: 'reports',
        reason: 'invoice-voided',
        invoiceId,
        orderId: voidingInvoice.orderId || null
      });
      setVoidingInvoice(null);
      loadTab('salesInvoices');
    } catch (e) {
      notify('error', e.response?.data?.message || 'Cancellation failed');
    } finally {
      setVoidingInProgress(false);
    }
  };

  // ─── RENDER HELPERS ─────────────────────────────────────────────────
  const renderSummary = () => {
    if (!summary) return <div className="rpt-empty">No data for selected range</div>;
    const billedTotal = Number(summary.grandTotal || 0);
    const discounts = Number(summary.totalDiscount || 0);
    const tax = Number(summary.totalTax || 0);
    const roundOff = Number(summary.totalRoundOff || 0);
    // Indian GAAP / Ind AS 115: Gross Sales and Net Sales EXCLUDE output tax and round-off.
    // GST is a liability collected on behalf of government, and Round Off is a rounding adjustment.
    const netSales = billedTotal - tax - roundOff;         // ex-tax, ex-roundoff: actual revenue earned
    const grossSales = netSales + discounts;    // ex-tax, ex-roundoff: pre-discount revenue
    const cards = [
      { label: 'Billed Total',    val: `${SYM}${fmt(billedTotal)}`,          color: '#10b981', bg: '#ecfdf5', tip: 'Billed Total: The actual amount billed and collected from customers (including GST) across all settled orders. | Equation: Net Sales + GST + Round Off = Billed Total', icon: <FaReceipt /> },
      (config?.discountEnabled !== false) && { label: 'Gross Sales',     val: `${SYM}${fmt(grossSales)}`,            color: '#0ea5e9', bg: '#f0f9ff', tip: 'Gross Sales (Ex-Tax): Pre-discount revenue excluding GST and Round Off. | Equation: Net Sales + Discounts = Gross Sales', icon: <FaChartBar /> },
      { label: 'Net Sales',       val: `${SYM}${fmt(netSales)}`,              color: '#16a34a', bg: '#f0fdf4', tip: 'Net Sales (Ex-Tax): Revenue after discounts, excluding GST and Round Off. | Equation: Billed Total − GST − Round Off = Net Sales', icon: <FaChartLine /> },
      { label: 'Total Orders',    val: summary.totalOrders,                   color: '#3b82f6', bg: '#eff6ff', tip: 'Total Orders: Number of completed and settled orders in the selected date range.', icon: <FaReceipt /> },
      { label: 'Avg Order Value', val: `${SYM}${fmt(summary.avgOrderValue)}`, color: '#8b5cf6', bg: '#f5f3ff', tip: 'Avg Order Value: Average billed amount per order. Calculated as Billed Total ÷ Total Orders.', icon: <FaChartLine /> },
      { label: 'Items Sold',      val: summary.itemsSold,                     color: '#f97316', bg: '#fff7ed', tip: 'Items Sold: Total number of individual menu items sold across all orders in this period.', icon: <FaBoxes /> },
      (config?.taxEnabled !== false) && { label: 'Tax', val: `${SYM}${fmt(tax)}`, color: '#ef4444', bg: '#fef2f2', tip: 'Tax (GST): Total output tax collected from customers, payable to the government. | Equation: Billed Total − Net Sales − Round Off = Tax', icon: <FaFileInvoice /> },
      (config?.discountEnabled !== false) && { label: 'Discounts',       val: `${SYM}${fmt(discounts)}`,             color: '#ec4899', bg: '#fdf2f8', tip: 'Discounts: Total price reductions granted on orders (item-level and order-level). | Equation: Gross Sales − Net Sales = Discounts', icon: <FaTag /> },
      (config?.roundOffEnabled !== false) && { label: 'Round Off',       val: `${SYM}${fmt(roundOff)}`, color: '#64748b', bg: '#f1f5f9', tip: 'Round Off: Adjustments made to round the bill total to the nearest whole value. | Equation: Billed Total − Net Sales − GST = Round Off', icon: <FaCoins /> }
    ].filter(Boolean);
    return (
      <>
        <div className="rpt-toolbar">
          <button className="rpt-exp-btn" onClick={() => exportCSV(
            ['Metric', 'Value'],
            [
              ['Billed Total', billedTotal],
              (config?.discountEnabled !== false) && ['Gross Sales', grossSales],
              ['Net Sales', netSales],
              ['Total Orders', summary.totalOrders],
              ['Avg Order Value', summary.avgOrderValue],
              ['Items Sold', summary.itemsSold],
              (config?.taxEnabled !== false) && ['Tax', tax],
              (config?.discountEnabled !== false) && ['Discounts', discounts],
              (config?.roundOffEnabled !== false) && ['Round Off', summary.totalRoundOff || 0]
            ].filter(Boolean).map(row => row.map(csvCell).join(',')),
            'sales_summary'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-exp-btn" onClick={() => exportExcel(
            [
              { Metric: 'Billed Total', Value: billedTotal },
              (config?.discountEnabled !== false) && { Metric: 'Gross Sales', Value: grossSales },
              { Metric: 'Net Sales', Value: netSales },
              { Metric: 'Total Orders', Value: summary.totalOrders },
              { Metric: 'Avg Order Value', Value: summary.avgOrderValue },
              { Metric: 'Items Sold', Value: summary.itemsSold },
              (config?.taxEnabled !== false) && { Metric: 'Tax', Value: tax },
              (config?.discountEnabled !== false) && { Metric: 'Discounts', Value: discounts },
              (config?.roundOffEnabled !== false) && { Metric: 'Round Off', Value: summary.totalRoundOff || 0 }
            ].filter(Boolean),
            'Sales Summary', 'sales_summary'
          )}><FaFileExcel /> Excel</button>
        </div>
        <div className="rpt-kpi-grid">
          {cards.map((c, i) => (
            <div key={i} className="rpt-kpi" style={{ borderLeft: `4px solid ${c.color}` }}>
              <div className="rpt-kpi-icon" style={{ background: c.bg, color: c.color }}>{c.icon || TABS[0].icon}</div>
              <div className="rpt-kpi-data">
                <span className="rpt-kpi-label">
                  {c.label}
                  {c.tip && <InfoTooltip id={`kpi-${i}`} text={c.tip} />}
                </span>
                <span className="rpt-kpi-val">{c.val}</span>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderSalesInvoices = () => (
    <>
      <div className="rpt-toolbar">
        <NiceSelect value={invoiceFilter} onChange={setInvoiceFilter} options={[
          {value:'ALL',label:'All Sales'},{value:'PAID',label:'Paid'},{value:'CREDIT',label:'Credit/Unpaid'},{value:'VOIDED',label:'Voided'}
        ]} style={{width:180}} />
        <button className="rpt-exp-btn" onClick={() => exportCSV(
          ['Order No','Invoice No','Date','Branch','Customer','Type','Table','Order Status','Invoice Status','Payment Status','Payment Method','Payment No','Tax','Discount','Total','Due','Void Reason'],
          salesInvoices.map(tx => [
            tx.orderNo, tx.invoiceNo, tx.transactionDate, branchLabel(tx), tx.customerName, tx.fulfillmentType, tx.tableNumber,
            tx.orderStatus, tx.invoiceStatus, tx.paymentStatus, tx.paymentMethod, tx.paymentNo,
            tx.totalTaxAmount, tx.totalDiscountAmount, tx.grandTotal, tx.amountDue, tx.voidReason
          ].map(csvCell).join(',')),
          'sales_invoices'
        )}><FaFileCsv /> CSV</button>
        <button className="rpt-exp-btn" onClick={() => exportExcel(
          salesInvoices.map(tx => ({
            'Order No': tx.orderNo,
            'Invoice No': tx.invoiceNo,
            Date: tx.transactionDate,
            Branch: branchLabel(tx),
            Customer: tx.customerName,
            Type: tx.fulfillmentType,
            Table: tx.tableNumber,
            'Order Status': tx.orderStatus,
            'Invoice Status': tx.invoiceStatus,
            'Payment Status': tx.paymentStatus,
            'Payment Method': tx.paymentMethod,
            'Payment No': tx.paymentNo,
            Tax: tx.totalTaxAmount,
            Discount: tx.totalDiscountAmount,
            Total: tx.grandTotal,
            Due: tx.amountDue,
            'Void Reason': tx.voidReason || '',
          })),
          'Sales & Invoices', 'sales_invoices'
        )}><FaFileExcel /> Excel</button>
      </div>
      {salesInvoices.length === 0 ? <div className="rpt-empty">No sales found</div> : (
        <div className="rpt-tbl-wrap">
          <table className="rpt-tbl rpt-combined-tbl">
            <thead><tr>
              <th style={{ width: '1%' }}>Order No</th>
              <th style={{ width: '1%' }}>Invoice No</th>
              <th style={{ width: '1%' }}>Date / Time</th>
              <th style={{ width: '1%' }}>Branch</th>
              <th style={{ width: '1%' }}>Order</th>
              <th style={{ width: '1%' }}>Invoice</th>
              <th style={{ width: '1%' }}>Method</th>
              {config?.taxEnabled !== false && <th className="r" style={{ width: '1%' }}>Tax</th>}
              <th className="r" style={{ width: '1%' }}>Discount</th>
              <th className="r" style={{ width: '1%' }}>Total</th>
              <th className="r" style={{ width: '1%' }}>Due</th>
              <th style={{ width: '1%' }}></th>
            </tr></thead>
            <tbody>{salesInvoices.map(tx => {
              const rowId = tx.id || tx.orderId || tx.invoiceId;
              const typeLabel = [tx.fulfillmentType || 'SALE', tx.tableNumber ? `Table ${tx.tableNumber}` : null].filter(Boolean).join(' / ');
              return (
                <tr
                  key={rowId}
                  className={isVoidTransaction(tx) ? 'voided' : ''}
                  onClick={() => viewDocument(tx, 'order')}
                  style={{cursor: 'pointer'}}
                >
                  <td onClick={(e) => {
                    if (tx.orderNo) {
                      e.stopPropagation();
                      viewDocument(tx, 'order');
                    }
                  }}>
                    <span className={tx.orderNo ? 'rpt-mono-link' : 'rpt-mono'}>
                      {tx.orderNo || '—'}
                    </span>
                  </td>
                  <td onClick={(e) => {
                    if (tx.invoiceNo) {
                      e.stopPropagation();
                      viewDocument(tx, 'invoice');
                    }
                  }}>
                    <span className={tx.invoiceNo ? 'rpt-mono-link' : 'rpt-mono'}>
                      {tx.invoiceNo || '—'}
                    </span>
                  </td>
                  <td>{formatTzDate(tx.transactionDate || tx.orderDate || tx.invoiceDate || tx.createdAt, timezone, { format: 'short' })}</td>
                  <td><span className="rpt-branch">{branchLabel(tx)}</span></td>
                  <td><span className={`rpt-st ${String(tx.orderStatus || 'unknown').toLowerCase()}`}>{tx.orderStatus || '—'}</span></td>
                  <td><span className={`rpt-st ${String(tx.invoiceStatus || 'unknown').toLowerCase()}`} title={tx.voidReason ? `Reason: ${tx.voidReason}` : undefined}>{tx.invoiceStatus || '—'}</span></td>
                  <td><span className="rpt-pill">{tx.paymentMethod || '—'}</span></td>
                  {config?.taxEnabled !== false && <td className="r">{SYM}{fmt(tx.totalTaxAmount)}</td>}
                  <td className="r">{SYM}{fmt(tx.totalDiscountAmount)}</td>
                  <td className="r rpt-amt">{SYM}{fmt(tx.grandTotal)}</td>
                  <td className="r">{fmtMaybe(tx.amountDue)}</td>
                   <td>{tx.voidable && <button className="rpt-void-btn" onClick={(e) => { e.stopPropagation(); handleVoid(tx); }} title="Cancel Order"><FaBan /></button>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </>
  );

  const renderItems = () => {
    const maxRev = items.length ? Math.max(...items.map(i => Number(i.revenue || 0))) : 1;
    return (
      <>
        <div className="rpt-toolbar">
          <button className="rpt-exp-btn" onClick={() => exportCSV(
            ['Item,Category,Qty Sold,Revenue'],
            items.map(i => `"${i.productName}","${i.categoryName}",${i.quantitySold},${i.revenue}`),
            'item_wise'
          )}><FaFileCsv /> CSV</button>
        </div>
        {items.length === 0 ? <div className="rpt-empty">No item data</div> : (
          <div className="rpt-tbl-wrap">
            <table className="rpt-tbl">
              <thead><tr><th>#</th><th>Product</th><th>Category</th><th className="r">Qty</th><th className="r">Revenue</th><th>Share</th></tr></thead>
              <tbody>{items.map((it, i) => (
                <tr key={i}>
                  <td>{i+1}</td>
                  <td><strong>{it.productName}</strong></td>
                  <td><span className="rpt-pill">{it.categoryName}</span></td>
                  <td className="r">{Number(it.quantitySold)}</td>
                  <td className="r rpt-amt">{SYM}{fmt(it.revenue)}</td>
                  <td><div className="rpt-bar-wrap"><div className="rpt-bar" style={{width:`${(Number(it.revenue)/maxRev*100).toFixed(0)}%`}} /></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </>
    );
  };

  const renderPayments = () => (
    payments.length === 0 ? <div className="rpt-empty">No payment data</div> : (
      <>
        <div className="rpt-toolbar">
          <button className="rpt-exp-btn" onClick={() => exportCSV(
            ['Payment Method', 'Total Amount', 'Order Count', 'Percentage'],
            payments.map(p => [
              p.paymentMethod, p.totalAmount, p.orderCount, `${Number(p.percentage || 0).toFixed(1)}%`
            ].map(csvCell).join(',')),
            'payments_breakdown'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-exp-btn" onClick={() => exportExcel(
            payments.map(p => ({
              'Payment Method': p.paymentMethod,
              'Total Amount': p.totalAmount,
              'Order Count': p.orderCount,
              'Percentage': `${Number(p.percentage || 0).toFixed(1)}%`
            })),
            'Payments Breakdown', 'payments_breakdown'
          )}><FaFileExcel /> Excel</button>
        </div>
        <div className="rpt-pay-grid">
          {payments.map((p, i) => {
            const method = String(p.paymentMethod || '').toUpperCase();
            let theme = {
              color: '#6366f1',
              bg: '#f5f3ff',
              grad: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
              icon: <FaWallet />
            };
            if (method.includes('CASH')) {
              theme = {
                color: '#10b981',
                bg: '#ecfdf4',
                grad: 'linear-gradient(135deg, #10b981, #059669)',
                icon: <FaMoneyBillWave />
              };
            } else if (method.includes('CARD') || method.includes('DEBIT') || method.includes('CREDIT')) {
              theme = {
                color: '#3b82f6',
                bg: '#eff6ff',
                grad: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                icon: <FaCreditCard />
              };
            } else if (method.includes('ONLINE') || method.includes('UPI') || method.includes('GPAY') || method.includes('PAYTM') || method.includes('PHONEPE')) {
              theme = {
                color: '#ea580c',
                bg: '#fff7ed',
                grad: 'linear-gradient(135deg, #f97316, #ea580c)',
                icon: <FaMobileAlt />
              };
            }

            const avgAmount = p.orderCount > 0 ? Number(p.totalAmount || 0) / p.orderCount : 0;

            return (
              <div key={i} className="rpt-pay-card" style={{ borderTop: `4px solid ${theme.color}` }}>
                <div className="rpt-pay-card-header">
                  <div className="rpt-pay-icon-box" style={{ background: theme.bg, color: theme.color }}>
                    {theme.icon}
                  </div>
                  <div className="rpt-pay-method-info">
                    <span className="rpt-pay-method-name">{p.paymentMethod}</span>
                    <span className="rpt-pay-meta">{p.orderCount} txns · {Number(p.percentage || 0).toFixed(1)}%</span>
                  </div>
                </div>
                <div className="rpt-pay-body">
                  <div className="rpt-pay-amt">{SYM}{fmt(p.totalAmount)}</div>
                  <div className="rpt-pay-avg">Avg: {SYM}{fmt(avgAmount)}</div>
                </div>
                <div className="rpt-pay-bar-wrapper">
                  <div className="rpt-pay-bar-fill" style={{ width: `${p.percentage}%`, background: theme.grad }} />
                </div>
              </div>
            );
          })}
        </div>
      </>
    )
  );

  const renderTax = () => (
    <>
      <div className="rpt-toolbar">
        <button className="rpt-exp-btn" onClick={() => exportCSV(
          ['Tax Rate,Taxable Amount,CGST,SGST,Total Tax'],
          taxData.map(t => `${t.taxRate}%,${t.taxableAmount},${t.cgst},${t.sgst},${t.totalTax}`),
          'tax_report'
        )}><FaFileCsv /> HSN CSV</button>
      </div>
      {taxData.length === 0 ? <div className="rpt-empty">No tax data</div> : (
        <div className="rpt-tbl-wrap">
          <table className="rpt-tbl">
            <thead><tr><th>Tax Slab</th><th className="r">Taxable</th><th className="r">CGST</th><th className="r">SGST</th><th className="r">Total Tax</th></tr></thead>
            <tbody>{taxData.map((t, i) => (
              <tr key={i}>
                <td><span className="rpt-pill tax">{Number(t.taxRate)}%</span></td>
                <td className="r">{SYM}{fmt(t.taxableAmount)}</td>
                <td className="r">{SYM}{fmt(t.cgst)}</td>
                <td className="r">{SYM}{fmt(t.sgst)}</td>
                <td className="r rpt-amt">{SYM}{fmt(t.totalTax)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );

  const InfoTooltip = ({ id, text }) => {
    const isOpen = activeTooltip === id;
    const ref = React.useRef(null);
    const [coords, setCoords] = useState({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
    const [arrowCoords, setArrowCoords] = useState({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });

    useEffect(() => {
      if (isOpen) {
        if (ref.current) {
          const rect = ref.current.getBoundingClientRect();
          const screenWidth = window.innerWidth;
          
          if (rect.left < 16) {
            setCoords({ left: '-16px', transform: 'none', right: 'auto' });
            setArrowCoords({ left: '20px', transform: 'none', right: 'auto' });
          } else if (rect.right > screenWidth - 16) {
            setCoords({ right: '-16px', left: 'auto', transform: 'none' });
            setArrowCoords({ right: '20px', left: 'auto', transform: 'none' });
          } else {
            setCoords({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
            setArrowCoords({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
          }
        }
      } else {
        setCoords({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
        setArrowCoords({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
      }
    }, [isOpen]);

    return (
      <span
        className="custom-tooltip-wrapper"
        onMouseEnter={() => {
          if (typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches) {
            setActiveTooltip(id);
          }
        }}
        onMouseLeave={() => {
          if (typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches) {
            if (activeTooltip === id) setActiveTooltip(null);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          setActiveTooltip(isOpen ? null : id);
        }}
      >
        <FaInfoCircle className={`custom-tooltip-icon ${isOpen ? 'active' : ''}`} />
        {isOpen && (
          <span ref={ref} className="custom-tooltip-box" style={coords} onClick={(e) => e.stopPropagation()}>
            {text}
            <span className="custom-tooltip-arrow" style={arrowCoords} />
          </span>
        )}
      </span>
    );
  };

  const renderPnL = () => {
    if (!pnl) return <div className="rpt-empty">No P&L data</div>;
    const cashCollectedAfterExpenses = pnl.cashCollectedAfterExpenses ?? pnl.netCashProfit;
    const otherActivePayments = Number(reconciliation?.otherActivePaymentsTotal || 0);
    const unmatchedPaymentCount = Number(reconciliation?.unmatchedPaymentCount || 0);

    const rawGrossSales = Number(pnl.grossSales || 0);
    const discounts = Number(pnl.discounts || 0);
    const outputTax = Number(pnl.totalTax || 0);
    // Indian GAAP / Ind AS 115: backend now returns ex-tax grossSales and netSales.
    // grossSales = ex-tax pre-discount sales; netSales = grossSales − discounts (ex-tax)
    const grossSales = rawGrossSales;           // already ex-tax from backend
    const netSales = grossSales - discounts;    // ex-tax post-discount revenue
    const cogs = Number(pnl.cogsPurchases || 0);
    const expenses = Number(pnl.operatingExpenses || 0);
    const grossMargin = netSales - cogs;         // no separate tax deduction: netSales is already ex-tax
    const netProfit = grossMargin - expenses;    // final profit
    const creditOutstanding = Number(pnl.creditOutstanding || 0);
    const cashCollected = Number(cashCollectedAfterExpenses || 0);
    const totalCostExpenses = cogs + expenses;

    const exportData = [
      ['Gross Sales', grossSales],
      ['Discounts', discounts],
      ['Net Sales', netSales],
      config?.taxEnabled !== false ? ['Output Tax', outputTax] : null,
      ['COGS / Purchases', cogs],
      ['Operating Expenses', expenses],
      ['Net Profit', netProfit],
      ['Receivable Balance', creditOutstanding],
      ['Cash Collected After Expenses', cashCollected],
    ].filter(Boolean);

    if (reconciliation) {
      exportData.push(
        ['Billed Sales Total', reconciliation.billedSalesTotal],
        ['Linked Sales Payments Total', reconciliation.linkedSalesPaymentsTotal],
        ['Other Active Payments Total', reconciliation.otherActivePaymentsTotal],
        ['Payment Collected Total', reconciliation.paymentCollectedTotal]
      );
    }

    return (
      <>
        <div className="rpt-toolbar">
          <button className="rpt-exp-btn" onClick={() => exportCSV(
            ['Metric', 'Value'],
            exportData.map(row => row.map(csvCell).join(',')),
            'profit_loss'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-exp-btn" onClick={() => exportExcel(
            exportData.map(row => ({ Metric: row[0], Value: row[1] })),
            'Profit & Loss', 'profit_loss'
          )}><FaFileExcel /> Excel</button>
        </div>
        <div className="rpt-note">Profit & Loss is calculated from accounting journals, so expenses, purchases, COGS, inventory adjustments, and reversals are included.</div>
        {/* Visual Profit & Loss Waterfall and Side Metrics */}
        <div className="pnl-container">
          <div className="pnl-main-flow">
            <div className="pnl-flow-header">
              <div className="rpt-recon-title-row">
                <h3>Profit Flow</h3>
                <InfoTooltip id="pnlWaterfall" text="Profit Flow: Visualizes how your business translates Gross Sales revenue into final Net Profit by subtracting discounts, product cost of goods (COGS), and operating expenses sequentially." />
              </div>
              <span className="pnl-flow-sub">Tracing Gross Sales down to Net Profit</span>
            </div>
            <div className="pnl-cascade">
              {config?.discountEnabled !== false ? (
                <>
                  {/* Step 1: Gross Sales */}
                  <div className="pnl-cascade-step add">
                    <div className="step-badge plus">+</div>
                    <div className="step-body">
                      <div className="step-title-row">
                        <span className="step-title">Gross Sales</span>
                        <InfoTooltip id="grossSales" text="Gross Sales (Ex-Tax): Pre-discount revenue excluding GST and Round Off. | Equation: Net Sales + Discounts = Gross Sales" />
                      </div>
                      <div className="step-subtitle">Pre-discount revenue excluding GST</div>
                    </div>
                    <div className="step-val text-success">+{SYM}{fmt(grossSales)}</div>
                  </div>

                  {/* Connector */}
                  <div className="pnl-flow-connector minus">
                    <span className="connector-icon">-</span>
                  </div>

                  {/* Step 2: Discounts */}
                  <div className="pnl-cascade-step subtract">
                    <div className="step-badge minus">-</div>
                    <div className="step-body">
                      <div className="step-title-row">
                        <span className="step-title">Discounts</span>
                        <InfoTooltip id="discounts" text="Discounts: Total price reductions granted on orders (item-level + order-level). | Equation: Gross Sales − Net Sales = Discounts" />
                      </div>
                      <div className="step-subtitle">Price reductions, loyalty discounts, & promos</div>
                    </div>
                    <div className="step-val text-pink">-{SYM}{fmt(discounts)}</div>
                  </div>

                  {/* Connector */}
                  <div className="pnl-flow-connector equal">
                    <span className="connector-icon">=</span>
                  </div>

                  {/* Step 3: Net Sales */}
                  <div className="pnl-cascade-step result net-sales">
                    <div className="step-badge equal">=</div>
                    <div className="step-body">
                      <div className="step-title-row">
                        <span className="step-title">Net Sales</span>
                        <InfoTooltip id="netSales" text="Net Sales (Ex-Tax): Revenue after discounts, excluding GST and Round Off. | Equation: Billed Total − GST − Round Off = Net Sales" />
                      </div>
                      <div className="step-subtitle">Post-discount revenue excluding GST</div>
                    </div>
                    <div className="step-val text-blue">{SYM}{fmt(netSales)}</div>
                  </div>
                </>
              ) : (
                <>
                  {/* Step 3: Net Sales as the starting step */}
                  <div className="pnl-cascade-step add net-sales">
                    <div className="step-badge plus">+</div>
                    <div className="step-body">
                      <div className="step-title-row">
                        <span className="step-title">Net Sales</span>
                        <InfoTooltip id="netSales" text="Net Sales (Ex-Tax): Revenue excluding GST and Round Off. | Equation: Billed Total − GST − Round Off = Net Sales" />
                      </div>
                      <div className="step-subtitle">Revenue excluding GST</div>
                    </div>
                    <div className="step-val text-success">+{SYM}{fmt(netSales)}</div>
                  </div>
                </>
              )}

              {/* Connector */}
              <div className="pnl-flow-connector minus">
                <span className="connector-icon">-</span>
              </div>

              {/* Step 4: COGS / Purchases */}
              <div className="pnl-cascade-step subtract">
                <div className="step-badge minus">-</div>
                <div className="step-body">
                  <div className="step-title-row">
                    <span className="step-title">COGS / Purchases</span>
                    <InfoTooltip id="cogs" text="COGS / Purchases: Cost of raw ingredients, stock, and inventory consumed or purchased. | Equation: Net Sales − COGS = Gross Margin" />
                  </div>
                  <div className="step-subtitle">Cost of raw ingredients, stock, & inventory used</div>
                </div>
                <div className="step-val text-orange">-{SYM}{fmt(cogs)}</div>
              </div>

              {/* Connector */}
              <div className="pnl-flow-connector equal">
                <span className="connector-icon">=</span>
              </div>

              {/* Step 5: Gross Margin */}
              <div className="pnl-cascade-step result gross-margin">
                <div className="step-badge equal">=</div>
                <div className="step-body">
                  <div className="step-title-row">
                    <span className="step-title">Gross Margin</span>
                    <InfoTooltip id="grossMargin" text="Gross Margin: Product-level profitability before operating expenses. | Equation: Net Sales − COGS = Gross Margin" />
                  </div>
                  <div className="step-subtitle">Product markup earnings before operational overhead</div>
                </div>
                <div className="step-val text-success">{SYM}{fmt(grossMargin)}</div>
              </div>

              {/* Connector */}
              <div className="pnl-flow-connector minus">
                <span className="connector-icon">-</span>
              </div>

              {/* Step 6: Operating Expenses */}
              <div className="pnl-cascade-step subtract">
                <div className="step-badge minus">-</div>
                <div className="step-body">
                  <div className="step-title-row">
                    <span className="step-title">Operating Expenses</span>
                    <InfoTooltip id="expenses" text="Operating Expenses: General business running costs (rent, salaries, utilities, etc.) excluding COGS. | Equation: Gross Margin − Operating Expenses = Net Profit" />
                  </div>
                  <div className="step-subtitle">General business costs (salaries, rent, utilities, etc.)</div>
                </div>
                <div className="step-val text-red">-{SYM}{fmt(expenses)}</div>
              </div>

              {/* Connector */}
              <div className="pnl-flow-connector equal">
                <span className="connector-icon">=</span>
              </div>

              {/* Step 7: Net Profit */}
              <div className={`pnl-cascade-step final-net-profit ${netProfit >= 0 ? 'profit' : 'loss'}`}>
                <div className="step-badge star">★</div>
                <div className="step-body">
                  <div className="step-title-row">
                    <span className="step-title">Net Profit</span>
                    <InfoTooltip id="netProfit" text="Net Profit: Final business profit for the period (ex-tax). | Equation: Net Sales − COGS − Operating Expenses = Net Profit" />
                  </div>
                  <div className="step-subtitle">Final business profit or loss for the selected period</div>
                </div>
                <div className="step-val">{SYM}{fmt(netProfit)}</div>
              </div>
            </div>
          </div>

          <div className="pnl-side-metrics">
            <div className="pnl-side-header">
              <h3>Cash Flow & Taxes</h3>
              <span className="pnl-flow-sub">Financial liquidity and collection indicators</span>
            </div>
            
            <div className="pnl-side-cards">
              {config?.taxEnabled !== false && (
                <div className="pnl-side-card tax">
                  <div className="side-card-header">
                    <span>Output Tax</span>
                    <InfoTooltip id="outputTax" text="Output Tax (GST): Sales tax collected from customers, payable to the government. NOT part of business revenue. | Equation: Billed Total − Net Sales = Output Tax" />
                  </div>
                  <div className="side-card-val text-purple">{SYM}{fmt(outputTax)}</div>
                  <div className="side-card-desc">Collected sales tax to pay government</div>
                </div>
              )}

              <div className="pnl-side-card receivables">
                <div className="side-card-header">
                  <span>Receivable Balance</span>
                  <InfoTooltip id="creditOutstanding" text="Receivable Balance: Money owed by customers for credit/unpaid sales not yet collected. | Equation: Total Credit Sales − Payments Received = Receivable Balance" />
                </div>
                <div className="side-card-val text-warning">{SYM}{fmt(creditOutstanding)}</div>
                <div className="side-card-desc">Outstanding credit tab balance due from customers</div>
              </div>

              <div className={`pnl-side-card cash-flow ${cashCollected >= 0 ? 'positive' : 'negative'}`}>
                <div className="side-card-header">
                  <span>Cash Collected After Expenses</span>
                  <InfoTooltip id="cashCollected" text="Cash Collected After Expenses: Actual net cash position after paying costs. | Equation: Payment Collected − COGS − Operating Expenses = Cash After Expenses" />
                </div>
                <div className="side-card-val">{SYM}{fmt(cashCollected)}</div>
                <div className="side-card-desc">Actual cash movement (excluding unpaid credit sales)</div>
              </div>
            </div>
          </div>
        </div>

        {reconciliation && (
          <div className="rpt-recon">
            <div className="rpt-recon-header">
              <div className="rpt-recon-title-row">
                <h3>Sales & Payment Reconciliation</h3>
                <InfoTooltip id="recon" text="Sales & Payment Reconciliation: Verifies billed sales against actual payments collected in this period." />
              </div>
              <span className="pnl-flow-sub">Matching invoices and payment transactions</span>
            </div>
            
            <div className="rpt-recon-grid">
              <div className="rpt-recon-card billed">
                <div className="rpt-recon-card-header">
                  <span>Billed Sales</span>
                  <InfoTooltip id="billedSales" text="Billed Sales: Total completed invoices in this period." />
                </div>
                <strong>{SYM}{fmt(reconciliation.billedSalesTotal)}</strong>
                <span className="rpt-recon-card-sub">Completed sales invoices</span>
              </div>

              <div className="rpt-recon-card linked">
                <div className="rpt-recon-card-header">
                  <span>Linked Payments</span>
                  <InfoTooltip id="linkedPayments" text="Linked Payments: Active payments attached directly to billed sales." />
                </div>
                <strong>{SYM}{fmt(reconciliation.linkedSalesPaymentsTotal)}</strong>
                <span className="rpt-recon-card-sub">Payments attached to sales</span>
              </div>

              <div className={`rpt-recon-card other ${otherActivePayments > 0 ? 'warn' : ''}`}>
                <div className="rpt-recon-card-header">
                  <span>Other Active Payments</span>
                  <InfoTooltip id="otherPayments" text="Other Active Payments: Active payments collected but not linked to completed sales." />
                </div>
                <strong>{SYM}{fmt(reconciliation.otherActivePaymentsTotal)}</strong>
                <span className="rpt-recon-card-sub">Unlinked payment entries</span>
              </div>

              <div className="rpt-recon-card collected">
                <div className="rpt-recon-card-header">
                  <span>Payment Collected</span>
                  <InfoTooltip id="collectedPayments" text="Payment Collected: Total payments collected (Linked Payments + Other Active Payments)." />
                </div>
                <strong>{SYM}{fmt(reconciliation.paymentCollectedTotal)}</strong>
                <span className="rpt-recon-card-sub">Total cash/card collected</span>
              </div>
            </div>
            {otherActivePayments > 0 && (
              <div className="rpt-recon-alert">
                Other active payments: {SYM}{fmt(otherActivePayments)}
                {unmatchedPaymentCount > 0 ? ` across ${unmatchedPaymentCount} payment(s)` : ''}. These explain why cash collected can differ from billed sales.
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  const renderHourly = () => {
    const maxAmt = hourly.length ? Math.max(...hourly.map(h => Number(h.totalAmount || 0)), 1) : 1;
    return hourly.length === 0 ? <div className="rpt-empty">No hourly data</div> : (
      <>
        <div className="rpt-toolbar">
          <button className="rpt-exp-btn" onClick={() => exportCSV(
            ['Hour', 'Order Count', 'Total Amount'],
            hourly.map(h => [h.hourLabel, h.orderCount, h.totalAmount].map(csvCell).join(',')),
            'hourly_trends'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-exp-btn" onClick={() => exportExcel(
            hourly.map(h => ({
              'Hour': h.hourLabel,
              'Order Count': h.orderCount,
              'Total Amount': h.totalAmount
            })),
            'Hourly Trends', 'hourly_trends'
          )}><FaFileExcel /> Excel</button>
        </div>
        {/* Premium Styled Hourly Chart */}
        <div className="rpt-chart-card">
          <div className="rpt-chart-header">
            <h4>Sales & Orders by Hour</h4>
            <span className="rpt-chart-sub">Peak operating times and transaction volume</span>
          </div>
          <div className="rpt-chart-container">
            {/* Background grid lines */}
            <div className="rpt-chart-grid-lines">
              <div className="grid-line"><span className="grid-line-label">{SYM}{fmt(maxAmt)}</span></div>
              <div className="grid-line"><span className="grid-line-label">{SYM}{fmt(maxAmt * 0.75)}</span></div>
              <div className="grid-line"><span className="grid-line-label">{SYM}{fmt(maxAmt * 0.50)}</span></div>
              <div className="grid-line"><span className="grid-line-label">{SYM}{fmt(maxAmt * 0.25)}</span></div>
              <div className="grid-line zero"><span className="grid-line-label">{SYM}0.00</span></div>
            </div>
            
            <div className="rpt-hourly-chart">
              {hourly.map((h, i) => {
                const pct = Number(h.totalAmount) / maxAmt * 100;
                return (
                  <div key={i} className="rpt-hour-col">
                    <div className="rpt-hour-bar-area">
                      <div className="rpt-hour-bar" style={{ height: `${pct.toFixed(0)}%` }}>
                        <span className="rpt-hour-tip">
                          <span className="tip-amt">{SYM}{fmt(h.totalAmount)}</span>
                          <span className="tip-orders">{h.orderCount} orders</span>
                        </span>
                      </div>
                    </div>
                    <div className="rpt-hour-label">{h.hourLabel}</div>
                    <div className="rpt-hour-badge">{h.orderCount} ord</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderCredit = () => {
    if (!creditReport) return <div className="rpt-empty">No credit data for selected range</div>;
    const cards = [
      { label: 'Credit Extended', val: `${SYM}${fmt(creditReport.creditExtended)}`, color: '#0f766e', bg: '#ccfbf1' },
      { label: 'Payments Received', val: `${SYM}${fmt(creditReport.paymentsReceived)}`, color: '#16a34a', bg: '#dcfce7' },
      { label: 'Outstanding', val: `${SYM}${fmt(creditReport.outstanding)}`, color: '#dc2626', bg: '#fee2e2' },
      (config?.taxEnabled !== false) && { label: 'Output Tax', val: `${SYM}${fmt(creditReport.outputTax)}`, color: '#6366f1', bg: '#eef2ff' },
      { label: 'Orders / Customers', val: `${Number(creditReport.orderCount || 0)} / ${Number(creditReport.customerCount || 0)}`, color: '#f97316', bg: '#fff7ed' },
    ].filter(Boolean);
    const orders = creditReport.orders || [];
    const paymentsRows = creditReport.payments || [];
    return (
      <>
        <div className="rpt-toolbar">
          <button className="rpt-exp-btn" onClick={() => exportCSV(
            ['Order No', 'Invoice No', 'Customer Name', 'Phone', 'Amount', 'Tax', 'Total', 'Amount Due', 'Date', 'Status'],
            orders.map(o => [
              o.orderNo, o.invoiceNo, o.customerName, o.customerPhone, o.amount, o.tax, o.total, o.amountDue, o.date, o.status
            ].map(csvCell).join(',')),
            'credit_orders'
          )}><FaFileCsv /> Export Credit Orders CSV</button>
          <button className="rpt-exp-btn" onClick={() => exportCSV(
            ['Date', 'Customer Name', 'Payment Method', 'Amount', 'Reference No', 'Description'],
            paymentsRows.map(p => [
              p.transactionDate, p.customerName, p.paymentMethod, p.amount, p.referenceNo, p.description
            ].map(csvCell).join(',')),
            'credit_payments'
          )}><FaFileCsv /> Export Credit Payments CSV</button>
        </div>
        <div className="rpt-kpi-grid">
          {cards.map((card) => (
            <div key={card.label} className="rpt-kpi" style={{ borderLeft: `4px solid ${card.color}` }}>
              <div className="rpt-kpi-icon" style={{ background: card.bg, color: card.color }}><FaBook /></div>
              <div className="rpt-kpi-data">
                <span className="rpt-kpi-label">{card.label}</span>
                <span className="rpt-kpi-val">{card.val}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="rpt-section-title">Credit Orders</div>
        {orders.length === 0 ? <div className="rpt-empty">No credit orders</div> : (
          <div className="rpt-tbl-wrap">
            <table className="rpt-tbl rpt-credit-tbl">
              <thead><tr><th>Order #</th><th>Invoice</th><th>Customer</th><th>Phone</th><th className="r">Amount</th>{config?.taxEnabled !== false && <th className="r">Tax</th>}<th className="r">Total</th><th className="r">Due</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>{orders.map(row => (
                <tr key={row.invoiceId || row.orderId}>
                  <td onClick={(e) => {
                    if (row.orderNo) {
                      e.stopPropagation();
                      viewDocument(row, 'order');
                    }
                  }}>
                    <span className={row.orderNo ? 'rpt-mono-link' : 'rpt-mono'}>
                      {row.orderNo || '—'}
                    </span>
                  </td>
                  <td onClick={(e) => {
                    if (row.invoiceNo) {
                      e.stopPropagation();
                      viewDocument(row, 'invoice');
                    }
                  }}>
                    <span className={row.invoiceNo ? 'rpt-mono-link' : 'rpt-mono'}>
                      {row.invoiceNo || '—'}
                    </span>
                  </td>
                  <td>{row.customerName || '—'}</td>
                  <td>{row.customerPhone || '—'}</td>
                  <td className="r">{SYM}{fmt(row.amount)}</td>
                  {config?.taxEnabled !== false && <td className="r">{SYM}{fmt(row.tax)}</td>}
                  <td className="r rpt-amt">{SYM}{fmt(row.total)}</td>
                  <td className="r">{SYM}{fmt(row.amountDue)}</td>
                  <td>{formatTzDate(row.date, timezone, { format: 'short' })}</td>
                  <td><span className={`rpt-st ${String(row.status || 'unknown').toLowerCase()}`}>{row.status || '—'}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="rpt-section-title">Payment Transactions</div>
        {paymentsRows.length === 0 ? <div className="rpt-empty">No credit payments</div> : (
          <div className="rpt-tbl-wrap">
            <table className="rpt-tbl">
              <thead><tr><th>Payment No</th><th>Date</th><th>Customer</th><th>Method</th><th className="r">Amount</th><th>Description</th></tr></thead>
              <tbody>{paymentsRows.map(row => (
                <tr key={row.paymentId}>
                  <td onClick={(e) => {
                    if (row.paymentId) {
                      e.stopPropagation();
                      viewDocument(row, 'payment');
                    }
                  }}>
                    <span className={row.paymentId ? 'rpt-mono-link' : 'rpt-mono'}>
                      {row.referenceNo || '—'}
                    </span>
                  </td>
                  <td>{formatTzDate(row.transactionDate, timezone, { format: 'short' })}</td>
                  <td>{row.customerName || '—'}</td>
                  <td><span className="rpt-pill">{row.paymentMethod || '—'}</span></td>
                  <td className="r rpt-amt">{SYM}{fmt(row.amount)}</td>
                  <td>{row.description || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </>
    );
  };

  const tabContent = { summary: renderSummary, salesInvoices: renderSalesInvoices, items: renderItems, payments: renderPayments, tax: renderTax, pnl: renderPnL, hourly: renderHourly, credit: renderCredit };

  return (
    <DashboardLayout title="Reports & Billing">
      <div className="rpt-page" onClick={() => setActiveTooltip(null)}>
        <div className="rpt-controls">
          <PremiumDateTimePicker value={dateFrom} onChange={setDateFrom} />
          <span className="rpt-sep">→</span>
          <PremiumDateTimePicker value={dateTo} onChange={setDateTo} />
          {isSuperAdmin && (
            <>
              <span className="rpt-ctrl-sep" />
              <NiceSelect
                value={selectedOrgId}
                onChange={handleOrgChange}
                options={[
                  { value: '', label: 'All Branches' },
                  ...organizations.map(o => ({ value: o.id, label: o.name }))
                ]}
                style={{ minWidth: 140, maxWidth: 170 }}
              />
              <NiceSelect
                value={selectedTerminalId}
                onChange={setSelectedTerminalId}
                options={[
                  { value: '', label: 'All Terminals' },
                  ...filteredTerminals.map(t => ({ value: t.id, label: t.name + (t.terminalCode ? ` (${t.terminalCode})` : '') }))
                ]}
                style={{ minWidth: 140, maxWidth: 170 }}
              />
            </>
          )}
        </div>
        <div className="rpt-tabs">
          {visibleTabs.map(t => (
            <button key={t.key} className={`rpt-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.icon}<span>{t.label}</span>
            </button>
          ))}
        </div>
        {loadError && <div className="rpt-error">{loadError}</div>}
        <div className="rpt-body">
          {loading ? <div className="rpt-loading">Loading report data…</div> : tabContent[tab]?.()}
        </div>
      </div>
      {voidingInvoice && (
        <div className="rpt-modal-overlay" onClick={() => setVoidingInvoice(null)}>
          <div className="rpt-modal" onClick={e => e.stopPropagation()}>
            <h3>Cancel Order</h3>
            <p>Are you sure you want to cancel order <strong>{voidingInvoice.orderNo || 'this order'}</strong>? This will cancel the order and void the invoice.</p>
            <label>Reason</label>
            <textarea
              value={voidReason}
              onChange={e => setVoidReason(e.target.value)}
              rows={2}
              placeholder="e.g. Mistake in order / Client walked away"
            />
            <div className="rpt-modal-actions">
              <button onClick={() => setVoidingInvoice(null)} className="rpt-modal-btn rpt-modal-btn-outline" disabled={voidingInProgress}>
                Cancel
              </button>
              <button onClick={submitVoid} className="rpt-modal-btn rpt-modal-btn-danger" disabled={!voidReason.trim() || voidingInProgress}>
                {voidingInProgress ? '...' : 'Proceed'}
              </button>
            </div>
          </div>
        </div>
      )}
      {viewingDoc && (
        <DocumentViewerPopup
          order={viewingDoc.order}
          docType={viewingDoc.type}
          vendors={[]}
          warehouses={[]}
          timezone={timezone || 'Asia/Kolkata'}
          currencySymbol={SYM}
          formatTzDate={formatTzDate}
          onClose={() => setViewingDoc(null)}
          onViewLinked={(order, type) => setViewingDoc({ order, type })}
          STATUS_CFG={{
            DRAFT:     { label: 'Draft',     color: '#64748b', bg: '#f1f5f9', dot: '#94a3b8', border: '#cbd5e1' },
            BILLED:    { label: 'Billed',    color: '#b45309', bg: '#fffbeb', dot: '#f59e0b', border: '#fde68a' },
            COMPLETED: { label: 'Completed', color: '#059669', bg: '#ecfdf5', dot: '#10b981', border: '#6ee7b7' },
            PAID:      { label: 'Paid',      color: '#059669', bg: '#ecfdf5', dot: '#10b981', border: '#6ee7b7' },
            CANCELLED: { label: 'Cancelled', color: '#dc2626', bg: '#fef2f2', dot: '#ef4444', border: '#fca5a5' },
          }}
          config={config}
          onOrderUpdated={(savedOrder) => {
            loadTab(tab);
          }}
        />
      )}

      <style jsx global>{`
        .rpt-page{padding:0 20px;width:100%}
        .rpt-controls{display:flex;align-items:center;gap:10px;margin-bottom:20px;background:#fff;padding:10px 16px;border-radius:16px;border:1px solid #f1f5f9;box-shadow:0 2px 10px rgba(0,0,0,.02);width:100%}
        .rpt-sep{color:#cbd5e1;font-weight:300;font-size:16px;flex-shrink:0}
        .rpt-ctrl-sep{width:1px;height:24px;background:#e2e8f0;margin:0 4px;flex-shrink:0}
        .rpt-controls :global(.premium-dt-picker){width:230px!important;flex-shrink:0}
        .rpt-tabs{display:flex;gap:4px;margin-bottom:20px;overflow-x:auto;padding:8px 4px;-webkit-overflow-scrolling:touch}
        .rpt-tab{display:flex;align-items:center;gap:6px;padding:10px 16px;border-radius:12px;border:1px solid #f1f5f9;background:#fff;color:#64748b;font-size:11px;font-weight:700;cursor:pointer;transition:.25s;white-space:nowrap}
        .rpt-tab:hover{border-color:#f97316;color:#f97316;transform:translateY(-1px)}
        .rpt-tab.active{background:#f97316;color:#fff;border-color:#f97316;box-shadow:0 4px 12px rgba(249,115,22,.25)}
        .rpt-tab svg{font-size:13px}
        .rpt-tab span{display:inline}
        .rpt-body{min-height:300px}
        .rpt-error{margin-bottom:16px;padding:12px 14px;border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:12px;font-size:12px;font-weight:800}
        .rpt-loading{text-align:center;padding:60px 20px;color:#94a3b8;font-weight:700;font-size:14px}
        .rpt-empty{text-align:center;padding:60px 20px;color:#cbd5e1;font-size:14px;font-weight:600}
        .rpt-toolbar{display:flex;gap:8px;margin-bottom:16px;align-items:center;flex-wrap:wrap}
        .rpt-exp-btn{padding:8px 14px;border-radius:10px;border:1.5px solid #f97316;background:#fff;color:#f97316;font-size:10px;font-weight:800;display:flex;align-items:center;gap:6px;cursor:pointer;transition:.2s}
        .rpt-exp-btn:hover{background:#fff7ed;transform:translateY(-1px)}
        .rpt-exp-btn svg{font-size:12px}
        .rpt-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
        .rpt-kpi{background:#fff;padding:16px;border-radius:16px;border:1px solid #f1f5f9;display:grid;grid-template-areas:"label icon" "value icon";grid-template-columns:1fr auto;grid-template-rows:auto auto;align-items:center;gap:6px 12px;transition:.3s;min-height:90px;box-sizing:border-box}
        .rpt-kpi:hover{transform:translateY(-2px);box-shadow:0 10px 20px rgba(0,0,0,.03)}
        .rpt-kpi-icon{grid-area:icon;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
        .rpt-kpi-data{display:contents}
        .rpt-kpi-label{grid-area:label;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;display:flex;align-items:center;gap:4px}
        .rpt-kpi-val{grid-area:value;font-size:20px;font-weight:800;color:#1e293b;line-height:1.1;word-break:break-word}
        .rpt-tbl-wrap{background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:auto;box-shadow:0 1px 3px rgba(0,0,0,.02)}
        .rpt-tbl{width:100%;border-collapse:collapse;min-width:600px}
        .rpt-combined-tbl{min-width:1420px}
        .rpt-tbl th{background:#fff;padding:8px 16px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #FF7A00}
        .rpt-tbl td{padding:8px 16px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#475569;vertical-align:middle;white-space:nowrap}
        .rpt-tbl tr:last-child td{border-bottom:none}
        .rpt-tbl tbody tr{cursor:default;transition:background .15s}
        .rpt-tbl tbody tr:hover td{background:#fffbf5}
        .rpt-tbl .r{text-align:right}
        .rpt-tbl .voided td{opacity:.5;background:#fef2f2}
        .rpt-mono{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;color:#64748b;background:#f1f5f9;padding:4px 8px;border-radius:6px}
         .rpt-mono-link{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;color:#f97316;background:#fff7ed;padding:4px 8px;border-radius:6px;cursor:pointer;transition:all 0.2s;display:inline-block}
        .rpt-mono-link:hover{background:#ffedd5;color:#ea580c}
        .rpt-branch{font-size:10px;font-weight:800;color:#334155;background:#eef2ff;padding:4px 8px;border-radius:6px;white-space:nowrap}
        .rpt-pill{font-size:9px;font-weight:700;padding:3px 8px;border-radius:20px;background:#f1f5f9;color:#475569;text-transform:uppercase}
        .rpt-pill.tax{background:#eff6ff;color:#3b82f6}
        .rpt-st{font-size:9px;font-weight:800;padding:3px 8px;border-radius:6px;text-transform:uppercase}
        .rpt-st.completed,.rpt-st.paid{background:#ecfdf5;color:#10b981}
        .rpt-st.confirmed,.rpt-st.billed{background:#eff6ff;color:#3b82f6}
        .rpt-st.draft,.rpt-st.pending,.rpt-st.unpaid{background:#fff7ed;color:#f97316}
        .rpt-st.partial{background:#fffbeb;color:#d97706}
        .rpt-st.cancelled,.rpt-st.void,.rpt-st.voided{background:#fef2f2;color:#ef4444}
        .rpt-st.unknown{background:#f8fafc;color:#94a3b8}
        .rpt-amt{font-weight:800;color:#1e293b}
        .rpt-subrows{background:#f8fafc;padding:12px 20px;border-left:4px solid #f97316}
        .rpt-subrow{display:flex;justify-content:space-between;padding:6px 0;font-size:11px;color:#64748b;border-bottom:1px solid #f1f5f9}
        .rpt-subrow:last-child{border-bottom:none}
        .rpt-line-details .rpt-subrow{display:grid;grid-template-columns:minmax(220px,1.4fr) repeat(4,minmax(110px,.7fr));gap:14px;align-items:center}
        .rpt-line-name{display:flex;flex-direction:column;gap:2px}
        .rpt-line-name small{font-size:9px;color:#94a3b8;text-transform:uppercase;font-weight:700}
        .rpt-bar-wrap{width:100%;height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden}
        .rpt-bar{height:100%;background:linear-gradient(90deg,#f97316,#fb923c);border-radius:4px;transition:width .6s ease}
        .rpt-pay-grid{display:flex;flex-wrap:wrap;gap:16px}
        .rpt-pay-card{flex:1 1 260px;max-width:320px;background:#fff;padding:16px;border-radius:16px;border:1px solid #f1f5f9;box-shadow:0 1px 3px rgba(0,0,0,.02);transition:.3s;display:flex;flex-direction:column;gap:12px;box-sizing:border-box}
        .rpt-pay-card:hover{transform:translateY(-4px);box-shadow:0 12px 20px rgba(0,0,0,0.06)}
        .rpt-pay-card-header{display:flex;align-items:center;gap:12px}
        .rpt-pay-icon-box{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
        .rpt-pay-method-info{display:flex;flex-direction:column;gap:2px}
        .rpt-pay-method-name{font-size:12px;font-weight:800;color:#1e293b;text-transform:uppercase;letter-spacing:.3px}
        .rpt-pay-meta{font-size:11px;color:#94a3b8;font-weight:600}
        .rpt-pay-body{display:flex;justify-content:space-between;align-items:baseline}
        .rpt-pay-amt{font-size:22px;font-weight:800;color:#1e293b}
        .rpt-pay-avg{font-size:11px;color:#64748b;font-weight:600}
        .rpt-pay-bar-wrapper{height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden;width:100%}
        .rpt-pay-bar-fill{height:100%;border-radius:3px;transition:width .6s ease}
        .rpt-section-title{margin:22px 0 10px;font-size:13px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:.5px}
        .rpt-credit-tbl{min-width:1180px}
        
        /* Redesigned Profit & Loss Display */
        .pnl-container {
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          gap: 24px;
          margin-bottom: 24px;
        }
        @media (max-width: 1024px) {
          .pnl-container {
            grid-template-columns: 1fr;
          }
        }
        .pnl-main-flow, .pnl-side-metrics {
          background: white;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
          padding: 24px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.02);
        }
        .pnl-flow-header, .pnl-side-header {
          margin-bottom: 20px;
          border-bottom: 1.5px solid #f1f5f9;
          padding-bottom: 12px;
        }
        .pnl-flow-header h3, .pnl-side-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 800;
          color: #0f172a;
        }
        .pnl-flow-sub {
          font-size: 11px;
          color: #94a3b8;
          font-weight: 600;
        }
        
        /* Cascade timeline styling */
        .pnl-cascade {
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .pnl-cascade-step {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          background: #f8fafc;
          border-radius: 16px;
          border: 1.5px solid #f1f5f9;
          transition: all 0.25s ease;
          position: relative;
        }
        .pnl-cascade-step:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(0,0,0,0.04);
          background: #ffffff;
          border-color: #cbd5e1;
        }
        
        /* Different styling for result and final steps */
        .pnl-cascade-step.result {
          background: #f0f7ff;
          border-color: #bfdbfe;
        }
        .pnl-cascade-step.result:hover {
          background: #ffffff;
          border-color: #3b82f6;
        }
        .pnl-cascade-step.final-net-profit {
          background: #f0fdf4;
          border: 2px solid #bbf7d0;
          padding: 20px;
          box-shadow: 0 4px 12px rgba(16,185,129,0.06);
        }
        .pnl-cascade-step.final-net-profit.loss {
          background: #fef2f2;
          border-color: #fecaca;
          box-shadow: 0 4px 12px rgba(239,68,68,0.06);
        }
        .pnl-cascade-step.final-net-profit:hover {
          transform: scale(1.01);
          box-shadow: 0 12px 24px rgba(16,185,129,0.12);
        }
        .pnl-cascade-step.final-net-profit.loss:hover {
          box-shadow: 0 12px 24px rgba(239,68,68,0.12);
        }
        
        /* Step Badge */
        .step-badge {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 13px;
          flex-shrink: 0;
        }
        .step-badge.plus {
          background: #ecfdf5;
          color: #10b981;
          border: 1px solid #a7f3d0;
        }
        .step-badge.minus {
          background: #fdf2f8;
          color: #ec4899;
          border: 1px solid #fbcfe8;
        }
        .step-badge.equal {
          background: #eff6ff;
          color: #3b82f6;
          border: 1px solid #bfdbfe;
        }
        .step-badge.star {
          background: #fef3c7;
          color: #d97706;
          border: 1px solid #fde68a;
          animation: spin-slow 8s linear infinite;
        }
        @keyframes spin-slow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        /* Step Body & Content */
        .step-body {
          display: flex;
          flex-direction: column;
          flex: 1;
        }
        .step-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .step-title {
          font-size: 13.5px;
          font-weight: 700;
          color: #1e293b;
        }
        .step-subtitle {
          font-size: 10.5px;
          color: #64748b;
          font-weight: 500;
          margin-top: 2px;
        }
        .step-val {
          font-size: 16px;
          font-weight: 800;
          text-align: right;
        }
        .pnl-cascade-step.final-net-profit .step-title {
          font-size: 15px;
          font-weight: 800;
        }
        .pnl-cascade-step.final-net-profit .step-val {
          font-size: 20px;
        }
        .pnl-cascade-step.final-net-profit.profit .step-val {
          color: #059669;
        }
        .pnl-cascade-step.final-net-profit.loss .step-val {
          color: #dc2626;
        }
        
        /* Connectors */
        .pnl-flow-connector {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 32px;
          position: relative;
          z-index: 2;
        }
        .pnl-flow-connector::before {
          content: '';
          position: absolute;
          top: 0;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 2.5px;
          background: #e2e8f0;
        }
        .connector-icon {
          position: relative;
          z-index: 3;
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 50%;
          border: 1.5px solid #cbd5e1;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 800;
          color: #64748b;
        }
        .pnl-flow-connector.minus .connector-icon {
          color: #ec4899;
          border-color: #fbcfe8;
          background: #fdf2f8;
        }
        .pnl-flow-connector.equal .connector-icon {
          color: #3b82f6;
          border-color: #bfdbfe;
          background: #eff6ff;
        }
        
        /* Side Metrics Cards */
        .pnl-side-cards {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .pnl-side-card {
          background: #f8fafc;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          padding: 16px;
          transition: all 0.2s;
        }
        .pnl-side-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(0,0,0,0.02);
          background: #fff;
        }
        .side-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11.5px;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .side-card-val {
          font-size: 20px;
          font-weight: 800;
          margin: 8px 0 4px 0;
        }
        .side-card-desc {
          font-size: 10px;
          color: #94a3b8;
          font-weight: 500;
        }
        
        .pnl-side-card.tax {
          border-left: 4px solid #8b5cf6;
        }
        .pnl-side-card.receivables {
          border-left: 4px solid #f59e0b;
        }
        .pnl-side-card.cash-flow.positive {
          border-left: 4px solid #10b981;
        }
        .pnl-side-card.cash-flow.positive .side-card-val {
          color: #10b981;
        }
        .pnl-side-card.cash-flow.negative {
          border-left: 4px solid #ef4444;
        }
        .pnl-side-card.cash-flow.negative .side-card-val {
          color: #ef4444;
        }

        .custom-tooltip-wrapper {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-left: 6px;
        }
        .custom-tooltip-icon {
          color: #94a3b8;
          font-size: 13.5px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .custom-tooltip-icon:hover,
        .custom-tooltip-icon.active {
          color: #f97316;
          transform: scale(1.15);
        }
        .custom-tooltip-box {
          position: absolute;
          bottom: 135%;
          left: 50%;
          transform: translateX(-50%);
          width: 220px;
          background: #ea580c;
          color: #ffffff;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 11.5px;
          font-weight: 600;
          line-height: 1.45;
          box-shadow: 0 10px 20px rgba(234, 88, 12, 0.3), 0 4px 6px rgba(0, 0, 0, 0.05);
          z-index: 1000;
          white-space: normal;
          text-align: left;
          animation: tooltip-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .custom-tooltip-arrow {
          position: absolute;
          bottom: -6px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 6px solid #ea580c;
        }
        @keyframes tooltip-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .text-pink { color: #ec4899; }
        .text-blue { color: #0ea5e9; }
        .text-orange { color: #f97316; }
        .text-red { color: #ef4444; }
        .text-purple { color: #6366f1; }
        .text-warning { color: #d97706; }
        .text-success { color: #10b981; }
        .text-danger { color: #ef4444; }
        .text-muted { color: #94a3b8; }
        
        .rpt-recon {
          margin-top: 24px;
          background: white;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
          padding: 24px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.02);
        }
        .rpt-recon-header {
          margin-bottom: 20px;
          border-bottom: 1.5px solid #f1f5f9;
          padding-bottom: 12px;
        }
        .rpt-recon-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .rpt-recon-title-row h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 800;
          color: #0f172a;
        }
        .rpt-recon-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }
        .rpt-recon-card {
          background: #f8fafc;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          transition: all 0.25s ease;
        }
        .rpt-recon-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(0,0,0,0.03);
          background: #ffffff;
          border-color: #cbd5e1;
        }
        .rpt-recon-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .rpt-recon-card strong {
          font-size: 20px;
          color: #0f172a;
          font-weight: 850;
        }
        .rpt-recon-card-sub {
          font-size: 10px;
          color: #94a3b8;
          font-weight: 600;
        }
        .rpt-recon-card.billed {
          background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
          border: 1.5px solid #bae6fd;
        }
        .rpt-recon-card.billed:hover {
          background: #ffffff;
          border-color: #0ea5e9;
          box-shadow: 0 10px 20px rgba(14, 165, 233, 0.15);
        }
        .rpt-recon-card.billed strong {
          color: #0369a1;
        }
        .rpt-recon-card.billed .rpt-recon-card-header {
          color: #0284c7;
        }
        
        .rpt-recon-card.linked {
          background: linear-gradient(135deg, #f0fdf4, #dcfce7);
          border: 1.5px solid #bbf7d0;
        }
        .rpt-recon-card.linked:hover {
          background: #ffffff;
          border-color: #10b981;
          box-shadow: 0 10px 20px rgba(16, 185, 129, 0.15);
        }
        .rpt-recon-card.linked strong {
          color: #15803d;
        }
        .rpt-recon-card.linked .rpt-recon-card-header {
          color: #16a34a;
        }
        
        .rpt-recon-card.other {
          background: linear-gradient(135deg, #f8fafc, #f1f5f9);
          border: 1.5px solid #e2e8f0;
        }
        .rpt-recon-card.other:hover {
          background: #ffffff;
          border-color: #94a3b8;
          box-shadow: 0 10px 20px rgba(148, 163, 184, 0.15);
        }
        .rpt-recon-card.other strong {
          color: #475569;
        }
        .rpt-recon-card.other .rpt-recon-card-header {
          color: #64748b;
        }
        
        .rpt-recon-card.other.warn {
          background: linear-gradient(135deg, #fff7ed, #ffedd5);
          border: 1.5px solid #fed7aa;
        }
        .rpt-recon-card.other.warn:hover {
          background: #ffffff;
          border-color: #f59e0b;
          box-shadow: 0 10px 20px rgba(245, 158, 11, 0.15);
        }
        .rpt-recon-card.other.warn strong {
          color: #c2410c;
        }
        .rpt-recon-card.other.warn .rpt-recon-card-header {
          color: #ea580c;
        }
        
        .rpt-recon-card.collected {
          background: linear-gradient(135deg, #f5f3ff, #ede9fe);
          border: 1.5px solid #ddd6fe;
        }
        .rpt-recon-card.collected:hover {
          background: #ffffff;
          border-color: #8b5cf6;
          box-shadow: 0 10px 20px rgba(139, 92, 246, 0.15);
        }
        .rpt-recon-card.collected strong {
          color: #6d28d9;
        }
        .rpt-recon-card.collected .rpt-recon-card-header {
          color: #8b5cf6;
        }
        .rpt-recon-alert {
          margin-top: 16px;
          border: 1px solid #fed7aa;
          background: #fff7ed;
          color: #9a3412;
          border-radius: 12px;
          padding: 12px;
          font-size: 11.5px;
          font-weight: 700;
          line-height: 1.4;
        }
        /* Premium Hourly Chart Card */
        .rpt-chart-card {
          background: white;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
          padding: 24px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.02);
          margin-bottom: 20px;
        }
        .rpt-chart-header {
          margin-bottom: 24px;
        }
        .rpt-chart-header h4 {
          margin: 0;
          font-size: 15px;
          font-weight: 800;
          color: #0f172a;
        }
        .rpt-chart-sub {
          font-size: 11px;
          color: #94a3b8;
          font-weight: 600;
        }
        .rpt-chart-container {
          position: relative;
          padding-left: 70px;
          padding-top: 20px;
          margin-top: 10px;
          min-height: 310px;
        }
        .rpt-chart-grid-lines {
          position: absolute;
          inset: 80px 0 50px 70px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          pointer-events: none;
        }
        .grid-line {
          width: 100%;
          border-bottom: 1px dashed #e2e8f0;
          position: relative;
        }
        .grid-line.zero {
          border-bottom: 1.5px solid #cbd5e1;
        }
        .grid-line-label {
          position: absolute;
          left: -70px;
          bottom: -7px;
          width: 60px;
          text-align: right;
          font-size: 9px;
          font-weight: 700;
          color: #94a3b8;
          font-family: 'JetBrains Mono', monospace;
        }
        .rpt-hourly-chart {
          display: flex;
          gap: 16px;
          justify-content: flex-start;
          align-items: flex-end;
          min-height: 250px;
          overflow-x: auto;
          position: relative;
          z-index: 2;
          padding-top: 60px;
          padding-left: 50px;
          padding-right: 50px;
          padding-bottom: 10px;
          -webkit-overflow-scrolling: touch;
        }
        .rpt-hour-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 55px;
          flex-shrink: 0;
        }
        .rpt-hour-bar-area {
          width: 100%;
          height: 180px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          position: relative;
        }
        .rpt-hour-bar {
          width: 24px;
          background: linear-gradient(180deg, #f97316, #fdba74);
          border-radius: 6px 6px 0 0;
          position: relative;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          min-height: 4px;
          box-shadow: 0 4px 10px rgba(249, 115, 22, 0.15);
          cursor: pointer;
        }
        .rpt-hour-bar:hover {
          background: linear-gradient(180deg, #ea580c, #f97316);
          transform: scaleX(1.1);
          box-shadow: 0 6px 15px rgba(234, 88, 12, 0.3);
        }
        .rpt-hour-tip {
          position: absolute;
          bottom: 105%;
          left: 50%;
          transform: translateX(-50%) translateY(4px);
          background: #ea580c;
          color: white;
          padding: 6px 10px;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          opacity: 0;
          pointer-events: none;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 10px 15px -3px rgba(234, 88, 12, 0.3);
          z-index: 10;
          white-space: nowrap;
        }
        .rpt-hour-tip::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 5px solid #ea580c;
        }
        .rpt-hour-bar:hover .rpt-hour-tip {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
        .tip-amt {
          font-size: 10.5px;
          font-weight: 800;
          font-family: 'JetBrains Mono', monospace;
        }
        .tip-orders {
          font-size: 8px;
          font-weight: 700;
          color: #ffedd5;
          text-transform: uppercase;
        }
        .rpt-hour-label {
          font-size: 10px;
          font-weight: 700;
          color: #475569;
          margin-top: 10px;
        }
        .rpt-hour-badge {
          font-size: 8px;
          color: #64748b;
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 8px;
          font-weight: 800;
          margin-top: 4px;
          text-transform: uppercase;
          border: 1px solid #e2e8f0;
        }
        .rpt-void-btn{width:30px;height:30px;border-radius:8px;border:1px solid #fecaca;background:#fff;color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.2s;font-size:12px}
        .rpt-void-btn:hover{background:#fef2f2;transform:scale(1.05)}
        .rpt-modal-overlay{position:fixed;inset:0;background-color:rgba(15,23,42,0.4);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;z-index:10000;padding:12px}
        .rpt-modal{background:white;padding:20px;border-radius:16px;max-width:320px;width:100%;box-shadow:0 12px 24px -10px rgba(0,0,0,0.15);animation:fadeIn 0.2s ease-out}
        .rpt-modal h3{font-size:17px;font-weight:800;color:#0f172a;margin:0 0 8px 0;letter-spacing:-0.01em}
        .rpt-modal p{font-size:12px;color:#64748b;line-height:1.4;margin-bottom:16px}
        .rpt-modal label{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;display:block;margin-bottom:4px}
        .rpt-modal textarea{width:100%;padding:10px;font-size:12px;border-radius:10px;border:1.5px solid #e2e8f0;outline:none;background:#f8fafc;color:#1e293b;margin-bottom:20px;resize:vertical}
        .rpt-modal-actions{display:flex;gap:8px}
        .rpt-modal-btn{flex:1;height:38px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;border:none;transition:all 0.2s}
        .rpt-modal-btn-outline{background:#fff;border:1.5px solid #e2e8f0;color:#64748b}
        .rpt-modal-btn-outline:hover{background:#f8fafc;border-color:#cbd5e1}
        .rpt-modal-btn-danger{background:#ef4444;color:#fff}
        .rpt-modal-btn-danger:hover{background:#dc2626}
        .rpt-modal-btn-danger:disabled{background:#fecaca;cursor:not-allowed}
        @media(max-width:768px){
          .rpt-page{padding:0 4px}
          .rpt-controls{flex-direction:column;align-items:stretch}
          .rpt-dates{flex-direction:column}
          .rpt-dates>:global(.premium-dt-picker){width:100%!important}
          .rpt-tabs{gap:2px}
          .rpt-tab{padding:8px 10px;font-size:10px}
          .rpt-tab span{display:none}
          .rpt-kpi-grid{grid-template-columns:1fr}
          .rpt-pay-grid{grid-template-columns:1fr}
        }
      `}</style>
    </DashboardLayout>
  );
}
