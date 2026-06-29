import React, { useState, useEffect, useCallback, useRef } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { formatTzDate } from '../../utils/timezoneUtils';
import { FaTrash, FaPlus, FaEdit, FaTimes, FaRecycle, FaChartPie, FaList, FaCog, FaCheck, FaLeaf, FaChevronDown } from 'react-icons/fa';
import { useCurrencySymbol } from '../../hooks/useCurrencySymbol';

const REASONS = ['Spillage','Burnt / Overcooked','Expired / Spoiled','Customer Return','Over-preparation','Theft / Loss','Other'];
const REASON_META = {
  'Spillage':          { emoji: '💧', color: '#3b82f6' },
  'Burnt / Overcooked':{ emoji: '🔥', color: '#f97316' },
  'Expired / Spoiled': { emoji: '⚠️', color: '#ef4444' },
  'Customer Return':   { emoji: '↩️', color: '#8b5cf6' },
  'Over-preparation':  { emoji: '📦', color: '#f59e0b' },
  'Theft / Loss':      { emoji: '🔍', color: '#ec4899' },
  'Other':             { emoji: '📋', color: '#64748b' },
};
const UOM = ['units','kg','g','litre','ml','plate','piece','dozen','batch'];
const fmt = n => Number(n||0).toFixed(2);

/* ── Custom Dropdown ─────────────────────────────────────────── */
function Dropdown({ value, onChange, options, placeholder = 'Select…', renderOption, renderValue }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const selected = options.find(o => (o.value ?? o) === value);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="wm-dd-trigger" onClick={() => setOpen(o => !o)}>
        <span className="wm-dd-val">
          {selected ? (renderValue ? renderValue(selected) : (selected.label ?? selected)) : <span style={{color:'#94a3b8'}}>{placeholder}</span>}
        </span>
        <FaChevronDown className={`wm-dd-arrow ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <div className="wm-dd-menu">
          {options.map((o, i) => {
            const val = o.value ?? o;
            const label = o.label ?? o;
            const active = val === value;
            return (
              <div key={i} className={`wm-dd-item ${active ? 'active' : ''}`}
                onClick={() => { onChange(val); setOpen(false); }}>
                {renderOption ? renderOption(o) : label}
                {active && <FaCheck className="wm-dd-check" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
/* ── Main Page ───────────────────────────────────────────────── */
export default function WasteManagement() {
  const { timezone, orgId } = useAuth();
  const sym = useCurrencySymbol();
  const [tab, setTab] = useState('log');
  const [logs, setLogs] = useState([]);
  const [cats, setCats] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editLog, setEditLog] = useState(null);
  const [form, setForm] = useState({ productName:'', wasteReason:'Spillage', quantity:'1', unitOfMeasure:'units', unitCost:'0', notes:'', wasteCategoryId:'', wasteDate: new Date().toISOString().slice(0,16) });
  const [catForm, setCatForm] = useState({ name:'' });
  const [showCatForm, setShowCatForm] = useState(false);
  const [dateRange, setDateRange] = useState({ start: new Date(Date.now()-30*864e5).toISOString().slice(0,10), end: new Date().toISOString().slice(0,10) });
  const [search, setSearch] = useState('');
  const [filterReason, setFilterReason] = useState('ALL');
  const [logPage, setLogPage] = useState(0);
  const [logTotalPages, setLogTotalPages] = useState(0);
  const [logTotalElements, setLogTotalElements] = useState(0);
  const LOG_PAGE_SIZE = 50;

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3200); };

  const load = useCallback(async (pageNum = 0) => {
    setLoading(true);
    try {
      const [logsR, catsR] = await Promise.all([
        api.get(`/api/v1/waste/logs?page=${pageNum}&size=${LOG_PAGE_SIZE}`),
        api.get('/api/v1/waste/categories')
      ]);
      const pageData = logsR.data.data;
      setLogs(pageData.content || []);
      setLogTotalPages(pageData.totalPages || 0);
      setLogTotalElements(pageData.totalElements || 0);
      setLogPage(pageNum);
      setCats(catsR.data.data || []);
    } catch { showToast('Failed to load','error'); }
    finally { setLoading(false); }
  }, [orgId]);

  const loadAnalytics = useCallback(async () => {
    try {
      const r = await api.get(`/api/v1/waste/analytics?start=${dateRange.start}T00:00:00&end=${dateRange.end}T23:59:59`);
      setAnalytics(r.data.data);
    } catch(e) { console.error(e); }
  }, [dateRange, orgId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if(tab==='analytics') loadAnalytics(); }, [tab, loadAnalytics]);

  const openForm = (log=null) => {
    setEditLog(log);
    setForm(log ? {
      productName: log.productName||'', wasteReason: log.wasteReason||'Spillage',
      quantity: String(log.quantity||1), unitOfMeasure: log.unitOfMeasure||'units',
      unitCost: String(log.unitCost||0), notes: log.notes||'',
      wasteCategoryId: log.wasteCategoryId||'',
      wasteDate: log.wasteDate ? log.wasteDate.slice(0,16) : new Date().toISOString().slice(0,16)
    } : { productName:'', wasteReason:'Spillage', quantity:'1', unitOfMeasure:'units', unitCost:'0', notes:'', wasteCategoryId: cats[0]?.id||'', wasteDate: new Date().toISOString().slice(0,16) });
    setShowForm(true);
  };

  const saveLog = async () => {
    if(!form.productName.trim()) { showToast('Item name required','error'); return; }
    try {
      const payload = { ...form, quantity: parseFloat(form.quantity)||1, unitCost: parseFloat(form.unitCost)||0 };
      editLog ? await api.put(`/api/v1/waste/logs/${editLog.id}`, payload) : await api.post('/api/v1/waste/logs', payload);
      showToast(editLog ? 'Updated!' : 'Waste recorded!');
      setShowForm(false); load(logPage);
    } catch { showToast('Save failed','error'); }
  };

  const deleteLog = async (id) => {
    if(!confirm('Delete this entry?')) return;
    try { await api.delete(`/api/v1/waste/logs/${id}`); showToast('Deleted'); load(logPage); }
    catch { showToast('Delete failed','error'); }
  };

  const saveCat = async () => {
    if(!catForm.name.trim()) return;
    try { await api.post('/api/v1/waste/categories', catForm); showToast('Category added'); setShowCatForm(false); setCatForm({name:''}); load(); }
    catch { showToast('Failed','error'); }
  };

  const deleteCat = async (id) => {
    try { await api.delete(`/api/v1/waste/categories/${id}`); showToast('Deleted'); load(); }
    catch { showToast('Failed','error'); }
  };

  const filtered = logs.filter(l =>
    (!search || (l.productName||'').toLowerCase().includes(search.toLowerCase())) &&
    (filterReason==='ALL' || l.wasteReason===filterReason)
  );

  const totalCost = logs.reduce((s,l)=>s+Number(l.totalCost||0),0);
  const topReason = logs.length ? Object.entries(logs.reduce((a,l)=>({...a,[l.wasteReason]:(a[l.wasteReason]||0)+1}),{})).sort((a,b)=>b[1]-a[1])[0]?.[0] : '—';
  const estimatedLoss = fmt((parseFloat(form.unitCost)||0)*(parseFloat(form.quantity)||0));
  const catOptions = cats.map(c => ({ value: c.id, label: c.name }));
  const reasonFilter = [{ value:'ALL', label:'All Reasons' }, ...REASONS.map(r => ({ value:r, label:`${REASON_META[r]?.emoji} ${r}` }))];
  const CSS = `
    * { box-sizing: border-box; }
    .wm { font-family:'Inter',sans-serif; background:#f7f8fa; min-height:100vh; padding:28px 24px; }
    .wm-hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:28px; gap:12px; flex-wrap:wrap; }
    .wm-brand { display:flex; align-items:center; gap:12px; }
    .wm-badge { width:42px; height:42px; border-radius:13px; background:#ecfdf5; border:1.5px solid #d1fae5; display:flex; align-items:center; justify-content:center; font-size:18px; color:#10b981; }
    .wm-h1 { font-size:20px; font-weight:800; color:#111827; letter-spacing:-0.02em; margin:0; }
    .wm-h2 { font-size:12px; color:#9ca3af; font-weight:500; margin-top:2px; }
    .wm-btn-primary { display:inline-flex; align-items:center; gap:7px; padding:9px 18px; border-radius:10px; background:#111827; color:#fff; border:none; font:700 12px 'Inter',sans-serif; cursor:pointer; transition:.15s; letter-spacing:0.01em; }
    .wm-btn-primary:hover { background:#1f2937; transform:translateY(-1px); }
    .wm-kpis { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:14px; margin-bottom:24px; }
    .wm-kpi { background:#fff; border-radius:16px; padding:18px; border:1px solid #f1f5f9; }
    .wm-kpi-lbl { font-size:10px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:.07em; margin-bottom:8px; }
    .wm-kpi-v { font-size:24px; font-weight:800; color:#111827; letter-spacing:-0.03em; }
    .wm-kpi-v.red { color:#ef4444; }
    .wm-kpi-sub { font-size:11px; color:#9ca3af; margin-top:3px; font-weight:500; }
    .wm-tabs { display:flex; gap:2px; background:#f1f5f9; padding:3px; border-radius:12px; margin-bottom:20px; width:fit-content; }
    .wm-tab { padding:7px 16px; border-radius:9px; border:none; background:transparent; font:600 12px 'Inter',sans-serif; color:#6b7280; cursor:pointer; display:flex; align-items:center; gap:6px; transition:.15s; }
    .wm-tab.on { background:#fff; color:#111827; box-shadow:0 1px 6px rgba(0,0,0,.07); }
    .wm-toolbar { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; align-items:center; }
    .wm-search { flex:1; min-width:150px; padding:9px 13px; border-radius:10px; border:1.5px solid #e5e7eb; background:#fff; font:600 13px 'Inter',sans-serif; color:#111827; outline:none; transition:.15s; }
    .wm-search:focus { border-color:#111827; }
    .wm-card { background:#fff; border-radius:16px; border:1px solid #f1f5f9; overflow:hidden; }
    .wm-tbl { width:100%; border-collapse:collapse; }
    .wm-tbl th { text-align:left; padding:12px 16px; font-size:10px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:.07em; border-bottom:1px solid #f1f5f9; background:#fafafa; }
    .wm-tbl td { padding:13px 16px; font-size:13px; color:#111827; border-bottom:1px solid #fafafa; font-weight:500; }
    .wm-tbl tr:last-child td { border-bottom:none; }
    .wm-tbl tr:hover td { background:#fafafa; }
    .wm-pill { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }
    .wm-cost { font-weight:800; color:#ef4444; font-size:13px; }
    .wm-acts { display:flex; gap:5px; }
    .wm-ic-btn { width:29px; height:29px; border-radius:8px; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:11px; transition:.15s; }
    .wm-ic-btn.ed { background:#f0fdf4; color:#10b981; } .wm-ic-btn.ed:hover { background:#10b981; color:#fff; }
    .wm-ic-btn.dl { background:#fff5f5; color:#ef4444; } .wm-ic-btn.dl:hover { background:#ef4444; color:#fff; }
    .wm-empty { padding:52px 20px; text-align:center; }
    .wm-empty-ic { font-size:36px; opacity:.15; margin-bottom:10px; }
    .wm-empty-txt { font-size:13px; color:#9ca3af; font-weight:600; }
    .wm-analytics-g { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:14px; }
    .wm-a-card { background:#fff; border-radius:16px; padding:20px; border:1px solid #f1f5f9; }
    .wm-a-title { font-size:12px; font-weight:700; color:#374151; margin-bottom:14px; }
    .wm-bar-row { display:flex; align-items:center; gap:10px; margin-bottom:9px; }
    .wm-bar-lbl { font-size:11px; font-weight:600; color:#374151; width:130px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
    .wm-bar-trk { flex:1; height:7px; background:#f1f5f9; border-radius:99px; overflow:hidden; }
    .wm-bar-fill { height:100%; border-radius:99px; }
    .wm-bar-v { font-size:11px; font-weight:700; color:#ef4444; min-width:48px; text-align:right; }
    .wm-cats-g { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px; }
    .wm-cat-c { background:#fff; border-radius:12px; padding:14px 16px; border:1px solid #f1f5f9; display:flex; align-items:center; justify-content:space-between; }
    .wm-cat-nm { font-size:13px; font-weight:700; color:#111827; }
    .wm-cat-del { border:none; background:#fff5f5; color:#ef4444; width:26px; height:26px; border-radius:7px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:11px; transition:.15s; }
    .wm-cat-del:hover { background:#ef4444; color:#fff; }
    .wm-mo { position:fixed; inset:0; background:rgba(17,24,39,.25); backdrop-filter:blur(6px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; animation:wmFI .18s; }
    @keyframes wmFI { from{opacity:0} to{opacity:1} }
    .wm-mb { background:#fff; border-radius:20px; width:100%; max-width:460px; box-shadow:0 20px 50px rgba(0,0,0,.10); animation:wmSU .22s cubic-bezier(.16,1,.3,1); border:1px solid #f1f5f9; }
    @keyframes wmSU { from{transform:translateY(16px);opacity:0} to{transform:translateY(0);opacity:1} }
    .wm-mhdr { padding:20px 22px 0; display:flex; justify-content:space-between; align-items:center; }
    .wm-mtitle { font-size:15px; font-weight:800; color:#111827; }
    .wm-mx { border:none; background:#f1f5f9; color:#6b7280; width:30px; height:30px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:.15s; font-size:12px; }
    .wm-mx:hover { background:#e5e7eb; color:#111827; }
    .wm-mbody { padding:18px 22px; display:flex; flex-direction:column; gap:13px; }
    .wm-lbl { font-size:10px; font-weight:700; color:#6b7280; text-transform:uppercase; letter-spacing:.06em; margin-bottom:5px; }
    .wm-inp { width:100%; padding:10px 13px; border-radius:10px; border:1.5px solid #e5e7eb; font:600 13px 'Inter',sans-serif; color:#111827; outline:none; transition:.15s; background:#fff; }
    .wm-inp:focus { border-color:#111827; }
    .wm-row2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .wm-reason-g { display:grid; grid-template-columns:repeat(3,1fr); gap:7px; }
    .wm-reason-chip { padding:8px 4px; border-radius:9px; border:1.5px solid #e5e7eb; background:#fff; font:600 10px 'Inter',sans-serif; color:#6b7280; cursor:pointer; transition:.15s; text-align:center; line-height:1.4; }
    .wm-reason-chip.on { color:#fff; font-weight:700; border-color:transparent; }
    .wm-reason-chip:hover:not(.on) { border-color:#111827; color:#111827; }
    .wm-loss-box { padding:10px 13px; border-radius:10px; background:#fff5f5; border:1.5px solid #fee2e2; color:#ef4444; font:800 14px 'Inter',sans-serif; }
    .wm-mft { padding:0 22px 20px; display:flex; gap:8px; justify-content:flex-end; }
    .wm-btn-sec { padding:9px 16px; border-radius:10px; border:1.5px solid #e5e7eb; background:#fff; font:700 12px 'Inter',sans-serif; color:#6b7280; cursor:pointer; transition:.15s; }
    .wm-btn-sec:hover { background:#f9fafb; }
    .wm-btn-ok { padding:9px 22px; border-radius:10px; border:none; background:#111827; color:#fff; font:700 12px 'Inter',sans-serif; cursor:pointer; transition:.15s; display:flex; align-items:center; gap:7px; }
    .wm-btn-ok:hover { background:#1f2937; }
    .wm-toast { position:fixed; bottom:22px; left:50%; transform:translateX(-50%); padding:11px 18px; border-radius:12px; background:#111827; color:#fff; font:700 13px 'Inter',sans-serif; z-index:99999; box-shadow:0 10px 28px rgba(0,0,0,.18); display:flex; align-items:center; gap:9px; animation:wmFI .25s; white-space:nowrap; }
    .wm-toast.error { background:#ef4444; }
    .wm-date-row { display:flex; align-items:center; gap:8px; background:#fff; border:1.5px solid #e5e7eb; border-radius:10px; padding:7px 12px; }
    .wm-date-inp { border:none; background:transparent; font:600 12px 'Inter',sans-serif; color:#111827; outline:none; }
    .wm-sep { color:#9ca3af; font-size:12px; }
    /* Custom Dropdown */
    .wm-dd-trigger { width:100%; display:flex; align-items:center; justify-content:space-between; padding:10px 13px; border-radius:10px; border:1.5px solid #e5e7eb; background:#fff; font:600 13px 'Inter',sans-serif; color:#111827; cursor:pointer; text-align:left; transition:.15s; }
    .wm-dd-trigger:hover, .wm-dd-trigger:focus { border-color:#111827; outline:none; }
    .wm-dd-val { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .wm-dd-arrow { font-size:10px; color:#9ca3af; transition:.2s; flex-shrink:0; }
    .wm-dd-arrow.open { transform:rotate(180deg); color:#111827; }
    .wm-dd-menu { position:absolute; top:calc(100% + 5px); left:0; right:0; background:#fff; border:1.5px solid #e5e7eb; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.09); z-index:1000; overflow:hidden; animation:wmFI .15s; max-height:220px; overflow-y:auto; }
    .wm-dd-item { padding:10px 13px; font:600 13px 'Inter',sans-serif; color:#374151; cursor:pointer; transition:.12s; display:flex; align-items:center; justify-content:space-between; }
    .wm-dd-item:hover { background:#f9fafb; }
    .wm-dd-item.active { background:#f0fdf4; color:#059669; }
    .wm-dd-check { font-size:11px; color:#10b981; flex-shrink:0; }
  `;
  return (
    <DashboardLayout>
      <style jsx global>{CSS}</style>
      <div className="wm">

        {/* Header */}
        <div className="wm-hdr">
          <div className="wm-brand">
            <div className="wm-badge"><FaRecycle /></div>
            <div>
              <div className="wm-h1">Waste Management</div>
              <div className="wm-h2">Track, analyse and reduce kitchen waste</div>
            </div>
          </div>
          <button className="wm-btn-primary" onClick={() => openForm()}><FaPlus /> Log Waste</button>
        </div>

        {/* KPIs */}
        <div className="wm-kpis">
          <div className="wm-kpi"><div className="wm-kpi-lbl">Total Entries</div><div className="wm-kpi-v">{logTotalElements || logs.length}</div><div className="wm-kpi-sub">All time</div></div>
          <div className="wm-kpi"><div className="wm-kpi-lbl">Waste Cost</div><div className="wm-kpi-v red">{sym}{fmt(totalCost)}</div><div className="wm-kpi-sub">This page</div></div>
          <div className="wm-kpi"><div className="wm-kpi-lbl">Top Reason</div><div className="wm-kpi-v" style={{fontSize:'14px',marginTop:'4px'}}>{topReason}</div><div className="wm-kpi-sub">Most frequent</div></div>
          <div className="wm-kpi"><div className="wm-kpi-lbl">Categories</div><div className="wm-kpi-v">{cats.length}</div><div className="wm-kpi-sub">Active</div></div>
        </div>

        {/* Tabs */}
        <div className="wm-tabs">
          {[['log','Log'],['analytics','Analytics'],['categories','Categories']].map(([k,l])=>(
            <button key={k} className={`wm-tab ${tab===k?'on':''}`} onClick={()=>setTab(k)}>{l}</button>
          ))}
        </div>

        {/* ── LOG TAB ─────────────────────── */}
        {tab === 'log' && (<>
          <div className="wm-toolbar">
            <input className="wm-search" placeholder="Search item..." value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:220}} />
            <div style={{minWidth:200}}>
              <Dropdown value={filterReason} onChange={setFilterReason}
                options={reasonFilter}
                renderValue={o => o.label}
                renderOption={o => <span>{o.label}</span>}
              />
            </div>
          </div>
          <div className="wm-card">
            {loading ? (
              <div className="wm-empty"><div className="wm-empty-txt">Loading…</div></div>
            ) : filtered.length === 0 ? (
              <div className="wm-empty">
                <div className="wm-empty-ic"><FaLeaf /></div>
                <div className="wm-empty-txt">No records yet — click Log Waste</div>
              </div>
            ) : (
              <table className="wm-tbl">
                <thead><tr><th>Item</th><th>Reason</th><th>Qty</th><th>Unit Cost</th><th>Total Loss</th><th>Date</th><th></th></tr></thead>
                <tbody>
                  {filtered.map(l => {
                    const m = REASON_META[l.wasteReason] || REASON_META['Other'];
                    return (
                      <tr key={l.id}>
                        <td style={{fontWeight:700}}>{l.productName||'—'}</td>
                        <td><span className="wm-pill" style={{background:m.color+'14',color:m.color}}>{m.emoji} {l.wasteReason}</span></td>
                        <td>{l.quantity} {l.unitOfMeasure}</td>
                        <td style={{color:'#6b7280'}}>{sym}{fmt(l.unitCost)}</td>
                        <td><span className="wm-cost">{sym}{fmt(l.totalCost)}</span></td>
                        <td style={{color:'#9ca3af',fontSize:'12px'}}>{formatTzDate(l.wasteDate, timezone, { format: 'date' })}</td>
                        <td><div className="wm-acts">
                          <button className="wm-ic-btn ed" onClick={()=>openForm(l)}><FaEdit/></button>
                          <button className="wm-ic-btn dl" onClick={()=>deleteLog(l.id)}><FaTrash/></button>
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Bar */}
          {logTotalPages > 1 && (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'14px',padding:'16px 0 8px'}}>
              <button
                onClick={() => load(logPage - 1)}
                disabled={logPage === 0}
                style={{padding:'8px 18px',borderRadius:'10px',border:'1px solid #e5e7eb',background:'#fff',fontWeight:700,fontSize:'13px',color:'#10b981',cursor:logPage===0?'not-allowed':'pointer',opacity:logPage===0?0.4:1}}
              >← Prev</button>
              <span style={{fontSize:'13px',fontWeight:700,color:'#6b7280'}}>Page {logPage + 1} of {logTotalPages} &nbsp;·&nbsp; {logTotalElements} total</span>
              <button
                onClick={() => load(logPage + 1)}
                disabled={logPage >= logTotalPages - 1}
                style={{padding:'8px 18px',borderRadius:'10px',border:'1px solid #e5e7eb',background:'#fff',fontWeight:700,fontSize:'13px',color:'#10b981',cursor:logPage>=logTotalPages-1?'not-allowed':'pointer',opacity:logPage>=logTotalPages-1?0.4:1}}
              >Next →</button>
            </div>
          )}
        </>)}

        {/* ── ANALYTICS TAB ─────────────── */}
        {tab === 'analytics' && (<>
          <div className="wm-toolbar">
            <div className="wm-date-row">
              <input type="date" className="wm-date-inp" value={dateRange.start} onChange={e=>setDateRange(p=>({...p,start:e.target.value}))} />
              <span className="wm-sep">→</span>
              <input type="date" className="wm-date-inp" value={dateRange.end} onChange={e=>setDateRange(p=>({...p,end:e.target.value}))} />
            </div>
            <button className="wm-btn-primary" onClick={loadAnalytics}>Apply</button>
          </div>
          {analytics ? (
            <div className="wm-analytics-g">
              <div className="wm-a-card" style={{borderColor:'#fee2e2',background:'#fffafa'}}>
                <div className="wm-a-title">💸 Total Waste Cost</div>
                <div style={{fontSize:'32px',fontWeight:900,color:'#ef4444',letterSpacing:'-0.03em'}}>{sym}{fmt(analytics.totalWasteCost)}</div>
                <div style={{fontSize:'11px',color:'#9ca3af',marginTop:'5px',fontWeight:500}}>{dateRange.start} → {dateRange.end}</div>
              </div>
              <div className="wm-a-card" style={{gridColumn:'span 2'}}>
                <div className="wm-a-title">📊 Breakdown by Reason</div>
                {analytics.breakdown?.length ? (() => {
                  const max = Math.max(...analytics.breakdown.map(b=>Number(b.totalCost||0)));
                  return analytics.breakdown.map((b,i) => (
                    <div key={i} className="wm-bar-row">
                      <div className="wm-bar-lbl">{REASON_META[b.reason]?.emoji||'📋'} {b.reason}</div>
                      <div className="wm-bar-trk"><div className="wm-bar-fill" style={{width:`${max>0?Number(b.totalCost)/max*100:0}%`,background:REASON_META[b.reason]?.color||'#6b7280'}} /></div>
                      <div className="wm-bar-v">{sym}{fmt(b.totalCost)}</div>
                      <div style={{fontSize:'10px',color:'#9ca3af',minWidth:'32px',textAlign:'right',fontWeight:600}}>{b.count}x</div>
                    </div>
                  ));
                })() : <div style={{color:'#9ca3af',fontSize:'13px'}}>No data for this period</div>}
              </div>
            </div>
          ) : <div className="wm-empty"><div className="wm-empty-txt">Loading analytics…</div></div>}
        </>)}

        {/* ── CATEGORIES TAB ────────────── */}
        {tab === 'categories' && (<>
          <div className="wm-toolbar">
            <button className="wm-btn-primary" onClick={()=>setShowCatForm(true)}><FaPlus /> New Category</button>
          </div>
          <div className="wm-cats-g">
            {cats.map(c=>(
              <div key={c.id} className="wm-cat-c">
                <div className="wm-cat-nm">📂 {c.name}</div>
                <button className="wm-cat-del" onClick={()=>deleteCat(c.id)}><FaTimes/></button>
              </div>
            ))}
            {!cats.length && <div style={{color:'#9ca3af',fontSize:'13px'}}>No categories yet</div>}
          </div>
        </>)}

        {/* ── LOG FORM MODAL ────────────── */}
        {showForm && (
          <div className="wm-mo" onClick={e=>{if(e.target===e.currentTarget)setShowForm(false)}}>
            <div className="wm-mb">
              <div className="wm-mhdr">
                <div className="wm-mtitle">{editLog?'Edit Entry':'Log Waste'}</div>
                <button className="wm-mx" onClick={()=>setShowForm(false)}><FaTimes/></button>
              </div>
              <div className="wm-mbody">
                <div>
                  <div className="wm-lbl">Item / Ingredient *</div>
                  <input className="wm-inp" placeholder="e.g. Tomatoes, Chicken…" value={form.productName} onChange={e=>setForm(p=>({...p,productName:e.target.value}))} />
                </div>

                <div>
                  <div className="wm-lbl">Waste Reason *</div>
                  <div className="wm-reason-g">
                    {REASONS.map(r=>{
                      const m=REASON_META[r];
                      const on=form.wasteReason===r;
                      return (
                        <div key={r} className={`wm-reason-chip ${on?'on':''}`}
                          style={on?{background:m.color,borderColor:m.color}:{}}
                          onClick={()=>setForm(p=>({...p,wasteReason:r}))}>
                          {m.emoji}<br/><span style={{fontSize:'9px'}}>{r}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="wm-row2">
                  <div>
                    <div className="wm-lbl">Quantity</div>
                    <input className="wm-inp" type="number" min="0.01" step="0.01" value={form.quantity} onChange={e=>setForm(p=>({...p,quantity:e.target.value}))} />
                  </div>
                  <div>
                    <div className="wm-lbl">Unit</div>
                    <Dropdown value={form.unitOfMeasure} onChange={v=>setForm(p=>({...p,unitOfMeasure:v}))}
                      options={UOM} placeholder="Unit…" />
                  </div>
                </div>

                <div className="wm-row2">
                  <div>
                    <div className="wm-lbl">Unit Cost ({sym})</div>
                    <input className="wm-inp" type="number" min="0" step="0.01" value={form.unitCost} onChange={e=>setForm(p=>({...p,unitCost:e.target.value}))} />
                  </div>
                  <div>
                    <div className="wm-lbl">Estimated Loss</div>
                    <div className="wm-loss-box">{sym}{estimatedLoss}</div>
                  </div>
                </div>

                {cats.length > 0 && (
                  <div>
                    <div className="wm-lbl">Category</div>
                    <Dropdown value={form.wasteCategoryId} onChange={v=>setForm(p=>({...p,wasteCategoryId:v}))}
                      options={catOptions} placeholder="Select category…"
                      renderOption={o=><span>{o.label}</span>}
                      renderValue={o=>o.label} />
                  </div>
                )}

                <div>
                  <div className="wm-lbl">Date & Time</div>
                  <input className="wm-inp" type="datetime-local" value={form.wasteDate} onChange={e=>setForm(p=>({...p,wasteDate:e.target.value}))} />
                </div>

                <div>
                  <div className="wm-lbl">Notes</div>
                  <textarea className="wm-inp" rows={2} placeholder="Optional…" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} style={{resize:'none'}} />
                </div>
              </div>
              <div className="wm-mft">
                <button className="wm-btn-sec" onClick={()=>setShowForm(false)}>Cancel</button>
                <button className="wm-btn-ok" onClick={saveLog}><FaCheck />{editLog?'Update':'Record'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ── CATEGORY MODAL ────────────── */}
        {showCatForm && (
          <div className="wm-mo" onClick={e=>{if(e.target===e.currentTarget)setShowCatForm(false)}}>
            <div className="wm-mb" style={{maxWidth:340}}>
              <div className="wm-mhdr">
                <div className="wm-mtitle">New Category</div>
                <button className="wm-mx" onClick={()=>setShowCatForm(false)}><FaTimes/></button>
              </div>
              <div className="wm-mbody">
                <div>
                  <div className="wm-lbl">Name *</div>
                  <input className="wm-inp" placeholder="e.g. Cold Storage, Produce…" value={catForm.name} onChange={e=>setCatForm(p=>({...p,name:e.target.value}))} />
                </div>
              </div>
              <div className="wm-mft">
                <button className="wm-btn-sec" onClick={()=>setShowCatForm(false)}>Cancel</button>
                <button className="wm-btn-ok" onClick={saveCat}><FaPlus />Add</button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && <div className={`wm-toast ${toast.type}`}>{toast.type==='success'?<FaCheck/>:<FaTimes/>} {toast.msg}</div>}
      </div>
    </DashboardLayout>
  );
}
