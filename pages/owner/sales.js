import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import styled, { keyframes } from 'styled-components';
import api from '../../utils/api';
import DashboardLayout from '../../components/DashboardLayout';
import {
  FaUtensils, FaShoppingBag, FaHistory, FaTh, FaList, FaCashRegister,
  FaReceipt, FaPrint, FaSync, FaFire, FaWallet, FaCheck, FaExclamationCircle,
  FaKeyboard
} from 'react-icons/fa';
import { PageContainer, POSHeader, HeaderTitle, ModeSwitchGroup, ModeSwitchBtn } from '../../components/PremiumPOSUI';
import CounterSale from '../../components/CounterSale';
import KotPrint from '../../components/KotPrint';
import { toDisplayItems } from '../../utils/printUtils';
import { isKnownOffline } from '../../utils/networkState';
import { getQueuedOfflineOrders, getRecentPrintJobs } from '../../utils/offlineStore';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  padding: 0 24px;

  @media (max-width: 720px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const SectionTitle = styled.h2`
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
`;

const StatsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
`;

const StatPill = styled.div`
  padding: 8px 16px;
  background: ${props => props.$tone === 'green' ? '#f0fdf4' : props.$tone === 'orange' ? '#fff7ed' : '#f1f5f9'};
  border-radius: 12px;
  font-size: 13px;
  font-weight: 800;
  color: ${props => props.$tone === 'green' ? '#16a34a' : props.$tone === 'orange' ? '#ea580c' : '#475569'};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
  padding: 0 24px 24px;
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 24px 24px;
`;

const TableCard = styled.button`
  background: white;
  border-radius: 24px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid ${props => {
    if (props.$status === 'OCCUPIED') return '#f97316';
    if (props.$status === 'BILLED') return '#0ea5e9';
    return '#f1f5f9';
  }};
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  text-align: center;
  font: inherit;

  &:hover {
    transform: translateY(-6px);
    box-shadow: 0 18px 24px -12px rgba(15, 23, 42, 0.18);
    border-color: ${props => props.$status === 'AVAILABLE' ? '#16a34a' : props.$status === 'OCCUPIED' ? '#ea580c' : '#0ea5e9'};
  }
`;

const TableRow = styled(TableCard)`
  width: 100%;
  flex-direction: row;
  justify-content: space-between;
  text-align: left;
  padding: 18px 20px;
`;

const TableIcon = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: ${props => {
    if (props.$status === 'OCCUPIED') return '#fff7ed';
    if (props.$status === 'BILLED') return '#f0f9ff';
    return '#f0fdf4';
  }};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${props => {
    if (props.$status === 'OCCUPIED') return '#f97316';
    if (props.$status === 'BILLED') return '#0ea5e9';
    return '#16a34a';
  }};
  font-size: 26px;
  font-weight: 900;
  flex: 0 0 auto;
`;

const StatusPill = styled.div`
  padding: 6px 14px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: ${props => {
    if (props.$status === 'OCCUPIED') return '#f97316';
    if (props.$status === 'BILLED') return '#0ea5e9';
    return '#16a34a';
  }};
  color: white;
`;

const TableMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const TableNumber = styled.div`
  font-size: 18px;
  font-weight: 800;
  color: #1e293b;
`;

const TableCapacity = styled.div`
  font-size: 13px;
  color: #64748b;
  font-weight: 600;
`;

const ActiveOrderHint = styled.div`
  font-size: 12px;
  font-weight: 800;
  color: #ea580c;
  background: #fff7ed;
  padding: 6px 10px;
  border-radius: 10px;
`;

const CounterToggleBtn = styled.button`
  position: fixed;
  bottom: 32px;
  right: 32px;
  padding: 16px 32px;
  border-radius: 24px;
  background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
  color: white;
  border: none;
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 10px 25px -5px rgba(234, 88, 12, 0.4);
  transition: all 0.3s;
  z-index: 100;

  &:hover {
    transform: translateY(-4px) scale(1.03);
    box-shadow: 0 18px 28px -10px rgba(234, 88, 12, 0.55);
  }

  @media (max-width: 720px) {
    right: 20px;
    bottom: 20px;
    padding: 14px 20px;
  }
`;

const HistoryShell = styled.section`
  padding: 0 24px 96px;
  animation: ${fadeIn} 0.25s ease-out;
`;

const HistoryToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 16px 18px;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.03);

  @media (max-width: 720px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const HistoryTitle = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;

  strong {
    color: #0f172a;
    font-size: 18px;
    font-weight: 900;
  }

  span {
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
  }
`;

const RefreshButton = styled.button`
  width: 42px;
  height: 42px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #475569;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:disabled {
    opacity: 0.6;
    cursor: wait;
  }
`;

const HistoryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
`;

const OrderCard = styled.article`
  background: white;
  border: 1px solid #e2e8f0;
  border-left: 4px solid ${props => props.$tone};
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.04);
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const OrderTop = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
`;

const OrderNo = styled.div`
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  font-weight: 900;
  color: #0f172a;
`;

const OrderSub = styled.div`
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  margin-top: 3px;
`;

const OrderAmount = styled.div`
  font-size: 18px;
  font-weight: 900;
  color: #0f172a;
  text-align: right;
`;

const OrderBadges = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const OrderBadge = styled.span`
  border-radius: 999px;
  padding: 5px 9px;
  font-size: 10px;
  font-weight: 900;
  color: ${props => props.$tone === 'red' ? '#b91c1c' : props.$tone === 'blue' ? '#0369a1' : '#c2410c'};
  background: ${props => props.$tone === 'red' ? '#fee2e2' : props.$tone === 'blue' ? '#e0f2fe' : '#ffedd5'};
`;

const OrderInfo = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
`;

const InfoPill = styled.div`
  background: #f8fafc;
  border-radius: 12px;
  padding: 10px;

  span {
    display: block;
    color: #94a3b8;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  strong {
    color: #334155;
    font-size: 12px;
    font-weight: 800;
  }
`;

const OrderActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
`;

const OrderItemsList = styled.div`
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  max-height: 180px;
  overflow-y: auto;
`;

const OrderItemsTitle = styled.div`
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  background: #f8fafc;
  color: #64748b;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.06em;
  padding: 8px 10px;
  text-transform: uppercase;
`;

const OrderItemRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 9px 10px;
  border-top: 1px solid #f1f5f9;
  font-size: 11px;
  font-weight: 800;
  color: #334155;

  span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  strong {
    color: #0f172a;
    font-size: 11px;
    white-space: nowrap;
  }
`;

const OrderItemsEmpty = styled.div`
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 800;
  padding: 12px;
  text-align: center;
`;

const ActionButton = styled.button`
  border: none;
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 900;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: ${props => props.$tone === 'green' ? '#15803d' : props.$tone === 'blue' ? '#0369a1' : '#ea580c'};
  background: ${props => props.$tone === 'green' ? '#f0fdf4' : props.$tone === 'blue' ? '#f0f9ff' : '#fff7ed'};

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
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

  svg {
    color: #cbd5e1;
    font-size: 36px;
  }

  strong {
    color: #334155;
    font-size: 16px;
  }
`;

const Toast = styled.div`
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 99999;
  background: ${props => props.$type === 'error' ? '#ef4444' : '#0f172a'};
  color: white;
  padding: 12px 18px;
  border-radius: 16px;
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.25);
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 800;
`;

const money = (value, symbol = '₹') => `${symbol}${Number(value || 0).toFixed(2)}`;

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

function mergeOrdersWithQueued(orders, queuedOrders) {
  const byKey = new Map();

  [...(queuedOrders || []), ...(orders || [])].forEach((order) => {
    const key = orderIdentity(order) || `fallback:${byKey.size}`;
    const existing = byKey.get(key);
    byKey.set(key, existing ? { ...existing, ...order } : order);
  });

  return Array.from(byKey.values())
    .sort((a, b) => orderTime(b).getTime() - orderTime(a).getTime());
}

function buildPrintJobMap(jobs) {
  const map = {};

  (jobs || []).forEach((job) => {
    const keys = [];
    if (job.offlineOperationId) keys.push(`op:${job.offlineOperationId}`);
    if (job.orderId) keys.push(`id:${job.orderId}`);
    if (job.orderNo) keys.push(`no:${job.orderNo}`);

    keys.forEach((key) => {
      map[key] = map[key] || {};
      const kind = job.kind || 'bill';
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
  orderPrintKeys(order).forEach((key) => {
    Object.assign(printJobs, printJobsByOrder[key] || {});
  });
  return { ...order, printJobs };
}

function quantityText(value) {
  const qty = Number(value || 0);
  if (!Number.isFinite(qty)) return '0';
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2);
}

function orderTime(order) {
  const raw = order?.orderDate || order?.order_date || order?.createdAt || order?.created_at;
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function orderStatusTone(order) {
  if (order?.syncStatus === 'CONFLICT') return '#ef4444';
  if (order?.offline || order?.syncStatus === 'QUEUED') return '#f97316';
  const status = String(order?.orderStatus || order?.order_status || '').toUpperCase();
  if (status === 'COMPLETED' || status === 'PAID') return '#16a34a';
  if (status === 'CANCELLED' || status === 'VOID') return '#ef4444';
  return '#f97316';
}

function statusText(order) {
  if (order?.syncStatus === 'CONFLICT') return 'SYNC CONFLICT';
  if (order?.offline || order?.syncStatus === 'QUEUED') return 'SYNC PENDING';
  return String(order?.orderStatus || order?.order_status || 'DRAFT').replace('_', ' ');
}

function isOpenOrder(order) {
  const status = String(order?.orderStatus || order?.order_status || '').toUpperCase();
  return !['COMPLETED', 'PAID', 'CANCELLED', 'VOID'].includes(status);
}

function fulfillmentLabel(order) {
  if (order?.tableNumber || order?.table_number) return `Table ${order.tableNumber || order.table_number}`;
  const fulfillment = String(order?.fulfillmentType || order?.fulfillment_type || '').toUpperCase();
  if (fulfillment === 'DELIVERY') return 'Delivery';
  if (fulfillment === 'TAKEAWAY') return 'Counter';
  return fulfillment || 'Counter';
}

export default function Sales() {
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [queuedOrders, setQueuedOrders] = useState([]);
  const [printJobsByOrder, setPrintJobsByOrder] = useState({});
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [viewMode, setViewMode] = useState('grid');
  const [activeView, setActiveView] = useState('tables');
  const [billingUi, setBillingUi] = useState('standard');
  const [printOrder, setPrintOrder] = useState(null);
  const [printKind, setPrintKind] = useState('bill');
  const [toast, setToast] = useState(null);
  const tablesInFlightRef = useRef(false);
  const ordersInFlightRef = useRef(false);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const loadOfflineOrderState = useCallback(async () => {
    try {
      const [queued, jobs] = await Promise.all([
        getQueuedOfflineOrders(),
        getRecentPrintJobs(300),
      ]);
      setQueuedOrders(queued);
      setPrintJobsByOrder(buildPrintJobMap(jobs));
    } catch (error) {
      console.warn('Failed to load offline order state', error?.message || error);
    }
  }, []);

  const fetchTables = useCallback(async () => {
    if (tablesInFlightRef.current) return;
    tablesInFlightRef.current = true;
    try {
      const res = await api.get('/api/v1/tables/active');
      setTables(res.data.data || []);
    } catch (e) {
      if (e?.code === 'OFFLINE_CACHE_MISS') {
        showToast('Open this POS once online to prepare offline table data.', 'error');
      } else if (!isKnownOffline() && e?.message !== 'Network Error') {
        console.error('Failed to fetch tables', e);
        showToast('Failed to load tables', 'error');
      }
    } finally {
      tablesInFlightRef.current = false;
      setLoading(false);
    }
  }, [showToast]);

  const fetchOrders = useCallback(async () => {
    if (ordersInFlightRef.current) return;
    ordersInFlightRef.current = true;
    setOrdersLoading(true);
    try {
      const res = await api.get('/api/v1/orders/type/SALE');
      setOrders(res.data.data || []);
    } catch (e) {
      if (e?.code === 'OFFLINE_CACHE_MISS') {
        showToast('Open order history once online to prepare offline data.', 'error');
      } else if (!isKnownOffline() && e?.message !== 'Network Error') {
        console.error('Failed to fetch sale orders', e);
        showToast('Failed to load order history', 'error');
      }
    } finally {
      await loadOfflineOrderState();
      ordersInFlightRef.current = false;
      setOrdersLoading(false);
    }
  }, [loadOfflineOrderState, showToast]);

  useEffect(() => {
    fetchTables();
    fetchOrders();
    loadOfflineOrderState();

    let intervalId = null;
    let refreshTimerId = null;

    const startPolling = () => {
      if (intervalId || isKnownOffline()) return;
      intervalId = setInterval(() => {
        if (isKnownOffline()) return;
        fetchTables();
        fetchOrders();
      }, 10000);
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const runRefresh = () => {
      if (isKnownOffline()) {
        stopPolling();
        return;
      }
      fetchTables();
      fetchOrders();
      loadOfflineOrderState();
      startPolling();
    };

    const refreshWhenReachable = () => {
      if (refreshTimerId) return;
      refreshTimerId = window.setTimeout(() => {
        refreshTimerId = null;
        runRefresh();
      }, 500);
    };

    const handleOnline = () => {
      refreshWhenReachable();
    };

    const handleOffline = () => {
      stopPolling();
    };

    const handleNetworkState = (event) => {
      if (event?.detail?.offline) {
        stopPolling();
      } else {
        refreshWhenReachable();
      }
    };

    const handleQueueChanged = () => {
      loadOfflineOrderState();
    };

    startPolling();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('cafeqr-network-state', handleNetworkState);
    window.addEventListener('cafeqr-sync-queue-changed', handleQueueChanged);
    window.addEventListener('cafeqr-print-jobs-changed', handleQueueChanged);
    window.addEventListener('cafeqr-sync-complete', runRefresh);

    return () => {
      stopPolling();
      if (refreshTimerId) window.clearTimeout(refreshTimerId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('cafeqr-network-state', handleNetworkState);
      window.removeEventListener('cafeqr-sync-queue-changed', handleQueueChanged);
      window.removeEventListener('cafeqr-print-jobs-changed', handleQueueChanged);
      window.removeEventListener('cafeqr-sync-complete', runRefresh);
    };
  }, [fetchTables, fetchOrders, loadOfflineOrderState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('cafeqr_sales_billing_ui');
    if (saved === 'standard' || saved === 'counter') {
      setBillingUi(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('cafeqr_sales_billing_ui', billingUi);
  }, [billingUi]);

  const activeOrderByTable = useMemo(() => {
    const map = new Map();
    mergeOrdersWithQueued(orders, queuedOrders).filter(isOpenOrder).forEach(order => {
      const key = String(order.tableId || order.table_id || order.tableNumber || order.table_number || '');
      if (key && !map.has(key)) map.set(key, order);
    });
    return map;
  }, [orders, queuedOrders]);

  const displayOrders = useMemo(() => {
    return mergeOrdersWithQueued(orders, queuedOrders)
      .map((order) => attachPrintJobs(order, printJobsByOrder));
  }, [orders, queuedOrders, printJobsByOrder]);

  const handleOrderCreated = useCallback((order, kind) => {
    setPrintOrder(order);
    setPrintKind(kind);
    setOrders((current) => {
      const orderId = order?.id || order?.offlineOperationId || order?.orderNo;
      const filtered = current.filter((item) => {
        const itemId = item?.id || item?.offlineOperationId || item?.orderNo;
        return itemId !== orderId;
      });
      return [order, ...filtered];
    });

    if (order?.offline) {
      setQueuedOrders((current) => mergeOrdersWithQueued(current, [order]));
      loadOfflineOrderState();
      showToast('Offline sale queued. It will sync when internet returns.');
      return;
    }

    showToast(kind === 'kot' ? 'KOT created and sent to printer' : 'Bill created and sent to printer');
    if (!isKnownOffline()) {
      fetchOrders();
      fetchTables();
    }
  }, [fetchOrders, fetchTables, loadOfflineOrderState, showToast]);

  const handleCounterSale = () => {
    setSelectedTable({ tableNumber: 'COUNTER', id: null });
  };

  const loadFullOrder = async (orderId) => {
    const { data } = await api.get(`/api/v1/orders/${orderId}`);
    return data.data;
  };

  const handlePrintOrder = async (order, kind) => {
    try {
      if (order?.offline) {
        setPrintOrder(order);
        setPrintKind(kind);
        showToast(kind === 'kot' ? 'Offline KOT sent to printer' : 'Offline bill sent to printer');
        return;
      }

      const fullOrder = await loadFullOrder(order.id);
      setPrintOrder(fullOrder || order);
      setPrintKind(kind);
      showToast(kind === 'kot' ? 'KOT sent to printer' : 'Bill sent to printer');
    } catch (e) {
      console.error('Print preparation failed', e);
      showToast('Print preparation failed', 'error');
    }
  };

  const handleSettleOrder = async (order) => {
    if (order?.offline) {
      showToast('This order is queued offline. Settle it after sync completes.', 'error');
      return;
    }

    try {
      await api.patch(`/api/v1/orders/${order.id}/status`, null, {
        params: { status: 'COMPLETED', paymentStatus: 'PAID' }
      });
      const fullOrder = await loadFullOrder(order.id);
      setPrintOrder(fullOrder || order);
      setPrintKind('bill');
      showToast('Order settled and bill sent to printer');
      fetchOrders();
      fetchTables();
    } catch (e) {
      console.error('Failed to settle order', e);
      showToast('Failed to settle order', 'error');
    }
  };

  const renderTable = (table, asRow = false) => {
    const activeOrder = activeOrderByTable.get(String(table.id)) || activeOrderByTable.get(String(table.tableNumber));
    const Card = asRow ? TableRow : TableCard;
    return (
      <Card key={table.id} $status={table.status} onClick={() => setSelectedTable(table)}>
        <TableIcon $status={table.status}>{table.tableNumber}</TableIcon>
        <TableMeta>
          <TableNumber>Table {table.tableNumber}</TableNumber>
          <TableCapacity>{table.seatingCapacity} Seats • {table.section || 'Indoor'}</TableCapacity>
          {activeOrder && <ActiveOrderHint>{statusText(activeOrder)} • {money(orderTotal(activeOrder))}</ActiveOrderHint>}
        </TableMeta>
        <StatusPill $status={table.status}>{String(table.status || 'AVAILABLE').replace('_', ' ')}</StatusPill>
      </Card>
    );
  };

  return (
    <DashboardLayout title="Sales">
      <PageContainer>
        <POSHeader>
          <HeaderTitle>
            <FaCashRegister color="#ea580c" /> POS Terminal
          </HeaderTitle>
          <HeaderActions>
            {activeView === 'tables' && (
              <>
                <ModeSwitchGroup>
                  <ModeSwitchBtn $active={billingUi === 'standard'} onClick={() => setBillingUi('standard')}>
                    <FaKeyboard /> Standard UI
                  </ModeSwitchBtn>
                  <ModeSwitchBtn $active={billingUi === 'counter'} onClick={() => setBillingUi('counter')}>
                    <FaCashRegister /> Counter UI
                  </ModeSwitchBtn>
                </ModeSwitchGroup>
                <ModeSwitchGroup>
                  <ModeSwitchBtn $active={viewMode === 'grid'} onClick={() => setViewMode('grid')}>
                    <FaTh /> Grid
                  </ModeSwitchBtn>
                  <ModeSwitchBtn $active={viewMode === 'list'} onClick={() => setViewMode('list')}>
                    <FaList /> List
                  </ModeSwitchBtn>
                </ModeSwitchGroup>
              </>
            )}
            <ModeSwitchGroup>
              <ModeSwitchBtn $active={activeView === 'tables'} onClick={() => setActiveView('tables')}>
                <FaUtensils /> Tables
              </ModeSwitchBtn>
              <ModeSwitchBtn $active={activeView === 'history'} onClick={() => { setActiveView('history'); fetchOrders(); }}>
                <FaHistory /> Order History
              </ModeSwitchBtn>
            </ModeSwitchGroup>
          </HeaderActions>
        </POSHeader>

        {activeView === 'tables' ? (
          <>
            <SectionHeader>
              <SectionTitle>
                <FaUtensils color="#94a3b8" /> Table Management
              </SectionTitle>
              <StatsRow>
                <StatPill $tone="orange">Occupied: {tables.filter(t => t.status === 'OCCUPIED').length}</StatPill>
                <StatPill $tone="green">Available: {tables.filter(t => t.status === 'AVAILABLE').length}</StatPill>
                <StatPill>Open Orders: {displayOrders.filter(isOpenOrder).length}</StatPill>
              </StatsRow>
            </SectionHeader>

            {loading ? (
              <HistoryShell>
                <EmptyState>
                  <FaUtensils />
                  <strong>Loading tables</strong>
                  <span>Preparing the POS floor.</span>
                </EmptyState>
              </HistoryShell>
            ) : viewMode === 'grid' ? (
              <Grid>
                {tables.map(table => renderTable(table))}
              </Grid>
            ) : (
              <List>
                {tables.map(table => renderTable(table, true))}
              </List>
            )}
          </>
        ) : (
          <OrderHistory
            orders={displayOrders}
            loading={ordersLoading}
            onRefresh={fetchOrders}
            onPrint={handlePrintOrder}
            onSettle={handleSettleOrder}
          />
        )}

        <CounterToggleBtn onClick={handleCounterSale}>
          <FaShoppingBag /> Counter Sale
        </CounterToggleBtn>

        {selectedTable && (
          <CounterSale
            initialTable={selectedTable.tableNumber === 'COUNTER' ? null : selectedTable}
            interfaceMode={billingUi}
            onOrderCreated={handleOrderCreated}
            onBack={() => {
              setSelectedTable(null);
              if (!isKnownOffline()) {
                fetchTables();
                fetchOrders();
              }
            }}
          />
        )}

        {printOrder && (
          <KotPrint
            order={printOrder}
            kind={printKind}
            autoPrint={true}
            onClose={() => setPrintOrder(null)}
            onPrint={() => setPrintOrder(null)}
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

function OrderHistory({ orders, loading, onRefresh, onPrint, onSettle }) {
  return (
    <HistoryShell>
      <HistoryToolbar>
        <HistoryTitle>
          <strong>Order History</strong>
          <span>{orders.length} sale order{orders.length === 1 ? '' : 's'} across KOT and settled bills</span>
        </HistoryTitle>
        <RefreshButton onClick={onRefresh} disabled={loading} title="Refresh orders">
          <FaSync className={loading ? 'spin' : ''} />
        </RefreshButton>
      </HistoryToolbar>

      {orders.length === 0 ? (
        <EmptyState>
          <FaReceipt />
          <strong>No orders yet</strong>
          <span>New KOT and settled sales will appear here immediately.</span>
        </EmptyState>
      ) : (
        <HistoryGrid>
          {orders.map(order => {
            const date = orderTime(order);
            const open = isOpenOrder(order);
            const items = toDisplayItems(order);
            const renderKey = orderIdentity(order) || `order:${date.getTime()}:${order.orderNo || order.order_no || ''}`;
            const kotPrintFailed = order.printJobs?.kot?.status === 'FAILED';
            const billPrintFailed = order.printJobs?.bill?.status === 'FAILED';
            return (
              <OrderCard key={renderKey} $tone={orderStatusTone(order)}>
                <OrderTop>
                  <div>
                    <OrderNo>{order.orderNo || order.order_no || `#${String(order.id).slice(0, 8)}`}</OrderNo>
                    <OrderSub>{date.toLocaleDateString()} • {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</OrderSub>
                  </div>
                  <OrderAmount>{money(orderTotal(order))}</OrderAmount>
                </OrderTop>

                {(order.offline || order.syncStatus === 'CONFLICT' || kotPrintFailed || billPrintFailed) && (
                  <OrderBadges>
                    {(order.offline || order.syncStatus === 'QUEUED') && (
                      <OrderBadge>Sync pending</OrderBadge>
                    )}
                    {order.syncStatus === 'CONFLICT' && (
                      <OrderBadge $tone="red">Sync conflict</OrderBadge>
                    )}
                    {kotPrintFailed && (
                      <OrderBadge $tone="red">KOT print failed</OrderBadge>
                    )}
                    {billPrintFailed && (
                      <OrderBadge $tone="red">Bill print failed</OrderBadge>
                    )}
                  </OrderBadges>
                )}

                <OrderInfo>
                  <InfoPill>
                    <span>Status</span>
                    <strong>{statusText(order)}</strong>
                  </InfoPill>
                  <InfoPill>
                    <span>Type</span>
                    <strong>{fulfillmentLabel(order)}</strong>
                  </InfoPill>
                  <InfoPill>
                    <span>Invoice</span>
                    <strong>{order.invoiceNo || order.invoice_no || '-'}</strong>
                  </InfoPill>
                  <InfoPill>
                    <span>Payment</span>
                    <strong>{order.paymentStatus || order.payment_status || '-'}</strong>
                  </InfoPill>
                </OrderInfo>

                {items.length ? (
                  <OrderItemsList>
                    <OrderItemsTitle>
                      <span>Item</span>
                      <span>Qty</span>
                      <span>Total</span>
                    </OrderItemsTitle>
                    {items.map((item, index) => {
                      const displayName = item.variant_name ? `${item.name} (${item.variant_name})` : item.name;
                      const parsedLineTotal = Number(item.line_total);
                      const rowTotal = Number.isFinite(parsedLineTotal)
                        ? parsedLineTotal
                        : Number(item.price || 0) * Number(item.quantity || 1);
                      return (
                        <OrderItemRow key={`${renderKey}-${item.productId || item.name}-${index}`}>
                          <span>{displayName}</span>
                          <strong>{quantityText(item.quantity)} x {money(item.price)}</strong>
                          <strong>{money(rowTotal)}</strong>
                        </OrderItemRow>
                      );
                    })}
                  </OrderItemsList>
                ) : (
                  <OrderItemsEmpty>No order items found for this order</OrderItemsEmpty>
                )}

                <OrderActions>
                  <ActionButton type="button" onClick={() => onPrint(order, 'kot')}>
                    <FaFire /> KOT
                  </ActionButton>
                  <ActionButton type="button" $tone="blue" onClick={() => onPrint(order, 'bill')}>
                    <FaPrint /> Bill
                  </ActionButton>
                  {open && (
                    <ActionButton type="button" $tone="green" onClick={() => onSettle(order)} style={{ gridColumn: '1 / -1' }}>
                      <FaWallet /> Settle & Print Bill
                    </ActionButton>
                  )}
                </OrderActions>
              </OrderCard>
            );
          })}
        </HistoryGrid>
      )}

      <style jsx>{`
        .spin { animation: spin 0.9s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </HistoryShell>
  );
}
