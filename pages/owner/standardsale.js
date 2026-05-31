import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import styled, { keyframes } from 'styled-components';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { formatTzDate, getBusinessNow } from '../../utils/timezoneUtils';
import DashboardLayout from '../../components/DashboardLayout';
import {
  FaReceipt, FaPrint, FaCheck, FaExclamationCircle,
  FaSearch, FaEdit, FaPlus
} from 'react-icons/fa';
import { PageContainer } from '../../components/PremiumPOSUI';
import StandardSale from '../../components/StandardSale';
import OrderTypeSelectorModal from '../../components/OrderTypeSelectorModal';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import NiceSelect from '../../components/NiceSelect';
import KotPrint from '../../components/KotPrint';
import CloudPrintStation from '../../components/CloudPrintStation';
import PaymentDialog from '../../components/PaymentDialog';
import EditOrderPanel from '../../components/EditOrderPanel';
import { toDisplayItems } from '../../utils/printUtils';
import { isKnownOffline } from '../../utils/networkState';
import { publishAccountingDataChanged } from '../../utils/accountingRealtime';
import { getQueuedOfflineOrders, getRecentPrintJobs } from '../../utils/offlineStore';
import { enqueueCloudPrintJob, fetchCloudPrintJobs, isPrintStationEnabled, markCloudPrintJobPrinted } from '../../utils/cloudPrintStation';
import { ensureOfflineSequenceLeases, isMainOfflineBillingDevice } from '../../utils/offlineSequences';
import DocumentViewerPopup from '../../components/purchasing/DocumentViewerPopup';

// ─── Animations ───────────────────────────────────────────────────────────────
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

// ─── Styled Components ────────────────────────────────────────────────────────
const TopHeaderBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  width: 100%;
  margin-bottom: 16px;
`;

const TopSearchInput = styled.div`
  position: relative;
  width: 100%;

  svg {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
    font-size: 13px;
    pointer-events: none;
  }

  input {
    width: 100%;
    height: 38px;
    border: 1.5px solid #e2e8f0;
    border-radius: 14px;
    padding-left: 34px !important;
    color: #1e293b;
    font-size: 13px;
    font-weight: 600;
    background: white;
    outline: none;
    box-shadow: 0 2px 6px rgba(0,0,0,0.02);
    transition: all 0.25s ease;

    &:hover { border-color: #16a34a; }
    &:focus {
      border-color: #15803d;
      box-shadow: 0 0 0 3px rgba(22,163,74,0.08), 0 2px 6px rgba(0,0,0,0.02);
    }
  }
`;

const TopNewOrderBtn = styled.button`
  height: 38px;
  padding: 0 20px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
  color: white;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(22,163,74,0.25);
  transition: all 0.25s;
  white-space: nowrap;
  font-family: 'Outfit','Inter',-apple-system,sans-serif;

  &:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(22,163,74,0.35); }
  &:active { transform: translateY(0); }
`;

const HistoryToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  background: white;
  border: 1px solid #e2e8f0;
  border-top: 3px solid #16a34a;
  border-radius: 12px;
  padding: 6px 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);

  @media (max-width: 720px) {
    align-items: stretch;
    flex-direction: column;
    padding: 10px;
  }
`;

const FilterWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  width: 100%;

  .hist-dates {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;

    .premium-dt-picker { width: 220px !important; }
  }

  .h-filter-sep {
    font-size: 11px;
    font-weight: 800;
    color: #cbd5e1;
    margin: 0 2px;
  }

  .dt-trigger, .nice-select-trigger {
    border: 1.5px solid #e2e8f0 !important;
    border-radius: 12px !important;
    background: #f8fafc !important;
    transition: all 0.15s ease !important;
    height: 30px !important;
    line-height: 28px !important;
    font-size: 11px !important;
    padding: 0 10px !important;
    box-sizing: border-box !important;
    display: flex !important;
    align-items: center !important;
  }

  .nice-select-trigger span {
    font-size: 11px !important;
    font-weight: 700 !important;
    line-height: 28px !important;
    color: #1e293b !important;
  }

  .dt-trigger:hover, .nice-select-trigger:hover {
    border-color: #16a34a !important;
    background: #f0fdf4 !important;
  }

  .dt-trigger.active, .dt-trigger:focus,
  .nice-select-trigger.open, .nice-select-trigger:focus {
    border-color: #15803d !important;
    background: white !important;
    box-shadow: 0 0 0 3px rgba(22,163,74,0.08) !important;
  }

  .nice-select, .nice-select-wrapper {
    flex-shrink: 0;
    min-width: 115px !important;
    max-width: 135px !important;
  }

  @media (max-width: 720px) {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;

    .hist-dates {
      width: 100%;
      justify-content: space-between;
      .premium-dt-picker { flex: 1; width: auto !important; }
    }
    .nice-select, .nice-select-wrapper {
      width: 100% !important;
      max-width: none !important;
    }
  }
`;

const HistoryShell = styled.section`
  padding: 0 24px 96px;
  animation: ${fadeIn} 0.25s ease-out;

  @media (max-width: 720px) { padding: 0 16px 96px; }
`;

const HistoryPager = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 18px;
  color: #475569;
  font-size: 12px;
  font-weight: 900;
`;

const HistoryActionButton = styled.button`
  height: 30px;
  border-radius: 12px;
  border: none;
  background: ${p => p.$primary ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' : '#f1f5f9'};
  color: ${p => p.$primary ? 'white' : '#475569'};
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  padding: 0 16px;
  transition: all 0.25s;
  box-shadow: ${p => p.$primary ? '0 4px 10px rgba(22,163,74,0.2)' : 'none'};

  &:hover { transform: translateY(-1px); }
  &:active { transform: translateY(0); }
  &:disabled { opacity: 0.6; cursor: wait; transform: none; }
`;

const HistTableWrap = styled.div`
  width: 100%;
  background: #fff;
  border-radius: 20px;
  border: 1px solid #f1f5f9;
  overflow-x: auto;
  box-shadow: 0 4px 24px rgba(0,0,0,0.04);
  margin-top: 8px;
  margin-bottom: 24px;
`;

const HistTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 960px;
  text-align: left;
  font-family: inherit;

  thead { background: linear-gradient(180deg, #f8fafc, #f1f5f9); }

  th {
    padding: 8px 12px;
    font-size: 9px;
    font-weight: 800;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 1px solid #e8edf5;
    white-space: nowrap;
  }

  td {
    padding: 8px 12px;
    border-bottom: 1px solid #f8fafc;
    color: #334155;
    font-size: 13px;
    vertical-align: middle;
    white-space: nowrap;
  }
`;

const HistRow = styled.tr`
  transition: all 0.15s ease;
  border-left: 3px solid transparent;

  &:hover {
    border-left-color: #16a34a;
    td { background: #f0fdf4; }
  }
`;

const OrderNoLink = styled.code`
  font-family: monospace;
  font-size: 12px;
  font-weight: 800;
  color: #16a34a;
  text-decoration: underline;
  cursor: pointer;
  white-space: nowrap;
  background: transparent !important;
  padding: 0 !important;
  border: none !important;
  border-radius: 0 !important;
`;

const RowDate = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const RdD = styled.span`
  font-size: 11px;
  font-weight: 700;
  color: #1e293b;
`;

const RdT = styled.span`
  font-size: 9px;
  font-weight: 500;
  color: #94a3b8;
`;

const ItemsPill = styled.span`
  background: #f1f5f9;
  color: #64748b;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 800;
`;

const StatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  border: 1px solid;
`;

const ActionGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ActionButton = styled.button`
  border: none;
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: ${p => p.$tone === 'green' ? '#15803d' : p.$tone === 'blue' ? '#0369a1' : '#16a34a'};
  background: ${p => p.$tone === 'green' ? '#f0fdf4' : p.$tone === 'blue' ? '#f0f9ff' : '#f0fdf4'};
  transition: all 0.2s;

  &:hover {
    background: ${p => p.$tone === 'green' ? '#dcfce7' : p.$tone === 'blue' ? '#e0f2fe' : '#dcfce7'};
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const EmptyState = styled.div`
  background: white;
  border: 1px dashed #cbd5e1;
  border-radius: 18px;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #64748b;
  gap: 10px;

  svg { color: #cbd5e1; font-size: 36px; }
  strong { color: #334155; font-size: 16px; }
`;

const Toast = styled.div`
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 99999;
  background: ${p => p.$type === 'error' ? '#ef4444' : '#0f172a'};
  color: white;
  padding: 12px 18px;
  border-radius: 16px;
  box-shadow: 0 18px 38px rgba(15,23,42,0.25);
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 800;

  @media (max-width: 520px) { width: calc(100% - 32px); justify-content: center; text-align: center; }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const money = (val, symbol = '₹') => `${symbol}${Number(val || 0).toFixed(2)}`;

function orderTotal(order) {
  return Number(order?.grandTotal ?? order?.grand_total ?? order?.totalAmount ?? order?.total_amount ?? 0);
}

function orderIdentity(order) {
  if (!order) return '';
  if (order.offlineOperationId) return `op:${order.offlineOperationId}`;
  if (order.id) return `id:${order.id}`;
  const orderNo = order.orderNo || order.order_no;
  if (orderNo) return `no:${orderNo}`;
  return '';
}

function orderPrintKeys(order) {
  const keys = [];
  if (order?.offlineOperationId) keys.push(`op:${order.offlineOperationId}`);
  if (order?.id) keys.push(`id:${order.id}`);
  const orderNo = order?.orderNo || order?.order_no;
  if (orderNo) keys.push(`no:${orderNo}`);
  return keys;
}

function orderTime(order) {
  const raw = order?.orderDate || order?.order_date || order?.createdAt || order?.created_at;
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function isOpenOrder(order) {
  const status = String(order?.orderStatus || order?.order_status || '').toUpperCase();
  return !['COMPLETED', 'PAID', 'CANCELLED', 'VOID'].includes(status);
}

function orderStatusTone(order) {
  if (order?.syncStatus === 'CONFLICT') return 'red';
  if (order?.offline || order?.syncStatus === 'QUEUED') return 'orange';
  const status = String(order?.orderStatus || order?.order_status || '').toUpperCase();
  if (status === 'COMPLETED' || status === 'PAID') return 'green';
  if (status === 'CANCELLED' || status === 'VOID') return 'red';
  return 'orange';
}

function statusText(order) {
  if (order?.syncStatus === 'CONFLICT') return 'SYNC CONFLICT';
  if (order?.offline || order?.syncStatus === 'QUEUED') return 'SYNC PENDING';
  return String(order?.orderStatus || order?.order_status || 'DRAFT').replace('_', ' ');
}

function fulfillmentLabel(order) {
  if (order?.tableNumber || order?.table_number) return `Dine in (Table ${order.tableNumber || order.table_number})`;
  const f = String(order?.fulfillmentType || order?.fulfillment_type || '').toUpperCase();
  if (f === 'DELIVERY') return 'Delivery';
  if (f === 'TAKEAWAY') return 'Takeaway';
  if (f === 'DINE_IN') return 'Dine in';
  return f || 'Dine in';
}

function customerLabel(order) {
  const customers = Array.isArray(order?.customers) ? order.customers : [];
  if (customers.length) {
    return customers.map(c => c.phone ? `${c.name || 'Guest'} (${c.phone})` : (c.name || 'Guest')).join(', ');
  }
  return order?.customerName || order?.customerPhone || '-';
}

function mergeOrdersWithQueued(orders, queued) {
  const byKey = new Map();
  [...(queued || []), ...(orders || [])].forEach(o => {
    const key = orderIdentity(o) || `fallback:${byKey.size}`;
    const ex  = byKey.get(key);
    byKey.set(key, ex ? { ...ex, ...o } : o);
  });
  return Array.from(byKey.values()).sort((a, b) => orderTime(b).getTime() - orderTime(a).getTime());
}

function buildPrintJobMap(jobs) {
  const map = {};
  (jobs || []).forEach(job => {
    const keys = [];
    if (job.offlineOperationId) keys.push(`op:${job.offlineOperationId}`);
    if (job.orderId)  keys.push(`id:${job.orderId}`);
    if (job.orderNo)  keys.push(`no:${job.orderNo}`);
    keys.forEach(key => {
      map[key] = map[key] || {};
      const kind    = job.kind || job.jobKind || 'bill';
      const current = map[key][kind];
      if (!current || String(job.updatedAt || job.createdAt).localeCompare(String(current.updatedAt || current.createdAt)) > 0) {
        map[key][kind] = job;
      }
    });
  });
  return map;
}

function attachPrintJobs(order, printJobsByOrder) {
  const printJobs = {};
  orderPrintKeys(order).forEach(key => Object.assign(printJobs, printJobsByOrder[key] || {}));
  return { ...order, printJobs };
}

function toDateTimeInputValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultHistoryRange(timezone) {
  const now  = getBusinessNow(timezone);
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  const to   = new Date(now); to.setHours(23, 59, 59, 999);
  return { from: toDateTimeInputValue(from), to: toDateTimeInputValue(to), q: '', status: '', terminalId: '' };
}

function localInputToIso(value) {
  if (!value) return undefined;
  const date = new Date(`${value}:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function isCreditIntendedOrder(order, creditEnabled) {
  const payStatus = String(order?.paymentStatus || order?.payment_status || '').toUpperCase();
  return Boolean(creditEnabled && isOpenOrder(order) && (order?.creditCustomerId || order?.credit_customer_id) && payStatus !== 'PAID');
}

function getOrderCreditCustomerId(order) {
  return order?.creditCustomerId || order?.credit_customer_id || order?.creditCustomer?.id || order?.credit_customer?.id || '';
}

const statusBadgeColors = (tone) => {
  switch (tone) {
    case 'orange': return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
    case 'blue':   return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
    case 'green':  return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
    case 'red':    return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
    default:       return { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' };
  }
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function StandardSalePage() {
  return <StandardSaleContent />;
}

function StandardSaleContent() {
  const router  = useRouter();
  const { timezone, orgId, userRole, switchBranch } = useAuth();

  const [tables, setTables]           = useState([]);
  const [floorOrders, setFloorOrders] = useState([]);
  const [historyOrders, setHistoryOrders] = useState([]);
  const [historyPage, setHistoryPage] = useState({ number: 0, size: 20, totalPages: 0, totalElements: 0 });
  const [historyFilters, setHistoryFilters] = useState(() => defaultHistoryRange(timezone));
  const [branches, setBranches]       = useState([]);
  const [terminals, setTerminals]     = useState([]);

  const [queuedOrders, setQueuedOrders]       = useState([]);
  const [printJobsByOrder, setPrintJobsByOrder] = useState({});
  const [ordersLoading, setOrdersLoading]     = useState(false);
  const [isMounted, setIsMounted]             = useState(false);
  const [config, setConfig]                   = useState(null);
  const [selectedTable, setSelectedTable]     = useState(null);
  const [paymentOrder, setPaymentOrder]       = useState(null);
  const [editingOrder, setEditingOrder]       = useState(null);
  const [actionBusy, setActionBusy]           = useState('');
  const [editSaving, setEditSaving]           = useState(false);
  const [activeView, setActiveView]           = useState('order_type');
  const [pendingOrderType, setPendingOrderType] = useState(null);
  const [printOrder, setPrintOrder]           = useState(null);
  const [printKind, setPrintKind]             = useState('bill');
  const [toast, setToast]                     = useState(null);
  const [creditCustomers, setCreditCustomers] = useState([]);
  const [viewingDoc, setViewingDoc]           = useState(null);

  const tablesInFlightRef  = useRef(false);
  const ordersInFlightRef  = useRef(false);
  const historyInFlightRef = useRef(false);
  const historyFiltersTouchedRef = useRef(false);
  const historyOrgScopeRef = useRef(orgId);

  // Hydration guard
  useEffect(() => {
    setIsMounted(true);
    try {
      const cached = localStorage.getItem('cafeqr_sales_config');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') {
          setConfig(parsed);
          if (!parsed.tableManagementEnabled) {
            setPendingOrderType('DINE_IN');
            setSelectedTable({ tableNumber: 'COUNTER', id: null, orderType: 'DINE_IN' });
            setActiveView('billing');
          } else {
            setActiveView('order_type');
          }
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (userRole === 'SUPER_ADMIN') {
      api.get('/api/v1/organizations').then(r => { if (r.data.success) setBranches(r.data.data || []); }).catch(() => {});
    }
  }, [userRole]);

  useEffect(() => {
    api.get('/api/v1/terminals').then(r => { if (r.data.success) setTerminals(r.data.data || []); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!historyFiltersTouchedRef.current) setHistoryFilters(defaultHistoryRange(timezone));
  }, [timezone]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const loadOfflineOrderState = useCallback(async () => {
    try {
      const [queued, jobs, cloudJobs] = await Promise.all([
        getQueuedOfflineOrders(),
        getRecentPrintJobs(300),
        isKnownOffline() ? Promise.resolve([]) : fetchCloudPrintJobs().catch(() => []),
      ]);
      setQueuedOrders(queued);
      setPrintJobsByOrder(buildPrintJobMap([...(jobs || []), ...(cloudJobs || [])]));
    } catch { /* ignore */ }
  }, []);

  const fetchTables = useCallback(async () => {
    if (tablesInFlightRef.current) return;
    tablesInFlightRef.current = true;
    try {
      const res = await api.get('/api/v1/tables/active');
      setTables(res.data.data || []);
    } catch { /* ignore */ } finally {
      tablesInFlightRef.current = false;
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    if (ordersInFlightRef.current) return;
    ordersInFlightRef.current = true;
    try {
      const res = await api.get('/api/v1/orders/sales/live');
      setFloorOrders(res.data.data || []);
    } catch { /* ignore */ } finally {
      await loadOfflineOrderState();
      ordersInFlightRef.current = false;
    }
  }, [loadOfflineOrderState]);

  const fetchCreditConfig = useCallback(async () => {
    try {
      const configRes = await api.get('/api/v1/configurations');
      const nextConfig = configRes.data?.data || null;
      if (nextConfig && typeof window !== 'undefined') {
        localStorage.setItem('cafeqr_sales_config', JSON.stringify(nextConfig));
      }
      setConfig(nextConfig);
      if (nextConfig?.creditEnabled) {
        const customersRes = await api.get('/api/v1/credit/customers', { params: { status: 'ACTIVE' } });
        setCreditCustomers(customersRes.data?.data || []);
      } else {
        setCreditCustomers([]);
      }
    } catch {
      setCreditCustomers([]);
      setConfig(cur => cur || { tableManagementEnabled: true, creditEnabled: false });
    }
  }, []);

  const handleCreditCustomerCreated = useCallback((customer) => {
    if (!customer?.id) return;
    setCreditCustomers(cur => {
      const next = [customer, ...cur.filter(i => String(i.id) !== String(customer.id))];
      return next.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    });
  }, []);

  const fetchHistoryOrders = useCallback(async (page = 0, filters = historyFilters) => {
    if (historyInFlightRef.current) return;
    historyInFlightRef.current = true;
    setOrdersLoading(true);
    try {
      const res = await api.get('/api/v1/orders/history', {
        params: {
          type: 'SALE',
          fromDate: localInputToIso(filters.from),
          toDate: localInputToIso(filters.to),
          q: filters.q?.trim() || undefined,
          page,
          size: historyPage.size || 20,
        },
      });
      const payload = res.data.data || {};
      setHistoryOrders(payload.content || []);
      setHistoryPage({ number: payload.number || 0, size: payload.size || 20, totalPages: payload.totalPages || 0, totalElements: payload.totalElements || 0 });
    } catch { /* ignore */ } finally {
      historyInFlightRef.current = false;
      setOrdersLoading(false);
    }
  }, [historyFilters, historyPage.size]);

  // Reset on org change
  useEffect(() => {
    setSelectedTable(null);
    setPaymentOrder(null);
    setEditingOrder(null);
    setPrintOrder(null);
    setPrintKind('bill');
    setTables([]);
    setFloorOrders([]);
    setHistoryOrders([]);
    setCreditCustomers([]);
    setOrdersLoading(false);
  }, [orgId]);

  useEffect(() => {
    const prev = historyOrgScopeRef.current;
    historyOrgScopeRef.current = orgId;
    if (prev === orgId || activeView !== 'history') return;
    fetchHistoryOrders(0);
  }, [activeView, fetchHistoryOrders, orgId]);

  // Config-driven view routing
  useEffect(() => {
    if (!config) return;
    if (!config.tableManagementEnabled) {
      if (activeView !== 'billing' || selectedTable?.tableNumber !== 'COUNTER' || selectedTable?.orderType !== 'DINE_IN') {
        setPendingOrderType('DINE_IN');
        setSelectedTable({ tableNumber: 'COUNTER', id: null, orderType: 'DINE_IN' });
        setActiveView('billing');
      }
    }
  }, [config, activeView, selectedTable?.tableNumber, selectedTable?.orderType]);

  // Debounced history search
  useEffect(() => {
    if (!historyFiltersTouchedRef.current) return;
    const id = setTimeout(() => fetchHistoryOrders(0, historyFilters), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyFilters.q]);

  // Bootstrap + polling
  useEffect(() => {
    fetchTables();
    fetchOrders();
    fetchCreditConfig();
    loadOfflineOrderState();

    let intervalId = null;
    let refreshTimerId = null;

    const startPolling = () => {
      if (intervalId || isKnownOffline()) return;
      intervalId = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        if (isKnownOffline()) return;
        fetchTables(); fetchOrders(); fetchCreditConfig();
      }, 10000);
    };

    const stopPolling = () => { if (intervalId) { clearInterval(intervalId); intervalId = null; } };

    const runRefresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (isKnownOffline()) { stopPolling(); return; }
      fetchTables(); fetchOrders(); fetchCreditConfig(); loadOfflineOrderState();
      startPolling();
    };

    const refreshWhenReachable = () => {
      if (refreshTimerId) return;
      refreshTimerId = window.setTimeout(() => { refreshTimerId = null; runRefresh(); }, 500);
    };

    const handleQueueChanged = () => loadOfflineOrderState();
    const handleVisibility   = () => { if (document.visibilityState === 'visible') runRefresh(); };

    startPolling();
    window.addEventListener('online', refreshWhenReachable);
    window.addEventListener('offline', stopPolling);
    window.addEventListener('cafeqr-network-state', (e) => { if (e?.detail?.offline) stopPolling(); else refreshWhenReachable(); });
    window.addEventListener('cafeqr-sync-queue-changed', handleQueueChanged);
    window.addEventListener('cafeqr-print-jobs-changed', handleQueueChanged);
    window.addEventListener('cafeqr-sync-complete', runRefresh);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopPolling();
      if (refreshTimerId) window.clearTimeout(refreshTimerId);
      window.removeEventListener('online', refreshWhenReachable);
      window.removeEventListener('offline', stopPolling);
      window.removeEventListener('cafeqr-sync-queue-changed', handleQueueChanged);
      window.removeEventListener('cafeqr-print-jobs-changed', handleQueueChanged);
      window.removeEventListener('cafeqr-sync-complete', runRefresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Ensure offline sequences
  useEffect(() => {
    if (typeof window === 'undefined' || !isMainOfflineBillingDevice()) return;
    ensureOfflineSequenceLeases().catch(() => {});
  }, []);

  // History display
  const historyQueuedOrders = useMemo(() => (
    queuedOrders.filter(o => {
      const bId = o?.orgId || o?.org_id || o?.branchId || o?.branch_id || null;
      if (!orgId || orgId === '0') return true;
      return Boolean(bId) && String(bId) === String(orgId);
    })
  ), [orgId, queuedOrders]);

  const historyDisplayOrders = useMemo(() => {
    let filtered = mergeOrdersWithQueued(historyOrders, historyQueuedOrders)
      .map(o => attachPrintJobs(o, printJobsByOrder));
    if (historyFilters.status) {
      filtered = filtered.filter(o => String(o?.orderStatus || o?.order_status || '').toUpperCase() === historyFilters.status);
    }
    if (historyFilters.terminalId) {
      filtered = filtered.filter(o => String(o?.terminalId || o?.terminal_id || '') === historyFilters.terminalId);
    }
    return filtered;
  }, [historyOrders, historyQueuedOrders, printJobsByOrder, historyFilters.status, historyFilters.terminalId]);

  const publishAccountingRefresh = useCallback((reason, order = null) => {
    if (isKnownOffline() || order?.offline) return;
    publishAccountingDataChanged({
      source: 'standard-sale',
      reason,
      orderId:      order?.id || null,
      orderNo:      order?.orderNo || order?.order_no || null,
      orderStatus:  order?.orderStatus || order?.order_status || null,
      paymentStatus: order?.paymentStatus || order?.payment_status || null,
      orderDate:    order?.orderDate || order?.order_date || order?.createdAt || new Date().toISOString(),
    });
  }, []);

  const hasAccountingImpact = useCallback((order) => {
    const os = String(order?.orderStatus || order?.order_status || '').toUpperCase();
    const ps = String(order?.paymentStatus || order?.payment_status || '').toUpperCase();
    return ['BILLED', 'COMPLETED', 'CANCELLED'].includes(os) || ps === 'PAID';
  }, []);

  const refreshSalesState = useCallback(() => {
    fetchOrders();
    fetchTables();
    if (activeView === 'history') fetchHistoryOrders(historyPage.number || 0);
    loadOfflineOrderState();
  }, [activeView, fetchHistoryOrders, fetchOrders, fetchTables, historyPage.number, loadOfflineOrderState]);

  const loadFullOrder = async (orderId) => {
    const { data } = await api.get(`/api/v1/orders/${orderId}`);
    return data.data;
  };

  const handlePrintOrder = async (order, kind) => {
    try {
      if (order?.offline) {
        if (isMainOfflineBillingDevice()) { setPrintOrder(order); setPrintKind(kind); showToast(kind === 'kot' ? 'Offline KOT sent to printer' : 'Offline bill sent to printer'); }
        else showToast('This is a provisional offline order. Print from the main device after sync.', 'error');
        return;
      }
      if (!isPrintStationEnabled()) {
        await enqueueCloudPrintJob(order, kind);
        await loadOfflineOrderState();
        showToast(kind === 'kot' ? 'KOT queued for the main print station' : 'Bill queued for the main print station');
        return;
      }
      const fullOrder = await loadFullOrder(order.id);
      setPrintOrder(fullOrder || order);
      setPrintKind(kind);
      showToast(kind === 'kot' ? 'KOT sent to printer' : 'Bill sent to printer');
    } catch { showToast('Print preparation failed', 'error'); }
  };

  const handleLocalPrintDone = useCallback(() => {
    const po = printOrder; const pk = printKind;
    setPrintOrder(null);
    if (po && !po.offline) {
      markCloudPrintJobPrinted(po, pk).catch(() => {}).finally(loadOfflineOrderState);
    } else {
      loadOfflineOrderState();
    }
  }, [loadOfflineOrderState, printKind, printOrder]);

  const handleOrderCreated = useCallback((order, kind) => {
    setFloorOrders(cur => {
      const oid = order?.id || order?.offlineOperationId || order?.orderNo;
      return [order, ...cur.filter(i => (i?.id || i?.offlineOperationId || i?.orderNo) !== oid)];
    });

    if (order?.offline) {
      if (isMainOfflineBillingDevice()) {
        setPrintOrder(order);
        setPrintKind(kind === 'settle' ? 'bill' : kind);
      }
      setQueuedOrders(cur => mergeOrdersWithQueued(cur, [order]));
      loadOfflineOrderState();
      showToast(isMainOfflineBillingDevice() ? 'Offline final sale saved and sent to printer.' : 'Offline sale queued. It will sync when internet returns.');
      return;
    }

    if (kind === 'settle') { setPaymentOrder(order); return; }

    if (isPrintStationEnabled()) {
      setPrintOrder(order); setPrintKind(kind);
      showToast(kind === 'kot' ? 'KOT created — printing now...' : 'Bill created — printing now...');
    } else {
      showToast(kind === 'kot' ? 'KOT created. Main print station will print when online.' : 'Bill created. Main print station will print when online.');
    }

    if (kind === 'bill' || hasAccountingImpact(order)) publishAccountingRefresh('order-created', order);
    if (!isKnownOffline()) { fetchOrders(); fetchTables(); fetchCreditConfig(); loadOfflineOrderState(); }
  }, [fetchCreditConfig, fetchOrders, fetchTables, hasAccountingImpact, loadOfflineOrderState, publishAccountingRefresh, showToast]);

  const handleNewOrder = () => {
    if (!orgId) { showToast('Select a branch before creating a sale.', 'error'); return; }
    if (!config?.tableManagementEnabled) {
      setPendingOrderType('DINE_IN');
      setSelectedTable({ tableNumber: 'COUNTER', id: null, orderType: 'DINE_IN' });
      setActiveView('billing');
      return;
    }
    setActiveView('order_type');
  };

  const handleOrderTypeSelected = useCallback(({ orderType, table }) => {
    if (orderType === 'TABLE' && table) {
      const status = String(table.status || 'AVAILABLE').toUpperCase();
      if (status !== 'AVAILABLE') { showToast(`Table ${table.tableNumber || ''} is not available.`, 'error'); return; }
      setSelectedTable(table);
    } else {
      setSelectedTable({ tableNumber: 'COUNTER', id: null, orderType });
    }
    setActiveView('billing');
    setPendingOrderType(orderType);
  }, [showToast]);

  const handleConfirmPayment = async (payload) => {
    if (!paymentOrder) return;
    setActionBusy('settle');
    try {
      const endpoint = payload?.paymentMethod === 'CREDIT'
        ? `/api/v1/orders/${paymentOrder.id}/complete-credit`
        : `/api/v1/orders/${paymentOrder.id}/settle`;
      const reqPayload = payload?.paymentMethod === 'CREDIT'
        ? { creditCustomerId: payload.creditCustomerId, discountAmount: payload.discountAmount, roundOffAmount: payload.roundOffAmount }
        : payload;
      const { data } = await api.post(endpoint, reqPayload);
      const settled = data.data || paymentOrder;
      setFloorOrders(cur => cur.map(i => i.id === settled.id ? { ...i, ...settled } : i));
      showToast(payload?.paymentMethod === 'CREDIT' ? 'Order completed as credit' : 'Order settled successfully');
      setPaymentOrder(null);
      publishAccountingRefresh(payload?.paymentMethod === 'CREDIT' ? 'order-credit-completed' : 'order-settled', settled);
      await handlePrintOrder(settled, 'bill');
      refreshSalesState();
      if (activeView === 'billing') {
        setSelectedTable(null);
        setPendingOrderType(null);
        if (!config?.tableManagementEnabled) { setActiveView('history'); fetchHistoryOrders(0); }
        else setActiveView('order_type');
      }
    } catch (e) {
      showToast('Failed to settle order', 'error');
    } finally {
      setActionBusy('');
    }
  };

  const handleSettleOrder = async (order) => {
    if (order?.offline) { showToast('This order is queued offline. Settle after sync.', 'error'); return; }
    if (isCreditIntendedOrder(order, config?.creditEnabled)) {
      setActionBusy('settle');
      try {
        const { data } = await api.post(`/api/v1/orders/${order.id}/complete-credit`, { creditCustomerId: getOrderCreditCustomerId(order) });
        const settled = data.data || order;
        setFloorOrders(cur => cur.map(i => i.id === settled.id ? { ...i, ...settled } : i));
        showToast('Order completed as credit');
        setPaymentOrder(null);
        publishAccountingRefresh('order-credit-completed', settled);
        await handlePrintOrder(settled, 'bill');
        refreshSalesState();
      } catch (e) {
        showToast(e.response?.data?.message || 'Failed to complete credit order', 'error');
      } finally {
        setActionBusy('');
      }
      return;
    }
    setPaymentOrder(order);
  };

  const handleSaveEditedOrder = async (payload) => {
    if (!editingOrder) return;
    setEditSaving(true);
    try {
      const { data } = await api.put(`/api/v1/orders/${editingOrder.id}`, payload);
      const saved = data.data || payload;
      setFloorOrders(cur => [saved, ...cur.filter(o => o.id !== editingOrder.id)]);
      showToast('Order updated');
      setEditingOrder(null);
      if (hasAccountingImpact(saved)) publishAccountingRefresh('order-updated', saved);
      refreshSalesState();
    } catch {
      showToast('Failed to update order', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  if (!isMounted) {
    return (
      <DashboardLayout title="Standard Sale">
        <PageContainer style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div style={{ width: 40, height: 40, border: '4px solid #f1f5f9', borderTop: '4px solid #16a34a', borderRadius: '50%', animation: 'spin-loader 0.8s linear infinite' }} />
          <style>{`@keyframes spin-loader { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </PageContainer>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Standard Sale"
      hideTitle={activeView === 'order_type' || activeView === 'billing'}
      noPadding={activeView === 'order_type' || activeView === 'billing'}
    >
      <PageContainer>

        {/* ── History view ── */}
        {activeView === 'history' && (
          <HistoryShell>
            <TopHeaderBar>
              <div style={{ flex: '1', maxWidth: '400px' }}>
                <TopSearchInput>
                  <FaSearch />
                  <input
                    type="search"
                    value={historyFilters.q || ''}
                    placeholder="Search order, invoice, customer..."
                    onChange={e => setHistoryFilters(f => ({ ...f, q: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fetchHistoryOrders(0); } }}
                  />
                </TopSearchInput>
              </div>
              <TopNewOrderBtn onClick={handleNewOrder}>
                <FaPlus size={12} /> New Order
              </TopNewOrderBtn>
            </TopHeaderBar>

            <HistoryToolbar>
              <FilterWrapper>
                <div className="hist-dates">
                  <PremiumDateTimePicker value={historyFilters.from} onChange={val => setHistoryFilters(f => ({ ...f, from: val }))} />
                  <span className="h-filter-sep">to</span>
                  <PremiumDateTimePicker value={historyFilters.to}   onChange={val => setHistoryFilters(f => ({ ...f, to: val }))} />
                </div>

                {userRole === 'SUPER_ADMIN' && branches.length > 0 && (
                  <NiceSelect
                    className="nice-select"
                    options={[{ value: '', label: 'All Branches' }, ...branches.map(b => ({ value: b.id, label: b.name }))]}
                    value={orgId || ''}
                    onChange={val => {
                      const b = branches.find(x => String(x.id) === String(val));
                      if (b) switchBranch(b.id, b.name); else switchBranch(null, null);
                    }}
                  />
                )}

                <NiceSelect
                  className="nice-select"
                  options={[
                    { value: '', label: 'All Status' },
                    { value: 'DRAFT', label: 'Draft' },
                    { value: 'BILLED', label: 'Billed' },
                    { value: 'COMPLETED', label: 'Completed' },
                    { value: 'PAID', label: 'Paid' },
                    { value: 'CANCELLED', label: 'Cancelled' },
                  ]}
                  value={historyFilters.status || ''}
                  onChange={val => setHistoryFilters(f => ({ ...f, status: val }))}
                />

                <NiceSelect
                  className="nice-select"
                  options={[{ value: '', label: 'All Terminals' }, ...terminals.map(t => ({ value: t.id, label: t.name || t.terminalCode || 'Terminal' }))]}
                  value={historyFilters.terminalId || ''}
                  onChange={val => setHistoryFilters(f => ({ ...f, terminalId: val }))}
                />
              </FilterWrapper>
            </HistoryToolbar>

            {historyDisplayOrders.length === 0 ? (
              <EmptyState>
                <FaReceipt />
                <strong>{historyFilters.q?.trim() ? 'No matching orders' : 'No orders yet'}</strong>
                <span>{historyFilters.q?.trim() ? 'Try another search or widen the date range.' : 'New KOT and settled sales will appear here immediately.'}</span>
              </EmptyState>
            ) : (
              <HistTableWrap>
                <HistTable>
                  <thead>
                    <tr>
                      <th>Order#</th>
                      <th>Date</th>
                      <th>Customer</th>
                      <th>Type</th>
                      <th>Items</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyDisplayOrders.map(order => {
                      const date   = orderTime(order);
                      const items  = toDisplayItems(order);
                      const key    = orderIdentity(order) || `order:${date.getTime()}:${order.orderNo || ''}`;
                      const tone   = orderStatusTone(order);
                      const colors = statusBadgeColors(tone);
                      return (
                        <HistRow key={key}>
                          <td>
                            <OrderNoLink onClick={() => setViewingDoc({ order, type: 'order' })}>
                              {order.orderNo || order.order_no || `#${String(order.id).slice(0, 8)}`}
                            </OrderNoLink>
                          </td>
                          <td>
                            <RowDate>
                              <RdD>{formatTzDate(date, timezone, { format: 'date', year: undefined })}</RdD>
                              <RdT>{formatTzDate(date, timezone, { format: 'time' })}</RdT>
                            </RowDate>
                          </td>
                          <td><strong>{customerLabel(order)}</strong></td>
                          <td><span style={{ fontWeight: 600, color: '#475569' }}>{fulfillmentLabel(order)}</span></td>
                          <td><ItemsPill>{(items || []).length}</ItemsPill></td>
                          <td><strong>{money(orderTotal(order))}</strong></td>
                          <td>
                            <StatusBadge style={{ background: colors.bg, color: colors.color, borderColor: colors.border }}>
                              {statusText(order)}
                            </StatusBadge>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <ActionGroup style={{ justifyContent: 'center' }}>
                              <ActionButton type="button" onClick={() => handlePrintOrder(order, 'bill')}>
                                <FaPrint style={{ fontSize: 11 }} /> Print Bill
                              </ActionButton>
                              <ActionButton type="button" onClick={() => setEditingOrder(order)}>
                                <FaEdit style={{ fontSize: 11 }} /> Edit
                              </ActionButton>
                            </ActionGroup>
                          </td>
                        </HistRow>
                      );
                    })}
                  </tbody>
                </HistTable>
              </HistTableWrap>
            )}

            <HistoryPager>
              <HistoryActionButton
                type="button"
                disabled={ordersLoading || historyPage.number <= 0}
                onClick={() => fetchHistoryOrders(Math.max(0, historyPage.number - 1))}
              >
                Previous
              </HistoryActionButton>
              <span>Page {historyPage.totalPages ? historyPage.number + 1 : 0} of {historyPage.totalPages}</span>
              <HistoryActionButton
                type="button"
                disabled={ordersLoading || !historyPage.totalPages || historyPage.number >= historyPage.totalPages - 1}
                onClick={() => fetchHistoryOrders(historyPage.number + 1)}
              >
                Next
              </HistoryActionButton>
            </HistoryPager>

            <style jsx>{`.spin { animation: spin 0.9s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </HistoryShell>
        )}

        {/* ── Order-type picker ── */}
        {activeView === 'order_type' && (
          <OrderTypeSelectorModal
            tables={tables}
            config={config}
            onSelect={handleOrderTypeSelected}
            onHistoryClick={() => router.push('/owner/orders?tab=completed')}
            onPoHistoryClick={() => router.push('/owner/purchase-orders?view=history')}
            onClose={() => setActiveView('history')}
          />
        )}

        {/* ── Standard billing UI ── */}
        {activeView === 'billing' && selectedTable && (
          <StandardSale
            initialTable={selectedTable}
            onOrderCreated={handleOrderCreated}
            onCreditCustomerCreated={handleCreditCustomerCreated}
            config={config}
            initialCreditCustomers={creditCustomers}
            onBack={() => {
              if (!isKnownOffline()) { fetchTables(); fetchOrders(); }
              if (!config?.tableManagementEnabled) {
                router.back();
              } else {
                setSelectedTable(null);
                setPendingOrderType(null);
                setActiveView('order_type');
              }
            }}
          />
        )}

        {/* ── Shared overlays ── */}
        {paymentOrder && (
          <PaymentDialog
            order={paymentOrder}
            loading={actionBusy === 'settle'}
            config={config}
            creditCustomers={creditCustomers}
            onClose={() => setPaymentOrder(null)}
            onConfirm={handleConfirmPayment}
            onCreditCustomerCreated={handleCreditCustomerCreated}
          />
        )}

        {editingOrder && (
          <EditOrderPanel
            order={editingOrder}
            saving={editSaving}
            onClose={() => setEditingOrder(null)}
            onSave={handleSaveEditedOrder}
          />
        )}

        {printOrder && (
          <KotPrint
            order={printOrder}
            kind={printKind}
            autoPrint={true}
            onClose={() => setPrintOrder(null)}
            onPrint={handleLocalPrintDone}
          />
        )}

        <CloudPrintStation onJobsChanged={loadOfflineOrderState} />

        {viewingDoc && (
          <DocumentViewerPopup
            order={viewingDoc.order}
            docType={viewingDoc.type}
            vendors={[]}
            warehouses={[]}
            timezone={timezone}
            currencySymbol="₹"
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
            onOrderUpdated={() => { fetchOrders(); fetchHistoryOrders(historyPage?.number || 0); }}
          />
        )}

        {toast && (
          <Toast $type={toast.type}>
            {toast.type === 'error' ? <FaExclamationCircle /> : <FaCheck />}
            {toast.message}
          </Toast>
        )}
      </PageContainer>
    </DashboardLayout>
  );
}
