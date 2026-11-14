import React, { useEffect, useState, useCallback, useMemo, useRef, memo } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import api from '../utils/api';
import { useCurrencySymbol } from '../hooks/useCurrencySymbol';
import PremiumDateTimePicker from '../components/PremiumDateTimePicker';
import NiceSelect from '../components/NiceSelect';
import { formatQty } from '../components/CounterSale/domain/quantity';
import { formatTzDate, getBusinessNow, businessTimeToUtc, resolveTimezone } from '../utils/timezoneUtils';
import {
  FaChartPie, FaChartBar, FaThList,
  FaExclamationTriangle, FaTimes, FaReceipt,
  FaMoneyBillWave, FaShoppingBag,
  FaUtensils, FaMotorcycle, FaCreditCard,
  FaQrcode, FaClock, FaWarehouse, FaHandshake,
  FaSyncAlt, FaSearch, FaChevronLeft, FaChevronRight, FaBan
} from 'react-icons/fa';

/* The popup is heavy and only needed on row click — keep it out of the initial bundle. */
const DocumentViewerPopup = dynamic(() => import('../components/purchasing/DocumentViewerPopup'), { ssr: false });

/*
 * Business Overview
 * ─────────────────
 * All analytics are aggregated server-side (GET /api/v1/orders/overview/summary) so the
 * payload is a few KB regardless of order volume. The table is server-paginated
 * (GET /api/v1/orders/overview/orders). Responses are cached in memory per filter set
 * (stale-while-revalidate), in-flight requests are aborted when filters change, and date
 * edits are debounced — so the screen is instant for small shops and stays fast for
 * enterprise branches with hundreds of thousands of orders.
 */

/* ── helpers ── */
const fmt  = n => Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtN = n => Number(n||0).toLocaleString('en-IN');
// Quantity shown with the product UOM precision; thousands separator kept on the whole part.
const fmtQty = (n, p) => { const [whole, dec] = formatQty(n, p).split('.'); return Number(whole).toLocaleString('en-IN') + (dec ? '.' + dec : ''); };
const fmtC = (n, sym = "") => `${sym}${fmt(n)}`;
const num = v => Number(v || 0);

const STATUS_META = {
  ORDERED:     { label: 'Ordered',   color: '#3b82f6', bg: '#eff6ff' },
  BILLED:      { label: 'Billed',    color: '#f97316', bg: '#fff7ed' },
  COMPLETED:   { label: 'Completed', color: '#10b981', bg: '#ecfdf5' },
  CANCELLED:   { label: 'Cancelled', color: '#ef4444', bg: '#fef2f2' },
  OTHER:       { label: 'Other',     color: '#94a3b8', bg: '#f1f5f9' },
};
function sMeta(status) {
  const k = String(status||'').toUpperCase();
  return STATUS_META[k] || STATUS_META.OTHER;
}

const PAYMENT_LABELS = {
  CASH: 'Cash', CARD: 'Card', UPI: 'UPI / QR', CREDIT: 'Credit Account',
  UNPAID: 'Unpaid / Pending', ONLINE: 'Online Payment', MIXED: 'Mixed Payment', OTHER: 'Other'
};
const FULFILLMENT_LABELS = { DINE_IN: 'Dine-In', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };

const DOC_STATUS_CFG = {
  DRAFT:     { label: 'Draft',     color: '#64748b', bg: '#f1f5f9', dot: '#94a3b8', border: '#cbd5e1' },
  BILLED:    { label: 'Billed',    color: '#b45309', bg: '#fffbeb', dot: '#f59e0b', border: '#fde68a' },
  COMPLETED: { label: 'Completed', color: '#059669', bg: '#ecfdf5', dot: '#10b981', border: '#6ee7b7' },
  PAID:      { label: 'Paid',      color: '#059669', bg: '#ecfdf5', dot: '#10b981', border: '#6ee7b7' },
  CANCELLED: { label: 'Cancelled', color: '#dc2626', bg: '#fef2f2', dot: '#ef4444', border: '#fca5a5' },
};

/* ── wall-clock date helpers (branch timezone) ── */
const pad2 = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const dayRange = (from, to) => [`${ymd(from)}T00:00`, `${ymd(to)}T23:59`];
const shiftDays = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };

const PRESETS = [
  { key: 'today',     label: 'Today',     range: now => dayRange(now, now) },
  { key: 'yesterday', label: 'Yesterday', range: now => { const y = shiftDays(now, -1); return dayRange(y, y); } },
  { key: '7d',        label: '7 Days',    range: now => dayRange(shiftDays(now, -6), now) },
  { key: '30d',       label: '30 Days',   range: now => dayRange(shiftDays(now, -29), now) },
  { key: 'month',     label: 'This Month',range: now => dayRange(new Date(now.getFullYear(), now.getMonth(), 1), now) },
];

/* ── small hooks ── */
function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/* In-memory response cache (LRU-ish, per filter set). Survives view/tab switches and
   re-navigation within the SPA, so returning to a range you already viewed is instant. */
const RESPONSE_CACHE = new Map();
const CACHE_LIMIT = 40;
const FRESH_MS = 15000;
const cacheGet = key => {
  const hit = RESPONSE_CACHE.get(key);
  if (hit) { RESPONSE_CACHE.delete(key); RESPONSE_CACHE.set(key, hit); }
  return hit;
};
const cacheSet = (key, data) => {
  RESPONSE_CACHE.set(key, { data, at: Date.now() });
  while (RESPONSE_CACHE.size > CACHE_LIMIT) RESPONSE_CACHE.delete(RESPONSE_CACHE.keys().next().value);
};
const cacheClear = () => RESPONSE_CACHE.clear();

/**
 * GET with stale-while-revalidate + abort-on-change.
 * Returns the data for the *last completed* request together with the params that
 * produced it, so the UI can keep showing it (dimmed) while the next request is in flight.
 */
function useCachedGet(url, params, refreshKey) {
  const key = params ? url + '?' + JSON.stringify(params) : null;
  const [state, setState] = useState(() => {
    const hit = key && RESPONSE_CACHE.get(key);
    return { data: hit?.data ?? null, params: hit ? params : null, at: hit?.at ?? null, loading: !!key && !hit, error: '' };
  });
  const lastRefresh = useRef(refreshKey);

  useEffect(() => {
    if (!key) { setState(s => (s.loading ? { ...s, loading: false } : s)); return undefined; }
    const forced = lastRefresh.current !== refreshKey;
    lastRefresh.current = refreshKey;

    const hit = cacheGet(key);
    if (hit) setState({ data: hit.data, params, at: hit.at, loading: false, error: '' });
    if (hit && !forced && Date.now() - hit.at < FRESH_MS) return undefined;

    const ctrl = new AbortController();
    setState(s => ({ ...s, loading: true, error: '' }));
    api.get(url, { params, signal: ctrl.signal })
      .then(res => {
        if (ctrl.signal.aborted) return;
        if (!res.data?.success) throw new Error(res.data?.message || 'Request failed');
        cacheSet(key, res.data.data);
        setState({ data: res.data.data, params, at: Date.now(), loading: false, error: '' });
      })
      .catch(e => {
        if (ctrl.signal.aborted || e?.code === 'ERR_CANCELED') return;
        const msg = e?.response?.data?.message || 'Could not load data. Check your connection.';
        setState(s => ({ ...s, loading: false, error: msg }));
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshKey]);

  return state;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function DashboardPage() { return <Dashboard />; }

function Dashboard() {
  const { userRole, orgId, subscriptionExpiryDate, timezone } = useAuth();
  const isSuperAdmin = userRole === 'SUPER_ADMIN';
  const tz = resolveTimezone(timezone);

  const [view, setView] = useState('chart'); // 'chart' | 'graph' | 'table'
  const [orderType, setOrderType] = useState('SALE'); // 'SALE' | 'PURCHASE'
  const themeColor = '#f97316';
  const themeColorRgb = '249, 115, 22';

  const [viewingDoc, setViewingDoc] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [config, setConfig] = useState(null);
  const [menus, setMenus] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [dismissedErr, setDismissedErr] = useState('');
  const [openErr, setOpenErr] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const currencySymbol = useCurrencySymbol();

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get('/api/v1/configurations').catch(() => null),
      api.get('/api/v1/users/menus').catch(() => null)
    ]).then(([cRes, mRes]) => {
      if (!active) return;
      if (cRes?.data?.success) setConfig(cRes.data.data || null);
      if (mRes?.data?.success) setMenus(mRes.data.data || []);
    });
    return () => { active = false; };
  }, []);

  const hasSalesAccess = useMemo(() => {
    if (menus.length === 0) return true;
    return menus.some(m => m.name === 'Sales' || m.name === 'Point of Sale');
  }, [menus]);

  const hasPurchaseAccess = useMemo(() => {
    if (config?.inventoryEnabled === false) return false;
    if (menus.length === 0) return true;
    return menus.some(m => m.name === 'Stock' || m.name === 'Purchase Orders');
  }, [menus, config]);

  useEffect(() => {
    if (menus.length > 0) {
      if (!hasSalesAccess && hasPurchaseAccess) setOrderType('PURCHASE');
      else if (hasSalesAccess && !hasPurchaseAccess) setOrderType('SALE');
    }
  }, [hasSalesAccess, hasPurchaseAccess, menus]);

  /* vendor/warehouse names are only needed for purchase breakdowns and the popup */
  const lookupsLoaded = useRef(false);
  const loadLookups = useCallback(() => {
    if (lookupsLoaded.current) return;
    lookupsLoaded.current = true;
    Promise.all([
      api.get('/api/v1/purchasing/vendors').catch(() => null),
      api.get('/api/v1/warehouses').catch(() => null),
    ]).then(([vRes, wRes]) => {
      if (vRes?.data?.success) setVendors(vRes.data.data || []);
      if (wRes?.data?.success) setWarehouses(wRes.data.data || []);
    });
  }, []);
  useEffect(() => { if (orderType === 'PURCHASE') loadLookups(); }, [orderType, loadLookups]);

  /* filters — the branch always follows the header's Active Branch switcher */
  const [terminals,   setTerminals]   = useState([]);
  const [selTerminal, setSelTerminal] = useState('');

  useEffect(() => { setSelTerminal(''); }, [orgId]);

  const [dateFrom, setDateFrom] = useState(() => PRESETS[0].range(getBusinessNow(timezone))[0]);
  const [dateTo,   setDateTo]   = useState(() => PRESETS[0].range(getBusinessNow(timezone))[1]);
  const wallFrom = useDebounced(dateFrom, 350);
  const wallTo   = useDebounced(dateTo, 350);

  const applyPreset = p => { const [f, t] = p.range(getBusinessNow(timezone)); setDateFrom(f); setDateTo(t); };
  const activePreset = useMemo(() => {
    const now = getBusinessNow(timezone);
    return PRESETS.find(p => { const [f, t] = p.range(now); return f === dateFrom && t === dateTo; })?.key || null;
  }, [dateFrom, dateTo, timezone]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.get('/api/v1/terminals').catch(()=>null).then(tr => {
      if (tr?.data?.success) setTerminals(tr.data.data || []);
    });
  }, [isSuperAdmin]);

  /* query shared by summary + table */
  const query = useMemo(() => {
    if (!wallFrom || !wallTo) return null;
    const q = {
      type: orderType,
      from: businessTimeToUtc(wallFrom, timezone),
      to: businessTimeToUtc(wallTo, timezone),
      tz,
    };
    if (isSuperAdmin && orgId) q.orgId = orgId;
    if (isSuperAdmin && selTerminal) q.terminalId = selTerminal;
    return q;
  }, [orderType, wallFrom, wallTo, timezone, tz, isSuperAdmin, orgId, selTerminal]);

  const rangeInvalid = query && new Date(query.from) > new Date(query.to);
  const summaryState = useCachedGet('/api/v1/orders/overview/summary', rangeInvalid ? null : query, refreshKey);
  /* only render data that belongs to the current order type (avoids sale data in purchase panels) */
  const summary = summaryState.data && summaryState.params?.type === orderType ? summaryState.data : null;
  const summaryWall = useMemo(() => ({ from: wallFrom, to: wallTo }), [wallFrom, wallTo]);

  /* live auto-refresh: every 60s while the tab is visible and the range includes "now" */
  const isLive = useMemo(() => {
    const n = getBusinessNow(timezone);
    const nowWall = `${ymd(n)}T${pad2(n.getHours())}:${pad2(n.getMinutes())}`;
    return wallTo >= nowWall && wallFrom <= nowWall;
  }, [wallFrom, wallTo, timezone, summaryState.at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isLive) return undefined;
    const tick = () => { if (document.visibilityState === 'visible') setRefreshKey(k => k + 1); };
    const id = setInterval(tick, 60000);
    const onVis = () => {
      if (document.visibilityState === 'visible' && summaryState.at && Date.now() - summaryState.at > 60000) tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [isLive, summaryState.at]);

  const refresh = () => setRefreshKey(k => k + 1);
  const filteredTerminals = useMemo(() =>
    orgId ? terminals.filter(t => t.orgId === orgId || t.organization?.id === orgId) : terminals,
  [terminals, orgId]);

  const vendorNames = useMemo(() => new Map(vendors.map(v => [String(v.id), v.name])), [vendors]);
  const warehouseNames = useMemo(() => new Map(warehouses.map(w => [String(w.id), w.name])), [warehouses]);

  /* open a row: fetch the single full order only now */
  const openOrder = useCallback(async (row) => {
    if (!row?.id || openingId) return;
    setOpeningId(row.id);
    setOpenErr('');
    loadLookups();
    try {
      const res = await api.get(`/api/v1/orders/${row.id}`);
      const o = res.data?.data;
      if (!o) return;
      setViewingDoc({
        order: { ...o, status: row.status, originalStatus: o.status || o.orderStatus, type: o.type || o.orderType },
        type: 'order',
      });
    } catch {
      setOpenErr('Could not open this document. Please try again.');
    } finally {
      setOpeningId(null);
    }
  }, [openingId, loadLookups]);

  const daysLeft = subscriptionExpiryDate
    ? Math.ceil((new Date(subscriptionExpiryDate) - new Date()) / 86400000) : null;

  const VIEWS = [
    { key:'chart', label:'Chart',  Icon: FaChartPie },
    { key:'graph', label:'Graph',  Icon: FaChartBar },
    { key:'table', label:'Table',  Icon: FaThList   },
  ];

  const err = rangeInvalid ? 'Start date must be before end date.' : (openErr || summaryState.error);
  const showErr = err && err !== dismissedErr;

  return (
    <DashboardLayout title="Business Overview" showBack={false}>
      <div className="db" style={{ '--theme-color': themeColor, '--theme-color-rgb': themeColorRgb }}>

        {daysLeft !== null && daysLeft > 0 && daysLeft <= 7 && (
          <div className="db-banner" role="status">
            <FaExclamationTriangle />
            Subscription expires in <strong>{daysLeft} day{daysLeft!==1?'s':''}</strong>
          </div>
        )}
        {showErr && (
          <div className="db-banner db-banner--red" role="alert">
            <FaExclamationTriangle /><span>{err}</span>
            {!rangeInvalid && <button className="db-banner-retry" onClick={refresh}>Retry</button>}
            <button onClick={()=>{ setDismissedErr(err); setOpenErr(''); }} aria-label="Dismiss"><FaTimes/></button>
          </div>
        )}

        {hasSalesAccess && hasPurchaseAccess && (
          <div className="db-toggle-container" role="tablist" aria-label="Overview type">
            <button role="tab" aria-selected={orderType === 'SALE'}
              className={`db-toggle-btn ${orderType === 'SALE' ? 'active sales' : ''}`}
              onClick={() => setOrderType('SALE')}>
              <FaShoppingBag /><span>Sales Overview</span>
            </button>
            <button role="tab" aria-selected={orderType === 'PURCHASE'}
              className={`db-toggle-btn ${orderType === 'PURCHASE' ? 'active purchase' : ''}`}
              onClick={() => setOrderType('PURCHASE')}>
              <FaMoneyBillWave /><span>Purchases Overview</span>
            </button>
          </div>
        )}

        {/* ── TOOLBAR ── */}
        <div className="db-toolbar">
          <div className="db-view-tabs" role="tablist" aria-label="View">
            {VIEWS.map(({key,label,Icon}) => (
              <button key={key} role="tab" aria-selected={view===key}
                className={`db-tab${view===key?' db-tab--on':''}`}
                onClick={()=>setView(key)}>
                <Icon /><span>{label}</span>
              </button>
            ))}
          </div>

          <div className="db-date-center">
            <div className="db-dt-wrap">
              <PremiumDateTimePicker value={dateFrom} onChange={v => setDateFrom(v)} themeColor={themeColor} />
            </div>
            <span className="db-dt-sep">→</span>
            <div className="db-dt-wrap">
              <PremiumDateTimePicker value={dateTo} onChange={v => setDateTo(v)} themeColor={themeColor} />
            </div>
          </div>

          <div className="db-filters-right">
            {isSuperAdmin && (
              <div className="db-ns-wrap">
                <NiceSelect value={selTerminal} onChange={v => setSelTerminal(v)} placeholder="All Terminals"
                  disabled={filteredTerminals.length === 0}
                  options={[{ value: '', label: 'All Terminals' }, ...filteredTerminals.map(t => ({ value: t.id, label: t.name || t.terminalId || t.id }))]} />
              </div>
            )}
          </div>
        </div>

        {/* ── PRESETS + STATUS LINE ── */}
        <div className="db-subbar">
          <div className="db-presets" role="group" aria-label="Quick date ranges">
            {PRESETS.map(p => (
              <button key={p.key} className={`db-preset${activePreset===p.key?' db-preset--on':''}`}
                aria-pressed={activePreset===p.key} onClick={() => applyPreset(p)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── KPIs ── */}
        <KpiStrip summary={summary} isSale={orderType === 'SALE'} currencySymbol={currencySymbol} />

        {/* ── VIEW AREA ── */}
        <div className={`db-view-area${summaryState.loading && summary ? ' db-view-area--busy' : ''}`} aria-busy={summaryState.loading}>
          {summaryState.loading && <div className="db-progress" />}
          {view === 'table' ? (
            <TableView
              query={rangeInvalid ? null : query}
              byStatus={summary?.byStatus}
              refreshKey={refreshKey}
              themeColor={themeColor}
              timezone={tz}
              openingId={openingId}
              onViewOrder={openOrder}
              currencySymbol={currencySymbol}
            />
          ) : !summary ? (
            summaryState.loading ? <Skeleton /> : <NoData />
          ) : view==='chart' ? (
            <ChartView summary={summary} orderType={orderType} vendorNames={vendorNames} warehouseNames={warehouseNames} currencySymbol={currencySymbol} />
          ) : (
            <GraphView summary={summary} wall={summaryWall} themeColor={themeColor} themeColorRgb={themeColorRgb} orderType={orderType} vendorNames={vendorNames} warehouseNames={warehouseNames} currencySymbol={currencySymbol} />
          )}
        </div>

        {viewingDoc && (
          <DocumentViewerPopup
            order={viewingDoc.order}
            docType={viewingDoc.type}
            vendors={vendors}
            warehouses={warehouses}
            timezone={timezone || 'Asia/Kolkata'}
            currencySymbol={currencySymbol}
            formatTzDate={formatTzDate}
            onClose={() => setViewingDoc(null)}
            onViewLinked={(order, type) => setViewingDoc({ order, type })}
            STATUS_CFG={DOC_STATUS_CFG}
            config={config}
            onOrderUpdated={() => { cacheClear(); refresh(); }}
          />
        )}
      </div>

      <style jsx>{`
        .db { padding:0 28px 48px; max-width:1440px; margin:0 auto; display:flex; flex-direction:column; gap:16px; }

        .db-banner { display:flex; align-items:center; gap:10px; padding:11px 18px; border-radius:12px; background:#fffbeb; border:1px solid #fde68a; border-left:4px solid #f59e0b; color:#92400e; font-size:13px; font-weight:600; }
        .db-banner button { margin-left:auto; background:none; border:none; cursor:pointer; color:inherit; }
        .db-banner .db-banner-retry { margin-left:auto; padding:4px 12px; border-radius:8px; border:1px solid currentColor; font-size:12px; font-weight:700; }
        .db-banner .db-banner-retry + button { margin-left:0; }
        .db-banner--red { background:#fef2f2; border-color:#fecaca; border-left-color:#ef4444; color:#b91c1c; }

        .db-toggle-container { display:flex; background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:4px; gap:4px; width:100%; max-width:480px; margin:0 auto; box-shadow:0 1px 3px rgba(0,0,0,.02); }
        .db-toggle-btn { flex:1; display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 18px; border:none; background:transparent; color:#64748b; font-size:13.5px; font-weight:700; cursor:pointer; border-radius:12px; transition:all .2s ease; -webkit-tap-highlight-color:transparent; }
        .db-toggle-btn:hover { color:#334155; }
        .db-toggle-btn.active.sales, .db-toggle-btn.active.purchase { background:#f97316; color:white; box-shadow:0 4px 12px rgba(249, 115, 22, 0.2); }

        .db-toolbar { display:flex; align-items:center; gap:12px; background:white; border:1px solid #f1f5f9; border-top:3px solid var(--theme-color); border-radius:14px; padding:8px 14px; box-shadow:0 1px 6px rgba(0,0,0,.04); flex-wrap:nowrap; }
        .db-view-tabs { display:flex; gap:2px; background:#f8fafc; border-radius:10px; padding:3px; flex-shrink:0; }
        .db-tab { display:inline-flex; align-items:center; gap:5px; padding:6px 12px; border:none; border-radius:8px; background:transparent; color:#64748b; font-size:11.5px; font-weight:700; cursor:pointer; transition:all .18s; white-space:nowrap; }
        .db-tab svg { font-size:12px; flex-shrink:0; }
        .db-tab:hover { color:var(--theme-color); }
        .db-tab--on { background:white; color:var(--theme-color); box-shadow:0 1px 4px rgba(0,0,0,.08); }

        .db-date-center { flex:1; display:flex; align-items:center; justify-content:center; gap:8px; }
        .db-filters-right { display:flex; align-items:center; gap:6px; flex-shrink:0; }

        .db-dt-wrap { width:230px; flex-shrink:0; }
        .db-dt-wrap .dt-trigger { height:34px; padding:4px 10px; border-radius:10px; font-size:12px; border:1.5px solid #e2e8f0; }
        .db-dt-wrap .dt-input { font-size:12px; font-weight:500; color:#334155; min-width:0; flex:1; }
        .db-dt-wrap .dt-chevron { font-size:10px; color:#94a3b8; }
        .db-dt-wrap .dt-icon { color:#64748b; opacity:0.6; font-size:13px; }
        .db-dt-sep { font-size:12px; color:#cbd5e1; font-weight:700; flex-shrink:0; }

        .db-ns-wrap { width:155px; flex-shrink:0; }
        .db-ns-wrap .nice-select-trigger { height:34px !important; padding:4px 10px !important; border-radius:10px !important; font-size:11.5px !important; }
        .db-ns-wrap .nice-select-trigger span { font-size:11.5px !important; }
        :global(.spin) { animation:spin .7s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }

        .db-subbar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-top:-4px; }
        .db-presets { display:flex; gap:6px; flex-wrap:wrap; }
        .db-preset { padding:5px 12px; border-radius:999px; border:1.5px solid #e2e8f0; background:white; color:#64748b; font-size:11px; font-weight:700; cursor:pointer; transition:all .18s; }
        .db-preset:hover { border-color:var(--theme-color); color:var(--theme-color); }
        .db-preset--on, .db-preset--on:hover { background:var(--theme-color); border-color:var(--theme-color); color:white; }

        .db-view-area { position:relative; background:white; border:1px solid #f1f5f9; border-radius:18px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.04); min-height:480px; }
        .db-view-area--busy > :global(*:not(.db-progress)) { opacity:.6; transition:opacity .2s; }
        .db-progress { position:absolute; top:0; left:0; right:0; height:3px; z-index:5; overflow:hidden; background:rgba(var(--theme-color-rgb), .12); }
        .db-progress::after { content:''; position:absolute; top:0; bottom:0; width:35%; background:var(--theme-color); animation:indet 1.1s ease-in-out infinite; }
        @keyframes indet { from { left:-35%; } to { left:100%; } }

        @media(max-width:1024px) {
          .db { padding:0 20px 36px; }
          .db-toolbar { flex-direction:column; align-items:stretch; gap:12px; padding:14px; }
          .db-view-tabs { width:100%; justify-content:center; }
          .db-view-tabs .db-tab { flex:1; justify-content:center; }
          .db-date-center { width:100%; justify-content:space-between; }
          .db-dt-wrap { flex:1; width:auto; min-width:0; }
          .db-filters-right { width:100%; justify-content:space-between; }
          .db-ns-wrap { flex:1; width:auto; min-width:0; }
        }
        @media(max-width:768px) {
          .db { padding:0 12px 32px; }
          .db-toggle-container { max-width:100%; }
          .db-date-center { flex-direction:column; width:100%; align-items:stretch; gap:8px; }
          .db-dt-sep { display:none; }
          .db-dt-wrap { width:100%; }
          .db-dt-wrap :global(.dt-trigger) { height:38px !important; padding:8px 12px !important; }
          .db-dt-wrap :global(.dt-input) { font-size:13px !important; }
          .db-presets { flex-wrap:nowrap; overflow-x:auto; -webkit-overflow-scrolling:touch; width:100%; padding-bottom:2px; }
          .db-preset { flex-shrink:0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .db-progress::after, :global(.spin) { animation:none; }
        }
      `}</style>
    </DashboardLayout>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   KPI STRIP
   ═══════════════════════════════════════════════════════════════════════════ */
const KpiStrip = memo(function KpiStrip({ summary, isSale, currencySymbol }) {
  const cards = [
    { label: isSale ? 'Total Sales' : 'Purchase Value', value: summary ? fmtC(summary.revenue, currencySymbol) : null, icon: <FaMoneyBillWave/>, tone: 'orange' },
    { label: isSale ? 'Orders' : 'Purchase Orders', value: summary ? fmtN(summary.orderCount) : null, icon: <FaReceipt/>, tone: 'blue' },
    { label: isSale ? 'Avg Order Value' : 'Avg PO Value', value: summary ? fmtC(summary.avgOrderValue, currencySymbol) : null, icon: <FaChartBar/>, tone: 'green' },
    { label: 'Cancelled', value: summary ? fmtN(summary.byStatus?.CANCELLED || 0) : null, icon: <FaBan/>, tone: 'red' },
  ];
  return (
    <div className="kpi-grid">
      {cards.map(c => (
        <div key={c.label} className={`kpi kpi--${c.tone}`}>
          <div className="kpi-icon">{c.icon}</div>
          <div className="kpi-body">
            <span className="kpi-label">{c.label}</span>
            {c.value === null ? <span className="kpi-skel" /> : <span className="kpi-value">{c.value}</span>}
          </div>
        </div>
      ))}
      <style jsx>{`
        .kpi-grid { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:14px; }
        .kpi { display:flex; align-items:center; gap:14px; background:white; border:1px solid #f1f5f9; border-radius:14px; padding:14px 16px; box-shadow:0 1px 6px rgba(0,0,0,.04); min-width:0; }
        .kpi-icon { width:38px; height:38px; border-radius:11px; display:flex; align-items:center; justify-content:center; font-size:15px; flex-shrink:0; }
        .kpi--orange .kpi-icon { background:#fff7ed; color:#f97316; }
        .kpi--blue .kpi-icon { background:#eff6ff; color:#3b82f6; }
        .kpi--green .kpi-icon { background:#ecfdf5; color:#10b981; }
        .kpi--red .kpi-icon { background:#fef2f2; color:#ef4444; }
        .kpi-body { display:flex; flex-direction:column; gap:3px; min-width:0; }
        .kpi-label { font-size:10.5px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:.07em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .kpi-value { font-size:19px; font-weight:900; color:#0f172a; font-family:'JetBrains Mono',monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-variant-numeric:tabular-nums; }
        .kpi-skel { display:block; width:90px; height:20px; border-radius:6px; background:linear-gradient(90deg,#f1f5f9,#e2e8f0,#f1f5f9); background-size:200% 100%; animation:shimmer 1.2s infinite; }
        @keyframes shimmer { from { background-position:200% 0; } to { background-position:-200% 0; } }
        @media(max-width:1024px) { .kpi-grid { grid-template-columns:repeat(2, minmax(0,1fr)); } }
        @media(max-width:480px) { .kpi { padding:12px; gap:10px; } .kpi-value { font-size:16px; } .kpi-icon { width:32px; height:32px; } }
      `}</style>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   CHART VIEW — donut + peak times + breakdowns + best sellers
   ═══════════════════════════════════════════════════════════════════════════ */
const fmtHr = h => `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`;

const getFulfillmentIcon = (key) => {
  switch (key) {
    case 'DINE_IN': return <FaUtensils className="cv-icon" style={{ color: '#f97316' }} />;
    case 'TAKEAWAY': return <FaShoppingBag className="cv-icon" style={{ color: '#f97316' }} />;
    case 'DELIVERY': return <FaMotorcycle className="cv-icon" style={{ color: '#f97316' }} />;
    default: return <FaReceipt className="cv-icon" style={{ color: '#f97316' }} />;
  }
};
const getPaymentIcon = (label) => {
  const l = String(label).toUpperCase();
  if (l.includes('CASH')) return <FaMoneyBillWave className="cv-icon" style={{ color: '#10b981' }} />;
  if (l.includes('CARD')) return <FaCreditCard className="cv-icon" style={{ color: '#10b981' }} />;
  if (l.includes('UPI') || l.includes('QR') || l.includes('ONLINE')) return <FaQrcode className="cv-icon" style={{ color: '#10b981' }} />;
  if (l.includes('UNPAID') || l.includes('PENDING')) return <FaClock className="cv-icon" style={{ color: '#10b981' }} />;
  return <FaReceipt className="cv-icon" style={{ color: '#10b981' }} />;
};

function BreakdownList({ items, totalVal, icon, gradient, shadow, countLabel, emptyText, currencySymbol }) {
  if (!items.length) return <div className="cv-nil-text">{emptyText}</div>;
  return (
    <div className="cv-breakdown-list">
      {items.map(it => {
        const pct = Math.min(100, (num(it.total) / totalVal) * 100);
        return (
          <div key={it.key} className="cv-breakdown-item">
            <div className="cv-bi-info">
              <div className="cv-bi-left">
                {typeof icon === 'function' ? icon(it) : icon}
                <span className="cv-bi-label" title={it.label}>{it.label}</span>
              </div>
              <div className="cv-bi-right">
                <span className="cv-bi-count">{it.count} {countLabel(it.count)}</span>
                <span className="cv-bi-amount">{fmtC(it.total, currencySymbol)}</span>
              </div>
            </div>
            <div className="cv-progress-track">
              <div className="cv-progress-bar" style={{ width: `${pct}%`, background: gradient, boxShadow: `0 2px 8px ${shadow}` }} />
            </div>
          </div>
        );
      })}
      <style jsx>{`
        .cv-breakdown-list { display:flex; flex-direction:column; gap:16px; }
        .cv-breakdown-item { display:flex; flex-direction:column; gap:6px; transition:transform 0.2s ease; }
        .cv-breakdown-item:hover { transform:translateX(2px); }
        .cv-bi-info { display:flex; justify-content:space-between; align-items:center; gap:8px; }
        .cv-bi-left { display:flex; align-items:center; gap:8px; min-width:0; }
        .cv-bi-label { font-size:12.5px; font-weight:700; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .cv-bi-right { display:flex; align-items:center; gap:8px; flex-shrink:0; }
        .cv-bi-count { font-size:10px; font-weight:700; color:#64748b; background:#f1f5f9; padding:2px 8px; border-radius:999px; text-transform:uppercase; }
        .cv-bi-amount { font-size:12px; font-weight:800; color:#0f172a; font-family:'JetBrains Mono', monospace; }
        .cv-progress-track { height:8px; background:#f1f5f9; border-radius:999px; overflow:hidden; }
        .cv-progress-bar { height:100%; border-radius:999px; transition:width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
        .cv-nil-text { font-size:11.5px; font-weight:600; color:#94a3b8; text-align:center; padding:12px 0; }
        @media(max-width:768px) { .cv-breakdown-item:hover { transform:none; } }
      `}</style>
    </div>
  );
}

const ORANGE = { gradient: 'linear-gradient(90deg, #ea580c, #f97316)', shadow: 'rgba(249, 115, 22, 0.35)' };
const GREEN  = { gradient: 'linear-gradient(90deg, #059669, #10b981)', shadow: 'rgba(16, 185, 129, 0.35)' };

const ChartView = memo(function ChartView({ summary, orderType, vendorNames, warehouseNames, currencySymbol = '' }) {
  const isSale = orderType === 'SALE';

  const donutData = useMemo(() => {
    const entries = Object.entries(summary.byStatus || {}).filter(([, c]) => c > 0);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    if (!total) return [];
    const CIRC = 2 * Math.PI * 52;
    let offset = 0;
    return entries.map(([key, count]) => {
      const pct = count / total;
      const dash = pct * CIRC;
      const seg = { key, count, pct, dash, offset, ...(STATUS_META[key] || STATUS_META.OTHER) };
      offset += dash;
      return seg;
    });
  }, [summary.byStatus]);

  const peak = useMemo(() => {
    const hours = summary.hourly || [];
    const maxCount = Math.max(1, ...hours.map(h => h.count));
    const top = hours.filter(h => h.count > 0)
      .sort((a, b) => b.count - a.count).slice(0, 4)
      .map(h => { const hr = Number(h.key); return { ...h, label: `${fmtHr(hr)} - ${fmtHr((hr + 1) % 24)}` }; });
    return { top, maxCount };
  }, [summary.hourly]);

  const fulfillment = useMemo(() => (summary.byFulfillment || []).filter(f => f.count > 0)
    .map(f => ({ ...f, label: FULFILLMENT_LABELS[f.key] || f.key })), [summary.byFulfillment]);
  const payments = useMemo(() => (summary.byPayment || [])
    .map(p => ({ ...p, label: PAYMENT_LABELS[p.key] || p.key })), [summary.byPayment]);
  const topWarehouses = useMemo(() => (summary.byWarehouse || []).slice(0, 4)
    .map(w => ({ ...w, label: warehouseNames.get(w.key) || `Warehouse #${w.key.substring(0, 4)}` })), [summary.byWarehouse, warehouseNames]);
  const topVendors = useMemo(() => (summary.byVendor || []).slice(0, 4)
    .map(v => ({ ...v, label: vendorNames.get(v.key) || `Supplier #${v.key.substring(0, 4)}` })), [summary.byVendor, vendorNames]);
  const topItems = useMemo(() => (summary.topItems || []).slice(0, 7), [summary.topItems]);

  if (!summary.totalCount) return <NoData />;

  const totalVal = num(summary.revenue) || 1;
  const plural = (one, many) => c => (c === 1 ? one : many);

  return (
    <div className="cv">
      <div className="cv-grid">
        <div className="cv-panel cv-donut-panel">
          <div className="cv-section-title">{isSale ? 'Order Status' : 'Purchase Status'}</div>
          <div className="cv-donut-wrap">
            <svg viewBox="0 0 120 120" className="cv-donut-svg" role="img" aria-label="Status distribution">
              <circle cx="60" cy="60" r="52" fill="none" stroke="#f1f5f9" strokeWidth="14"/>
              {donutData.map(seg => (
                <circle key={seg.key} cx="60" cy="60" r="52" fill="none" stroke={seg.color} strokeWidth="14"
                  strokeDasharray={`${seg.dash} ${2*Math.PI*52-seg.dash}`} strokeDashoffset={-seg.offset}
                  style={{transform:'rotate(-90deg)',transformOrigin:'60px 60px'}} />
              ))}
              <text x="60" y="58" textAnchor="middle" className="donut-center-val">{fmtN(summary.totalCount)}</text>
              <text x="60" y="71" textAnchor="middle" className="donut-center-label">{isSale ? 'Orders' : 'Purchases'}</text>
            </svg>
            <div className="cv-legend">
              {donutData.map(seg => (
                <div key={seg.key} className="cv-legend-row">
                  <span className="cv-legend-dot" style={{background:seg.color}}/>
                  <span className="cv-legend-name">{seg.label}</span>
                  <span className="cv-legend-count" style={{color:seg.color}}>{fmtN(seg.count)}</span>
                  <span className="cv-legend-pct">{Math.round(seg.pct*100)}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="cv-divider" />

          <div className="cv-section-title cv-title-orange">Peak Activity Times</div>
          {peak.top.length > 0 ? (
            <div className="cv-peak-list">
              {peak.top.map(b => (
                <div key={b.key} className="cv-peak-item">
                  <div className="cv-peak-info">
                    <span className="cv-peak-label"><FaClock style={{ color: '#f97316', fontSize: 13 }} />{b.label}</span>
                    <span className="cv-peak-count">{fmtN(b.count)} {b.count === 1 ? 'order' : 'orders'}</span>
                  </div>
                  <div className="cv-progress-track">
                    <div className="cv-progress-bar" style={{ width: `${(b.count / peak.maxCount) * 100}%`, background: ORANGE.gradient, boxShadow: `0 2px 8px ${ORANGE.shadow}` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="cv-nil-text">No activity recorded</div>}
        </div>

        <div className="cv-panel cv-breakdown-panel">
          {isSale ? (
            <>
              <div className="cv-section-title cv-title-orange">Order Type</div>
              <BreakdownList items={fulfillment} totalVal={totalVal} icon={it => getFulfillmentIcon(it.key)} {...ORANGE}
                countLabel={plural('order', 'orders')} emptyText="No fulfillment data" currencySymbol={currencySymbol} />
              <div className="cv-divider" />
              <div className="cv-section-title cv-title-green">Payment Method Share</div>
              <BreakdownList items={payments} totalVal={totalVal} icon={it => getPaymentIcon(it.label)} {...GREEN}
                countLabel={() => 'txn'} emptyText="No payment data" currencySymbol={currencySymbol} />
            </>
          ) : (
            <>
              <div className="cv-section-title cv-title-orange">Warehouse Distribution</div>
              <BreakdownList items={topWarehouses} totalVal={totalVal} icon={<FaWarehouse className="cv-icon" style={{ color: '#f97316' }} />} {...ORANGE}
                countLabel={() => 'POs'} emptyText="No warehouse data" currencySymbol={currencySymbol} />
              <div className="cv-divider" />
              <div className="cv-section-title cv-title-green">Top Suppliers</div>
              <BreakdownList items={topVendors} totalVal={totalVal} icon={<FaHandshake className="cv-icon" style={{ color: '#10b981' }} />} {...GREEN}
                countLabel={() => 'POs'} emptyText="No supplier data" currencySymbol={currencySymbol} />
            </>
          )}
        </div>
      </div>

      {topItems.length > 0 && (
        <div className="cv-bsp-full">
          <div className="cv-section-title cv-title-green">{isSale ? 'Best Selling Products' : 'Most Ordered Products'}</div>
          <div className="bsp-list">
            {(() => {
              const maxQty = Math.max(...topItems.map(i => num(i.quantity)), 1);
              return topItems.map((item, i) => (
                <div key={item.name} className="bsp-row">
                  <div className="bsp-row-info">
                    <div className="bsp-row-left">
                      <span className="bsp-row-rank">#{i + 1}</span>
                      <span className="bsp-row-name" title={item.name}>{item.name}</span>
                    </div>
                    <div className="bsp-row-right">
                      <span className="bsp-row-qty">{fmtQty(item.quantity, item.uomPrecision)} qty</span>
                      <span className="bsp-row-rev">{fmtC(item.total, currencySymbol)}</span>
                    </div>
                  </div>
                  <div className="bsp-row-track">
                    <div className="bsp-row-bar" style={{ width: `${(num(item.quantity) / maxQty) * 100}%` }} />
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      <style jsx>{`
        .cv { padding:24px; display:flex; flex-direction:column; gap:28px; }
        .cv-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:28px; max-width:100%; }
        .cv-panel { background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; padding:28px; display:flex; flex-direction:column; gap:16px; box-shadow:0 4px 12px rgba(0,0,0,0.03); min-width:0; }

        .cv-bsp-full { background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; padding:28px; box-shadow:0 4px 12px rgba(0,0,0,0.03); display:flex; flex-direction:column; gap:16px; }
        .bsp-list { display:flex; flex-direction:column; gap:14px; }
        .bsp-row { display:flex; flex-direction:column; gap:6px; transition:transform .15s; }
        .bsp-row:hover { transform:translateX(2px); }
        .bsp-row-info { display:flex; justify-content:space-between; align-items:center; gap:10px; }
        .bsp-row-left { display:flex; align-items:center; gap:10px; min-width:0; }
        .bsp-row-rank { font-size:10px; font-weight:800; color:#94a3b8; background:#f1f5f9; padding:2px 7px; border-radius:6px; flex-shrink:0; }
        .bsp-row-name { font-size:13px; font-weight:700; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .bsp-row-right { display:flex; align-items:center; gap:10px; flex-shrink:0; }
        .bsp-row-qty { font-size:10px; font-weight:700; color:#64748b; background:#f1f5f9; padding:2px 8px; border-radius:999px; }
        .bsp-row-rev { font-size:12.5px; font-weight:800; color:#0f172a; font-family:'JetBrains Mono',monospace; }
        .bsp-row-track { height:6px; background:#f1f5f9; border-radius:999px; overflow:hidden; }
        .bsp-row-bar { height:100%; border-radius:999px; background:linear-gradient(90deg,#059669,#10b981); transition:width .6s cubic-bezier(.4,0,.2,1); }

        .cv-section-title { font-size:11px; font-weight:800; color:#475569; text-transform:uppercase; letter-spacing:.08em; display:flex; align-items:center; gap:8px; }
        .cv-section-title::before { content:''; display:inline-block; width:4px; height:12px; background:var(--theme-color); border-radius:999px; }
        .cv-title-orange::before { background:#f97316 !important; }
        .cv-title-green::before { background:#10b981 !important; }

        .cv-donut-wrap { display:flex; align-items:center; gap:36px; justify-content:center; }
        .cv-donut-svg { width:180px; height:180px; flex-shrink:0; }
        .donut-center-val { font-size:16px; font-weight:900; fill:#0f172a; }
        .donut-center-label { font-size:8px; font-weight:700; fill:#94a3b8; }
        .cv-legend { display:flex; flex-direction:column; gap:8px; flex:1; }
        .cv-legend-row { display:grid; grid-template-columns:10px 1fr auto 38px; align-items:center; gap:8px; }
        .cv-legend-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .cv-legend-name { font-size:11.5px; font-weight:700; color:#334155; }
        .cv-legend-count { font-size:12px; font-weight:800; text-align:right; }
        .cv-legend-pct { font-size:10.5px; font-weight:700; color:#94a3b8; text-align:right; }

        .cv-peak-list { display:flex; flex-direction:column; gap:16px; }
        .cv-peak-item { display:flex; flex-direction:column; gap:6px; }
        .cv-peak-info { display:flex; justify-content:space-between; align-items:center; }
        .cv-peak-label { display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:700; color:#334155; }
        .cv-peak-count { font-size:10px; font-weight:700; color:#64748b; background:#f1f5f9; padding:2px 8px; border-radius:999px; text-transform:uppercase; }
        .cv-progress-track { height:8px; background:#f1f5f9; border-radius:999px; overflow:hidden; }
        .cv-progress-bar { height:100%; border-radius:999px; transition:width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
        :global(.cv-icon) { font-size:13px; display:inline-block; flex-shrink:0; }
        .cv-divider { height:1px; background:#f1f5f9; margin:8px 0; }
        .cv-nil-text { font-size:11.5px; font-weight:600; color:#94a3b8; text-align:center; padding:12px 0; }

        @media(max-width:768px) {
          .cv { padding:12px; gap:16px; }
          .cv-grid { grid-template-columns:1fr; gap:16px; }
          .cv-panel, .cv-bsp-full { padding:16px; }
          .cv-donut-wrap { flex-direction:column; gap:20px; }
          .cv-donut-svg { width:150px; height:150px; }
          .bsp-row:hover { transform:none; }
        }
      `}</style>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   GRAPH VIEW — trend + breakdown bars
   ═══════════════════════════════════════════════════════════════════════════ */
function BarPanel({ title, tone, list, metric, valueKey = 'total', unit, currencySymbol, scroll, ranked }) {
  if (!list.length) return <div className="gv-bd-nil">No data</div>;
  const values = list.map(item => metric === 'revenue' ? num(item.total) : num(item[valueKey]));
  const maxVal = Math.max(...values, 1);
  return (
    <div className={`gv-bd-chart${scroll ? ' gv-bsp-chart' : ''}`}>
      {list.map((item, idx) => {
        const val = values[idx];
        const name = item.label || item.name;
        const unitText = unit(item, val);
        return (
          <div key={item.key || item.name} className="gv-bd-col">
            <div className="gv-bd-bar-area">
              <div className={`gv-bd-bar gv-bar-${tone}`} style={{ height: `${Math.max((val / maxVal) * 100, 4)}%` }}>
                <span className="gv-bd-tip">
                  <span className="tip-name">{name}</span>
                  <span className="tip-amt">{fmtC(item.total, currencySymbol)}</span>
                  <span className="tip-orders">{unit(item, valueKey === 'quantity' ? item.quantity : item.count)}</span>
                </span>
              </div>
            </div>
            {ranked && <div className="gv-bd-rank">#{idx + 1}</div>}
            <div className="gv-bd-label" title={name}>{name}</div>
            <div className="gv-bd-value">{metric === 'revenue' ? fmtC(val, currencySymbol) : unitText}</div>
          </div>
        );
      })}
      <style jsx>{`
        .gv-bd-chart { display:flex; gap:14px; justify-content:space-around; align-items:flex-end; min-height:160px; padding:20px 8px 8px; background:#ffffff; border:1px solid #f1f5f9; border-radius:12px; margin-top:6px; }
        .gv-bsp-chart { gap:8px; overflow-x:auto; -webkit-overflow-scrolling:touch; justify-content:flex-start; padding-left:12px; padding-right:12px; }
        .gv-bd-col { display:flex; flex-direction:column; align-items:center; flex:1; min-width:50px; }
        .gv-bsp-chart .gv-bd-col { flex-shrink:0; width:65px; }
        .gv-bd-bar-area { width:100%; height:80px; display:flex; align-items:flex-end; justify-content:center; position:relative; }
        .gv-bd-bar { width:18px; border-radius:6px 6px 0 0; position:relative; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); cursor:pointer; }
        .gv-bd-bar:hover { opacity:0.9; transform:scaleX(1.15); }
        .gv-bar-orange { background:linear-gradient(180deg,#f97316,rgba(249, 115, 22, 0.15)); box-shadow:0 2px 6px rgba(249,115,22,0.1); }
        .gv-bar-green { background:linear-gradient(180deg,#10b981,rgba(16, 185, 129, 0.15)); box-shadow:0 2px 6px rgba(16,185,129,0.1); }
        .gv-bd-tip { position:absolute; bottom:105%; left:50%; transform:translateX(-50%) translateY(4px); background:#0f172a; color:#ffffff; padding:6px 10px; border-radius:8px; display:flex; flex-direction:column; align-items:center; gap:2px; opacity:0; pointer-events:none; transition:all 0.2s ease; box-shadow:0 10px 15px -3px rgba(0,0,0,0.3); z-index:10; white-space:nowrap; }
        .gv-bd-tip::after { content:''; position:absolute; top:100%; left:50%; transform:translateX(-50%); border-left:5px solid transparent; border-right:5px solid transparent; border-top:5px solid #0f172a; }
        .gv-bd-bar:hover .gv-bd-tip { opacity:1; transform:translateX(-50%) translateY(0); }
        .tip-name { font-size:10px; font-weight:800; color:#cbd5e1; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .tip-amt { font-size:10.5px; font-weight:800; font-family:'JetBrains Mono', monospace; }
        .tip-orders { font-size:8px; font-weight:700; color:#ffedd5; text-transform:uppercase; }
        .gv-bd-rank { font-size:9px; font-weight:800; color:#94a3b8; margin-top:6px; }
        .gv-bd-label { font-size:10px; font-weight:700; color:#475569; text-align:center; width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:6px; }
        .gv-bsp-chart .gv-bd-label { max-width:65px; }
        .gv-bd-value { font-size:9px; font-weight:800; color:#94a3b8; font-family:'JetBrains Mono',monospace; margin-top:2px; text-align:center; width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .gv-bd-nil { font-size:11.5px; font-weight:600; color:#94a3b8; text-align:center; padding:8px 0; }
        @media(max-width: 640px) {
          .gv-bd-chart { gap:8px; overflow-x:auto; -webkit-overflow-scrolling:touch; justify-content:flex-start; padding-left:12px; padding-right:12px; }
          .gv-bd-chart .gv-bd-col { flex-shrink:0; width:65px; }
        }
      `}</style>
    </div>
  );
}

const GraphView = memo(function GraphView({ summary, wall, themeColor, themeColorRgb, orderType, vendorNames, warehouseNames, currencySymbol = '' }) {
  const [metric, setMetric] = useState('revenue'); // 'revenue' | 'count'
  const isSale = orderType === 'SALE';

  /* Fill the sparse server trend into a continuous series of branch wall-clock bins. */
  const trendData = useMemo(() => {
    const parse = v => {
      const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}))?/.exec(String(v || ''));
      return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0)) : NaN;
    };
    const start = parse(wall.from);
    const end = parse(wall.to);
    if (isNaN(start) || isNaN(end) || end < start) return [];
    const hourly = summary.trendGranularity === 'HOUR';
    const byKey = new Map((summary.trend || []).map(b => [b.key, b]));
    const HOUR = 3600 * 1000, DAY = 24 * HOUR;
    const out = [];
    if (hourly) {
      for (let t = start; t <= end; t += HOUR) {
        const d = new Date(t);
        const b = byKey.get(d.toISOString().substring(0, 13));
        out.push({ label: `${pad2(d.getUTCHours())}:00`, revenue: num(b?.total), count: b?.count || 0 });
      }
    } else {
      for (let t = Math.floor(start / DAY) * DAY; t <= end; t += DAY) {
        const d = new Date(t);
        const b = byKey.get(d.toISOString().substring(0, 10));
        out.push({ label: d.toLocaleDateString([], { day: '2-digit', month: 'short', timeZone: 'UTC' }), revenue: num(b?.total), count: b?.count || 0 });
      }
    }
    return out;
  }, [summary.trend, summary.trendGranularity, wall.from, wall.to]);

  const maxVal = useMemo(() => {
    const values = trendData.map(d => metric === 'revenue' ? d.revenue : d.count);
    return Math.max(...values, 0) || 1;
  }, [trendData, metric]);
  const gridLines = [maxVal, maxVal * 0.75, maxVal * 0.5, maxVal * 0.25, 0];
  const formatYLabel = val => metric === 'revenue' ? fmtC(val, currencySymbol) : Math.round(val).toString();

  const lists = useMemo(() => ({
    fulfillment: (summary.byFulfillment || []).filter(f => f.count > 0).map(f => ({ ...f, label: FULFILLMENT_LABELS[f.key] || f.key })),
    payment: (summary.byPayment || []).map(p => ({ ...p, label: PAYMENT_LABELS[p.key] || p.key })),
    warehouse: (summary.byWarehouse || []).slice(0, 5).map(w => ({ ...w, label: warehouseNames.get(w.key) || `Warehouse #${w.key.substring(0, 4)}` })),
    vendor: (summary.byVendor || []).slice(0, 5).map(v => ({ ...v, label: vendorNames.get(v.key) || `Supplier #${v.key.substring(0, 4)}` })),
    items: (summary.topItems || []).slice(0, 7),
  }), [summary, vendorNames, warehouseNames]);

  if (!summary.totalCount) return <NoData />;

  return (
    <div className="gv" style={{ '--theme-color': themeColor, '--theme-color-rgb': themeColorRgb }}>
      <div className="gv-header">
        <span className="gv-title">{isSale ? 'Sales Analytics' : 'Purchases Analytics'}</span>
        <div className="gv-metric-tabs" role="group" aria-label="Metric">
          <button aria-pressed={metric==='revenue'} className={`gv-mt${metric==='revenue'?' gv-mt--on':''}`} onClick={()=>setMetric('revenue')}>Revenue</button>
          <button aria-pressed={metric==='count'} className={`gv-mt${metric==='count'?' gv-mt--on':''}`} onClick={()=>setMetric('count')}>Count</button>
        </div>
      </div>

      <div className="gv-panel">
        <div className="gv-panel-title">{metric === 'revenue' ? 'Revenue Trend' : 'Order Count Trend'}</div>
        <div className="gv-chart-container">
          <div className="gv-chart-grid-lines">
            {gridLines.map((val, idx) => (
              <div key={idx} className={`grid-line ${val === 0 ? 'zero' : ''}`}>
                <span className="grid-line-label">{formatYLabel(val)}</span>
              </div>
            ))}
          </div>
          <div className="gv-hourly-chart">
            {trendData.map((d, i) => {
              const val = metric === 'revenue' ? d.revenue : d.count;
              return (
                <div key={i} className="gv-hour-col">
                  <div className="gv-hour-bar-area">
                    <div className="gv-hour-bar" style={{ height: `${Math.max((val / maxVal) * 100, 2)}%` }}>
                      <span className="gv-hour-tip">
                        <span className="tip-amt">{fmtC(d.revenue, currencySymbol)}</span>
                        <span className="tip-orders">{d.count} orders</span>
                      </span>
                    </div>
                  </div>
                  <div className="gv-hour-label">{d.label}</div>
                  <div className="gv-hour-badge">{d.count} ORD</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="gv-breakdown-grid">
        <div className="gv-bd-panel">
          <div className="gv-panel-title gv-title-orange">{isSale ? 'Order Type' : 'Warehouse Distribution'}</div>
          <BarPanel tone="orange" metric={metric} currencySymbol={currencySymbol}
            list={isSale ? lists.fulfillment : lists.warehouse}
            unit={(it, v) => `${v} ${isSale ? 'orders' : 'POs'}`} />
        </div>
        <div className="gv-bd-panel">
          <div className="gv-panel-title gv-title-green">{isSale ? 'Payment Method Share' : 'Top Suppliers'}</div>
          <BarPanel tone="green" metric={metric} currencySymbol={currencySymbol}
            list={isSale ? lists.payment : lists.vendor}
            unit={(it, v) => `${v} ${isSale ? 'txn' : 'POs'}`} />
        </div>
      </div>

      {lists.items.length > 0 && (
        <div className="gv-bd-panel">
          <div className="gv-panel-title gv-title-green">{isSale ? 'Best Selling Products' : 'Most Ordered Products'}</div>
          <BarPanel tone="green" metric={metric} currencySymbol={currencySymbol} scroll ranked
            list={lists.items} valueKey="quantity"
            unit={(it, v) => `${fmtQty(v, it.uomPrecision)} qty`} />
        </div>
      )}

      <style jsx>{`
        .gv { padding:20px 24px; display:flex; flex-direction:column; gap:18px; }
        .gv-header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .gv-title { font-size:15px; font-weight:800; color:#0f172a; }
        .gv-metric-tabs { display:flex; gap:3px; background:#f1f5f9; border-radius:10px; padding:3px; }
        .gv-mt { padding:5px 14px; border:none; border-radius:8px; background:transparent; color:#64748b; font-size:12px; font-weight:700; cursor:pointer; transition:all .18s; }
        .gv-mt:hover { color:var(--theme-color); }
        .gv-mt--on { background:white; color:var(--theme-color); box-shadow:0 1px 4px rgba(0,0,0,.07); }

        .gv-panel { background:#fafafa; border:1px solid #f1f5f9; border-radius:14px; padding:18px; }
        .gv-panel-title { font-size:11px; font-weight:800; color:#475569; text-transform:uppercase; letter-spacing:.08em; display:flex; align-items:center; gap:8px; margin-bottom:6px; }
        .gv-panel-title::before { content:''; display:inline-block; width:4px; height:12px; background:var(--theme-color); border-radius:999px; }
        .gv-title-orange::before { background:#f97316 !important; }
        .gv-title-green::before  { background:#10b981 !important; }

        .gv-chart-container { position:relative; padding-left:90px; padding-top:20px; margin-top:10px; min-height:330px; }
        .gv-chart-grid-lines { position:absolute; inset:30px 0 50px 90px; display:flex; flex-direction:column; justify-content:space-between; pointer-events:none; }
        .grid-line { width:100%; border-bottom:1px dashed #e2e8f0; position:relative; }
        .grid-line.zero { border-bottom:1.5px solid #cbd5e1; }
        .grid-line-label { position:absolute; left:-90px; bottom:-7px; width:80px; text-align:right; font-size:10px; font-weight:700; color:#94a3b8; font-family:'JetBrains Mono', monospace; }
        .gv-hourly-chart { display:flex; gap:20px; justify-content:flex-start; align-items:flex-end; min-height:270px; overflow-x:auto; position:relative; z-index:2; padding:30px 10px 10px; -webkit-overflow-scrolling:touch; }
        .gv-hour-col { display:flex; flex-direction:column; align-items:center; width:58px; flex-shrink:0; content-visibility:auto; contain-intrinsic-size:58px 260px; }
        .gv-hour-bar-area { width:100%; height:200px; display:flex; align-items:flex-end; justify-content:center; position:relative; }
        .gv-hour-bar { width:20px; border-radius:8px 8px 0 0; position:relative; transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1); min-height:4px; cursor:pointer;
          background:linear-gradient(180deg, var(--theme-color), rgba(var(--theme-color-rgb), 0.15)); box-shadow:0 4px 10px rgba(var(--theme-color-rgb), 0.15); }
        .gv-hour-bar:hover { opacity:0.9; transform:scaleX(1.1); }
        .gv-hour-tip { position:absolute; bottom:105%; left:50%; transform:translateX(-50%) translateY(4px); background:#0f172a; color:white; padding:6px 10px; border-radius:8px; display:flex; flex-direction:column; align-items:center; gap:2px; opacity:0; pointer-events:none; transition:all 0.2s cubic-bezier(0.4, 0, 0.2, 1); box-shadow:0 10px 15px -3px rgba(0, 0, 0, 0.3); z-index:10; white-space:nowrap; }
        .gv-hour-tip::after { content:''; position:absolute; top:100%; left:50%; transform:translateX(-50%); border-left:5px solid transparent; border-right:5px solid transparent; border-top:5px solid #0f172a; }
        .gv-hour-bar:hover .gv-hour-tip { opacity:1; transform:translateX(-50%) translateY(0); }
        .tip-amt { font-size:10.5px; font-weight:800; font-family:'JetBrains Mono', monospace; }
        .tip-orders { font-size:8px; font-weight:700; color:#ffedd5; text-transform:uppercase; }
        .gv-hour-label { font-size:10px; font-weight:700; color:#475569; margin-top:10px; }
        .gv-hour-badge { font-size:9px; color:#475569; background:#f1f5f9; padding:2px 8px; border-radius:999px; font-weight:800; margin-top:6px; text-transform:uppercase; border:1px solid #e2e8f0; white-space:nowrap; }

        .gv-breakdown-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:16px; }
        .gv-bd-panel { background:#fafafa; border:1px solid #f1f5f9; border-radius:14px; padding:18px; display:flex; flex-direction:column; gap:8px; min-width:0; }

        @media(max-width: 640px) {
          .gv { padding:12px; gap:12px; }
          .gv-header { flex-direction:column; align-items:stretch; gap:8px; }
          .gv-title { text-align:center; }
          .gv-metric-tabs { justify-content:center; }
          .gv-breakdown-grid { grid-template-columns:1fr; }
        }
      `}</style>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   TABLE VIEW — server-side filter, sort, search, pagination
   ═══════════════════════════════════════════════════════════════════════════ */
const PAGE_SIZE = 50;
const FILTERS = [
  { key:'ALL',       label:'All' },
  { key:'ORDERED',   label:'Ordered' },
  { key:'BILLED',    label:'Billed' },
  { key:'COMPLETED', label:'Completed' },
  { key:'CANCELLED', label:'Cancelled' },
];
const COLUMNS = [
  { key: 'orderNo',   label: 'Document No' },
  { key: 'date',      label: 'Date' },
  { key: 'status',    label: 'Status' },
  { key: 'createdBy', label: 'Created By' },
  { key: 'updatedBy', label: 'Updated By' },
  { key: 'amount',    label: 'Total', right: true },
];

function TableView({ query, byStatus, refreshKey, themeColor, timezone, openingId, onViewOrder, currencySymbol = '' }) {
  const [filter,  setFilter]  = useState('ALL');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [page,    setPage]    = useState(0);
  const [search,  setSearch]  = useState('');
  const q = useDebounced(search.trim(), 350);

  /* any filter change returns to the first page */
  const filterSig = JSON.stringify([query, filter, sortKey, sortDir, q]);
  const prevSig = useRef(filterSig);
  const effectivePage = prevSig.current === filterSig ? page : 0;
  useEffect(() => { if (prevSig.current !== filterSig) { prevSig.current = filterSig; setPage(0); } }, [filterSig]);

  const listParams = useMemo(() => query ? ({
    ...query, status: filter, sort: sortKey, dir: sortDir, page: effectivePage, size: PAGE_SIZE, ...(q ? { q } : {}),
  }) : null, [query, filter, sortKey, sortDir, effectivePage, q]);

  const st = useCachedGet('/api/v1/orders/overview/orders', listParams, refreshKey);
  const data = st.data;
  const rows = data?.content || [];

  const toggleSort = key => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'orderNo' || key === 'createdBy' || key === 'updatedBy' ? 'asc' : 'desc'); }
  };

  const counts = byStatus || {};
  const total = data?.totalElements ?? 0;
  const from = total ? effectivePage * PAGE_SIZE + 1 : 0;
  const to = Math.min(total, (effectivePage + 1) * PAGE_SIZE);

  return (
    <div className="tv" style={{ '--theme-color': themeColor }}>
      <div className="tv-bar">
        {FILTERS.map(f => {
          const c = f.key === 'ALL'
            ? Object.values(counts).reduce((s, v) => s + v, 0)
            : counts[f.key] || 0;
          return (
            <button key={f.key} aria-pressed={filter===f.key}
              className={`tv-filter${filter===f.key?' tv-filter--on':''}`}
              onClick={()=>setFilter(f.key)}>
              {f.label}
              {byStatus && <span className="tv-cnt">{fmtN(c)}</span>}
            </button>
          );
        })}
        <label className="tv-search">
          <FaSearch aria-hidden="true" />
          <input type="search" placeholder="Search document no…" value={search}
            onChange={e => setSearch(e.target.value)} aria-label="Search by document number" />
        </label>
      </div>

      <div className="tv-wrap">
        <table className="tv-table">
          <thead>
            <tr>
              {COLUMNS.map(c => (
                <th key={c.key} className={`tv-th-sort${c.right ? ' tv-r' : ''}`}
                  aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button className="tv-sort-btn" onClick={() => toggleSort(c.key)}>
                    {c.label} {sortKey === c.key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!data && st.loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>{COLUMNS.map(c => <td key={c.key}><span className="tv-skel" /></td>)}</tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={COLUMNS.length}><NoData compact searched={!!q || filter !== 'ALL'} /></td></tr>
            ) : rows.map(o => {
              const sm = sMeta(o.status);
              const opening = openingId === o.id;
              return (
                <tr key={o.id} className={`tv-row${opening ? ' tv-row--opening' : ''}`} tabIndex={0}
                  onClick={() => onViewOrder(o)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewOrder(o); } }}>
                  <td>
                    <code className="tv-oid">{o.orderNo || `#${String(o.id || '').substring(0, 8).toUpperCase()}`}</code>
                    {opening && <FaSyncAlt className="spin tv-opening" aria-label="Opening" />}
                  </td>
                  <td><span className="tv-user">{formatTzDate(o.orderDate, timezone)}</span></td>
                  <td><span className="tv-badge" style={{color:sm.color,background:sm.bg}}>{sm.label}</span></td>
                  <td><span className="tv-user">{o.createdBy || '—'}</span></td>
                  <td><span className="tv-user">{o.updatedBy || '—'}</span></td>
                  <td className="tv-r tv-amount">{fmtC(o.totalAmount, currencySymbol)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="tv-foot">
        <span className="tv-result">
          {st.error ? <span className="tv-err">{st.error}</span>
            : total ? `Showing ${fmtN(from)}–${fmtN(to)} of ${fmtN(total)}` : ''}
        </span>
        <div className="tv-pager">
          <button onClick={() => setPage(effectivePage - 1)} disabled={!data?.hasPrevious || st.loading} aria-label="Previous page">
            <FaChevronLeft />
          </button>
          <span>Page {data?.totalPages ? effectivePage + 1 : 0} of {fmtN(data?.totalPages || 0)}</span>
          <button onClick={() => setPage(effectivePage + 1)} disabled={!data?.hasNext || st.loading} aria-label="Next page">
            <FaChevronRight />
          </button>
        </div>
      </div>

      <style jsx>{`
        .tv { display:flex; flex-direction:column; }
        .tv-bar { display:flex; align-items:center; gap:6px; padding:10px 18px; border-bottom:1px solid #f1f5f9; background:#fafafa; flex-wrap:wrap; }
        .tv-filter { display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:999px; border:1.5px solid #e2e8f0; background:white; color:#64748b; font-size:11px; font-weight:700; cursor:pointer; transition:all .18s; }
        .tv-filter:hover { border-color:var(--theme-color); color:var(--theme-color); }
        .tv-filter--on, .tv-filter--on:hover { background:var(--theme-color); border-color:var(--theme-color); color:white; }
        .tv-cnt { display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:16px; padding:0 4px; border-radius:999px; font-size:9px; font-weight:800; background:rgba(0,0,0,.08); }
        .tv-filter--on .tv-cnt { background:rgba(255,255,255,.3); }
        .tv-search { margin-left:auto; display:flex; align-items:center; gap:6px; background:white; border:1.5px solid #e2e8f0; border-radius:999px; padding:4px 12px; color:#94a3b8; font-size:11px; min-width:200px; }
        .tv-search:focus-within { border-color:var(--theme-color); }
        .tv-search input { border:none; outline:none; background:transparent; font-size:12px; color:#334155; width:100%; }

        .tv-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .tv-table { width:100%; border-collapse:collapse; min-width:640px; }
        .tv-table thead { background:linear-gradient(180deg,#f8fafc,#f1f5f9); position:sticky; top:0; z-index:1; }
        .tv-table thead tr { border-bottom:1.5px solid var(--theme-color); }
        .tv-table th { padding:0; text-align:left; white-space:nowrap; }
        .tv-sort-btn { width:100%; padding:8px 12px; background:none; border:none; cursor:pointer; font-size:9.5px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:.07em; text-align:inherit; }
        .tv-sort-btn:hover { color:var(--theme-color); }
        .tv-r { text-align:right !important; }
        .tv-row { cursor:pointer; transition:background .12s; border-left:3px solid transparent; }
        .tv-row:hover, .tv-row:focus-visible { background:#f8fafc; border-left-color:var(--theme-color); outline:none; }
        .tv-row--opening { background:#fff7ed; }
        .tv-table td { padding:8px 12px; border-bottom:1px solid #f1f5f9; font-size:11.5px; color:#475569; vertical-align:middle; white-space:nowrap; }
        .tv-oid { font-family:monospace; font-size:10px; font-weight:800; color:var(--theme-color); background:rgba(0,0,0,0.03); padding:2px 5px; border-radius:6px; border:1px solid rgba(0,0,0,0.08); }
        :global(.tv-opening) { margin-left:6px; font-size:10px; color:var(--theme-color); }
        .tv-badge { padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600; font-family:'Outfit',sans-serif; }
        .tv-amount { font-weight:800; color:#0f172a; font-family:monospace; font-variant-numeric:tabular-nums; }
        .tv-user { font-size:11.5px; color:#64748b; font-weight:600; }
        .tv-skel { display:block; height:12px; width:70%; border-radius:4px; background:linear-gradient(90deg,#f1f5f9,#e2e8f0,#f1f5f9); background-size:200% 100%; animation:shimmer 1.2s infinite; }
        @keyframes shimmer { from { background-position:200% 0; } to { background-position:-200% 0; } }

        .tv-foot { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 18px; border-top:1px solid #f1f5f9; background:#fafafa; flex-wrap:wrap; }
        .tv-result { font-size:10.5px; font-weight:700; color:#94a3b8; }
        .tv-err { color:#b91c1c; }
        .tv-pager { display:flex; align-items:center; gap:10px; font-size:11px; font-weight:700; color:#64748b; }
        .tv-pager button { width:30px; height:30px; display:inline-flex; align-items:center; justify-content:center; border-radius:8px; border:1.5px solid #e2e8f0; background:white; color:#475569; cursor:pointer; }
        .tv-pager button:hover:not(:disabled) { border-color:var(--theme-color); color:var(--theme-color); }
        .tv-pager button:disabled { opacity:.4; cursor:default; }

        @media(max-width: 640px) {
          .tv-bar { padding:8px 12px; gap:4px; }
          .tv-filter { padding:4px 8px; font-size:10px; }
          .tv-search { margin-left:0; width:100%; min-width:0; margin-top:4px; }
          .tv-foot { padding:8px 12px; }
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED — skeleton + empty state
   ═══════════════════════════════════════════════════════════════════════════ */
function Skeleton() {
  return (
    <div className="sk" aria-hidden="true">
      <div className="sk-grid"><div className="sk-box" /><div className="sk-box" /></div>
      <div className="sk-box sk-wide" />
      <style jsx>{`
        .sk { padding:24px; display:flex; flex-direction:column; gap:28px; }
        .sk-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:28px; }
        .sk-box { height:300px; border-radius:16px; background:linear-gradient(90deg,#f8fafc,#f1f5f9,#f8fafc); background-size:200% 100%; animation:shimmer 1.2s infinite; }
        .sk-wide { height:220px; }
        @keyframes shimmer { from { background-position:200% 0; } to { background-position:-200% 0; } }
        @media(max-width:768px) { .sk { padding:12px; gap:16px; } .sk-grid { grid-template-columns:1fr; } }
      `}</style>
    </div>
  );
}

function NoData({ compact = false, searched = false }) {
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'10px',padding: compact ? '40px 24px' : '80px 24px',color:'#94a3b8'}}>
      <FaReceipt style={{fontSize:'36px',color:'#e2e8f0'}}/>
      <span style={{fontSize:'14px',fontWeight:'800',color:'#334155'}}>{searched ? 'No matching records' : 'No orders in this period'}</span>
      <span style={{fontSize:'12px',fontWeight:'500'}}>{searched ? 'Try a different filter or search term' : 'Try a wider date range or another branch'}</span>
    </div>
  );
}
