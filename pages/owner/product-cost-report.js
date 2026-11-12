import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import ModuleGate from '../../components/ModuleGate';
import ReportTable from '../../components/ReportTable';
import NiceSelect from '../../components/NiceSelect';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useCurrencyConfig } from '../../hooks/useCurrencyConfig';
import { formatTzDate, getBusinessNow, businessTimeToUtc } from '../../utils/timezoneUtils';
import { formatQty } from '../../components/CounterSale/domain/quantity';
import { FaCalculator, FaFileCsv, FaInfoCircle, FaTimes, FaArrowDown, FaArrowUp, FaBalanceScale, FaFlagCheckered, FaPlayCircle, FaTag, FaSortAmountDown, FaSortAmountUp, FaCaretUp, FaCaretDown } from 'react-icons/fa';

/**
 * Product Cost Report (cost detail): every costed stock movement of one product in a period,
 * showing how each receipt, sale, transfer or adjustment moved the product's current cost.
 */
export default function ProductCostReportPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']} requiredMenu="Stock">
      <ModuleGate>
        <ProductCostReportContent />
      </ModuleGate>
    </RoleGate>
  );
}

const TYPE_LABELS = {
  PURCHASE: 'Purchase',
  PURCHASE_RECEIPT: 'Purchase Receipt',
  PURCHASE_VOID: 'Purchase Void',
  SALE: 'Sale',
  SALES: 'Sale',
  SALE_DEDUCTION: 'Sale',
  SALE_VOID_RESTORE: 'Sale Void / Return',
  TRANSFER_IN: 'Transfer In',
  TRANSFER_OUT: 'Transfer Out',
  TRANSFER_VOID_REVERT: 'Transfer Void',
  ADJUSTMENT: 'Adjustment',
  ADJUSTMENT_VOID: 'Adjustment Void',
};

const METHOD_LABELS = { AVERAGE_PO: 'Weighted Average', LAST_PO: 'Last Purchase', STANDARD: 'Standard' };

// How each costing method arrives at the product cost (shown from the info button).
const METHOD_HELP = {
  AVERAGE_PO: {
    summary: 'The cost is the average of what the stock on hand was bought for. It is recalculated every time stock comes in.',
    formula: 'New cost = (Qty on hand × Current cost + Qty received × Purchase cost) ÷ (Qty on hand + Qty received)',
    example: 'Example: 10 on hand at 100, then 10 received at 120 → (10×100 + 10×120) ÷ 20 = 110.',
  },
  LAST_PO: {
    summary: 'The cost is the net price of the most recent purchase receipt.',
    formula: 'New cost = Purchase cost of the latest receipt',
    example: 'Example: cost 100, then a receipt at 120 → cost becomes 120.',
  },
  STANDARD: {
    summary: 'The cost is the Cost Price you keep on the product. Purchases do not change it.',
    formula: 'Cost = Product Cost Price',
    example: 'Example: Cost Price 90, receipt at 120 → cost stays 90 until you edit the Cost Price.',
  },
};

const COST_RULES = [
  'Purchase cost is the line price after its discount, without tax.',
  'Sales, transfers out and stock-out adjustments leave at the current cost and do not change it.',
  'For recipe items, a sale is costed from the ingredients actually consumed.',
  'Voiding a purchase, sale, transfer or adjustment reverses it at the cost of the original movement.',
  'If stock on hand is zero or negative, the next receipt sets the cost to its own purchase cost.',
  'A product never purchased starts from its Cost Price; if that is empty, from its last purchase receipt.',
  'Cost is kept per branch (and per variant), across all warehouses of the branch.',
];

const VIEW_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'IN', label: 'Stock in' },
  { key: 'OUT', label: 'Stock out' },
  { key: 'CHANGED', label: 'Changed the cost' },
];

const PAGE_SIZE = 25;

const costChanged = (r) => r.costed && Number(r.costBefore) !== Number(r.costAfter);

const typeLabel = (t) => TYPE_LABELS[t] || (t || '—').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

function ProductCostReportContent() {
  const router = useRouter();
  const { orgId, timezone } = useAuth();
  const { symbol: sym, decimals, code: currencyCode } = useCurrencyConfig();
  // Lakh-style digit grouping only for the Indian rupee; every other currency groups in thousands.
  const numberLocale = currencyCode === 'INR' ? 'en-IN' : 'en-US';
  const activeOrgId = orgId || (typeof window !== 'undefined' ? (Cookies.get('orgId') || '') : '');

  const dayStr = (endOfDay, daysBack = 0) => {
    const d = getBusinessNow(timezone);
    d.setDate(d.getDate() - daysBack);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${endOfDay ? '23:59' : '00:00'}`;
  };

  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [dateFrom, setDateFrom] = useState(dayStr(false, 30));
  const [dateTo, setDateTo] = useState(dayStr(true));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [view, setView] = useState('ALL');
  const [newestFirst, setNewestFirst] = useState(true);
  const [page, setPage] = useState(0);

  // Pre-select a product passed as ?productId=
  useEffect(() => {
    if (router.isReady && router.query.productId) setProductId(String(router.query.productId));
  }, [router.isReady, router.query.productId]);

  useEffect(() => {
    const params = activeOrgId ? { orgId: activeOrgId } : {};
    Promise.all([
      api.get('/api/v1/products', { params }).catch(() => ({ data: { data: [] } })),
      api.get('/api/v1/warehouses', { params }).catch(() => ({ data: { data: [] } })),
    ]).then(([pResp, wResp]) => {
      setProducts(pResp.data?.data || []);
      const whs = (wResp.data?.data || []).filter(w => {
        const wOrg = String(w.organizationId || w.orgId || w.org_id || w.organization?.id || '');
        return !activeOrgId || !wOrg || wOrg === String(activeOrgId);
      });
      setWarehouses(whs);
    });
  }, [activeOrgId]);

  // Branch date-time from the pickers → UTC ISO instant (ledger dates are stored in UTC).
  // The end of the range runs to the last second of the picked minute.
  const toIso = (local, isEnd = false) => (local
    ? businessTimeToUtc(isEnd && local.length === 16 ? `${local}:59` : local, timezone)
    : undefined);

  useEffect(() => {
    if (!productId) { setReport(null); return; }
    let cancelled = false;
    setLoading(true);
    setError('');
    const params = { from: toIso(dateFrom), to: toIso(dateTo, true) };
    if (warehouseId) params.warehouseId = warehouseId;
    if (activeOrgId) params.orgId = activeOrgId;
    api.get(`/api/v1/costing/products/${productId}/cost-detail`, { params })
      .then(res => { if (!cancelled) setReport(res.data?.data || null); })
      .catch(err => {
        if (cancelled) return;
        setReport(null);
        setError(err.response?.data?.message || 'Failed to load the product cost report');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId, warehouseId, dateFrom, dateTo, activeOrgId, timezone]);

  const productOptions = useMemo(() => [
    { value: '', label: 'Select a product…' },
    ...products
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map(p => ({ value: p.id, label: p.sku ? `${p.name} (${p.sku})` : p.name })),
  ], [products]);

  const warehouseOptions = useMemo(() => [
    { value: '', label: 'All Warehouses' },
    ...warehouses.map(w => ({ value: w.id, label: w.name })),
  ], [warehouses]);

  const whName = (id) => warehouses.find(w => String(w.id) === String(id))?.name || '—';
  const money = (v, dp = decimals) => (v === null || v === undefined)
    ? '—'
    : `${sym}${Number(v).toLocaleString(numberLocale, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
  const qty = (v) => formatQty(Number(v || 0), 3);

  const rows = useMemo(() => (report?.lines || []).map(l => ({ ...l, id: l.ledgerId })), [report]);
  const hasVariants = rows.some(r => r.variantId);
  const selectedProduct = products.find(p => String(p.id) === String(productId));

  const viewCounts = useMemo(() => ({
    ALL: rows.length,
    IN: rows.filter(r => Number(r.quantityChange) > 0).length,
    OUT: rows.filter(r => Number(r.quantityChange) < 0).length,
    CHANGED: rows.filter(costChanged).length,
  }), [rows]);

  const visibleRows = useMemo(() => {
    const list = rows.filter(r => {
      if (view === 'IN') return Number(r.quantityChange) > 0;
      if (view === 'OUT') return Number(r.quantityChange) < 0;
      if (view === 'CHANGED') return costChanged(r);
      return true;
    });
    return newestFirst ? list.slice().reverse() : list;
  }, [rows, view, newestFirst]);

  // Back to the first page whenever the list being paged changes.
  useEffect(() => { setPage(0); }, [report, view, newestFirst]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = useMemo(
    () => visibleRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [visibleRows, currentPage]);

  const visibleTotals = useMemo(() => visibleRows.reduce((t, r) => ({
    qty: t.qty + Number(r.quantityChange || 0),
    value: t.value + Number(r.totalCost || 0),
  }), { qty: 0, value: 0 }), [visibleRows]);

  const columns = [
    {
      key: 'date', label: 'Date',
      render: (r) => (
        <div className="cell-stack">
          <span className="primary">{formatTzDate(r.transactionDate, timezone, { format: 'date' })}</span>
          <span className="secondary">{formatTzDate(r.transactionDate, timezone, { format: 'time' })}</span>
        </div>
      ),
    },
    {
      key: 'type', label: 'Type',
      render: (r) => (
        <span className={`type-badge ${Number(r.quantityChange) >= 0 ? 'in' : 'out'}`}>{typeLabel(r.transactionType)}</span>
      ),
    },
    {
      key: 'doc', label: 'Document No',
      render: (r) => (r.documentNo ? <span className="doc">{r.documentNo}</span> : <span className="secondary">—</span>),
    },
    { key: 'wh', label: 'Warehouse', render: (r) => <span className="wh">{whName(r.warehouseId)}</span> },
    ...(hasVariants ? [{ key: 'variant', label: 'Variant', render: (r) => <span className="variant-pill">{r.variantName || (r.variantId ? 'Variant' : 'Base')}</span> }] : []),
    {
      key: 'qty', label: 'Quantity', align: 'right',
      render: (r) => {
        const q = Number(r.quantityChange || 0);
        return (
          <div className="cell-stack end">
            <span className={`qty ${q > 0 ? 'pos' : q < 0 ? 'neg' : ''}`}>{q > 0 ? '+' : ''}{qty(q)}</span>
            <span className="secondary">stock after {qty(r.balanceAfter)}</span>
          </div>
        );
      },
    },
    { key: 'unit', label: 'Unit Cost', align: 'right', render: (r) => <span className="num">{money(r.unitCost)}</span> },
    { key: 'total', label: 'Value', align: 'right', render: (r) => <span className="num strong">{money(r.totalCost)}</span> },
    {
      key: 'cost', label: 'Product Cost After', align: 'right',
      render: (r) => {
        if (!r.costed) return <span className="pill-muted" title="Recorded before inventory costing was enabled, so it has no cost">Not costed</span>;
        if (!costChanged(r)) {
          return (
            <div className="cell-stack end">
              <span className="num strong">{money(r.costAfter)}</span>
              <span className="secondary">no change</span>
            </div>
          );
        }
        const diff = Number(r.costAfter) - Number(r.costBefore);
        return (
          <div className="cell-stack end">
            <span className="cost-new">{money(r.costAfter)}</span>
            <span className={`cost-delta ${diff > 0 ? 'up' : 'down'}`}>
              {diff > 0 ? <FaCaretUp /> : <FaCaretDown />} {money(Math.abs(diff))} from {money(r.costBefore)}
            </span>
          </div>
        );
      },
    },
  ];

  const exportCsv = () => {
    if (!rows.length) return;
    const head = ['Date', 'Transaction', 'Document #', 'Warehouse', ...(hasVariants ? ['Variant'] : []),
      'Qty', 'Stock After', 'Unit Cost', 'Line Value', 'Cost Before', 'Cost After'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map(r => [
      `${formatTzDate(r.transactionDate, timezone, { format: 'date' })} ${formatTzDate(r.transactionDate, timezone, { format: 'time' })}`,
      typeLabel(r.transactionType), r.documentNo || '', whName(r.warehouseId),
      ...(hasVariants ? [r.variantName || (r.variantId ? 'Variant' : 'Base')] : []),
      r.quantityChange, r.balanceAfter, r.unitCost, r.totalCost, r.costBefore ?? '', r.costAfter ?? '',
    ].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product-cost_${(selectedProduct?.name || 'product').replace(/[^a-z0-9]+/gi, '-')}_${dateFrom.slice(0, 10)}_${dateTo.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout title="Product Cost Report" showBack={true}>
      <div className="report-container">
        <div className="filters-bar">
          <div className="product-filter">
            <NiceSelect options={productOptions} value={productId} onChange={setProductId} placeholder="Select a product…" />
          </div>
          <div className="hist-dates">
            <PremiumDateTimePicker value={dateFrom} onChange={setDateFrom} themeColor="#f97316" />
            <span className="h-filter-sep">to</span>
            <PremiumDateTimePicker value={dateTo} onChange={setDateTo} themeColor="#f97316" />
          </div>
          <div className="wh-filter-group">
            <NiceSelect options={warehouseOptions} value={warehouseId} onChange={setWarehouseId} />
          </div>
          <button className="export-btn" onClick={exportCsv} disabled={!rows.length} title="Export to CSV">
            <FaFileCsv /> Export
          </button>
        </div>

        {!productId && (
          <div className="hint"><FaInfoCircle /> Select a product to see how its cost was calculated from each purchase, sale, transfer and adjustment.</div>
        )}

        {error && <div className="error-box">{error}</div>}

        {productId && report && (
          <div className="summary-grid">
            <div className="s-card">
              <span className="s-label">
                <FaBalanceScale /> Costing Method
                <button
                  type="button"
                  className={`info-btn ${showHelp ? 'on' : ''}`}
                  onClick={() => setShowHelp(v => !v)}
                  title="How is the cost calculated?"
                  aria-label="How is the cost calculated?"
                  aria-expanded={showHelp}
                >
                  <FaInfoCircle />
                </button>
              </span>
              <span className="s-value text">{METHOD_LABELS[report.costingMethod] || report.costingMethod || 'Weighted Average'}</span>
            </div>
            <div className="s-card">
              <span className="s-label"><FaPlayCircle /> Opening Cost</span>
              <span className="s-value">{money(report.openingCost)}</span>
              <span className="s-sub">before first movement</span>
            </div>
            <div className="s-card in">
              <span className="s-label"><FaArrowDown /> Stock In</span>
              <span className="s-value pos">+{qty(report.qtyIn)}</span>
              <span className="s-sub">{money(report.valueIn)} value</span>
            </div>
            <div className="s-card out">
              <span className="s-label"><FaArrowUp /> Stock Out</span>
              <span className="s-value neg">−{qty(report.qtyOut)}</span>
              <span className="s-sub">{money(report.valueOut)} value</span>
            </div>
            <div className="s-card">
              <span className="s-label"><FaFlagCheckered /> Closing Cost</span>
              <span className="s-value">{money(report.closingCost)}</span>
              <span className="s-sub">after last movement</span>
            </div>
            <div className="s-card accent">
              <span className="s-label"><FaTag /> Current Cost</span>
              <span className="s-value">{money(report.currentCost)}</span>
              <span className="s-sub">per unit, today</span>
            </div>
          </div>
        )}

        {productId && report && showHelp && (() => {
          const help = METHOD_HELP[report.costingMethod] || METHOD_HELP.AVERAGE_PO;
          const lastChange = [...rows].reverse().find(r => r.costed && Number(r.costBefore) !== Number(r.costAfter));
          return (
            <div className="help-panel" role="region" aria-label="How the cost is calculated">
              <div className="help-head">
                <span><FaInfoCircle /> How the cost is calculated — {METHOD_LABELS[report.costingMethod] || 'Weighted Average'}</span>
                <button type="button" className="help-close" onClick={() => setShowHelp(false)} aria-label="Close"><FaTimes /></button>
              </div>
              <p className="help-summary">{help.summary}</p>
              <div className="help-formula">{help.formula}</div>
              <p className="help-example">{help.example}</p>
              {lastChange && (
                <p className="help-last">
                  Last change in this period: <strong>{typeLabel(lastChange.transactionType)}</strong>
                  {lastChange.documentNo ? ` ${lastChange.documentNo}` : ''} of {qty(lastChange.quantityChange)} at {money(lastChange.unitCost)} moved
                  the cost from {money(lastChange.costBefore)} to <strong>{money(lastChange.costAfter)}</strong>.
                </p>
              )}
              <ul className="help-rules">
                {COST_RULES.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
              <p className="help-foot">The costing method is set per branch in Configurations.</p>
            </div>
          );
        })()}

        {productId && report && !loading && report.currentCost != null && !rows.some(r => r.costed) && (
          <div className="hint" style={{ marginBottom: 20 }}>
            <FaInfoCircle /> No purchase or other costed movement in this period. The current cost of {money(report.currentCost)} is the
            opening cost taken from the product&apos;s Cost Price when inventory costing was enabled, or was set by a movement outside this period.
          </div>
        )}

        {productId && (
          loading ? (
            <div className="loading">Calculating cost detail…</div>
          ) : (
            <>
              <div className="table-toolbar">
                <div className="chips" role="tablist" aria-label="Filter movements">
                  {VIEW_FILTERS.map(f => (
                    <button
                      key={f.key}
                      type="button"
                      role="tab"
                      aria-selected={view === f.key}
                      className={`chip ${view === f.key ? 'on' : ''}`}
                      onClick={() => setView(f.key)}
                    >
                      {f.label} <span className="chip-count">{viewCounts[f.key]}</span>
                    </button>
                  ))}
                </div>
                <button type="button" className="sort-btn" onClick={() => setNewestFirst(v => !v)} title="Change the order of the movements">
                  {newestFirst ? <FaSortAmountDown /> : <FaSortAmountUp />} {newestFirst ? 'Newest first' : 'Oldest first'}
                </button>
              </div>
              <div className="pcr-table">
              <ReportTable
                columns={columns}
                data={pageRows}
                emptyIcon={<FaCalculator />}
                emptyTitle={rows.length ? 'Nothing matches this filter' : 'No cost movements'}
                emptyText={rows.length
                  ? 'Choose another filter above to see the other movements.'
                  : 'No stock movements for this product in the selected period and warehouse.'}
                accentColor="#f97316"
                footer={(
                  <tr className="total-row">
                    <td colSpan={hasVariants ? 5 : 4}>Total of all {visibleRows.length} movement{visibleRows.length === 1 ? '' : 's'}{view === 'ALL' ? '' : ' in this filter'}</td>
                    <td className="t-right">
                      <span className={`qty ${visibleTotals.qty > 0 ? 'pos' : visibleTotals.qty < 0 ? 'neg' : ''}`}>
                        {visibleTotals.qty > 0 ? '+' : ''}{qty(visibleTotals.qty)}
                      </span>
                    </td>
                    <td />
                    <td className="t-right"><span className="num strong">{money(visibleTotals.value)}</span></td>
                    <td />
                  </tr>
                )}
              />
              </div>
              {visibleRows.length > PAGE_SIZE && (
                <div className="pagination-bar">
                  <button type="button" className="pg-btn" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>← Prev</button>
                  <span className="pg-info">
                    Page {currentPage + 1} of {totalPages} &nbsp;·&nbsp; {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, visibleRows.length)} of {visibleRows.length}
                  </span>
                  <button type="button" className="pg-btn" disabled={currentPage >= totalPages - 1} onClick={() => setPage(currentPage + 1)}>Next →</button>
                </div>
              )}
            </>
          )
        )}

        {productId && report && (
          <div className="report-footer">
            <span>{rows.length} movement{rows.length === 1 ? '' : 's'} in this period · Opening/closing cost is the branch-wide cost{hasVariants ? ' of the base product' : ''}; warehouse filter limits the rows only.</span>
          </div>
        )}
      </div>

      <style jsx>{`
        .report-container { padding: 0 40px 40px; }
        @media (max-width: 768px) { .report-container { padding: 0 16px 24px; } }

        .filters-bar { background: white; border-radius: 16px; padding: 14px 20px; border: 1px solid #edf2f7; border-top: 3px solid #f97316; display: flex; align-items: center; gap: 12px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); flex-wrap: wrap; }
        .product-filter { flex: 1 1 280px; min-width: 240px; }
        .hist-dates { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .h-filter-sep { font-size: 12px; font-weight: 700; color: #94a3b8; }
        .wh-filter-group { flex-shrink: 0; min-width: 170px; }
        .export-btn { display: inline-flex; align-items: center; gap: 6px; background: #fff7ed; color: #ea580c; border: 1px solid #fed7aa; border-radius: 10px; padding: 8px 14px; font-size: 12px; font-weight: 800; cursor: pointer; }
        .export-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .hint { display: flex; align-items: center; gap: 10px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 18px 20px; color: #475569; font-size: 13px; font-weight: 600; }
        .error-box { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; border-radius: 12px; padding: 12px 16px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
        .loading { padding: 40px; text-align: center; font-weight: 800; color: #64748b; }

        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .s-card { background: white; border: 1px solid #edf2f7; border-left: 3px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; min-width: 0; box-shadow: 0 2px 10px rgba(0,0,0,0.02); }
        .s-card.in { border-left-color: #10b981; }
        .s-card.out { border-left-color: #ef4444; }
        .s-card.accent { border-color: #fed7aa; border-left-color: #f97316; background: #fffbf5; }
        .s-label { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
        .s-value { font-size: 20px; font-weight: 800; color: #0f172a; font-variant-numeric: tabular-nums; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .s-value.text { font-size: 16px; }
        .s-value.pos { color: #059669; }
        .s-value.neg { color: #dc2626; }
        .s-card.accent .s-value { color: #c2410c; }
        .s-sub { font-size: 12px; font-weight: 600; color: #94a3b8; }

        .info-btn { margin-left: auto; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; border: 1px solid #fed7aa; background: #fff7ed; color: #ea580c; font-size: 13px; cursor: pointer; transition: 0.15s; }
        .info-btn:hover, .info-btn.on { background: #f97316; border-color: #f97316; color: white; }
        .info-btn:focus-visible { outline: 2px solid #f97316; outline-offset: 2px; }

        .help-panel { background: white; border: 1px solid #fed7aa; border-radius: 14px; padding: 16px 20px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(249,115,22,0.06); }
        .help-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
        .help-head span { display: inline-flex; align-items: center; gap: 8px; }
        .help-head :global(svg) { color: #f97316; }
        .help-close { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 14px; padding: 4px; }
        .help-summary { font-size: 13px; color: #334155; margin: 0 0 10px; }
        .help-formula { background: #fff7ed; border: 1px dashed #fdba74; border-radius: 10px; padding: 10px 14px; font-family: 'SF Mono', 'Menlo', monospace; font-size: 12.5px; font-weight: 700; color: #9a3412; margin-bottom: 8px; }
        .help-example { font-size: 12.5px; color: #64748b; margin: 0 0 10px; }
        .help-last { font-size: 13px; color: #334155; background: #f8fafc; border-radius: 10px; padding: 10px 14px; margin: 0 0 10px; }
        .help-rules { margin: 0; padding-left: 18px; display: grid; gap: 4px; font-size: 12.5px; color: #475569; }
        .help-foot { font-size: 12px; color: #94a3b8; margin: 10px 0 0; }

        .table-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
        .chips { display: flex; gap: 8px; flex-wrap: wrap; }
        .chip { display: inline-flex; align-items: center; gap: 8px; background: white; border: 1px solid #e2e8f0; border-radius: 999px; padding: 7px 14px; font-size: 12.5px; font-weight: 700; color: #475569; cursor: pointer; transition: 0.15s; }
        .chip:hover { border-color: #fdba74; color: #ea580c; }
        .chip.on { background: #f97316; border-color: #f97316; color: white; }
        .chip:focus-visible, .sort-btn:focus-visible { outline: 2px solid #f97316; outline-offset: 2px; }
        .chip-count { font-size: 11px; font-weight: 800; background: #f1f5f9; color: #64748b; border-radius: 999px; padding: 1px 7px; }
        .chip.on .chip-count { background: rgba(255,255,255,0.25); color: white; }
        .sort-btn { display: inline-flex; align-items: center; gap: 6px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 7px 12px; font-size: 12.5px; font-weight: 700; color: #475569; cursor: pointer; }
        .sort-btn:hover { border-color: #fdba74; color: #ea580c; }

        .pagination-bar { display: flex; align-items: center; justify-content: center; gap: 16px; padding: 16px 0 4px; }
        .pg-btn { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 20px; font-size: 13px; font-weight: 700; color: #f97316; cursor: pointer; transition: all 0.2s; }
        .pg-btn:hover:not(:disabled) { background: #fff7ed; border-color: #f97316; }
        .pg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .pg-info { font-size: 13px; font-weight: 700; color: #64748b; }

        .report-footer { padding: 16px 0; text-align: center; }
        .report-footer span { font-size: 12px; font-weight: 700; color: #94a3b8; }
      `}</style>
      <style jsx global>{`
        .pcr-table .cell-stack { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .pcr-table .cell-stack.end { align-items: flex-end; }
        .pcr-table .primary { font-size: 13.5px; font-weight: 700; color: #0f172a; white-space: nowrap; }
        .pcr-table .secondary { font-size: 12px; font-weight: 500; color: #94a3b8; white-space: nowrap; }
        .pcr-table .type-badge { align-self: flex-start; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; border-radius: 6px; padding: 3px 8px; white-space: nowrap; }
        .pcr-table .type-badge.in { background: #ecfdf5; color: #059669; }
        .pcr-table .type-badge.out { background: #fef2f2; color: #dc2626; }
        .pcr-table .doc { font-size: 13px; font-weight: 700; color: #ea580c; white-space: nowrap; }
        .pcr-table .wh { font-size: 13px; font-weight: 600; color: #475569; white-space: nowrap; }
        .pcr-table .variant-pill { font-size: 12px; font-weight: 700; color: #475569; background: #f1f5f9; border-radius: 8px; padding: 4px 10px; white-space: nowrap; }
        .pcr-table .qty { font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .pcr-table .qty.pos { color: #059669; }
        .pcr-table .qty.neg { color: #dc2626; }
        .pcr-table .num { font-size: 13.5px; font-weight: 600; color: #475569; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .pcr-table .num.strong { font-weight: 800; color: #0f172a; }
        .pcr-table .cost-new { font-size: 14px; font-weight: 800; color: #c2410c; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 2px 8px; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .pcr-table .cost-delta { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; font-weight: 700; white-space: nowrap; }
        .pcr-table .cost-delta.up { color: #dc2626; }
        .pcr-table .cost-delta.down { color: #059669; }
        .pcr-table .pill-muted { font-size: 12px; font-weight: 700; color: #94a3b8; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 4px 10px; white-space: nowrap; }
        .pcr-table .total-row td { padding: 14px 20px; background: #fffbf5; border-top: 2px solid #fed7aa; font-size: 12.5px; font-weight: 800; color: #475569; }
        .pcr-table .t-right { text-align: right; }
      `}</style>
    </DashboardLayout>
  );
}
