import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../utils/api';
import NiceSelect from '../NiceSelect';
import { useNotification } from '../../context/NotificationContext';
import { formatTzDate, businessTimeToUtc } from '../../utils/timezoneUtils';
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
  const [activeTooltip, setActiveTooltip] = useState(null);
  const INVOICE_PAGE_SIZE = 25;

  const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const branchLabel = (tx) => tx?.branchName || tx?.branchCode || (tx?.branchId ? String(tx.branchId).slice(0, 8) : '—');
  const formatReportDate = (val) => formatTzDate(val, timezone || 'Asia/Kolkata', { format: 'short' });

  const visibleTabs = useMemo(() => {
    let list = SALES_TABS;
    if (config && !config.taxEnabled) {
      list = SALES_TABS.filter(t => t.key !== 'tax');
    }
    return config?.creditEnabled ? [...list, CREDIT_TAB] : list;
  }, [config]);

  const toInstant = (dtLocal, isEnd = false) => {
    if (!dtLocal) return undefined;
    const val = isEnd && dtLocal.length === 16 ? `${dtLocal}:59` : dtLocal;
    try { return businessTimeToUtc(val, timezone); } catch { return undefined; }
  };

  const loadSubTab = useCallback(async (t) => {
    setLoading(true);
    setLoadError(null);
    const params = { from: toInstant(dateFrom), to: toInstant(dateTo, true) };
    if (selectedOrgId) params.orgId = selectedOrgId;
    if (selectedTerminalId) params.terminalId = selectedTerminalId;

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
  }, [dateFrom, dateTo, invoiceFilter, selectedOrgId, selectedTerminalId, timezone, notify]);

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

  const InfoTooltip = ({ id, text }) => {
    const isOpen = activeTooltip === id;
    const ref = React.useRef(null);
    const [coords, setCoords] = useState({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
    const [arrowCoords, setArrowCoords] = useState({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });

    useEffect(() => {
      if (isOpen) {
        if (ref.current) {
          const rect = ref.current.getBoundingClientRect();
          const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000;
          
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
      { label: 'Billed Total', val: `${SYM}${fmt(billedTotal)}`, color: '#10b981', bg: '#ecfdf5', tip: 'Billed Total: The actual amount billed and collected from customers (including GST) across all settled orders. | Equation: Billed Total = Net Sales + GST + Round Off', icon: <FaReceipt /> },
      (config?.discountEnabled !== false) && { label: 'Gross Sales', val: `${SYM}${fmt(grossSales)}`, color: '#0ea5e9', bg: '#f0f9ff', tip: 'Gross Sales (Ex-Tax): Pre-discount revenue excluding GST and Round Off. | Equation: Gross Sales = Net Sales + Discounts', icon: <FaChartBar /> },
      { label: 'Net Sales', val: `${SYM}${fmt(netSales)}`, color: '#16a34a', bg: '#f0fdf4', tip: 'Net Sales (Ex-Tax): Revenue after discounts, excluding GST and Round Off. | Equation: Net Sales = Billed Total − GST − Round Off', icon: <FaChartLine /> },
      { label: 'Total Orders', val: summary.totalOrders, color: '#3b82f6', bg: '#eff6ff', tip: 'Total Orders: Number of completed and settled orders in the selected date range.', icon: <FaReceipt /> },
      { label: 'Avg Order Value', val: `${SYM}${fmt(summary.avgOrderValue)}`, color: '#8b5cf6', bg: '#f5f3ff', tip: 'Avg Order Value: Average billed amount per order. Calculated as Billed Total ÷ Total Orders.', icon: <FaChartLine /> },
      { label: 'Items Sold', val: summary.itemsSold, color: '#f97316', bg: '#fff7ed', tip: 'Items Sold: Total number of individual menu items sold across all orders in this period.', icon: <FaBoxes /> },
      (config?.taxEnabled !== false) && { label: 'Tax', val: `${SYM}${fmt(tax)}`, color: '#ef4444', bg: '#fef2f2', tip: 'Tax (GST): Total output tax collected from customers, payable to the government. | Equation: Tax = Billed Total − Net Sales − Round Off', icon: <FaFileInvoice /> },
      (config?.discountEnabled !== false) && { label: 'Discounts', val: `${SYM}${fmt(discounts)}`, color: '#ec4899', bg: '#fdf2f8', tip: 'Discounts: Total price reductions granted on orders (item-level and order-level). | Equation: Discounts = Gross Sales − Net Sales', icon: <FaTag /> },
      (config?.roundOffEnabled !== false) && { label: 'Round Off', val: `${SYM}${fmt(roundOff)}`, color: '#64748b', bg: '#f1f5f9', tip: 'Round Off: Adjustments made to round the bill total to the nearest whole value. | Equation: Round Off = Billed Total − Net Sales − GST', icon: <FaCoins /> }
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
            <div key={i} className="rpt-sales-kpi" style={{ borderLeft: `2.5px solid ${c.color}` }}>
              <div className="rpt-sales-kpi-icon" style={{ background: c.bg, color: c.color }}>{c.icon}</div>
              <div className="rpt-sales-kpi-data">
                <span className="rpt-sales-kpi-label">
                  {c.label}
                  {c.tip && <InfoTooltip id={`kpi-${i}`} text={c.tip} />}
                </span>
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

    // All-record grand totals across entire filtered dataset
    const allTax = salesInvoices.reduce((s, tx) => s + Number(tx.totalTaxAmount || 0), 0);
    const allDiscount = salesInvoices.reduce((s, tx) => s + Number(tx.totalDiscountAmount || 0), 0);
    const allGrand = salesInvoices.reduce((s, tx) => s + Number(tx.grandTotal || 0), 0);
    const allDue = salesInvoices.reduce((s, tx) => s + Number(tx.amountDue || 0), 0);

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
            const headers = [
              'Order No', 'Invoice No', 'Date', 'Branch', 'Customer', 'Type', 'Table',
              'Order Status', 'Invoice Status', 'Payment Method', 'Payment No',
              'Line No', 'Item Name', 'Category', 'Tax Rate %', 'Qty', 'Unit Rate', 'Line Taxable', 'CGST Amt', 'SGST Amt', 'Line Total',
              'Invoice Discount', 'Invoice Tax', 'Invoice Total', 'Amount Due', 'Void Reason'
            ];
            const rows = [];
            salesInvoices.forEach(tx => {
              const formattedDate = formatReportDate(tx.transactionDate || tx.orderDate || tx.invoiceDate || tx.createdAt);
              const baseRow = [
                tx.orderNo, tx.invoiceNo, formattedDate, branchLabel(tx), tx.customerName, tx.fulfillmentType, tx.tableNumber,
                tx.orderStatus, tx.invoiceStatus, tx.paymentMethod, tx.paymentNo
              ];
              const invoiceSummary = [
                tx.totalDiscountAmount, tx.totalTaxAmount, tx.grandTotal, tx.amountDue, tx.voidReason
              ];

              if (tx.lines && tx.lines.length > 0) {
                tx.lines.forEach((line, index) => {
                  const taxRate = Number(line.taxRate || 0);
                  const taxAmount = Number(line.taxAmount || 0);
                  const cgst = (taxAmount / 2).toFixed(2);
                  const sgst = (taxAmount / 2).toFixed(2);
                  const lineTaxable = (Number(line.lineTotal || 0) - taxAmount).toFixed(2);

                  rows.push([...baseRow,
                    index + 1,
                    line.productName,
                    line.categoryName,
                    taxRate,
                    line.quantity,
                    line.unitPrice,
                    lineTaxable,
                    cgst,
                    sgst,
                    line.lineTotal,
                    ...invoiceSummary
                  ].map(csvCell).join(','));
                });
              } else {
                rows.push([...baseRow,
                  '', '', '', '', '', '', '', '', '', '',
                  ...invoiceSummary
                ].map(csvCell).join(','));
              }
            });
            exportCSV(headers, rows, 'sales_invoices_detailed');
          }}><FaFileCsv /> CSV</button>
          <button className="rpt-sales-btn" onClick={() => {
            const data = [];
            salesInvoices.forEach(tx => {
              const formattedDate = formatReportDate(tx.transactionDate || tx.orderDate || tx.invoiceDate || tx.createdAt);
              const baseObj = {
                'Order No': tx.orderNo,
                'Invoice No': tx.invoiceNo,
                'Date': formattedDate,
                'Branch': branchLabel(tx),
                'Customer': tx.customerName,
                'Type': tx.fulfillmentType,
                'Table': tx.tableNumber,
                'Order Status': tx.orderStatus,
                'Invoice Status': tx.invoiceStatus,
                'Payment Method': tx.paymentMethod,
                'Payment No': tx.paymentNo,
              };
              const invoiceSummaryObj = {
                'Invoice Discount': tx.totalDiscountAmount,
                'Invoice Tax': tx.totalTaxAmount,
                'Invoice Total': tx.grandTotal,
                'Amount Due': tx.amountDue,
                'Void Reason': tx.voidReason || '',
              };

              if (tx.lines && tx.lines.length > 0) {
                tx.lines.forEach((line, index) => {
                  const taxRate = Number(line.taxRate || 0);
                  const taxAmount = Number(line.taxAmount || 0);
                  const cgst = (taxAmount / 2).toFixed(2);
                  const sgst = (taxAmount / 2).toFixed(2);
                  const lineTaxable = (Number(line.lineTotal || 0) - taxAmount).toFixed(2);

                  data.push({
                    ...baseObj,
                    'Line No': index + 1,
                    'Item Name': line.productName,
                    'Category': line.categoryName,
                    'Tax Rate %': taxRate,
                    'Qty': line.quantity,
                    'Unit Rate': line.unitPrice,
                    'Line Taxable': lineTaxable,
                    'CGST Amt': cgst,
                    'SGST Amt': sgst,
                    'Line Total': line.lineTotal,
                    ...invoiceSummaryObj
                  });
                });
              } else {
                data.push({
                  ...baseObj,
                  'Line No': '',
                  'Item Name': '',
                  'Category': '',
                  'Tax Rate %': '',
                  'Qty': '',
                  'Unit Rate': '',
                  'Line Taxable': '',
                  'CGST Amt': '',
                  'SGST Amt': '',
                  'Line Total': '',
                  ...invoiceSummaryObj
                });
              }
            });
            exportExcel(data, 'Sales & Invoices Detailed', 'sales_invoices_detailed');
          }}><FaFileExcel /> Excel</button>
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
                    <th>Method</th>
                    {config?.taxEnabled !== false && <th className="r">Tax</th>}
                    <th className="r">Discount</th>
                    <th className="r">Amount</th>
                    <th className="r">Due</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedInvoices.map((tx, idx) => {
                    const isExp = expandedInvoice === (tx.invoiceId || tx.id || idx);
                    const isVoided = ['VOID', 'VOIDED', 'CANCELLED'].includes(String(tx.invoiceStatus || tx.orderStatus || '').toUpperCase());
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
                          <td>{formatReportDate(tx.transactionDate || tx.orderDate || tx.invoiceDate || tx.createdAt)}</td>
                          <td><span className="rpt-sales-branch">{branchLabel(tx)}</span></td>
                          <td>{tx.customerName || 'Walk-in'}</td>
                          <td>
                            <span className={`rpt-sales-st ${(tx.invoiceStatus || tx.orderStatus || '').toLowerCase()}`}>
                              {tx.invoiceStatus || tx.orderStatus || '—'}
                            </span>
                          </td>
                          <td>
                            <span className="rpt-sales-pill">{tx.paymentMethod || '—'}</span>
                          </td>
                          {config?.taxEnabled !== false && (
                            <td className="r">{SYM}{fmt(tx.totalTaxAmount)}</td>
                          )}
                          <td className="r">{SYM}{fmt(tx.totalDiscountAmount)}</td>
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
                            <td colSpan={config?.taxEnabled !== false ? 13 : 12} style={{ padding: '0', background: '#f8fafc' }}>
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
                {salesInvoices.length > 0 && (
                  <tfoot>
                    <tr style={{ fontWeight: 700, background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                      <td colSpan={8} style={{ fontSize: '12px', color: '#64748b', textAlign: 'right', padding: '10px 16px' }}>
                        Grand Totals ({salesInvoices.length} records)
                      </td>
                      {config?.taxEnabled !== false && <td className="r" style={{ color: '#ef4444' }}>{SYM}{fmt(allTax)}</td>}
                      <td className="r" style={{ color: '#ec4899' }}>{SYM}{fmt(allDiscount)}</td>
                      <td className="r rpt-sales-amt" style={{ color: '#10b981' }}>{SYM}{fmt(allGrand)}</td>
                      <td className="r" style={{ color: '#f97316' }}>{SYM}{fmt(allDue)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
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
    const maxRev = items.length ? Math.max(...items.map(i => Number(i.revenue || 0)), 1) : 1;
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
                  <th style={{ width: 40 }}>#</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th className="r">Qty Sold</th>
                  <th className="r">Revenue</th>
                  <th style={{ width: 140 }}>Share</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                    <td style={{ fontWeight: 700, color: '#1e293b' }}>{item.productName}</td>
                    <td><span className="rpt-sales-pill">{item.categoryName || 'General'}</span></td>
                    <td className="r" style={{ fontWeight: 600 }}>{item.uomPrecision != null ? Number(item.quantitySold || 0).toFixed(item.uomPrecision) : Number(item.quantitySold || 0)}</td>
                    <td className="r rpt-sales-amt">{SYM}{fmt(item.revenue)}</td>
                    <td>
                      <div className="rpt-sales-bar-wrap">
                        <div className="rpt-sales-bar" style={{ width: `${(Number(item.revenue || 0) / maxRev * 100).toFixed(0)}%` }} />
                      </div>
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
            } else if (method.includes('ONLINE') || method.includes('UPI') || method.includes('GPAY') || method.includes('PAYTM') || method.includes('PHONEPE')) {
              theme = { color: '#ea580c', bg: '#fff7ed', grad: 'linear-gradient(135deg, #f97316, #ea580c)', icon: <FaMobileAlt /> };
            }
            const avgAmount = p.orderCount > 0 ? Number(p.totalAmount || 0) / p.orderCount : 0;

            return (
              <div key={i} className="rpt-sales-pay-card" style={{ borderTop: `2.5px solid ${theme.color}` }}>
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
            <span className="rpt-sales-chart-sub">Peak operating times and transaction volume</span>
          </div>
          <div className="rpt-sales-chart-container">
            {/* Background grid lines */}
            <div className="rpt-sales-chart-grid-lines">
              <div className="grid-line"><span className="grid-line-label">{SYM}{fmt(maxAmt)}</span></div>
              <div className="grid-line"><span className="grid-line-label">{SYM}{fmt(maxAmt * 0.75)}</span></div>
              <div className="grid-line"><span className="grid-line-label">{SYM}{fmt(maxAmt * 0.50)}</span></div>
              <div className="grid-line"><span className="grid-line-label">{SYM}{fmt(maxAmt * 0.25)}</span></div>
              <div className="grid-line zero"><span className="grid-line-label">{SYM}0.00</span></div>
            </div>

            <div className="rpt-sales-hourly-chart">
              {hourly.map((h, i) => {
                const amt = Number(h.totalAmount || 0);
                const heightPct = Math.max(Math.round((amt / maxAmt) * 100), 4);
                return (
                  <div key={i} className="rpt-sales-hour-col">
                    <div className="rpt-sales-hour-bar-area">
                      <div className="rpt-sales-hour-bar" style={{ height: `${heightPct}%` }}>
                        <div className="rpt-sales-hour-tip">
                          <span className="tip-amt">{SYM}{fmt(amt)}</span>
                          <span className="tip-orders">{h.orderCount || 0} orders</span>
                        </div>
                      </div>
                    </div>
                    <span className="rpt-sales-hour-label">{h.hourLabel || `${h.hour}:00`}</span>
                    <span className="rpt-sales-hour-badge">{h.orderCount} ord</span>
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
    if (!creditReport) return <div className="rpt-sales-empty">No credit sales data</div>;
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
        <div className="rpt-sales-toolbar">
          <button className="rpt-sales-btn" onClick={() => exportCSV(
            ['Order No', 'Invoice No', 'Customer Name', 'Phone', 'Amount', 'Tax', 'Total', 'Amount Due', 'Date', 'Status'],
            orders.map(o => [
              o.orderNo, o.invoiceNo, o.customerName, o.customerPhone, o.amount, o.tax, o.total, o.amountDue, formatReportDate(o.date || o.createdAt), o.status
            ].map(csvCell).join(',')),
            'credit_orders'
          )}><FaFileCsv /> Export Credit Orders CSV</button>
          <button className="rpt-sales-btn" onClick={() => exportCSV(
            ['Date', 'Customer Name', 'Payment Method', 'Amount', 'Reference No', 'Description'],
            paymentsRows.map(p => [
              formatReportDate(p.transactionDate || p.createdAt), p.customerName, p.paymentMethod, p.amount, p.referenceNo, p.description
            ].map(csvCell).join(',')),
            'credit_payments'
          )}><FaFileCsv /> Export Credit Payments CSV</button>
          <button className="rpt-sales-btn" onClick={() => handlePrint('credit')}><FaPrint /> Print</button>
        </div>
        <div className="rpt-sales-kpi-grid">
          {cards.map((card) => (
            <div key={card.label} className="rpt-sales-kpi" style={{ borderLeft: `2.5px solid ${card.color}` }}>
              <div className="rpt-sales-kpi-icon" style={{ background: card.bg, color: card.color }}><FaBook /></div>
              <div className="rpt-sales-kpi-data">
                <span className="rpt-sales-kpi-label">{card.label}</span>
                <span className="rpt-sales-kpi-val">{card.val}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="rpt-sales-section-title">Credit Orders</div>
        {orders.length === 0 ? <div className="rpt-sales-empty">No credit orders</div> : (
          <div className="rpt-sales-tbl-wrap">
            <table className="rpt-sales-tbl rpt-sales-credit-tbl">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th className="r">Amount</th>
                  {config?.taxEnabled !== false && <th className="r">Tax</th>}
                  <th className="r">Total</th>
                  <th className="r">Due</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((row) => (
                  <tr key={row.invoiceId || row.orderId || row.orderNo}>
                    <td onClick={(e) => {
                      if (row.orderNo && viewDocument) {
                        e.stopPropagation();
                        viewDocument(row, 'order');
                      }
                    }}>
                      <span className={row.orderNo ? 'rpt-sales-mono-link' : ''}>
                        {row.orderNo || '—'}
                      </span>
                    </td>
                    <td onClick={(e) => {
                      if (row.invoiceNo && viewDocument) {
                        e.stopPropagation();
                        viewDocument(row, 'invoice');
                      }
                    }}>
                      <span className={row.invoiceNo ? 'rpt-sales-mono-link' : ''}>
                        {row.invoiceNo || '—'}
                      </span>
                    </td>
                    <td>{row.customerName || '—'}</td>
                    <td>{row.customerPhone || '—'}</td>
                    <td className="r">{SYM}{fmt(row.amount)}</td>
                    {config?.taxEnabled !== false && <td className="r">{SYM}{fmt(row.tax)}</td>}
                    <td className="r rpt-sales-amt">{SYM}{fmt(row.total)}</td>
                    <td className="r" style={{ color: Number(row.amountDue || 0) > 0 ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                      {SYM}{fmt(row.amountDue)}
                    </td>
                    <td>{formatReportDate(row.date || row.createdAt)}</td>
                    <td>
                      <span className={`rpt-sales-st ${String(row.status || 'unknown').toLowerCase()}`}>
                        {row.status || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="rpt-sales-section-title">Payment Transactions</div>
        {paymentsRows.length === 0 ? <div className="rpt-sales-empty">No credit payments</div> : (
          <div className="rpt-sales-tbl-wrap">
            <table className="rpt-sales-tbl">
              <thead>
                <tr>
                  <th>Payment No</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Method</th>
                  <th className="r">Amount</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {paymentsRows.map((row) => (
                  <tr key={row.paymentId || row.referenceNo}>
                    <td onClick={(e) => {
                      if (row.paymentId && viewDocument) {
                        e.stopPropagation();
                        viewDocument(row, 'payment');
                      }
                    }}>
                      <span className={row.paymentId ? 'rpt-sales-mono-link' : ''}>
                        {row.referenceNo || '—'}
                      </span>
                    </td>
                    <td>{formatReportDate(row.transactionDate || row.createdAt)}</td>
                    <td>{row.customerName || '—'}</td>
                    <td><span className="rpt-sales-pill">{row.paymentMethod || '—'}</span></td>
                    <td className="r rpt-sales-amt">{SYM}{fmt(row.amount)}</td>
                    <td>{row.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
    <div className="rpt-sales-view" onClick={() => setActiveTooltip(null)}>
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

        .rpt-sales-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
        .rpt-sales-kpi { background: #fff; padding: 10px 14px; border-radius: 12px; border: 1px solid #f1f5f9; display: grid; grid-template-areas: "label icon" "value icon"; grid-template-columns: 1fr auto; align-items: center; gap: 4px 10px; min-height: 64px; }
        .rpt-sales-kpi:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,.03); }
        .rpt-sales-kpi-icon { grid-area: icon; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .rpt-sales-kpi-data { display: contents; }
        .rpt-sales-kpi-label { grid-area: label; font-size: 9.5px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .4px; }
        .rpt-sales-kpi-val { grid-area: value; font-size: 16px; font-weight: 800; color: #1e293b; }

        .rpt-sales-tbl-wrap { background: #fff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: auto; box-shadow: 0 1px 3px rgba(0,0,0,.02); }
        .rpt-sales-tbl { width: 100%; border-collapse: collapse; min-width: 600px; }
        .rpt-sales-tbl th { background: #fff; padding: 8px 16px; text-align: left; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #FF7A00; }
        .rpt-sales-tbl td { padding: 8px 16px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #475569; vertical-align: middle; white-space: nowrap; }
        .rpt-sales-tbl .r { text-align: right; }
        .rpt-sales-tbl .voided td { opacity: .5; background: #fef2f2; }
        .rpt-sales-mono-link { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; color: #f97316; background: #fff7ed; padding: 4px 8px; border-radius: 6px; cursor: pointer; }
        .rpt-sales-mono-link:hover { background: #ffedd5; }
        .rpt-sales-branch { font-size: 10px; font-weight: 800; color: #334155; background: #eef2ff; padding: 4px 8px; border-radius: 6px; }
        .rpt-sales-pill { font-size: 9px; font-weight: 700; padding: 3px 8px; border-radius: 20px; background: #f1f5f9; color: #475569; text-transform: uppercase; display: inline-block; }
        .rpt-sales-st { font-size: 9px; font-weight: 800; padding: 3px 8px; border-radius: 6px; text-transform: uppercase; display: inline-block; }
        .rpt-sales-st.completed, .rpt-sales-st.paid { background: #ecfdf5; color: #10b981; }
        .rpt-sales-st.partial { background: #fffbeb; color: #d97706; }
        .rpt-sales-st.unpaid { background: #fef2f2; color: #ef4444; }
        .rpt-sales-st.billed { background: #eff6ff; color: #3b82f6; }
        .rpt-sales-st.cancelled, .rpt-sales-st.voided { background: #fef2f2; color: #ef4444; }
        .rpt-sales-amt { font-weight: 800; color: #1e293b; }
        .rpt-sales-expand-btn { border: none; background: transparent; cursor: pointer; color: #64748b; font-size: 10px; }
        .rpt-sales-subrows { background: #f8fafc; padding: 10px 16px; }
        .rpt-sales-subrow { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px; color: #475569; border-bottom: 1px dashed #e2e8f0; }

        .rpt-sales-bar-wrap { width: 100%; height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; min-width: 80px; }
        .rpt-sales-bar { height: 100%; background: linear-gradient(90deg, #f97316, #fb923c); border-radius: 4px; transition: width .6s ease; }

        .rpt-sales-pay-grid { display: flex; flex-wrap: wrap; gap: 12px; }
        .rpt-sales-pay-card { flex: 1 1 230px; max-width: 300px; background: #fff; padding: 12px 14px; border-radius: 12px; border: 1px solid #f1f5f9; box-shadow: 0 1px 3px rgba(0,0,0,.02); display: flex; flex-direction: column; gap: 8px; }
        .rpt-sales-pay-card-header { display: flex; align-items: center; gap: 10px; }
        .rpt-sales-pay-icon-box { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 13px; }
        .rpt-sales-pay-method-info { display: flex; flex-direction: column; gap: 1px; }
        .rpt-sales-pay-method-name { font-size: 11px; font-weight: 800; color: #1e293b; text-transform: uppercase; }
        .rpt-sales-pay-meta { font-size: 10px; color: #94a3b8; font-weight: 600; }
        .rpt-sales-pay-body { display: flex; justify-content: space-between; align-items: baseline; }
        .rpt-sales-pay-amt { font-size: 16px; font-weight: 850; color: #1e293b; }
        .rpt-sales-pay-avg { font-size: 10.5px; color: #64748b; font-weight: 600; }
        .rpt-sales-pay-bar-wrapper { height: 4px; background: #f1f5f9; border-radius: 2px; overflow: hidden; }
        .rpt-sales-pay-bar-fill { height: 100%; border-radius: 2px; }

        .rpt-sales-chart-card { background: white; border-radius: 20px; border: 1px solid #e2e8f0; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,.02); margin-bottom: 20px; }
        .rpt-sales-chart-header { margin-bottom: 24px; }
        .rpt-sales-chart-header h4 { margin: 0; font-size: 15px; font-weight: 800; color: #0f172a; }
        .rpt-sales-chart-sub { font-size: 11px; color: #94a3b8; font-weight: 600; display: block; margin-top: 4px; }
        .rpt-sales-chart-container { position: relative; padding-left: 70px; padding-top: 20px; margin-top: 10px; min-height: 280px; }
        .rpt-sales-chart-grid-lines { position: absolute; inset: 20px 0 50px 70px; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; }
        .grid-line { width: 100%; border-bottom: 1px dashed #e2e8f0; position: relative; }
        .grid-line.zero { border-bottom: 1.5px solid #cbd5e1; }
        .grid-line-label { position: absolute; left: -70px; bottom: -7px; width: 60px; text-align: right; font-size: 9px; font-weight: 700; color: #94a3b8; font-family: 'JetBrains Mono', monospace; }
        .rpt-sales-hourly-chart { display: flex; gap: 16px; justify-content: flex-start; align-items: flex-end; min-height: 220px; overflow-x: auto; position: relative; z-index: 2; padding: 20px 20px 10px; -webkit-overflow-scrolling: touch; }
        .rpt-sales-hour-col { display: flex; flex-direction: column; align-items: center; width: 55px; flex-shrink: 0; }
        .rpt-sales-hour-bar-area { width: 100%; height: 180px; display: flex; align-items: flex-end; justify-content: center; position: relative; }
        .rpt-sales-hour-bar { width: 24px; background: linear-gradient(180deg, #f97316, #fdba74); border-radius: 6px 6px 0 0; position: relative; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); min-height: 4px; box-shadow: 0 4px 10px rgba(249, 115, 22, 0.15); }
        .rpt-sales-hour-bar:hover { background: linear-gradient(180deg, #ea580c, #f97316); transform: scaleX(1.1); box-shadow: 0 6px 15px rgba(234, 88, 12, 0.3); }
        .rpt-sales-hour-tip { position: absolute; bottom: 105%; left: 50%; transform: translateX(-50%) translateY(4px); background: #ea580c; color: white; padding: 6px 10px; border-radius: 8px; font-size: 9px; font-weight: 700; white-space: nowrap; opacity: 0; pointer-events: none; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); z-index: 10; display: flex; flex-direction: column; align-items: center; gap: 2px; box-shadow: 0 10px 15px -3px rgba(234, 88, 12, 0.3); }
        .rpt-sales-hour-tip::after { content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 5px solid #ea580c; }
        .rpt-sales-hour-bar:hover .rpt-sales-hour-tip { opacity: 1; transform: translateX(-50%) translateY(0); }
        .tip-amt { font-size: 10.5px; font-weight: 800; font-family: 'JetBrains Mono', monospace; }
        .tip-orders { font-size: 8px; font-weight: 700; color: #ffedd5; text-transform: uppercase; }
        .rpt-sales-hour-label { font-size: 10px; font-weight: 700; color: #475569; margin-top: 10px; }
        .rpt-sales-hour-badge { font-size: 8px; color: #64748b; background: #f1f5f9; padding: 1px 6px; border-radius: 6px; margin-top: 4px; font-weight: 800; }

        .rpt-sales-section-title { margin: 22px 0 10px; font-size: 13px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: .5px; }
        .rpt-sales-credit-tbl { min-width: 1180px; }

        /* Custom Tooltip */
        .custom-tooltip-wrapper { position: relative; display: inline-flex; align-items: center; justify-content: center; margin-left: 6px; }
        .custom-tooltip-icon { color: #94a3b8; font-size: 13.5px; cursor: pointer; transition: all 0.2s ease; }
        .custom-tooltip-icon:hover, .custom-tooltip-icon.active { color: #f97316; transform: scale(1.15); }
        .custom-tooltip-box { position: absolute; bottom: 135%; left: 50%; transform: translateX(-50%); width: 220px; background: #ea580c; color: #ffffff; padding: 10px 14px; border-radius: 10px; font-size: 11.5px; font-weight: 600; line-height: 1.45; box-shadow: 0 10px 20px rgba(234, 88, 12, 0.3), 0 4px 6px rgba(0, 0, 0, 0.05); z-index: 1000; white-space: normal; text-align: left; animation: tooltip-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .custom-tooltip-arrow { position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid #ea580c; }
        @keyframes tooltip-fade-in { from { opacity: 0; } to { opacity: 1; } }

        .rpt-sales-pagination { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 14px; font-size: 12px; font-weight: 700; color: #64748b; }
        .rpt-sales-loading, .rpt-sales-empty { text-align: center; padding: 60px 20px; color: #94a3b8; font-weight: 700; font-size: 14px; }
        .rpt-sales-error { margin-bottom: 16px; padding: 12px 14px; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; border-radius: 12px; font-size: 12px; font-weight: 800; }
      `}</style>
    </div>
  );
}
