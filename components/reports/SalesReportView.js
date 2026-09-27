import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../utils/api';
import NiceSelect from '../NiceSelect';
import { useNotification } from '../../context/NotificationContext';
import { formatTzDate } from '../../utils/timezoneUtils';
import { printUniversal } from '../../utils/printGateway';
import { buildThermalReportText } from '../../utils/thermalReportFormatter';
import {
  FaChartBar, FaReceipt, FaBoxes, FaCreditCard, FaFileInvoice,
  FaChartLine, FaClock, FaFileCsv, FaFileExcel, FaChevronDown,
  FaChevronRight, FaBan, FaBook, FaMoneyBillWave, FaMobileAlt, FaWallet,
  FaInfoCircle, FaCoins, FaTag, FaPrint
} from 'react-icons/fa';

const SALES_TABS = [
  { key: 'summary', label: 'Sales Summary', icon: <FaChartBar /> },
  { key: 'salesInvoices', label: 'Sales & Invoices', icon: <FaReceipt /> },
  { key: 'items', label: 'Item Sales', icon: <FaBoxes /> },
  { key: 'payments', label: 'Payment Methods', icon: <FaCreditCard /> },
  { key: 'tax', label: 'Tax Report', icon: <FaFileInvoice /> },
  { key: 'hourly', label: 'Hourly Trends', icon: <FaClock /> },
];
const CREDIT_TAB = { key: 'credit', label: 'Credit Sales', icon: <FaBook /> };

export default function SalesReportView({
  dateFrom,
  dateTo,
  selectedOrgId,
  selectedTerminalId,
  config,
  isSuperAdmin,
  timezone,
  SYM = '₹',
  viewDocument: propViewDoc,
  onViewDoc,
  handleVoid: propHandleVoid,
  onVoidInvoice
}) {
  const viewDocument = propViewDoc || onViewDoc;
  const handleVoid = propHandleVoid || onVoidInvoice;
  const { notify } = useNotification();
  const [subTab, setSubTab] = useState('summary');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Sales data
  const [summary, setSummary] = useState(null);
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [taxData, setTaxData] = useState([]);
  const [hourly, setHourly] = useState([]);
  const [creditReport, setCreditReport] = useState(null);

  const [invoiceFilter, setInvoiceFilter] = useState('ALL');
  const [invoicePage, setInvoicePage] = useState(0);
  const [expandedInvoice, setExpandedInvoice] = useState(null);
  const INVOICE_PAGE_SIZE = 25;

  const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const branchLabel = (tx) => tx?.branchName || tx?.branchCode || (tx?.branchId ? String(tx.branchId).slice(0, 8) : '—');

  const visibleTabs = useMemo(() => {
    let list = SALES_TABS;
    if (config && !config.taxEnabled) {
      list = SALES_TABS.filter(t => t.key !== 'tax');
    }
    return config?.creditEnabled ? [...list, CREDIT_TAB] : list;
  }, [config]);

  const toInstant = (dtLocal) => {
    if (!dtLocal) return undefined;
    try { return new Date(dtLocal + ':00').toISOString(); } catch { return undefined; }
  };

  const loadSubTab = useCallback(async (t) => {
    setLoading(true);
    setLoadError(null);
    const params = { from: toInstant(dateFrom), to: toInstant(dateTo) };
    if (isSuperAdmin && selectedOrgId) params.orgId = selectedOrgId;
    if (isSuperAdmin && selectedTerminalId) params.terminalId = selectedTerminalId;

    try {
      const ep = {
        summary: '/api/v1/reports/sales-summary',
        salesInvoices: '/api/v1/reports/sales-invoices',
        items: '/api/v1/reports/item-wise',
        payments: '/api/v1/reports/payment-breakdown',
        tax: '/api/v1/reports/tax-summary',
        hourly: '/api/v1/reports/hourly',
        credit: '/api/v1/credit/report',
      }[t];
      if (!ep) return;

      const p = t === 'salesInvoices' ? { ...params, type: invoiceFilter } : params;
      const res = await api.get(ep, { params: p });
      if (res.data?.success) {
        const d = res.data.data;
        if (t === 'summary') setSummary(d);
        else if (t === 'salesInvoices') { setSalesInvoices(d || []); setInvoicePage(0); }
        else if (t === 'items') setItems(d || []);
        else if (t === 'payments') setPayments(d || []);
        else if (t === 'tax') setTaxData(d || []);
        else if (t === 'hourly') setHourly(d || []);
        else if (t === 'credit') setCreditReport(d || null);
      }
    } catch (e) {
      console.error('Sales report load error:', e);
      const msg = e?.response?.data?.message || 'Failed to load sales report';
      setLoadError(msg);
      notify('error', msg);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, invoiceFilter, isSuperAdmin, selectedOrgId, selectedTerminalId, notify]);

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

  const handlePrint = async (tabKey) => {
    let dataToPrint = null;
    switch (tabKey) {
      case 'summary': dataToPrint = summary; break;
      case 'items': dataToPrint = items; break;
      case 'payments': dataToPrint = payments; break;
      case 'tax': dataToPrint = taxData; break;
      case 'hourly': dataToPrint = hourly; break;
      case 'credit': dataToPrint = creditReport; break;
      default: return;
    }
    const text = buildThermalReportText(tabKey, dataToPrint, config, timezone, { start: dateFrom, end: dateTo });
    try {
      await printUniversal({ text, jobKind: 'bill', allowSystemDialog: true });
    } catch (e) {
      notify('error', e.message || 'Printer not configured');
    }
  };

  // Render Sub Tabs
  const renderSummary = () => {
    if (!summary) return <div className="rpt-sales-empty">No data for selected range</div>;
    const billedTotal = Number(summary.grandTotal || 0);
    const discounts = Number(summary.totalDiscount || 0);
    const tax = Number(summary.totalTax || 0);
    const roundOff = Number(summary.totalRoundOff || 0);
    const netSales = billedTotal - tax - roundOff;
    const grossSales = netSales + discounts;

    const cards = [
      { label: 'Billed Total', val: `${SYM}${fmt(billedTotal)}`, color: '#10b981', bg: '#ecfdf5', icon: <FaReceipt /> },
      (config?.discountEnabled !== false) && { label: 'Gross Sales', val: `${SYM}${fmt(grossSales)}`, color: '#0ea5e9', bg: '#f0f9ff', icon: <FaChartBar /> },
      { label: 'Net Sales', val: `${SYM}${fmt(netSales)}`, color: '#16a34a', bg: '#f0fdf4', icon: <FaChartLine /> },
      { label: 'Total Orders', val: summary.totalOrders, color: '#3b82f6', bg: '#eff6ff', icon: <FaReceipt /> },
      { label: 'Avg Order Value', val: `${SYM}${fmt(summary.avgOrderValue)}`, color: '#8b5cf6', bg: '#f5f3ff', icon: <FaChartLine /> },
      { label: 'Items Sold', val: summary.itemsSold, color: '#f97316', bg: '#fff7ed', icon: <FaBoxes /> },
      (config?.taxEnabled !== false) && { label: 'Tax', val: `${SYM}${fmt(tax)}`, color: '#ef4444', bg: '#fef2f2', icon: <FaFileInvoice /> },
      (config?.discountEnabled !== false) && { label: 'Discounts', val: `${SYM}${fmt(discounts)}`, color: '#ec4899', bg: '#fdf2f8', icon: <FaTag /> },
      (config?.roundOffEnabled !== false) && { label: 'Round Off', val: `${SYM}${fmt(roundOff)}`, color: '#64748b', bg: '#f1f5f9', icon: <FaCoins /> }
    ].filter(Boolean);

    return (
      <>
        <div className="rpt-sales-toolbar">
          <button className="rpt-sales-btn" onClick={() => exportCSV(
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
          <button className="rpt-sales-btn" onClick={() => exportExcel(
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
          <button className="rpt-sales-btn" onClick={() => handlePrint('summary')}><FaPrint /> Print</button>
        </div>
        <div className="rpt-sales-kpi-grid">
          {cards.map((c, i) => (
            <div key={i} className="rpt-sales-kpi" style={{ borderLeft: `4px solid ${c.color}` }}>
              <div className="rpt-sales-kpi-icon" style={{ background: c.bg, color: c.color }}>{c.icon}</div>
              <div className="rpt-sales-kpi-data">
                <span className="rpt-sales-kpi-label">{c.label}</span>
                <span className="rpt-sales-kpi-val">{c.val}</span>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderSalesInvoices = () => {
    const invoiceTotalPages = Math.ceil(salesInvoices.length / INVOICE_PAGE_SIZE) || 1;
    const pagedInvoices = salesInvoices.slice(invoicePage * INVOICE_PAGE_SIZE, (invoicePage + 1) * INVOICE_PAGE_SIZE);

    return (
      <>
        <div className="rpt-sales-toolbar">
          <NiceSelect
            value={invoiceFilter}
            onChange={(v) => { setInvoiceFilter(v); setInvoicePage(0); }}
            options={[
              { value: 'ALL', label: 'All Sales' },
              { value: 'PAID', label: 'Paid' },
              { value: 'CREDIT', label: 'Credit/Unpaid' },
              { value: 'VOIDED', label: 'Voided' }
            ]}
            style={{ width: 170 }}
          />
          <button className="rpt-sales-btn" onClick={() => {
            const headers = ['Order No', 'Invoice No', 'Date', 'Branch', 'Customer', 'Type', 'Table', 'Status', 'Total', 'Amount Due'];
            const rows = salesInvoices.map(tx => [
              tx.orderNo, tx.invoiceNo, tx.transactionDate, branchLabel(tx), tx.customerName, tx.fulfillmentType, tx.tableNumber,
              tx.invoiceStatus || tx.orderStatus, tx.grandTotal || 0, tx.amountDue || 0
            ].map(csvCell).join(','));
            exportCSV(headers, rows, 'sales_invoices');
          }}><FaFileCsv /> CSV</button>
          <button className="rpt-sales-btn" onClick={() => exportExcel(
            salesInvoices.map(tx => ({
              'Order No': tx.orderNo,
              'Invoice No': tx.invoiceNo,
              'Date': tx.transactionDate,
              'Branch': branchLabel(tx),
              'Customer': tx.customerName,
              'Total': Number(tx.grandTotal || 0),
              'Due': Number(tx.amountDue || 0)
            })),
            'Invoices', 'sales_invoices'
          )}><FaFileExcel /> Excel</button>
        </div>

        {salesInvoices.length === 0 ? <div className="rpt-sales-empty">No invoices found</div> : (
          <>
            <div className="rpt-sales-tbl-wrap">
              <table className="rpt-sales-tbl">
                <thead>
                  <tr>
                    <th style={{ width: 30 }}></th>
                    <th>Order No</th>
                    <th>Invoice No</th>
                    <th>Date</th>
                    <th>Branch</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th className="r">Amount</th>
                    <th className="r">Due</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedInvoices.map((tx, idx) => {
                    const isExp = expandedInvoice === (tx.invoiceId || tx.id || idx);
                    const isVoided = ['VOID', 'VOIDED'].includes(String(tx.invoiceStatus || tx.orderStatus || '').toUpperCase());
                    return (
                      <React.Fragment key={tx.invoiceId || tx.id || idx}>
                        <tr className={isVoided ? 'voided' : ''}>
                          <td>
                            <button
                              className="rpt-sales-expand-btn"
                              onClick={() => setExpandedInvoice(isExp ? null : (tx.invoiceId || tx.id || idx))}
                            >
                              {isExp ? <FaChevronDown /> : <FaChevronRight />}
                            </button>
                          </td>
                          <td>
                            <span className="rpt-sales-mono-link" onClick={() => viewDocument && viewDocument(tx, 'order')}>
                              {tx.orderNo || '—'}
                            </span>
                          </td>
                          <td>
                            <span className="rpt-sales-mono-link" onClick={() => viewDocument && viewDocument(tx, 'invoice')}>
                              {tx.invoiceNo || '—'}
                            </span>
                          </td>
                          <td>{formatTzDate(tx.transactionDate, timezone, { format: 'short' })}</td>
                          <td><span className="rpt-sales-branch">{branchLabel(tx)}</span></td>
                          <td>{tx.customerName || 'Walk-in'}</td>
                          <td>
                            <span className={`rpt-sales-st ${(tx.invoiceStatus || tx.orderStatus || '').toLowerCase()}`}>
                              {tx.invoiceStatus || tx.orderStatus || '—'}
                            </span>
                          </td>
                          <td className="r rpt-sales-amt">{SYM}{fmt(tx.grandTotal)}</td>
                          <td className="r" style={{ color: Number(tx.amountDue || 0) > 0 ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                            {SYM}{fmt(tx.amountDue || 0)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                className="rpt-sales-btn"
                                style={{ padding: '3px 8px', fontSize: '10px' }}
                                onClick={() => viewDocument && viewDocument(tx, 'invoice')}
                              >
                                View
                              </button>
                              {!isVoided && handleVoid && (
                                <button
                                  className="rpt-sales-btn-danger"
                                  title="Cancel/Void Order"
                                  onClick={() => handleVoid(tx)}
                                >
                                  <FaBan />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExp && tx.lines && tx.lines.length > 0 && (
                          <tr>
                            <td colSpan={10} style={{ padding: '0', background: '#f8fafc' }}>
                              <div className="rpt-sales-subrows">
                                {tx.lines.map((line, lIdx) => (
                                  <div key={lIdx} className="rpt-sales-subrow">
                                    <span>{line.productName} ({line.quantity} × {SYM}{fmt(line.unitPrice)})</span>
                                    <span style={{ fontWeight: 700 }}>{SYM}{fmt(line.lineTotal)}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {invoiceTotalPages > 1 && (
              <div className="rpt-sales-pagination">
                <button
                  className="rpt-sales-btn"
                  disabled={invoicePage === 0}
                  onClick={() => setInvoicePage(p => p - 1)}
                >
                  Previous
                </button>
                <span>Page {invoicePage + 1} of {invoiceTotalPages}</span>
                <button
                  className="rpt-sales-btn"
                  disabled={invoicePage >= invoiceTotalPages - 1}
                  onClick={() => setInvoicePage(p => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </>
    );
  };

  const renderItems = () => {
    return (
      <>
        <div className="rpt-sales-toolbar">
          <button className="rpt-sales-btn" onClick={() => exportCSV(
            ['Product Name,Category,Qty Sold,Revenue'],
            items.map(i => [i.productName, i.categoryName, i.quantitySold, i.revenue].map(csvCell).join(',')),
            'item_sales'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-sales-btn" onClick={() => exportExcel(
            items.map(i => ({
              'Product Name': i.productName,
              'Category': i.categoryName,
              'Qty Sold': Number(i.quantitySold || 0),
              'Revenue': Number(i.revenue || 0)
            })),
            'Item Sales', 'item_sales'
          )}><FaFileExcel /> Excel</button>
          <button className="rpt-sales-btn" onClick={() => handlePrint('items')}><FaPrint /> Print</button>
        </div>

        {items.length === 0 ? <div className="rpt-sales-empty">No items sold</div> : (
          <div className="rpt-sales-tbl-wrap">
            <table className="rpt-sales-tbl">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th className="r">Qty Sold</th>
                  <th className="r">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 700, color: '#1e293b' }}>{item.productName}</td>
                    <td><span className="rpt-sales-pill">{item.categoryName || 'General'}</span></td>
                    <td className="r" style={{ fontWeight: 600 }}>{item.uomPrecision != null ? Number(item.quantitySold || 0).toFixed(item.uomPrecision) : Number(item.quantitySold || 0)}</td>
                    <td className="r rpt-sales-amt">{SYM}{fmt(item.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  };

  const renderPayments = () => {
    return (
      <>
        <div className="rpt-sales-toolbar">
          <button className="rpt-sales-btn" onClick={() => exportCSV(
            ['Payment Method,Total Amount,Order Count,Percentage'],
            payments.map(p => [p.paymentMethod, p.totalAmount, p.orderCount, `${Number(p.percentage || 0).toFixed(1)}%`].map(csvCell).join(',')),
            'payments_breakdown'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-sales-btn" onClick={() => exportExcel(
            payments.map(p => ({
              'Payment Method': p.paymentMethod,
              'Total Amount': p.totalAmount,
              'Order Count': p.orderCount,
              'Percentage': `${Number(p.percentage || 0).toFixed(1)}%`
            })),
            'Payments Breakdown', 'payments_breakdown'
          )}><FaFileExcel /> Excel</button>
          <button className="rpt-sales-btn" onClick={() => handlePrint('payments')}><FaPrint /> Print</button>
        </div>

        <div className="rpt-sales-pay-grid">
          {payments.map((p, i) => {
            const method = String(p.paymentMethod || '').toUpperCase();
            let theme = { color: '#6366f1', bg: '#f5f3ff', grad: 'linear-gradient(135deg, #8b5cf6, #6366f1)', icon: <FaWallet /> };
            if (method.includes('CASH')) {
              theme = { color: '#10b981', bg: '#ecfdf4', grad: 'linear-gradient(135deg, #10b981, #059669)', icon: <FaMoneyBillWave /> };
            } else if (method.includes('CARD') || method.includes('DEBIT') || method.includes('CREDIT')) {
              theme = { color: '#3b82f6', bg: '#eff6ff', grad: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', icon: <FaCreditCard /> };
            } else if (method.includes('ONLINE') || method.includes('UPI')) {
              theme = { color: '#ea580c', bg: '#fff7ed', grad: 'linear-gradient(135deg, #f97316, #ea580c)', icon: <FaMobileAlt /> };
            }
            const avgAmount = p.orderCount > 0 ? Number(p.totalAmount || 0) / p.orderCount : 0;

            return (
              <div key={i} className="rpt-sales-pay-card" style={{ borderTop: `4px solid ${theme.color}` }}>
                <div className="rpt-sales-pay-card-header">
                  <div className="rpt-sales-pay-icon-box" style={{ background: theme.bg, color: theme.color }}>
                    {theme.icon}
                  </div>
                  <div className="rpt-sales-pay-method-info">
                    <span className="rpt-sales-pay-method-name">{p.paymentMethod}</span>
                    <span className="rpt-sales-pay-meta">{p.orderCount} txns · {Number(p.percentage || 0).toFixed(1)}%</span>
                  </div>
                </div>
                <div className="rpt-sales-pay-body">
                  <div className="rpt-sales-pay-amt">{SYM}{fmt(p.totalAmount)}</div>
                  <div className="rpt-sales-pay-avg">Avg: {SYM}{fmt(avgAmount)}</div>
                </div>
                <div className="rpt-sales-pay-bar-wrapper">
                  <div className="rpt-sales-pay-bar-fill" style={{ width: `${p.percentage}%`, background: theme.grad }} />
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  const renderTax = () => (
    <>
      <div className="rpt-sales-toolbar">
        <button className="rpt-sales-btn" onClick={() => exportCSV(
          ['Tax Rate,Taxable Amount,CGST,SGST,Total Tax'],
          taxData.map(t => `${t.taxRate}%,${t.taxableAmount},${t.cgst},${t.sgst},${t.totalTax}`),
          'tax_report'
        )}><FaFileCsv /> HSN CSV</button>
        <button className="rpt-sales-btn" onClick={() => handlePrint('tax')}><FaPrint /> Print</button>
      </div>
      {taxData.length === 0 ? <div className="rpt-sales-empty">No tax data</div> : (
        <div className="rpt-sales-tbl-wrap">
          <table className="rpt-sales-tbl">
            <thead>
              <tr><th>Tax Slab</th><th className="r">Taxable</th><th className="r">CGST</th><th className="r">SGST</th><th className="r">Total Tax</th></tr>
            </thead>
            <tbody>
              {taxData.map((t, i) => (
                <tr key={i}>
                  <td><span className="rpt-sales-pill">{Number(t.taxRate)}%</span></td>
                  <td className="r">{SYM}{fmt(t.taxableAmount)}</td>
                  <td className="r">{SYM}{fmt(t.cgst)}</td>
                  <td className="r">{SYM}{fmt(t.sgst)}</td>
                  <td className="r rpt-sales-amt">{SYM}{fmt(t.totalTax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  const renderHourly = () => {
    const maxAmt = hourly.length ? Math.max(...hourly.map(h => Number(h.totalAmount || 0)), 1) : 1;
    return hourly.length === 0 ? <div className="rpt-sales-empty">No hourly data</div> : (
      <>
        <div className="rpt-sales-toolbar">
          <button className="rpt-sales-btn" onClick={() => exportCSV(
            ['Hour', 'Order Count', 'Total Amount'],
            hourly.map(h => [h.hourLabel, h.orderCount, h.totalAmount].map(csvCell).join(',')),
            'hourly_trends'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-sales-btn" onClick={() => exportExcel(
            hourly.map(h => ({ 'Hour': h.hourLabel, 'Order Count': h.orderCount, 'Total Amount': h.totalAmount })),
            'Hourly Trends', 'hourly_trends'
          )}><FaFileExcel /> Excel</button>
          <button className="rpt-sales-btn" onClick={() => handlePrint('hourly')}><FaPrint /> Print</button>
        </div>

        <div className="rpt-sales-chart-card">
          <div className="rpt-sales-chart-header">
            <h4>Hourly Sales & Order Volume</h4>
          </div>
          <div className="rpt-sales-chart-body">
            {hourly.map((h, i) => {
              const amt = Number(h.totalAmount || 0);
              const heightPct = Math.max(Math.round((amt / maxAmt) * 100), 4);
              return (
                <div key={i} className="rpt-sales-hour-col">
                  <div className="rpt-sales-hour-bar-area">
                    <div className="rpt-sales-hour-bar" style={{ height: `${heightPct}%` }}>
                      <div className="rpt-sales-hour-tip">
                        <span>{SYM}{fmt(amt)}</span>
                        <span>{h.orderCount || 0} orders</span>
                      </div>
                    </div>
                  </div>
                  <span className="rpt-sales-hour-label">{h.hourLabel || `${h.hour}:00`}</span>
                  <span className="rpt-sales-hour-badge">{h.orderCount}</span>
                </div>
              );
            })}
          </div>
        </div>
      </>
    );
  };

  const renderCredit = () => {
    if (!creditReport) return <div className="rpt-sales-empty">No credit sales data</div>;
    const { summary: cSummary, sales = [], payments: cPayments = [] } = creditReport;
    return (
      <>
        <div className="rpt-sales-toolbar">
          <button className="rpt-sales-btn" onClick={() => exportCSV(
            ['Customer', 'Phone', 'Total Invoiced', 'Outstanding Balance'],
            sales.map(s => [s.customerName, s.customerPhone, s.total, s.amountDue].map(csvCell).join(',')),
            'credit_sales'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-sales-btn" onClick={() => handlePrint('credit')}><FaPrint /> Print</button>
        </div>
        <div className="rpt-sales-kpi-grid">
          <div className="rpt-sales-kpi" style={{ borderLeft: '4px solid #f59e0b' }}>
            <div className="rpt-sales-kpi-icon" style={{ background: '#fffbeb', color: '#f59e0b' }}><FaBook /></div>
            <div className="rpt-sales-kpi-data">
              <span className="rpt-sales-kpi-label">Credit Receivables</span>
              <span className="rpt-sales-kpi-val">{SYM}{fmt(cSummary?.totalOutstanding)}</span>
            </div>
          </div>
          <div className="rpt-sales-kpi" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="rpt-sales-kpi-icon" style={{ background: '#ecfdf5', color: '#10b981' }}><FaCoins /></div>
            <div className="rpt-sales-kpi-data">
              <span className="rpt-sales-kpi-label">Total Collected</span>
              <span className="rpt-sales-kpi-val">{SYM}{fmt(cSummary?.totalCollected)}</span>
            </div>
          </div>
        </div>
      </>
    );
  };

  const subTabContent = {
    summary: renderSummary,
    salesInvoices: renderSalesInvoices,
    items: renderItems,
    payments: renderPayments,
    tax: renderTax,
    hourly: renderHourly,
    credit: renderCredit
  };

  return (
    <div className="rpt-sales-view">
      <div className="rpt-sales-subtabs">
        {visibleTabs.map(t => (
          <button
            key={t.key}
            className={`rpt-sales-subtab ${subTab === t.key ? 'active' : ''}`}
            onClick={() => setSubTab(t.key)}
            title={t.label}
          >
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </div>

      {loadError && <div className="rpt-sales-error">{loadError}</div>}

      <div className="rpt-sales-body">
        {loading ? (
          <div className="rpt-sales-loading">Loading sales records…</div>
        ) : (
          subTabContent[subTab]?.()
        )}
      </div>

      <style jsx global>{`
        .rpt-sales-view { width: 100%; display: flex; flex-direction: column; gap: 14px; }
        .rpt-sales-subtabs { display: flex; gap: 4px; overflow-x: auto; padding: 4px 0 10px; -webkit-overflow-scrolling: touch; }
        .rpt-sales-subtab { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 10px; border: 1px solid #e2e8f0; background: #fff; color: #64748b; font-size: 11px; font-weight: 700; cursor: pointer; transition: .2s; white-space: nowrap; }
        .rpt-sales-subtab:hover { border-color: #f97316; color: #f97316; }
        .rpt-sales-subtab.active { background: #f97316; color: #fff; border-color: #f97316; box-shadow: 0 4px 10px rgba(249,115,22,.2); }

        .rpt-sales-toolbar { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; flex-wrap: wrap; }
        .rpt-sales-btn { padding: 8px 14px; border-radius: 10px; border: 1.5px solid #f97316; background: #fff; color: #f97316; font-size: 10px; font-weight: 800; display: flex; align-items: center; gap: 6px; cursor: pointer; transition: .2s; }
        .rpt-sales-btn:hover { background: #fff7ed; transform: translateY(-1px); }
        .rpt-sales-btn-danger { width: 28px; height: 28px; border-radius: 8px; border: 1px solid #fecaca; background: #fff; color: #ef4444; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: .2s; font-size: 11px; }
        .rpt-sales-btn-danger:hover { background: #fef2f2; }

        .rpt-sales-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
        .rpt-sales-kpi { background: #fff; padding: 16px; border-radius: 16px; border: 1px solid #f1f5f9; display: grid; grid-template-areas: "label icon" "value icon"; grid-template-columns: 1fr auto; align-items: center; gap: 6px 12px; min-height: 85px; }
        .rpt-sales-kpi:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(0,0,0,.03); }
        .rpt-sales-kpi-icon { grid-area: icon; width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .rpt-sales-kpi-data { display: contents; }
        .rpt-sales-kpi-label { grid-area: label; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .5px; }
        .rpt-sales-kpi-val { grid-area: value; font-size: 20px; font-weight: 850; color: #1e293b; }

        .rpt-sales-tbl-wrap { background: #fff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: auto; box-shadow: 0 1px 3px rgba(0,0,0,.02); }
        .rpt-sales-tbl { width: 100%; border-collapse: collapse; min-width: 600px; }
        .rpt-sales-tbl th { background: #fff; padding: 8px 16px; text-align: left; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #FF7A00; }
        .rpt-sales-tbl td { padding: 8px 16px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #475569; vertical-align: middle; white-space: nowrap; }
        .rpt-sales-tbl .r { text-align: right; }
        .rpt-sales-tbl .voided td { opacity: .5; background: #fef2f2; }
        .rpt-sales-mono-link { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; color: #f97316; background: #fff7ed; padding: 4px 8px; border-radius: 6px; cursor: pointer; }
        .rpt-sales-mono-link:hover { background: #ffedd5; }
        .rpt-sales-branch { font-size: 10px; font-weight: 800; color: #334155; background: #eef2ff; padding: 4px 8px; border-radius: 6px; }
        .rpt-sales-pill { font-size: 9px; font-weight: 700; padding: 3px 8px; border-radius: 20px; background: #f1f5f9; color: #475569; text-transform: uppercase; }
        .rpt-sales-st { font-size: 9px; font-weight: 800; padding: 3px 8px; border-radius: 6px; text-transform: uppercase; }
        .rpt-sales-st.completed, .rpt-sales-st.paid { background: #ecfdf5; color: #10b981; }
        .rpt-sales-st.billed { background: #eff6ff; color: #3b82f6; }
        .rpt-sales-st.cancelled, .rpt-sales-st.voided { background: #fef2f2; color: #ef4444; }
        .rpt-sales-amt { font-weight: 800; color: #1e293b; }
        .rpt-sales-expand-btn { border: none; background: transparent; cursor: pointer; color: #64748b; font-size: 10px; }
        .rpt-sales-subrows { background: #f8fafc; padding: 10px 16px; }
        .rpt-sales-subrow { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px; color: #475569; border-bottom: 1px dashed #e2e8f0; }

        .rpt-sales-pay-grid { display: flex; flex-wrap: wrap; gap: 16px; }
        .rpt-sales-pay-card { flex: 1 1 260px; max-width: 320px; background: #fff; padding: 16px; border-radius: 16px; border: 1px solid #f1f5f9; box-shadow: 0 1px 3px rgba(0,0,0,.02); display: flex; flex-direction: column; gap: 12px; }
        .rpt-sales-pay-card-header { display: flex; align-items: center; gap: 12px; }
        .rpt-sales-pay-icon-box { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .rpt-sales-pay-method-info { display: flex; flex-direction: column; gap: 2px; }
        .rpt-sales-pay-method-name { font-size: 12px; font-weight: 800; color: #1e293b; text-transform: uppercase; }
        .rpt-sales-pay-meta { font-size: 11px; color: #94a3b8; font-weight: 600; }
        .rpt-sales-pay-body { display: flex; justify-content: space-between; align-items: baseline; }
        .rpt-sales-pay-amt { font-size: 20px; font-weight: 850; color: #1e293b; }
        .rpt-sales-pay-avg { font-size: 11px; color: #64748b; font-weight: 600; }
        .rpt-sales-pay-bar-wrapper { height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
        .rpt-sales-pay-bar-fill { height: 100%; border-radius: 3px; }

        .rpt-sales-chart-card { background: white; border-radius: 20px; border: 1px solid #e2e8f0; padding: 20px; }
        .rpt-sales-chart-header h4 { margin: 0 0 16px; font-size: 14px; font-weight: 800; color: #0f172a; }
        .rpt-sales-chart-body { display: flex; gap: 10px; overflow-x: auto; padding: 20px 0 10px; }
        .rpt-sales-hour-col { display: flex; flex-direction: column; align-items: center; width: 48px; flex-shrink: 0; }
        .rpt-sales-hour-bar-area { width: 100%; height: 160px; display: flex; align-items: flex-end; justify-content: center; position: relative; }
        .rpt-sales-hour-bar { width: 22px; background: linear-gradient(180deg, #f97316, #fdba74); border-radius: 6px 6px 0 0; position: relative; cursor: pointer; }
        .rpt-sales-hour-tip { position: absolute; bottom: 105%; left: 50%; transform: translateX(-50%); background: #ea580c; color: white; padding: 4px 8px; border-radius: 6px; font-size: 9px; font-weight: 700; white-space: nowrap; opacity: 0; pointer-events: none; transition: .2s; z-index: 10; display: flex; flex-direction: column; align-items: center; }
        .rpt-sales-hour-bar:hover .rpt-sales-hour-tip { opacity: 1; }
        .rpt-sales-hour-label { font-size: 10px; font-weight: 700; color: #475569; margin-top: 8px; }
        .rpt-sales-hour-badge { font-size: 8px; color: #64748b; background: #f1f5f9; padding: 1px 6px; border-radius: 6px; margin-top: 4px; font-weight: 800; }

        .rpt-sales-pagination { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 14px; font-size: 12px; font-weight: 700; color: #64748b; }
        .rpt-sales-loading, .rpt-sales-empty { text-align: center; padding: 60px 20px; color: #94a3b8; font-weight: 700; font-size: 14px; }
        .rpt-sales-error { margin-bottom: 16px; padding: 12px 14px; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; border-radius: 12px; font-size: 12px; font-weight: 800; }
      `}</style>
    </div>
  );
}
