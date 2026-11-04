import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useCurrencyDecimals } from '../../hooks/useCurrencyConfig';
import api from '../../utils/api';
import { useNotification } from '../../context/NotificationContext';
import { printUniversal } from '../../utils/printGateway';
import {
  FaMoneyBillWave, FaCreditCard, FaMobileAlt, FaWallet,
  FaFileCsv, FaFileExcel, FaPrint, FaBalanceScale,
  FaArrowDown, FaArrowUp, FaExclamationCircle,
  FaHandHoldingUsd, FaSync, FaThLarge, FaTable
} from 'react-icons/fa';
import { businessTimeToUtc, getBusinessNow } from '../../utils/timezoneUtils';
import NiceSelect from '../NiceSelect';

export default function PaymentTypeBalanceReport({
  dateFrom,
  dateTo,
  selectedOrgId,
  selectedTerminalId,
  config,
  isSuperAdmin,
  timezone
}) {
  const currencyDecimals = useCurrencyDecimals();
  const { notify } = useNotification();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'
  const [selectedType, setSelectedType] = useState(''); // '' = all payment types

  const SYM = config?.currencySymbol || '';

  const num = (v) => Number(v || 0);
  const fmt = (v) => num(v).toLocaleString('en-IN', {
    minimumFractionDigits: currencyDecimals,
    maximumFractionDigits: currencyDecimals
  });
  const money = (v) => `${num(v) < 0 ? '-' : ''}${SYM}${fmt(Math.abs(num(v)))}`;

  const toInstant = (dtLocal, isEnd = false) => {
    if (!dtLocal) return undefined;
    const val = isEnd && dtLocal.length === 16 ? `${dtLocal}:59` : dtLocal;
    try { return businessTimeToUtc(val, timezone); } catch { return undefined; }
  };

  // Today's date in the org timezone (used in export file names)
  const getLocalDate = () => {
    const d = getBusinessNow(timezone);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const loadBalances = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        from: toInstant(dateFrom),
        to: toInstant(dateTo, true)
      };
      if (selectedOrgId) params.orgId = selectedOrgId;
      if (selectedTerminalId) params.terminalId = selectedTerminalId;

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
  }, [dateFrom, dateTo, selectedOrgId, selectedTerminalId, timezone, notify]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  const getTheme = (b) => {
    const m = `${b.paymentMethod || ''} ${b.displayName || ''}`.toUpperCase();
    if (b.isReceivable) return { color: '#7c3aed', bg: '#f5f3ff', icon: <FaHandHoldingUsd /> };
    if (m.includes('CASH')) return { color: '#059669', bg: '#ecfdf5', icon: <FaMoneyBillWave /> };
    if (['ONLINE', 'UPI', 'GPAY', 'PAYTM', 'PHONEPE'].some(k => m.includes(k))) {
      return { color: '#ea580c', bg: '#fff7ed', icon: <FaMobileAlt /> };
    }
    if (['CARD', 'DEBIT', 'BANK'].some(k => m.includes(k))) {
      return { color: '#2563eb', bg: '#eff6ff', icon: <FaCreditCard /> };
    }
    return { color: '#475569', bg: '#f1f5f9', icon: <FaWallet /> };
  };

  const hasActivity = (b) => num(b.inflowAmount) > 0 || num(b.outflowAmount) > 0;

  // Mixed / split payments are already distributed into their component tenders by the backend.
  const rawBalances = useMemo(() => {
    return (data?.balances || []).filter(b => {
      const m = String(b.paymentMethod || '').toUpperCase();
      const d = String(b.displayName || '').toUpperCase();
      return !m.includes('MIXED') && !m.includes('SPLIT') && !d.includes('MIXED') && !d.includes('SPLIT');
    });
  }, [data]);

  const balances = useMemo(() => {
    // A picked type is shown even with no activity; "All" hides idle types.
    if (selectedType) return rawBalances.filter(b => b.paymentMethod === selectedType);
    return rawBalances.filter(hasActivity);
  }, [rawBalances, selectedType]);

  const tenders = balances.filter(b => !b.isReceivable);

  const tenderTotals = useMemo(() => {
    const keys = ['salesAmount', 'collectionAmount', 'inflowAmount', 'expenseAmount', 'purchaseAmount', 'refundAmount', 'outflowAmount', 'netBalance'];
    const totals = Object.fromEntries(keys.map(k => [k, 0]));
    tenders.forEach(b => keys.forEach(k => { totals[k] += num(b[k]); }));
    return totals;
  }, [tenders]);

  // Credit given / paid follow the selected dates; balance = given − paid in that period.
  const creditGiven = num(data?.creditGiven);
  const creditCollected = num(data?.creditCollected);
  const creditBalance = creditGiven - creditCollected;
  const hasCredit = creditBalance !== 0 || creditGiven > 0 || creditCollected > 0;
  const creditCards = hasCredit
    ? rawBalances.filter(b => b.isReceivable && (!selectedType || b.paymentMethod === selectedType))
    : [];
  const netTotal = num(data?.netBalance);

  const exportRows = () => balances.map(b => ({
    'Payment Type': b.displayName || b.paymentMethod,
    'Kind': b.isReceivable ? 'Receivable (on account)' : 'Tender',
    'Category': b.category,
    'Sales': num(b.salesAmount),
    'Collections / Settlements': num(b.collectionAmount),
    'Total In': num(b.inflowAmount),
    'In Txns': num(b.inflowCount),
    'Expenses': num(b.expenseAmount),
    'Purchases': num(b.purchaseAmount),
    'Refunds': num(b.refundAmount),
    'Total Out': num(b.outflowAmount),
    'Out Txns': num(b.outflowCount),
    'Net': num(b.netBalance),
    'Status': b.status
  }));

  const handleExportCSV = () => {
    if (!balances.length) return notify('error', 'No balance data to export');
    const rows = exportRows();
    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.map(csvCell).join(','),
      ...rows.map(r => headers.map(h => csvCell(r[h])).join(','))
    ].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
    a.download = `payment_balances_${getLocalDate()}.csv`;
    a.click();
    notify('success', 'Payment balances exported to CSV');
  };

  const handleExportExcel = async () => {
    if (!balances.length) return notify('error', 'No balance data to export');
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(exportRows());
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Payment Balances');
      XLSX.writeFile(wb, `payment_balances_${getLocalDate()}.xlsx`);
      notify('success', 'Payment balances exported to Excel');
    } catch (e) {
      console.error('Excel export error:', e);
      notify('error', 'Failed to export Excel');
    }
  };

  const handlePrint = async () => {
    if (!balances.length) return notify('error', 'No balance data to print');
    const W = 32;
    const dashes = '-'.repeat(W);
    const center = (str) => ' '.repeat(Math.max(0, Math.floor((W - str.length) / 2))) + str;
    const rowTwo = (l, r) => l + ' '.repeat(Math.max(1, W - l.length - r.length)) + r;

    const lines = [];
    lines.push(center('PAYMENT BALANCES REPORT'));
    lines.push(center(`${(dateFrom || '').slice(0, 10)} to ${(dateTo || '').slice(0, 10)}`));
    lines.push(dashes);
    lines.push(rowTwo('Collected:', `${SYM}${fmt(data?.totalInflow)}`));
    lines.push(rowTwo('Paid out:', `${SYM}${fmt(data?.totalOutflow)}`));
    lines.push(rowTwo('Net in hand:', money(data?.netBalance)));
    lines.push(dashes);
    lines.push('TENDER          IN         OUT');
    lines.push(dashes);
    tenders.forEach(b => {
      const name = (b.displayName || b.paymentMethod).padEnd(10).slice(0, 10);
      lines.push(`${name}${fmt(b.inflowAmount).padStart(11).slice(-11)}${fmt(b.outflowAmount).padStart(11).slice(-11)}`);
      lines.push(rowTwo('  Net:', money(b.netBalance)));
    });
    if (hasCredit) {
      lines.push(dashes);
      lines.push('CREDIT');
      lines.push(rowTwo('  Credit given:', `${SYM}${fmt(creditGiven)}`));
      lines.push(rowTwo('  Credit paid:', `${SYM}${fmt(creditCollected)}`));
      lines.push(rowTwo('  Balance to collect:', money(creditBalance)));
    }
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
      <div className="pbr-state">
        <FaSync className="pbr-spin pbr-state-icon" />
        <span>Calculating payment type balances…</span>
        <style jsx>{`
          .pbr-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 64px 16px; color: #64748b; font-weight: 600; font-size: 14px; }
          :global(.pbr-state-icon) { font-size: 28px; color: #f97316; }
          :global(.pbr-spin) { animation: pbr-spin 1s linear infinite; }
          @keyframes pbr-spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="pbr-state error">
        <FaExclamationCircle className="pbr-state-icon" />
        <span>{error}</span>
        <button className="pbr-retry" onClick={loadBalances}><FaSync /> Retry</button>
        <style jsx>{`
          .pbr-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 56px 16px; color: #e11d48; font-weight: 600; text-align: center; }
          :global(.pbr-state-icon) { font-size: 30px; }
          .pbr-retry { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 10px; background: #f97316; color: #fff; border: none; font-weight: 700; cursor: pointer; }
          .pbr-retry:hover { background: #ea580c; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="pbr-container">
      {/* ── TOOLBAR ── */}
      <div className="pbr-toolbar">
        <div className="pbr-toolbar-info">
          <h3 className="pbr-title">Payment Balances</h3>
          <span className="pbr-subtitle">How much came in and went out for each payment type</span>
        </div>

        <div className="pbr-toolbar-controls">
          <div className="pbr-type-filter">
          <NiceSelect
            value={selectedType}
            onChange={setSelectedType}
            options={[
              { value: '', label: 'All Payment Types' },
              ...rawBalances.map(b => ({ value: b.paymentMethod, label: b.displayName || b.paymentMethod }))
            ]}
            placeholder="All Payment Types"
          />
          </div>

          <div className="pbr-seg" role="tablist" aria-label="View">
            <button type="button" className={viewMode === 'cards' ? 'active' : ''} onClick={() => setViewMode('cards')}>
              <FaThLarge /> Cards
            </button>
            <button type="button" className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>
              <FaTable /> Ledger
            </button>
          </div>

          <div className="pbr-actions">
            <button className="pbr-btn" onClick={handleExportCSV}><FaFileCsv /> CSV</button>
            <button className="pbr-btn" onClick={handleExportExcel}><FaFileExcel /> Excel</button>
            <button className="pbr-btn" onClick={handlePrint}><FaPrint /> Print</button>
            <button className="pbr-btn icon" onClick={loadBalances} title="Refresh" aria-label="Refresh">
              <FaSync className={loading ? 'pbr-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* ── SUMMARY TILES (same look as the Sales report KPIs) ── */}
      <div className={`pbr-kpi-grid ${loading ? 'loading' : ''}`}>
        {[
          { label: 'Money In', val: `${SYM}${fmt(data?.totalInflow)}`, color: '#10b981', bg: '#ecfdf5', icon: <FaArrowDown /> },
          { label: 'Money Out', val: `${SYM}${fmt(data?.totalOutflow)}`, color: '#ef4444', bg: '#fef2f2', icon: <FaArrowUp /> },
          { label: 'Balance', val: money(netTotal), color: '#f97316', bg: '#fff7ed', icon: <FaBalanceScale />, neg: netTotal < 0 },
          hasCredit && { label: 'Credit to Collect', val: money(creditBalance), color: '#8b5cf6', bg: '#f5f3ff', icon: <FaHandHoldingUsd /> }
        ].filter(Boolean).map((c) => (
          <div key={c.label} className="pbr-kpi" style={{ borderLeft: `2.5px solid ${c.color}` }}>
            <span className="pbr-kpi-label">{c.label}</span>
            <span className={`pbr-kpi-val ${c.neg ? 'neg' : ''}`}>{c.val}</span>
            <div className="pbr-kpi-icon" style={{ background: c.bg, color: c.color }}>{c.icon}</div>
          </div>
        ))}
      </div>

      {tenders.length + creditCards.length === 0 ? (
        <div className="pbr-empty">
          No payments in this period.
        </div>
      ) : viewMode === 'cards' ? (
        <div className={`pbr-cards ${loading ? 'loading' : ''}`}>
          {[...tenders, ...creditCards].map((b) => {
            const theme = getTheme(b);
            const inAmt = num(b.inflowAmount);
            const outAmt = num(b.outflowAmount);
            const net = num(b.netBalance);
            const receivable = !!b.isReceivable;

            const inParts = receivable
              ? []
              : [['Sales', b.salesAmount], ['Customer payments', b.collectionAmount]].filter(([, v]) => num(v) > 0);
            const outParts = receivable
              ? []
              : [['Expenses', b.expenseAmount], ['Purchases', b.purchaseAmount], ['Refunds', b.refundAmount]].filter(([, v]) => num(v) > 0);

            if (receivable) {
              // Credit is not money in hand: given = customers now owe more, collected = they paid back.
              return (
                <div key={b.paymentMethod} className="pbr-card" style={{ '--accent': theme.color, '--accent-bg': theme.bg }}>
                  <div className="pbr-card-head">
                    <div className="pbr-card-icon">{theme.icon}</div>
                    <span className="pbr-card-name" title={b.displayName || b.paymentMethod}>{b.displayName || b.paymentMethod}</span>
                  </div>

                  <div className="pbr-card-net">
                    <span className="pbr-card-net-label">Balance to Collect</span>
                    <span className="pbr-card-net-amt">{money(creditBalance)}</span>
                  </div>

                  <div className="pbr-flows">
                    <div className="pbr-flow-top">
                      <span className="pbr-flow-label"><FaArrowUp className="credit" /> Credit given</span>
                      <span className="pbr-flow-amt">{SYM}{fmt(creditGiven)}</span>
                    </div>
                    <div className="pbr-flow-top">
                      <span className="pbr-flow-label"><FaArrowDown className="in" /> Credit paid</span>
                      <span className="pbr-flow-amt">{SYM}{fmt(creditCollected)}</span>
                    </div>
                  </div>
                </div>
              );
            }

            const labels = { net: 'Balance', in: 'Money in', out: 'Money out' };

            return (
              <div key={b.paymentMethod} className="pbr-card" style={{ '--accent': theme.color, '--accent-bg': theme.bg }}>
                <div className="pbr-card-head">
                  <div className="pbr-card-icon">{theme.icon}</div>
                  <span className="pbr-card-name" title={b.displayName || b.paymentMethod}>{b.displayName || b.paymentMethod}</span>
                </div>

                <div className="pbr-card-net">
                  <span className="pbr-card-net-label">{labels.net}</span>
                  <span className={`pbr-card-net-amt ${receivable ? 'credit' : net < 0 ? 'neg' : 'pos'}`}>
                    {money(net)}
                  </span>
                </div>

                <div className="pbr-flows">
                  {inAmt > 0 && (
                    <div className="pbr-flow">
                      <div className="pbr-flow-top">
                        <span className="pbr-flow-label"><FaArrowDown className="in" /> {labels.in}</span>
                        <span className="pbr-flow-amt in">{SYM}{fmt(inAmt)}</span>
                      </div>
                      {inParts.length > 1 && (
                        <div className="pbr-flow-sub">
                          {inParts.map(([k, v]) => <span key={k}>{k} {SYM}{fmt(v)}</span>)}
                        </div>
                      )}
                    </div>
                  )}
                  {outAmt > 0 && (
                    <div className="pbr-flow">
                      <div className="pbr-flow-top">
                        <span className="pbr-flow-label"><FaArrowUp className="out" /> {labels.out}</span>
                        <span className="pbr-flow-amt out">{SYM}{fmt(outAmt)}</span>
                      </div>
                      {outParts.length > 1 && (
                        <div className="pbr-flow-sub">
                          {outParts.map(([k, v]) => <span key={k}>{k} {SYM}{fmt(v)}</span>)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={`pbr-tbl-card ${loading ? 'loading' : ''}`}>
          <div className="pbr-tbl-wrap">
            <table className="pbr-tbl">
              <thead>
                <tr>
                  <th className="sticky-col" rowSpan="2">Payment type</th>
                  <th className="c grp in" colSpan="3">Money In</th>
                  <th className="c grp out" colSpan="4">Money Out</th>
                  <th className="r" rowSpan="2">Balance</th>
                </tr>
                <tr>
                  <th className="r">Sales</th>
                  <th className="r">Customer payments</th>
                  <th className="r">Total</th>
                  <th className="r">Expenses</th>
                  <th className="r">Purchases</th>
                  <th className="r">Refunds</th>
                  <th className="r">Total</th>
                </tr>
              </thead>
              <tbody>
                {tenders.map((b) => {
                  const net = num(b.netBalance);
                  const active = hasActivity(b);
                  return (
                    <tr key={b.paymentMethod} className={active ? '' : 'idle'}>
                      <td className="sticky-col">
                        <div className="pbr-tbl-name">
                          {b.displayName || b.paymentMethod}
                        </div>
                      </td>
                      <td className="r">{fmt(b.salesAmount)}</td>
                      <td className="r">{fmt(b.collectionAmount)}</td>
                      <td className="r strong in">{fmt(b.inflowAmount)}</td>
                      <td className="r">{fmt(b.expenseAmount)}</td>
                      <td className="r">{fmt(b.purchaseAmount)}</td>
                      <td className="r">{fmt(b.refundAmount)}</td>
                      <td className="r strong out">{fmt(b.outflowAmount)}</td>
                      <td className={`r net ${net < 0 ? 'neg' : net > 0 ? 'pos' : ''}`}>{money(net)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="sticky-col">Total ({SYM})</td>
                  <td className="r">{fmt(tenderTotals.salesAmount)}</td>
                  <td className="r">{fmt(tenderTotals.collectionAmount)}</td>
                  <td className="r strong in">{fmt(tenderTotals.inflowAmount)}</td>
                  <td className="r">{fmt(tenderTotals.expenseAmount)}</td>
                  <td className="r">{fmt(tenderTotals.purchaseAmount)}</td>
                  <td className="r">{fmt(tenderTotals.refundAmount)}</td>
                  <td className="r strong out">{fmt(tenderTotals.outflowAmount)}</td>
                  <td className={`r net ${tenderTotals.netBalance < 0 ? 'neg' : 'pos'}`}>{money(tenderTotals.netBalance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {hasCredit && (
            <div className="pbr-credit-note">
              <div className="pbr-credit-line">
                <span className="pbr-credit-name"><FaHandHoldingUsd /> Credit <em>(not included in totals)</em></span>
                <span>Credit given <strong>{SYM}{fmt(creditGiven)}</strong></span>
                <span>Credit paid <strong>{SYM}{fmt(creditCollected)}</strong></span>
                <span>Balance to collect <strong>{money(creditBalance)}</strong></span>
              </div>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .pbr-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 8px;
          width: 100%;
          box-sizing: border-box;
          color: #0f172a;
        }
        .loading { opacity: 0.55; transition: opacity 0.2s; pointer-events: none; }

        /* ── Toolbar ── */
        .pbr-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px 20px;
          background: #fff;
          padding: 14px 18px;
          border-radius: 14px;
          border: 1px solid #e5e7eb;
        }
        .pbr-toolbar-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 220px; }
        .pbr-title { margin: 0; font-size: 16px; font-weight: 800; }
        .pbr-subtitle { font-size: 12.5px; color: #64748b; }
        .pbr-toolbar-controls { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: nowrap; }
        .pbr-type-filter { width: 200px; flex: 0 0 200px; }



        .pbr-seg { display: inline-flex; background: #f1f5f9; padding: 3px; border-radius: 9px; gap: 2px; }
        .pbr-seg button {
          display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 7px; border: none;
          background: transparent; color: #64748b; font-size: 12px; font-weight: 700; cursor: pointer;
        }
        .pbr-seg button.active { background: #fff; color: #f97316; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }

        .pbr-actions { display: flex; gap: 6px; }
        .pbr-btn {
          height: 36px; padding: 0 14px; border-radius: 10px; border: 1.5px solid #f97316; background: #fff; color: #f97316;
          font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; transition: .2s;
        }
        .pbr-btn.icon { width: 36px; padding: 0; justify-content: center; font-size: 13px; }
        .pbr-btn:hover { background: #fff7ed; transform: translateY(-1px); }
        :global(.pbr-spin) { animation: pbr-spin 1s linear infinite; }
        @keyframes pbr-spin { to { transform: rotate(360deg); } }

        /* ── Summary tiles ── */
        .pbr-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
        .pbr-kpi {
          background: #fff; padding: 10px 14px; border-radius: 12px; border: 1px solid #f1f5f9;
          display: grid; grid-template-areas: "label icon" "value icon"; grid-template-columns: 1fr auto;
          align-items: center; gap: 4px 10px; min-height: 64px; transition: .2s;
        }
        .pbr-kpi:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,.03); }
        .pbr-kpi-icon { grid-area: icon; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .pbr-kpi-label { grid-area: label; font-size: 9.5px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .4px; }
        .pbr-kpi-val { grid-area: value; font-size: 18px; font-weight: 800; color: #1e293b; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
        .neg { color: #dc2626 !important; }
        :global(.pbr-flow-label .in) { color: #10b981; }
        :global(.pbr-flow-label .out) { color: #ef4444; }
        :global(.pbr-flow-label .credit) { color: #8b5cf6; }

        /* ── Cards ── */
        .pbr-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(min(100%, 290px), 1fr));
          gap: 14px;
        }
        .pbr-card {
          position: relative;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-width: 0;
          border-left: 2.5px solid var(--accent);
          transition: .2s;
        }
        .pbr-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,.04); }

        .pbr-card-head { display: flex; align-items: center; gap: 10px; }
        .pbr-card-icon {
          width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
          background: var(--accent-bg); color: var(--accent); font-size: 15px; flex-shrink: 0;
        }
        .pbr-card-name { flex: 1; min-width: 0; font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .pbr-card-net { display: flex; flex-direction: column; gap: 2px; }
        .pbr-card-net-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #64748b; }
        .pbr-card-net-amt { font-size: 24px; font-weight: 800; color: #1e293b; letter-spacing: -0.5px; line-height: 1.15; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }

        .pbr-flows { display: flex; flex-direction: column; gap: 12px; border-top: 1px solid #f1f5f9; padding-top: 12px; }
        .pbr-flow { display: flex; flex-direction: column; gap: 5px; }
        .pbr-flow-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
        .pbr-flow-label { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: #475569; }
        .pbr-flow-amt { font-size: 14px; font-weight: 700; color: #1e293b; font-variant-numeric: tabular-nums; }
        .pbr-flow-sub { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11px; color: #94a3b8; }

        /* ── Ledger table ── */
        .pbr-tbl-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; }
        .pbr-tbl-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .pbr-tbl { width: 100%; min-width: 820px; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
        .pbr-tbl th {
          padding: 9px 14px; font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase;
          letter-spacing: 0.4px; background: #fff; border-bottom: 2px solid #FF7A00; white-space: nowrap; text-align: left;
        }
        .pbr-tbl th.grp { border-bottom: 1px solid #fed7aa; color: #ea580c; }
        .pbr-tbl td { padding: 11px 14px; border-bottom: 1px solid #f1f5f9; color: #334155; white-space: nowrap; }
        .pbr-tbl tbody tr:hover td { background: #fff7ed; }
        .pbr-tbl tr.idle td { color: #cbd5e1; }
        .pbr-tbl .r { text-align: right; }
        .pbr-tbl .c { text-align: center; }
        .pbr-tbl td.strong { font-weight: 700; }
        .pbr-tbl td.net { font-weight: 800; color: #1e293b; background: #fffaf5; }
        .pbr-tbl tfoot td { background: #f8fafc; font-weight: 800; border-top: 2px solid #e2e8f0; border-bottom: none; color: #0f172a; }
        .pbr-tbl-name { display: flex; align-items: center; gap: 8px; font-weight: 700; color: #0f172a; }
        .sticky-col { position: sticky; left: 0; z-index: 1; background: #fff; }
        .pbr-tbl th.sticky-col { background: #fff; z-index: 2; }
        .pbr-tbl tfoot .sticky-col { background: #f8fafc; z-index: 2; }

        .pbr-credit-note { border-top: 1px solid #f1f5f9; background: #f5f3ff; padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; }
        .pbr-credit-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 20px; font-size: 12.5px; color: #475569; }
        .pbr-credit-name { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: #7c3aed; }
        .pbr-credit-name em { font-style: normal; font-weight: 500; color: #94a3b8; }

        .pbr-empty {
          padding: 40px 20px; text-align: center; color: #94a3b8; font-size: 13px;
          background: #fff; border-radius: 14px; border: 1px dashed #cbd5e1;
        }

        /* ── Responsive ── */
        @media (max-width: 1100px) {
          .pbr-kpi-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 1024px) {
          .pbr-toolbar-controls { width: 100%; flex-wrap: wrap; justify-content: flex-start; }
          .pbr-type-filter { flex: 1 1 200px; width: auto; }
        }
        @media (max-width: 768px) {
          .pbr-toolbar { padding: 12px 14px; }
          .pbr-type-filter { flex: 1 1 100%; }
          .pbr-actions { margin-left: auto; }
        }
        @media (max-width: 480px) {
          .pbr-kpi-grid { grid-template-columns: 1fr; }
          .pbr-cards { grid-template-columns: 1fr; }
          .pbr-card-net-amt { font-size: 22px; }
        }

        @media print {
          .pbr-toolbar-controls { display: none !important; }
          .pbr-card, .pbr-kpi, .pbr-tbl-card { box-shadow: none !important; border: 1px solid #000 !important; }
          .sticky-col { position: static !important; }
        }
      `}</style>
    </div>
  );
}
