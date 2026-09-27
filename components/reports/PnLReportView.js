import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../utils/api';
import { useNotification } from '../../context/NotificationContext';
import { subscribeAccountingDataChanged } from '../../utils/accountingRealtime';
import { printUniversal } from '../../utils/printGateway';
import { buildThermalReportText } from '../../utils/thermalReportFormatter';
import {
  FaChartLine, FaFileCsv, FaFileExcel, FaPrint, FaInfoCircle
} from 'react-icons/fa';

export default function PnLReportView({
  dateFrom,
  dateTo,
  selectedOrgId,
  selectedTerminalId,
  config,
  isSuperAdmin,
  timezone,
  SYM = '₹'
}) {
  const { notify } = useNotification();
  const [pnl, setPnl] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [activeTooltip, setActiveTooltip] = useState(null);

  const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const toInstant = (dtLocal) => {
    if (!dtLocal) return undefined;
    try { return new Date(dtLocal + ':00').toISOString(); } catch { return undefined; }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const params = { from: toInstant(dateFrom), to: toInstant(dateTo) };
    if (isSuperAdmin && selectedOrgId) params.orgId = selectedOrgId;
    if (isSuperAdmin && selectedTerminalId) params.terminalId = selectedTerminalId;

    try {
      setPnl(null);
      setReconciliation(null);
      const [pnlRes, reconciliationRes] = await Promise.allSettled([
        api.get('/api/v1/reports/profit-loss', { params }),
        api.get('/api/v1/accounting/reconciliation', { params })
      ]);

      if (pnlRes.status === 'fulfilled' && pnlRes.value.data?.success) {
        setPnl(pnlRes.value.data.data);
      } else if (pnlRes.status === 'rejected') {
        throw pnlRes.reason;
      }

      if (reconciliationRes.status === 'fulfilled' && reconciliationRes.value.data?.success) {
        setReconciliation(reconciliationRes.value.data.data || null);
      }
    } catch (err) {
      console.error('PnL report load error:', err);
      const msg = err?.response?.data?.message || 'Failed to load Profit & Loss report';
      setLoadError(msg);
      notify('error', msg);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, isSuperAdmin, selectedOrgId, selectedTerminalId, notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let timerId = null;
    const scheduleRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      if (timerId) window.clearTimeout(timerId);
      timerId = window.setTimeout(() => loadData(), 500);
    };
    const unsubscribe = subscribeAccountingDataChanged(scheduleRefresh);
    window.addEventListener('focus', scheduleRefresh);
    return () => {
      if (timerId) window.clearTimeout(timerId);
      unsubscribe?.();
      window.removeEventListener('focus', scheduleRefresh);
    };
  }, [loadData]);

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

  const handlePrint = async () => {
    if (!pnl) return;
    const text = buildThermalReportText('pnl', pnl, config, timezone, { start: dateFrom, end: dateTo });
    try {
      await printUniversal({ text, jobKind: 'bill', allowSystemDialog: true });
    } catch (e) {
      notify('error', e.message || 'Printer not configured');
    }
  };

  const InfoTooltip = ({ id, text }) => {
    const isOpen = activeTooltip === id;
    const ref = useRef(null);
    const [coords, setCoords] = useState({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
    const [arrowCoords, setArrowCoords] = useState({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });

    useEffect(() => {
      if (isOpen && ref.current) {
        const rect = ref.current.getBoundingClientRect();
        if (rect.left < 16) {
          setCoords({ left: '-16px', transform: 'none', right: 'auto' });
          setArrowCoords({ left: '26px', transform: 'none', right: 'auto' });
        } else if (rect.right > window.innerWidth - 16) {
          setCoords({ left: 'auto', right: '-16px', transform: 'none' });
          setArrowCoords({ left: 'auto', right: '26px', transform: 'none' });
        }
      }
    }, [isOpen]);

    return (
      <span
        className="rpt-pnl-tooltip-wrapper"
        onClick={(e) => {
          e.stopPropagation();
          setActiveTooltip(isOpen ? null : id);
        }}
      >
        <FaInfoCircle className={`rpt-pnl-tooltip-icon ${isOpen ? 'active' : ''}`} />
        {isOpen && (
          <span ref={ref} className="rpt-pnl-tooltip-box" style={coords} onClick={(e) => e.stopPropagation()}>
            {text}
            <span className="rpt-pnl-tooltip-arrow" style={arrowCoords} />
          </span>
        )}
      </span>
    );
  };

  if (loading) {
    return <div className="rpt-pnl-loading">Aggregating Profit & Loss accounting records…</div>;
  }

  if (loadError) {
    return <div className="rpt-pnl-error">{loadError}</div>;
  }

  if (!pnl) {
    return <div className="rpt-pnl-empty">No Profit & Loss data available for this range.</div>;
  }

  const rawGrossSales = Number(pnl.grossSales || 0);
  const discounts = Number(pnl.discounts || 0);
  const outputTax = Number(pnl.totalTax || 0);
  const grossSales = rawGrossSales;
  const netSales = grossSales - discounts;
  const cogs = Number(pnl.cogsPurchases || 0);
  const expenses = Number(pnl.operatingExpenses || 0);
  const grossMargin = netSales - cogs;
  const netProfit = grossMargin - expenses;
  const creditOutstanding = Number(pnl.creditOutstanding || 0);
  const cashCollected = Number(pnl.cashCollectedAfterExpenses ?? pnl.netCashProfit ?? 0);

  const otherActivePayments = Number(reconciliation?.otherActivePaymentsTotal || 0);
  const unmatchedPaymentCount = Number(reconciliation?.unmatchedPaymentCount || 0);

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
    <div className="rpt-pnl-view" onClick={() => setActiveTooltip(null)}>
      <div className="rpt-pnl-toolbar">
        <button className="rpt-pnl-btn" onClick={() => exportCSV(
          ['Metric', 'Value'],
          exportData.map(row => row.map(csvCell).join(',')),
          'profit_loss'
        )}><FaFileCsv /> CSV</button>
        <button className="rpt-pnl-btn" onClick={() => exportExcel(
          exportData.map(row => ({ Metric: row[0], Value: row[1] })),
          'Profit & Loss', 'profit_loss'
        )}><FaFileExcel /> Excel</button>
        <button className="rpt-pnl-btn" onClick={handlePrint}><FaPrint /> Print</button>
      </div>

      <div className="rpt-pnl-note">
        Profit & Loss is calculated from accounting journals, so expenses, purchases, COGS, inventory adjustments, and reversals are included.
      </div>

      <div className="rpt-pnl-container">
        {/* Waterfall Flow */}
        <div className="rpt-pnl-main-flow">
          <div className="rpt-pnl-flow-header">
            <div className="rpt-pnl-title-row">
              <h3>Profit Flow</h3>
              <InfoTooltip id="pnlWaterfall" text="Profit Flow: Visualizes how revenue translates into Net Profit by subtracting discounts, COGS, and operating expenses sequentially." />
            </div>
            <span className="rpt-pnl-sub">Tracing Gross Sales down to Net Profit</span>
          </div>

          <div className="rpt-pnl-cascade">
            {config?.discountEnabled !== false ? (
              <>
                <div className="rpt-pnl-step add">
                  <div className="rpt-pnl-badge plus">+</div>
                  <div className="rpt-pnl-step-body">
                    <div className="rpt-pnl-step-title-row">
                      <span className="rpt-pnl-step-title">Gross Sales</span>
                      <InfoTooltip id="grossSales" text="Gross Sales (Ex-Tax): Pre-discount revenue excluding GST and Round Off." />
                    </div>
                    <div className="rpt-pnl-step-sub">Pre-discount revenue excluding GST</div>
                  </div>
                  <div className="rpt-pnl-step-val text-success">+{SYM}{fmt(grossSales)}</div>
                </div>

                <div className="rpt-pnl-connector minus"><span className="connector-icon">-</span></div>

                <div className="rpt-pnl-step subtract">
                  <div className="rpt-pnl-badge minus">-</div>
                  <div className="rpt-pnl-step-body">
                    <div className="rpt-pnl-step-title-row">
                      <span className="rpt-pnl-step-title">Discounts</span>
                      <InfoTooltip id="discounts" text="Discounts: Total price reductions granted on orders (item-level + order-level)." />
                    </div>
                    <div className="rpt-pnl-step-sub">Price reductions, loyalty discounts & promos</div>
                  </div>
                  <div className="rpt-pnl-step-val text-pink">-{SYM}{fmt(discounts)}</div>
                </div>

                <div className="rpt-pnl-connector equal"><span className="connector-icon">=</span></div>

                <div className="rpt-pnl-step result">
                  <div className="rpt-pnl-badge equal">=</div>
                  <div className="rpt-pnl-step-body">
                    <div className="rpt-pnl-step-title-row">
                      <span className="rpt-pnl-step-title">Net Sales</span>
                      <InfoTooltip id="netSales" text="Net Sales (Ex-Tax): Revenue after discounts, excluding GST and Round Off." />
                    </div>
                    <div className="rpt-pnl-step-sub">Post-discount revenue excluding GST</div>
                  </div>
                  <div className="rpt-pnl-step-val text-blue">{SYM}{fmt(netSales)}</div>
                </div>
              </>
            ) : (
              <div className="rpt-pnl-step add">
                <div className="rpt-pnl-badge plus">+</div>
                <div className="rpt-pnl-step-body">
                  <div className="rpt-pnl-step-title-row">
                    <span className="rpt-pnl-step-title">Net Sales</span>
                    <InfoTooltip id="netSales" text="Net Sales (Ex-Tax): Revenue excluding GST and Round Off." />
                  </div>
                  <div className="rpt-pnl-step-sub">Revenue excluding GST</div>
                </div>
                <div className="rpt-pnl-step-val text-success">+{SYM}{fmt(netSales)}</div>
              </div>
            )}

            <div className="rpt-pnl-connector minus"><span className="connector-icon">-</span></div>

            {/* COGS / Purchases */}
            <div className="rpt-pnl-step subtract">
              <div className="rpt-pnl-badge minus">-</div>
              <div className="rpt-pnl-step-body">
                <div className="rpt-pnl-step-title-row">
                  <span className="rpt-pnl-step-title">COGS / Purchases</span>
                  <InfoTooltip id="cogs" text="COGS / Purchases: Cost of raw ingredients, stock, and inventory consumed or purchased." />
                </div>
                <div className="rpt-pnl-step-sub">Cost of raw ingredients, stock, & inventory used</div>
              </div>
              <div className="rpt-pnl-step-val text-orange">-{SYM}{fmt(cogs)}</div>
            </div>

            <div className="rpt-pnl-connector equal"><span className="connector-icon">=</span></div>

            {/* Gross Margin */}
            <div className="rpt-pnl-step result">
              <div className="rpt-pnl-badge equal">=</div>
              <div className="rpt-pnl-step-body">
                <div className="rpt-pnl-step-title-row">
                  <span className="rpt-pnl-step-title">Gross Margin</span>
                  <InfoTooltip id="grossMargin" text="Gross Margin: Product-level profitability before operating expenses." />
                </div>
                <div className="rpt-pnl-step-sub">Product markup earnings before operational overhead</div>
              </div>
              <div className="rpt-pnl-step-val text-success">{SYM}{fmt(grossMargin)}</div>
            </div>

            <div className="rpt-pnl-connector minus"><span className="connector-icon">-</span></div>

            {/* Operating Expenses */}
            <div className="rpt-pnl-step subtract">
              <div className="rpt-pnl-badge minus">-</div>
              <div className="rpt-pnl-step-body">
                <div className="rpt-pnl-step-title-row">
                  <span className="rpt-pnl-step-title">Operating Expenses</span>
                  <InfoTooltip id="expenses" text="Operating Expenses: General business running costs (rent, salaries, utilities, etc.) excluding COGS." />
                </div>
                <div className="rpt-pnl-step-sub">General business costs (salaries, rent, utilities, etc.)</div>
              </div>
              <div className="rpt-pnl-step-val text-red">-{SYM}{fmt(expenses)}</div>
            </div>

            <div className="rpt-pnl-connector equal"><span className="connector-icon">=</span></div>

            {/* Net Profit */}
            <div className={`rpt-pnl-step final-net-profit ${netProfit >= 0 ? 'profit' : 'loss'}`}>
              <div className="rpt-pnl-badge star">★</div>
              <div className="rpt-pnl-step-body">
                <div className="rpt-pnl-step-title-row">
                  <span className="rpt-pnl-step-title">Net Profit</span>
                  <InfoTooltip id="netProfit" text="Net Profit: Final business profit for the period (ex-tax)." />
                </div>
                <div className="rpt-pnl-step-sub">Final business profit or loss for the selected period</div>
              </div>
              <div className="rpt-pnl-step-val">{SYM}{fmt(netProfit)}</div>
            </div>
          </div>
        </div>

        {/* Side Metrics */}
        <div className="rpt-pnl-side-metrics">
          <div className="rpt-pnl-side-header">
            <h3>Cash Flow & Taxes</h3>
            <span className="rpt-pnl-sub">Financial liquidity and collection indicators</span>
          </div>

          <div className="rpt-pnl-side-cards">
            {config?.taxEnabled !== false && (
              <div className="rpt-pnl-side-card tax">
                <div className="side-card-header">
                  <span>Output Tax</span>
                  <InfoTooltip id="outputTax" text="Output Tax (GST): Sales tax collected from customers, payable to the government." />
                </div>
                <div className="side-card-val text-purple">{SYM}{fmt(outputTax)}</div>
                <div className="side-card-desc">Collected sales tax to pay government</div>
              </div>
            )}

            <div className="rpt-pnl-side-card receivables">
              <div className="side-card-header">
                <span>Receivable Balance</span>
                <InfoTooltip id="creditOutstanding" text="Receivable Balance: Money owed by customers for credit/unpaid sales not yet collected." />
              </div>
              <div className="side-card-val text-warning">{SYM}{fmt(creditOutstanding)}</div>
              <div className="side-card-desc">Outstanding credit tab balance due from customers</div>
            </div>

            <div className={`rpt-pnl-side-card cash-flow ${cashCollected >= 0 ? 'positive' : 'negative'}`}>
              <div className="side-card-header">
                <span>Cash Collected After Expenses</span>
                <InfoTooltip id="cashCollected" text="Cash Collected After Expenses: Actual net cash position after paying costs." />
              </div>
              <div className="side-card-val">{SYM}{fmt(cashCollected)}</div>
              <div className="side-card-desc">Actual cash movement (excluding unpaid credit sales)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Accounting Reconciliation */}
      {reconciliation && (
        <div className="rpt-pnl-recon">
          <div className="rpt-pnl-recon-header">
            <div className="rpt-pnl-title-row">
              <h3>Sales & Payment Reconciliation</h3>
              <InfoTooltip id="recon" text="Sales & Payment Reconciliation: Verifies billed sales against actual payments collected in this period." />
            </div>
            <span className="rpt-pnl-sub">Matching invoices and payment transactions</span>
          </div>

          <div className="rpt-pnl-recon-grid">
            <div className="rpt-pnl-recon-card billed">
              <div className="rpt-pnl-recon-card-header">
                <span>Billed Sales</span>
                <InfoTooltip id="billedSales" text="Billed Sales: Total completed invoices in this period." />
              </div>
              <strong>{SYM}{fmt(reconciliation.billedSalesTotal)}</strong>
              <span className="rpt-pnl-recon-card-sub">Completed sales invoices</span>
            </div>

            <div className="rpt-pnl-recon-card linked">
              <div className="rpt-pnl-recon-card-header">
                <span>Linked Payments</span>
                <InfoTooltip id="linkedPayments" text="Linked Payments: Active payments attached directly to billed sales." />
              </div>
              <strong>{SYM}{fmt(reconciliation.linkedSalesPaymentsTotal)}</strong>
              <span className="rpt-pnl-recon-card-sub">Payments attached to sales</span>
            </div>

            <div className={`rpt-pnl-recon-card other ${otherActivePayments > 0 ? 'warn' : ''}`}>
              <div className="rpt-pnl-recon-card-header">
                <span>Other Active Payments</span>
                <InfoTooltip id="otherPayments" text="Other Active Payments: Active payments collected but not linked to completed sales." />
              </div>
              <strong>{SYM}{fmt(reconciliation.otherActivePaymentsTotal)}</strong>
              <span className="rpt-pnl-recon-card-sub">Unlinked payment entries</span>
            </div>

            <div className="rpt-pnl-recon-card collected">
              <div className="rpt-pnl-recon-card-header">
                <span>Payment Collected</span>
                <InfoTooltip id="collectedPayments" text="Payment Collected: Total payments collected (Linked Payments + Other Active Payments)." />
              </div>
              <strong>{SYM}{fmt(reconciliation.paymentCollectedTotal)}</strong>
              <span className="rpt-pnl-recon-card-sub">Total cash/card collected</span>
            </div>
          </div>

          {otherActivePayments > 0 && (
            <div className="rpt-pnl-recon-alert">
              Other active payments: {SYM}{fmt(otherActivePayments)}
              {unmatchedPaymentCount > 0 ? ` across ${unmatchedPaymentCount} payment(s)` : ''}. These explain why cash collected can differ from billed sales.
            </div>
          )}
        </div>
      )}

      <style jsx global>{`
        .rpt-pnl-view { width: 100%; display: flex; flex-direction: column; gap: 16px; }
        .rpt-pnl-toolbar { display: flex; gap: 8px; margin-bottom: 4px; align-items: center; flex-wrap: wrap; }
        .rpt-pnl-btn { padding: 8px 14px; border-radius: 10px; border: 1.5px solid #f97316; background: #fff; color: #f97316; font-size: 10px; font-weight: 800; display: flex; align-items: center; gap: 6px; cursor: pointer; transition: .2s; }
        .rpt-pnl-btn:hover { background: #fff7ed; transform: translateY(-1px); }
        .rpt-pnl-note { font-size: 11px; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 14px; margin-bottom: 6px; }
        
        .rpt-pnl-container { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 24px; }
        @media (max-width: 1024px) {
          .rpt-pnl-container { grid-template-columns: 1fr; }
        }

        .rpt-pnl-main-flow, .rpt-pnl-side-metrics { background: white; border-radius: 20px; border: 1px solid #e2e8f0; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); }
        .rpt-pnl-flow-header, .rpt-pnl-side-header { margin-bottom: 20px; border-bottom: 1.5px solid #f1f5f9; padding-bottom: 12px; }
        .rpt-pnl-flow-header h3, .rpt-pnl-side-header h3 { margin: 0; font-size: 16px; font-weight: 800; color: #0f172a; }
        .rpt-pnl-sub { font-size: 11px; color: #94a3b8; font-weight: 600; }

        .rpt-pnl-cascade { display: flex; flex-direction: column; position: relative; }
        .rpt-pnl-step { display: flex; align-items: center; gap: 16px; padding: 16px 20px; background: #f8fafc; border-radius: 16px; border: 1.5px solid #f1f5f9; transition: all 0.25s ease; position: relative; }
        .rpt-pnl-step:hover { transform: translateY(-2px); box-shadow: 0 8px 16px rgba(0,0,0,0.04); background: #ffffff; border-color: #cbd5e1; }
        .rpt-pnl-step.result { background: #f0f7ff; border-color: #bfdbfe; }
        .rpt-pnl-step.result:hover { background: #ffffff; border-color: #3b82f6; }
        .rpt-pnl-step.final-net-profit { background: #f0fdf4; border: 2px solid #bbf7d0; padding: 20px; box-shadow: 0 4px 12px rgba(16,185,129,0.06); }
        .rpt-pnl-step.final-net-profit.loss { background: #fef2f2; border-color: #fecaca; box-shadow: 0 4px 12px rgba(239,68,68,0.06); }

        .rpt-pnl-badge { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; flex-shrink: 0; }
        .rpt-pnl-badge.plus { background: #ecfdf5; color: #10b981; border: 1px solid #a7f3d0; }
        .rpt-pnl-badge.minus { background: #fdf2f8; color: #ec4899; border: 1px solid #fbcfe8; }
        .rpt-pnl-badge.equal { background: #eff6ff; color: #3b82f6; border: 1px solid #bfdbfe; }
        .rpt-pnl-badge.star { background: #fef3c7; color: #d97706; border: 1px solid #fde68a; }

        .rpt-pnl-step-body { display: flex; flex-direction: column; flex: 1; }
        .rpt-pnl-step-title-row { display: flex; align-items: center; gap: 6px; }
        .rpt-pnl-step-title { font-size: 13.5px; font-weight: 700; color: #1e293b; }
        .rpt-pnl-step-sub { font-size: 10.5px; color: #64748b; }
        .rpt-pnl-step-val { font-size: 16px; font-weight: 850; font-family: monospace; white-space: nowrap; }

        .rpt-pnl-connector { display: flex; align-items: center; justify-content: center; height: 28px; position: relative; }
        .connector-icon { width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; z-index: 1; background: #f1f5f9; color: #64748b; }

        .rpt-pnl-side-cards { display: flex; flex-direction: column; gap: 14px; }
        .rpt-pnl-side-card { background: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; padding: 16px; display: flex; flex-direction: column; gap: 6px; transition: all 0.25s ease; }
        .rpt-pnl-side-card:hover { transform: translateY(-2px); box-shadow: 0 8px 16px rgba(0,0,0,0.03); background: #ffffff; border-color: #cbd5e1; }
        .side-card-header { display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
        .side-card-val { font-size: 20px; color: #0f172a; font-weight: 850; }
        .side-card-desc { font-size: 10px; color: #94a3b8; font-weight: 500; }
        .rpt-pnl-side-card.tax { border-left: 4px solid #8b5cf6; }
        .rpt-pnl-side-card.receivables { border-left: 4px solid #f59e0b; }
        .rpt-pnl-side-card.cash-flow.positive { border-left: 4px solid #10b981; }
        .rpt-pnl-side-card.cash-flow.negative { border-left: 4px solid #ef4444; }

        .rpt-pnl-recon { margin-top: 10px; background: white; border-radius: 20px; border: 1px solid #e2e8f0; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); }
        .rpt-pnl-recon-header { margin-bottom: 20px; border-bottom: 1.5px solid #f1f5f9; padding-bottom: 12px; }
        .rpt-pnl-recon-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
        .rpt-pnl-recon-card { background: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; padding: 16px; display: flex; flex-direction: column; gap: 6px; }
        .rpt-pnl-recon-card-header { display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; }
        .rpt-pnl-recon-card strong { font-size: 20px; color: #0f172a; font-weight: 850; }
        .rpt-pnl-recon-card-sub { font-size: 10px; color: #94a3b8; font-weight: 600; }
        .rpt-pnl-recon-card.billed { background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border: 1.5px solid #bae6fd; }
        .rpt-pnl-recon-card.linked { background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 1.5px solid #bbf7d0; }
        .rpt-pnl-recon-card.other { background: linear-gradient(135deg, #f8fafc, #f1f5f9); border: 1.5px solid #e2e8f0; }
        .rpt-pnl-recon-card.other.warn { background: linear-gradient(135deg, #fff7ed, #ffedd5); border: 1.5px solid #fed7aa; }
        .rpt-pnl-recon-card.collected { background: linear-gradient(135deg, #f5f3ff, #ede9fe); border: 1.5px solid #ddd6fe; }
        .rpt-pnl-recon-alert { margin-top: 16px; border: 1px solid #fed7aa; background: #fff7ed; color: #9a3412; border-radius: 12px; padding: 12px; font-size: 11.5px; font-weight: 700; }

        .rpt-pnl-tooltip-wrapper { position: relative; display: inline-flex; align-items: center; justify-content: center; margin-left: 6px; }
        .rpt-pnl-tooltip-icon { color: #94a3b8; font-size: 13.5px; cursor: pointer; transition: all 0.2s ease; }
        .rpt-pnl-tooltip-icon:hover, .rpt-pnl-tooltip-icon.active { color: #f97316; transform: scale(1.15); }
        .rpt-pnl-tooltip-box { position: absolute; bottom: 135%; left: 50%; transform: translateX(-50%); width: 220px; background: #ea580c; color: #ffffff; padding: 10px 14px; border-radius: 10px; font-size: 11.5px; font-weight: 600; line-height: 1.45; box-shadow: 0 10px 20px rgba(234, 88, 12, 0.3); z-index: 1000; text-align: left; }
        .rpt-pnl-tooltip-arrow { position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid #ea580c; }
        
        .rpt-pnl-loading, .rpt-pnl-empty { text-align: center; padding: 60px 20px; color: #94a3b8; font-weight: 700; font-size: 14px; }
        .rpt-pnl-error { margin-bottom: 16px; padding: 12px 14px; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; border-radius: 12px; font-size: 12px; font-weight: 800; }

        .text-pink { color: #ec4899; }
        .text-blue { color: #0ea5e9; }
        .text-orange { color: #f97316; }
        .text-red { color: #ef4444; }
        .text-purple { color: #6366f1; }
        .text-warning { color: #d97706; }
        .text-success { color: #10b981; }
      `}</style>
    </div>
  );
}
