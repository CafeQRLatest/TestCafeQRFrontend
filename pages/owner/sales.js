import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { useRouter } from 'next/router';
import api from '../../utils/api';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { formatTzDate, getBusinessNow, getLocalISOString, businessTimeToUtc } from '../../utils/timezoneUtils';
import DashboardLayout from '../../components/DashboardLayout';
import {
  FaReceipt, FaPrint, FaCheck, FaExclamationCircle,
  FaSearch, FaEdit, FaTimesCircle
} from 'react-icons/fa';
import { PageContainer } from '../../components/PremiumPOSUI';
import CounterSale from '../../components/CounterSale';
import OrderTypeSelectorModal from '../../components/OrderTypeSelectorModal';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import NiceSelect from '../../components/NiceSelect';
import TablePopover from '../../components/TablePopover';
import { toDisplayItems } from '../../utils/printUtils';
import { isKnownOffline } from '../../utils/networkState';
import { publishAccountingDataChanged } from '../../utils/accountingRealtime';
import { getQueuedOfflineOrders, getRecentPrintJobs } from '../../utils/offlineStore';
import {
  isAndroidPrintStationEnabled,
  markCloudPrintJobPrinted,
  isPrintStationEnabled,
  autoPrintNewRemoteOrders,
  getRestaurantProfile
} from '../../utils/cloudPrintStation';
import { isNativePrintServicePaired } from '../../utils/printServiceClient';
import { ensureOfflineSequenceLeases, isMainOfflineBillingDevice } from '../../utils/offlineSequences';
import { normalizeOrder, normalizeOrders } from '../../utils/normalizeOrder';

const KotPrint = React.lazy(() => import('../../components/KotPrint'));
const PaymentDialog = React.lazy(() => import('../../components/PaymentDialog'));
const EditOrderPanel = React.lazy(() => import('../../components/EditOrderPanel'));
const DocumentViewerPopup = React.lazy(() => import('../../components/purchasing/DocumentViewerPopup'));

const TABLE_STATUS_META = {
  AVAILABLE: { label: 'AVAILABLE', bg: '#ffffff', fg: '#0f172a', border: '#cbd5e1', soft: '#f8fafc', accent: '#64748b' },
  OCCUPIED: { label: 'OCCUPIED', bg: '#ef4444', fg: '#ffffff', border: '#dc2626', soft: 'rgba(255,255,255,0.18)', accent: '#ffffff' },
  BILLED: { label: 'BILLED', bg: '#10b981', fg: '#ffffff', border: '#059669', soft: 'rgba(255,255,255,0.18)', accent: '#ffffff' },
  RESERVED: { label: 'RESERVED', bg: '#3b82f6', fg: '#ffffff', border: '#2563eb', soft: 'rgba(255,255,255,0.18)', accent: '#ffffff' },
  CLEANING: { label: 'CLEANING', bg: '#f97316', fg: '#ffffff', border: '#ea580c', soft: 'rgba(255,255,255,0.24)', accent: '#ffffff' },
  MAINTENANCE: { label: 'HOLD', bg: '#64748b', fg: '#ffffff', border: '#475569', soft: 'rgba(255,255,255,0.18)', accent: '#ffffff' },
};

const KITCHEN_PRINT_STATUSES = new Set(['KITCHEN', 'CONFIRMED', 'IN_PROGRESS', 'READY']);
const FINAL_BILL_PRINT_STATUSES = new Set(['BILLED', 'COMPLETED']);

function resolveCreatedPrintKind(order, requestedKind) {
  if (requestedKind === 'settle') return 'settle';
  const status = String(order?.orderStatus || order?.order_status || '').toUpperCase();
  if (KITCHEN_PRINT_STATUSES.has(status)) return 'kot';
  if (FINAL_BILL_PRINT_STATUSES.has(status)) return 'bill';
  return requestedKind === 'kot' ? 'kot' : 'bill';
}

function localPrintWillHandleKind(kind) {
  if (typeof window === 'undefined') return false;
  if (!['kot', 'bill'].includes(kind)) return false;
  if (window.localStorage.getItem('CAFEQR_PREFER_CLOUD_PRINT') === '1') return false;
  return (
    isAndroidPrintStationEnabled() ||
    isNativePrintServicePaired() ||
    window.localStorage.getItem('PRINTER_MODE') === 'winspool'
  );
}

function calculateKotDeltaJs(oldOrder, newOrder) {
  const oldLines = oldOrder?.lines || oldOrder?.orderLines || oldOrder?.order_items || [];
  const newLines = newOrder?.lines || newOrder?.orderLines || newOrder?.order_items || [];

  const oldMap = new Map();
  oldLines.forEach(line => {
    const key = `${line.productId || line.product_id || ''}:${line.variantId || line.variant_id || ''}`;
    oldMap.set(key, (oldMap.get(key) || 0) + Number(line.quantity || line.qty || 0));
  });

  const newMap = new Map();
  newLines.forEach(line => {
    const key = `${line.productId || line.product_id || ''}:${line.variantId || line.variant_id || ''}`;
    newMap.set(key, (newMap.get(key) || 0) + Number(line.quantity || line.qty || 0));
  });

  const addedLines = [];
  const removedLines = [];

  newLines.forEach(line => {
    const key = `${line.productId || line.product_id || ''}:${line.variantId || line.variant_id || ''}`;
    const oldQty = oldMap.get(key) || 0;
    const newQty = Number(line.quantity || line.qty || 0);
    if (newQty > oldQty) {
      addedLines.push({
        ...line,
        quantity: newQty - oldQty,
        qty: newQty - oldQty
      });
    }
  });

  oldLines.forEach(line => {
    const key = `${line.productId || line.product_id || ''}:${line.variantId || line.variant_id || ''}`;
    const oldQty = Number(line.quantity || line.qty || 0);
    const newQty = newMap.get(key) || 0;
    if (oldQty > newQty) {
      removedLines.push({
        ...line,
        quantity: oldQty - newQty,
        qty: oldQty - newQty
      });
    }
  });

  return { addedLines, removedLines };
}

function normalizeTableStatus(status) {
  const normalized = String(status || 'AVAILABLE').toUpperCase();
  if (['KITCHEN', 'CONFIRMED', 'DRAFT'].includes(normalized)) return 'OCCUPIED';
  if (TABLE_STATUS_META[normalized]) return normalized;
  return 'AVAILABLE';
}

function tableStatusMeta(status) {
  return TABLE_STATUS_META[normalizeTableStatus(status)];
}

function resolveTableOrderState(table, activeOrder) {
  const orderStatus = String(activeOrder?.orderStatus || activeOrder?.order_status || '').toUpperCase();
  let status = normalizeTableStatus(table?.status);

  if (orderStatus === 'BILLED') {
    status = 'BILLED';
  } else if (activeOrder && isOpenOrder(activeOrder)) {
    status = 'OCCUPIED';
  }

  const label = tableStatusMeta(status).label;
  const canStartOrder = !activeOrder && status === 'AVAILABLE';
  return {
    status,
    label,
    canStartOrder,
    blockedMessage: canStartOrder
      ? ''
      : `Table ${table?.tableNumber || ''} is currently ${label}. Change it to Available before placing an order.`.trim(),
  };
}

import {
  TopHeaderBar,
  TopSearchInput,
  TopNewOrderBtn,
  HistoryToolbar,
  FilterWrapper,
  HistoryShell,
  HistoryTitle,
  RefreshButton,
  HistoryControls,
  HistoryField,
  HistorySearchInput,
  HistoryActionButton,
  HistoryPager,
  HistoryGrid,
  HistTableWrap,
  HistTable,
  HistRow,
  OrderNoLink,
  RowDate,
  RdD,
  RdT,
  ItemsPill,
  StatusBadge,
  ActionGroup,
  OrderCard,
  OrderTop,
  OrderNo,
  OrderSub,
  OrderAmount,
  OrderBadges,
  OrderBadge,
  OrderInfo,
  InfoPill,
  OrderActions,
  OrderItemsList,
  OrderItemsTitle,
  OrderItemRow,
  OrderItemsEmpty,
  ActionButton,
  EmptyState,
  Toast,
  ModalOverlay,
  ModalContent,
  ActionBtn
} from '../../components/SalesStyles';

const money = (value, symbol = '₹') => `${symbol}${Number(value || 0).toFixed(2)}`;

function orderTotal(order) {
  return Number(order?.grandTotal ?? order?.grand_total ?? order?.totalAmount ?? order?.total_amount ?? 0);
}

function isAllBranchesScope(orgId) {
  const value = String(orgId || '').trim();
  return !value || value === '0';
}

function salesConfigCacheKey(orgId) {
  const value = String(orgId || '').trim();
  return `cafeqr_sales_config:${value || 'global'}`;
}

function orderBranchId(order) {
  return order?.orgId
    || order?.org_id
    || order?.branchId
    || order?.branch_id
    || order?.organizationId
    || order?.organization_id
    || null;
}

function matchesSelectedBranch(order, selectedOrgId) {
  if (isAllBranchesScope(selectedOrgId)) return true;
  const branchId = orderBranchId(order);
  return Boolean(branchId) && String(branchId) === String(selectedOrgId);
}

function orderIdentity(order) {
  if (!order) return '';
  if (order.offlineOperationId) return `op:${order.offlineOperationId}`;
  if (order.sourceOperationId) return `op:${order.sourceOperationId}`;
  if (order.source_operation_id) return `op:${order.source_operation_id}`;
  if (order.id) return `id:${order.id}`;
  const orderNo = order.orderNo || order.order_no;
  if (orderNo) return `no:${orderNo}`;
  return '';
}

function orderPrintKeys(order) {
  const keys = [];
  if (order?.offlineOperationId) keys.push(`op:${order.offlineOperationId}`);
  if (order?.sourceOperationId) keys.push(`op:${order.sourceOperationId}`);
  if (order?.source_operation_id) keys.push(`op:${order.source_operation_id}`);
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
      const kind = job.kind || job.jobKind || 'bill';
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

function toDateTimeInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function defaultHistoryRange(timezone) {
  const now = getBusinessNow(timezone);
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  return {
    from: toDateTimeInputValue(from),
    to: toDateTimeInputValue(to),
    q: '',
    status: '',
    terminalId: '',
  };
}

// localInputToIso has been replaced by businessTimeToUtc from timezoneUtils

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

function getOrderCreditCustomerId(order) {
  return order?.creditCustomerId || order?.credit_customer_id || order?.creditCustomer?.id || order?.credit_customer?.id || '';
}

function isCreditIntendedOrder(order, creditEnabled) {
  const paymentStatus = String(order?.paymentStatus || order?.payment_status || '').toUpperCase();
  return Boolean(creditEnabled && isOpenOrder(order) && getOrderCreditCustomerId(order) && paymentStatus !== 'PAID');
}

function fulfillmentLabel(order) {
  if (order?.tableNumber || order?.table_number) return `Dine in (Table ${order.tableNumber || order.table_number})`;
  const fulfillment = String(order?.fulfillmentType || order?.fulfillment_type || '').toUpperCase();
  if (fulfillment === 'DELIVERY') return 'Delivery';
  if (fulfillment === 'TAKEAWAY') return 'Takeaway';
  if (fulfillment === 'DINE_IN') return 'Dine in';
  return fulfillment || 'Dine in';
}

function customerLabel(order) {
  const customers = Array.isArray(order?.customers) ? order.customers : [];
  if (customers.length) {
    return customers
      .map(customer => {
        const name = customer.name || 'Guest';
        return customer.phone ? `${name} (${customer.phone})` : name;
      })
      .join(', ');
  }
  return order?.customerName || order?.customerPhone || '-';
}

function paymentMethodLabel(order) {
  const method = order?.paymentMethod || order?.payment_method || order?.reference;
  if (!method) return '-';
  return String(method).replace(/_/g, ' ');
}

function salesEndpointErrorDetails(error) {
  return {
    status: error?.response?.status || null,
    code: error?.code || null,
    message: error?.response?.data?.message || error?.message || String(error || ''),
  };
}

function logSalesEndpointFailure(label, error) {
  console.warn(`[Sales] ${label} failed`, salesEndpointErrorDetails(error));
}

function isSuperAdminRole(role) {
  return role === 'SUPER_ADMIN' || role === 'ROLE_SUPER_ADMIN';
}

export default function Sales() {
  return <SalesContent />;
}

function SalesContent() {
  const router = useRouter();
  const { timezone, orgId, userRole, switchBranch, canCancelOrder } = useAuth();
  const isSalesBranchMissing = !orgId;
  const canSelectBranchInSales = isSuperAdminRole(userRole);
  const [tables, setTables] = useState([]);
  const [floorOrders, setFloorOrders] = useState([]);
  const [historyOrders, setHistoryOrders] = useState([]);
  const [historyPage, setHistoryPage] = useState({ number: 0, size: 20, totalPages: 0, totalElements: 0 });
  const [historyFilters, setHistoryFilters] = useState(() => defaultHistoryRange(timezone));
  const [historySummary, setHistorySummary] = useState(null);
  const [branches, setBranches] = useState([]);
  const [terminals, setTerminals] = useState([]);

  useEffect(() => {
    if (isSuperAdminRole(userRole)) {
      api.get('/api/v1/organizations')
        .then(resp => {
          if (resp.data.success) {
            setBranches(resp.data.data || []);
          }
        })
        .catch(err => {
          setBranches([]);
          logSalesEndpointFailure('organizations fetch', err);
        });
    }
  }, [userRole]);

  useEffect(() => {
    api.get('/api/v1/terminals')
      .then(resp => {
        if (resp.data.success) {
          setTerminals(resp.data.data || []);
        }
      })
      .catch(err => {
        setTerminals([]);
        logSalesEndpointFailure('terminals fetch', err);
      });
  }, []);

  const handleOrgChange = useCallback((val) => {
    const selectedBranch = branches.find(b => String(b.id) === String(val));
    if (selectedBranch) {
      switchBranch(selectedBranch.id, selectedBranch.name);
    } else {
      switchBranch(null, null);
    }
  }, [branches, switchBranch]);
  const [queuedOrders, setQueuedOrders] = useState([]);
  const [printJobsByOrder, setPrintJobsByOrder] = useState({});
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [config, setConfig] = useState(null);
  const sym = config?.currencySymbol || '₹';
  const [selectedTable, setSelectedTable] = useState(null);
  const [popoverTable, setPopoverTable] = useState(null);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [cancelOrder, setCancelOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionBusy, setActionBusy] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [activeView, setActiveView] = useState('order_type');
  const [billingUi, setBillingUi] = useState('counter');
  const [pendingOrderType, setPendingOrderType] = useState(null); // 'TABLE'|'DINE_IN'|'TAKEAWAY'|'DELIVERY'
  const [printOrder, setPrintOrder] = useState(null);
  const [printKind, setPrintKind] = useState('bill');
  const [toast, setToast] = useState(null);
  const [creditCustomers, setCreditCustomers] = useState([]);
  const [viewingDoc, setViewingDoc] = useState(null);

  useEffect(() => {
    setIsMounted(true);
    try {
      const cached = localStorage.getItem(salesConfigCacheKey(orgId));
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') {
          setConfig(parsed);
          setBillingUi(parsed.defaultBillingUiMode || 'counter');
          if (!parsed.tableManagementEnabled) {
            setPendingOrderType('DINE_IN');
            setSelectedTable({ tableNumber: 'COUNTER', id: null, orderType: 'DINE_IN' });
            setActiveView('billing');
          } else {
            setActiveView('order_type');
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load cached config", e);
    }
  }, [orgId]);
  const tablesAbortControllerRef = useRef(null);
  const ordersAbortControllerRef = useRef(null);
  const historyAbortControllerRef = useRef(null);
  const configAbortControllerRef = useRef(null);
  const historyFiltersTouchedRef = useRef(false);
  const historyOrgScopeRef = useRef(orgId);
  const toastTimerRef = useRef(null);
  const isPopStateRef = useRef(false);

  const isMountedRef = useRef(true);
  const pollingTimeoutRef = useRef(null);
  const isLivePollingRef = useRef(false);
  const isPendingRefreshRef = useRef(false);
  const pendingTableFetchRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const showToast = useCallback((message, type = 'success') => {
    if (!isMountedRef.current) return;
    setToast({ message, type });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      if (isMountedRef.current) {
        setToast(null);
      }
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      tablesAbortControllerRef.current?.abort();
      ordersAbortControllerRef.current?.abort();
      historyAbortControllerRef.current?.abort();
      configAbortControllerRef.current?.abort();
      clearTimeout(pollingTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!config) return;

    // Determine billing UI mode from config
    const uiMode = config.defaultBillingUiMode || 'counter';
    setBillingUi(uiMode);

    if (!config.tableManagementEnabled) {
      // If table management is OFF, we force the billing screen with COUNTER table DINE_IN order
      if (activeView !== 'billing' || selectedTable?.tableNumber !== 'COUNTER' || selectedTable?.orderType !== 'DINE_IN') {
        setPendingOrderType('DINE_IN');
        setSelectedTable({ tableNumber: 'COUNTER', id: null, orderType: 'DINE_IN' });
        setActiveView('billing');
      }
    } else {
      // If table management is ON, we cannot have DINE_IN with COUNTER table.
      // Redirect to order_type if we are in this state.
      if (
        activeView === 'billing' &&
        selectedTable?.tableNumber === 'COUNTER' &&
        selectedTable?.orderType !== 'TAKEAWAY' &&
        selectedTable?.orderType !== 'DELIVERY'
      ) {
        setPendingOrderType(null);
        setSelectedTable(null);
        setActiveView('order_type');
      }
    }
  }, [config, activeView, selectedTable?.tableNumber, selectedTable?.orderType]);

  useEffect(() => {
    if (historyFiltersTouchedRef.current) return;
    setHistoryFilters(defaultHistoryRange(timezone));
  }, [timezone]);

  const loadOfflineOrderState = useCallback(async () => {
    try {
      const [queued, jobs] = await Promise.all([
        getQueuedOfflineOrders(),
        getRecentPrintJobs(300),
      ]);

      // Deduplicate: if a table already has a final (completed/paid/billed) offline
      // order in the queue, suppress any earlier open order (e.g. a KOT) for the
      // same table so it does not keep the table marked as occupied on the Table tab.
      const deduped = (() => {
        // Build a set of tableIds/tableNumbers that have a final offline order.
        const finalTableIds = new Set();
        const finalTableNos = new Set();
        (queued || []).forEach((o) => {
          const status = String(o?.orderStatus || o?.order_status || '').toUpperCase();
          if (['COMPLETED', 'PAID', 'BILLED'].includes(status)) {
            const tId = String(o?.tableId || o?.table_id || '');
            const tNo = String(o?.tableNumber || o?.table_number || '');
            if (tId) finalTableIds.add(tId);
            if (tNo) finalTableNos.add(tNo);
          }
        });
        if (finalTableIds.size === 0 && finalTableNos.size === 0) return queued;
        return (queued || []).filter((o) => {
          if (!isOpenOrder(o)) return true; // keep completed/cancelled orders as-is
          const tId = String(o?.tableId || o?.table_id || '');
          const tNo = String(o?.tableNumber || o?.table_number || '');
          // Drop open orders whose table already has a final entry
          if (tId && finalTableIds.has(tId)) return false;
          if (tNo && finalTableNos.has(tNo)) return false;
          return true;
        });
      })();

      setQueuedOrders(deduped);
      setPrintJobsByOrder(buildPrintJobMap(jobs || []));
    } catch (error) {
      console.warn('Failed to load offline order state', error?.message || error);
    }
  }, []);

  const fetchTables = useCallback(async () => {
    if (tablesAbortControllerRef.current) {
      tablesAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    tablesAbortControllerRef.current = controller;
    try {
      const res = await api.get('/api/v1/tables/active', { signal: controller.signal });
      if (tablesAbortControllerRef.current === controller && isMountedRef.current) {
        setTables(res.data.data || []);
      }
    } catch (e) {
      if (e && e.name !== 'CanceledError') {
        if (e?.code === 'OFFLINE_CACHE_MISS') {
          showToast('Open this POS once online to prepare offline table data.', 'error');
        } else if (!isKnownOffline() && e?.message !== 'Network Error') {
          console.error('Failed to fetch tables', e);
          showToast('Failed to load tables', 'error');
        }
      }
    } finally {
      if (tablesAbortControllerRef.current === controller) {
        tablesAbortControllerRef.current = null;
      }
    }
  }, [showToast]);

  const fetchOrders = useCallback(async () => {
    if (ordersAbortControllerRef.current) {
      ordersAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    ordersAbortControllerRef.current = controller;
    try {
      const res = await api.get('/api/v1/orders/sales/live', { signal: controller.signal });
      if (ordersAbortControllerRef.current === controller && isMountedRef.current) {
        setFloorOrders(normalizeOrders(res.data.data || []));
      }
    } catch (e) {
      if (e && e.name !== 'CanceledError') {
        if (e?.code === 'OFFLINE_CACHE_MISS') {
          showToast('Open order history once online to prepare offline data.', 'error');
        } else if (!isKnownOffline() && e?.message !== 'Network Error') {
          console.error('Failed to fetch live sale orders', e);
          showToast('Failed to load active orders', 'error');
        }
      }
    } finally {
      if (ordersAbortControllerRef.current === controller) {
        if (isMountedRef.current) {
          await loadOfflineOrderState();
        }
        if (ordersAbortControllerRef.current === controller) {
          ordersAbortControllerRef.current = null;
        }
      }
    }
  }, [loadOfflineOrderState, showToast]);

  const fetchCreditConfig = useCallback(async () => {
    if (configAbortControllerRef.current) {
      configAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    configAbortControllerRef.current = controller;

    try {
      const configRes = await api.get('/api/v1/configurations', { signal: controller.signal });
      const nextConfig = configRes.data?.data || null;
      if (nextConfig && typeof window !== 'undefined') {
        localStorage.setItem(salesConfigCacheKey(orgId), JSON.stringify(nextConfig));
      }
      if (configAbortControllerRef.current === controller && isMountedRef.current) {
        setConfig(nextConfig);
      }
      if (nextConfig?.creditEnabled) {
        const customersRes = await api.get('/api/v1/credit/customers', { 
          params: { status: 'ACTIVE' },
          signal: controller.signal
        });
        if (configAbortControllerRef.current === controller && isMountedRef.current) {
          setCreditCustomers(customersRes.data?.data || []);
        }
      } else {
        if (configAbortControllerRef.current === controller && isMountedRef.current) {
          setCreditCustomers([]);
        }
      }
    } catch (error) {
      if (error && error.name !== 'CanceledError') {
        if (!isKnownOffline() && error?.message !== 'Network Error') {
          logSalesEndpointFailure('configuration fetch', error);
        }
        if (configAbortControllerRef.current === controller && isMountedRef.current) {
          setCreditCustomers([]);
          setConfig((current) => current || {
            tableManagementEnabled: true,
            defaultBillingUiMode: 'counter',
            creditEnabled: false,
          });
        }
      }
    } finally {
      if (configAbortControllerRef.current === controller) {
        configAbortControllerRef.current = null;
      }
    }
  }, [orgId]);

  const handleCreditCustomerCreated = useCallback((customer) => {
    if (!customer?.id) return;
    setCreditCustomers((current) => {
      const next = [customer, ...current.filter((item) => String(item.id) !== String(customer.id))];
      return next.sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
    });
  }, []);

  const fetchHistoryOrders = useCallback(async (page = 0, filters = historyFilters) => {
    if (historyAbortControllerRef.current) {
      historyAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    historyAbortControllerRef.current = controller;
    
    setOrdersLoading(true);
    try {
      const fromUtc = businessTimeToUtc(filters.from, timezone);
      const toUtc = businessTimeToUtc(filters.to, timezone);
      
      const response = await api.post('/api/v2/sales/dashboard', {
        from: fromUtc,
        to: toUtc,
        q: filters.q?.trim() || undefined,
        status: filters.status || undefined,
        orgId: orgId,
        terminalId: filters.terminalId || undefined,
        page,
        size: historyPage.size || 20
      }, {
        signal: controller.signal
      });

      const { summary, orders } = response.data.data || {};
      
      if (historyAbortControllerRef.current === controller && isMountedRef.current) {
        if (orders) {
          setHistoryOrders(normalizeOrders(orders.content || []));
          setHistoryPage({
            number: orders.page ?? 0,
            size: orders.size ?? historyPage.size ?? 20,
            totalPages: orders.totalPages ?? 0,
            totalElements: orders.totalElements ?? 0,
          });
        }
        
        if (summary) {
          setHistorySummary(summary);
        }
      }
    } catch (e) {
      if (e && e.name !== 'CanceledError') {
        if (historyAbortControllerRef.current === controller && isMountedRef.current) {
          setHistoryOrders([]);
          setHistoryPage({ number: 0, size: historyPage.size || 20, totalPages: 0, totalElements: 0 });
          setHistorySummary(null);
        }
        if (e?.code === 'OFFLINE_CACHE_MISS') {
          showToast('Open order history once online to prepare offline data.', 'error');
        } else if (!isKnownOffline() && e?.message !== 'Network Error') {
          console.error('Failed to fetch order history dashboard', e);
          showToast(e?.response?.data?.message || 'Failed to load order history', 'error');
        }
      }
    } finally {
      if (historyAbortControllerRef.current === controller) {
        historyAbortControllerRef.current = null;
        if (isMountedRef.current) {
          setOrdersLoading(false);
        }
      }
    }
  }, [historyFilters, historyPage.size, showToast, timezone, orgId]);

  useEffect(() => {
    setSelectedTable(null);
    setPopoverTable(null);
    setPaymentOrder(null);
    setEditingOrder(null);
    setPrintOrder(null);
    setPrintKind('bill');
    setTables([]);
    setFloorOrders([]);
    setHistoryOrders([]);
    setHistorySummary(null);
    setCreditCustomers([]);
    setOrdersLoading(false);
  }, [orgId]);

  useEffect(() => {
    if (activeView !== 'billing' || selectedTable) return;
    if (!orgId) {
      setPendingOrderType(null);
      setActiveView('order_type');
      return;
    }

    if (config?.tableManagementEnabled === false) {
      console.warn('[Sales] Recovered billing view without selected table; restoring counter sale.', { orgId });
      setPendingOrderType('DINE_IN');
      setSelectedTable({ tableNumber: 'COUNTER', id: null, orderType: 'DINE_IN' });
      return;
    }

    console.warn('[Sales] Recovered billing view without selected table; returning to order type selection.', { orgId });
    setPendingOrderType(null);
    setActiveView('order_type');
  }, [activeView, config?.tableManagementEnabled, orgId, selectedTable]);

  useEffect(() => {
    const previousOrgId = historyOrgScopeRef.current;
    historyOrgScopeRef.current = orgId;
    if (previousOrgId === orgId || activeView !== 'history') return;
    fetchHistoryOrders(0);
  }, [activeView, fetchHistoryOrders, orgId]);

  // ── Browser Back-button interception ──────────────────────────────────────
  // Keep track of the activeView in history.state so that back-presses transition
  // views naturally without piling up sentinels or breaking history depth.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history) return;
    // Replace initial state with current view if it is empty
    if (!window.history.state || window.history.state.cafeqrView === undefined) {
      window.history.replaceState({ cafeqrView: activeView }, '');
    }
  }, [activeView]);

  useEffect(() => {
    if (!config?.tableManagementEnabled) return;
    
    // If the change was already triggered by popstate, don't push state again
    if (isPopStateRef.current) {
      isPopStateRef.current = false;
      return;
    }

    if (
      (activeView === 'billing' || activeView === 'order_type') &&
      window.history.state?.cafeqrView !== activeView
    ) {
      window.history.pushState({ cafeqrView: activeView }, '');
    }
  }, [activeView, config?.tableManagementEnabled]);



  useEffect(() => {
    if (!historyFiltersTouchedRef.current) return;
    const delayDebounceFn = setTimeout(() => {
      fetchHistoryOrders(0, historyFilters);
    }, 400);

    return () => clearTimeout(delayDebounceFn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyFilters.q, fetchHistoryOrders]);

  // Refresh coordinator: handles all live-order, active table, credit config, and offline state fetches.
  // Coalesces overlapping refresh requests using pending refs to prevent timer duplication.
  const requestLiveRefresh = useCallback(async ({ forceTableAndConfigFetch = false } = {}) => {
    const POLL_EVERY_TICK = 30000;

    const scheduleNext = () => {
      if (!isMountedRef.current) return;
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          requestLiveRefresh({ forceTableAndConfigFetch: true });
        }
      }, POLL_EVERY_TICK);
    };

    if (isLivePollingRef.current) {
      isPendingRefreshRef.current = true;
      if (forceTableAndConfigFetch) {
        pendingTableFetchRef.current = true;
      }
      return;
    }

    clearTimeout(pollingTimeoutRef.current);

    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      scheduleNext();
      return;
    }
    if (isKnownOffline()) {
      scheduleNext();
      return;
    }

    isLivePollingRef.current = true;
    try {
      await fetchOrders();
      if (forceTableAndConfigFetch) {
        await Promise.all([
          fetchTables(),
          fetchCreditConfig()
        ]);
      }
    } finally {
      isLivePollingRef.current = false;
      
      if (isPendingRefreshRef.current && isMountedRef.current) {
        const nextTableFetch = pendingTableFetchRef.current;
        
        isPendingRefreshRef.current = false;
        pendingTableFetchRef.current = false;
        
        requestLiveRefresh({ forceTableAndConfigFetch: nextTableFetch });
      } else {
        scheduleNext();
      }
    }
  }, [fetchOrders, fetchTables, fetchCreditConfig]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleConfigUpdated = () => {
      localStorage.removeItem('cafeqr_sales_config');
      localStorage.removeItem(salesConfigCacheKey(orgId));
      requestLiveRefresh({ forceTableAndConfigFetch: true });
    };
    window.addEventListener('cafeqr-config-updated', handleConfigUpdated);
    return () => window.removeEventListener('cafeqr-config-updated', handleConfigUpdated);
  }, [requestLiveRefresh, orgId]);

  useEffect(() => {
    if (!config?.tableManagementEnabled) return;

    const handlePopState = (e) => {
      const targetView = e.state?.cafeqrView || 'history';
      isPopStateRef.current = true;

      if (targetView === 'order_type' || targetView === 'history') {
        setSelectedTable(null);
        setPendingOrderType(null);
      }
      if (targetView === 'order_type' && !isKnownOffline()) {
        requestLiveRefresh({ forceTableAndConfigFetch: true });
      }

      setActiveView(targetView);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [config?.tableManagementEnabled, requestLiveRefresh]);

  useEffect(() => {
    if (!orgId) {
      loadOfflineOrderState();
      return undefined;
    }

    // Initial eager load
    requestLiveRefresh({ forceTableAndConfigFetch: true });

    let refreshTimerId = null;

    const runRefresh = () => {
      requestLiveRefresh({ forceTableAndConfigFetch: true });
      fetchHistoryOrders(historyPage.number || 0);
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
      clearTimeout(pollingTimeoutRef.current);
    };

    const handleNetworkState = (event) => {
      if (event?.detail?.offline) {
        clearTimeout(pollingTimeoutRef.current);
      } else {
        refreshWhenReachable();
      }
    };

    const handleQueueChanged = () => {
      loadOfflineOrderState();
      fetchHistoryOrders(historyPage.number || 0);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runRefresh();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('cafeqr-network-state', handleNetworkState);
    window.addEventListener('cafeqr-sync-queue-changed', handleQueueChanged);
    window.addEventListener('cafeqr-print-jobs-changed', handleQueueChanged);
    window.addEventListener('cafeqr-sync-complete', runRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (refreshTimerId) window.clearTimeout(refreshTimerId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('cafeqr-network-state', handleNetworkState);
      window.removeEventListener('cafeqr-sync-queue-changed', handleQueueChanged);
      window.removeEventListener('cafeqr-print-jobs-changed', handleQueueChanged);
      window.removeEventListener('cafeqr-sync-complete', runRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [requestLiveRefresh, loadOfflineOrderState, fetchHistoryOrders, historyPage.number, orgId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleMessage = (event) => {
      if (!event.data) return;

      if (event.data.type === 'order-updated' || event.data.type === 'new-order-push') {
        console.log('[push:web] Order event received in sales page:', event.data);
        requestLiveRefresh({ forceTableAndConfigFetch: true });
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [requestLiveRefresh]);

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

  useEffect(() => {
    if (typeof window === 'undefined' || !isMainOfflineBillingDevice()) return;
    ensureOfflineSequenceLeases().catch((error) => {
      console.warn('Unable to reserve offline billing ranges:', error?.message || error);
    });
  }, []);

  const activeOrderByTable = useMemo(() => {
    const map = new Map();
    mergeOrdersWithQueued(floorOrders, queuedOrders).filter(isOpenOrder).forEach(order => {
      const key = String(order.tableId || order.table_id || order.tableNumber || order.table_number || '');
      if (key && !map.has(key)) map.set(key, order);
    });
    return map;
  }, [floorOrders, queuedOrders]);

  const getActiveOrderForTable = useCallback((table) => {
    if (!table) return null;
    return activeOrderByTable.get(String(table.id)) || activeOrderByTable.get(String(table.tableNumber)) || null;
  }, [activeOrderByTable]);

  const popoverOrder = useMemo(() => getActiveOrderForTable(popoverTable), [getActiveOrderForTable, popoverTable]);
  const popoverTableState = useMemo(
    () => resolveTableOrderState(popoverTable, popoverOrder),
    [popoverOrder, popoverTable]
  );

  const availableMoveTables = useMemo(() => (
    tables.filter((table) => {
      if (table.id === popoverTable?.id) return false;
      return resolveTableOrderState(table, getActiveOrderForTable(table)).canStartOrder;
    })
  ), [getActiveOrderForTable, popoverTable, tables]);



  const historyQueuedOrders = useMemo(() => {
    const branchFiltered = queuedOrders.filter((order) => matchesSelectedBranch(order, orgId));

    // When a dine-in kitchen order (KOT) is created offline and then settled, both
    // entries end up in queuedOrders with different offlineOperationIds. This would
    // show them as two separate rows in the Completed tab. Suppress any open/pending
    // order for a table that already has a final (completed/paid/billed) offline entry.
    const finalTableIds = new Set();
    const finalTableNos = new Set();
    branchFiltered.forEach((o) => {
      const status = String(o?.orderStatus || o?.order_status || '').toUpperCase();
      if (['COMPLETED', 'PAID', 'BILLED'].includes(status)) {
        const tId = String(o?.tableId || o?.table_id || '');
        const tNo = String(o?.tableNumber || o?.table_number || '');
        if (tId) finalTableIds.add(tId);
        if (tNo) finalTableNos.add(tNo);
      }
    });

    if (finalTableIds.size === 0 && finalTableNos.size === 0) return branchFiltered;

    return branchFiltered.filter((o) => {
      if (!isOpenOrder(o)) return true; // always keep completed/cancelled entries
      const tId = String(o?.tableId || o?.table_id || '');
      const tNo = String(o?.tableNumber || o?.table_number || '');
      if (tId && finalTableIds.has(tId)) return false; // superseded KOT/open order
      if (tNo && finalTableNos.has(tNo)) return false;
      return true;
    });
  }, [orgId, queuedOrders]);

  const filteredQueuedOrders = useMemo(() => {
    return historyQueuedOrders.filter(order => {
      if (historyFilters.status) {
        const orderStatus = String(order?.orderStatus || order?.order_status || '').toUpperCase();
        const paymentStatus = String(order?.paymentStatus || order?.payment_status || '').toUpperCase();
        if (historyFilters.status === 'PAID') {
          if (paymentStatus !== 'PAID') return false;
        } else if (orderStatus !== historyFilters.status) {
          return false;
        }
      }
      if (historyFilters.terminalId) {
        const termId = String(order?.terminalId || order?.terminal_id || '');
        if (termId !== historyFilters.terminalId) return false;
      }
      return true;
    });
  }, [historyQueuedOrders, historyFilters.status, historyFilters.terminalId]);

  const historyDisplayOrders = useMemo(() => {
    return mergeOrdersWithQueued(historyOrders, filteredQueuedOrders)
      .map((order) => attachPrintJobs(order, printJobsByOrder));
  }, [historyOrders, filteredQueuedOrders, printJobsByOrder]);

  const publishAccountingRefresh = useCallback((reason, order = null) => {
    if (isKnownOffline() || order?.offline) return;
    publishAccountingDataChanged({
      source: 'sales',
      reason,
      orderId: order?.id || null,
      orderNo: order?.orderNo || order?.order_no || null,
      orderStatus: order?.orderStatus || order?.order_status || null,
      paymentStatus: order?.paymentStatus || order?.payment_status || null,
      orderDate: order?.orderDate || order?.order_date || order?.createdAt || order?.created_at || new Date().toISOString()
    });
  }, []);

  const hasAccountingImpact = useCallback((order) => {
    const orderStatus = String(order?.orderStatus || order?.order_status || '').toUpperCase();
    const paymentStatus = String(order?.paymentStatus || order?.payment_status || '').toUpperCase();
    return ['BILLED', 'COMPLETED', 'CANCELLED'].includes(orderStatus) || paymentStatus === 'PAID';
  }, []);

  const handleOrderCreated = useCallback(async (rawOrder, kind) => {
    const order = normalizeOrder(rawOrder);
    const printKind = resolveCreatedPrintKind(order, kind);

    // When an offline final (completed/settled) dine-in order is created, we must
    // also evict any lingering open orders for the same table (e.g. a prior KOT that
    // has a different offlineOperationId). Without this, the kitchen-order entry stays
    // in floorOrders/queuedOrders with orderStatus='KITCHEN', keeping the table marked
    // as occupied even after the guest has paid.
    const isOfflineFinalOrder =
      order?.offline &&
      ['COMPLETED', 'PAID', 'BILLED'].includes(
        String(order?.orderStatus || order?.order_status || '').toUpperCase()
      );
    const completedTableId = isOfflineFinalOrder
      ? String(order?.tableId || order?.table_id || '')
      : '';
    const completedTableNo = isOfflineFinalOrder
      ? String(order?.tableNumber || order?.table_number || '')
      : '';

    const isSameTable = (item) => {
      if (!isOfflineFinalOrder) return false;
      if (!completedTableId && !completedTableNo) return false;
      const tId = String(item?.tableId || item?.table_id || '');
      const tNo = String(item?.tableNumber || item?.table_number || '');
      return (completedTableId && tId === completedTableId) ||
             (completedTableNo && tNo === completedTableNo);
    };

    setFloorOrders((current) => {
      const orderId = order?.id || order?.offlineOperationId || order?.orderNo;
      const filtered = current.filter((item) => {
        const itemId = item?.id || item?.offlineOperationId || item?.orderNo;
        // Remove exact match by ID, and also remove any open order for the same
        // table when the incoming order is the final settlement for that table.
        if (itemId === orderId) return false;
        if (isSameTable(item) && isOpenOrder(item)) return false;
        return true;
      });
      return [order, ...filtered];
    });

    if (order?.offline) {
      if (isMainOfflineBillingDevice()) {
        setPrintOrder(order);
        // If it's a final offline sale, treat as bill so it prints locally.
        setPrintKind(printKind === 'settle' ? 'bill' : printKind);
      }
      // Merge the completed order into queuedOrders, and simultaneously evict any
      // prior open orders for the same table so activeOrderByTable sees the table as free.
      setQueuedOrders((current) => {
        const withoutStaleTableOrders = isOfflineFinalOrder
          ? current.filter((item) => !(isSameTable(item) && isOpenOrder(item)))
          : current;
        return mergeOrdersWithQueued(withoutStaleTableOrders, [order]);
      });
      setTimeout(() => {
        loadOfflineOrderState();
      }, 150);
      showToast(
        isMainOfflineBillingDevice()
          ? 'Offline final sale saved on this main device and sent to printer.'
          : 'Offline sale queued as provisional. It will sync when internet returns.'
      );
      return;
    }

    if (printKind === 'settle') {
      setPaymentOrder(order);
      return; // PaymentDialog will handle the rest
    }

    // Android Bluetooth keeps its existing local print path. Windows online
    // waits for the backend print job claimed by the Windows print service.
    if (localPrintWillHandleKind(printKind)) {
      let orderForPrint = order;
      if (order?.id) {
        try {
          await markCloudPrintJobPrinted(order, printKind);
        } catch (error) {
          console.warn('Unable to pre-emptively mark cloud print job printed on creation:', error?.message || error);
        }
        if (printKind === 'bill' || printKind === 'kot') {
          try {
            const { data } = await api.get(`/api/v1/orders/${order.id}`);
            orderForPrint = data?.data || order;
          } catch (error) {
            console.warn('Unable to hydrate order before auto print:', error?.message || error);
          }
        }
      }
      setPrintOrder(orderForPrint);
      setPrintKind(printKind);
      showToast(printKind === 'kot' ? 'KOT created — printing now...' : 'Bill created — printing now...');
    } else {
      showToast(
        printKind === 'kot'
          ? 'KOT created. Main print station will print when online.'

          : 'Bill created. Main print station will print when online.'
      );
    }

    if (printKind === 'bill' || hasAccountingImpact(order)) {
      publishAccountingRefresh('order-created', order);
    }

    if (!isKnownOffline()) {
      requestLiveRefresh({ forceTableAndConfigFetch: true });
    }
  }, [hasAccountingImpact, publishAccountingRefresh, showToast, requestLiveRefresh]);

  const handleNewOrder = () => {
    if (!orgId) {
      showToast('Select a branch before using Sales POS.', 'error');
      return;
    }
    // If table management is OFF, skip the order-type picker and go
    // directly to the billing screen with DINE_IN as the order type.
    if (!config?.tableManagementEnabled) {
      setPendingOrderType('DINE_IN');
      setSelectedTable({ tableNumber: 'COUNTER', id: null, orderType: 'DINE_IN' });
      setActiveView('billing');
      return;
    }
    setActiveView('order_type');
  };

  const handleOrderTypeSelected = useCallback(({ orderType, table }) => {
    if (!orgId) {
      showToast('Select a branch before using Sales POS.', 'error');
      setPendingOrderType(null);
      setActiveView('order_type');
      return;
    }

    if (orderType === 'TABLE' && table) {
      const status = String(table.status || 'AVAILABLE').toUpperCase();
      if (status !== 'AVAILABLE') {
        showToast(`Table ${table.tableNumber || ''} is not available for a new order.`, 'error');
        return;
      }
      setSelectedTable(table);
    } else {
      // Non-table order: use a virtual counter table
      setSelectedTable({ tableNumber: 'COUNTER', id: null, orderType });
    }
    setActiveView('billing');
    setPendingOrderType(orderType);
  }, [orgId, showToast]);

  const refreshSalesState = useCallback(() => {
    requestLiveRefresh({ forceTableAndConfigFetch: true });
    if (activeView === 'history') {
      fetchHistoryOrders(historyPage.number || 0);
    }
  }, [activeView, fetchHistoryOrders, requestLiveRefresh, historyPage.number]);

  const loadFullOrder = async (orderId) => {
    const { data } = await api.get(`/api/v1/orders/${orderId}`);
    return data.data;
  };

  const handlePrintOrder = async (order, kind) => {
    try {
      if (order?.offline) {
        if (isMainOfflineBillingDevice()) {
          setPrintOrder({ ...order, _manualPrint: true });
          setPrintKind(kind);
          showToast(kind === 'kot' ? 'Offline KOT sent to printer' : 'Offline bill sent to printer');
        } else {
          showToast('This is a provisional offline order. Print from the main device after sync.', 'error');
        }
        return;
      }

      if (!localPrintWillHandleKind(kind)) {
        await enqueueCloudPrintJob(order, kind);
        await loadOfflineOrderState();
        showToast(kind === 'kot' ? 'KOT queued for the main print station' : 'Bill queued for the main print station');
        return;
      }

      const fullOrder = await loadFullOrder(order.id);
      setPrintOrder({ ...(fullOrder || order), _manualPrint: true });
      setPrintKind(kind);
      showToast(kind === 'kot' ? 'KOT sent to printer' : 'Bill sent to printer');
      if (order?.id) {
        markCloudPrintJobPrinted(order, kind).catch((error) => {
          console.warn('Unable to pre-emptively mark cloud print job printed on manual trigger:', error?.message || error);
        });
      }
    } catch (e) {
      console.error('Print preparation failed', e);
      showToast('Print preparation failed', 'error');
    }
  };

  const handleLocalPrintDone = useCallback(() => {
    const printedOrder = printOrder;
    const printedKind = printKind;
    setPrintOrder(null);

    if (printedOrder && !printedOrder.offline) {
      markCloudPrintJobPrinted(printedOrder, printedKind)
        .catch((error) => {
          console.warn('Unable to mark cloud print job printed:', error?.message || error);
        })
        .finally(loadOfflineOrderState);
    } else {
      loadOfflineOrderState();
    }
  }, [loadOfflineOrderState, printKind, printOrder]);

  const handleOpenTableOrder = (table) => {
    const tableState = resolveTableOrderState(table, getActiveOrderForTable(table));
    if (!tableState.canStartOrder) {
      showToast(tableState.blockedMessage, 'error');
      return;
    }
    setPopoverTable(null);
    setSelectedTable(table);
  };

  const handleBillOrder = async (order) => {
    if (!order) return;
    if (order?.offline) {
      // Optimistically mark offline order as BILLED so table turns green immediately
      const billedOffline = { ...order, orderStatus: 'BILLED', order_status: 'BILLED' };
      setFloorOrders((current) => current.map((item) => {
        const itemId = item?.id || item?.offlineOperationId || item?.orderNo;
        const orderId = order?.id || order?.offlineOperationId || order?.orderNo;
        return itemId === orderId ? { ...item, ...billedOffline } : item;
      }));
      setQueuedOrders((current) => current.map((item) => {
        const itemId = item?.id || item?.offlineOperationId || item?.orderNo;
        const orderId = order?.id || order?.offlineOperationId || order?.orderNo;
        return itemId === orderId ? { ...item, ...billedOffline } : item;
      }));
      await handlePrintOrder(billedOffline, 'bill');
      setPopoverTable(null);
      return;
    }

    setActionBusy('bill');
    try {
      const { data } = await api.post(
        `/api/v1/orders/${order.id}/bill`,
        localPrintWillHandleKind('bill') ? { skipAutoPrintKinds: ['BILL'] } : undefined
      );
      const billedOrder = data.data || order;
      setFloorOrders((current) => current.map((item) => item.id === billedOrder.id ? { ...item, ...billedOrder } : item));
      showToast('Bill generated for the table');
      setPopoverTable(null);
      publishAccountingRefresh('order-billed', billedOrder);
      if (localPrintWillHandleKind('bill')) {
        await handlePrintOrder(billedOrder, 'bill');
      }
      refreshSalesState();
    } catch (e) {
      console.error('Failed to bill order', e);
      showToast('Failed to bill order', 'error');
    } finally {
      setActionBusy('');
    }
  };

  const handleKotOrder = async (order) => {
    if (!order) return;
    setActionBusy('kot');
    try {
      await handlePrintOrder(order, 'kot');
      setPopoverTable(null);
    } finally {
      setActionBusy('');
    }
  };

  const handleSettleOrder = async (order) => {
    if (order?.offline) {
      showToast('This order is queued offline. Settle it after sync completes.', 'error');
      return;
    }

    if (isCreditIntendedOrder(order, config?.creditEnabled)) {
      const creditCustomerId = getOrderCreditCustomerId(order);
      setActionBusy('settle');
      try {
        const { data } = await api.post(`/api/v1/orders/${order.id}/complete-credit`, {
          creditCustomerId,
          ...(localPrintWillHandleKind('bill') ? { skipAutoPrintKinds: ['BILL'] } : {}),
        });
        const settledOrder = data.data || order;
        setFloorOrders((current) => current.map((item) =>
          item.id === settledOrder.id ? { ...item, ...settledOrder } : item
        ));
        showToast('Order completed as credit');
        setPaymentOrder(null);
        setPopoverTable(null);
        publishAccountingRefresh('order-credit-completed', settledOrder);
        if (localPrintWillHandleKind('bill')) {
          await handlePrintOrder(settledOrder, 'bill');
        }
        refreshSalesState();
      } catch (e) {
        console.error('Failed to complete credit order', e);
        showToast(e.response?.data?.message || 'Failed to complete credit order', 'error');
      } finally {
        setActionBusy('');
      }
      return;
    }

    setPaymentOrder(order);
    setPopoverTable(null);
  };

  const handleConfirmPayment = async (payload) => {
    if (!paymentOrder) return;
    setActionBusy('settle');
    try {
      const localBillPrint = localPrintWillHandleKind('bill');
      let settleId = paymentOrder.id;
      const linesChanged = (() => {
        if (paymentOrder?.isCompletedEdit) return true;
        const updatedLines = payload?.updatedOrder?.lines;
        const originalLines = paymentOrder?.lines;
        if (!updatedLines || !originalLines) return false;
        if (updatedLines.length !== originalLines.length) return true;

        const debugInfo = [];
        for (let i = 0; i < originalLines.length; i++) {
          const orig = originalLines[i];
          const origId = orig.id || orig.clientLineId || null;
          const origPid = orig.productId || orig.product_id || orig.id || '';
          const origVid = orig.variantId || orig.variant_id || null;

          const upd = updatedLines.find(u => {
            const uId = u.id || u.clientLineId || null;
            if (origId && uId && origId === uId) return true;

            const uPid = u.productId || u.product_id || u.id || '';
            const uVid = u.variantId || u.variant_id || null;
            return uPid === origPid && uVid === origVid;
          });

          if (!upd) {
            debugInfo.push(`Line${i}_NotFound_origId_${origId}_origPid_${origPid}`);
            continue;
          }

          const origQty = Number(orig.quantity || orig.qty || 0);
          const updQty = Number(upd.quantity || upd.qty || 0);
          const origDiscAmt = Number(orig.manualDiscountAmount ?? orig.manual_discount_amount ?? 0);
          const updDiscAmt = Number(upd.manualDiscountAmount ?? upd.manual_discount_amount ?? 0);
          const origDiscPct = Number(orig.manualDiscountPercent ?? orig.manual_discount_percent ?? 0);
          const updDiscPct = Number(upd.manualDiscountPercent ?? upd.manual_discount_percent ?? 0);

          if (origQty !== updQty) {
            debugInfo.push(`Line${i}_Qty_${origQty}_vs_${updQty}`);
          }
          if (origDiscAmt !== updDiscAmt) {
            debugInfo.push(`Line${i}_DiscAmt_${origDiscAmt}_vs_${updDiscAmt}`);
          }
          if (origDiscPct !== updDiscPct) {
            debugInfo.push(`Line${i}_DiscPct_${origDiscPct}_vs_${updDiscPct}`);
          }
        }

        if (debugInfo.length > 0) {
          const debugStr = `order_${paymentOrder.id}_mismatch_${debugInfo.join(',')}`;
          console.log("DEBUG sales linesChanged evaluates to TRUE:", debugStr);
          return true;
        }

        return false;
      })();

      if (payload?.updatedOrder && linesChanged) {
        const putRes = await api.patch(`/api/v1/orders/${paymentOrder.id}`, {
          ...payload.updatedOrder,
          paymentStatus: 'PENDING', // Force pending so backend doesn't auto-generate old payment during update
          ...(localBillPrint ? { skipAutoPrintKinds: ['BILL'] } : {}),
        });
        const newId = putRes?.data?.data?.id;
        if (newId) settleId = newId;
      }
      const endpoint = payload?.paymentMethod === 'CREDIT'
        ? `/api/v1/orders/${settleId}/complete-credit`
        : `/api/v1/orders/${settleId}/settle`;
      const requestPayload = payload?.paymentMethod === 'CREDIT'
        ? {
          creditCustomerId: payload.creditCustomerId,
          discountAmount: payload.discountAmount,
          roundOffAmount: payload.roundOffAmount,
          ...(localBillPrint ? { skipAutoPrintKinds: ['BILL'] } : {}),
        }
        : {
          ...payload,
          ...(localBillPrint ? { skipAutoPrintKinds: ['BILL'] } : {}),
        };
      const { data } = await api.post(endpoint, requestPayload);
      const settledOrder = normalizeOrder(data.data || paymentOrder);
      // Immediately update local state so table reverts to AVAILABLE
      setFloorOrders((current) => current.map((item) =>
        item.id === settledOrder.id ? { ...item, ...settledOrder } : item
      ));
      showToast(payload?.paymentMethod === 'CREDIT' ? 'Order completed as credit' : 'Order settled successfully');
      setPaymentOrder(null);
      setEditingOrder(null); // Only hide the edit panel after payment success!
      publishAccountingRefresh(payload?.paymentMethod === 'CREDIT' ? 'order-credit-completed' : 'order-settled', settledOrder);
      if (localPrintWillHandleKind('bill')) {
        await handlePrintOrder(settledOrder, 'bill');
      }
      refreshSalesState();
      if (activeView === 'billing') {
        setSelectedTable(null);
        setPendingOrderType(null);
        if (!config?.tableManagementEnabled) {
          setActiveView('history');
          fetchHistoryOrders(0);
        } else {
          setActiveView('order_type');
        }
      }
    } catch (e) {
      console.error('Failed to settle order', e);
      showToast('Failed to settle order', 'error');
    } finally {
      setActionBusy('');
    }
  };

  const handleCancelOrder = async (order) => {
    if (!order || order?.offline) {
      showToast('Offline queued orders can be cancelled after sync review.', 'error');
      return;
    }

    if (!window.confirm('Cancel this order and release the table?')) return;

    setActionBusy('cancel');
    try {
      const { data } = await api.post(`/api/v1/orders/${order.id}/cancel`, { reason: 'Cancelled from POS table popup' });
      const cancelledOrder = data.data || { ...order, orderStatus: 'CANCELLED', order_status: 'CANCELLED' };
      // Immediately mark cancelled so table reverts to AVAILABLE
      setFloorOrders((current) => current.map((item) =>
        item.id === order.id ? { ...item, ...cancelledOrder, orderStatus: 'CANCELLED', order_status: 'CANCELLED' } : item
      ));
      showToast('Order cancelled');
      setPopoverTable(null);
      publishAccountingRefresh('order-cancelled', cancelledOrder);
      refreshSalesState();
    } catch (e) {
      console.error('Failed to cancel order', e);
      showToast('Failed to cancel order', 'error');
    } finally {
      setActionBusy('');
    }
  };

  const handleCancelHistoryOrder = (order) => {
    if (!order || order?.offline) {
      showToast('Offline queued orders can be cancelled after sync review.', 'error');
      return;
    }
    setCancelOrder(order);
    setCancelReason('');
  };

  const triggerCancelHistoryOrder = async () => {
    if (!cancelOrder) return;
    setActionBusy('cancel-history');
    try {
      const { data } = await api.post(`/api/v1/orders/${cancelOrder.id}/cancel`, {
        reason: cancelReason.trim(),
      });
      showToast('Order cancelled successfully');
      publishAccountingRefresh('order-cancelled', data.data || cancelOrder);
      setCancelOrder(null);
      setCancelReason('');
      fetchHistoryOrders(historyPage.number || 0);
    } catch (e) {
      console.error('Failed to cancel order', e);
      showToast(e.response?.data?.message || 'Failed to cancel order', 'error');
    } finally {
      setActionBusy('');
    }
  };

  const handleMoveOrder = async (targetTableId) => {
    if (!popoverOrder || popoverOrder?.offline) {
      showToast('This order must sync before moving tables.', 'error');
      return;
    }

    const target = tables.find((table) => String(table.id) === String(targetTableId));
    setActionBusy('move');
    try {
      await api.post(`/api/v1/orders/${popoverOrder.id}/move-table`, {
        tableId: targetTableId,
        tableNumber: target?.tableNumber,
      });
      // Immediately update order's table assignment so both tables recolor
      setFloorOrders((current) => current.map((item) =>
        item.id === popoverOrder.id
          ? { ...item, tableId: targetTableId, tableNumber: target?.tableNumber }
          : item
      ));
      showToast(`Order moved to Table ${target?.tableNumber || ''}`.trim());
      setPopoverTable(null);
      refreshSalesState();
    } catch (e) {
      console.error('Failed to move order', e);
      showToast('Failed to move order', 'error');
    } finally {
      setActionBusy('');
    }
  };

  const handleEditOrder = (order) => {
    if (!order || order?.offline) {
      showToast('This order must sync before editing.', 'error');
      return;
    }
    setEditingOrder(order);
    setPopoverTable(null);
  };

  const handleSaveEditedOrder = async (payload) => {
    if (!editingOrder) return;

    // If the order is already completed, redirect to the payment dialog first!
    if (editingOrder.orderStatus === 'COMPLETED' || editingOrder.order_status === 'COMPLETED') {
      const hasOrderEdits = (() => {
        const updatedLines = payload?.lines || [];
        const originalLines = editingOrder?.lines || [];
        if (updatedLines.length !== originalLines.length) return true;
        const sig = (lines) =>
          lines
            .map(l => {
              const pId = l.productId || l.id || '';
              const vId = l.variantId || '';
              const qty = Number(l.quantity || l.qty || 0);
              return `${pId}|${vId}|${qty}`;
            })
            .sort()
            .join(',');
        if (sig(updatedLines) !== sig(originalLines)) return true;

        const originalCustomerId = editingOrder?.customerId || editingOrder?.customer_id || null;
        const updatedCustomerId = payload?.customerId || null;
        if (originalCustomerId !== updatedCustomerId) return true;

        const originalTableId = editingOrder?.tableId || editingOrder?.table_id || null;
        const updatedTableId = payload?.tableId || null;
        if (originalTableId !== updatedTableId) return true;

        return false;
      })();

      setPaymentOrder({
        ...editingOrder,
        lines: payload.lines,
        totalAmount: payload.totalAmount,
        totalTaxAmount: payload.totalTaxAmount,
        totalDiscountAmount: payload.totalDiscountAmount,
        grandTotal: payload.grandTotal,
        roundOffAmount: payload.roundOffAmount,
        grossAmount: payload.grossAmount,
        orderDiscountType: payload.orderDiscountType,
        orderDiscountValue: payload.orderDiscountValue,
        isCompletedEdit: hasOrderEdits, // Only force PUT if the order details actually changed!
      });
      return;
    }

    setEditSaving(true);
    try {
      const localKotPrint = localPrintWillHandleKind('kot');
      const payloadWithSkip = {
        ...payload,
        skipAutoPrintKinds: [
          ...(payload.skipAutoPrintKinds || []),
          ...(localKotPrint ? ['KOT'] : [])
        ]
      };

      const { data } = await api.patch(`/api/v1/orders/${editingOrder.id}`, payloadWithSkip);
      const savedOrder = normalizeOrder(data.data || payload);

      if (localKotPrint && savedOrder) {
        const { addedLines, removedLines } = calculateKotDeltaJs(editingOrder, savedOrder);
        if (addedLines.length > 0 || removedLines.length > 0) {
          setPrintOrder({
            ...savedOrder,
            lines: addedLines,
            removed_items: removedLines,
            removedItems: removedLines,
            is_edited: true,
            isEdited: true,
            _manualPrint: true,
          });
          setPrintKind('kot');
        }
      }

      // Backend voids old order and creates new one with a fresh UUID.
      // Remove OLD order (by original ID), insert new order at front.
      setFloorOrders((current) => [savedOrder, ...current.filter((order) => order.id !== editingOrder.id && order.id !== savedOrder.id)]);
      // Also update historyOrders so the history view reflects the change immediately
      setHistoryOrders((current) => {
        const filtered = current.filter((order) => order.id !== editingOrder.id && order.id !== savedOrder.id);
        // Insert the updated order at the front only if it was originally from history
        const wasInHistory = current.some((order) => order.id === editingOrder.id);
        return wasInHistory ? [savedOrder, ...filtered] : filtered;
      });
      showToast('Order updated');
      setEditingOrder(null);
      if (hasAccountingImpact(savedOrder)) {
        publishAccountingRefresh('order-updated', savedOrder);
      }
      refreshSalesState();
    } catch (e) {
      console.error('Failed to update order', e);
      showToast(e?.response?.data?.message || 'Failed to update order', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  const handleEditTableSettings = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/owner/table-management';
    }
  };

  const isBillingView = !isSalesBranchMissing && activeView === 'billing';
  const billingPageStyle = isBillingView
    ? {
      height: 'calc(100dvh - 60px)',
      minHeight: 0,
      overflow: 'hidden',
      padding: 0,
      width: '100%',
    }
    : undefined;

  if (!isMounted) {
    return (
      <DashboardLayout title="Sales">
        <PageContainer style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #f1f5f9',
            borderTop: '4px solid #f97316',
            borderRadius: '50%',
            animation: 'spin-loader 0.8s linear infinite'
          }} />
          <style>{`
            @keyframes spin-loader {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </PageContainer>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Sales"
      hideTitle={!isSalesBranchMissing && (activeView === 'order_type' || activeView === 'billing')}
      noPadding={!isSalesBranchMissing && (activeView === 'order_type' || activeView === 'billing')}
    >
      <PageContainer style={billingPageStyle}>
        {isSalesBranchMissing && (
          <EmptyState style={{ margin: '24px', padding: '24px' }}>
            <FaExclamationCircle />
            <strong>Select a branch before using Sales POS</strong>
            <span>Sales orders need an active branch. Choose a branch from the header before taking orders.</span>
            {canSelectBranchInSales && branches.length > 0 && (
              <div style={{ width: 'min(100%, 360px)', marginTop: '10px' }}>
                <NiceSelect
                  options={branches.map(b => ({ value: b.id, label: b.name }))}
                  value=""
                  onChange={handleOrgChange}
                />
              </div>
            )}
          </EmptyState>
        )}

        {!isSalesBranchMissing && activeView === 'history' && (
          <OrderHistory
            orders={historyDisplayOrders}
            page={historyPage}
            filters={historyFilters}
            loading={ordersLoading}
            timezone={timezone}
            historySummary={historySummary}
            sym={sym}
            onRefresh={() => fetchHistoryOrders(historyPage.number || 0)}
            onPageChange={(page) => fetchHistoryOrders(page)}
            onFilterChange={(nextFilters) => {
              historyFiltersTouchedRef.current = true;
              setHistoryFilters(nextFilters);
              if (nextFilters.q === historyFilters.q) {
                fetchHistoryOrders(0, nextFilters);
              }
            }}
            onApplyFilters={() => fetchHistoryOrders(0)}
            onPrint={handlePrintOrder}
            onSettle={handleSettleOrder}
            onEdit={handleEditOrder}
            onCancel={handleCancelHistoryOrder}
            canCancelOrder={canCancelOrder}
            creditEnabled={Boolean(config?.creditEnabled)}
            onNewOrder={handleNewOrder}
            orgId={orgId}
            userRole={userRole}
            branches={branches}
            terminals={terminals}
            onOrgChange={handleOrgChange}
            isTableConfigOn={Boolean(config?.tableManagementEnabled)}
            isCustomerConfigOn={Boolean(config?.customersEnabled)}
            onViewDocument={async (order) => {
              try {
                const fullOrder = await loadFullOrder(order.id);
                setViewingDoc({ order: fullOrder || order, type: 'order' });
              } catch (err) {
                setViewingDoc({ order, type: 'order' });
              }
            }}
          />
        )}

        {!isSalesBranchMissing && activeView === 'order_type' && (
          <OrderTypeSelectorModal
            tables={tables}
            config={config}
            onSelect={handleOrderTypeSelected}
            onHistoryClick={() => {
              router.push('/owner/orders?tab=completed');
            }}
            onPoHistoryClick={() => {
              router.push('/owner/purchase-orders?view=history');
            }}
            onClose={() => {
              setActiveView('history');
            }}
          />
        )}

        {!isSalesBranchMissing && activeView === 'billing' && selectedTable && (
          <CounterSale
            initialTable={selectedTable}
            interfaceMode={billingUi}
            onOrderCreated={handleOrderCreated}
            onCreditCustomerCreated={handleCreditCustomerCreated}
            config={config}
            initialCreditCustomers={creditCustomers}
            onBack={() => {
              if (!isKnownOffline()) {
                requestLiveRefresh({ forceTableAndConfigFetch: true });
              }
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

        {!isSalesBranchMissing && activeView === 'billing' && !selectedTable && (
          <EmptyState style={{ margin: '24px' }}>
            <FaExclamationCircle />
            <strong>Preparing sales screen</strong>
            <span>Refreshing the selected branch and order mode.</span>
            <ActionButton
              type="button"
              $tone="blue"
              onClick={() => {
                if (config?.tableManagementEnabled === false) {
                  setPendingOrderType('DINE_IN');
                  setSelectedTable({ tableNumber: 'COUNTER', id: null, orderType: 'DINE_IN' });
                  setActiveView('billing');
                } else {
                  setPendingOrderType(null);
                  setActiveView('order_type');
                }
              }}
            >
              <FaCheck /> Continue
            </ActionButton>
          </EmptyState>
        )}

        {popoverTable && (
          <TablePopover
            table={popoverTable}
            order={popoverOrder}
            availableTables={availableMoveTables}
            canStartOrder={popoverTableState.canStartOrder}
            blockedMessage={popoverTableState.blockedMessage}
            busy={Boolean(actionBusy)}
            creditEnabled={Boolean(config?.creditEnabled)}
            onClose={() => setPopoverTable(null)}
            onStartOrder={handleOpenTableOrder}
            onBill={handleBillOrder}
            onKot={handleKotOrder}
            onEdit={handleEditOrder}
            onCancel={handleCancelOrder}
            canCancelOrder={canCancelOrder}
            onPay={handleSettleOrder}
            onMove={handleMoveOrder}
            onEditTable={handleEditTableSettings}
          />
        )}

        <Suspense fallback={null}>
          {paymentOrder && (
            <PaymentDialog
              order={paymentOrder}
              loading={actionBusy === 'settle'}
              config={config}
              creditCustomers={creditCustomers}
              onClose={() => setPaymentOrder(null)}
              onConfirm={handleConfirmPayment}
              onCreditCustomerCreated={handleCreditCustomerCreated}
              themeColor="green"
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

          {viewingDoc && (
            <DocumentViewerPopup
              order={viewingDoc.order}
              docType={viewingDoc.type}
              vendors={[]}
              warehouses={[]}
              timezone={timezone}
              currencySymbol={sym}
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
                requestLiveRefresh({ forceTableAndConfigFetch: false });
                fetchHistoryOrders(historyPage?.number || 0);
              }}
            />
          )}
        </Suspense>

        {cancelOrder && (
          <ModalOverlay onClick={() => setCancelOrder(null)}>
            <ModalContent onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: 0 }}>Cancel Order</h3>
              <p>Are you sure you want to cancel this order? This action will void any pending invoices and return ingredients to stock.</p>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Enter reason for cancellation..."
                rows={3}
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <ActionBtn $variant="secondary" onClick={() => setCancelOrder(null)}>
                  Discard
                </ActionBtn>
                <ActionBtn
                  $variant="danger"
                  onClick={triggerCancelHistoryOrder}
                  disabled={!cancelReason.trim() || actionBusy === 'cancel-history'}
                >
                  Confirm Cancel
                </ActionBtn>
              </div>
            </ModalContent>
          </ModalOverlay>
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

function OrderHistory({
  orders,
  page,
  filters,
  loading,
  timezone,
  historySummary = null,
  sym = '₹',
  onRefresh,
  onPageChange,
  onFilterChange,
  onApplyFilters,
  onPrint,
  onSettle,
  onEdit,
  onCancel,
  canCancelOrder = true,
  creditEnabled = false,
  onNewOrder,
  orgId,
  userRole,
  branches = [],
  terminals = [],
  onOrgChange,
  isTableConfigOn = false,
  isCustomerConfigOn = false,
  onViewDocument,
}) {
  const pageNumber = page?.number || 0;
  const totalPages = page?.totalPages || 0;
  const totalElements = page?.totalElements ?? orders.length;

  const statusBadgeColors = (tone) => {
    switch (tone) {
      case 'orange':
        return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
      case 'blue':
        return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
      case 'green':
        return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
      case 'red':
        return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
      default:
        return { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' };
    }
  };

  return (
    <HistoryShell>
      <TopHeaderBar>
        <div style={{ flex: '1', maxWidth: '400px' }}>
          <TopSearchInput>
            <FaSearch />
            <input
              type="search"
              value={filters.q || ''}
              placeholder="Search order, invoice, payment, customer, table..."
              onChange={(event) => onFilterChange({ ...filters, q: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onApplyFilters();
                }
              }}
            />
          </TopSearchInput>
        </div>
        {onNewOrder && (
          <TopNewOrderBtn onClick={onNewOrder}>
            + New Order
          </TopNewOrderBtn>
        )}
      </TopHeaderBar>

      {(() => {
        const pendingOffline = orders.filter(o => o.offline);
        if (pendingOffline.length === 0) return null;
        const total = pendingOffline.reduce((sum, o) => sum + (o.grandTotal || o.grand_total || 0), 0);
        return (
          <div style={{
            background: '#fff7ed',
            border: '1px solid #ffedd5',
            borderRadius: '8px',
            padding: '12px 16px',
            margin: '0 24px 16px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '13px',
            color: '#c2410c'
          }}>
            <div>
              <strong>{pendingOffline.length} Pending Offline {pendingOffline.length === 1 ? 'Order' : 'Orders'}</strong> detected. Will sync automatically when online.
            </div>
            <div style={{ fontWeight: '700' }}>
              Provisional Total: {money(total, sym)}
            </div>
          </div>
        );
      })()}

      <HistoryToolbar>
        <FilterWrapper>
          {/* Dates container */}
          <div className="hist-dates">
            <PremiumDateTimePicker
              value={filters.from}
              onChange={(val) => onFilterChange({ ...filters, from: val })}
            />
            <span className="h-filter-sep">to</span>
            <PremiumDateTimePicker
              value={filters.to}
              onChange={(val) => onFilterChange({ ...filters, to: val })}
            />
          </div>

          {/* Org Selector */}
          {isSuperAdminRole(userRole) && branches.length > 0 && (
            <NiceSelect
              className="nice-select"
              options={[
                { value: '', label: 'All Branches' },
                ...branches.map(b => ({ value: b.id, label: b.name }))
              ]}
              value={orgId || ''}
              onChange={onOrgChange}
            />
          )}

          {/* Status Selector */}
          <NiceSelect
            className="nice-select"
            options={[
              { value: '', label: 'All Status' },
              { value: 'DRAFT', label: 'Draft' },
              { value: 'BILLED', label: 'Billed' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'PAID', label: 'Paid' },
              { value: 'CANCELLED', label: 'Cancelled' }
            ]}
            value={filters.status || ''}
            onChange={(val) => onFilterChange({ ...filters, status: val })}
          />

          {/* Terminal Selector */}
          <NiceSelect
            className="nice-select"
            options={[
              { value: '', label: 'All Terminals' },
              ...terminals.map(t => ({ value: t.id, label: t.name || t.terminalCode || 'Terminal' }))
            ]}
            value={filters.terminalId || ''}
            onChange={(val) => onFilterChange({ ...filters, terminalId: val })}
          />
        </FilterWrapper>
      </HistoryToolbar>


      {orders.length === 0 ? (
        <EmptyState>
          <FaReceipt />
          <strong>{filters.q?.trim() ? 'No matching orders' : 'No orders yet'}</strong>
          <span>{filters.q?.trim() ? 'Try another search or widen the date range.' : 'New KOT and settled sales will appear here immediately.'}</span>
        </EmptyState>
      ) : (
        <HistTableWrap>
          <HistTable>
            <thead>
              <tr>
                <th>Order#</th>
                <th>Date</th>
                {isCustomerConfigOn && <th>Customer</th>}
                <th>Type</th>
                {isTableConfigOn && <th>Table</th>}
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => {
                const date = orderTime(order);
                const items = toDisplayItems(order);
                const renderKey = orderIdentity(order) || `order:${date.getTime()}:${order.orderNo || order.order_no || ''}`;
                const tone = orderStatusTone(order);
                const colors = statusBadgeColors(tone);

                return (
                  <HistRow key={renderKey}>
                    <td>
                      <OrderNoLink onClick={() => onViewDocument ? onViewDocument(order) : null}>
                        {order.orderNo || order.order_no || `#${String(order.id).slice(0, 8)}`}
                      </OrderNoLink>
                    </td>
                    <td>
                      <RowDate>
                        <RdD>
                          {formatTzDate(date, timezone, { format: 'date', year: undefined })}
                        </RdD>
                        <RdT>
                          {formatTzDate(date, timezone, { format: 'time' })}
                        </RdT>
                      </RowDate>
                    </td>
                    {isCustomerConfigOn && (
                      <td>
                        <strong>{customerLabel(order)}</strong>
                      </td>
                    )}
                    <td>
                      <span style={{ fontWeight: 600, color: '#475569' }}>{fulfillmentLabel(order)}</span>
                    </td>
                    {isTableConfigOn && (
                      <td>
                        <span style={{ fontWeight: 600, color: '#64748b' }}>
                          {order.tableNumber || order.table_number || '—'}
                        </span>
                      </td>
                    )}
                    <td>
                      <ItemsPill>
                        {(items || []).length}
                      </ItemsPill>
                    </td>
                    <td>
                      <strong>{money(orderTotal(order), sym)}</strong>
                    </td>
                    <td>
                      <StatusBadge style={{
                        background: colors.bg,
                        color: colors.color,
                        borderColor: colors.border
                      }}>
                        {statusText(order)}
                      </StatusBadge>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <ActionGroup style={{ justifyContent: 'center' }}>
                        <ActionButton type="button" onClick={() => onPrint(order, 'bill')} title="Print Bill">
                          <FaPrint style={{ color: '#f97316', fontSize: 11 }} /> Print Bill
                        </ActionButton>
                        <ActionButton type="button" onClick={() => onEdit ? onEdit(order) : null} title="Edit Order">
                          <FaEdit style={{ color: '#475569', fontSize: 11 }} /> Edit
                        </ActionButton>
                        {canCancelOrder &&
                         String(order?.orderStatus || order?.order_status || '').toUpperCase() !== 'CANCELLED' &&
                         String(order?.orderStatus || order?.order_status || '').toUpperCase() !== 'VOID' && (
                          <ActionButton 
                            type="button" 
                            onClick={() => onCancel ? onCancel(order) : null} 
                            title="Cancel Order" 
                            style={{ color: '#ef4444' }}
                          >
                            <FaTimesCircle style={{ color: '#ef4444', fontSize: 11 }} /> Cancel
                          </ActionButton>
                        )}
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
          disabled={loading || pageNumber <= 0}
          onClick={() => onPageChange(Math.max(0, pageNumber - 1))}
        >
          Previous
        </HistoryActionButton>
        <span>Page {totalPages ? pageNumber + 1 : 0} of {totalPages}</span>
        <HistoryActionButton
          type="button"
          disabled={loading || !totalPages || pageNumber >= totalPages - 1}
          onClick={() => onPageChange(pageNumber + 1)}
        >
          Next
        </HistoryActionButton>
      </HistoryPager>

      <style jsx>{`
        .spin { animation: spin 0.9s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </HistoryShell>
  );
}
