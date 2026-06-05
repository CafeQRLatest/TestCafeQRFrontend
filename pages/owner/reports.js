import React, { useState, useEffect, useMemo, useCallback } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import NiceSelect from '../../components/NiceSelect';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import { formatTzDate, getBusinessNow } from '../../utils/timezoneUtils';
import { publishAccountingDataChanged, subscribeAccountingDataChanged } from '../../utils/accountingRealtime';
import {
  FaChartBar, FaReceipt, FaBoxes, FaCreditCard, FaFileInvoice,
  FaChartLine, FaClock, FaFileCsv, FaFileExcel, FaChevronDown,
  FaChevronRight, FaBan, FaBook
} from 'react-icons/fa';

const TABS = [
  { key: 'summary', label: 'Sales Summary', icon: <FaChartBar /> },
  { key: 'salesInvoices', label: 'Sales & Invoices', icon: <FaReceipt /> },
  { key: 'items', label: 'Item-wise', icon: <FaBoxes /> },
  { key: 'payments', label: 'Payments', icon: <FaCreditCard /> },
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
  const { timezone, orgId } = useAuth();
  const { notify, showConfirm } = useNotification();
  const [tab, setTab] = useState('summary');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const bizNow = getBusinessNow(timezone);
  const getLocalDate = (d = bizNow) => {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  const [dateFrom, setDateFrom] = useState(() => `${getLocalDate()}T00:00`);
  const [dateTo, setDateTo] = useState(() => `${getLocalDate()}T23:59`);

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
  const [expandedTransaction, setExpandedTransaction] = useState(null);
  const [config, setConfig] = useState(null);
  const [creditReport, setCreditReport] = useState(null);
  const [voidingInvoice, setVoidingInvoice] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidingInProgress, setVoidingInProgress] = useState(false);

  const toInstant = (dtLocal) => {
    if (!dtLocal) return undefined;
    try { return new Date(dtLocal + ':00').toISOString(); } catch { return undefined; }
  };

  const loadTab = useCallback(async (t) => {
    setLoading(true);
    setLoadError(null);
    const params = { from: toInstant(dateFrom), to: toInstant(dateTo) };
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
  }, [dateFrom, dateTo, invoiceFilter, notify]);

  useEffect(() => { loadTab(tab); }, [tab, loadTab, orgId]);

  useEffect(() => {
    let active = true;
    api.get('/api/v1/configurations')
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
  }, [orgId, tab]);

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
  const visibleTabs = useMemo(() => (config?.creditEnabled ? [...TABS, CREDIT_TAB] : TABS), [config]);

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

  const handleVoid = (inv) => {
    const invoiceId = inv.invoiceId || inv.id;
    if (!invoiceId) return notify('error', 'No invoice is linked to this row');
    setVoidingInvoice(inv);
    setVoidReason('');
  };

  const submitVoid = async () => {
    if (!voidingInvoice || voidingInProgress) return;
    const invoiceId = voidingInvoice.invoiceId || voidingInvoice.id;
    setVoidingInProgress(true);
    try {
      await api.post(`/api/v1/reports/invoices/${invoiceId}/void`, { reason: voidReason });
      notify('success', 'Invoice voided');
      publishAccountingDataChanged({
        source: 'reports',
        reason: 'invoice-voided',
        invoiceId,
        orderId: voidingInvoice.orderId || null
      });
      setVoidingInvoice(null);
      loadTab('salesInvoices');
    } catch (e) {
      notify('error', e.response?.data?.message || 'Void failed');
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
    const grossSales = billedTotal + discounts - tax;
    const netSales = grossSales - discounts;
    const cards = [
      { label: 'Billed Total', val: `${SYM}${fmt(billedTotal)}`, color: '#10b981', bg: '#ecfdf5' },
      { label: 'Gross Sales', val: `${SYM}${fmt(grossSales)}`, color: '#0ea5e9', bg: '#f0f9ff' },
      { label: 'Net Sales', val: `${SYM}${fmt(netSales)}`, color: '#16a34a', bg: '#f0fdf4' },
      { label: 'Total Orders', val: summary.totalOrders, color: '#3b82f6', bg: '#eff6ff' },
      { label: 'Avg Order Value', val: `${SYM}${fmt(summary.avgOrderValue)}`, color: '#8b5cf6', bg: '#f5f3ff' },
      { label: 'Items Sold', val: summary.itemsSold, color: '#f97316', bg: '#fff7ed' },
      { label: 'Tax', val: `${SYM}${fmt(tax)}`, color: '#ef4444', bg: '#fef2f2' },
      { label: 'Discounts', val: `${SYM}${fmt(discounts)}`, color: '#ec4899', bg: '#fdf2f8' },
    ];
    return (
      <>
        <div className="rpt-toolbar">
          <button className="rpt-exp-btn" onClick={() => exportCSV(
            ['Metric', 'Value'],
            [
              ['Billed Total', billedTotal],
              ['Gross Sales', grossSales],
              ['Net Sales', netSales],
              ['Total Orders', summary.totalOrders],
              ['Avg Order Value', summary.avgOrderValue],
              ['Items Sold', summary.itemsSold],
              ['Tax', tax],
              ['Discounts', discounts]
            ].map(row => row.map(csvCell).join(',')),
            'sales_summary'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-exp-btn" onClick={() => exportExcel(
            [
              { Metric: 'Billed Total', Value: billedTotal },
              { Metric: 'Gross Sales', Value: grossSales },
              { Metric: 'Net Sales', Value: netSales },
              { Metric: 'Total Orders', Value: summary.totalOrders },
              { Metric: 'Avg Order Value', Value: summary.avgOrderValue },
              { Metric: 'Items Sold', Value: summary.itemsSold },
              { Metric: 'Tax', Value: tax },
              { Metric: 'Discounts', Value: discounts }
            ],
            'Sales Summary', 'sales_summary'
          )}><FaFileExcel /> Excel</button>
        </div>
        <div className="rpt-kpi-grid">
          {cards.map((c, i) => (
            <div key={i} className="rpt-kpi" style={{ borderLeft: `4px solid ${c.color}` }}>
              <div className="rpt-kpi-icon" style={{ background: c.bg, color: c.color }}>{TABS[0].icon}</div>
              <div className="rpt-kpi-data">
                <span className="rpt-kpi-label">{c.label}</span>
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
              <th>Order No</th><th>Invoice No</th><th>Date / Time</th><th>Branch</th><th>Customer</th><th>Type / Table</th>
              <th>Order</th><th>Invoice</th><th>Payment</th><th>Method</th>
              <th className="r">Tax</th><th className="r">Discount</th><th className="r">Total</th><th className="r">Due</th><th></th><th></th>
            </tr></thead>
            <tbody>{salesInvoices.map(tx => {
              const rowId = tx.id || tx.orderId || tx.invoiceId;
              const hasLines = tx.lines?.length > 0;
              const expanded = expandedTransaction === rowId;
              const typeLabel = [tx.fulfillmentType || 'SALE', tx.tableNumber ? `Table ${tx.tableNumber}` : null].filter(Boolean).join(' / ');
              const canExpand = hasLines || !!tx.voidReason;
              return (
                <React.Fragment key={rowId}>
                  <tr
                    className={isVoidTransaction(tx) ? 'voided' : ''}
                    onClick={() => canExpand && setExpandedTransaction(expanded ? null : rowId)}
                    style={{cursor: canExpand ? 'pointer' : 'default'}}
                  >
                    <td><span className="rpt-mono">{tx.orderNo || '—'}</span></td>
                    <td><span className="rpt-mono">{tx.invoiceNo || '—'}</span></td>
                    <td>{formatTzDate(tx.transactionDate || tx.orderDate || tx.invoiceDate || tx.createdAt, timezone, { format: 'short' })}</td>
                    <td><span className="rpt-branch">{branchLabel(tx)}</span></td>
                    <td>{tx.customerName || '—'}</td>
                    <td><span className="rpt-pill">{typeLabel}</span></td>
                    <td><span className={`rpt-st ${String(tx.orderStatus || 'unknown').toLowerCase()}`}>{tx.orderStatus || '—'}</span></td>
                    <td><span className={`rpt-st ${String(tx.invoiceStatus || 'unknown').toLowerCase()}`} title={tx.voidReason ? `Reason: ${tx.voidReason}` : undefined}>{tx.invoiceStatus || '—'}</span></td>
                    <td><span className={`rpt-st ${String(tx.paymentStatus || 'unknown').toLowerCase()}`}>{tx.paymentStatus || '—'}</span></td>
                    <td><span className="rpt-pill">{tx.paymentMethod || '—'}</span></td>
                    <td className="r">{SYM}{fmt(tx.totalTaxAmount)}</td>
                    <td className="r">{SYM}{fmt(tx.totalDiscountAmount)}</td>
                    <td className="r rpt-amt">{SYM}{fmt(tx.grandTotal)}</td>
                    <td className="r">{fmtMaybe(tx.amountDue)}</td>
                    <td>{tx.voidable && <button className="rpt-void-btn" onClick={(e) => { e.stopPropagation(); handleVoid(tx); }} title="Void"><FaBan /></button>}</td>
                    <td>{canExpand ? (expanded ? <FaChevronDown /> : <FaChevronRight />) : null}</td>
                  </tr>
                  {expanded && (
                    <tr><td colSpan={16} style={{padding:0}}>
                      <div className="rpt-subrows rpt-line-details">
                        {tx.voidReason && (
                          <div style={{ marginBottom: 12, padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '12px', display: 'inline-block' }}>
                            <strong>Void Reason:</strong> {tx.voidReason}
                          </div>
                        )}
                        {hasLines && tx.lines.map((l, i) => (
                          <div key={i} className="rpt-subrow">
                            <span className="rpt-line-name">
                              <strong>{l.productName || 'Item'}</strong>
                              {l.categoryName && <small>{l.categoryName}</small>}
                            </span>
                            <span>{l.quantity} × {SYM}{fmt(l.unitPrice)}</span>
                            <span>Tax {SYM}{fmt(l.taxAmount)}</span>
                            <span>Disc {SYM}{fmt(l.discountAmount)}</span>
                            <span className="rpt-amt">{SYM}{fmt(l.lineTotal)}</span>
                          </div>
                        ))}
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
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
          {payments.map((p, i) => (
            <div key={i} className="rpt-pay-card">
              <div className="rpt-pay-method">{p.paymentMethod}</div>
              <div className="rpt-pay-amt">{SYM}{fmt(p.totalAmount)}</div>
              <div className="rpt-pay-meta">{p.orderCount} txns · {Number(p.percentage || 0).toFixed(1)}%</div>
              <div className="rpt-pay-bar"><div style={{width:`${p.percentage}%`}} /></div>
            </div>
          ))}
        </div>
      </>
    )
  );

  const renderTax = () => (
    <>
      <div className="rpt-toolbar">
        <button className="rpt-exp-btn" onClick={() => exportCSV(
          ['Tax Rate,Taxable Amount,CGST,SGST,Total Tax,Lines'],
          taxData.map(t => `${t.taxRate}%,${t.taxableAmount},${t.cgst},${t.sgst},${t.totalTax},${t.lineCount}`),
          'tax_report'
        )}><FaFileCsv /> HSN CSV</button>
      </div>
      {taxData.length === 0 ? <div className="rpt-empty">No tax data</div> : (
        <div className="rpt-tbl-wrap">
          <table className="rpt-tbl">
            <thead><tr><th>Tax Slab</th><th className="r">Taxable</th><th className="r">CGST</th><th className="r">SGST</th><th className="r">Total Tax</th><th className="r">Lines</th></tr></thead>
            <tbody>{taxData.map((t, i) => (
              <tr key={i}>
                <td><span className="rpt-pill tax">{Number(t.taxRate)}%</span></td>
                <td className="r">{SYM}{fmt(t.taxableAmount)}</td>
                <td className="r">{SYM}{fmt(t.cgst)}</td>
                <td className="r">{SYM}{fmt(t.sgst)}</td>
                <td className="r rpt-amt">{SYM}{fmt(t.totalTax)}</td>
                <td className="r">{t.lineCount}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );

  const renderPnL = () => {
    if (!pnl) return <div className="rpt-empty">No P&L data</div>;
    const cashCollectedAfterExpenses = pnl.cashCollectedAfterExpenses ?? pnl.netCashProfit;
    const otherActivePayments = Number(reconciliation?.otherActivePaymentsTotal || 0);
    const unmatchedPaymentCount = Number(reconciliation?.unmatchedPaymentCount || 0);
    const rows = [
      { label: 'Gross Sales', val: pnl.grossSales, color: '#10b981', type: '+' },
      { label: 'Discounts', val: pnl.discounts, color: '#ec4899', type: '-' },
      { label: 'Net Sales', val: pnl.netSales, color: '#0ea5e9', type: '=' },
      { label: 'Output Tax', val: pnl.totalTax, color: '#6366f1', type: 'i' },
      { label: 'COGS / Purchases', val: pnl.cogsPurchases, color: '#f97316', type: '-' },
      { label: 'Operating Expenses', val: pnl.operatingExpenses, color: '#ef4444', type: '-' },
      { label: 'Net Profit', val: pnl.netProfit, color: '#0ea5e9', type: '=' },
      { label: 'Receivable Balance', val: pnl.creditOutstanding, color: '#f59e0b', type: 'i' },
      {
        label: 'Cash Collected After Expenses',
        helper: 'Cash movement only, not accounting profit',
        val: cashCollectedAfterExpenses,
        color: Number(cashCollectedAfterExpenses) >= 0 ? '#10b981' : '#ef4444',
        type: '='
      },
    ];

    const exportData = [
      ['Gross Sales', pnl.grossSales],
      ['Discounts', pnl.discounts],
      ['Net Sales', pnl.netSales],
      ['Output Tax', pnl.totalTax],
      ['COGS / Purchases', pnl.cogsPurchases],
      ['Operating Expenses', pnl.operatingExpenses],
      ['Net Profit', pnl.netProfit],
      ['Receivable Balance', pnl.creditOutstanding],
      ['Cash Collected After Expenses', cashCollectedAfterExpenses],
    ];
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
        <div className="rpt-pnl-grid">
          {rows.map((r, i) => (
            <div key={i} className="rpt-pnl-row" style={{ borderLeft: `4px solid ${r.color}` }}>
              <span className="rpt-pnl-type" style={{color: r.color}}>{r.type}</span>
              <span className="rpt-pnl-label">
                {r.label}
                {r.helper && <small>{r.helper}</small>}
              </span>
              <span className="rpt-pnl-val" style={{color: r.color}}>{SYM}{fmt(r.val)}</span>
            </div>
          ))}
        </div>
        {reconciliation && (
          <div className="rpt-recon">
            <div>
              <h3>Sales & Payment Reconciliation</h3>
              <p>Billed sales are completed sale invoices. Linked payments are active payments attached to those sales. Other active payments are counted in cash/accounting but not linked to completed sales in this period.</p>
            </div>
            <div className="rpt-recon-grid">
              <div><span>Billed Sales</span><strong>{SYM}{fmt(reconciliation.billedSalesTotal)}</strong></div>
              <div><span>Linked Payments</span><strong>{SYM}{fmt(reconciliation.linkedSalesPaymentsTotal)}</strong></div>
              <div className={otherActivePayments > 0 ? 'warn' : ''}><span>Other Active Payments</span><strong>{SYM}{fmt(reconciliation.otherActivePaymentsTotal)}</strong></div>
              <div><span>Payment Collected</span><strong>{SYM}{fmt(reconciliation.paymentCollectedTotal)}</strong></div>
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
        <div className="rpt-hourly-chart">
          {hourly.map((h, i) => (
            <div key={i} className="rpt-hour-col">
              <div className="rpt-hour-bar-area">
                <div className="rpt-hour-bar" style={{height:`${(Number(h.totalAmount)/maxAmt*100).toFixed(0)}%`}}>
                  <span className="rpt-hour-tip">{SYM}{fmt(h.totalAmount)}</span>
                </div>
              </div>
              <div className="rpt-hour-label">{h.hourLabel}</div>
              <div className="rpt-hour-cnt">{h.orderCount}</div>
            </div>
          ))}
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
      { label: 'Output Tax', val: `${SYM}${fmt(creditReport.outputTax)}`, color: '#6366f1', bg: '#eef2ff' },
      { label: 'Orders / Customers', val: `${Number(creditReport.orderCount || 0)} / ${Number(creditReport.customerCount || 0)}`, color: '#f97316', bg: '#fff7ed' },
    ];
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
              <thead><tr><th>Order #</th><th>Invoice</th><th>Customer</th><th>Phone</th><th className="r">Amount</th><th className="r">Tax</th><th className="r">Total</th><th className="r">Due</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>{orders.map(row => (
                <tr key={row.invoiceId || row.orderId}>
                  <td><span className="rpt-mono">{row.orderNo || '—'}</span></td>
                  <td><span className="rpt-mono">{row.invoiceNo || '—'}</span></td>
                  <td>{row.customerName || '—'}</td>
                  <td>{row.customerPhone || '—'}</td>
                  <td className="r">{SYM}{fmt(row.amount)}</td>
                  <td className="r">{SYM}{fmt(row.tax)}</td>
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
              <thead><tr><th>Date</th><th>Customer</th><th>Method</th><th className="r">Amount</th><th>Reference</th><th>Description</th></tr></thead>
              <tbody>{paymentsRows.map(row => (
                <tr key={row.paymentId}>
                  <td>{formatTzDate(row.transactionDate, timezone, { format: 'short' })}</td>
                  <td>{row.customerName || '—'}</td>
                  <td><span className="rpt-pill">{row.paymentMethod || '—'}</span></td>
                  <td className="r rpt-amt">{SYM}{fmt(row.amount)}</td>
                  <td><span className="rpt-mono">{row.referenceNo || '—'}</span></td>
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
      <div className="rpt-page">
        <div className="rpt-controls">
          <div className="rpt-dates">
            <PremiumDateTimePicker value={dateFrom} onChange={setDateFrom} />
            <span className="rpt-sep">→</span>
            <PremiumDateTimePicker value={dateTo} onChange={setDateTo} />
          </div>
          <button className="rpt-refresh" onClick={() => loadTab(tab)}>Refresh</button>
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
            <h3>Void Invoice</h3>
            <p>Are you sure you want to void invoice <strong>{voidingInvoice.invoiceNo || 'this invoice'}</strong>? This will cancel the linked order.</p>
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
      <style jsx global>{`
        .rpt-page{padding:0 20px;width:100%}
        .rpt-controls{display:flex;align-items:center;gap:16px;margin-bottom:20px;flex-wrap:wrap;background:#fff;padding:12px 16px;border-radius:16px;border:1px solid #f1f5f9;box-shadow:0 2px 10px rgba(0,0,0,.02)}
        .rpt-dates{display:flex;align-items:center;gap:8px;flex:1}
        .rpt-dates>:global(.premium-dt-picker){width:230px}
        .rpt-sep{color:#cbd5e1;font-weight:300;font-size:18px}
        .rpt-refresh{padding:10px 20px;border-radius:12px;border:1.5px solid #f97316;background:#fff;color:#f97316;font-size:11px;font-weight:800;cursor:pointer;transition:.2s}
        .rpt-refresh:hover{background:#f97316;color:#fff}
        .rpt-tabs{display:flex;gap:4px;margin-bottom:20px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch}
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
        .rpt-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
        .rpt-kpi{background:#fff;padding:20px;border-radius:16px;border:1px solid #f1f5f9;display:flex;align-items:center;gap:16px;transition:.3s}
        .rpt-kpi:hover{transform:translateY(-2px);box-shadow:0 10px 20px rgba(0,0,0,.03)}
        .rpt-kpi-icon{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
        .rpt-kpi-data{display:flex;flex-direction:column}
        .rpt-kpi-label{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px}
        .rpt-kpi-val{font-size:22px;font-weight:800;color:#1e293b}
        .rpt-tbl-wrap{background:#fff;border-radius:16px;border:1px solid #f1f5f9;overflow:auto;box-shadow:0 4px 12px rgba(0,0,0,.02)}
        .rpt-tbl{width:100%;border-collapse:collapse;min-width:600px}
        .rpt-combined-tbl{min-width:1420px}
        .rpt-tbl th{background:#f8fafc;padding:12px 16px;text-align:left;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.8px;border-bottom:1px solid #f1f5f9}
        .rpt-tbl td{padding:14px 16px;border-bottom:1px solid #f8fafc;font-size:12px;color:#475569;vertical-align:middle}
        .rpt-tbl tr:hover td{background:#fcfdfe}
        .rpt-tbl .r{text-align:right}
        .rpt-tbl .voided td{opacity:.5;background:#fef2f2}
        .rpt-mono{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;color:#64748b;background:#f1f5f9;padding:4px 8px;border-radius:6px}
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
        .rpt-pay-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
        .rpt-pay-card{background:#fff;padding:20px;border-radius:16px;border:1px solid #f1f5f9;transition:.3s}
        .rpt-pay-card:hover{transform:translateY(-2px);box-shadow:0 10px 20px rgba(0,0,0,.03)}
        .rpt-pay-method{font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
        .rpt-pay-amt{font-size:24px;font-weight:800;color:#1e293b;margin-bottom:4px}
        .rpt-pay-meta{font-size:11px;color:#94a3b8;font-weight:600;margin-bottom:12px}
        .rpt-pay-bar{height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden}
        .rpt-pay-bar>div{height:100%;background:linear-gradient(90deg,#f97316,#fb923c);border-radius:3px;transition:width .6s}
        .rpt-section-title{margin:22px 0 10px;font-size:13px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:.5px}
        .rpt-credit-tbl{min-width:1180px}
        .rpt-pnl-grid{display:flex;flex-direction:column;gap:12px}
        .rpt-note{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:12px;padding:10px 12px;margin-bottom:12px;font-size:12px;font-weight:700}
        .rpt-pnl-row{background:#fff;padding:20px 24px;border-radius:16px;border:1px solid #f1f5f9;display:flex;align-items:center;gap:16px}
        .rpt-pnl-type{font-size:18px;font-weight:900;width:30px;text-align:center}
        .rpt-pnl-label{flex:1;font-size:14px;font-weight:700;color:#475569;display:flex;flex-direction:column;gap:3px}
        .rpt-pnl-label small{font-size:11px;color:#94a3b8;font-weight:700}
        .rpt-pnl-val{font-size:22px;font-weight:800}
        .rpt-recon{margin-top:16px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:14px}
        .rpt-recon h3{margin:0;font-size:15px;font-weight:900;color:#0f172a}
        .rpt-recon p{margin:6px 0 0;color:#64748b;font-size:12px;font-weight:700;line-height:1.5}
        .rpt-recon-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
        .rpt-recon-grid>div{border:1px solid #eef2f7;background:#f8fafc;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:6px}
        .rpt-recon-grid>div.warn{border-color:#fed7aa;background:#fff7ed}
        .rpt-recon-grid span{font-size:10px;text-transform:uppercase;color:#64748b;font-weight:800;letter-spacing:.4px}
        .rpt-recon-grid strong{font-size:18px;color:#0f172a;font-weight:900}
        .rpt-recon-grid .warn strong{color:#c2410c}
        .rpt-recon-alert{border:1px solid #fed7aa;background:#fff7ed;color:#9a3412;border-radius:12px;padding:10px 12px;font-size:12px;font-weight:800}
        .rpt-hourly-chart{display:flex;gap:4px;align-items:flex-end;padding:20px;background:#fff;border-radius:16px;border:1px solid #f1f5f9;min-height:280px;overflow-x:auto}
        .rpt-hour-col{display:flex;flex-direction:column;align-items:center;flex:1;min-width:36px}
        .rpt-hour-bar-area{width:100%;height:200px;display:flex;align-items:flex-end;justify-content:center}
        .rpt-hour-bar{width:70%;min-width:16px;background:linear-gradient(180deg,#f97316,#fb923c);border-radius:6px 6px 0 0;position:relative;transition:height .6s ease;min-height:4px}
        .rpt-hour-tip{position:absolute;top:-24px;left:50%;transform:translateX(-50%);font-size:8px;font-weight:700;color:#64748b;white-space:nowrap;opacity:0;transition:.2s}
        .rpt-hour-col:hover .rpt-hour-tip{opacity:1}
        .rpt-hour-label{font-size:9px;font-weight:700;color:#64748b;margin-top:8px}
        .rpt-hour-cnt{font-size:8px;color:#cbd5e1;font-weight:600}
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
