import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import api from '../utils/api';
import { useCurrencySymbol } from '../hooks/useCurrencySymbol';
import PremiumDateTimePicker from '../components/PremiumDateTimePicker';
import NiceSelect from '../components/NiceSelect';
import DocumentViewerPopup from '../components/purchasing/DocumentViewerPopup';
import { formatTzDate } from '../utils/timezoneUtils';
import {
  FaChartPie, FaChartBar, FaThList,
  FaExclamationTriangle, FaTimes, FaReceipt,
  FaCheckCircle, FaMoneyBillWave,
  FaShoppingBag, FaArrowUp, FaCalendarAlt,
  FaUtensils, FaMotorcycle, FaCreditCard,
  FaQrcode, FaClock, FaWarehouse, FaHandshake
} from 'react-icons/fa';

/* ── helpers ── */
const fmt  = n => Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtN = n => Number(n||0).toLocaleString('en-IN');
const fmtC = n => `₹${fmt(n)}`;

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

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function DashboardPage() { return <Dashboard />; }

function Dashboard() {
  const { userRole, orgId, subscriptionExpiryDate, timezone } = useAuth();
  const isSuperAdmin = userRole === 'SUPER_ADMIN';

  /* view */
  const [view, setView] = useState('chart'); // 'chart' | 'graph' | 'table'

  /* order type toggle */
  const [orderType, setOrderType] = useState('SALE'); // 'SALE' | 'PURCHASE'
  const themeColor = '#f97316';
  const themeColorRgb = '249, 115, 22';

  const [viewingDoc, setViewingDoc] = useState(null);
  const [config, setConfig] = useState(null);
  const [menus, setMenus] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
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
      if (!hasSalesAccess && hasPurchaseAccess) {
        setOrderType('PURCHASE');
      } else if (hasSalesAccess && !hasPurchaseAccess) {
        setOrderType('SALE');
      }
    }
  }, [hasSalesAccess, hasPurchaseAccess, menus]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get('/api/v1/purchasing/vendors').catch(() => null),
      api.get('/api/v1/warehouses').catch(() => null),
    ]).then(([vRes, wRes]) => {
      if (!active) return;
      if (vRes?.data?.success) setVendors(vRes.data.data || []);
      if (wRes?.data?.success) setWarehouses(wRes.data.data || []);
    });
    return () => { active = false; };
  }, []);

  /* filters */
  const [orgs,        setOrgs]        = useState([]);
  const [terminals,   setTerminals]   = useState([]);
  const [selOrg,      setSelOrg]      = useState('');
  const [selTerminal, setSelTerminal] = useState('');

  /* date filters — default: today full day */
  const todayStart = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T00:00`;
  };
  const todayEnd = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T23:59`;
  };
  const [dateFrom, setDateFrom] = useState(todayStart);
  const [dateTo,   setDateTo]   = useState(todayEnd);

  /* data */
  const [orders,     setOrders]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState('');

  /* load org/terminal lists for super admin */
  useEffect(() => {
    if (!isSuperAdmin) return;
    Promise.all([
      api.get('/api/v1/organizations').catch(()=>null),
      api.get('/api/v1/terminals').catch(()=>null),
    ]).then(([or, tr]) => {
      if (or?.data?.success)  setOrgs(or.data.data || []);
      if (tr?.data?.success)  setTerminals(tr.data.data || []);
    });
  }, [isSuperAdmin]);

  /* load orders */
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const params = {
        size: 5000,
        type: orderType
      };
      if (isSuperAdmin && selOrg)      params.branchId = selOrg;
      if (isSuperAdmin && selTerminal) params.terminalId = selTerminal;
      if (dateFrom) params.fromDate = new Date(dateFrom + ':00').toISOString();
      if (dateTo)   params.toDate   = new Date(dateTo   + ':00').toISOString();
      const res = await api.get('/api/v1/orders/search', { params });
      const raw = res.data?.data?.content || res.data?.data;
      const list = (Array.isArray(raw) ? raw : [])
        .filter(o => {
          const status = String(o.status || o.orderStatus || '').toUpperCase();
          const active = o.isActive !== undefined ? o.isActive : (o.isactive !== 'N');
          const isVoidedNo = String(o.orderNo || o.order_no || '').toUpperCase().includes('_VOID_');
          return status !== 'VOID' && status !== 'VOIDED' && active && !isVoidedNo;
        })
        .map(o => {
          const s = String(o.status || o.orderStatus || '').toUpperCase();
          let grp = 'ORDERED';
          if (['COMPLETED', 'PAID'].includes(s)) grp = 'COMPLETED';
          else if (s === 'BILLED') grp = 'BILLED';
          else if (s === 'CANCELLED') grp = 'CANCELLED';
          return {
            ...o,
            status: grp,
            originalStatus: o.status || o.orderStatus,
            type: o.type || o.orderType
          };
        });
      setOrders(list);
    } catch { setErr('Could not load data. Check your connection.'); }
    finally { setLoading(false); }
  }, [isSuperAdmin, selOrg, selTerminal, dateFrom, dateTo, orderType]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  /* reset terminal when org changes */
  const handleOrgChange = v => { setSelOrg(v); setSelTerminal(''); };

  const filteredTerminals = useMemo(() =>
    selOrg ? terminals.filter(t => t.orgId === selOrg || t.organization?.id === selOrg) : terminals,
  [terminals, selOrg]);

  /* subscription warning */
  const daysLeft = subscriptionExpiryDate
    ? Math.ceil((new Date(subscriptionExpiryDate) - new Date()) / 86400000) : null;

  const VIEWS = [
    { key:'chart', label:'Chart',  Icon: FaChartPie },
    { key:'graph', label:'Graph',  Icon: FaChartBar },
    { key:'table', label:'Table',  Icon: FaThList   },
  ];

  return (
    <DashboardLayout title="Business Overview" showBack={false}>
      <div className="db" style={{ '--theme-color': themeColor, '--theme-color-rgb': themeColorRgb }}>

        {/* trial warning */}
        {daysLeft !== null && daysLeft > 0 && daysLeft <= 7 && (
          <div className="db-banner">
            <FaExclamationTriangle />
            Subscription expires in <strong>{daysLeft} day{daysLeft!==1?'s':''}</strong>
          </div>
        )}
        {err && (
          <div className="db-banner db-banner--red">
            <FaExclamationTriangle /><span>{err}</span>
            <button onClick={()=>setErr('')}><FaTimes/></button>
          </div>
        )}

        {/* ── SALES/PURCHASES SEGMENTED TOGGLE ── */}
        {hasSalesAccess && hasPurchaseAccess && (
          <div className="db-toggle-container">
            <button
              className={`db-toggle-btn ${orderType === 'SALE' ? 'active sales' : ''}`}
              onClick={() => setOrderType('SALE')}
            >
              <FaShoppingBag />
              <span>Sales Overview</span>
            </button>
            <button
              className={`db-toggle-btn ${orderType === 'PURCHASE' ? 'active purchase' : ''}`}
              onClick={() => setOrderType('PURCHASE')}
            >
              <FaMoneyBillWave />
              <span>Purchases Overview</span>
            </button>
          </div>
        )}

        {/* ── TOOLBAR ── */}
        <div className="db-toolbar">
          {/* LEFT — view toggles */}
          <div className="db-view-tabs">
            {VIEWS.map(({key,label,Icon}) => (
              <button
                key={key}
                className={`db-tab${view===key?' db-tab--on':''}`}
                onClick={()=>setView(key)}
              >
                <Icon /><span>{label}</span>
              </button>
            ))}
          </div>

          {/* CENTER — date pickers */}
          <div className="db-date-center">
            <div className="db-dt-wrap">
              <PremiumDateTimePicker
                value={dateFrom}
                onChange={v => setDateFrom(v)}
                themeColor={themeColor}
              />
            </div>
            <span className="db-dt-sep">→</span>
            <div className="db-dt-wrap">
              <PremiumDateTimePicker
                value={dateTo}
                onChange={v => setDateTo(v)}
                themeColor={themeColor}
              />
            </div>
          </div>

          {/* RIGHT — org/terminal (super admin only) */}
          <div className="db-filters-right">
            {isSuperAdmin ? (
              <>
                <div className="db-ns-wrap">
                  <NiceSelect
                    value={selOrg}
                    onChange={v => handleOrgChange(v)}
                    placeholder="All Branches"
                    options={[
                      { value: '', label: 'All Branches' },
                      ...orgs.map(o => ({ value: o.id, label: o.name || o.id }))
                    ]}
                  />
                </div>
                <div className="db-ns-wrap">
                  <NiceSelect
                    value={selTerminal}
                    onChange={v => setSelTerminal(v)}
                    placeholder="All Terminals"
                    disabled={filteredTerminals.length === 0}
                    options={[
                      { value: '', label: 'All Terminals' },
                      ...filteredTerminals.map(t => ({ value: t.id, label: t.name || t.terminalId || t.id }))
                    ]}
                  />
                </div>
              </>
            ) : <div style={{width:1}}/>}
          </div>
        </div>

        {/* ── VIEW AREA ── */}
        <div className="db-view-area">
          {loading ? (
            <div className="db-loader"><div className="db-spinner"/><span>Loading…</span></div>
          ) : view==='chart' ? (
            <ChartView orders={orders} themeColor={themeColor} orderType={orderType} vendors={vendors} warehouses={warehouses} currencySymbol={currencySymbol} />
          ) : view==='graph' ? (
            <GraphView orders={orders} themeColor={themeColor} themeColorRgb={themeColorRgb} orderType={orderType} dateFrom={dateFrom} dateTo={dateTo} vendors={vendors} warehouses={warehouses} currencySymbol={currencySymbol} />
          ) : (
            <TableView orders={orders} themeColor={themeColor} orderType={orderType} onViewOrder={(o) => setViewingDoc({ order: o, type: 'order' })} currencySymbol={currencySymbol} />
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
            STATUS_CFG={{
              DRAFT:     { label: 'Draft',     color: '#64748b', bg: '#f1f5f9', dot: '#94a3b8', border: '#cbd5e1' },
              BILLED:    { label: 'Billed',    color: '#b45309', bg: '#fffbeb', dot: '#f59e0b', border: '#fde68a' },
              COMPLETED: { label: 'Completed', color: '#059669', bg: '#ecfdf5', dot: '#10b981', border: '#6ee7b7' },
              PAID:      { label: 'Paid',      color: '#059669', bg: '#ecfdf5', dot: '#10b981', border: '#6ee7b7' },
              CANCELLED: { label: 'Cancelled', color: '#dc2626', bg: '#fef2f2', dot: '#ef4444', border: '#fca5a5' },
            }}
            config={config}
            onOrderUpdated={(savedOrder) => {
              fetchOrders();
            }}
          />
        )}

      </div>

      <style jsx>{`
        .db { padding:0 28px 48px; max-width:1440px; margin:0 auto; display:flex; flex-direction:column; gap:16px; }

        /* banner */
        .db-banner { display:flex; align-items:center; gap:10px; padding:11px 18px; border-radius:12px; background:#fffbeb; border:1px solid #fde68a; border-left:4px solid #f59e0b; color:#92400e; font-size:13px; font-weight:600; }
        .db-banner button { margin-left:auto; background:none; border:none; cursor:pointer; color:inherit; }
        .db-banner--red { background:#fef2f2; border-color:#fecaca; border-left-color:#ef4444; color:#b91c1c; }

        /* switcher toggle */
        .db-toggle-container { display:flex; background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:4px; gap:4px; width:100%; max-width:480px; margin:0 auto; box-shadow:0 1px 3px rgba(0,0,0,.02); }
        .db-toggle-btn { flex:1; display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 18px; border:none; background:transparent; color:#64748b; font-size:13.5px; font-weight:700; cursor:pointer; border-radius:12px; transition:all .2s ease; -webkit-tap-highlight-color:transparent; }
        .db-toggle-btn:hover { color:#334155; }
        .db-toggle-btn.active.sales { background:#f97316; color:white; box-shadow:0 4px 12px rgba(249, 115, 22, 0.2); }
        .db-toggle-btn.active.purchase { background:#f97316; color:white; box-shadow:0 4px 12px rgba(249, 115, 22, 0.2); }

        /* toolbar — 3-section layout */
        .db-toolbar { display:flex; align-items:center; gap:12px; background:white; border:1px solid #f1f5f9; border-top:3px solid var(--theme-color); border-radius:14px; padding:8px 14px; box-shadow:0 1px 6px rgba(0,0,0,.04); flex-wrap:nowrap; }

        .db-view-tabs { display:flex; gap:2px; background:#f8fafc; border-radius:10px; padding:3px; flex-shrink:0; }
        .db-tab { display:inline-flex; align-items:center; gap:5px; padding:6px 12px; border:none; border-radius:8px; background:transparent; color:#64748b; font-size:11.5px; font-weight:700; cursor:pointer; transition:all .18s; white-space:nowrap; }
        .db-tab svg { font-size:12px; flex-shrink:0; }
        .db-tab:hover { color:var(--theme-color); }
        .db-tab--on { background:white; color:var(--theme-color); box-shadow:0 1px 4px rgba(0,0,0,.08); }

        /* center date section */
        .db-date-center { flex:1; display:flex; align-items:center; justify-content:center; gap:8px; }

        /* right filters section */
        .db-filters-right { display:flex; align-items:center; gap:6px; flex-shrink:0; }

        /* PremiumDateTimePicker sizing inside toolbar */
        .db-dt-wrap { width:230px; flex-shrink:0; }
        .db-dt-wrap .dt-trigger { height:34px; padding:4px 10px; border-radius:10px; font-size:12px; border:1.5px solid #e2e8f0; }
        .db-dt-wrap .dt-input { font-size:12px; font-weight:500; color:#334155; min-width:0; flex:1; }
        .db-dt-wrap .dt-chevron { font-size:10px; color:#94a3b8; }
        .db-dt-wrap .dt-icon { color:#64748b; opacity:0.6; font-size:13px; }
        .db-dt-sep { font-size:12px; color:#cbd5e1; font-weight:700; flex-shrink:0; }

        /* NiceSelect sizing inside toolbar */
        .db-ns-wrap { width:155px; flex-shrink:0; }
        .db-ns-wrap .nice-select-trigger { height:34px !important; padding:4px 10px !important; border-radius:10px !important; font-size:11.5px !important; }
        .db-ns-wrap .nice-select-trigger span { font-size:11.5px !important; }
        :global(.spin) { animation:spin .7s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }

        /* view area */
        .db-view-area { background:white; border:1px solid #f1f5f9; border-radius:18px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.04); min-height:480px; }
        .db-loader { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; padding:80px; color:#94a3b8; font-size:13px; font-weight:600; }
        .db-spinner { width:30px; height:30px; border:2.5px solid #f1f5f9; border-top-color:var(--theme-color); border-radius:50%; animation:spin .7s linear infinite; }

        @media(max-width:1024px) {
          .db { padding:0 20px 36px; }
          .db-toolbar {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
            padding: 14px;
          }
          .db-view-tabs {
            width: 100%;
            justify-content: center;
          }
          .db-view-tabs .db-tab {
            flex: 1;
            justify-content: center;
          }
          .db-date-center {
            width: 100%;
            justify-content: space-between;
          }
          .db-dt-wrap {
            flex: 1;
            width: auto;
            min-width: 0;
          }
          .db-filters-right {
            width: 100%;
            justify-content: space-between;
          }
          .db-ns-wrap {
            flex: 1;
            width: auto;
            min-width: 0;
          }
        }

        @media(max-width:768px) {
          .db { padding:0 12px 32px; }
          .db-toggle-container { max-width:100%; }
          .db-date-center {
            flex-direction: column;
            width: 100%;
            align-items: stretch;
            gap: 8px;
          }
          .db-dt-sep {
            display: none;
          }
          .db-dt-wrap {
            width: 100%;
          }
          .db-dt-wrap :global(.dt-trigger) {
            height: 38px !important;
            padding: 8px 12px !important;
          }
          .db-dt-wrap :global(.dt-input) {
            font-size: 13px !important;
          }
        }
      `}</style>
    </DashboardLayout>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHART VIEW — KPI summary + donut + order type breakdown
   ═══════════════════════════════════════════════════════════════════════════ */
function ChartView({ orders, themeColor, orderType, vendors, warehouses, currencySymbol = '₹' }) {
  const fmtC = n => `${currencySymbol}${fmt(n)}`;
  const isSale = orderType === 'SALE';
  const stats = useMemo(() => {
    const safe = Array.isArray(orders) ? orders : [];
    const activeSales = safe.filter(o => o.status !== 'CANCELLED');
    const total = activeSales.length;
    const revenue  = activeSales.reduce((s,o)=>s+(o.totalAmount||0),0);
    const avg      = total ? revenue/total : 0;
    const byStatus = {};
    const byType   = {};
    
    const byFulfillment = { DINE_IN: { count: 0, total: 0 }, TAKEAWAY: { count: 0, total: 0 }, DELIVERY: { count: 0, total: 0 } };
    const byPayment = {};
    const byWarehouse = {};
    const byVendor = {};

    safe.forEach(o => {
      const sk = String(o.status||'').toUpperCase();
      const grp = STATUS_META[sk] ? sk : 'OTHER';
      byStatus[grp] = (byStatus[grp]||0) + 1;
    });

    activeSales.forEach(o => {
      const t = o.orderType || o.type || 'Unknown';
      byType[t] = { count:(byType[t]?.count||0)+1, total:(byType[t]?.total||0)+(o.totalAmount||0) };

      if (o.tableNumber || o.table_number) {
        byFulfillment.DINE_IN.count++;
        byFulfillment.DINE_IN.total += (o.totalAmount || 0);
      } else {
        const ft = String(o.fulfillmentType || o.fulfillment_type || '').toUpperCase();
        if (ft === 'TAKEAWAY') {
          byFulfillment.TAKEAWAY.count++;
          byFulfillment.TAKEAWAY.total += (o.totalAmount || 0);
        } else if (ft === 'DELIVERY') {
          byFulfillment.DELIVERY.count++;
          byFulfillment.DELIVERY.total += (o.totalAmount || 0);
        } else {
          byFulfillment.DINE_IN.count++;
          byFulfillment.DINE_IN.total += (o.totalAmount || 0);
        }
      }

      const pm = String(o.paymentMethod || o.payment_method || 'Unpaid').toUpperCase();
      if (pm === 'MIXED') {
        const cash = parseFloat(o.cashAmount || o.cash_amount || 0);
        const online = parseFloat(o.onlineAmount || o.online_amount || 0);
        if (cash > 0) {
          if (!byPayment['CASH']) byPayment['CASH'] = { count: 0, total: 0 };
          byPayment['CASH'].count++;
          byPayment['CASH'].total += cash;
        }
        if (online > 0) {
          if (!byPayment['ONLINE']) byPayment['ONLINE'] = { count: 0, total: 0 };
          byPayment['ONLINE'].count++;
          byPayment['ONLINE'].total += online;
        }
        if (cash === 0 && online === 0) {
          const total = parseFloat(o.totalAmount || o.grandTotal || 0);
          const half = Number((total / 2).toFixed(2));
          const remaining = Number((total - half).toFixed(2));
          if (!byPayment['CASH']) byPayment['CASH'] = { count: 0, total: 0 };
          byPayment['CASH'].count++;
          byPayment['CASH'].total += half;
          if (!byPayment['ONLINE']) byPayment['ONLINE'] = { count: 0, total: 0 };
          byPayment['ONLINE'].count++;
          byPayment['ONLINE'].total += remaining;
        }
      } else {
        if (!byPayment[pm]) byPayment[pm] = { count: 0, total: 0 };
        byPayment[pm].count++;
        byPayment[pm].total += (o.totalAmount || 0);
      }

      if (o.warehouseId) {
        const whId = String(o.warehouseId);
        if (!byWarehouse[whId]) byWarehouse[whId] = { count: 0, total: 0 };
        byWarehouse[whId].count++;
        byWarehouse[whId].total += (o.totalAmount || 0);
      }

      if (o.vendorId) {
        const vId = String(o.vendorId);
        if (!byVendor[vId]) byVendor[vId] = { count: 0, total: 0 };
        byVendor[vId].count++;
        byVendor[vId].total += (o.totalAmount || 0);
      }
    });
    return { total, revenue, avg, byStatus, byType, byFulfillment, byPayment, byWarehouse, byVendor };
  }, [orders]);

  const warehouseBreakdown = useMemo(() => {
    return Object.entries(stats.byWarehouse).map(([id, data]) => {
      const wh = warehouses.find(w => String(w.id) === id);
      return {
        name: wh?.name || `Warehouse #${id.substring(0,4)}`,
        ...data
      };
    }).sort((a,b) => b.total - a.total);
  }, [stats.byWarehouse, warehouses]);

  const vendorBreakdown = useMemo(() => {
    return Object.entries(stats.byVendor).map(([id, data]) => {
      const v = vendors.find(x => String(x.id) === id);
      return {
        name: v?.name || `Supplier #${id.substring(0,4)}`,
        ...data
      };
    }).sort((a,b) => b.total - a.total);
  }, [stats.byVendor, vendors]);

  const topWarehouses = useMemo(() => warehouseBreakdown.slice(0, 4), [warehouseBreakdown]);
  const topVendors = useMemo(() => vendorBreakdown.slice(0, 4), [vendorBreakdown]);

  const PAYMENT_LABELS = {
    CASH: 'Cash',
    CARD: 'Card',
    UPI: 'UPI / QR',
    CREDIT: 'Credit Account',
    UNPAID: 'Unpaid / Pending',
    ONLINE: 'Online Payment',
    MIXED: 'Mixed Payment',
    OTHER: 'Other'
  };

  const getFulfillmentIcon = (label) => {
    switch (label) {
      case 'Dine-In': return <FaUtensils className="cv-icon" style={{ color: '#f97316' }} />;
      case 'Takeaway': return <FaShoppingBag className="cv-icon" style={{ color: '#f97316' }} />;
      case 'Delivery': return <FaMotorcycle className="cv-icon" style={{ color: '#f97316' }} />;
      default: return <FaReceipt className="cv-icon" style={{ color: '#f97316' }} />;
    }
  };

  const getPaymentIcon = (label) => {
    const l = String(label).toUpperCase();
    if (l.includes('CASH')) return <FaMoneyBillWave className="cv-icon" style={{ color: '#10b981' }} />;
    if (l.includes('CARD')) return <FaCreditCard className="cv-icon" style={{ color: '#10b981' }} />;
    if (l.includes('UPI') || l.includes('QR') || l.includes('ONLINE')) return <FaQrcode className="cv-icon" style={{ color: '#10b981' }} />;
    if (l.includes('CREDIT')) return <FaReceipt className="cv-icon" style={{ color: '#10b981' }} />;
    if (l.includes('UNPAID') || l.includes('PENDING')) return <FaClock className="cv-icon" style={{ color: '#10b981' }} />;
    return <FaReceipt className="cv-icon" style={{ color: '#10b981' }} />;
  };

  /* donut: status segments */
  const donutData = useMemo(() => {
    if (!stats?.byStatus) return [];
    const entries = Object.entries(stats.byStatus);
    if (!entries.length) return [];
    const total = entries.reduce((s,[,v])=>s+v,0);
    let offset = 0;
    const CIRC = 2 * Math.PI * 52; // r=52
    return entries.map(([key,count]) => {
      const pct = count / total;
      const dash = pct * CIRC;
      const seg = { key, count, pct, dash, offset, ...STATUS_META[key]||STATUS_META.OTHER };
      offset += dash;
      return seg;
    });
  }, [stats.byStatus]);

  const totalVal = stats.revenue || 1;

  const fulfillmentList = [
    { label: 'Dine-In', ...stats.byFulfillment.DINE_IN, gradient: 'linear-gradient(90deg, #ea580c, #f97316)', shadow: 'rgba(249, 115, 22, 0.35)' },
    { label: 'Takeaway', ...stats.byFulfillment.TAKEAWAY, gradient: 'linear-gradient(90deg, #ea580c, #f97316)', shadow: 'rgba(249, 115, 22, 0.35)' },
    { label: 'Delivery', ...stats.byFulfillment.DELIVERY, gradient: 'linear-gradient(90deg, #ea580c, #f97316)', shadow: 'rgba(249, 115, 22, 0.35)' },
  ].filter(f => f.count > 0);

  const getPaymentMeta = (key) => {
    return { gradient: 'linear-gradient(90deg, #059669, #10b981)', shadow: 'rgba(16, 185, 129, 0.35)' };
  };

  const paymentList = Object.entries(stats.byPayment).map(([key, data]) => ({
    label: PAYMENT_LABELS[key] || key,
    key,
    ...data,
    ...getPaymentMeta(key)
  })).sort((a,b) => b.total - a.total);

  const hourlyBins = useMemo(() => {
    const bins = Array(24).fill(0);
    const safe = Array.isArray(orders) ? orders : [];
    const activeSales = safe.filter(o => o.status !== 'CANCELLED');
    activeSales.forEach(o => {
      const dateVal = o.orderDate || o.createdAt || o.created_at;
      if (!dateVal) return;
      const d = new Date(dateVal);
      const hour = d.getHours();
      if (hour >= 0 && hour < 24) {
        bins[hour]++;
      }
    });
    
    const formatted = bins.map((count, hour) => {
      const nextHour = (hour + 1) % 24;
      const fmtHr = h => {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hr12 = h % 12 || 12;
        return `${hr12} ${ampm}`;
      };
      return {
        hour,
        label: `${fmtHr(hour)} - ${fmtHr(nextHour)}`,
        count
      };
    });

    const maxCount = Math.max(...bins, 1);
    
    return {
      top: formatted.filter(b => b.count > 0).sort((a, b) => b.count - a.count).slice(0, 4),
      maxCount,
      all: formatted
    };
  }, [orders]);

  const topItems = useMemo(() => {
    const items = {};
    const safe = Array.isArray(orders) ? orders : [];
    const activeSales = safe.filter(o => o.status !== 'CANCELLED');
    activeSales.forEach(o => {
      const lines = o.lines || [];
      lines.forEach(l => {
        const name = l.productName || 'Unknown Item';
        const qty = Number(l.quantity || 0);
        const total = Number(l.lineTotal || 0);
        const orderCount = 1;
        if (!items[name]) {
          items[name] = { name, quantity: 0, total: 0, orderCount: 0 };
        }
        items[name].quantity += qty;
        items[name].total += total;
        items[name].orderCount += orderCount;
      });
    });
    return Object.values(items)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 7);
  }, [orders]);

  if (!orders.length) return <NoData/>;

  return (
    <div className="cv">
      <div className="cv-grid">
        {/* Status Donut */}
        <div className="cv-panel cv-donut-panel">
          <div className="cv-section-title">{isSale ? 'Order Status' : 'Purchase Status'}</div>
          <div className="cv-donut-wrap">
            <svg viewBox="0 0 120 120" className="cv-donut-svg">
              <circle cx="60" cy="60" r="52" fill="none" stroke="#f1f5f9" strokeWidth="14"/>
              {donutData.map((seg,i)=>(
                <circle
                  key={i}
                  cx="60" cy="60" r="52"
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="14"
                  strokeDasharray={`${seg.dash} ${2*Math.PI*52-seg.dash}`}
                  strokeDashoffset={-seg.offset}
                  style={{transform:'rotate(-90deg)',transformOrigin:'60px 60px'}}
                />
              ))}
              <text x="60" y="58" textAnchor="middle" className="donut-center-val">{fmtN(orders.length)}</text>
              <text x="60" y="71" textAnchor="middle" className="donut-center-label">{isSale ? 'Orders' : 'Purchases'}</text>
            </svg>
            <div className="cv-legend">
              {donutData.map((seg,i)=>(
                <div key={i} className="cv-legend-row">
                  <span className="cv-legend-dot" style={{background:seg.color}}/>
                  <span className="cv-legend-name">{seg.label}</span>
                  <span className="cv-legend-count" style={{color:seg.color}}>{seg.count}</span>
                  <span className="cv-legend-pct">{Math.round(seg.pct*100)}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="cv-divider" />

          <div className="cv-section-title cv-title-orange">Peak Activity Times</div>
          <div className="cv-breakdown-list">
            {hourlyBins.top.length > 0 ? (
              hourlyBins.top.map((b, i) => {
                const pct = (b.count / hourlyBins.maxCount) * 100;
                return (
                  <div key={i} className="cv-breakdown-item">
                    <div className="cv-bi-info">
                      <div className="cv-bi-left">
                        <FaClock className="cv-icon" style={{ color: '#f97316' }} />
                        <span className="cv-bi-label">{b.label}</span>
                      </div>
                      <div className="cv-bi-right">
                        <span className="cv-bi-count">{b.count} {b.count === 1 ? 'order' : 'orders'}</span>
                      </div>
                    </div>
                    <div className="cv-progress-track">
                      <div 
                        className="cv-progress-bar" 
                        style={{ 
                          width: `${pct}%`, 
                          background: `linear-gradient(90deg, #ea580c, #f97316)`,
                          boxShadow: `0 2px 8px rgba(249, 115, 22, 0.35)`
                        }} 
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="cv-nil-text">No activity recorded</div>
            )}
          </div>
        </div>

        {/* Breakdown Panel */}
        <div className="cv-panel cv-breakdown-panel">
          {isSale ? (
            <>
              <div className="cv-section-title cv-title-orange">Order Type</div>
              <div className="cv-breakdown-list">
                {fulfillmentList.length > 0 ? (
                  fulfillmentList.map((f, i) => {
                    const pct = (f.total / totalVal) * 100;
                    return (
                      <div key={i} className="cv-breakdown-item">
                        <div className="cv-bi-info">
                          <div className="cv-bi-left">
                            {getFulfillmentIcon(f.label)}
                            <span className="cv-bi-label">{f.label}</span>
                          </div>
                          <div className="cv-bi-right">
                            <span className="cv-bi-count">{f.count} {f.count === 1 ? 'order' : 'orders'}</span>
                            <span className="cv-bi-amount">{fmtC(f.total)}</span>
                          </div>
                        </div>
                        <div className="cv-progress-track">
                          <div 
                            className="cv-progress-bar" 
                            style={{ 
                              width: `${pct}%`, 
                              background: f.gradient,
                              boxShadow: `0 2px 8px ${f.shadow}`
                            }} 
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="cv-nil-text">No fulfillment data</div>
                )}
              </div>

              <div className="cv-divider" />

              <div className="cv-section-title cv-title-green">Payment Method Share</div>
              <div className="cv-breakdown-list">
                {paymentList.length > 0 ? (
                  paymentList.map((p, i) => {
                    const pct = (p.total / totalVal) * 100;
                    return (
                      <div key={i} className="cv-breakdown-item">
                        <div className="cv-bi-info">
                          <div className="cv-bi-left">
                            {getPaymentIcon(p.label)}
                            <span className="cv-bi-label">{p.label}</span>
                          </div>
                          <div className="cv-bi-right">
                            <span className="cv-bi-count">{p.count} txn</span>
                            <span className="cv-bi-amount">{fmtC(p.total)}</span>
                          </div>
                        </div>
                        <div className="cv-progress-track">
                          <div 
                            className="cv-progress-bar" 
                            style={{ 
                              width: `${pct}%`, 
                              background: p.gradient,
                              boxShadow: `0 2px 8px ${p.shadow}`
                            }} 
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="cv-nil-text">No payment data</div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="cv-section-title cv-title-orange">Warehouse Distribution</div>
              <div className="cv-breakdown-list">
                {topWarehouses.length > 0 ? (
                  topWarehouses.map((w, i) => {
                    const pct = (w.total / totalVal) * 100;
                    return (
                      <div key={i} className="cv-breakdown-item">
                        <div className="cv-bi-info">
                          <div className="cv-bi-left">
                            <FaWarehouse className="cv-icon" style={{ color: '#f97316' }} />
                            <span className="cv-bi-label">{w.name}</span>
                          </div>
                          <div className="cv-bi-right">
                            <span className="cv-bi-count">{w.count} POs</span>
                            <span className="cv-bi-amount">{fmtC(w.total)}</span>
                          </div>
                        </div>
                        <div className="cv-progress-track">
                          <div 
                            className="cv-progress-bar" 
                            style={{ 
                              width: `${pct}%`, 
                              background: `linear-gradient(90deg, #ea580c, #f97316)`,
                              boxShadow: `0 2px 8px rgba(249, 115, 22, 0.35)`
                            }} 
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="cv-nil-text">No warehouse data</div>
                )}
              </div>

              <div className="cv-divider" />

              <div className="cv-section-title cv-title-green">Top Suppliers</div>
              <div className="cv-breakdown-list">
                {topVendors.length > 0 ? (
                  topVendors.map((v, i) => {
                    const pct = (v.total / totalVal) * 100;
                    return (
                      <div key={i} className="cv-breakdown-item">
                        <div className="cv-bi-info">
                          <div className="cv-bi-left">
                            <FaHandshake className="cv-icon" style={{ color: '#10b981' }} />
                            <span className="cv-bi-label">{v.name}</span>
                          </div>
                          <div className="cv-bi-right">
                            <span className="cv-bi-count">{v.count} POs</span>
                            <span className="cv-bi-amount">{fmtC(v.total)}</span>
                          </div>
                        </div>
                        <div className="cv-progress-track">
                          <div 
                            className="cv-progress-bar" 
                            style={{ 
                              width: `${pct}%`, 
                              background: `linear-gradient(90deg, #059669, #10b981)`,
                              boxShadow: `0 2px 8px rgba(16, 185, 129, 0.35)`
                            }} 
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="cv-nil-text">No supplier data</div>
                )}
              </div>
            </>
          )}
        </div>

      </div>

      {/* ── Full-width Best Selling Products ── */}
      {topItems.length > 0 && (
        <div className="cv-bsp-full">
          <div className="cv-section-title cv-title-green">
            {isSale ? 'Best Selling Products' : 'Most Ordered Products'}
          </div>
          <div className="bsp-list">
            {(() => {
              const maxQty = Math.max(...topItems.map(i => i.quantity), 1);
              return topItems.map((item, i) => {
                const pct = (item.quantity / maxQty) * 100;
                return (
                  <div key={i} className="bsp-row">
                    <div className="bsp-row-info">
                      <div className="bsp-row-left">
                        <span className="bsp-row-rank">#{i + 1}</span>
                        <span className="bsp-row-name">{item.name}</span>
                      </div>
                      <div className="bsp-row-right">
                        <span className="bsp-row-qty">{fmtN(item.quantity)} qty</span>
                        <span className="bsp-row-rev">{fmtC(item.total)}</span>
                      </div>
                    </div>
                    <div className="bsp-row-track">
                      <div className="bsp-row-bar" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      <style jsx>{`
        .cv { padding:24px; display:flex; flex-direction:column; gap:28px; }
        .cv-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 28px; max-width: 100%; }
        .cv-panel { background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; padding:28px; display: flex; flex-direction: column; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
        .cv-donut-panel { gap: 16px; }
        .cv-breakdown-panel { gap: 16px; }

        /* Full-width BSP section */
        .cv-bsp-full { background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; padding:28px; box-shadow:0 4px 12px rgba(0,0,0,0.03); display:flex; flex-direction:column; gap:16px; }
        .bsp-list { display:flex; flex-direction:column; gap:14px; }
        .bsp-row { display:flex; flex-direction:column; gap:6px; transition:transform .15s; }
        .bsp-row:hover { transform:translateX(2px); }
        .bsp-row-info { display:flex; justify-content:space-between; align-items:center; }
        .bsp-row-left { display:flex; align-items:center; gap:10px; }
        .bsp-row-rank { font-size:10px; font-weight:800; color:#94a3b8; background:#f1f5f9; padding:2px 7px; border-radius:6px; flex-shrink:0; }
        .bsp-row-name { font-size:13px; font-weight:700; color:#334155; }
        .bsp-row-right { display:flex; align-items:center; gap:10px; }
        .bsp-row-qty { font-size:10px; font-weight:700; color:#64748b; background:#f1f5f9; padding:2px 8px; border-radius:999px; }
        .bsp-row-rev { font-size:12.5px; font-weight:800; color:#0f172a; font-family:'JetBrains Mono',monospace; }
        .bsp-row-track { height:6px; background:#f1f5f9; border-radius:999px; overflow:hidden; }
        .bsp-row-bar { height:100%; border-radius:999px; background:linear-gradient(90deg,#059669,#10b981); transition:width .6s cubic-bezier(.4,0,.2,1); }
        
        .cv-section-title { font-size:11px; font-weight:800; color:#475569; text-transform:uppercase; letter-spacing:.08em; margin-bottom:14px; display: flex; align-items: center; gap: 8px; }
        .cv-section-title::before { content: ''; display: inline-block; width: 4px; height: 12px; background: var(--theme-color); border-radius: 999px; }
        .cv-title-orange::before { background: #f97316 !important; }
        .cv-title-green::before { background: #10b981 !important; }
        .cv-title-blue::before { background: #3b82f6 !important; }
        
        /* Donut */
        .cv-donut-wrap { display:flex; align-items:center; gap:36px; justify-content:center; }
        .cv-donut-svg { width:180px; height:180px; flex-shrink:0; }
        .donut-center-val { font-size:16px; font-weight:900; fill:#0f172a; }
        .donut-center-label { font-size:8px; font-weight:700; fill:#94a3b8; }
        .cv-legend { display:flex; flex-direction:column; gap:8px; flex:1; }
        .cv-legend-row { display:grid; grid-template-columns:10px 1fr auto 38px; align-items:center; gap:8px; }

        @media(max-width:640px) { .bsp-list { gap:10px; } }
        .cv-legend-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .cv-legend-name { font-size:11.5px; font-weight:700; color:#334155; }
        .cv-legend-count { font-size:12px; font-weight:800; text-align:right; }
        .cv-legend-pct { font-size:10.5px; font-weight:700; color:#94a3b8; text-align:right; }

        /* Breakdown items */
        .cv-breakdown-list { display: flex; flex-direction: column; gap: 16px; }
        .cv-breakdown-item { display: flex; flex-direction: column; gap: 6px; transition: transform 0.2s ease; }
        .cv-breakdown-item:hover { transform: translateX(2px); }
        .cv-bi-info { display: flex; justify-content: space-between; align-items: center; }
        
        .cv-bi-left { display: flex; align-items: center; gap: 8px; }
        .cv-bi-label { font-size: 12.5px; font-weight: 700; color: #334155; }
        
        .cv-bi-right { display: flex; align-items: center; gap: 8px; }
        .cv-bi-count { font-size: 10px; font-weight: 700; color: #64748b; background: #f1f5f9; padding: 2px 8px; border-radius: 999px; text-transform: uppercase; }
        .cv-bi-amount { font-size: 12px; font-weight: 800; color: #0f172a; font-family: 'JetBrains Mono', monospace; }
        
        :global(.cv-icon) { font-size: 13px; display: inline-block; }

        .cv-progress-track { height: 8px; background: #f1f5f9; border-radius: 999px; overflow: hidden; }
        .cv-progress-bar { height: 100%; border-radius: 999px; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
        .cv-divider { height: 1px; background: #f1f5f9; margin: 8px 0; }
        .cv-nil-text { font-size: 11.5px; font-weight: 600; color: #94a3b8; text-align: center; padding: 12px 0; }

        @media(max-width:768px) {
          .cv { padding: 12px; gap: 16px; }
          .cv-grid { grid-template-columns: 1fr; gap: 16px; }
          .cv-panel { padding: 16px; }
          .cv-bsp-full { padding: 16px; }
          .cv-donut-wrap { flex-direction: column; gap: 20px; }
          .cv-donut-svg { width: 150px; height: 150px; }
          .cv-breakdown-item:hover { transform: none; }
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GRAPH VIEW — Animated bar chart of revenue + order count per type
   ═══════════════════════════════════════════════════════════════════════════ */
function GraphView({ orders, themeColor, themeColorRgb, orderType, dateFrom, dateTo, vendors = [], warehouses = [], currencySymbol = '₹' }) {
  const fmtC = n => `${currencySymbol}${fmt(n)}`;
  const [metric, setMetric] = useState('revenue'); // 'revenue' | 'count'
  const isSale = orderType === 'SALE';

  /* ── breakdown stats ── */
  const breakdown = useMemo(() => {
    const safe = Array.isArray(orders) ? orders : [];
    const activeSales = safe.filter(o => o.status !== 'CANCELLED');
    const totalRev = activeSales.reduce((s, o) => s + (o.totalAmount || 0), 0) || 1;

    // fulfillment (sales)
    const byFulfillment = { DINE_IN: { count: 0, total: 0 }, TAKEAWAY: { count: 0, total: 0 }, DELIVERY: { count: 0, total: 0 } };
    // payment
    const byPayment = {};
    // items
    const byItem = {};
    // warehouse / vendor (purchase)
    const byWarehouse = {};
    const byVendor = {};

    activeSales.forEach(o => {
      // fulfillment
      if (o.tableNumber || o.table_number) {
        byFulfillment.DINE_IN.count++; byFulfillment.DINE_IN.total += (o.totalAmount || 0);
      } else {
        const ft = String(o.fulfillmentType || o.fulfillment_type || '').toUpperCase();
        if (ft === 'TAKEAWAY') { byFulfillment.TAKEAWAY.count++; byFulfillment.TAKEAWAY.total += (o.totalAmount || 0); }
        else if (ft === 'DELIVERY') { byFulfillment.DELIVERY.count++; byFulfillment.DELIVERY.total += (o.totalAmount || 0); }
        else { byFulfillment.DINE_IN.count++; byFulfillment.DINE_IN.total += (o.totalAmount || 0); }
      }
      // payment
      const pm = String(o.paymentMethod || o.payment_method || 'UNPAID').toUpperCase();
      if (pm === 'MIXED') {
        const cash = parseFloat(o.cashAmount || o.cash_amount || 0);
        const online = parseFloat(o.onlineAmount || o.online_amount || 0);
        if (cash > 0) {
          if (!byPayment['CASH']) byPayment['CASH'] = { count: 0, total: 0 };
          byPayment['CASH'].count++;
          byPayment['CASH'].total += cash;
        }
        if (online > 0) {
          if (!byPayment['ONLINE']) byPayment['ONLINE'] = { count: 0, total: 0 };
          byPayment['ONLINE'].count++;
          byPayment['ONLINE'].total += online;
        }
        if (cash === 0 && online === 0) {
          const total = parseFloat(o.totalAmount || o.grandTotal || 0);
          const half = Number((total / 2).toFixed(2));
          const remaining = Number((total - half).toFixed(2));
          if (!byPayment['CASH']) byPayment['CASH'] = { count: 0, total: 0 };
          byPayment['CASH'].count++;
          byPayment['CASH'].total += half;
          if (!byPayment['ONLINE']) byPayment['ONLINE'] = { count: 0, total: 0 };
          byPayment['ONLINE'].count++;
          byPayment['ONLINE'].total += remaining;
        }
      } else {
        if (!byPayment[pm]) byPayment[pm] = { count: 0, total: 0 };
        byPayment[pm].count++;
        byPayment[pm].total += (o.totalAmount || 0);
      }
      // items
      (o.lines || []).forEach(l => {
        const n = l.productName || 'Unknown';
        if (!byItem[n]) byItem[n] = { name: n, quantity: 0, total: 0 };
        byItem[n].quantity += Number(l.quantity || 0);
        byItem[n].total += Number(l.lineTotal || 0);
      });
      // warehouse / vendor
      if (o.warehouseId) {
        const id = String(o.warehouseId);
        if (!byWarehouse[id]) byWarehouse[id] = { count: 0, total: 0 };
        byWarehouse[id].count++; byWarehouse[id].total += (o.totalAmount || 0);
      }
      if (o.vendorId) {
        const id = String(o.vendorId);
        if (!byVendor[id]) byVendor[id] = { count: 0, total: 0 };
        byVendor[id].count++; byVendor[id].total += (o.totalAmount || 0);
      }
    });

    const PAYMENT_LABELS = { CASH:'Cash', CARD:'Card', UPI:'UPI / QR', CREDIT:'Credit Account', UNPAID:'Unpaid / Pending', ONLINE:'Online Payment', MIXED:'Mixed Payment', OTHER:'Other' };

    const fulfillmentList = [
      { label: 'Dine-In',  ...byFulfillment.DINE_IN },
      { label: 'Takeaway', ...byFulfillment.TAKEAWAY },
      { label: 'Delivery', ...byFulfillment.DELIVERY },
    ].filter(f => f.count > 0);

    const paymentList = Object.entries(byPayment)
      .map(([key, d]) => ({ label: PAYMENT_LABELS[key] || key, ...d }))
      .sort((a, b) => b.total - a.total);

    const topItems = Object.values(byItem)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 7);

    const warehouseList = Object.entries(byWarehouse).map(([id, d]) => {
      const wh = warehouses.find(w => String(w.id) === id);
      return { name: wh?.name || `Warehouse #${id.substring(0,4)}`, ...d };
    }).sort((a, b) => b.total - a.total).slice(0, 5);

    const vendorList = Object.entries(byVendor).map(([id, d]) => {
      const v = vendors.find(x => String(x.id) === id);
      return { name: v?.name || `Supplier #${id.substring(0,4)}`, ...d };
    }).sort((a, b) => b.total - a.total).slice(0, 5);

    return { totalRev, fulfillmentList, paymentList, topItems, warehouseList, vendorList };
  }, [orders, vendors, warehouses]);

  // 1. Group orders by hour or day to create a continuous trend list
  const trendData = useMemo(() => {
    const safe = Array.isArray(orders) ? orders : [];
    const activeSales = safe.filter(o => o.status !== 'CANCELLED');
    
    // Parse filters
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    
    // Check if we are doing hourly grouping (diff <= 36 hours)
    const diffHours = Math.abs(end - start) / (1000 * 60 * 60);
    const isHourly = diffHours <= 36;
    
    const bins = {};
    
    if (isHourly) {
      // Generate hourly slots
      let current = new Date(start);
      current.setMinutes(0, 0, 0);
      while (current <= end) {
        const key = current.toISOString().substring(0, 13) + ':00'; // YYYY-MM-DDTHH:00
        const label = current.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        bins[key] = { label, revenue: 0, count: 0, timestamp: current.getTime() };
        current.setHours(current.getHours() + 1);
      }
      
      // Accumulate order values
      activeSales.forEach(o => {
        const dateVal = o.orderDate || o.createdAt || o.created_at;
        if (!dateVal) return;
        const d = new Date(dateVal);
        d.setMinutes(0, 0, 0);
        const key = d.toISOString().substring(0, 13) + ':00';
        if (bins[key]) {
          bins[key].revenue += (o.totalAmount || 0);
          bins[key].count++;
        }
      });
    } else {
      // Generate daily slots
      let current = new Date(start);
      current.setHours(0, 0, 0, 0);
      const endDay = new Date(end);
      endDay.setHours(0, 0, 0, 0);
      
      while (current <= endDay) {
        const key = current.toISOString().substring(0, 10); // YYYY-MM-DD
        const label = current.toLocaleDateString([], { day: '2-digit', month: 'short' });
        bins[key] = { label, revenue: 0, count: 0, timestamp: current.getTime() };
        current.setDate(current.getDate() + 1);
      }
      
      // Accumulate order values
      activeSales.forEach(o => {
        const dateVal = o.orderDate || o.createdAt || o.created_at;
        if (!dateVal) return;
        const d = new Date(dateVal);
        const key = d.toISOString().substring(0, 10);
        if (bins[key]) {
          bins[key].revenue += (o.totalAmount || 0);
          bins[key].count++;
        }
      });
    }
    
    return Object.values(bins).sort((a, b) => a.timestamp - b.timestamp);
  }, [orders, dateFrom, dateTo]);

  const maxVal = useMemo(() => {
    if (trendData.length === 0) return 1;
    const values = trendData.map(d => metric === 'revenue' ? d.revenue : d.count);
    return Math.max(...values, 0) || 1;
  }, [trendData, metric]);

  const gridLines = useMemo(() => {
    return [
      maxVal,
      maxVal * 0.75,
      maxVal * 0.50,
      maxVal * 0.25,
      0
    ];
  }, [maxVal]);

  const formatYLabel = (val) => {
    if (metric === 'revenue') {
      return fmtC(val);
    } else {
      return Math.round(val).toString();
    }
  };

  if (!orders.length) return <NoData/>;

  return (
    <div className="gv" style={{ '--theme-color': themeColor, '--theme-color-rgb': themeColorRgb }}>
      {/* metric toggle */}
      <div className="gv-header">
        <span className="gv-title">{isSale ? 'Sales Analytics' : 'Purchases Analytics'}</span>
        <div className="gv-metric-tabs">
          <button className={`gv-mt${metric==='revenue'?' gv-mt--on':''}`} onClick={()=>setMetric('revenue')}>Revenue</button>
          <button className={`gv-mt${metric==='count'?' gv-mt--on':''}`}   onClick={()=>setMetric('count')}>Count</button>
        </div>
      </div>

      <div className="gv-body-trend">
        {/* Trend Panel */}
        <div className="gv-panel">
          <div className="gv-panel-title">{metric === 'revenue' ? 'Revenue Trend' : 'Order Count Trend'}</div>
          
          <div className="gv-chart-container">
            {/* Background grid lines */}
            <div className="gv-chart-grid-lines">
              {gridLines.map((val, idx) => (
                <div key={idx} className={`grid-line ${val === 0 ? 'zero' : ''}`}>
                  <span className="grid-line-label">{formatYLabel(val)}</span>
                </div>
              ))}
            </div>

            {/* Bars container */}
            <div className="gv-hourly-chart">
              {trendData.map((d, i) => {
                const val = metric === 'revenue' ? d.revenue : d.count;
                const pct = (val / maxVal) * 100;
                return (
                  <div key={i} className="gv-hour-col">
                    <div className="gv-hour-bar-area">
                      <div 
                        className="gv-hour-bar" 
                        style={{ 
                          height: `${Math.max(pct, 2)}%`,
                          background: `linear-gradient(180deg, var(--theme-color), rgba(var(--theme-color-rgb), 0.15))`,
                          boxShadow: `0 4px 10px rgba(var(--theme-color-rgb), 0.15)`
                        }}
                      >
                        <span className="gv-hour-tip">
                          <span className="tip-amt">{fmtC(d.revenue)}</span>
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
      </div>

      {/* ── Breakdown panels ── */}
      <div className="gv-breakdown-grid">

        {/* Order Type / Fulfillment OR Warehouse */}
        <div className="gv-bd-panel">
          <div className="gv-panel-title gv-title-orange">{isSale ? 'Order Type' : 'Warehouse Distribution'}</div>
          {(isSale ? breakdown.fulfillmentList : breakdown.warehouseList).length > 0 ? (
            (() => {
              const list = isSale ? breakdown.fulfillmentList : breakdown.warehouseList;
              const values = list.map(item => metric === 'revenue' ? item.total : item.count);
              const maxVal = Math.max(...values, 1);
              return (
                <div className="gv-bd-chart">
                  {list.map((item, i) => {
                    const val = metric === 'revenue' ? item.total : item.count;
                    const pct = (val / maxVal) * 100;
                    const name = item.name || item.label;
                    return (
                      <div key={i} className="gv-bd-col">
                        <div className="gv-bd-bar-area">
                          <div 
                            className="gv-bd-bar gv-bar-orange" 
                            style={{ 
                              height: `${Math.max(pct, 4)}%`,
                            }}
                          >
                            <span className="gv-bd-tip">
                              <span className="tip-name">{name}</span>
                              <span className="tip-amt">{fmtC(item.total)}</span>
                              <span className="tip-orders">{item.count} {isSale ? 'orders' : 'POs'}</span>
                            </span>
                          </div>
                        </div>
                        <div className="gv-bd-label" title={name}>{name}</div>
                        <div className="gv-bd-value">{metric === 'revenue' ? fmtC(val) : `${val} ${isSale ? 'ord' : 'pos'}`}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          ) : <div className="gv-bd-nil">No data</div>}
        </div>

        {/* Payment Methods OR Top Vendors */}
        <div className="gv-bd-panel">
          <div className="gv-panel-title gv-title-green">{isSale ? 'Payment Method Share' : 'Top Suppliers'}</div>
          {(isSale ? breakdown.paymentList : breakdown.vendorList).length > 0 ? (
            (() => {
              const list = isSale ? breakdown.paymentList : breakdown.vendorList;
              const values = list.map(item => metric === 'revenue' ? item.total : item.count);
              const maxVal = Math.max(...values, 1);
              return (
                <div className="gv-bd-chart">
                  {list.map((item, i) => {
                    const val = metric === 'revenue' ? item.total : item.count;
                    const pct = (val / maxVal) * 100;
                    const name = item.name || item.label;
                    return (
                      <div key={i} className="gv-bd-col">
                        <div className="gv-bd-bar-area">
                          <div 
                            className="gv-bd-bar gv-bar-green" 
                            style={{ 
                              height: `${Math.max(pct, 4)}%`,
                            }}
                          >
                            <span className="gv-bd-tip">
                              <span className="tip-name">{name}</span>
                              <span className="tip-amt">{fmtC(item.total)}</span>
                              <span className="tip-orders">{item.count} {isSale ? 'txn' : 'POs'}</span>
                            </span>
                          </div>
                        </div>
                        <div className="gv-bd-label" title={name}>{name}</div>
                        <div className="gv-bd-value">{metric === 'revenue' ? fmtC(val) : `${val} ${isSale ? 'txn' : 'pos'}`}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          ) : <div className="gv-bd-nil">No data</div>}
        </div>

      </div>

      {/* ── Best Selling Products full-width ── */}
      {breakdown.topItems.length > 0 && (
        <div className="gv-bsp-panel">
          <div className="gv-panel-title gv-title-green">{isSale ? 'Best Selling Products' : 'Most Ordered Products'}</div>
          {(() => {
            const list = breakdown.topItems;
            const values = list.map(item => metric === 'revenue' ? item.total : item.quantity);
            const maxVal = Math.max(...values, 1);
            return (
              <div className="gv-bd-chart gv-bsp-chart">
                {list.map((item, idx) => {
                  const val = metric === 'revenue' ? item.total : item.quantity;
                  const pct = (val / maxVal) * 100;
                  return (
                    <div key={idx} className="gv-bd-col">
                      <div className="gv-bd-bar-area">
                        <div 
                          className="gv-bd-bar gv-bar-green" 
                          style={{ 
                            height: `${Math.max(pct, 4)}%`,
                          }}
                        >
                          <span className="gv-bd-tip">
                            <span className="tip-name">{item.name}</span>
                            <span className="tip-amt">{fmtC(item.total)}</span>
                            <span className="tip-orders">{fmtN(item.quantity)} qty</span>
                          </span>
                        </div>
                      </div>
                      <div className="gv-bd-rank">#{idx + 1}</div>
                      <div className="gv-bd-label gv-bsp-label" title={item.name}>{item.name}</div>
                      <div className="gv-bd-value">{metric === 'revenue' ? fmtC(val) : `${fmtN(val)} qty`}</div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
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

        .gv-body-trend { display:flex; flex-direction:column; gap:18px; }
        .gv-panel { background:#fafafa; border:1px solid #f1f5f9; border-radius:14px; padding:18px; }
        .gv-panel-title { font-size:11.5px; font-weight:800; color:#475569; text-transform:uppercase; letter-spacing:.07em; margin-bottom:16px; }

        /* HTML/CSS Grid Chart Styling */
        .gv-chart-container {
          position: relative;
          padding-left: 90px;
          padding-top: 20px;
          margin-top: 10px;
          min-height: 330px;
        }
        .gv-chart-grid-lines {
          position: absolute;
          inset: 30px 0 50px 90px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          pointer-events: none;
        }
        .grid-line {
          width: 100%;
          border-bottom: 1px dashed #e2e8f0;
          position: relative;
        }
        .grid-line.zero {
          border-bottom: 1.5px solid #cbd5e1;
        }
        .grid-line-label {
          position: absolute;
          left: -90px;
          bottom: -7px;
          width: 80px;
          text-align: right;
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          font-family: 'JetBrains Mono', monospace;
        }
        .gv-hourly-chart {
          display: flex;
          gap: 20px;
          justify-content: flex-start;
          align-items: flex-end;
          min-height: 270px;
          overflow-x: auto;
          position: relative;
          z-index: 2;
          padding-top: 30px;
          padding-left: 10px;
          padding-right: 10px;
          padding-bottom: 10px;
          -webkit-overflow-scrolling: touch;
        }
        .gv-hour-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 58px;
          flex-shrink: 0;
        }
        .gv-hour-bar-area {
          width: 100%;
          height: 200px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          position: relative;
        }
        .gv-hour-bar {
          width: 20px;
          border-radius: 8px 8px 0 0;
          position: relative;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          min-height: 4px;
          cursor: pointer;
        }
        .gv-hour-bar:hover {
          opacity: 0.9;
          transform: scaleX(1.1);
        }
        .gv-hour-tip {
          position: absolute;
          bottom: 105%;
          left: 50%;
          transform: translateX(-50%) translateY(4px);
          background: #0f172a;
          color: white;
          padding: 6px 10px;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          opacity: 0;
          pointer-events: none;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
          z-index: 10;
          white-space: nowrap;
        }
        .gv-hour-tip::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 5px solid #0f172a;
        }
        .gv-hour-bar:hover .gv-hour-tip {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
        .tip-amt {
          font-size: 10.5px;
          font-weight: 800;
          font-family: 'JetBrains Mono', monospace;
        }
        .tip-orders {
          font-size: 8px;
          font-weight: 700;
          color: #ffedd5;
          text-transform: uppercase;
        }
        .gv-hour-label {
          font-size: 10px;
          font-weight: 700;
          color: #475569;
          margin-top: 10px;
        }
        .gv-hour-badge {
          font-size: 9px;
          color: #475569;
          background: #f1f5f9;
          padding: 2px 8px;
          border-radius: 999px;
          font-weight: 800;
          margin-top: 6px;
          text-transform: uppercase;
          border: 1px solid #e2e8f0;
          white-space: nowrap;
        }

        /* breakdown grid */
        .gv-breakdown-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:16px; }
        .gv-bd-panel { background:#fafafa; border:1px solid #f1f5f9; border-radius:14px; padding:18px; display:flex; flex-direction:column; gap:14px; }
        .gv-bsp-panel { background:#fafafa; border:1px solid #f1f5f9; border-radius:14px; padding:18px; display:flex; flex-direction:column; gap:14px; }
        .gv-panel-title { font-size:11px; font-weight:800; color:#475569; text-transform:uppercase; letter-spacing:.08em; display:flex; align-items:center; gap:8px; }
        .gv-panel-title::before { content:''; display:inline-block; width:4px; height:12px; background:var(--theme-color); border-radius:999px; }
        .gv-title-orange::before { background:#f97316 !important; }
        .gv-title-green::before  { background:#10b981 !important; }
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
        .gv-bd-label { font-size:10px; font-weight:700; color:#475569; text-align:center; width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:6px; }
        .gv-bsp-label { max-width:65px; }
        .gv-bd-value { font-size:9px; font-weight:800; color:#94a3b8; font-family:'JetBrains Mono',monospace; margin-top:2px; text-align:center; width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .gv-bd-nil { font-size:11.5px; font-weight:600; color:#94a3b8; text-align:center; padding:8px 0; }

        @media(max-width: 640px) {
          .gv { padding: 12px; gap: 12px; }
          .gv-header { flex-direction: column; align-items: stretch; gap: 8px; }
          .gv-title { text-align: center; }
          .gv-metric-tabs { justify-content: center; }
          .gv-breakdown-grid { grid-template-columns: 1fr; }
          .gv-bd-chart {
            gap: 8px;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            justify-content: flex-start;
            padding-left: 12px;
            padding-right: 12px;
          }
          .gv-bd-chart .gv-bd-col {
            flex-shrink: 0;
            width: 65px;
          }
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TABLE VIEW — filter tabs + sortable table
   ═══════════════════════════════════════════════════════════════════════════ */
function TableView({ orders, themeColor, orderType, onViewOrder, currencySymbol = '₹' }) {
  const fmtC = n => `${currencySymbol}${fmt(n)}`;
  const [filter,  setFilter]  = useState('ALL');
  const [sortKey, setSortKey] = useState('amount');
  const [sortDir, setSortDir] = useState('desc');

  const FILTERS = [
    { key:'ALL',       label:'All' },
    { key:'ORDERED',   label:'Ordered' },
    { key:'BILLED',    label:'Billed' },
    { key:'COMPLETED', label:'Completed' },
    { key:'CANCELLED', label:'Cancelled' },
  ];

  const normalise = status => {
    return String(status||'').toUpperCase();
  };

  const filtered = useMemo(() => {
    const safe = Array.isArray(orders) ? orders : [];
    let list = filter==='ALL' ? [...safe] : safe.filter(o=>normalise(o.status)===filter);
    list.sort((a,b)=>{
      const v = sortKey==='amount'
        ? (a.totalAmount||0)-(b.totalAmount||0)
        : sortKey==='orderNo'
        ? String(a.orderNo || a.order_no || a.id || '').localeCompare(String(b.orderNo || b.order_no || b.id || ''))
        : sortKey==='createdBy'
        ? String(a.createdBy||a.created_by||'').localeCompare(String(b.createdBy||b.created_by||''))
        : sortKey==='updatedBy'
        ? String(a.updatedBy||a.updated_by||'').localeCompare(String(b.updatedBy||b.updated_by||''))
        : sortKey==='status'
        ? String(a.status||'').localeCompare(String(b.status||''))
        : String(a[sortKey]||'').localeCompare(String(b[sortKey]||''));
      return sortDir==='asc' ? v : -v;
    });
    return list;
  }, [orders, filter, sortKey, sortDir]);

  const toggleSort = key => {
    if (sortKey===key) setSortDir(d=>d==='asc'?'desc':'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const safeO = Array.isArray(orders) ? orders : [];
  const count = key => key==='ALL' ? safeO.length
    : safeO.filter(o=>normalise(o.status)===key).length;

  if (!orders.length) return <NoData/>;

  return (
    <div className="tv" style={{ '--theme-color': themeColor }}>
      {/* filter bar */}
      <div className="tv-bar">
        {FILTERS.map(f=>(
          <button
            key={f.key}
            className={`tv-filter${filter===f.key?' tv-filter--on':''}`}
            onClick={()=>setFilter(f.key)}
          >
            {f.label}
            <span className="tv-cnt">{count(f.key)}</span>
          </button>
        ))}
        <span className="tv-result">{filtered.length} record{filtered.length!==1?'s':''}</span>
      </div>

      {/* table */}
      <div className="tv-wrap">
        <table className="tv-table">
          <thead>
            <tr>
              <th onClick={()=>toggleSort('orderNo')} className="tv-th-sort">
                Document No {sortKey==='orderNo'?(sortDir==='asc'?'↑':'↓'):''}
              </th>
              <th onClick={()=>toggleSort('status')} className="tv-th-sort">
                Status {sortKey==='status'?(sortDir==='asc'?'↑':'↓'):''}
              </th>
              <th onClick={()=>toggleSort('createdBy')} className="tv-th-sort">
                Created By {sortKey==='createdBy'?(sortDir==='asc'?'↑':'↓'):''}
              </th>
              <th onClick={()=>toggleSort('updatedBy')} className="tv-th-sort">
                Updated By {sortKey==='updatedBy'?(sortDir==='asc'?'↑':'↓'):''}
              </th>
              <th onClick={()=>toggleSort('amount')} className="tv-th-sort tv-r">
                Total {sortKey==='amount'?(sortDir==='asc'?'↑':'↓'):''}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o,i)=>{
              const sm = sMeta(o.status);
              return (
                <tr key={o.id||i} className="tv-row" onClick={()=>onViewOrder(o)}>
                  <td>
                    <code className="tv-oid">
                      {o.orderNo || o.order_no || `#${String(o.id || '').substring(0, 8).toUpperCase()}`}
                    </code>
                  </td>
                  <td>
                    <span className="tv-badge" style={{color:sm.color,background:sm.bg}}>
                      {sm.label}
                    </span>
                  </td>
                  <td><span className="tv-user">{o.createdBy || o.created_by || '—'}</span></td>
                  <td><span className="tv-user">{o.updatedBy || o.updated_by || '—'}</span></td>
                  <td className="tv-r tv-amount">{fmtC(o.totalAmount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .tv { display:flex; flex-direction:column; }

        /* filter bar */
        .tv-bar { display:flex; align-items:center; gap:6px; padding:10px 18px; border-bottom:1px solid #f1f5f9; background:#fafafa; flex-wrap:wrap; }
        .tv-filter { display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:999px; border:1.5px solid #e2e8f0; background:white; color:#64748b; font-size:11px; font-weight:700; cursor:pointer; transition:all .18s; }
        .tv-filter:hover { border-color:var(--theme-color); color:var(--theme-color); }
        .tv-filter--on { background:var(--theme-color); border-color:var(--theme-color); color:white; }
        .tv-cnt { display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:16px; padding:0 4px; border-radius:999px; font-size:9px; font-weight:800; background:rgba(0,0,0,.08); }
        .tv-filter--on .tv-cnt { background:rgba(255,255,255,.3); }
        .tv-result { margin-left:auto; font-size:10.5px; font-weight:700; color:#94a3b8; }

        /* table */
        .tv-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .tv-table { width:100%; border-collapse:collapse; min-width:480px; }
        .tv-table thead { background:linear-gradient(180deg,#f8fafc,#f1f5f9); }
        .tv-table thead tr { border-bottom:1.5px solid var(--theme-color); }
        .tv-table th { padding:8px 12px; font-size:9.5px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:.07em; text-align:left; white-space:nowrap; }
        .tv-th-sort { cursor:pointer; user-select:none; }
        .tv-th-sort:hover { color:var(--theme-color); }
        .tv-r { text-align:right !important; }
        .tv-row { cursor:pointer; transition:background .12s; border-left:3px solid transparent; }
        .tv-row:hover { background:#f8fafc; border-left-color:var(--theme-color); }
        .tv-table td { padding:8px 12px; border-bottom:1px solid #f1f5f9; font-size:11.5px; color:#475569; vertical-align:middle; white-space:nowrap; }
        .tv-oid { font-family:monospace; font-size:10px; font-weight:800; color:var(--theme-color); background:rgba(0,0,0,0.03); padding:2px 5px; border-radius:6px; border:1px solid rgba(0,0,0,0.08); }
        .tv-badge { padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600; font-family:'Outfit',sans-serif; }
        .tv-amount { font-weight:800; color:#0f172a; font-family:monospace; }
        .tv-user { font-size:11.5px; color:#64748b; font-weight:600; }

        @media(max-width: 640px) {
          .tv-bar { padding: 8px 12px; gap: 4px; justify-content: flex-start; }
          .tv-filter { padding: 4px 8px; font-size: 10px; }
          .tv-result { margin-left: 0; width: 100%; text-align: left; padding: 4px 0; }
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED — No data state
   ═══════════════════════════════════════════════════════════════════════════ */
function NoData() {
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'10px',padding:'80px 24px',color:'#94a3b8'}}>
      <FaReceipt style={{fontSize:'36px',color:'#e2e8f0'}}/>
      <span style={{fontSize:'14px',fontWeight:'800',color:'#334155'}}>No orders yet</span>
      <span style={{fontSize:'12px',fontWeight:'500'}}>Orders will appear here once they come in</span>
    </div>
  );
}
