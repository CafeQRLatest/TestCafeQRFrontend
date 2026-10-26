import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useCurrencyDecimals } from '../../hooks/useCurrencyConfig';
import DashboardLayout from '../../components/DashboardLayout';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import NiceSelect from '../../components/NiceSelect';
import CafeQRPopup from '../../components/CafeQRPopup';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { formatTzDate, getLocalISOString, getBusinessNow } from '../../utils/timezoneUtils';
import { useCurrencySymbol } from '../../hooks/useCurrencySymbol';
import { formatQty, uomPrecisionOf } from '../../components/CounterSale/domain/quantity';

const REASONS = ['Spillage', 'Burnt / Overcooked', 'Expired / Spoiled', 'Customer Return', 'Over-preparation', 'Theft / Loss', 'Other'];
// Six categorical hues (validated with scripts/validate_palette.js); "Other" is the neutral.
const REASON_COLOR = {
  'Spillage': '#0369a1',
  'Burnt / Overcooked': '#c2410c',
  'Expired / Spoiled': '#15803d',
  'Customer Return': '#7c3aed',
  'Over-preparation': '#be185d',
  'Theft / Loss': '#a16207',
  'Other': '#78716c',
};
const BAR_W = 620;
const BAR_H = 240;
const PAD_L = 56;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 28;
const PLOT_W = BAR_W - PAD_L - PAD_R;
const PLOT_H = BAR_H - PAD_T - PAD_B;
const PIE_R = 90;
const PIE_C = 100;
const CIRCLE_PATH = `M${PIE_C},${PIE_C - PIE_R} A${PIE_R},${PIE_R} 0 1 1 ${PIE_C},${PIE_C + PIE_R} A${PIE_R},${PIE_R} 0 1 1 ${PIE_C},${PIE_C - PIE_R} Z`;
const slicePath = (a0, a1) => {
  const p = a => [PIE_C + PIE_R * Math.cos(a), PIE_C + PIE_R * Math.sin(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${PIE_C},${PIE_C} L${x0},${y0} A${PIE_R},${PIE_R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1},${y1} Z`;
};
const RANGE_PRESETS = [
  { label: 'Today', days: 0 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];
const QTY_PRESETS = [1, 2, 5, 10];
const SYNC_MS = 60000;
const LOG_PAGE_SIZE = 50;

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isTyping = el => ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) || el?.isContentEditable;

export default function WasteManagement() {
  const currencyDecimals = useCurrencyDecimals();
  const fmt = (n) => Number(n || 0).toFixed(currencyDecimals);
  const { timezone, orgId } = useAuth();
  const sym = useCurrencySymbol();

  const bizNow = getBusinessNow(timezone);
  const todayStr = ymd(bizNow);
  const daysAgo = n => { const d = new Date(bizNow); d.setDate(d.getDate() - n); return ymd(d); };

  const emptyForm = useCallback(() => ({
    productName: '', productId: null, wasteReason: 'Spillage', quantity: '1', unitOfMeasure: 'units',
    unitCost: '0', notes: '', wasteCategoryId: '', wasteDate: getLocalISOString(timezone),
  }), [timezone]);

  const [tab, setTab] = useState('log');
  const [logs, setLogs] = useState([]);
  const [cats, setCats] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [trendLogs, setTrendLogs] = useState(null);
  const [hoverDay, setHoverDay] = useState(null);
  const [hoverSlice, setHoverSlice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editLog, setEditLog] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [productQuery, setProductQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [showProductList, setShowProductList] = useState(false);
  const [catForm, setCatForm] = useState({ name: '' });
  const [showCatForm, setShowCatForm] = useState(false);
  const dayStart = d => `${d}T00:00`;
  const dayEnd = d => `${d}T23:59`;
  const [dateRange, setDateRange] = useState({ start: dayStart(daysAgo(30)), end: dayEnd(todayStr) });
  const [search, setSearch] = useState('');
  const [filterReason, setFilterReason] = useState('ALL');
  const [logPage, setLogPage] = useState(0);
  const [logTotalPages, setLogTotalPages] = useState(0);
  const [logTotalElements, setLogTotalElements] = useState(0);
  const logPageRef = useRef(0);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3200); };

  const load = useCallback(async (pageNum = 0) => {
    setLoading(true);
    try {
      const [logsR, catsR] = await Promise.all([
        api.get(`/api/v1/waste/logs?page=${pageNum}&size=${LOG_PAGE_SIZE}`),
        api.get('/api/v1/waste/categories'),
      ]);
      const pageData = logsR.data.data;
      setLogs(pageData.content || []);
      setLogTotalPages(pageData.totalPages || 0);
      setLogTotalElements(pageData.totalElements || 0);
      setLogPage(pageNum);
      setCats(catsR.data.data || []);
    } catch { showToast('Failed to load', 'error'); }
    finally { setLoading(false); }
  }, [orgId]);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const range = `start=${dateRange.start}:00&end=${dateRange.end}:59`;
      const [a, l] = await Promise.all([
        api.get(`/api/v1/waste/analytics?${range}`),
        api.get(`/api/v1/waste/logs?${range}&page=0&size=1000`),
      ]);
      setAnalytics(a.data.data);
      setTrendLogs(l.data.data);
    } catch (e) { console.error(e); }
    finally { setAnalyticsLoading(false); }
  }, [dateRange, orgId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { logPageRef.current = logPage; }, [logPage]);
  useEffect(() => { if (tab === 'analytics') loadAnalytics(); }, [tab, loadAnalytics]);

  // Auto-refresh while the tab is visible and no popup is open
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible' && !showForm && !showCatForm) load(logPageRef.current);
    }, SYNC_MS);
    return () => clearInterval(id);
  }, [load, showForm, showCatForm]);

  // Same source as stock adjustments: active products, ingredients and non-ingredients together
  useEffect(() => {
    api.get('/api/v1/products')
      .then(r => setProducts((r.data.data || []).filter(p => p.isactive !== 'N' && p.isActive !== false)))
      .catch(() => setProducts([]));
  }, []);

  const productMatches = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!showProductList || q === '') return [];
    return products
      .filter(p => (p.name || '').toLowerCase().includes(q) || (p.productCode || '').toLowerCase().includes(q))
      .slice(0, 15);
  }, [products, productQuery, showProductList]);

  // Category that matches a reason (seeded categories share the reason names)
  const categoryFor = useCallback(
    reason => cats.find(c => c.name.toLowerCase() === (reason || '').toLowerCase())?.id || '',
    [cats]
  );

  const buildTemplate = useCallback(src => ({
    productName: src.productName || '',
    productId: src.productId || null,
    wasteReason: src.wasteReason || 'Spillage',
    quantity: String(src.quantity || 1),
    unitOfMeasure: src.unitOfMeasure || 'units',
    unitCost: String(src.unitCost || 0),
    notes: '',
    wasteCategoryId: categoryFor(src.wasteReason),
    wasteDate: getLocalISOString(timezone),
  }), [categoryFor, timezone]);

  const openForm = useCallback((log = null, template = null) => {
    setEditLog(log);
    if (log) {
      setForm({
        productName: log.productName || '', productId: log.productId || null,
        wasteReason: log.wasteReason || 'Spillage', quantity: String(log.quantity || 1),
        unitOfMeasure: log.unitOfMeasure || 'units', unitCost: String(log.unitCost || 0),
        notes: log.notes || '', wasteCategoryId: log.wasteCategoryId || '',
        wasteDate: log.wasteDate ? log.wasteDate.slice(0, 16) : getLocalISOString(timezone),
      });
    } else {
      setForm(template || emptyForm());
    }
    setProductQuery(log?.productName || template?.productName || '');
    setShowProductList(false);
    setShowForm(true);
  }, [emptyForm, timezone]);

  // N opens a new entry, Escape closes any open popup
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { setShowForm(false); setShowCatForm(false); return; }
      if (!isTyping(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        openForm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openForm]);

  const setReason = r => setForm(p => ({ ...p, wasteReason: r, wasteCategoryId: categoryFor(r) || p.wasteCategoryId }));

  const pickProduct = p => {
    setForm(f => ({
      ...f,
      productName: p.name,
      productId: p.id,
      unitCost: String(p.costPrice ?? 0),
      unitOfMeasure: p.uomName || f.unitOfMeasure,
    }));
    setProductQuery(p.name);
    setShowProductList(false);
  };

  const onItemChange = v => {
    setProductQuery(v);
    setShowProductList(true);
    setForm(p => ({ ...p, productName: v, productId: null }));
  };

  const saveLog = async () => {
    if (saving) return;
    if (!form.productName.trim()) { showToast('Item name is required', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        productId: form.productId || null,
        wasteCategoryId: form.wasteCategoryId || null,
        quantity: parseFloat(form.quantity) || 1,
        unitCost: parseFloat(form.unitCost) || 0,
      };
      if (editLog) await api.put(`/api/v1/waste/logs/${editLog.id}`, payload);
      else await api.post('/api/v1/waste/logs', payload);
      showToast(editLog ? 'Entry updated' : `Recorded. Loss ${sym}${fmt(payload.quantity * payload.unitCost)}`);
      setShowForm(false);
      load(logPage);
    } catch (err) {
      console.error('Waste save failed', err?.response?.data || err);
      showToast(`Save failed: ${err?.response?.data?.message || err?.message || 'unknown error'}`, 'error');
    }
    finally { setSaving(false); }
  };

  const deleteLog = async id => {
    if (!confirm('Delete this entry?')) return;
    try { await api.delete(`/api/v1/waste/logs/${id}`); showToast('Deleted'); load(logPage); }
    catch { showToast('Delete failed', 'error'); }
  };

  const saveCat = async () => {
    if (!catForm.name.trim()) return;
    try { await api.post('/api/v1/waste/categories', catForm); showToast('Category added'); setShowCatForm(false); setCatForm({ name: '' }); load(); }
    catch { showToast('Failed', 'error'); }
  };

  const deleteCat = async id => {
    try { await api.delete(`/api/v1/waste/categories/${id}`); showToast('Deleted'); load(); }
    catch { showToast('Failed', 'error'); }
  };

  /* ── Derived insights (computed client-side from the loaded entries) ── */
  const filtered = logs.filter(l =>
    (!search || (l.productName || '').toLowerCase().includes(search.toLowerCase())) &&
    (filterReason === 'ALL' || l.wasteReason === filterReason)
  );

  const pageLoss = logs.reduce((s, l) => s + Number(l.totalCost || 0), 0);
  const avgLoss = logs.length ? pageLoss / logs.length : 0;

  const byReason = useMemo(() => {
    const m = {};
    logs.forEach(l => { const k = l.wasteReason || 'Other'; m[k] = (m[k] || 0) + Number(l.totalCost || 0); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [logs]);
  const topReason = byReason[0]?.[0] ?? '—';

  const costliest = useMemo(
    () => logs.reduce((best, l) => (Number(l.totalCost || 0) > Number(best?.totalCost || 0) ? l : best), null),
    [logs]
  );

  const dayBars = useMemo(() => {
    const keys = [];
    for (let i = 13; i >= 0; i--) keys.push(daysAgo(i));
    const sums = {};
    logs.forEach(l => { const k = (l.wasteDate || '').slice(0, 10); sums[k] = (sums[k] || 0) + Number(l.totalCost || 0); });
    return keys.map(k => ({ key: k, value: sums[k] || 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, todayStr]);
  const barMax = Math.max(...dayBars.map(d => d.value), 1);
  const loss14 = dayBars.reduce((s, d) => s + d.value, 0);
  const recent14 = logs.filter(l => (l.wasteDate || '').slice(0, 10) >= dayBars[0].key).length;

  const insights = useMemo(() => {
    const out = [];
    if (byReason.length && pageLoss > 0 && byReason[0][1] / pageLoss >= 0.4) {
      const pct = Math.round((byReason[0][1] / pageLoss) * 100);
      out.push({ tone: 'warn', text: `${byReason[0][0]} accounts for ${pct}% of recent loss. Review its root cause first.` });
    }
    if (costliest && Number(costliest.totalCost) > 0) {
      out.push({ tone: 'info', text: `Costliest recent item: ${costliest.productName || 'Unnamed'} (${sym}${fmt(costliest.totalCost)}).` });
    }
    const today = dayBars[dayBars.length - 1]?.value || 0;
    const prior = dayBars.slice(0, -1).reduce((s, d) => s + d.value, 0) / 13;
    if (prior > 0 && today > prior * 1.5) {
      out.push({ tone: 'warn', text: `Today is ${Math.round((today / prior - 1) * 100)}% above the 13-day average.` });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byReason, pageLoss, costliest, dayBars, sym, currencyDecimals]);

  const frequent = useMemo(() => {
    const m = {};
    logs.forEach(l => {
      if (!l.productName) return;
      const k = l.productName.toLowerCase();
      if (!m[k]) m[k] = { last: l, count: 0 };
      m[k].count++;
    });
    return Object.values(m).sort((a, b) => b.count - a.count).slice(0, 6).map(x => x.last);
  }, [logs]);

  const repeatLast = () => { if (logs[0]) openForm(null, buildTemplate(logs[0])); };
  const quickLog = src => openForm(null, buildTemplate(src));

  const estimatedLoss = fmt((parseFloat(form.unitCost) || 0) * (parseFloat(form.quantity) || 0));
  const trend = useMemo(() => {
    const keys = [];
    const d = new Date(`${dateRange.start.slice(0, 10)}T00:00`);
    const end = new Date(`${dateRange.end.slice(0, 10)}T00:00`);
    while (d <= end && keys.length < 366) { keys.push(ymd(d)); d.setDate(d.getDate() + 1); }
    const sums = {};
    (trendLogs?.content || []).forEach(l => {
      const k = (l.wasteDate || '').slice(0, 10);
      sums[k] = (sums[k] || 0) + Number(l.totalCost || 0);
    });
    return keys.map(k => ({ key: k, value: sums[k] || 0 }));
  }, [trendLogs, dateRange]);
  const trendTotal = trend.reduce((s, t) => s + t.value, 0);
  const trendMax = Math.max(...trend.map(t => t.value), 1);
  const trendSlot = PLOT_W / Math.max(trend.length, 1);
  const trendTruncated = (trendLogs?.totalElements || 0) > (trendLogs?.content?.length || 0);
  const pieTotal = (analytics?.breakdown || []).reduce((s, b) => s + Number(b.totalCost || 0), 0);

  const CSS = `
    * { box-sizing: border-box; }
    .wm { font-family: 'Inter', sans-serif; color: #1e293b; padding: 8px 4px 40px; }
    .wm-dim { color: #64748b; }
    .wm-num { font-variant-numeric: tabular-nums; }

    /* Header */
    .wm-hero { display:flex; justify-content:space-between; align-items:center; gap:14px; flex-wrap:wrap; margin-bottom:20px; }
    .wm-h1 { font-size:20px; font-weight:800; color:#0f172a; letter-spacing:-.01em; }
    .wm-h2 { font-size:12px; color:#64748b; margin-top:3px; display:flex; align-items:center; gap:8px; }
    .wm-sync { border:none; background:none; color:#FF7A00; cursor:pointer; font:600 12px 'Inter',sans-serif; padding:0; }
    .wm-sync:hover { color:#ea580c; text-decoration:underline; }
    .wm-hero-actions { display:flex; gap:10px; flex-wrap:wrap; }
    .wm-btn { display:inline-flex; align-items:center; gap:8px; border-radius:12px; font:700 13px 'Inter',sans-serif; cursor:pointer; transition:.15s; padding:10px 18px; }
    .wm-btn-primary { border:none; color:#fff; background:#FF7A00; box-shadow:0 4px 12px rgba(255,122,0,.2); }
    .wm-btn-primary:hover { background:#ea580c; transform:translateY(-1px); }
    .wm-btn-secondary { border:1px solid #e2e8f0; color:#334155; background:#fff; }
    .wm-btn-secondary:hover:not(:disabled) { background:#f8fafc; border-color:#cbd5e1; }
    .wm-btn-secondary:disabled { opacity:.45; cursor:not-allowed; }

    /* KPIs */
    .wm-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin-bottom:18px; }
    .wm-kpi { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:16px 18px; display:flex; flex-direction:column; min-height:124px; box-shadow:0 1px 2px rgba(15,23,42,.04); }
    .wm-kpi-lbl { font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.06em; margin-bottom:8px; }
    .wm-kpi-v { font-size:24px; font-weight:800; color:#0f172a; line-height:1.15; }
    .wm-kpi-v.red { color:#ea580c; }
    .wm-kpi-reason { font-size:18px; display:flex; align-items:center; gap:8px; }
    .wm-kpi-sub { font-size:12px; color:#94a3b8; margin-top:auto; padding-top:8px; }
    .wm-spark { display:flex; align-items:flex-end; gap:3px; height:34px; margin-top:auto; padding-top:10px; }
    .wm-spark span { flex:1; border-radius:3px 3px 0 0; background:#fed7aa; min-height:3px; }
    .wm-spark span.today { background:#FF7A00; }
    @media (max-width: 900px) {
      .wm-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); }
    }

    /* Insights + quick log */
    .wm-insights { display:flex; flex-direction:column; gap:8px; margin-bottom:14px; }
    .wm-ins { padding:10px 14px; border-radius:10px; font-size:13px; font-weight:600; border:1px solid #e2e8f0; background:#fff; color:#334155; }
    .wm-ins.warn { border-color:#fed7aa; background:#fff7ed; color:#9a3412; }
    .wm-ins.info { border-color:#bae6fd; background:#f0f9ff; color:#0c4a6e; }
    .wm-ins.ok { border-color:#bbf7d0; background:#f0fdf4; color:#166534; }
    .wm-quick { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:20px; }
    .wm-quick-lbl { font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.06em; margin-right:4px; }
    .wm-chip { padding:6px 12px; border-radius:999px; border:1px solid #e2e8f0; background:#fff; color:#334155; font:600 12px 'Inter',sans-serif; cursor:pointer; transition:.15s; }
    .wm-chip:hover { border-color:#FF7A00; color:#ea580c; }
    .wm-chip.on { border-color:#FF7A00; background:#fff7ed; color:#ea580c; }

    /* Tabs */
    .wm-tabs { display:inline-flex; gap:4px; background:#f1f5f9; padding:4px; border-radius:12px; margin-bottom:18px; }
    .wm-tab { padding:8px 16px; border-radius:9px; border:none; background:transparent; font:600 13px 'Inter',sans-serif; color:#64748b; cursor:pointer; transition:.15s; }
    .wm-tab:hover { color:#0f172a; }
    .wm-tab.on { background:#fff; color:#ea580c; box-shadow:0 1px 3px rgba(15,23,42,.08); }

    /* Toolbar, inputs, selects */
    .wm-toolbar { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; align-items:center; }
    .wm-input, .wm-select, .wm-textarea {
      width:100%; padding:10px 12px; border-radius:10px; border:1px solid #e2e8f0; background:#fff;
      font:500 13px 'Inter',sans-serif; color:#0f172a; outline:none; transition:.15s; }
    .wm-input:focus, .wm-select:focus, .wm-textarea:focus { border-color:#FF7A00; box-shadow:0 0 0 3px rgba(255,122,0,.15); }
    .wm-search { max-width:280px; flex:1; min-width:180px; }
    .wm-select { min-width:180px; width:auto; cursor:pointer; }
    .wm-label { display:block; font-size:12px; font-weight:700; color:#334155; margin-bottom:6px; }
    .wm-label-note { font-weight:500; color:#94a3b8; margin-left:6px; }
    .wm-field { display:flex; flex-direction:column; }
    .wm-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .wm-form { display:flex; flex-direction:column; gap:16px; }
    .wm-suggest { margin-top:6px; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; background:#fff; box-shadow:0 8px 20px -10px rgba(15,23,42,.2); }
    .wm-suggest div { padding:9px 12px; font-size:13px; font-weight:600; cursor:pointer; display:flex; justify-content:space-between; gap:10px; color:#0f172a; }
    .wm-suggest div:hover { background:#fff7ed; color:#ea580c; }
    .wm-suggest small { color:#64748b; font-weight:600; }
    .wm-hint { font-size:11px; color:#94a3b8; margin-top:5px; }

    /* Reason + quantity helpers */
    .wm-reasons { display:flex; flex-wrap:wrap; gap:6px; }
    .wm-reason { padding:7px 12px; border-radius:999px; border:1px solid #e2e8f0; background:#fff; font:600 12px 'Inter',sans-serif; color:#475569; cursor:pointer; transition:.15s; }
    .wm-reason:hover { border-color:#FF7A00; color:#ea580c; }
    .wm-reason.on { color:#fff; border-color:#FF7A00; background:#FF7A00; }
    .wm-readonly { padding:10px 12px; border-radius:10px; border:1px solid #e2e8f0; background:#f8fafc; font:600 13px 'Inter',sans-serif; color:#475569; }
    .wm-tag { margin-left:8px; font-size:10px; font-weight:700; color:#ea580c; background:#fff7ed; border-radius:999px; padding:1px 7px; text-transform:uppercase; letter-spacing:.04em; }
    .wm-presets { display:flex; gap:6px; margin-top:6px; }
    .wm-presets button { padding:4px 10px; border-radius:8px; border:1px solid #e2e8f0; background:#fff; color:#475569; font:700 12px 'Inter',sans-serif; cursor:pointer; }
    .wm-presets button:hover { border-color:#FF7A00; color:#ea580c; }
    .wm-loss { padding:10px 12px; border-radius:10px; background:#fff7ed; border:1px solid #fed7aa; color:#ea580c; font:800 15px 'Inter',sans-serif; }

    /* Table: same look as the system's erp-table */
    .wm .erp-table-wrapper { width:100%; overflow-x:auto; background:#fff; border:1px solid #e2e8f0; border-radius:14px; }
    .wm .erp-table { width:100%; border-collapse:collapse; }
    .wm .erp-table th { text-align:left; padding:14px 16px; font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:.05em; border-bottom:2px solid #FF7A00; background:#fff; white-space:nowrap; }
    .wm .erp-table td { padding:12px 16px; border-bottom:1px solid #f1f5f9; font-size:13px; color:#475569; vertical-align:middle; }
    .wm .erp-table tbody tr:hover td { background:#fffbf5; }
    .wm .erp-table .text-right { text-align:right; }
    .wm .name-text { font-weight:600; color:#0f172a; }
    .wm-loss-cell { color:#ea580c; font-weight:700; }
    .wm-table-empty { text-align:center; padding:32px 16px !important; color:#64748b; font-weight:600; }
    .wm .desk-only { display:block; }
    .wm .mobile-only { display:none; }
    .wm .mobile-card { display:flex; align-items:center; justify-content:space-between; gap:12px; background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:12px 14px; margin-bottom:8px; cursor:pointer; }
    .wm .card-info { display:flex; flex-direction:column; gap:3px; min-width:0; }
    .wm .card-name { font-size:14px; font-weight:700; color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .wm .card-sub { font-size:12px; color:#64748b; }
    .wm-pill { display:inline-flex; padding:2px 9px; border-radius:999px; font-size:11px; font-weight:700; background:color-mix(in srgb, var(--rc) 12%, #fff); color:var(--rc); }
    .wm-link { border:none; background:none; font:700 12px 'Inter',sans-serif; cursor:pointer; padding:4px 6px; border-radius:6px; }
    .wm-link.ed { color:#ea580c; }
    .wm-link.ed:hover { background:#fff7ed; }
    .wm-link.dl { color:#dc2626; }
    .wm-link.dl:hover { background:#fef2f2; }
    @media (max-width: 768px) {
      .wm .desk-only { display:none; }
      .wm .mobile-only { display:block; }
    }
    .wm-pager { display:flex; align-items:center; justify-content:center; gap:14px; padding:18px 0 4px; font-size:12px; color:#64748b; font-weight:600; }

    /* Analytics */
    .wm-range { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .wm-date { border:1px solid #e2e8f0; border-radius:10px; padding:7px 10px; font:600 12px 'Inter',sans-serif; color:#0f172a; background:#fff; outline:none; }
    .wm-date:focus { border-color:#FF7A00; }
    .wm-analytics-g { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; }
    .wm-a-card { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:20px; }
    .wm-a-card.hero { border-top:3px solid #FF7A00; }
    .wm-a-title { font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.06em; margin-bottom:12px; }
    .wm-big { font-size:32px; font-weight:800; color:#ea580c; }
    .wm-stack { display:flex; height:10px; border-radius:99px; overflow:hidden; background:#f1f5f9; margin:6px 0 16px; }
    .wm-stack span { height:100%; }
    .wm-bar-row { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    .wm-bar-lbl { font-size:12px; font-weight:600; color:#334155; width:150px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
    .wm-bar-trk { flex:1; height:6px; background:#f1f5f9; border-radius:99px; overflow:hidden; }
    .wm-bar-fill { height:100%; border-radius:99px; }
    .wm-bar-v { font-size:12px; font-weight:700; color:#ea580c; min-width:70px; text-align:right; }
    .wm-bar-n { font-size:11px; color:#94a3b8; min-width:30px; text-align:right; font-weight:600; }

    /* Analytics charts (no boxes; charts sit on the page) */
    .wm-range { gap:10px; margin-bottom:22px; }
    .wm-seg { display:inline-flex; background:#f1f5f9; border-radius:10px; padding:3px; gap:2px; }
    .wm-seg button { border:none; background:transparent; padding:6px 12px; border-radius:8px; font:600 12px 'Inter',sans-serif; color:#64748b; cursor:pointer; transition:.15s; }
    .wm-seg button:hover { color:#0f172a; }
    .wm-seg button.on { background:#fff; color:#ea580c; box-shadow:0 1px 2px rgba(15,23,42,.08); }
    .wm-range-field { width:230px; }
    .wm-range-sep { font-size:12px; color:#94a3b8; font-weight:600; }
    .wm-stats { display:flex; gap:48px; flex-wrap:wrap; margin-bottom:26px; }
    .wm-stat-item { display:flex; flex-direction:column; gap:2px; }
    .wm-stat-v { font-size:30px; font-weight:800; color:#0f172a; line-height:1.15; }
    .wm-stat-item:first-child .wm-stat-v { color:#ea580c; }
    .wm-stat-sub { font-size:12px; color:#94a3b8; }
    .wm-chart-empty { height:240px; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:13px; font-weight:600; border:1px dashed #fed7aa; border-radius:12px; background:#fffaf5; }
    .wm-charts { display:grid; grid-template-columns:minmax(0,1.6fr) minmax(0,1fr); gap:28px; align-items:start; }
    .wm-chart-head { display:flex; justify-content:space-between; align-items:baseline; gap:12px; margin-bottom:8px; min-height:18px; }
    .wm-chart-title { font-size:12px; font-weight:700; color:#334155; text-transform:uppercase; letter-spacing:.06em; }
    .wm-chart-readout { font-size:12px; font-weight:700; color:#ea580c; }
    .wm-svg { width:100%; height:auto; display:block; }
    .wm-grid { stroke:#e2e8f0; stroke-width:1; }
    .wm-axis { font-size:10px; fill:#64748b; }
    .wm-pie { display:flex; gap:18px; align-items:center; flex-wrap:wrap; }
    .wm-svg-pie { width:180px; height:180px; flex-shrink:0; }
    .wm-legend { list-style:none; margin:0; padding:0; flex:1; min-width:160px; }
    .wm-legend li { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:8px; font-size:13px; color:#334155; }
    .wm-legend li.on { background:#fff7ed; }
    .wm-legend-name { flex:1; }
    .wm-swatch { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:8px; flex-shrink:0; vertical-align:middle; }
    @media (max-width: 768px) {
      .wm-charts { grid-template-columns:1fr; }
    }

    /* Categories */
    .wm-note { font-size:12px; color:#64748b; margin-bottom:14px; }
    .wm-cats-g { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:10px; }
    .wm-cat-c { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; display:flex; align-items:center; justify-content:space-between; }
    .wm-cat-nm { font-size:13px; font-weight:700; color:#0f172a; }

    .wm-toast { position:fixed; bottom:22px; left:50%; transform:translateX(-50%); padding:11px 18px; border-radius:10px; background:#0f172a; color:#fff; font:600 13px 'Inter',sans-serif; z-index:99999; white-space:nowrap; }
    .wm-toast.error { background:#dc2626; }

    @media (max-width: 640px) {
      .wm-grid2 { grid-template-columns:1fr; }
      .wm-bar-lbl { width:110px; }
    }
  `;

  return (
    <DashboardLayout title="Waste Management" subtitle="Track, analyse and reduce kitchen waste">
      <style jsx global>{CSS}</style>
      <div className="wm">

        {/* Header */}
        <header className="wm-hero">
          <div className="wm-hero-actions">
            <button className="wm-btn wm-btn-secondary" onClick={repeatLast} disabled={!logs.length}>Repeat last</button>
            <button className="wm-btn wm-btn-primary" onClick={() => openForm()}>Log waste</button>
          </div>
        </header>

        {/* KPIs */}
        <section className="wm-kpis">
          <div className="wm-kpi">
            <div className="wm-kpi-lbl">Total entries</div>
            <div className="wm-kpi-v wm-num">{logTotalElements || logs.length}</div>
            <div className="wm-kpi-sub">{recent14} in the last 14 days</div>
          </div>
          <div className="wm-kpi">
            <div className="wm-kpi-lbl">Loss, last 14 days</div>
            <div className="wm-kpi-v red wm-num">{sym}{fmt(loss14)}</div>
            {loss14 > 0 ? (
              <div className="wm-spark" aria-label="Daily loss, last 14 days">
                {dayBars.map((d, i) => (
                  <span key={d.key} title={`${d.key.slice(8)}/${d.key.slice(5, 7)}: ${sym}${fmt(d.value)}`}
                    className={i === dayBars.length - 1 ? 'today' : ''}
                    style={{ height: `${Math.max(8, (d.value / barMax) * 100)}%` }} />
                ))}
              </div>
            ) : <div className="wm-kpi-sub">No loss recorded</div>}
          </div>
          <div className="wm-kpi">
            <div className="wm-kpi-lbl">Top reason</div>
            <div className="wm-kpi-v wm-kpi-reason">
              {topReason !== '—' && <span className="wm-swatch" style={{ background: REASON_COLOR[topReason] || REASON_COLOR.Other }} />}
              {topReason}
            </div>
            <div className="wm-kpi-sub">{pageLoss > 0 ? `${Math.round((byReason[0][1] / pageLoss) * 100)}% of loaded loss` : 'No entries yet'}</div>
          </div>
          <div className="wm-kpi">
            <div className="wm-kpi-lbl">Average per entry</div>
            <div className="wm-kpi-v wm-num">{sym}{fmt(avgLoss)}</div>
            <div className="wm-kpi-sub">Across loaded entries</div>
          </div>
        </section>

        {/* Insights */}
        {insights.length > 0 && (
          <section className="wm-insights">
            {insights.map((i, idx) => (
              <div key={idx} className={`wm-ins ${i.tone}`}>{i.text}</div>
            ))}
          </section>
        )}

        {/* Quick log from frequent items */}
        {frequent.length > 0 && (
          <section className="wm-quick">
            <span className="wm-quick-lbl">Quick log</span>
            {frequent.map(f => (
              <button key={f.id} className="wm-chip" onClick={() => quickLog(f)}>{f.productName}</button>
            ))}
          </section>
        )}

        {/* Tabs */}
        <div className="wm-tabs">
          {[['log', 'Stream'], ['analytics', 'Analytics'], ['categories', 'Categories']].map(([k, l]) => (
            <button key={k} className={`wm-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {/* ── STREAM TAB ─────────────────── */}
        {tab === 'log' && (<>
          <div className="wm-toolbar">
            <input className="wm-input wm-search" placeholder="Search item" value={search} onChange={e => setSearch(e.target.value)} />
            <div style={{ minWidth: 200 }}>
              <NiceSelect value={filterReason} onChange={setFilterReason}
                options={[{ value: 'ALL', label: 'All reasons' }, ...REASONS.map(r => ({ value: r, label: r }))]} />
            </div>
          </div>

          <div className="erp-table-wrapper desk-only">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Item</th><th>Reason</th><th>Quantity</th><th>Unit cost</th>
                  <th>Total loss</th><th>Date</th><th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && !logs.length && <tr><td colSpan={7} className="wm-table-empty">Loading waste data</td></tr>}
                {!loading && filtered.length === 0 && <tr><td colSpan={7} className="wm-table-empty">No waste records yet. Use Log waste to add the first entry.</td></tr>}
                {filtered.map(l => {
                  const color = REASON_COLOR[l.wasteReason] || REASON_COLOR.Other;
                  return (
                    <tr key={l.id}>
                      <td className="name-text">{l.productName || 'Unnamed item'}</td>
                      <td><span className="wm-pill" style={{ '--rc': color }}>{l.wasteReason}</span></td>
                      <td className="wm-num">{formatQty(l.quantity, uomPrecisionOf(l))} {l.unitOfMeasure}</td>
                      <td className="wm-num">{sym}{fmt(l.unitCost)}</td>
                      <td className="wm-num wm-loss-cell">{sym}{fmt(l.totalCost)}</td>
                      <td>{formatTzDate(l.wasteDate, timezone, { format: 'date' })}</td>
                      <td className="text-right">
                        <button className="wm-link ed" onClick={() => openForm(l)}>Edit</button>
                        <button className="wm-link dl" onClick={() => deleteLog(l.id)}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="erp-mobile-list mobile-only">
            {filtered.map(l => (
              <div key={l.id} className="mobile-card" onClick={() => openForm(l)}>
                <div className="card-info">
                  <span className="card-name">{l.productName || 'Unnamed item'}</span>
                  <span className="card-sub">{l.wasteReason} • {formatQty(l.quantity, uomPrecisionOf(l))} {l.unitOfMeasure} • {formatTzDate(l.wasteDate, timezone, { format: 'date' })}</span>
                </div>
                <div className="wm-loss-cell wm-num">{sym}{fmt(l.totalCost)}</div>
              </div>
            ))}
            {!loading && filtered.length === 0 && <div className="wm-table-empty">No waste records yet.</div>}
          </div>

          {logTotalPages > 1 && (
            <div className="wm-pager">
              <button className="wm-btn wm-btn-secondary" onClick={() => load(logPage - 1)} disabled={logPage === 0}>Previous</button>
              <span className="wm-num">Page {logPage + 1} of {logTotalPages} · {logTotalElements} total</span>
              <button className="wm-btn wm-btn-secondary" onClick={() => load(logPage + 1)} disabled={logPage >= logTotalPages - 1}>Next</button>
            </div>
          )}
        </>)}

        {/* ── ANALYTICS TAB ─────────────── */}
        {tab === 'analytics' && (<>
          <div className="wm-toolbar wm-range">
            <div className="wm-seg">
              {RANGE_PRESETS.map(p => {
                const on = dateRange.start.slice(0, 10) === daysAgo(p.days) && dateRange.end.slice(0, 10) === todayStr;
                return (
                  <button key={p.label} type="button" className={on ? 'on' : ''}
                    onClick={() => setDateRange({ start: dayStart(daysAgo(p.days)), end: dayEnd(todayStr) })}>{p.label}</button>
                );
              })}
            </div>
            <div className="wm-range-field">
              <PremiumDateTimePicker value={dateRange.start} onChange={v => setDateRange(p => ({ ...p, start: v }))} />
            </div>
            <span className="wm-range-sep">to</span>
            <div className="wm-range-field">
              <PremiumDateTimePicker value={dateRange.end} onChange={v => setDateRange(p => ({ ...p, end: v }))} />
            </div>
            {analyticsLoading && <span className="wm-dim" style={{ fontSize: 12 }}>Updating…</span>}
          </div>

          {analytics ? (<>
            <div className="wm-stats">
              <div className="wm-stat-item">
                <div className="wm-kpi-lbl">Total waste cost</div>
                <div className="wm-stat-v wm-num">{sym}{fmt(analytics.totalWasteCost)}</div>
                <div className="wm-stat-sub">{dateRange.start.slice(0, 10)} to {dateRange.end.slice(0, 10)}</div>
              </div>
              <div className="wm-stat-item">
                <div className="wm-kpi-lbl">Entries</div>
                <div className="wm-stat-v wm-num">{trendLogs?.totalElements || 0}</div>
                <div className="wm-stat-sub">In this range</div>
              </div>
              <div className="wm-stat-item">
                <div className="wm-kpi-lbl">Average per day</div>
                <div className="wm-stat-v wm-num">{sym}{fmt(trend.length ? trendTotal / trend.length : 0)}</div>
                <div className="wm-stat-sub">Over {trend.length} days</div>
              </div>
            </div>

            <div className="wm-charts">
              <div className="wm-chart">
                <div className="wm-chart-head">
                  <span className="wm-chart-title">Daily loss</span>
                  <span className="wm-chart-readout wm-num">
                    {hoverDay != null && trend[hoverDay] ? `${trend[hoverDay].key.slice(8)}/${trend[hoverDay].key.slice(5, 7)}: ${sym}${fmt(trend[hoverDay].value)}` : ''}
                  </span>
                </div>
                {trendTotal > 0 ? (
                  <svg viewBox={`0 0 ${BAR_W} ${BAR_H}`} className="wm-svg" role="img" aria-label="Daily waste cost" onMouseLeave={() => setHoverDay(null)}>
                    {[0, 0.5, 1].map(t => {
                      const y = PAD_T + PLOT_H - t * PLOT_H;
                      return (
                        <g key={t}>
                          <line x1={PAD_L} x2={BAR_W - PAD_R} y1={y} y2={y} className="wm-grid" />
                          <text x={PAD_L - 8} y={y + 4} textAnchor="end" className="wm-axis">{fmt(t * trendMax)}</text>
                        </g>
                      );
                    })}
                    {trend.map((t, i) => {
                      const bw = Math.max(2, trendSlot * 0.7);
                      const x = PAD_L + i * trendSlot + (trendSlot - bw) / 2;
                      const h = (t.value / trendMax) * PLOT_H;
                      return (
                        <g key={t.key} onMouseEnter={() => setHoverDay(i)}>
                          <rect x={x} y={PAD_T + PLOT_H - h} width={bw} height={h} rx={3} fill="#FF7A00"
                            opacity={hoverDay == null || hoverDay === i ? 1 : 0.35} />
                          <rect x={PAD_L + i * trendSlot} y={PAD_T} width={trendSlot} height={PLOT_H} fill="transparent" />
                          <title>{`${t.key}: ${sym}${fmt(t.value)}`}</title>
                        </g>
                      );
                    })}
                    {trend.map((t, i) => (i % Math.ceil(trend.length / 8) === 0) && (
                      <text key={`x${t.key}`} x={PAD_L + i * trendSlot + trendSlot / 2} y={BAR_H - 8} textAnchor="middle" className="wm-axis">
                        {t.key.slice(8)}/{t.key.slice(5, 7)}
                      </text>
                    ))}
                  </svg>
                ) : <div className="wm-chart-empty">No waste logged in this range</div>}
                {trendTruncated && <div className="wm-hint">Showing the first 1,000 entries in this range.</div>}
              </div>

              <div className="wm-chart">
                <div className="wm-chart-head"><span className="wm-chart-title">Share by reason</span></div>
                {pieTotal > 0 ? (
                  <div className="wm-pie">
                    <svg viewBox="0 0 200 200" className="wm-svg-pie" role="img" aria-label="Waste cost share by reason">
                      {(() => {
                        let a = -Math.PI / 2;
                        return analytics.breakdown.map((b, i) => {
                          const v = Number(b.totalCost || 0);
                          if (v <= 0) return null;
                          const sweep = (v / pieTotal) * 2 * Math.PI;
                          const a0 = a;
                          a += sweep;
                          return (
                            <path key={b.reason} d={sweep >= 2 * Math.PI - 1e-6 ? CIRCLE_PATH : slicePath(a0, a0 + sweep)}
                              fill={REASON_COLOR[b.reason] || REASON_COLOR.Other} stroke="#fff" strokeWidth={2}
                              opacity={hoverSlice == null || hoverSlice === i ? 1 : 0.35}
                              onMouseEnter={() => setHoverSlice(i)} onMouseLeave={() => setHoverSlice(null)}>
                              <title>{`${b.reason}: ${sym}${fmt(v)} (${Math.round((v / pieTotal) * 100)}%)`}</title>
                            </path>
                          );
                        });
                      })()}
                    </svg>
                    <ul className="wm-legend">
                      {analytics.breakdown.map((b, i) => (
                        <li key={b.reason} className={hoverSlice === i ? 'on' : ''}
                          onMouseEnter={() => setHoverSlice(i)} onMouseLeave={() => setHoverSlice(null)}>
                          <span className="wm-swatch" style={{ background: REASON_COLOR[b.reason] || REASON_COLOR.Other }} />
                          <span className="wm-legend-name">{b.reason}</span>
                          <span className="wm-num">{Math.round((Number(b.totalCost || 0) / pieTotal) * 100)}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : <div className="wm-chart-empty">No waste logged in this range</div>}
              </div>
            </div>

            <div className="erp-table-wrapper" style={{ marginTop: 18 }}>
              <table className="erp-table">
                <thead>
                  <tr><th>Reason</th><th>Entries</th><th>Share</th><th className="text-right">Total loss</th></tr>
                </thead>
                <tbody>
                  {analytics.breakdown?.length ? analytics.breakdown.map(b => (
                    <tr key={b.reason}>
                      <td className="name-text"><span className="wm-swatch" style={{ background: REASON_COLOR[b.reason] || REASON_COLOR.Other }} />{b.reason}</td>
                      <td className="wm-num">{b.count}</td>
                      <td className="wm-num">{pieTotal > 0 ? Math.round((Number(b.totalCost || 0) / pieTotal) * 100) : 0}%</td>
                      <td className="text-right wm-num">{sym}{fmt(b.totalCost)}</td>
                    </tr>
                  )) : <tr><td colSpan={4} className="wm-table-empty">No data for this period</td></tr>}
                </tbody>
              </table>
            </div>
          </>) : <div className="wm-table-empty">Loading analytics…</div>}
        </>)}

        {/* ── CATEGORIES TAB ────────────── */}
        {tab === 'categories' && (<>
          <div className="wm-toolbar">
            <button className="wm-btn wm-btn-primary" onClick={() => setShowCatForm(true)}>New category</button>
          </div>
          <div className="wm-note">Categories named after a waste reason are selected automatically when that reason is picked.</div>
          <div className="wm-cats-g">
            {cats.map(c => (
              <div key={c.id} className="wm-cat-c">
                <div className="wm-cat-nm">{c.name}</div>
                <button className="wm-link dl" onClick={() => deleteCat(c.id)}>Remove</button>
              </div>
            ))}
            {!cats.length && <div className="wm-dim" style={{ fontSize: 13 }}>No categories yet</div>}
          </div>
        </>)}

        {/* ── LOG FORM POPUP ────────────── */}
        {showForm && (
          <CafeQRPopup
            title={editLog ? 'Edit waste entry' : 'Log waste'}
            onClose={() => setShowForm(false)}
            onCancel={() => setShowForm(false)}
            onSave={saveLog}
            isSaving={saving}
            saveLabel={editLog ? 'Update' : 'Record'}
            maxWidth="520px"
          >
            <div className="wm-form" onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveLog(); }}>
              <div className="wm-field">
                <label className="wm-label">Item</label>
                <input className="wm-input" placeholder="Search by name or product code" autoFocus
                  value={productQuery}
                  onChange={e => onItemChange(e.target.value)}
                  />
                {showProductList && productMatches.length > 0 && (
                  <div className="wm-suggest">
                    {productMatches.map(p => (
                      <div key={p.id} onMouseDown={e => e.preventDefault()} onClick={() => pickProduct(p)}>
                        <span>{p.name}<span className="wm-tag">{p.isIngredient ? 'Ingredient' : 'Product'}</span></span>
                        <small>{sym}{fmt(p.costPrice)} / {p.uomName || 'units'}</small>
                      </div>
                    ))}
                  </div>
                )}
                {form.productId && <div className="wm-hint">Unit cost and unit come from the selected item.</div>}
              </div>

              <div className="wm-field">
                <label className="wm-label">Reason</label>
                <div className="wm-reasons">
                  {REASONS.map(r => {
                    const on = form.wasteReason === r;
                    return (
                      <button key={r} type="button" className={`wm-reason ${on ? 'on' : ''}`}
                        onClick={() => setReason(r)}>{r}</button>
                    );
                  })}
                </div>
              </div>

              <div className="wm-grid2">
                <div className="wm-field">
                  <label className="wm-label">Quantity</label>
                  <input className="wm-input wm-num" type="number" min="0.01" step="0.01" value={form.quantity}
                    onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} />
                  <div className="wm-presets">
                    {QTY_PRESETS.map(q => (
                      <button key={q} type="button" onClick={() => setForm(p => ({ ...p, quantity: String(q) }))}>{q}</button>
                    ))}
                  </div>
                </div>
                <div className="wm-field">
                  <label className="wm-label">Unit</label>
                  <div className="wm-readonly">{form.unitOfMeasure || 'units'}</div>
                </div>
              </div>

              <div className="wm-grid2">
                <div className="wm-field">
                  <label className="wm-label">Unit cost ({sym})</label>
                  <input className="wm-input wm-num" type="number" min="0" step="0.01" value={form.unitCost}
                    onChange={e => setForm(p => ({ ...p, unitCost: e.target.value }))} />
                </div>
                <div className="wm-field">
                  <label className="wm-label">Estimated loss</label>
                  <div className="wm-loss wm-num">{sym}{estimatedLoss}</div>
                </div>
              </div>

              {cats.length > 0 && (
                <div className="wm-field">
                  <label className="wm-label">Category</label>
                  <NiceSelect value={form.wasteCategoryId} placeholder="No category"
                    onChange={v => setForm(p => ({ ...p, wasteCategoryId: v }))}
                    options={cats.map(c => ({ value: c.id, label: c.name }))} />
                </div>
              )}

              <div className="wm-field">
                <label className="wm-label">Date and time</label>
                <PremiumDateTimePicker value={form.wasteDate}
                  onChange={v => setForm(p => ({ ...p, wasteDate: v }))} />
              </div>

              <div className="wm-field">
                <label className="wm-label">Notes</label>
                <textarea className="wm-textarea" rows={2} placeholder="Optional" value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={{ resize: 'none' }} />
                <div className="wm-hint">Ctrl+Enter saves the entry.</div>
              </div>
            </div>
          </CafeQRPopup>
        )}

        {/* ── CATEGORY FORM POPUP ───────── */}
        {showCatForm && (
          <CafeQRPopup
            title="New category"
            onClose={() => setShowCatForm(false)}
            onCancel={() => setShowCatForm(false)}
            onSave={saveCat}
            saveLabel="Add"
            maxWidth="400px"
          >
            <div className="wm-field">
              <label className="wm-label">Name</label>
              <input className="wm-input" placeholder="For example: Cold storage, Produce" autoFocus
                value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') saveCat(); }} />
            </div>
          </CafeQRPopup>
        )}

        {toast && <div className={`wm-toast ${toast.type}`}>{toast.msg}</div>}
      </div>
    </DashboardLayout>
  );
}
