import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../utils/api';
import { useNotification } from '../../context/NotificationContext';
import { printUniversal } from '../../utils/printGateway';
import {
  FaMoneyBillWave, FaCreditCard, FaMobileAlt, FaWallet,
  FaFileCsv, FaFileExcel, FaPrint, FaBalanceScale,
  FaArrowDown, FaArrowUp, FaCheckCircle, FaExclamationCircle,
  FaCoins, FaSync, FaInfoCircle, FaSearch, FaThLarge, FaTable, FaTimes
} from 'react-icons/fa';

export default function PaymentTypeBalanceReport({
  dateFrom,
  dateTo,
  selectedOrgId,
  selectedTerminalId,
  config,
  isSuperAdmin
}) {
  const { notify } = useNotification();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Responsive interactive controls
  const [viewMode, setViewMode] = useState('both'); // 'both' | 'cards' | 'table'
  const [searchQuery, setSearchQuery] = useState('');

  const SYM = config?.currencySymbol || '₹';

  const fmt = (v) => Number(v || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const toInstant = (dtLocal) => {
    if (!dtLocal) return undefined;
    try {
      return new Date(dtLocal + ':00').toISOString();
    } catch {
      return undefined;
    }
  };

  const getLocalDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const loadBalances = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        from: toInstant(dateFrom),
        to: toInstant(dateTo)
      };
      if (isSuperAdmin && selectedOrgId) params.orgId = selectedOrgId;
      if (isSuperAdmin && selectedTerminalId) params.terminalId = selectedTerminalId;

      const res = await api.get('/api/v1/reports/payment-balances', { params });
      if (res.data?.success) {
        setData(res.data.data);
      } else {
        setError(res.data?.message || 'Failed to fetch payment balances');
      }
    } catch (err) {
      console.error('Failed to load payment balances:', err);
      const msg = err?.response?.data?.message || 'Error loading payment type balances';
      setError(msg);
      notify('error', msg);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedOrgId, selectedTerminalId, isSuperAdmin, notify]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  // Method Card Theme Config
  const getTheme = (methodStr) => {
    const m = String(methodStr || '').toUpperCase();
    if (m.includes('CASH')) {
      return {
        color: '#10b981',
        bg: '#ecfdf5',
        border: '#a7f3d0',
        grad: 'linear-gradient(135deg, #10b981, #059669)',
        icon: <FaMoneyBillWave />
      };
    }
    if (m.includes('ONLINE') || m.includes('UPI') || m.includes('GPAY') || m.includes('PAYTM') || m.includes('PHONEPE')) {
      return {
        color: '#ea580c',
        bg: '#fff7ed',
        border: '#fed7aa',
        grad: 'linear-gradient(135deg, #f97316, #ea580c)',
        icon: <FaMobileAlt />
      };
    }
    if (m.includes('CREDIT')) {
      return {
        color: '#8b5cf6',
        bg: '#f5f3ff',
        border: '#ddd6fe',
        grad: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
        icon: <FaCoins />
      };
    }
    if (m.includes('CARD') || m.includes('DEBIT') || m.includes('BANK')) {
      return {
        color: '#3b82f6',
        bg: '#eff6ff',
        border: '#bfdbfe',
        grad: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        icon: <FaCreditCard />
      };
    }
    return {
      color: '#64748b',
      bg: '#f8fafc',
      border: '#e2e8f0',
      grad: 'linear-gradient(135deg, #64748b, #475569)',
      icon: <FaWallet />
    };
  };

  // Filter out composite / split tender modes ("Mixed"), because mixed payments
  // are already split and accounted for within the Cash and Online balances.
  const rawBalances = useMemo(() => {
    return (data?.balances || []).filter(b => {
      const m = String(b.paymentMethod || '').toUpperCase();
      const d = String(b.displayName || '').toUpperCase();
      return !m.includes('MIXED') && !m.includes('SPLIT') && !d.includes('MIXED') && !d.includes('SPLIT');
    });
  }, [data]);

  // Filtered balances by live search
  const balances = useMemo(() => {
    if (!searchQuery.trim()) return rawBalances;
    const q = searchQuery.toLowerCase().trim();
    return rawBalances.filter(b =>
      (b.displayName && b.displayName.toLowerCase().includes(q)) ||
      (b.paymentMethod && b.paymentMethod.toLowerCase().includes(q)) ||
      (b.category && b.category.toLowerCase().includes(q))
    );
  }, [rawBalances, searchQuery]);

  // CSV Export
  const handleExportCSV = () => {
    if (!balances.length) return notify('error', 'No balance data to export');
    const headers = [
      'Payment Method', 'Display Name', 'Category', 'Configured',
      'Inflows (Sales & Receipts)', 'Inflow Txns', 'Sales Portion', 'Collections Portion',
      'Outflows (Expenses & Payouts)', 'Outflow Txns', 'Expenses Portion', 'Purchases Portion',
      'Net Period Balance', 'Status'
    ];
    const rows = balances.map(b => [
      b.paymentMethod,
      b.displayName,
      b.category,
      b.isConfigured ? 'Yes' : 'No',
      b.inflowAmount,
      b.inflowCount,
      b.salesAmount,
      b.collectionAmount,
      b.outflowAmount,
      b.outflowCount,
      b.expenseAmount,
      b.purchaseAmount,
      b.netBalance,
      b.status
    ].map(csvCell).join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
    a.download = `payment_balances_${getLocalDate()}.csv`;
    a.click();
    notify('success', 'Payment balances exported to CSV');
  };

  // Excel Export
  const handleExportExcel = async () => {
    if (!balances.length) return notify('error', 'No balance data to export');
    try {
      const XLSX = await import('xlsx');
      const rows = balances.map(b => ({
        'Payment Method': b.paymentMethod,
        'Display Name': b.displayName,
        'Category': b.category,
        'Configured': b.isConfigured ? 'Yes' : 'No',
        'Total Inflow': Number(b.inflowAmount || 0),
        'Inflow Txns': Number(b.inflowCount || 0),
        'Sales Inflow': Number(b.salesAmount || 0),
        'Collections Inflow': Number(b.collectionAmount || 0),
        'Total Outflow': Number(b.outflowAmount || 0),
        'Outflow Txns': Number(b.outflowCount || 0),
        'Expenses Outflow': Number(b.expenseAmount || 0),
        'Purchases Outflow': Number(b.purchaseAmount || 0),
        'Net Period Balance': Number(b.netBalance || 0),
        'Status': b.status
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Payment Balances');
      XLSX.writeFile(wb, `payment_balances_${getLocalDate()}.xlsx`);
      notify('success', 'Payment balances exported to Excel');
    } catch (e) {
      console.error('Excel export error:', e);
      notify('error', 'Failed to export Excel');
    }
  };

  // Thermal / Universal Print
  const handlePrint = async () => {
    if (!balances.length) return notify('error', 'No balance data to print');
    const W = 32;
    const dashes = '-'.repeat(W);
    const center = (str) => {
      const pad = Math.max(0, Math.floor((W - str.length) / 2));
      return ' '.repeat(pad) + str;
    };
    const rowTwo = (l, r) => {
      const sp = Math.max(1, W - l.length - r.length);
      return l + ' '.repeat(sp) + r;
    };

    const lines = [];
    lines.push(center('PAYMENT BALANCES REPORT'));
    lines.push(center(`Period: ${dateFrom.slice(0, 10)} to ${dateTo.slice(0, 10)}`));
    lines.push(dashes);
    lines.push(rowTwo('Total Inflow:', `${SYM} ${fmt(data?.totalInflow)}`));
    lines.push(rowTwo('Total Outflow:', `${SYM} ${fmt(data?.totalOutflow)}`));
    lines.push(rowTwo('Net Balance:', `${SYM} ${fmt(data?.netBalance)}`));
    lines.push(dashes);
    lines.push('METHOD         INFLOW    OUTFLOW');
    lines.push(dashes);

    balances.forEach(b => {
      const name = (b.displayName || b.paymentMethod).padEnd(12).slice(0, 12);
      const inAmt = fmt(b.inflowAmount).padStart(9).slice(0, 9);
      const outAmt = fmt(b.outflowAmount).padStart(9).slice(0, 9);
      lines.push(`${name} ${inAmt} ${outAmt}`);
      lines.push(rowTwo('  Net Balance:', `${SYM} ${fmt(b.netBalance)} [${b.status}]`));
    });
    lines.push(dashes);
    lines.push(center('*** END OF REPORT ***'));

    try {
      await printUniversal({ text: lines.join('\n'), jobKind: 'bill', allowSystemDialog: true });
    } catch (e) {
      console.warn('Print failed', e);
      notify('error', e.message || 'Printer error');
    }
  };

  if (loading && !data) {
    return (
      <div className="pbr-loading-wrap">
        <FaSync className="pbr-spin-icon" />
        <span>Calculating payment type balances...</span>
        <style jsx>{`
          .pbr-loading-wrap {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: clamp(40px, 8vw, 80px) clamp(16px, 4vw, 32px);
            color: #64748b;
            gap: 12px;
            font-size: clamp(13px, 2vw, 15px);
            font-weight: 600;
            width: 100%;
            box-sizing: border-box;
          }
          :global(.pbr-spin-icon) {
            font-size: clamp(24px, 4vw, 32px);
            color: #f97316;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="pbr-error-wrap">
        <FaExclamationCircle className="pbr-error-icon" />
        <span>{error}</span>
        <button className="pbr-retry-btn" onClick={loadBalances}>
          <FaSync /> Retry
        </button>
        <style jsx>{`
          .pbr-error-wrap {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: clamp(30px, 6vw, 60px) clamp(16px, 4vw, 32px);
            gap: 14px;
            color: #e11d48;
            font-weight: 600;
            text-align: center;
            width: 100%;
            box-sizing: border-box;
          }
          :global(.pbr-error-icon) {
            font-size: clamp(28px, 4.5vw, 36px);
          }
          .pbr-retry-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 20px;
            min-height: 42px;
            border-radius: 10px;
            background: #f97316;
            color: white;
            border: none;
            cursor: pointer;
            font-weight: 700;
            font-size: 13px;
            touch-action: manipulation;
            transition: all 0.2s;
          }
          .pbr-retry-btn:hover {
            background: #ea580c;
            transform: translateY(-1px);
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="pbr-container">
      {/* ── RESPONSIVE TOOLBAR ── */}
      <div className="pbr-toolbar">
        {/* Left Info & Title */}
        <div className="pbr-toolbar-info">
          <div className="pbr-toolbar-title-row">
            <span className="pbr-toolbar-tag">Tender & Payment Reconciliation</span>
            {rawBalances.length > 0 && (
              <span className="pbr-count-pill">{rawBalances.length} Modes</span>
            )}
          </div>
          <span className="pbr-toolbar-sub">
            Real-time balance across configured payment types (Sales & Collections vs Expenses & Purchases)
          </span>
        </div>

        {/* Search & Filter Bar */}
        <div className="pbr-search-wrap">
          <FaSearch className="pbr-search-icon" />
          <input
            type="text"
            className="pbr-search-input"
            placeholder="Search payment mode..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filter payment mode"
          />
          {searchQuery && (
            <button
              className="pbr-search-clear"
              onClick={() => setSearchQuery('')}
              title="Clear search"
              aria-label="Clear search"
            >
              <FaTimes />
            </button>
          )}
        </div>

        {/* View Switcher & Action Buttons */}
        <div className="pbr-actions-group">
          {/* Responsive View Switcher */}
          <div className="pbr-view-switcher" role="tablist" aria-label="View layout toggle">
            <button
              type="button"
              className={`pbr-view-btn ${viewMode === 'both' ? 'active' : ''}`}
              onClick={() => setViewMode('both')}
              title="Show Both Cards & Table"
            >
              All
            </button>
            <button
              type="button"
              className={`pbr-view-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
              title="Show Cards View"
            >
              <FaThLarge /> Cards
            </button>
            <button
              type="button"
              className={`pbr-view-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Show Ledger Table View"
            >
              <FaTable /> Table
            </button>
          </div>

          {/* Export & Action Buttons */}
          <div className="pbr-actions">
            <button className="pbr-btn" onClick={handleExportCSV} title="Export CSV spreadsheet">
              <FaFileCsv /> <span>CSV</span>
            </button>
            <button className="pbr-btn" onClick={handleExportExcel} title="Export Excel spreadsheet">
              <FaFileExcel /> <span>Excel</span>
            </button>
            <button className="pbr-btn print" onClick={handlePrint} title="Print report / Thermal receipt">
              <FaPrint /> <span>Print</span>
            </button>
            <button
              className="pbr-btn icon-only"
              title="Refresh balances"
              onClick={loadBalances}
              aria-label="Refresh report"
            >
              <FaSync className={loading ? 'pbr-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* ── TOP KPI SUMMARY CARDS (FLUID DIMENSION GRID) ── */}
      <div className="pbr-kpi-grid">
        {/* TOTAL INFLOW */}
        <div className="pbr-kpi-card inflow">
          <div className="pbr-kpi-top">
            <span className="pbr-kpi-label">TOTAL INFLOW (COLLECTED)</span>
            <div className="pbr-kpi-icon-box inflow" aria-hidden="true">
              <FaArrowDown />
            </div>
          </div>
          <div className="pbr-kpi-amt positive">
            +{SYM}{fmt(data?.totalInflow)}
          </div>
          <div className="pbr-kpi-footer">
            <span className="pbr-kpi-sub">
              {data?.totalInflowCount || 0} txn{data?.totalInflowCount === 1 ? '' : 's'} (Sales & Settlements)
            </span>
          </div>
        </div>

        {/* TOTAL OUTFLOW */}
        <div className="pbr-kpi-card outflow">
          <div className="pbr-kpi-top">
            <span className="pbr-kpi-label">TOTAL OUTFLOW (PAID OUT)</span>
            <div className="pbr-kpi-icon-box outflow" aria-hidden="true">
              <FaArrowUp />
            </div>
          </div>
          <div className="pbr-kpi-amt negative">
            -{SYM}{fmt(data?.totalOutflow)}
          </div>
          <div className="pbr-kpi-footer">
            <span className="pbr-kpi-sub">
              {data?.totalOutflowCount || 0} txn{data?.totalOutflowCount === 1 ? '' : 's'} (Expenses & Vendor Bills)
            </span>
          </div>
        </div>

        {/* NET PERIOD BALANCE */}
        <div className={`pbr-kpi-card net ${Number(data?.netBalance || 0) >= 0 ? 'surplus' : 'deficit'}`}>
          <div className="pbr-kpi-top">
            <span className="pbr-kpi-label">NET CASHFLOW BALANCE</span>
            <div className={`pbr-kpi-icon-box net ${Number(data?.netBalance || 0) >= 0 ? 'surplus' : 'deficit'}`} aria-hidden="true">
              <FaBalanceScale />
            </div>
          </div>
          <div className={`pbr-kpi-amt ${Number(data?.netBalance || 0) >= 0 ? 'positive' : 'negative'}`}>
            {Number(data?.netBalance || 0) < 0 ? '-' : ''}{SYM}{fmt(Math.abs(data?.netBalance || 0))}
          </div>
          <div className="pbr-kpi-footer">
            <span className={`pbr-status-pill ${Number(data?.netBalance || 0) >= 0 ? 'surplus' : 'deficit'}`}>
              {Number(data?.netBalance || 0) >= 0 ? 'Net Surplus' : 'Net Deficit'}
            </span>
            <span className="pbr-kpi-sub">Inflows minus Outflows</span>
          </div>
        </div>
      </div>

      {/* ── PAYMENT TYPE CARDS GRID (RENDERED WHEN viewMode IS 'both' OR 'cards') ── */}
      {(viewMode === 'both' || viewMode === 'cards') && (
        <div className="pbr-section-wrapper">
          <div className="pbr-section-header">
            <div className="pbr-section-title-wrap">
              <h3 className="pbr-section-title">Payment Type Balances & Breakdown</h3>
              <span className="pbr-section-sub">
                Shows exact balance remaining in each tender mode after netting all receipts against expenses.
              </span>
            </div>
            {searchQuery && (
              <span className="pbr-filter-result-badge">
                Showing {balances.length} of {rawBalances.length}
              </span>
            )}
          </div>

          {balances.length === 0 ? (
            <div className="pbr-empty">
              {searchQuery ? `No payment types match "${searchQuery}".` : 'No payment transactions recorded for this duration.'}
            </div>
          ) : (
            <div className="pbr-cards-grid">
              {balances.map((b, idx) => {
                const theme = getTheme(b.paymentMethod);
                const net = Number(b.netBalance || 0);
                const totalActivity = Number(b.inflowAmount || 0) + Number(b.outflowAmount || 0);
                const inPercent = totalActivity > 0 ? (Number(b.inflowAmount || 0) / totalActivity) * 100 : 50;

                return (
                  <div
                    key={idx}
                    className="pbr-card"
                    style={{ borderTop: `4px solid ${theme.color}` }}
                  >
                    {/* Header */}
                    <div className="pbr-card-header">
                      <div className="pbr-card-icon" style={{ background: theme.bg, color: theme.color }}>
                        {theme.icon}
                      </div>
                      <div className="pbr-card-title-wrap">
                        <div className="pbr-card-title-row">
                          <span className="pbr-card-title" title={b.displayName || b.paymentMethod}>
                            {b.displayName || b.paymentMethod}
                          </span>
                          {b.isConfigured && (
                            <span className="pbr-config-badge">Configured</span>
                          )}
                        </div>
                        <span className="pbr-card-cat">
                          Category: <strong>{b.category || 'OTHERS'}</strong>
                        </span>
                      </div>
                      <span className={`pbr-badge ${b.status?.toLowerCase()}`}>
                        {b.status === 'SURPLUS' ? '+ Surplus' : b.status === 'DEFICIT' ? '- Deficit' : 'Settled'}
                      </span>
                    </div>

                    {/* Net Balance Display */}
                    <div className="pbr-balance-box">
                      <span className="pbr-balance-label">Net Balance in Period</span>
                      <div className={`pbr-balance-amt ${net >= 0 ? 'positive' : 'negative'}`}>
                        {net < 0 ? '-' : ''}{SYM}{fmt(Math.abs(net))}
                      </div>
                    </div>

                    {/* Activity Ratio Progress Bar */}
                    <div
                      className="pbr-flow-bar-wrap"
                      title={`Inflow: ${inPercent.toFixed(0)}% | Outflow: ${(100 - inPercent).toFixed(0)}%`}
                    >
                      <div className="pbr-flow-bar-in" style={{ width: `${inPercent}%` }} />
                      <div className="pbr-flow-bar-out" style={{ width: `${100 - inPercent}%` }} />
                    </div>

                    {/* Inflows vs Outflows rows */}
                    <div className="pbr-stats-rows">
                      <div className="pbr-stat-row">
                        <div className="pbr-stat-left">
                          <FaArrowDown className="pbr-icon-in" />
                          <span className="pbr-stat-name">Inflows (Received)</span>
                        </div>
                        <div className="pbr-stat-right">
                          <span className="pbr-stat-val positive">+{SYM}{fmt(b.inflowAmount)}</span>
                          <span className="pbr-stat-count">{b.inflowCount} txns</span>
                        </div>
                      </div>

                      {/* Sub-breakdown if present */}
                      {(Number(b.salesAmount || 0) > 0 || Number(b.collectionAmount || 0) > 0) && (
                        <div className="pbr-sub-stats">
                          {Number(b.salesAmount || 0) > 0 && (
                            <span>Sales: {SYM}{fmt(b.salesAmount)}</span>
                          )}
                          {Number(b.collectionAmount || 0) > 0 && (
                            <span>Settlements: {SYM}{fmt(b.collectionAmount)}</span>
                          )}
                        </div>
                      )}

                      <div className="pbr-stat-row">
                        <div className="pbr-stat-left">
                          <FaArrowUp className="pbr-icon-out" />
                          <span className="pbr-stat-name">Outflows (Paid Out)</span>
                        </div>
                        <div className="pbr-stat-right">
                          <span className="pbr-stat-val negative">-{SYM}{fmt(b.outflowAmount)}</span>
                          <span className="pbr-stat-count">{b.outflowCount} txns</span>
                        </div>
                      </div>

                      {/* Sub-breakdown if present */}
                      {(Number(b.expenseAmount || 0) > 0 || Number(b.purchaseAmount || 0) > 0) && (
                        <div className="pbr-sub-stats">
                          {Number(b.expenseAmount || 0) > 0 && (
                            <span>Expenses: {SYM}{fmt(b.expenseAmount)}</span>
                          )}
                          {Number(b.purchaseAmount || 0) > 0 && (
                            <span>Purchases: {SYM}{fmt(b.purchaseAmount)}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Card Footer info */}
                    <div className="pbr-card-footer">
                      <span>Avg Inflow: <strong>{SYM}{fmt(b.averageTransaction)}</strong></span>
                      <span>Share: <strong>{Number(b.percentage || 0).toFixed(1)}%</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── DETAILED RECONCILIATION TABLE (RENDERED WHEN viewMode IS 'both' OR 'table') ── */}
      {(viewMode === 'both' || viewMode === 'table') && (
        <div className="pbr-table-section">
          <div className="pbr-table-header">
            <div className="pbr-table-title-row">
              <h3 className="pbr-section-title">Payment Types Reconciliation Ledger</h3>
              <div className="pbr-scroll-hint">
                <FaInfoCircle /> <span>Swipe horizontally for full ledger</span>
              </div>
            </div>
            <span className="pbr-section-sub">
              Itemized ledger reconciling sales, debt settlements, operating expenses, and purchases.
            </span>
          </div>

          {balances.length === 0 ? (
            <div className="pbr-empty">
              {searchQuery ? `No payment types match "${searchQuery}".` : 'No payment transactions recorded for this duration.'}
            </div>
          ) : (
            <div className="pbr-tbl-wrap">
              <table className="pbr-tbl">
                <thead>
                  <tr>
                    <th className="sticky-col">Payment Type</th>
                    <th>Category</th>
                    <th className="r">Sales In</th>
                    <th className="r">Debt Receipts</th>
                    <th className="r bold">Total Inflow</th>
                    <th className="r">Expenses Out</th>
                    <th className="r">Purchases Out</th>
                    <th className="r bold">Total Outflow</th>
                    <th className="r highlight">Net Period Balance</th>
                    <th className="c">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b, i) => {
                    const net = Number(b.netBalance || 0);
                    return (
                      <tr key={i}>
                        <td className="sticky-col">
                          <div className="pbr-tbl-method-col">
                            <span className="pbr-tbl-name">{b.displayName || b.paymentMethod}</span>
                            {b.isConfigured && <span className="pbr-tbl-cfg-tag">Configured</span>}
                          </div>
                        </td>
                        <td>
                          <span className="pbr-tbl-cat-badge">{b.category || 'OTHERS'}</span>
                        </td>
                        <td className="r">{SYM}{fmt(b.salesAmount)}</td>
                        <td className="r">{SYM}{fmt(b.collectionAmount)}</td>
                        <td className="r bold positive">+{SYM}{fmt(b.inflowAmount)}</td>
                        <td className="r">{SYM}{fmt(b.expenseAmount)}</td>
                        <td className="r">{SYM}{fmt(b.purchaseAmount)}</td>
                        <td className="r bold negative">-{SYM}{fmt(b.outflowAmount)}</td>
                        <td className={`r highlight ${net >= 0 ? 'positive' : 'negative'}`}>
                          {net < 0 ? '-' : ''}{SYM}{fmt(Math.abs(net))}
                        </td>
                        <td className="c">
                          <span className={`pbr-badge-sm ${b.status?.toLowerCase()}`}>
                            {b.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="pbr-tbl-footer-row">
                    <td className="sticky-col" colSpan="2">
                      <strong>Grand Total Across All Modes</strong>
                    </td>
                    <td colSpan="2"></td>
                    <td className="r bold positive">+{SYM}{fmt(data?.totalInflow)}</td>
                    <td colSpan="2"></td>
                    <td className="r bold negative">-{SYM}{fmt(data?.totalOutflow)}</td>
                    <td className={`r highlight bold ${Number(data?.netBalance || 0) >= 0 ? 'positive' : 'negative'}`}>
                      {Number(data?.netBalance || 0) < 0 ? '-' : ''}{SYM}{fmt(Math.abs(data?.netBalance || 0))}
                    </td>
                    <td className="c">
                      <span className={`pbr-badge-sm ${Number(data?.netBalance || 0) >= 0 ? 'surplus' : 'deficit'}`}>
                        {Number(data?.netBalance || 0) >= 0 ? 'SURPLUS' : 'DEFICIT'}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── RESPONSIVE DIMENSION METHOD STYLES ── */}
      <style jsx>{`
        /* ── Base Container with Fluid Dimensioning ── */
        .pbr-container {
          display: flex;
          flex-direction: column;
          gap: clamp(14px, 2.5vw, 24px);
          margin-top: 8px;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          overflow: hidden;
        }

        /* ── Responsive Toolbar ── */
        .pbr-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: clamp(10px, 1.8vw, 16px);
          background: #ffffff;
          padding: clamp(12px, 1.8vw, 18px) clamp(14px, 2.2vw, 22px);
          border-radius: 16px;
          border: 1px solid #f1f5f9;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
          box-sizing: border-box;
          width: 100%;
        }

        .pbr-toolbar-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
          flex: 1 1 280px;
        }

        .pbr-toolbar-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .pbr-toolbar-tag {
          font-size: clamp(10.5px, 1.3vw, 11.5px);
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #f97316;
        }

        .pbr-count-pill {
          font-size: 10px;
          font-weight: 800;
          padding: 2px 7px;
          border-radius: 6px;
          background: #fff7ed;
          color: #ea580c;
          border: 1px solid #ffedd5;
        }

        .pbr-toolbar-sub {
          font-size: clamp(11.5px, 1.4vw, 13px);
          color: #64748b;
          font-weight: 500;
          line-height: 1.4;
        }

        /* ── Search Input ── */
        .pbr-search-wrap {
          position: relative;
          display: flex;
          align-items: center;
          flex: 1 1 200px;
          max-width: 280px;
          min-width: 160px;
        }

        :global(.pbr-search-icon) {
          position: absolute;
          left: 11px;
          color: #94a3b8;
          font-size: 12px;
          pointer-events: none;
        }

        .pbr-search-input {
          width: 100%;
          height: 38px;
          padding: 0 28px 0 32px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          font-size: 12px;
          color: #1e293b;
          outline: none;
          box-sizing: border-box;
          transition: all 0.2s ease;
        }

        .pbr-search-input:focus {
          border-color: #f97316;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.12);
        }

        .pbr-search-clear {
          position: absolute;
          right: 8px;
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          font-size: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
        }

        .pbr-search-clear:hover {
          color: #475569;
        }

        /* ── Actions & View Switcher ── */
        .pbr-actions-group {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          flex-shrink: 0;
        }

        .pbr-view-switcher {
          display: inline-flex;
          background: #f1f5f9;
          padding: 3px;
          border-radius: 10px;
          gap: 2px;
        }

        .pbr-view-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 11px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: #64748b;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
          touch-action: manipulation;
          white-space: nowrap;
        }

        .pbr-view-btn:hover {
          color: #0f172a;
        }

        .pbr-view-btn.active {
          background: #ffffff;
          color: #f97316;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }

        .pbr-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .pbr-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 7px 13px;
          min-height: 38px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 700;
          color: #334155;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          cursor: pointer;
          transition: all 0.2s ease;
          touch-action: manipulation;
          box-sizing: border-box;
          white-space: nowrap;
        }

        .pbr-btn:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
          color: #0f172a;
          transform: translateY(-1px);
        }

        .pbr-btn:active {
          transform: scale(0.98);
        }

        .pbr-btn.print {
          background: #fff7ed;
          border-color: #fed7aa;
          color: #ea580c;
        }

        .pbr-btn.print:hover {
          background: #ffedd5;
        }

        .pbr-btn.icon-only {
          padding: 7px 11px;
        }

        :global(.pbr-spin) {
          animation: spin 1s linear infinite;
        }

        /* ── Top KPI Grid ── */
        .pbr-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
          gap: clamp(10px, 1.8vw, 16px);
          width: 100%;
          box-sizing: border-box;
        }

        .pbr-kpi-card {
          background: #ffffff;
          border-radius: 16px;
          padding: clamp(14px, 2vw, 20px);
          border: 1px solid #f1f5f9;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02);
          display: flex;
          flex-direction: column;
          gap: 8px;
          box-sizing: border-box;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          min-width: 0;
        }

        .pbr-kpi-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 14px rgba(0, 0, 0, 0.04);
        }

        .pbr-kpi-card.inflow {
          border-left: 4px solid #10b981;
        }

        .pbr-kpi-card.outflow {
          border-left: 4px solid #f43f5e;
        }

        .pbr-kpi-card.net.surplus {
          border-left: 4px solid #059669;
          background: linear-gradient(to right, #f0fdf4, #ffffff);
        }

        .pbr-kpi-card.net.deficit {
          border-left: 4px solid #e11d48;
          background: linear-gradient(to right, #fff1f2, #ffffff);
        }

        .pbr-kpi-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }

        .pbr-kpi-label {
          font-size: clamp(10px, 1.2vw, 11px);
          font-weight: 800;
          color: #64748b;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .pbr-kpi-icon-box {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          flex-shrink: 0;
        }

        .pbr-kpi-icon-box.inflow {
          background: #ecfdf5;
          color: #10b981;
        }

        .pbr-kpi-icon-box.outflow {
          background: #fff1f2;
          color: #f43f5e;
        }

        .pbr-kpi-icon-box.net.surplus {
          background: #dcfce7;
          color: #16a34a;
        }

        .pbr-kpi-icon-box.net.deficit {
          background: #ffe4e6;
          color: #e11d48;
        }

        .pbr-kpi-amt {
          font-size: clamp(19px, 3.5vw, 26px);
          font-weight: 900;
          color: #0f172a;
          letter-spacing: -0.5px;
          word-break: break-word;
          overflow-wrap: anywhere;
          line-height: 1.15;
        }

        .pbr-kpi-amt.positive {
          color: #059669;
        }

        .pbr-kpi-amt.negative {
          color: #e11d48;
        }

        .pbr-kpi-footer {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 4px;
        }

        .pbr-kpi-sub {
          font-size: 11.5px;
          color: #64748b;
          font-weight: 500;
        }

        .pbr-status-pill {
          font-size: 10px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 6px;
          text-transform: uppercase;
        }

        .pbr-status-pill.surplus {
          background: #dcfce7;
          color: #15803d;
        }

        .pbr-status-pill.deficit {
          background: #fee2e2;
          color: #b91c1c;
        }

        /* ── Section Header ── */
        .pbr-section-wrapper {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
        }

        .pbr-section-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 4px;
        }

        .pbr-section-title-wrap {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
          flex: 1 1 260px;
        }

        .pbr-section-title {
          font-size: clamp(14px, 2vw, 16px);
          font-weight: 800;
          color: #0f172a;
          margin: 0;
        }

        .pbr-section-sub {
          font-size: clamp(11.5px, 1.4vw, 13px);
          color: #64748b;
          line-height: 1.4;
        }

        .pbr-filter-result-badge {
          font-size: 11px;
          font-weight: 700;
          color: #ea580c;
          background: #fff7ed;
          padding: 3px 8px;
          border-radius: 6px;
          border: 1px solid #fed7aa;
          white-space: nowrap;
        }

        /* ── Cards Grid ── */
        .pbr-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
          gap: clamp(12px, 1.8vw, 16px);
          width: 100%;
          box-sizing: border-box;
        }

        .pbr-card {
          background: #ffffff;
          border-radius: 16px;
          padding: clamp(13px, 1.8vw, 18px);
          border: 1px solid #f1f5f9;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          box-sizing: border-box;
          min-width: 0;
        }

        .pbr-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 18px rgba(0, 0, 0, 0.05);
        }

        .pbr-card-header {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .pbr-card-icon {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
        }

        .pbr-card-title-wrap {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .pbr-card-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .pbr-card-title {
          font-size: clamp(13px, 1.7vw, 15px);
          font-weight: 800;
          color: #1e293b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .pbr-config-badge {
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          background: #f1f5f9;
          color: #475569;
          padding: 1px 5px;
          border-radius: 4px;
        }

        .pbr-card-cat {
          font-size: 11px;
          color: #94a3b8;
        }

        .pbr-badge {
          font-size: 10px;
          font-weight: 800;
          padding: 3px 7px;
          border-radius: 6px;
          text-transform: uppercase;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .pbr-badge.surplus {
          background: #ecfdf5;
          color: #059669;
        }

        .pbr-badge.deficit {
          background: #fff1f2;
          color: #e11d48;
        }

        .pbr-badge.settled {
          background: #f1f5f9;
          color: #64748b;
        }

        /* Balance Display */
        .pbr-balance-box {
          background: #f8fafc;
          padding: 10px 12px;
          border-radius: 12px;
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 4px;
        }

        .pbr-balance-label {
          font-size: 10.5px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .pbr-balance-amt {
          font-size: clamp(17px, 2.5vw, 21px);
          font-weight: 900;
          word-break: break-word;
          overflow-wrap: anywhere;
        }

        .pbr-balance-amt.positive {
          color: #059669;
        }

        .pbr-balance-amt.negative {
          color: #e11d48;
        }

        /* Flow / Ratio Bar */
        .pbr-flow-bar-wrap {
          height: 6px;
          background: #f1f5f9;
          border-radius: 3px;
          display: flex;
          overflow: hidden;
          width: 100%;
        }

        .pbr-flow-bar-in {
          background: #10b981;
          height: 100%;
          transition: width 0.4s ease;
        }

        .pbr-flow-bar-out {
          background: #f43f5e;
          height: 100%;
          transition: width 0.4s ease;
        }

        /* Stat Rows */
        .pbr-stats-rows {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .pbr-stat-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }

        .pbr-stat-left {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }

        :global(.pbr-icon-in) {
          color: #10b981;
          font-size: 11px;
          flex-shrink: 0;
        }

        :global(.pbr-icon-out) {
          color: #f43f5e;
          font-size: 11px;
          flex-shrink: 0;
        }

        .pbr-stat-name {
          font-size: 12px;
          font-weight: 600;
          color: #475569;
          white-space: nowrap;
        }

        .pbr-stat-right {
          display: flex;
          align-items: baseline;
          gap: 6px;
          flex-shrink: 0;
        }

        .pbr-stat-val {
          font-size: clamp(12px, 1.8vw, 13.5px);
          font-weight: 800;
        }

        .pbr-stat-val.positive {
          color: #059669;
        }

        .pbr-stat-val.negative {
          color: #e11d48;
        }

        .pbr-stat-count {
          font-size: 11px;
          color: #94a3b8;
          font-weight: 500;
        }

        .pbr-sub-stats {
          font-size: 10px;
          color: #94a3b8;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding-left: 17px;
          margin-top: -3px;
        }

        /* Card Footer */
        .pbr-card-footer {
          border-top: 1px dashed #e2e8f0;
          padding-top: 8px;
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #64748b;
        }

        /* ── Table Section ── */
        .pbr-table-section {
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #f1f5f9;
          padding: clamp(14px, 2vw, 20px);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
          display: flex;
          flex-direction: column;
          gap: 14px;
          margin-top: 4px;
          width: 100%;
          box-sizing: border-box;
          overflow: hidden;
        }

        .pbr-table-header {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .pbr-table-title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }

        .pbr-scroll-hint {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 600;
          color: #f97316;
          background: #fff7ed;
          padding: 3px 8px;
          border-radius: 6px;
          border: 1px solid #ffedd5;
        }

        .pbr-tbl-wrap {
          width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border: 1px solid #f1f5f9;
          border-radius: 12px;
          position: relative;
        }

        .pbr-tbl {
          width: 100%;
          min-width: 860px;
          border-collapse: collapse;
          font-size: 13px;
        }

        .pbr-tbl th {
          text-align: left;
          padding: 10px 12px;
          font-size: 11px;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          border-bottom: 2px solid #f1f5f9;
          background: #f8fafc;
          white-space: nowrap;
        }

        .pbr-tbl td {
          padding: 11px 12px;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
          white-space: nowrap;
        }

        /* Sticky first column for swipe on small screens */
        .sticky-col {
          position: sticky;
          left: 0;
          z-index: 2;
          background: #ffffff;
        }

        .pbr-tbl th.sticky-col {
          background: #f8fafc;
          z-index: 3;
        }

        .pbr-tbl tfoot .sticky-col {
          background: #f8fafc;
        }

        .sticky-col::after {
          content: '';
          position: absolute;
          top: 0;
          right: -4px;
          bottom: 0;
          width: 4px;
          background: linear-gradient(to right, rgba(0, 0, 0, 0.05), transparent);
          pointer-events: none;
        }

        .pbr-tbl th.r, .pbr-tbl td.r {
          text-align: right;
        }

        .pbr-tbl th.c, .pbr-tbl td.c {
          text-align: center;
        }

        .pbr-tbl td.bold {
          font-weight: 700;
        }

        .pbr-tbl td.positive {
          color: #059669;
        }

        .pbr-tbl td.negative {
          color: #e11d48;
        }

        .pbr-tbl td.highlight {
          font-weight: 800;
          font-size: 13.5px;
          background: #fafafa;
        }

        .pbr-tbl-method-col {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .pbr-tbl-name {
          font-weight: 700;
          color: #0f172a;
        }

        .pbr-tbl-cfg-tag {
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          background: #eff6ff;
          color: #2563eb;
          padding: 1px 4px;
          border-radius: 4px;
        }

        .pbr-tbl-cat-badge {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .pbr-badge-sm {
          font-size: 10px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .pbr-badge-sm.surplus {
          background: #dcfce7;
          color: #16a34a;
        }

        .pbr-badge-sm.deficit {
          background: #fee2e2;
          color: #dc2626;
        }

        .pbr-badge-sm.settled {
          background: #f1f5f9;
          color: #64748b;
        }

        .pbr-tbl-footer-row td {
          border-top: 2px solid #cbd5e1;
          font-size: 13px;
          background: #f8fafc;
        }

        .pbr-empty {
          padding: 36px 20px;
          text-align: center;
          color: #94a3b8;
          font-size: 13px;
          font-weight: 500;
          background: #ffffff;
          border-radius: 16px;
          border: 1px dashed #cbd5e1;
          width: 100%;
          box-sizing: border-box;
        }

        /* ── RESPONSIVE DIMENSION BREAKPOINTS (ALL DEVICES WORLDWIDE) ── */

        /* 1. Large Monitors / 4K / Ultra-wide (> 1440px) */
        @media (min-width: 1440px) {
          .pbr-cards-grid {
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          }
          .pbr-scroll-hint {
            display: none;
          }
        }

        /* 2. Standard Tablets, Dual-Screen POS & Laptops (<= 1024px) */
        @media (max-width: 1024px) {
          .pbr-search-wrap {
            max-width: 100%;
            flex: 1 1 100%;
          }
          .pbr-actions-group {
            width: 100%;
            justify-content: space-between;
          }
        }

        /* 3. Small Tablets & Handheld POS in Landscape (<= 768px) */
        @media (max-width: 768px) {
          .pbr-toolbar {
            padding: 12px 14px;
          }
          .pbr-actions-group {
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
          }
          .pbr-view-switcher {
            width: 100%;
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
          }
          .pbr-view-btn {
            justify-content: center;
          }
          .pbr-actions {
            width: 100%;
            display: grid;
            grid-template-columns: 1fr 1fr 1fr auto;
            gap: 6px;
          }
          .pbr-btn {
            padding: 6px 10px;
            font-size: 11px;
            justify-content: center;
          }
        }

        /* 4. Handheld Smart POS & Mobile in Portrait (<= 480px, e.g. Sunmi V2, iMin M2, PAX) */
        @media (max-width: 480px) {
          .pbr-container {
            gap: 12px;
          }
          .pbr-toolbar {
            padding: 10px 12px;
            border-radius: 12px;
          }
          .pbr-actions {
            grid-template-columns: 1fr 1fr;
          }
          .pbr-btn.icon-only {
            grid-column: span 2;
          }
          .pbr-kpi-grid {
            grid-template-columns: 1fr;
          }
          .pbr-cards-grid {
            grid-template-columns: 1fr;
          }
          .pbr-card {
            border-radius: 14px;
            padding: 12px;
          }
          .pbr-kpi-card {
            border-radius: 14px;
            padding: 12px;
          }
          .pbr-balance-box {
            padding: 8px 10px;
          }
          .pbr-card-footer {
            flex-direction: column;
            gap: 4px;
          }
          .pbr-table-section {
            padding: 12px;
            border-radius: 14px;
          }
        }

        /* 5. Ultra-compact Displays (<= 360px: iPhone SE 1st gen, small POS, fold outer screen) */
        @media (max-width: 360px) {
          .pbr-container {
            gap: 10px;
          }
          .pbr-toolbar {
            padding: 8px 10px;
          }
          .pbr-toolbar-tag {
            font-size: 9.5px;
          }
          .pbr-toolbar-sub {
            font-size: 11px;
          }
          .pbr-actions {
            grid-template-columns: 1fr;
          }
          .pbr-btn.icon-only {
            grid-column: span 1;
          }
          .pbr-card-title {
            max-width: 140px;
          }
          .pbr-balance-amt {
            font-size: 16px;
          }
          .pbr-stat-name {
            font-size: 11px;
          }
          .pbr-stat-val {
            font-size: 11.5px;
          }
        }

        /* ── Print Styles ── */
        @media print {
          .pbr-toolbar,
          .pbr-search-wrap,
          .pbr-actions-group,
          .pbr-scroll-hint {
            display: none !important;
          }
          .pbr-container {
            gap: 12px;
          }
          .pbr-card, .pbr-kpi-card, .pbr-table-section {
            box-shadow: none !important;
            border: 1px solid #000 !important;
          }
          .sticky-col {
            position: static !important;
          }
        }
      `}</style>
    </div>
  );
}
