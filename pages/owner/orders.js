// pages/owner/orders.js

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import styled, { keyframes } from 'styled-components';
import Cookies from 'js-cookie';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { getQueuedOfflineOrders } from '../../utils/offlineStore';
import { isKnownOffline } from '../../utils/networkState';
import DashboardLayout from '../../components/DashboardLayout';
import { PageContainer } from '../../components/PremiumPOSUI';
import {
  OrdersWrap,
  OrdersHeader,
  SegmentedWrapper,
  SegmentBtn,
  SliderViewport,
  SliderTrack,
  LeftArrow,
  RightArrow,
  TableCubePanel,
  TableCubeLegend,
  TableCubeGrid,
  TableOrderCube,
  ErrorCard,
  EmptyState,
  HistoryShell,
  HistoryToolbar,
  HistFilterWrap,
  HistSearchBox,
  HistTableWrap,
  HistTable,
  HistRow,
  HistOrderLink,
  HistRowDate,
  HistItemsPill,
  HistStatusBadge,
  HistActionGroup,
  HistActionBtn,
  HistPager,
  HistPagerBtn,
  AlertToggleBtn,
  OrdersGrid,
  TokenGrid,
  TokenCube,
  KotCard,
  CardHeader,
  TicketDivider,
  CustomerBar,
  CardBody,
  CardFooter,
  ActionBtn,
  ModalOverlay,
  ModalContent,
  DeliveryDetailsCard,
  OrderDetailsModal,
  HeaderModeSwitch,
  ModeToggleBtn,
  CardGrid,
  OrderCard,
  BoardCardHeader,
  CardOrderId,
  CardTime,
  CardFulfillmentBadge,
  CardTableLabel,
  CardItemsList,
  CardItemRow,
  CardDivider,
  BoardCardFooter,
  CardTotal,
  CardStatusBadge,
  CardActions,
  CardActionGrid,
  CardActionBtn
} from '../../components/PremiumOrdersUI';
import { useNotification } from '../../context/NotificationContext';
import {
  FaReceipt, FaPrint, FaCheck, FaExclamationCircle,
  FaSearch, FaEdit, FaTimes, FaFire, FaHistory, FaCheckCircle, FaChevronRight, FaTimesCircle,
  FaUtensils, FaShoppingBag, FaTruck, FaArrowLeft, FaArrowRight, FaClock,
  FaUser, FaPhoneAlt, FaMapMarkerAlt, FaEnvelope, FaStickyNote,
  FaVolumeUp, FaVolumeMute, FaBell, FaBellSlash,
  FaWhatsapp, FaCopy, FaExchangeAlt, FaFileInvoice
} from 'react-icons/fa';
import { downloadInvoicePdf } from '../../utils/invoicePdf';
import PaymentDialog from '../../components/PaymentDialog';
import KotPrint from '../../components/KotPrint';
import EditOrderPanel from '../../components/EditOrderPanel';
import {
  isAndroidPrintStationEnabled,
  markCloudPrintJobPrinted,
  isPrintStationEnabled,
  autoPrintNewRemoteOrders,
  getRestaurantProfile,
  enqueueCloudPrintJob
} from '../../utils/cloudPrintStation';
import { isNativePrintServicePaired } from '../../utils/printServiceClient';
import { toDisplayItems } from '../../utils/printUtils';
import DocumentViewerPopup from '../../components/purchasing/DocumentViewerPopup';
import { formatTzDate, getBusinessNow, businessTimeToUtc } from '../../utils/timezoneUtils';
import NiceSelect from '../../components/NiceSelect';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import { getFCMToken } from '../../lib/firebase/messaging';
import { stopDeliveryAlarm } from '../../utils/audio';
import {
  getStoredPushToken,
  clearStoredPushToken,
  detectPushPlatform,
  setPushAlertsDisabled,
  arePushAlertsDisabled
} from '../../lib/push/tokenStore';

const slideIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

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

const TABLE_STATUS_CUBE = {
  DRAFT: { bg: '#ef4444', label: 'New' },
  CONFIRMED: { bg: '#ef4444', label: 'New' },
  IN_PROGRESS: { bg: '#f97316', label: 'Cooking' },
  READY: { bg: '#3b82f6', label: 'Ready' },
  BILLED: { bg: '#10b981', label: 'Billed' },
  COMPLETED: { bg: '#22c55e', label: 'Paid' },
  CANCELLED: { bg: '#94a3b8', label: 'Cancelled' },
};

const TABLE_CUBE_LEGEND = [
  { bg: '#ef4444', label: 'New / Occupied' },
  { bg: '#10b981', label: 'Billed' },
];

function tableCubeColor(status) {
  return TABLE_STATUS_CUBE[String(status || 'CONFIRMED').toUpperCase()] || TABLE_STATUS_CUBE.CONFIRMED;
}

// ─── Sales History Helpers ───────────────────────────────────────────────────

const money = (value, symbol = '\u20b9') => `${symbol}${Number(value || 0).toFixed(2)}`;

function histOrderTotal(order) {
  return Number(order?.grandTotal ?? order?.grand_total ?? order?.totalAmount ?? order?.total_amount ?? 0);
}

function histOrderIdentity(order) {
  if (!order) return '';
  if (order.id) return `id:${order.id}`;
  const no = order.orderNo || order.order_no;
  if (no) return `no:${no}`;
  return '';
}

function histOrderTime(order) {
  const raw = order?.orderDate || order?.order_date || order?.createdAt || order?.created_at;
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function histStatusTone(order) {
  const status = String(order?.orderStatus || order?.order_status || '').toUpperCase();
  if (status === 'COMPLETED' || status === 'PAID') return 'green';
  if (status === 'CANCELLED') return 'red';
  if (status === 'BILLED') return 'orange';
  if (status === 'DRAFT' || status === 'IN_PROGRESS' || status === 'READY') return 'blue';
  return 'default';
}

function histStatusText(order) {
  return String(order?.orderStatus || order?.order_status || 'DRAFT').replace(/_/g, ' ');
}

function histFulfillmentLabel(order) {
  if (order?.tableNumber || order?.table_number) return `Dine in (Table ${order.tableNumber || order.table_number})`;
  const ft = String(order?.fulfillmentType || order?.fulfillment_type || '').toUpperCase();
  if (ft === 'DELIVERY') return 'Delivery';
  if (ft === 'TAKEAWAY') return 'Takeaway';
  if (ft === 'DINE_IN') return 'Dine in';
  return ft || 'Dine in';
}

function histCustomerLabel(order) {
  const customers = Array.isArray(order?.customers) ? order.customers : [];
  if (customers.length) return customers.map(c => c.name || 'Guest').join(', ');
  return order?.customerName || order?.customerPhone || '\u2014';
}

function toDateTimeInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function orderIdentity(order) {
  if (!order) return '';
  if (order.offlineOperationId) return `op:${order.offlineOperationId}`;
  if (order.id) return `id:${order.id}`;
  const orderNo = order.orderNo || order.order_no;
  if (orderNo) return `no:${orderNo}`;
  return '';
}

function orderTime(order) {
  const raw = order?.orderDate || order?.order_date || order?.createdAt || order?.created_at;
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
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

function defaultHistoryRange(timezone) {
  const tz = timezone || (typeof window !== 'undefined' ? Cookies.get('timezone') : null) || 'Asia/Kolkata';
  const now = getBusinessNow(tz);
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  return { from: toDateTimeInputValue(from), to: toDateTimeInputValue(to), q: '', status: '' };
}

function parseDeliveryDetails(description) {
  if (!description) return null;
  const emailMatch = description.match(/email:(.*?)(?=\s+\w+:|$)/);
  const nameMatch = description.match(/name:(.*?)(?=\s+\w+:|$)/);
  const phoneMatch = description.match(/phone:(.*?)(?=\s+\w+:|$)/);
  const addressMatch = description.match(/address:(.*?)(?=\s+\w+:|$)/);
  const noteMatch = description.match(/note:(.*?)(?=\s+\w+:|$)/);
  
  if (!emailMatch && !nameMatch && !phoneMatch && !addressMatch && !noteMatch) {
    return null;
  }
  
  return {
    email: emailMatch ? emailMatch[1].trim() : '',
    name: nameMatch ? nameMatch[1].trim() : '',
    phone: phoneMatch ? phoneMatch[1].trim() : '',
    address: addressMatch ? addressMatch[1].trim() : '',
    note: noteMatch ? noteMatch[1].trim() : ''
  };
}

function getElapsedTime(createdAt, now) {
  if (!createdAt) return '';
  
  let date;
  if (createdAt instanceof Date) {
    date = createdAt;
  } else {
    let strVal = String(createdAt);
    // Backend LocalDateTime is generated in UTC. Append Z to force UTC parsing if offset is missing.
    if (strVal.length >= 19 && strVal.includes('T') && !strVal.includes('Z') && !strVal.match(/[+-]\d{2}:\d{2}$/)) {
      strVal = strVal + 'Z';
    }
    date = new Date(strVal);
  }
  
  if (isNaN(date.getTime())) return '';
  
  const diff = (now || Date.now()) - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getStatusBorderColor(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'COMPLETED' || s === 'PAID') return '#10b981'; // Green
  if (s === 'CANCELLED' || s === 'VOID') return '#ef4444'; // Red
  if (s === 'BILLED') return '#3b82f6'; // Blue
  return '#f97316'; // Orange (Kitchen, Confirmed, Draft, etc.)
}

export default function OrdersPage() {
  const { notify } = useNotification();
  const router = useRouter();
  const { timezone, orgId, userRole, switchBranch, canCancelOrder, hasModule } = useAuth();
  const sliderRef = useRef(null);
  const historyFiltersTouchedRef = useRef(false);
  const historyAbortControllerRef = useRef(null);
  const liveOrdersAbortRef = useRef(null);
  const fetchTablesAbortRef = useRef(null);
  const pollingTimeoutRef = useRef(null);
  const isLivePollingRef = useRef(false);
  const tableTickCountRef = useRef(0);
  const isPendingRefreshRef = useRef(false);
  const pendingTableFetchRef = useRef(false);
  const pendingBackgroundRef = useRef(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notifEnabled, setNotifEnabled] = useState(false);

  const [notifyKitchen, setNotifyKitchen] = useState(true);
  const [notifyTakeaway, setNotifyTakeaway] = useState(true);
  const [notifyDelivery, setNotifyDelivery] = useState(true);
  const [notifySettled, setNotifySettled] = useState(true);

  const [activeSegment, setActiveSegment] = useState('table');
  const [hasSetDefaultSegment, setHasSetDefaultSegment] = useState(false);
  const kitchenEnabled = hasModule('KOT', orgId);

  useEffect(() => {
    if (orgId && !hasSetDefaultSegment) {
      if (!hasModule('KOT', orgId)) {
        setActiveSegment('completed');
      } else {
        setActiveSegment('table');
      }
      setHasSetDefaultSegment(true);
    }
  }, [orgId, hasSetDefaultSegment, hasModule]);
  const [liveOrders, setLiveOrders] = useState([]);
  const [queuedOrders, setQueuedOrders] = useState([]);
  const loadOfflineOrderState = useCallback(async () => {
    try {
      const queued = await getQueuedOfflineOrders();
      setQueuedOrders(queued || []);
    } catch (error) {
      console.warn('Failed to load offline order state', error?.message || error);
    }
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── History tab state ──
  const [historyOrders, setHistoryOrders] = useState([]);
  const [historyPage, setHistoryPage] = useState({ number: 0, size: 20, totalPages: 0, totalElements: 0 });
  const [historyFilters, setHistoryFilters] = useState(() => defaultHistoryRange());
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySummary, setHistorySummary] = useState(null);
  const [branches, setBranches] = useState([]);
  const [terminals, setTerminals] = useState([]);

  const [paymentOrder, setPaymentOrder] = useState(null);
  const [cancelOrder, setCancelOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [editingOrder, setEditingOrder] = useState(null);
  const [selectedTableOrder, setSelectedTableOrder] = useState(null);
  const [viewingDoc, setViewingDoc] = useState(null);

  // KDS checklist state
  const [checkedItems, setCheckedItems] = useState({});
  const toggleItemCheck = (orderId, itemIndex) => {
    const key = `${orderId}-${itemIndex}`;
    setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const [printOrder, setPrintOrder] = useState(null);
  const [printKind, setPrintKind] = useState('kot');

  const [config, setConfig] = useState(null);
  const sym = config?.currencySymbol || '₹';
  const [creditCustomers, setCreditCustomers] = useState([]);
  const [actionBusy, setActionBusy] = useState(null);

  const [ordersViewMode, setOrdersViewMode] = useState('standard'); // 'standard' | 'board'
  const [inlineChangeTableOrderId, setInlineChangeTableOrderId] = useState(null);
  const [expandedOrders, setExpandedOrders] = useState({});
  const toggleOrderExpand = (orderId) => {
    setExpandedOrders(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cafeqr_orders_view_mode');
      if (saved === 'board' || saved === 'standard') {
        setOrdersViewMode(saved);
      }
    }
  }, []);

  const handleToggleViewMode = (mode) => {
    setOrdersViewMode(mode);
    localStorage.setItem('cafeqr_orders_view_mode', mode);
  };

  const renderKdsCardGrid = (ordersList) => {
    return (
      <CardGrid>
        {ordersList.map(order => {
          const tone = histStatusTone(order);
          const colors = histStatusBadgeColors(tone);
          const items = toDisplayItems(order);
          const orderIdText = order.orderNo || order.order_no || `#${String(order.id).slice(0, 8)}`;
          const statusText = histStatusText(order);
          // Use orderDate (UTC from backend) as primary, fallback to createdAt
          const timeSource = order.orderDate || order.order_date || order.createdAt || order.created_at;
          const elapsed = getElapsedTime(timeSource, currentTime);

          const tableNum = order.tableNumber || order.table_number;
          const fulfillmentUpper = String(order.fulfillmentType || '').toUpperCase();
          const isDineIn = !!tableNum || fulfillmentUpper === 'DINE_IN';

          // Card label: table number for dine-in, fulfillment type for others
          const labelText = tableNum
            ? `Table ${tableNum}`
            : histFulfillmentLabel(order);

          // Only show the fulfillment badge if it adds info beyond the label
          // (i.e. not dine-in with a table — the table label already covers it)
          const showFulfillmentBadge = !tableNum || !isDineIn;

          let BadgeIcon = FaUtensils;
          if (fulfillmentUpper === 'TAKEAWAY' || fulfillmentUpper === 'PARCEL') {
            BadgeIcon = FaShoppingBag;
          } else if (fulfillmentUpper === 'DELIVERY') {
            BadgeIcon = FaTruck;
          }

          const totalVal = histOrderTotal(order);
          const statusBorderColor = getStatusBorderColor(order.orderStatus || order.order_status);

          return (
            <OrderCard
              key={order.id}
              $statusColor={statusBorderColor}
              onClick={() => handleOpenOrderDetails(order)}
            >
              {/* Row 1: Order ID and Elapsed Time */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <CardOrderId onClick={(e) => { e.stopPropagation(); handleOpenOrderDetails(order); }}>
                  {orderIdText}
                </CardOrderId>
                <CardTime>
                  <FaClock size={8.5} /> {elapsed || 'Just now'}
                </CardTime>
              </div>

              {/* Row 2: Table / Fulfillment and Bill # */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '2px 0 4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: '#111827', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    {labelText}
                  </span>

                  {/* Inline Change Table Trigger Icon */}
                  {order.tableNumber && !['BILLED', 'COMPLETED', 'CANCELLED', 'VOID', 'PAID'].includes(String(order.orderStatus || order.order_status).toUpperCase()) && inlineChangeTableOrderId !== order.id && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setInlineChangeTableOrderId(order.id);
                        setChangeTableTarget('');
                      }}
                      style={{
                        color: '#ea580c',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '18px',
                        height: '18px',
                        borderRadius: '4px',
                        background: '#fff7ed',
                        border: '1px solid #ffedd5',
                        transition: 'all 0.12s'
                      }}
                      title="Change Table"
                    >
                      <FaExchangeAlt size={8.5} />
                    </span>
                  )}
                </div>

                {/* Right Aligned: Daily Bill No Badge */}
                {order.dailyBillNo && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <span style={{ fontSize: '9px', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bill #</span>
                    <span style={{ background: '#fff7ed', color: '#c2410c', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: '800', border: '1px solid #fed7aa' }}>
                      {order.dailyBillNo}
                    </span>
                  </div>
                )}
              </div>

              {/* Row 3: Customer Info (If enabled) */}
              {config?.customersEnabled && order.customerName && (
                <div style={{ fontSize: '10.5px', fontWeight: '500', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  <span>👤</span>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }}>
                    {order.customerName}
                  </span>
                </div>
              )}

              {/* Inline Change Table Dropdown Section */}
              {order.tableNumber && inlineChangeTableOrderId === order.id && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: '6px',
                    background: '#f9fafb',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    margin: '2px 0 6px 0'
                  }}
                >
                  <span style={{ fontSize: '9px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Move to Table
                  </span>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <NiceSelect
                        value={changeTableTarget}
                        onChange={(val) => setChangeTableTarget(val)}
                        placeholder="-- Select --"
                        options={getAvailableMoveTablesForOrder(order).map(t => ({
                          value: t.id,
                          label: `Table ${t.tableNumber}`,
                        }))}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setInlineChangeTableOrderId(null)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                        background: '#fff',
                        fontSize: '9.5px',
                        fontWeight: '600',
                        color: '#4b5563',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!changeTableTarget || changeTableBusy}
                      onClick={() => handleInlineMoveTable(order, changeTableTarget)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        background: changeTableTarget ? '#f97316' : '#e5e7eb',
                        color: changeTableTarget ? '#fff' : '#9ca3af',
                        fontSize: '9.5px',
                        fontWeight: '600',
                        cursor: changeTableTarget ? 'pointer' : 'not-allowed'
                      }}
                    >
                      {changeTableBusy ? 'Moving...' : 'Move'}
                    </button>
                  </div>
                </div>
              )}

              <CardItemsList>
                {(items || []).map((item, idx) => {
                  const qty = item.quantity || item.qty || 0;
                  const name = item.productName || item.product_name || item.name || '';
                  const variant = item.variantName || item.variant_name || '';
                  return (
                    <CardItemRow key={idx}>
                      <span className="item-name">
                        {name} {variant ? `(${variant})` : ''}
                      </span>
                      <span className="item-qty">x{qty}</span>
                    </CardItemRow>
                  );
                })}
              </CardItemsList>

              <CardDivider />

              <BoardCardFooter>
                <CardTotal>
                  <span className="total-label">Total Amount</span>
                  <span className="total-val">{money(totalVal, sym)}</span>
                </CardTotal>
                <CardStatusBadge style={{ background: colors.bg, color: colors.color, borderColor: colors.border }}>
                  {statusText}
                </CardStatusBadge>
              </BoardCardFooter>

              {String(order?.orderStatus || order?.order_status || '').toUpperCase() !== 'CANCELLED' &&
               String(order?.orderStatus || order?.order_status || '').toUpperCase() !== 'VOID' && (
                <CardActions onClick={(e) => e.stopPropagation()}>
                  {String(order?.orderStatus || order?.order_status || '').toUpperCase() !== 'COMPLETED' &&
                   String(order?.orderStatus || order?.order_status || '').toUpperCase() !== 'PAID' && (
                    <CardActionBtn
                      type="button"
                      $border="#bbf7d0"
                      $bg="#f0fdf4"
                      $fg="#15803d"
                      $hoverBg="#dcfce7"
                      $hoverBorder="#86efac"
                      $hoverFg="#166534"
                      onClick={() => setPaymentOrder(order)}
                      style={{ width: '100%' }}
                    >
                      Complete
                    </CardActionBtn>
                  )}
                  <CardActionGrid>
                    <CardActionBtn
                      type="button"
                      $border="#e5e7eb"
                      $bg="#f9fafb"
                      $fg="#374151"
                      $hoverBg="#f3f4f6"
                      $hoverBorder="#d1d5db"
                      $hoverFg="#111827"
                      onClick={() => handlePrintKot(order)}
                    >
                      KOT
                    </CardActionBtn>
                    <CardActionBtn
                      type="button"
                      $border="#e5e7eb"
                      $bg="#f9fafb"
                      $fg="#374151"
                      $hoverBg="#f3f4f6"
                      $hoverBorder="#d1d5db"
                      $hoverFg="#111827"
                      onClick={() => handlePrintBill(order)}
                    >
                      Bill
                    </CardActionBtn>
                    <CardActionBtn
                      type="button"
                      $border="#e5e7eb"
                      $bg="#f9fafb"
                      $fg="#374151"
                      $hoverBg="#f3f4f6"
                      $hoverBorder="#d1d5db"
                      $hoverFg="#111827"
                      onClick={() => setEditingOrder(order)}
                    >
                      Edit
                    </CardActionBtn>
                    <CardActionBtn
                      type="button"
                      $border="#e5e7eb"
                      $bg="#f9fafb"
                      $fg="#374151"
                      $hoverBg="#f3f4f6"
                      $hoverBorder="#d1d5db"
                      $hoverFg="#111827"
                      onClick={async () => {
                        try {
                          const full = await loadFullOrder(order.id);
                          await downloadInvoicePdf(full || order);
                        } catch (e) {
                          notify('error', 'Failed to load order: ' + e.message);
                        }
                      }}
                    >
                      Invoice
                    </CardActionBtn>
                  </CardActionGrid>
                  {canCancelOrder && (
                    <CardActionBtn
                      type="button"
                      $border="#fecaca"
                      $bg="#fef2f2"
                      $fg="#b91c1c"
                      $hoverBg="#fee2e2"
                      $hoverBorder="#fca5a5"
                      $hoverFg="#991b1b"
                      onClick={() => {
                        setCancelReason('');
                        setCancelOrder(order);
                      }}
                      style={{ width: '100%' }}
                    >
                      Cancel
                    </CardActionBtn>
                  )}
                </CardActions>
              )}
            </OrderCard>
          );
        })}
      </CardGrid>
    );
  };

  // Tables state (for change-table feature)
  const [tables, setTables] = useState([]);
  const [changeTableMode, setChangeTableMode] = useState(false);
  const [changeTableTarget, setChangeTableTarget] = useState('');
  const [changeTableBusy, setChangeTableBusy] = useState(false);

  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSoundEnabled(localStorage.getItem('cafeqr_sound_enabled') !== 'false');
      const notifPref = localStorage.getItem('cafeqr_notifications_enabled');
      const isDisabled = notifPref === 'false' || arePushAlertsDisabled();
      setNotifEnabled(!isDisabled && (notifPref === 'true' || !!getStoredPushToken()));
      setNotifyKitchen(localStorage.getItem('push_notify_kitchen') !== '0');
      setNotifyTakeaway(localStorage.getItem('push_notify_takeaway') !== '0');
      setNotifyDelivery(localStorage.getItem('push_notify_delivery') !== '0');
      setNotifySettled(localStorage.getItem('push_notify_settled') !== '0');
    }
    return () => {
      historyAbortControllerRef.current?.abort();
      liveOrdersAbortRef.current?.abort();
      fetchTablesAbortRef.current?.abort();
      clearTimeout(pollingTimeoutRef.current);
    };
  }, []);

  const toggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    localStorage.setItem('cafeqr_sound_enabled', String(nextVal));
  };

  const updatePushPreferences = async (updates) => {
    const token = getStoredPushToken();
    if (token) {
      try {
        await api.put('/api/v1/push/preferences', {
          deviceToken: token,
          notifyKitchen: updates.kitchen ?? notifyKitchen,
          notifyTakeaway: updates.takeaway ?? notifyTakeaway,
          notifyDelivery: updates.delivery ?? notifyDelivery,
          notifySettled: updates.settled ?? notifySettled,
        });
      } catch (err) {
        console.warn('Failed to sync preferences to backend:', err);
      }
    }
  };

  const toggleKitchenPref = () => {
    const val = !notifyKitchen;
    setNotifyKitchen(val);
    localStorage.setItem('push_notify_kitchen', val ? '1' : '0');
    updatePushPreferences({ kitchen: val });
  };

  const toggleTakeawayPref = () => {
    const val = !notifyTakeaway;
    setNotifyTakeaway(val);
    localStorage.setItem('push_notify_takeaway', val ? '1' : '0');
    updatePushPreferences({ takeaway: val });
  };

  const toggleDeliveryPref = () => {
    const val = !notifyDelivery;
    setNotifyDelivery(val);
    localStorage.setItem('push_notify_delivery', val ? '1' : '0');
    updatePushPreferences({ delivery: val });
  };

  const toggleSettledPref = () => {
    const val = !notifySettled;
    setNotifySettled(val);
    localStorage.setItem('push_notify_settled', val ? '1' : '0');
    updatePushPreferences({ settled: val });
  };

  const toggleNotif = async () => {
    if (!notifEnabled) {
      try {
        const token = await getFCMToken({ requestPermission: true });
        if (token) {
          setNotifEnabled(true);
          localStorage.setItem('cafeqr_notifications_enabled', 'true');
          setPushAlertsDisabled(false);
          
          await api.post('/api/v1/push/subscribe', {
            deviceToken: token,
            platform: detectPushPlatform(),
            notifyKitchen,
            notifyTakeaway,
            notifyDelivery,
            notifySettled
          });
          notify('success', 'Push notifications enabled successfully!');
        } else {
          notify('warning', 'Failed to register notifications or permission denied.');
        }
      } catch (err) {
        console.error('Failed to enable push notifications:', err);
        notify('error', 'Error enabling notifications: ' + (err?.message || err));
      }
    } else {
      try {
        let token = getStoredPushToken();
        if (!token) {
          token = await getFCMToken({ requestPermission: false }).catch(() => null);
        }
        if (token) {
          await api.post('/api/v1/push/unsubscribe', { deviceToken: token });
        }
        setNotifEnabled(false);
        localStorage.setItem('cafeqr_notifications_enabled', 'false');
        setPushAlertsDisabled(true);
        notify('info', 'Push notifications disabled.');
      } catch (err) {
        console.error('Failed to disable push:', err);
        setNotifEnabled(false);
        localStorage.setItem('cafeqr_notifications_enabled', 'false');
        setPushAlertsDisabled(true);
        notify('info', 'Push notifications disabled.');
      }
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const loadOrders = useCallback(async ({ background = false } = {}) => {
    if (liveOrdersAbortRef.current) liveOrdersAbortRef.current.abort();
    const controller = new AbortController();
    liveOrdersAbortRef.current = controller;

    if (!background) { setLoading(true); setError(''); }
    try {
      const liveRes = await api.get('/api/v1/orders/sales/live', { signal: controller.signal });
      if (liveOrdersAbortRef.current === controller && isMountedRef.current) {
        setLiveOrders(liveRes.data?.data || []);
      }
    } catch (e) {
      if (e?.name === 'CanceledError') return;
      console.error('Failed to load orders', e);
      if (liveOrdersAbortRef.current === controller && isMountedRef.current && !background) {
        setError('Failed to fetch orders: ' + (e.response?.data?.message || e.message));
      }
    } finally {
      if (liveOrdersAbortRef.current === controller) {
        liveOrdersAbortRef.current = null;
        if (!background && isMountedRef.current) setLoading(false);
      }
      if (isMountedRef.current) {
        await loadOfflineOrderState();
      }
    }
  }, [loadOfflineOrderState]);

  const fetchTables = useCallback(async () => {
    if (fetchTablesAbortRef.current) fetchTablesAbortRef.current.abort();
    const controller = new AbortController();
    fetchTablesAbortRef.current = controller;
    try {
      const res = await api.get('/api/v1/tables/active', { signal: controller.signal });
      if (fetchTablesAbortRef.current === controller && isMountedRef.current) {
        setTables(res.data?.data || []);
      }
    } catch (e) {
      if (e?.name === 'CanceledError') return;
      console.error('Failed to fetch tables', e);
    } finally {
      if (fetchTablesAbortRef.current === controller) {
        fetchTablesAbortRef.current = null;
      }
    }
  }, []);

  const fetchHistoryOrders = useCallback(async (page = 0, filters = historyFilters) => {
    if (historyAbortControllerRef.current) {
      historyAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    historyAbortControllerRef.current = controller;

    setHistoryLoading(true);
    try {
      const activeTz = timezone || Cookies.get('timezone') || 'Asia/Kolkata';
      
      const rawQ = filters.q?.trim() || '';
      const cleanQ = rawQ.replace(/^[#\s]+/, '');
      const queryToSend = cleanQ || rawQ;

      const fromUtc = (filters.from && !queryToSend) ? businessTimeToUtc(filters.from, activeTz) : undefined;
      const toUtc = (filters.to && !queryToSend) ? businessTimeToUtc(filters.to, activeTz) : undefined;

      const response = await api.post('/api/v2/sales/dashboard', {
        from: fromUtc,
        to: toUtc,
        q: queryToSend || undefined,
        status: filters.status ? filters.status : (queryToSend ? undefined : 'COMPLETED_CANCELLED'),
        orgId: filters.branchId || undefined,
        terminalId: filters.terminalId || undefined,
        page,
        size: 20
      }, {
        signal: controller.signal
      });

      const { summary, orders } = response.data?.data || {};

      if (historyAbortControllerRef.current === controller && isMountedRef.current) {
        if (orders) {
          setHistoryOrders(orders.content || []);
          setHistoryPage({
            number: orders.page ?? 0,
            size: orders.size ?? 20,
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
        console.error('Failed to fetch order history dashboard', e);
        if (historyAbortControllerRef.current === controller && isMountedRef.current) {
          setHistoryOrders([]);
          setHistoryPage({ number: 0, size: 20, totalPages: 0, totalElements: 0 });
          setHistorySummary(null);
        }
      }
    } finally {
      if (historyAbortControllerRef.current === controller) {
        historyAbortControllerRef.current = null;
        if (isMountedRef.current) {
          setHistoryLoading(false);
        }
      }
    }
  }, [historyFilters, timezone]);

  // Handle ?tab=completed query param from navigation
  useEffect(() => {
    if (router.query.tab === 'completed') {
      setActiveSegment('completed');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.tab]);

  // Auto-fetch history when switching to completed tab
  useEffect(() => {
    if (activeSegment === 'completed') {
      fetchHistoryOrders(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSegment]);

  // Debounced search for history
  const debouncedSearchRef = useRef(null);
  const handleSearchChange = useCallback((newQ) => {
    historyFiltersTouchedRef.current = true;
    setHistoryFilters(f => {
      const updated = { ...f, q: newQ };
      if (debouncedSearchRef.current) clearTimeout(debouncedSearchRef.current);
      debouncedSearchRef.current = setTimeout(() => {
        fetchHistoryOrders(0, updated);
      }, 400);
      return updated;
    });
  }, [fetchHistoryOrders]);

  useEffect(() => {
    api.get('/api/v1/configurations')
      .then(res => setConfig(res.data?.data || {}))
      .catch(console.error);
    api.get('/api/v1/credit/customers', { params: { status: 'ACTIVE' } })
      .then(res => setCreditCustomers(res.data?.data || []))
      .catch(console.error);
    if (userRole === 'SUPER_ADMIN') {
      api.get('/api/v1/organizations')
        .then(res => setBranches(res.data?.data || []))
        .catch(console.error);
    }
  }, [userRole]);

  useEffect(() => {
    const url = (userRole === 'SUPER_ADMIN' && orgId && orgId !== '0')
      ? `/api/v1/terminals/org/${orgId}`
      : '/api/v1/terminals';
    api.get(url)
      .then(res => setTerminals(res.data?.data || []))
      .catch(console.error);
  }, [orgId, userRole]);

  useEffect(() => {
    if (config && config.tableManagementEnabled === false && activeSegment === 'table') {
      setActiveSegment('parcel');
    }
  }, [config, activeSegment]);

  const historyQueuedOrders = useMemo(() => {
    return queuedOrders.filter((order) => {
      if (!orgId) return true;
      const bId = order?.orgId || order?.org_id || order?.branchId || order?.branch_id;
      return !bId || String(bId) === String(orgId);
    });
  }, [orgId, queuedOrders]);

  const filteredQueuedOrders = useMemo(() => {
    return historyQueuedOrders.filter(order => {
      if (historyFilters.status) {
        const orderStatus = String(order?.orderStatus || order?.order_status || '').toUpperCase();
        const paymentStatus = String(order?.paymentStatus || order?.payment_status || '').toUpperCase();
        if (historyFilters.status === 'COMPLETED' || historyFilters.status === 'PAID') {
          if (orderStatus !== 'COMPLETED' && orderStatus !== 'PAID' && paymentStatus !== 'PAID') return false;
        } else if (orderStatus !== historyFilters.status) {
          return false;
        }
      }
      if (historyFilters.terminalId) {
        const termId = String(order?.terminalId || order?.terminal_id || '');
        if (termId !== historyFilters.terminalId) return false;
      }
      if (historyFilters.q && historyFilters.q.trim()) {
        const query = historyFilters.q.trim().toLowerCase().replace(/^[#\s]+/, '');
        if (query) {
          const orderNo = String(order?.orderNo || order?.order_no || '').toLowerCase();
          const dailyBillNo = String(order?.dailyBillNo || order?.daily_bill_no || '').toLowerCase();
          const customerName = String(order?.customerName || order?.customer_name || '').toLowerCase();
          const customerPhone = String(order?.customerPhone || order?.customer_phone || '').toLowerCase();
          const invoiceNo = String(order?.invoiceNo || order?.invoice_no || '').toLowerCase();
          const tableNum = String(order?.tableNumber || order?.table_number || '').toLowerCase();
          const matches = orderNo.includes(query) || dailyBillNo.includes(query) || customerName.includes(query) || customerPhone.includes(query) || invoiceNo.includes(query) || tableNum.includes(query);
          if (!matches) return false;
        }
      }
      return true;
    });
  }, [historyQueuedOrders, historyFilters.status, historyFilters.terminalId, historyFilters.q]);

  const filteredHistoryOrders = useMemo(() => {
    if (!historyFilters.q || !historyFilters.q.trim()) {
      return historyOrders;
    }
    const query = historyFilters.q.trim().toLowerCase().replace(/^[#\s]+/, '');
    if (!query) return historyOrders;

    return historyOrders.filter((order) => {
      const orderNo = String(order?.orderNo || order?.order_no || '').toLowerCase();
      const dailyBillNo = String(order?.dailyBillNo || order?.daily_bill_no || '').toLowerCase();
      const customerName = String(order?.customerName || order?.customer_name || '').toLowerCase();
      const customerPhone = String(order?.customerPhone || order?.customer_phone || '').toLowerCase();
      const invoiceNo = String(order?.invoiceNo || order?.invoice_no || '').toLowerCase();
      const tableNum = String(order?.tableNumber || order?.table_number || '').toLowerCase();

      const itemNames = (order?.lines || order?.items || []).map(i => String(i.name || i.productName || i.product_name || '').toLowerCase()).join(' ');

      return (
        orderNo.includes(query) ||
        dailyBillNo.includes(query) ||
        customerName.includes(query) ||
        customerPhone.includes(query) ||
        invoiceNo.includes(query) ||
        tableNum.includes(query) ||
        itemNames.includes(query)
      );
    });
  }, [historyOrders, historyFilters.q]);

  const historyDisplayOrders = useMemo(() => {
    return mergeOrdersWithQueued(filteredHistoryOrders, filteredQueuedOrders);
  }, [filteredHistoryOrders, filteredQueuedOrders]);

  // Refresh coordinator: handles all live-order and active table data fetches.
  // Coalesces overlapping refresh requests using pending refs to prevent timer duplication.
  //
  // Params:
  // - background: true to suppress full-screen loading spinner
  // - forceTableFetch: true to fetch tables immediately (otherwise polled every 4 ticks)
  const requestLiveRefresh = useCallback(async ({ background = true, forceTableFetch = false } = {}) => {
    const TABLE_POLL_EVERY = 4;

    const scheduleNext = () => {
      if (!isMountedRef.current) return;
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          requestLiveRefresh({ background: true });
        }
      }, 12000);
    };

    if (isLivePollingRef.current) {
      isPendingRefreshRef.current = true;
      if (forceTableFetch) {
        pendingTableFetchRef.current = true;
      }
      if (!background) {
        pendingBackgroundRef.current = false;
      }
      return;
    }

    clearTimeout(pollingTimeoutRef.current);

    if (document.hidden || !navigator.onLine) {
      scheduleNext();
      return;
    }

    isLivePollingRef.current = true;
    try {
      await loadOrders({ background });
      tableTickCountRef.current++;
      if (forceTableFetch || tableTickCountRef.current >= TABLE_POLL_EVERY) {
        tableTickCountRef.current = 0;
        await fetchTables();
      }
    } finally {
      isLivePollingRef.current = false;
      
      if (isPendingRefreshRef.current && isMountedRef.current) {
        const nextBg = pendingBackgroundRef.current;
        const nextTableFetch = pendingTableFetchRef.current;
        
        isPendingRefreshRef.current = false;
        pendingTableFetchRef.current = false;
        pendingBackgroundRef.current = true;
        
        requestLiveRefresh({ background: nextBg, forceTableFetch: nextTableFetch });
      } else {
        scheduleNext();
      }
    }
  }, [loadOrders, fetchTables]);

  useEffect(() => {
    // Initial eager load (show spinner on first mount)
    requestLiveRefresh({ background: false, forceTableFetch: true });

    const handleVisibility = () => {
      if (!document.hidden) {
        requestLiveRefresh({ background: true });
        loadOfflineOrderState();
      }
    };
    const handleOnline = () => {
      requestLiveRefresh({ background: true, forceTableFetch: true });
      loadOfflineOrderState();
    };
    const handleOffline = () => {
      clearTimeout(pollingTimeoutRef.current);
    };
    const handleNetworkState = (event) => {
      if (event?.detail?.offline) {
        clearTimeout(pollingTimeoutRef.current);
      } else {
        requestLiveRefresh({ background: true, forceTableFetch: true });
        loadOfflineOrderState();
      }
    };
    const handleQueueChanged = () => {
      loadOfflineOrderState();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('cafeqr-network-state', handleNetworkState);
    window.addEventListener('cafeqr-sync-queue-changed', handleQueueChanged);

    return () => {
      clearTimeout(pollingTimeoutRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('cafeqr-network-state', handleNetworkState);
      window.removeEventListener('cafeqr-sync-queue-changed', handleQueueChanged);
    };
  }, [requestLiveRefresh, loadOfflineOrderState]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleMessage = (event) => {
      if (!event.data) return;

      if (event.data.type === 'order-updated') {
        console.log('[push:web] Order updated message received from service worker:', event.data);
        requestLiveRefresh({ background: true, forceTableFetch: true });
        if (activeSegment === 'completed') {
          fetchHistoryOrders(historyPage.number || 0);
        }
      } else if (event.data.type === 'new-order-push') {
        console.log('[push:web] New order push received from service worker:', event.data);
        requestLiveRefresh({ background: true, forceTableFetch: true });
      } else if (event.data.type === 'stop-order-alarm') {
        const orderId = event.data.orderId;
        if (orderId) {
          stopDeliveryAlarm(orderId);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [requestLiveRefresh, activeSegment, fetchHistoryOrders, historyPage.number]);

  const updateStatus = async (id, nextStatus) => {
    stopDeliveryAlarm(id);
    try {
      setActionBusy(id);
      if (nextStatus === 'BILLED') {
        await api.post(`/api/v1/orders/${id}/bill`);
      } else {
        await api.patch(`/api/v1/orders/${id}/status`, null, {
          params: { status: nextStatus },
        });
      }
      await requestLiveRefresh({ background: true, forceTableFetch: true });
      if (activeSegment === 'completed') {
        fetchHistoryOrders(historyPage.number || 0);
      }
    } catch (e) {
      notify('error', 'Failed to update status: ' + (e.response?.data?.message || e.message));
    } finally {
      setActionBusy(null);
    }
  };

  const triggerCancelOrder = async () => {
    if (!cancelOrder) return;
    stopDeliveryAlarm(cancelOrder.id);
    try {
      setActionBusy(cancelOrder.id);
      await api.post(`/api/v1/orders/${cancelOrder.id}/cancel`, {
        reason: cancelReason,
      });
      setCancelOrder(null);
      setCancelReason('');
      await requestLiveRefresh({ background: true, forceTableFetch: true });
      if (activeSegment === 'completed') {
        fetchHistoryOrders(historyPage.number || 0);
      }
    } catch (e) {
      notify('error', 'Failed to cancel order: ' + (e.response?.data?.message || e.message));
    } finally {
      setActionBusy(null);
    }
  };

  const handleSaveEditedOrder = async (editedPayload) => {
    // If the order is already completed, redirect to the payment dialog first!
    if (editingOrder.orderStatus === 'COMPLETED' || editingOrder.order_status === 'COMPLETED') {
      const hasOrderEdits = (() => {
        const updatedLines = editedPayload?.lines || [];
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
        const updatedCustomerId = editedPayload?.customerId || null;
        if (originalCustomerId !== updatedCustomerId) return true;

        const originalTableId = editingOrder?.tableId || editingOrder?.table_id || null;
        const updatedTableId = editedPayload?.tableId || null;
        if (originalTableId !== updatedTableId) return true;

        return false;
      })();

      setPaymentOrder({
        ...editingOrder,
        lines: editedPayload.lines,
        totalAmount: editedPayload.totalAmount,
        totalTaxAmount: editedPayload.totalTaxAmount,
        totalDiscountAmount: editedPayload.totalDiscountAmount,
        grandTotal: editedPayload.grandTotal,
        roundOffAmount: editedPayload.roundOffAmount,
        grossAmount: editedPayload.grossAmount,
        orderDiscountType: editedPayload.orderDiscountType,
        orderDiscountValue: editedPayload.orderDiscountValue,
        isCompletedEdit: hasOrderEdits, // Only force PUT if the order details actually changed!
      });
      return;
    }

    try {
      setActionBusy(editingOrder.id);
      
      const localKotPrint = localPrintWillHandleKind('kot');
      const payloadWithSkip = {
        ...editedPayload,
        skipAutoPrintKinds: [
          ...(editedPayload.skipAutoPrintKinds || []),
          ...(localKotPrint ? ['KOT'] : [])
        ]
      };

      // Backend voids the old order and creates a new one with a fresh UUID.
      // The response will have the new order's data.
      const res = await api.patch(`/api/v1/orders/${editingOrder.id}`, payloadWithSkip);
      const newOrder = res?.data?.data;

      if (localKotPrint && newOrder) {
        const { addedLines, removedLines } = calculateKotDeltaJs(editingOrder, newOrder);
        if (addedLines.length > 0 || removedLines.length > 0) {
          setPrintOrder({
            ...newOrder,
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

      setEditingOrder(null);
      await requestLiveRefresh({ background: true, forceTableFetch: true });
      await fetchHistoryOrders(historyPage?.number || 0);
      if (newOrder?.id) {
        notify('success', `Order updated (new ID: #${String(newOrder.id).slice(0, 8)})`);
      }
    } catch (e) {
      notify('error', 'Failed to update order: ' + (e.response?.data?.message || e.message));
    } finally {
      setActionBusy(null);
    }
  };

  const handleConfirmPayment = async (settlementPayload) => {
    if (!paymentOrder) return;
    if (actionBusy) return;                        // double-submit guard
    setActionBusy(paymentOrder.id);
    stopDeliveryAlarm(paymentOrder.id);
    try {
      // Determine whether the line items actually changed (product, variant, qty).
      // If ONLY discount/round-off changed we must NOT do the PUT because:
      //   - PUT voids the kitchen order and creates a brand-new order with a fresh UUID
      //   - The /settle endpoint already accepts discountAmount and roundOffAmount and
      //     applies them in-place without voiding the order
      // We only void+recreate when items were added, removed, or qty changed.
      const linesChanged = (() => {
        if (paymentOrder?.isCompletedEdit) return true; // Force PUT for completed order edits
        const updatedLines = settlementPayload?.updatedOrder?.lines;
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
          console.log("DEBUG linesChanged evaluates to TRUE:", debugStr);
          return true;
        }

        return false;
      })();

      let settleId = paymentOrder.id;
      if (settlementPayload?.updatedOrder && linesChanged) {
        // Lines changed → void the old order and create a new one with updated items.
        // The backend returns a NEW UUID; we must use that for the settle call.
        const orderPayload = {
          ...settlementPayload.updatedOrder,
          paymentStatus: 'PENDING', // Force pending so backend doesn't auto-generate old payment during update
        };
        const putRes = await api.patch(`/api/v1/orders/${paymentOrder.id}`, orderPayload);
        const newId = putRes?.data?.data?.id;
        if (newId) settleId = newId;
      }
      // Always settle/complete-credit on the (potentially new) order ID.
      // discountAmount and roundOffAmount in the payload are handled by the settle
      // endpoint directly, so discount-only changes are safe without a prior PUT.
      //
      // Suppress bill printing when settling from the Takeaway/Live orders grid
      // because the bill is usually already printed via the "Bill" button.
      const payloadToSend = {
        ...settlementPayload,
        ...(settlementPayload?.paymentMethod === 'CREDIT' ? { roundOffAmount: 0 } : {}),
        skipAutoPrintKinds: [...(settlementPayload.skipAutoPrintKinds || []), 'bill']
      };

      const url = payloadToSend.paymentMethod === 'CREDIT'
        ? `/api/v1/orders/${settleId}/complete-credit`
        : `/api/v1/orders/${settleId}/settle`;
      await api.post(url, payloadToSend);
      setPaymentOrder(null);
      setEditingOrder(null); // Only hide the edit panel after payment success!
      await requestLiveRefresh({ background: true, forceTableFetch: true });
      if (activeSegment === 'completed') {
        fetchHistoryOrders(historyPage.number || 0);
      }
    } catch (e) {
      notify('error', 'Payment settlement failed: ' + (e.response?.data?.message || e.message));
    } finally {
      setActionBusy(null);
    }
  };


  const handlePrintKot = async (order) => {
    if (!localPrintWillHandleKind('kot')) {
      try {
        await enqueueCloudPrintJob(order, 'kot');
        notify('success', 'KOT print job enqueued to print station');
      } catch (e) {
        notify('error', 'Failed to queue print job: ' + (e.response?.data?.message || e.message));
      }
      return;
    }
    setPrintKind('kot');
    setPrintOrder({ ...order, _manualPrint: true });
    if (order?.id) {
      markCloudPrintJobPrinted(order, 'kot').catch((error) => {
        console.warn('Unable to pre-emptively mark cloud print job printed on KOT print:', error?.message || error);
      });
    }
  };

  const handlePrintBill = async (order) => {
    let activeOrder = order;
    const currentStatus = String(order?.orderStatus || order?.order_status || '').toUpperCase();
    if (order?.id && currentStatus !== 'BILLED' && currentStatus !== 'COMPLETED' && currentStatus !== 'PAID' && currentStatus !== 'CANCELLED' && currentStatus !== 'VOID') {
      try {
        notify('info', 'Generating bill invoice...');
        const response = await api.post(`/api/v1/orders/${order.id}/bill`);
        if (response.data?.data) {
          activeOrder = response.data.data;
        }
        notify('success', 'Order billed successfully');
        await requestLiveRefresh({ background: true, forceTableFetch: true });
        if (activeSegment === 'completed') {
          fetchHistoryOrders(historyPage.number || 0);
        }
      } catch (e) {
        notify('error', 'Failed to bill order: ' + (e.response?.data?.message || e.message));
        return;
      }
    }

    if (!localPrintWillHandleKind('bill')) {
      try {
        await enqueueCloudPrintJob(activeOrder, 'bill');
        notify('success', 'Bill print job enqueued to print station');
      } catch (e) {
        notify('error', 'Failed to queue print job: ' + (e.response?.data?.message || e.message));
      }
      return;
    }
    setPrintKind('bill');
    setPrintOrder({ ...activeOrder, _manualPrint: true });
    if (activeOrder?.id) {
      markCloudPrintJobPrinted(activeOrder, 'bill').catch((error) => {
        console.warn('Unable to pre-emptively mark cloud print job printed on bill print:', error?.message || error);
      });
    }
  };

  const handleLocalPrintDone = useCallback(() => {
    const printedOrder = printOrder;
    const printedKind = printKind;
    setPrintOrder(null);

    if (printedOrder && !printedOrder.offline) {
      markCloudPrintJobPrinted(printedOrder, printedKind)
        .catch((error) => {
          console.warn('Unable to mark cloud print job printed on print done:', error?.message || error);
        });
    }
  }, [printKind, printOrder]);

  const slideLeft = () => {
    sliderRef.current?.scrollBy({ left: -400, behavior: 'smooth' });
  };

  const slideRight = () => {
    sliderRef.current?.scrollBy({ left: 400, behavior: 'smooth' });
  };

  const { tableOrders, parcelOrders, deliveryOrders, activeList } = useMemo(() => {
    const tableOrders = [];
    const parcelOrders = [];
    const deliveryOrders = [];

    const merged = mergeOrdersWithQueued(liveOrders, queuedOrders);

    for (const order of merged) {
      if (order.tableNumber != null || order.fulfillmentType === 'DINE_IN') {
        tableOrders.push(order);
      }
      if (order.fulfillmentType === 'TAKEAWAY' || order.fulfillmentType === 'PARCEL') {
        parcelOrders.push(order);
      }
      if (order.fulfillmentType === 'DELIVERY') {
        deliveryOrders.push(order);
      }
    }

    let activeList = [];
    const byUpdated = (a, b) => {
      const timeA = new Date(a.updatedAt || a.updated_at || a.createdAt || a.created_at);
      const timeB = new Date(b.updatedAt || b.updated_at || b.createdAt || b.created_at);
      return timeB - timeA;
    };
    if (activeSegment === 'table') activeList = [...tableOrders].sort(byUpdated);
    else if (activeSegment === 'parcel') activeList = [...parcelOrders].sort(byUpdated);
    else if (activeSegment === 'delivery') activeList = [...deliveryOrders].sort(byUpdated);

    return { tableOrders, parcelOrders, deliveryOrders, activeList };
  }, [liveOrders, queuedOrders, activeSegment]);

  const histStatusBadgeColors = (tone) => {
    switch (tone) {
      case 'orange': return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
      case 'blue': return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
      case 'green': return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
      case 'red': return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
      default: return { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' };
    }
  };

  const loadFullOrder = async (orderId) => {
    try {
      const { data } = await api.get(`/api/v1/orders/${orderId}`);
      return data.data;
    } catch { return null; }
  };

  const handleOpenOrderDetails = async (order) => {
    if (!order) return;
    try {
      const full = await loadFullOrder(order.id);
      setViewingDoc({ order: full || order, type: 'order' });
    } catch (err) {
      setViewingDoc({ order, type: 'order' });
    }
  };

  const handleOpenTableOrderDetails = async (order) => {
    if (!order) return;
    try {
      const full = await loadFullOrder(order.id);
      setSelectedTableOrder(full || order);
    } catch (err) {
      setSelectedTableOrder(order);
    }
  };

  // Available tables = all active tables minus the current order's table and those already occupied
  const getAvailableMoveTablesForOrder = (order) => {
    if (!tables.length) return [];
    const occupiedTableNums = new Set(
      liveOrders
        .filter(o => o.tableNumber != null && o.id !== order.id)
        .map(o => String(o.tableNumber))
    );
    const currentTableNum = String(order.tableNumber || '');
    return tables.filter(t => {
      const tNum = String(t.tableNumber || '');
      if (tNum && tNum === currentTableNum) return false;
      if (occupiedTableNums.has(tNum)) return false;
      const status = String(t.status || 'AVAILABLE').toUpperCase();
      return status === 'AVAILABLE';
    });
  };

  const handleInlineMoveTable = async (order, targetTableId) => {
    if (!order || !targetTableId) return;
    const target = tables.find(t => String(t.id) === String(targetTableId));
    setChangeTableBusy(true);
    try {
      await api.post(`/api/v1/orders/${order.id}/move-table`, {
        tableId: targetTableId,
        tableNumber: target?.tableNumber,
      });
      notify('success', `Order moved to Table ${target?.tableNumber || targetTableId}`);
      setInlineChangeTableOrderId(null);
      setChangeTableTarget('');
      await requestLiveRefresh({ background: true, forceTableFetch: true });
    } catch (e) {
      notify('error', 'Failed to move table: ' + (e.response?.data?.message || e.message));
    } finally {
      setChangeTableBusy(false);
    }
  };

  // Available tables = all active tables minus the current order's table and those already occupied
  const availableMoveTables = useMemo(() => {
    if (!tables.length) return [];
    const occupiedTableNums = new Set(
      liveOrders
        .filter(o => o.tableNumber != null)
        .map(o => String(o.tableNumber))
    );
    const currentTableNum = selectedTableOrder
      ? String(selectedTableOrder.tableNumber || '')
      : '';
    return tables.filter(t => {
      const tNum = String(t.tableNumber || '');
      if (tNum && tNum === currentTableNum) return false;
      if (occupiedTableNums.has(tNum)) return false;
      const status = String(t.status || 'AVAILABLE').toUpperCase();
      return status === 'AVAILABLE';
    });
  }, [tables, liveOrders, selectedTableOrder]);

  const handleMoveTable = async () => {
    if (!selectedTableOrder || !changeTableTarget) return;
    const target = tables.find(t => String(t.id) === String(changeTableTarget));
    setChangeTableBusy(true);
    try {
      await api.post(`/api/v1/orders/${selectedTableOrder.id}/move-table`, {
        tableId: changeTableTarget,
        tableNumber: target?.tableNumber,
      });
      notify('success', `Order moved to Table ${target?.tableNumber || changeTableTarget}`);
      setChangeTableMode(false);
      setChangeTableTarget('');
      setSelectedTableOrder(null);
      await requestLiveRefresh({ background: true, forceTableFetch: true });
    } catch (e) {
      notify('error', 'Failed to move table: ' + (e.response?.data?.message || e.message));
    } finally {
      setChangeTableBusy(false);
    }
  };

  return (
    <DashboardLayout title="Kitchen Display System">
      <PageContainer>
        <OrdersWrap>
          <OrdersHeader>
            {/* Alert settings controls */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <AlertToggleBtn
                type="button"
                $active={soundEnabled}
                $color="#10b981"
                onClick={toggleSound}
                title={soundEnabled ? "Mute Sound Alerts" : "Unmute Sound Alerts"}
              >
                {soundEnabled ? <FaVolumeUp size={16} /> : <FaVolumeMute size={16} />}
              </AlertToggleBtn>
              <AlertToggleBtn
                type="button"
                $active={notifEnabled}
                $color="#0ea5e9"
                onClick={toggleNotif}
                title={notifEnabled ? "Disable Push Notifications" : "Enable Push Notifications"}
              >
                {notifEnabled ? <FaBell size={16} /> : <FaBellSlash size={16} />}
              </AlertToggleBtn>
              
              {/* Category Toggles */}
              {notifEnabled && (
                <>
                  <AlertToggleBtn
                    type="button"
                    $active={notifyKitchen}
                    $color="#16a34a"
                    onClick={toggleKitchenPref}
                    title={notifyKitchen ? "Disable Kitchen Push Alerts" : "Enable Kitchen Push Alerts"}
                    style={{ fontSize: '11px', padding: '0 6px', fontWeight: 'bold' }}
                  >
                    <span>Kit</span>
                  </AlertToggleBtn>
                  <AlertToggleBtn
                    type="button"
                    $active={notifyTakeaway}
                    $color="#ea580c"
                    onClick={toggleTakeawayPref}
                    title={notifyTakeaway ? "Disable Takeaway Push Alerts" : "Enable Takeaway Push Alerts"}
                    style={{ fontSize: '11px', padding: '0 6px', fontWeight: 'bold' }}
                  >
                    <span>Tak</span>
                  </AlertToggleBtn>
                  <AlertToggleBtn
                    type="button"
                    $active={notifyDelivery}
                    $color="#0284c7"
                    onClick={toggleDeliveryPref}
                    title={notifyDelivery ? "Disable Delivery Push Alerts" : "Enable Delivery Push Alerts"}
                    style={{ fontSize: '11px', padding: '0 6px', fontWeight: 'bold' }}
                  >
                    <span>Del</span>
                  </AlertToggleBtn>
                  <AlertToggleBtn
                    type="button"
                    $active={notifySettled}
                    $color="#8b5cf6"
                    onClick={toggleSettledPref}
                    title={notifySettled ? "Disable Settle Push Alerts" : "Enable Settle Push Alerts"}
                    style={{ fontSize: '11px', padding: '0 6px', fontWeight: 'bold' }}
                  >
                    <span>Set</span>
                  </AlertToggleBtn>
                </>
              )}
            </div>

            <SegmentedWrapper>
              {kitchenEnabled && config?.tableManagementEnabled !== false && (
                <SegmentBtn $active={activeSegment === 'table'} $accent="#16a34a" onClick={() => setActiveSegment('table')}>
                  <FaUtensils /> Table <span className="badge">{tableOrders.length}</span>
                </SegmentBtn>
              )}
              {kitchenEnabled && (
                <SegmentBtn $active={activeSegment === 'parcel'} $accent="#ea580c" onClick={() => setActiveSegment('parcel')}>
                  <FaShoppingBag /> Takeaway <span className="badge">{parcelOrders.length}</span>
                </SegmentBtn>
              )}
              {kitchenEnabled && config?.onlineDeliveryEnabled && (
                <SegmentBtn $active={activeSegment === 'delivery'} $accent="#0284c7" onClick={() => setActiveSegment('delivery')}>
                  <FaTruck /> Delivery <span className="badge">{deliveryOrders.length}</span>
                </SegmentBtn>
              )}
              <SegmentBtn $active={activeSegment === 'completed'} $accent="#475569" onClick={() => setActiveSegment('completed')}>
                <FaHistory /> Completed
              </SegmentBtn>
            </SegmentedWrapper>

            <HeaderModeSwitch>
              <ModeToggleBtn 
                $active={ordersViewMode === 'standard'} 
                onClick={() => handleToggleViewMode('standard')}
                title="Standard View"
              >
                Standard
              </ModeToggleBtn>
              <ModeToggleBtn 
                $active={ordersViewMode === 'board'} 
                onClick={() => handleToggleViewMode('board')}
                title="Board View"
              >
                Board
              </ModeToggleBtn>
            </HeaderModeSwitch>

            <button
              type="button"
              onClick={() => router.push('/owner/sales')}
              style={{
                height: 36, padding: '0 18px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg,#f97316,#ea580c)', color: 'white',
                fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex',
                alignItems: 'center', gap: 6, minWidth: 130, justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(234,88,12,0.25)', whiteSpace: 'nowrap',
              }}
            >
              + New Order
            </button>
          </OrdersHeader>

          {error && <ErrorCard><FaExclamationCircle /> {error}</ErrorCard>}

          {/* ── Live Orders (Table / Parcel / Delivery) ── */}
          {activeSegment !== 'completed' && (
            ordersViewMode === 'board' ? (
              activeList.length === 0 ? (
                <EmptyState>
                  {activeSegment === 'table' && <FaUtensils />}
                  {activeSegment === 'parcel' && <FaShoppingBag />}
                  {activeSegment === 'delivery' && <FaTruck />}
                  <strong>No active {activeSegment === 'table' ? 'Dine-in' : (activeSegment === 'parcel' ? 'takeaway' : 'delivery')} orders</strong>
                  <span>New orders will appear here automatically.</span>
                </EmptyState>
              ) : (
                renderKdsCardGrid(activeList)
              )
            ) : (
              activeSegment === 'table' ? (
                <SliderViewport>
                  {activeList.length > 0 && (
                    <>
                      <LeftArrow onClick={slideLeft} type="button"><FaArrowLeft /></LeftArrow>
                      <RightArrow onClick={slideRight} type="button"><FaArrowRight /></RightArrow>
                    </>
                  )}

                  <SliderTrack ref={sliderRef}>
                    {activeList.length === 0 ? (
                      <EmptyState>
                        <FaUtensils />
                        <strong>No active Dine-in orders</strong>
                        <span>New orders will appear here automatically.</span>
                      </EmptyState>
                    ) : (
                      <TableCubePanel>
                        <TableCubeLegend>
                          {TABLE_CUBE_LEGEND.map(item => (
                            <span className="legend-item" key={item.label}><span className="swatch" style={{ background: item.bg }} />{item.label}</span>
                          ))}
                        </TableCubeLegend>
                        <TableCubeGrid>
                          {activeList.map(order => {
                            const cube = tableCubeColor(order.orderStatus);
                            const tableLabel = order.tableNumber || order.tableName || 'Table';
                            return (
                              <TableOrderCube key={order.id} role="button" tabIndex={0} $bg={cube.bg} $ring={`${cube.bg}55`} $shadow={`${cube.bg}44`} onClick={() => handleOpenTableOrderDetails(order)}>
                                <span className="table-no">{tableLabel}</span>
                              </TableOrderCube>
                            );
                          })}
                        </TableCubeGrid>
                      </TableCubePanel>
                    )}
                  </SliderTrack>
                </SliderViewport>
              ) : (
                activeList.length === 0 ? (
                  <EmptyState>
                    {activeSegment === 'parcel' && <FaShoppingBag />}
                    {activeSegment === 'delivery' && <FaTruck />}
                    <strong>No active {activeSegment === 'parcel' ? 'takeaway' : 'delivery'} orders</strong>
                    <span>New orders will appear here automatically.</span>
                  </EmptyState>
                ) : (
                  <TableCubePanel style={{ padding: '16px 24px' }}>
                    <TableCubeLegend style={{ marginBottom: 12 }}>
                      {TABLE_CUBE_LEGEND.map(item => (
                        <span className="legend-item" key={item.label}><span className="swatch" style={{ background: item.bg }} />{item.label}</span>
                      ))}
                    </TableCubeLegend>
                    <TokenGrid>
                      {activeList.map(order => {
                        const cube = tableCubeColor(order.orderStatus);
                        const tokenLabel = order.dailyBillNo ? `#${order.dailyBillNo}` : (order.orderNo ? `#${order.orderNo.slice(-4)}` : `#${order.id.slice(-4)}`);
                        const nameLabel = order.customerName || order.customerPhone || 'Guest';
                        return (
                          <TokenCube 
                            key={order.id} 
                            $bg={cube.bg} 
                            $ring={`${cube.bg}55`} 
                            $shadow={`${cube.bg}44`} 
                            onClick={() => handleOpenTableOrderDetails(order)}
                          >
                            <span className="token-no">{tokenLabel}</span>
                            <span className="token-name">{nameLabel}</span>
                          </TokenCube>
                        );
                      })}
                    </TokenGrid>
                  </TableCubePanel>
                )
              )
            )
          )}

          {/* ── Completed / Sales History Table ── */}
          {activeSegment === 'completed' && (
            <HistoryShell>
              <HistoryToolbar>
                <HistFilterWrap>
                  <div className="hist-dates">
                    <PremiumDateTimePicker
                      value={historyFilters.from}
                      onChange={(val) => { historyFiltersTouchedRef.current = true; setHistoryFilters(f => ({ ...f, from: val })); fetchHistoryOrders(0, { ...historyFilters, from: val }); }}
                    />
                    <span className="h-filter-sep">to</span>
                    <PremiumDateTimePicker
                      value={historyFilters.to}
                      onChange={(val) => { historyFiltersTouchedRef.current = true; setHistoryFilters(f => ({ ...f, to: val })); fetchHistoryOrders(0, { ...historyFilters, to: val }); }}
                    />
                  </div>



                  {terminals.length > 0 && (
                    <NiceSelect
                      className="nice-select"
                      options={[
                        { value: '', label: 'All Terminals' },
                        ...terminals.map(t => ({ value: t.id, label: t.name || t.terminalCode || 'Terminal' }))
                      ]}
                      value={historyFilters.terminalId || ''}
                      onChange={(val) => {
                        historyFiltersTouchedRef.current = true;
                        const f = { ...historyFilters, terminalId: val };
                        setHistoryFilters(f);
                        fetchHistoryOrders(0, f);
                      }}
                    />
                  )}

                  <NiceSelect
                    className="nice-select"
                    options={[
                      { value: '', label: 'All Status' },
                      { value: 'COMPLETED', label: 'Completed' },
                      { value: 'CANCELLED', label: 'Cancelled' },
                    ]}
                    value={historyFilters.status || ''}
                    onChange={(val) => { historyFiltersTouchedRef.current = true; const f = { ...historyFilters, status: val }; setHistoryFilters(f); fetchHistoryOrders(0, f); }}
                  />

                  <HistSearchBox>
                    <FaSearch />
                    <input
                      type="search"
                      value={historyFilters.q || ''}
                      placeholder="Search order, customer, invoice..."
                      onChange={(e) => handleSearchChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (debouncedSearchRef.current) clearTimeout(debouncedSearchRef.current);
                          fetchHistoryOrders(0, historyFilters);
                        }
                      }}
                    />
                  </HistSearchBox>
                </HistFilterWrap>
              </HistoryToolbar>

              {historyDisplayOrders.length === 0 ? (
                <EmptyState style={{ flex: 'none', padding: '48px 32px' }}>
                  <FaReceipt />
                  <strong>{historyFilters.q?.trim() ? 'No matching orders' : 'No orders found'}</strong>
                  <span>{historyFilters.q?.trim() ? 'Try a different search or date range.' : 'Completed and paid orders will appear here.'}</span>
                </EmptyState>
              ) : (
                ordersViewMode === 'board' ? (
                  renderKdsCardGrid(historyDisplayOrders)
                ) : (
                  <>
                  <HistTableWrap>
                    <HistTable>
                      <thead>
                        <tr>
                          <th>Order#</th>
                          <th>Date</th>
                          {config?.customersEnabled && <th>Customer</th>}
                          <th>Type</th>
                          <th>Items</th>
                          <th>Total</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyDisplayOrders.map(order => {
                          const date = histOrderTime(order);
                          const items = toDisplayItems(order);
                          const renderKey = histOrderIdentity(order) || `order:${date.getTime()}`;
                          const tone = histStatusTone(order);
                          const colors = histStatusBadgeColors(tone);
                          return (
                            <HistRow key={renderKey}>
                              <td>
                                <HistOrderLink onClick={async () => {
                                  try {
                                    const full = await loadFullOrder(order.id);
                                    setViewingDoc({ order: full || order, type: 'order' });
                                  } catch { setViewingDoc({ order, type: 'order' }); }
                                }}>
                                  {order.orderNo || order.order_no || `#${String(order.id).slice(0, 8)}`}
                                </HistOrderLink>
                              </td>
                              <td>
                                <HistRowDate>
                                  <span className="rd-d">{formatTzDate(date, timezone || 'Asia/Kolkata', { format: 'date', year: undefined })}</span>
                                  <span className="rd-t">{formatTzDate(date, timezone || 'Asia/Kolkata', { format: 'time' })}</span>
                                </HistRowDate>
                              </td>
                              {config?.customersEnabled && (
                                <td><strong>{histCustomerLabel(order)}</strong></td>
                              )}
                              <td><span style={{ fontWeight: 600, color: '#475569' }}>{histFulfillmentLabel(order)}</span></td>
                              <td><HistItemsPill>{(items || []).length}</HistItemsPill></td>
                              <td><strong>{money(histOrderTotal(order), sym)}</strong></td>
                              <td>
                                <HistStatusBadge style={{ background: colors.bg, color: colors.color, borderColor: colors.border }}>
                                  {histStatusText(order)}
                                </HistStatusBadge>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <HistActionGroup>
                                  {String(order?.orderStatus || order?.order_status || '').toUpperCase() !== 'CANCELLED' &&
                                   String(order?.orderStatus || order?.order_status || '').toUpperCase() !== 'VOID' && (
                                    <>
                                      <HistActionBtn type="button" onClick={() => handlePrintBill(order)}>
                                        <FaPrint style={{ fontSize: 10, color: '#f97316' }} /> Print
                                      </HistActionBtn>
                                      <HistActionBtn type="button" $tone="orange" title="Download PDF Invoice" onClick={async () => {
                                        try {
                                          const full = await loadFullOrder(order.id);
                                          await downloadInvoicePdf(full || order);
                                        } catch (err) {
                                          notify('error', 'Failed to generate invoice: ' + (err.message || 'Unknown error'));
                                        }
                                      }}>
                                        <FaFileInvoice style={{ fontSize: 10 }} /> Invoice
                                      </HistActionBtn>
                                      <HistActionBtn type="button" onClick={() => setEditingOrder(order)}>
                                        <FaEdit style={{ fontSize: 10, color: '#475569' }} /> Edit
                                      </HistActionBtn>
                                      {canCancelOrder && (
                                        <HistActionBtn type="button" $tone="red" onClick={(e) => {
                                          e.stopPropagation();
                                          setCancelReason('');
                                          setCancelOrder(order);
                                        }}>
                                          <FaTimesCircle style={{ fontSize: 10 }} /> Cancel
                                        </HistActionBtn>
                                      )}
                                    </>
                                  )}
                                </HistActionGroup>
                              </td>
                            </HistRow>
                          );
                        })}
                      </tbody>
                    </HistTable>
                  </HistTableWrap>
                  </>
                )
              )}

              <HistPager>
                <HistPagerBtn
                  disabled={historyLoading || historyPage.number <= 0}
                  onClick={() => fetchHistoryOrders(Math.max(0, historyPage.number - 1))}
                >Previous</HistPagerBtn>
                <span>Page {historyPage.totalPages ? historyPage.number + 1 : 0} of {historyPage.totalPages}</span>
                <HistPagerBtn
                  disabled={historyLoading || !historyPage.totalPages || historyPage.number >= historyPage.totalPages - 1}
                  onClick={() => fetchHistoryOrders(historyPage.number + 1)}
                >Next</HistPagerBtn>
              </HistPager>
            </HistoryShell>
          )}

          {viewingDoc && (
            <DocumentViewerPopup
              order={viewingDoc.order}
              docType={viewingDoc.type}
              vendors={[]}
              warehouses={[]}
              timezone={timezone || config?.timezone || 'Asia/Kolkata'}
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
                loadOrders?.();
                fetchHistoryOrders?.(historyPage.number || 0);
              }}
            />
          )}

          {selectedTableOrder && (
            <ModalOverlay onClick={() => setSelectedTableOrder(null)}>
              <OrderDetailsModal $accent={tableCubeColor(selectedTableOrder.orderStatus).bg} onClick={e => e.stopPropagation()}>
                <div className="detail-head">
                  <div className="detail-title">
                    <h3>#{selectedTableOrder.orderNo || selectedTableOrder.id?.slice?.(0, 8)}</h3>
                    {selectedTableOrder.dailyBillNo && (
                      <span className="detail-sub" style={{ color: '#ea580c' }}>Daily Bill No: {selectedTableOrder.dailyBillNo}</span>
                    )}
                    <span className="detail-status-chip">{tableCubeColor(selectedTableOrder.orderStatus).label}</span>
                  </div>
                  <button className="close-btn" onClick={() => { setSelectedTableOrder(null); setChangeTableMode(false); setChangeTableTarget(''); }}><FaTimes /></button>
                </div>

                <div className="detail-body">
                  <div className="meta-grid">
                    <div className="meta-box">
                      <span>Type</span>
                      <strong>{selectedTableOrder.fulfillmentType || 'Dine-In'}</strong>
                    </div>
                    <div className="meta-box">
                      <span>Table</span>
                      <strong>{selectedTableOrder.tableNumber || 'N/A'}</strong>
                    </div>
                    <div className="meta-box">
                      <span>Time</span>
                      <strong>
                        {formatTzDate(
                          selectedTableOrder.orderDate || selectedTableOrder.order_date || selectedTableOrder.createdAt || selectedTableOrder.created_at,
                          timezone || 'Asia/Kolkata',
                          { format: 'time' }
                        )}
                      </strong>
                    </div>
                    <div className="meta-box">
                      <span>Bill No</span>
                      <strong>{selectedTableOrder.dailyBillNo || '—'}</strong>
                    </div>
                  </div>

                  {/* Change Table Section - only for active dine-in orders with a table (not billed, completed, paid, void, cancelled) */}
                  {selectedTableOrder.tableNumber && !['BILLED', 'COMPLETED', 'CANCELLED', 'VOID', 'PAID'].includes(String(selectedTableOrder.orderStatus).toUpperCase()) && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px' }}>
                      {!changeTableMode ? (
                        <button
                          type="button"
                          onClick={() => { setChangeTableMode(true); setChangeTableTarget(''); }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#f97316', fontSize: 12, fontWeight: 700, padding: 0,
                            fontFamily: 'inherit',
                          }}
                        >
                          <FaExchangeAlt size={11} /> Change Table
                        </button>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Select Available Table</span>
                          <NiceSelect
                            value={changeTableTarget}
                            onChange={(val) => setChangeTableTarget(val)}
                            placeholder="-- Select a table --"
                            options={availableMoveTables.length === 0
                              ? [{ value: '', label: 'No available tables' }]
                              : availableMoveTables.map(t => ({
                                  value: t.id,
                                  label: `Table ${t.tableNumber}${t.seatingCapacity ? ` (${t.seatingCapacity} seats)` : ''}${t.section ? ` · ${t.section}` : ''}`,
                                }))
                            }
                          />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => { setChangeTableMode(false); setChangeTableTarget(''); }}
                              style={{
                                flex: 1, padding: '5px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
                                background: '#f8fafc', color: '#475569', fontSize: 11, fontWeight: 700,
                                cursor: 'pointer', fontFamily: 'inherit',
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={!changeTableTarget || changeTableBusy}
                              onClick={handleMoveTable}
                              style={{
                                flex: 1, padding: '5px 10px', borderRadius: 8, border: 'none',
                                background: changeTableTarget ? 'linear-gradient(135deg,#f97316,#ea580c)' : '#e2e8f0',
                                color: changeTableTarget ? 'white' : '#94a3b8', fontSize: 11, fontWeight: 700,
                                cursor: changeTableTarget ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                                display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'center',
                                transition: 'all 0.2s',
                              }}
                            >
                              <FaExchangeAlt size={10} />
                              {changeTableBusy ? 'Moving…' : 'Move'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedTableOrder.fulfillmentType === 'DELIVERY' && (() => {
                    const details = parseDeliveryDetails(selectedTableOrder.description);
                    if (!details) return null;
                    return (
                      <DeliveryDetailsCard>
                        <div className="section-title">
                          <FaTruck /> Delivery Details
                        </div>
                        <div className="detail-row">
                          <FaUser />
                          <span><strong>Name:</strong> {details.name || 'N/A'}</span>
                        </div>
                        <div className="detail-row">
                          <FaPhoneAlt />
                          <span><strong>Phone:</strong> {details.phone || 'N/A'}</span>
                        </div>
                        {details.address && (
                          <div className="detail-row">
                            <FaMapMarkerAlt />
                            <span><strong>Address:</strong> {details.address}</span>
                          </div>
                        )}
                        {details.email && (
                          <div className="detail-row">
                            <FaEnvelope />
                            <span><strong>Email:</strong> {details.email}</span>
                          </div>
                        )}
                        {details.note && (
                          <div className="note-block">
                            <FaStickyNote />
                            <span><strong>Note:</strong> {details.note}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px', borderTop: '1px solid #bae6fd', paddingTop: '10px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              const lat = selectedTableOrder.latitude;
                              const lng = selectedTableOrder.longitude;
                              const mapsUrl = lat && lng 
                                ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
                                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(details.address || '')}`;
                              
                              navigator.clipboard.writeText(mapsUrl);
                              notify('success', 'Google Maps link copied!');
                            }}
                            style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: '1px solid #0284c7',
                              background: 'white',
                              color: '#0284c7',
                              fontSize: '11px',
                              fontWeight: '700',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              transition: 'all 0.2s'
                            }}
                          >
                            <FaCopy size={12} /> Copy Location
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const lat = selectedTableOrder.latitude;
                              const lng = selectedTableOrder.longitude;
                              const mapsUrl = lat && lng 
                                ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
                                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(details.address || '')}`;
                              
                              const text = `🛵 *Delivery Location Link*\n` +
                                `*Order:* #${selectedTableOrder.orderNo || selectedTableOrder.id.slice(0, 8)}\n` +
                                `*Customer:* ${details.name || 'N/A'}\n` +
                                `*Phone:* ${details.phone || 'N/A'}\n` +
                                `*Address:* ${details.address || 'N/A'}\n\n` +
                                `*Google Maps Link:* ${mapsUrl}`;
                              
                              window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
                            }}
                            style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: 'none',
                              background: '#25D366',
                              color: 'white',
                              fontSize: '11px',
                              fontWeight: '700',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              transition: 'all 0.2s'
                            }}
                          >
                            <FaWhatsapp size={13} /> Share Location
                          </button>
                        </div>
                      </DeliveryDetailsCard>
                    );
                  })()}

                  <div className="detail-items">
                    {toDisplayItems(selectedTableOrder).map((line, i) => {
                      const qty = Number(line.quantity || 1);
                      const unitPrice = Number(line.price || line.unitPrice || 0);
                      const discount = Number(line.discount_amount || line.discountAmount || 0);
                      const tax = Number(line.tax_amount || line.taxAmount || 0);
                      const lineTotal = Number(line.line_total || line.lineTotal || (unitPrice * qty) || 0);
                      const displayName = line.variant_name ? `${line.name} (${line.variant_name})` : (line.name || line.productName || 'Item');
                      const metaParts = [
                        line.category || line.categoryName,
                        unitPrice ? `${sym}${unitPrice.toFixed(2)} each` : null,
                      ].filter(Boolean);

                      return (
                        <div key={i} className="detail-item">
                          <span className="qty">{qty}×</span>
                          <div className="line-main">
                            <span className="name">{displayName}</span>
                            <span className="line-meta">
                              {metaParts.join(' - ')}
                              {discount > 0 && <span className="discount"> - Discount {sym}{discount.toFixed(2)}</span>}
                              {config?.taxEnabled && tax > 0 && <span className="tax"> - Tax {sym}{tax.toFixed(2)}</span>}
                            </span>
                          </div>
                          <span className="line-total">{sym}{lineTotal.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="detail-footer">
                  <div className="price-breakdown">
                    <div className="breakdown-row">
                      <span>Gross Total</span>
                      <span>{sym}{Number(selectedTableOrder.totalAmount || selectedTableOrder.total_amount || 0).toFixed(2)}</span>
                    </div>
                    {Number(selectedTableOrder.totalDiscountAmount || selectedTableOrder.total_discount_amount || 0) > 0 && (
                      <div className="breakdown-row discount">
                        <span>Discount</span>
                        <span>-{sym}{Number(selectedTableOrder.totalDiscountAmount || selectedTableOrder.total_discount_amount || 0).toFixed(2)}</span>
                      </div>
                    )}
                    {config?.taxEnabled && Number(selectedTableOrder.totalTaxAmount || selectedTableOrder.total_tax_amount || 0) > 0 && (() => {
                      return (
                        <div className="breakdown-row">
                          <span>Tax Amount</span>
                          <span>{sym}{Number(selectedTableOrder.totalTaxAmount || selectedTableOrder.total_tax_amount || 0).toFixed(2)}</span>
                        </div>
                      );
                    })()}
                    <div className="breakdown-divider" />
                    <div className="breakdown-row total">
                      <span>Grand Total</span>
                      <span>{sym}{(() => {
                        const sub = Number(selectedTableOrder.totalAmount || selectedTableOrder.total_amount || 0);
                        const tax = Number(selectedTableOrder.totalTaxAmount || selectedTableOrder.total_tax_amount || 0);
                        const disc = Number(selectedTableOrder.totalDiscountAmount || selectedTableOrder.total_discount_amount || 0);
                        const dbGrand = Number(selectedTableOrder.grandTotal || selectedTableOrder.grand_total || 0);
                        const isGstEngine = !!(selectedTableOrder.discountCalculationVersion || selectedTableOrder.discount_calculation_version || selectedTableOrder.grossAmount || selectedTableOrder.gross_amount);
                        if (!isGstEngine && Math.abs(dbGrand - sub) < 0.05 && tax > 0.05) {
                          return (sub + tax - disc).toFixed(2);
                        }
                        return (dbGrand || sub || 0).toFixed(2);
                      })()}</span>
                    </div>
                  </div>

                  <div className="detail-actions">
                    <div className="actions-row-primary">
                      <ActionBtn $variant="success" style={{ width: '100%' }} onClick={() => {
                        setPaymentOrder(selectedTableOrder);
                        setSelectedTableOrder(null);
                      }}>
                        <FaCheckCircle /> Complete Order
                      </ActionBtn>
                    </div>
                    
                    <div className="actions-grid-secondary">
                      <ActionBtn $variant="secondary" onClick={() => {
                        setEditingOrder(selectedTableOrder);
                        setSelectedTableOrder(null);
                      }}>
                        <FaEdit /> Edit
                      </ActionBtn>
                      <ActionBtn $variant="secondary" onClick={() => {
                        handlePrintKot(selectedTableOrder);
                        setSelectedTableOrder(null);
                      }}>
                        <FaPrint /> KOT
                      </ActionBtn>
                      <ActionBtn $variant="secondary" onClick={() => {
                        if (localPrintWillHandleKind('bill')) {
                          handlePrintBill(selectedTableOrder);
                        }
                        updateStatus(selectedTableOrder.id, 'BILLED');
                        setSelectedTableOrder(null);
                      }}>
                        <FaReceipt /> Bill
                      </ActionBtn>
                      <ActionBtn $variant="danger" onClick={(e) => {
                        e.stopPropagation();
                        setCancelReason('');
                        setCancelOrder(selectedTableOrder);
                        setSelectedTableOrder(null);
                      }}>
                        <FaTimesCircle /> Cancel
                      </ActionBtn>
                    </div>
                  </div>
                </div>
              </OrderDetailsModal>
            </ModalOverlay>
          )}

          {cancelOrder && (
            <ModalOverlay onClick={() => setCancelOrder(null)}>
              <ModalContent onClick={e => e.stopPropagation()}>
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
                    onClick={triggerCancelOrder}
                    disabled={!cancelReason.trim() || actionBusy === cancelOrder.id}
                  >
                    Confirm Cancel
                  </ActionBtn>
                </div>
              </ModalContent>
            </ModalOverlay>
          )}

          {/* Reusable Edit Order Panel */}
          {editingOrder && (
            <EditOrderPanel
              order={editingOrder}
              onClose={() => setEditingOrder(null)}
              onSave={handleSaveEditedOrder}
              saving={!!actionBusy && actionBusy === editingOrder?.id}
            />
          )}

          {paymentOrder && (
            <PaymentDialog
              order={paymentOrder}
              loading={actionBusy === 'settle'}
              config={config}
              creditCustomers={creditCustomers}
              onClose={() => setPaymentOrder(null)}
              onConfirm={handleConfirmPayment}
              themeColor="orange"
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
        </OrdersWrap>
      </PageContainer>
    </DashboardLayout>
  );
}
