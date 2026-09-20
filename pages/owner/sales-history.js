import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import styled from 'styled-components';
import Cookies from 'js-cookie';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import DashboardLayout from '../../components/DashboardLayout';
import { PageContainer } from '../../components/PremiumPOSUI';
import {
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
  EmptyState,
  ModalOverlay,
  ModalContent,
  ActionBtn,
  SegmentedWrapper,
  SegmentBtn,
  HeaderModeSwitch,
  ModeToggleBtn
} from '../../components/PremiumOrdersUI';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import NiceSelect from '../../components/NiceSelect';
import { downloadInvoicePdf } from '../../utils/invoicePdf';
import { toDisplayItems } from '../../utils/printUtils';
import { formatTzDate, getBusinessNow, businessTimeToUtc } from '../../utils/timezoneUtils';
import {
  isAndroidPrintStationEnabled,
  markCloudPrintJobPrinted,
  isPrintStationEnabled,
  enqueueCloudPrintJob,
  localPrintWillHandleKind,
} from '../../utils/cloudPrintStation';
import DocumentViewerPopup from '../../components/purchasing/DocumentViewerPopup';
import KotPrint from '../../components/KotPrint';
import EditOrderPanel from '../../components/EditOrderPanel';
import {
  FaSearch,
  FaReceipt,
  FaPrint,
  FaFileInvoice,
  FaEdit,
  FaTimesCircle,
  FaUtensils,
  FaShoppingBag,
  FaTruck,
  FaHistory,
  FaList,
  FaThLarge,
  FaClock,
  FaUser
} from 'react-icons/fa';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const money = (value, symbol = '₹') => `${symbol}${Number(value || 0).toFixed(2)}`;

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
  if (status === 'CANCELLED' || status === 'VOID') return 'red';
  if (status === 'BILLED') return 'emerald';
  if (status === 'KITCHEN' || status === 'CONFIRMED' || status === 'IN_PROGRESS') return 'orange';
  if (status === 'READY') return 'teal';
  return 'default';
}

function histStatusText(order) {
  const status = String(order?.orderStatus || order?.order_status || 'COMPLETED').toUpperCase();
  if (status === 'COMPLETED' || status === 'PAID') return 'COMPLETED';
  if (status === 'CANCELLED' || status === 'VOID') return 'CANCELLED';
  if (status === 'KITCHEN') return 'ORDERED';
  return status.replace(/_/g, ' ');
}

function histStatusBadgeColors(tone) {
  switch (tone) {
    case 'green':
      return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
    case 'red':
      return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
    case 'emerald':
      return { bg: '#ecfdf5', color: '#047857', border: '#86efac' };
    case 'orange':
      return { bg: '#fff7ed', color: '#c2410c', border: '#fdba74' };
    case 'teal':
      return { bg: '#f0fdf4', color: '#15803d', border: '#86efac' };
    default:
      return { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' };
  }
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
  return order?.customerName || order?.creditCustomerName || order?.customerPhone || order?.creditCustomerPhone || '—';
}

function toDateTimeInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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

function getStatusBorderColor(order) {
  const tone = histStatusTone(order);
  switch (tone) {
    case 'green':
    case 'emerald':
      return '#10b981';
    case 'red':
      return '#ef4444';
    case 'orange':
      return '#f97316';
    case 'teal':
      return '#0ea5e9';
    default:
      return '#94a3b8';
  }
}

const HistBoardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  padding: 10px 0;
  width: 100%;
  box-sizing: border-box;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 6px 0;
  }
`;

const HistBoardCard = styled.div`
  background: #ffffff;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  border-left: 4px solid ${props => props.$statusColor || '#94a3b8'};
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  display: flex;
  flex-direction: column;
  padding: 11px 12px 10px;
  gap: 6px;
  transition: all 0.15s ease-in-out;
  box-sizing: border-box;
  cursor: pointer;

  &:hover {
    box-shadow: 0 6px 16px rgba(15, 23, 42, 0.09);
    transform: translateY(-1px);
    border-color: #cbd5e1;
  }
`;



// ─── Main Component ───────────────────────────────────────────────────────────

export default function SalesHistoryPage() {
  const router = useRouter();
  const { notify } = useNotification();
  const { timezone, orgId, canCancelOrder } = useAuth();

  const isMountedRef = useRef(true);
  const historyAbortControllerRef = useRef(null);
  const historyFiltersTouchedRef = useRef(false);
  const debouncedSearchRef = useRef(null);

  const [config, setConfig] = useState(null);
  const [terminals, setTerminals] = useState([]);
  const [historyOrders, setHistoryOrders] = useState([]);
  const [historyPage, setHistoryPage] = useState({ number: 0, size: 20, totalPages: 0, totalElements: 0 });
  const [historyFilters, setHistoryFilters] = useState(() => defaultHistoryRange(timezone));
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySummary, setHistorySummary] = useState(null);

  // View Mode state: Table vs Board
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'board'

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cafeqr_sales_history_view_mode');
      if (saved && (saved === 'table' || saved === 'board')) {
        setViewMode(saved);
      }
    }
  }, []);

  const handleToggleViewMode = (mode) => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('cafeqr_sales_history_view_mode', mode);
    }
  };

  // Live Orders segmentation: Table, Takeaway, Delivery, Completed
  const [activeSegment, setActiveSegment] = useState('completed'); // 'table' | 'takeaway' | 'delivery' | 'completed'
  const [liveOrders, setLiveOrders] = useState([]);

  // Fetch live orders
  const fetchLiveOrders = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/orders/sales/live');
      const list = res.data?.data || [];
      if (Array.isArray(list) && isMountedRef.current) {
        setLiveOrders(list);
      }
    } catch (e) {
      console.warn('Failed to fetch live orders in SalesHistory:', e);
    }
  }, []);

  useEffect(() => {
    fetchLiveOrders();
    const interval = setInterval(fetchLiveOrders, 10000);
    return () => clearInterval(interval);
  }, [fetchLiveOrders]);

  // Categorize live orders
  const { tableOrders, takeawayOrders, deliveryOrders } = useMemo(() => {
    const tables = [];
    const takeaway = [];
    const delivery = [];

    (liveOrders || []).forEach(order => {
      const status = String(order.orderStatus || order.order_status || '').toUpperCase();
      if (status === 'COMPLETED' || status === 'CANCELLED' || status === 'VOID' || status === 'CLOSED') {
        return;
      }
      const ft = String(order.fulfillmentType || order.fulfillment_type || '').toUpperCase();
      const hasTable = Boolean(order.tableNumber || order.table_number || order.tableId || order.table_id);

      if (ft === 'DELIVERY') {
        delivery.push(order);
      } else if (ft === 'TAKEAWAY' || ft === 'PARCEL' || (!hasTable && ft !== 'DINE_IN')) {
        takeaway.push(order);
      } else {
        tables.push(order);
      }
    });

    return { tableOrders: tables, takeawayOrders: takeaway, deliveryOrders: delivery };
  }, [liveOrders]);

  // Modals state
  const [viewingDoc, setViewingDoc] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [cancelOrder, setCancelOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionBusy, setActionBusy] = useState(null);
  const [printOrder, setPrintOrder] = useState(null);
  const [printKind, setPrintKind] = useState('bill');

  const sym = config?.currencySymbol || '₹';

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (historyAbortControllerRef.current) {
        historyAbortControllerRef.current.abort();
      }
      if (debouncedSearchRef.current) {
        clearTimeout(debouncedSearchRef.current);
      }
    };
  }, []);

  // Fetch configs and terminals
  useEffect(() => {
    api.get('/api/v1/configurations')
      .then(res => setConfig(res.data?.data || null))
      .catch(() => {});

    const termUrl = orgId ? `/api/v1/terminals/org/${orgId}` : '/api/v1/terminals';
    api.get(termUrl)
      .then(res => setTerminals(res.data?.data || []))
      .catch(() => {});
  }, [orgId]);

  // Load full order details
  const loadFullOrder = async (orderId) => {
    try {
      const { data } = await api.get(`/api/v1/orders/${orderId}`);
      return data.data;
    } catch {
      return null;
    }
  };

  // Strictly Completed & Cancelled Orders Fetcher
  const fetchHistoryOrders = useCallback(async (page = 0, filters = historyFilters, targetStatus = null) => {
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

      // Status param: explicit targetStatus or fallback to activeSegment
      const resolvedStatus = targetStatus || (activeSegment === 'cancelled' ? 'CANCELLED' : 'COMPLETED');

      const response = await api.post('/api/v2/sales/dashboard', {
        from: fromUtc,
        to: toUtc,
        q: queryToSend || undefined,
        status: resolvedStatus,
        orgId: orgId || undefined,
        terminalId: filters.terminalId || undefined,
        page,
        size: 20
      }, {
        signal: controller.signal
      });

      const { summary, orders } = response.data?.data || {};

      if (historyAbortControllerRef.current === controller && isMountedRef.current) {
        if (orders) {
          const allOrders = orders.content || [];

          setHistoryOrders(allOrders);
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
        console.error('Failed to fetch sales history', e);
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
  }, [historyFilters, timezone, orgId, activeSegment]);

  // Initial load: load completed orders (or tab specified in query)
  useEffect(() => {
    const queryTab = router.query?.tab ? String(router.query.tab).toLowerCase() : null;
    if (queryTab && ['table', 'takeaway', 'delivery', 'completed', 'cancelled'].includes(queryTab)) {
      setActiveSegment(queryTab);
      if (queryTab === 'cancelled') {
        fetchHistoryOrders(0, historyFilters, 'CANCELLED');
      } else {
        fetchHistoryOrders(0, historyFilters, 'COMPLETED');
      }
    } else {
      fetchHistoryOrders(0, historyFilters, 'COMPLETED');
    }
  }, [router.query?.tab]);

  const isHistoryTab = activeSegment === 'completed' || activeSegment === 'cancelled';

  // Segment Tab Change handler
  const handleSegmentChange = (seg) => {
    setActiveSegment(seg);
    if (seg === 'completed') {
      fetchHistoryOrders(0, historyFilters, 'COMPLETED');
    } else if (seg === 'cancelled') {
      fetchHistoryOrders(0, historyFilters, 'CANCELLED');
    }
  };

  // Debounced search
  const handleSearchChange = useCallback((newQ) => {
    setHistoryFilters(f => {
      const updated = { ...f, q: newQ };
      if (debouncedSearchRef.current) clearTimeout(debouncedSearchRef.current);
      debouncedSearchRef.current = setTimeout(() => {
        fetchHistoryOrders(0, updated, activeSegment === 'cancelled' ? 'CANCELLED' : 'COMPLETED');
      }, 400);
      return updated;
    });
  }, [fetchHistoryOrders, activeSegment]);

  // Client-side quick filter on already loaded page (in addition to backend query)
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

  // Combined orders to display based on active segment tab (Table, Takeaway, Delivery, Completed, Cancelled)
  const displayedOrders = useMemo(() => {
    let list = [];
    if (activeSegment === 'table') {
      list = tableOrders;
    } else if (activeSegment === 'takeaway') {
      list = takeawayOrders;
    } else if (activeSegment === 'delivery') {
      list = deliveryOrders;
    } else {
      list = filteredHistoryOrders;
    }

    if (!isHistoryTab && historyFilters.q?.trim()) {
      const query = historyFilters.q.trim().toLowerCase().replace(/^[#\s]+/, '');
      if (!query) return list;
      return list.filter(order => {
        const orderNo = String(order?.orderNo || order?.order_no || '').toLowerCase();
        const dailyBillNo = String(order?.dailyBillNo || order?.daily_bill_no || '').toLowerCase();
        const customerName = String(order?.customerName || order?.customer_name || '').toLowerCase();
        const customerPhone = String(order?.customerPhone || order?.customer_phone || '').toLowerCase();
        const tableNum = String(order?.tableNumber || order?.table_number || '').toLowerCase();
        return (
          orderNo.includes(query) ||
          dailyBillNo.includes(query) ||
          customerName.includes(query) ||
          customerPhone.includes(query) ||
          tableNum.includes(query)
        );
      });
    }

    return list;
  }, [activeSegment, tableOrders, takeawayOrders, deliveryOrders, filteredHistoryOrders, historyFilters.q, isHistoryTab]);

  // Print Bill Handler
  const handlePrintBill = async (order) => {
    let activeOrder = order;
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
        console.warn('Unable to mark cloud print job printed on bill print:', error?.message || error);
      });
    }
  };

  // Cancel Order Handler
  const triggerCancelOrder = async () => {
    if (!cancelOrder) return;
    setActionBusy(cancelOrder.id);
    try {
      await api.post(`/api/v1/orders/${cancelOrder.id}/cancel`, {
        reason: cancelReason || 'Order cancelled from Sales History'
      });
      setCancelOrder(null);
      notify('success', 'Order cancelled successfully');
      fetchHistoryOrders(historyPage.number || 0);
      fetchLiveOrders();
    } catch (e) {
      notify('error', 'Failed to cancel order: ' + (e.response?.data?.message || e.message));
    } finally {
      setActionBusy(null);
    }
  };

  // Save Edited Order Handler
  const handleSaveEditedOrder = async (updatedOrderData) => {
    if (!editingOrder?.id) return;
    setActionBusy(editingOrder.id);
    try {
      await api.put(`/api/v1/orders/${editingOrder.id}`, updatedOrderData);
      setEditingOrder(null);
      notify('success', 'Order updated successfully');
      fetchHistoryOrders(historyPage.number || 0);
    } catch (e) {
      notify('error', 'Failed to update order: ' + (e.response?.data?.message || e.message));
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <DashboardLayout title="Sales History" showBack={true} backUrl="/owner/main-menu">
      <PageContainer style={{ padding: '16px 20px' }}>
        <HistoryShell style={{ padding: 0 }}>

          {/* Top Header: Segmented Tabs (Centered) + Table/Board Switch (Right) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div style={{ display: 'flex', flex: 1, justifyContent: 'center' }}>
              <SegmentedWrapper style={{ margin: '0 auto' }}>
                {config?.tableManagementEnabled !== false && (
                  <SegmentBtn
                    type="button"
                    $active={activeSegment === 'table'}
                    $accent="#0f172a"
                    onClick={() => handleSegmentChange('table')}
                  >
                    <FaUtensils /> Table <span className="badge">{tableOrders.length}</span>
                  </SegmentBtn>
                )}

                <SegmentBtn
                  type="button"
                  $active={activeSegment === 'takeaway'}
                  $accent="#0f172a"
                  onClick={() => handleSegmentChange('takeaway')}
                >
                  <FaShoppingBag /> Takeaway <span className="badge">{takeawayOrders.length}</span>
                </SegmentBtn>

                {config?.onlineDeliveryEnabled && (
                  <SegmentBtn
                    type="button"
                    $active={activeSegment === 'delivery'}
                    $accent="#0f172a"
                    onClick={() => handleSegmentChange('delivery')}
                  >
                    <FaTruck /> Delivery <span className="badge">{deliveryOrders.length}</span>
                  </SegmentBtn>
                )}

                <SegmentBtn
                  type="button"
                  $active={activeSegment === 'completed'}
                  $accent="#0f172a"
                  onClick={() => handleSegmentChange('completed')}
                >
                  <FaHistory /> Completed
                </SegmentBtn>

                <SegmentBtn
                  type="button"
                  $active={activeSegment === 'cancelled'}
                  $accent="#dc2626"
                  onClick={() => handleSegmentChange('cancelled')}
                >
                  <FaTimesCircle style={{ color: activeSegment === 'cancelled' ? '#dc2626' : '#94a3b8' }} /> Cancelled
                </SegmentBtn>
              </SegmentedWrapper>
            </div>

            <HeaderModeSwitch style={{ flexShrink: 0 }}>
              <ModeToggleBtn
                type="button"
                $active={viewMode === 'table'}
                onClick={() => handleToggleViewMode('table')}
                title="Table View"
              >
                <FaList size={11} />
                <span>Table</span>
              </ModeToggleBtn>
              <ModeToggleBtn
                type="button"
                $active={viewMode === 'board'}
                onClick={() => handleToggleViewMode('board')}
                title="Board View"
              >
                <FaThLarge size={11} />
                <span>Board</span>
              </ModeToggleBtn>
            </HeaderModeSwitch>
          </div>

          {/* Filters Bar: When on Completed or Cancelled tab, shows date and terminal filters. On live tabs, shows search box */}
          <HistoryToolbar>
            <HistFilterWrap>
              {isHistoryTab && (
                <>
                  <div className="hist-dates">
                    <PremiumDateTimePicker
                      value={historyFilters.from}
                      onChange={(val) => {
                        historyFiltersTouchedRef.current = true;
                        setHistoryFilters(f => ({ ...f, from: val }));
                        fetchHistoryOrders(0, { ...historyFilters, from: val });
                      }}
                      themeColor="#f97316"
                    />
                    <span className="h-filter-sep">to</span>
                    <PremiumDateTimePicker
                      value={historyFilters.to}
                      onChange={(val) => {
                        historyFiltersTouchedRef.current = true;
                        setHistoryFilters(f => ({ ...f, to: val }));
                        fetchHistoryOrders(0, { ...historyFilters, to: val });
                      }}
                      themeColor="#f97316"
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
                </>
              )}

              <HistSearchBox style={!isHistoryTab ? { width: '100%', maxWidth: 400 } : {}}>
                <FaSearch />
                <input
                  type="search"
                  value={historyFilters.q || ''}
                  placeholder={
                    activeSegment === 'completed'
                      ? "Search completed orders..."
                      : activeSegment === 'cancelled'
                      ? "Search cancelled orders..."
                      : `Search ${activeSegment} orders...`
                  }
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (debouncedSearchRef.current) clearTimeout(debouncedSearchRef.current);
                      if (isHistoryTab) {
                        fetchHistoryOrders(0, historyFilters);
                      }
                    }
                  }}
                />
              </HistSearchBox>
            </HistFilterWrap>
          </HistoryToolbar>

          {/* Orders Content: Table or Board View */}
          {displayedOrders.length === 0 ? (
            <EmptyState style={{ flex: 'none', padding: '48px 32px' }}>
              {activeSegment === 'table' && <FaUtensils />}
              {activeSegment === 'takeaway' && <FaShoppingBag />}
              {activeSegment === 'delivery' && <FaTruck />}
              {activeSegment === 'completed' && <FaReceipt />}
              {activeSegment === 'cancelled' && <FaTimesCircle style={{ color: '#ef4444', fontSize: 32 }} />}
              <strong>
                {historyFilters.q?.trim()
                  ? 'No matching orders'
                  : activeSegment === 'completed'
                  ? 'No completed orders found'
                  : activeSegment === 'cancelled'
                  ? 'No cancelled orders found'
                  : `No active ${activeSegment === 'table' ? 'Table' : activeSegment === 'takeaway' ? 'Takeaway' : 'Delivery'} orders`}
              </strong>
              <span>
                {historyFilters.q?.trim()
                  ? 'Try a different search query.'
                  : activeSegment === 'completed'
                  ? 'Completed orders will appear here.'
                  : activeSegment === 'cancelled'
                  ? 'Cancelled and void orders will appear here.'
                  : `Active ${activeSegment} orders will appear here in real time.`}
              </span>
            </EmptyState>
          ) : viewMode === 'board' ? (
            <HistBoardGrid>
              {displayedOrders.map(order => {
                const date = histOrderTime(order);
                const items = toDisplayItems(order);
                const renderKey = histOrderIdentity(order) || `order:${date.getTime()}`;
                const tone = histStatusTone(order);
                const colors = histStatusBadgeColors(tone);
                const statusBorderColor = getStatusBorderColor(order);
                const isCancelled = String(order?.orderStatus || order?.order_status || '').toUpperCase() === 'CANCELLED' || String(order?.orderStatus || order?.order_status || '').toUpperCase() === 'VOID';

                return (
                  <HistBoardCard
                    key={renderKey}
                    $statusColor={statusBorderColor}
                    onClick={async () => {
                      try {
                        const full = await loadFullOrder(order.id);
                        setViewingDoc({ order: full || order, type: 'order' });
                      } catch {
                        setViewingDoc({ order, type: 'order' });
                      }
                    }}
                  >
                    {/* Row 1: Order # / Daily Bill # and Status Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden' }}>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#ea580c',
                          fontFamily: "'SF Mono', 'Consolas', monospace",
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {order.orderNo || order.order_no || `#${String(order.id).slice(0, 8)}`}
                        </span>
                        {Boolean(order.dailyBillNo && (order.orderNo || order.order_no) && String(order.dailyBillNo) !== String(order.orderNo || order.order_no)) && (
                          <span style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: '#64748b',
                            background: '#f1f5f9',
                            border: '1px solid #e2e8f0',
                            padding: '0 4px',
                            borderRadius: 3,
                            letterSpacing: '0.02em',
                            flexShrink: 0
                          }} title="Daily Bill / Token Sequence">
                            #{order.dailyBillNo}
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontSize: 8.5,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: colors.bg,
                        color: colors.color,
                        border: `1px solid ${colors.border}`,
                        whiteSpace: 'nowrap',
                        flexShrink: 0
                      }}>
                        {histStatusText(order)}
                      </span>
                    </div>

                    {/* Row 2: Date/Time & Fulfillment Type */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9.5, color: '#64748b' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <FaClock size={8.5} style={{ color: '#94a3b8' }} />
                        {formatTzDate(date, timezone || 'Asia/Kolkata', { format: 'time' })}
                        <span style={{ color: '#cbd5e1' }}>•</span>
                        <span>{formatTzDate(date, timezone || 'Asia/Kolkata', { format: 'date', year: undefined })}</span>
                      </span>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        fontWeight: 600,
                        color: '#475569',
                        fontSize: 9.5
                      }}>
                        {histFulfillmentLabel(order)}
                      </span>
                    </div>

                    {/* Row 3: Customer (if available and not empty) */}
                    {(() => {
                      const cust = histCustomerLabel(order);
                      if (!cust || cust === '—' || cust === 'Walk-in') return null;
                      return (
                        <div style={{
                          fontSize: 10,
                          color: '#475569',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          <FaUser size={8} style={{ color: '#94a3b8', flexShrink: 0 }} />
                          <span style={{ fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {cust}
                          </span>
                        </div>
                      );
                    })()}

                    {/* Row 4: Compact Items List */}
                    {items.length > 0 && (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        background: '#f8fafc',
                        border: '1px solid #f1f5f9',
                        borderRadius: 6,
                        padding: '5px 7px',
                        maxHeight: 62,
                        overflowY: 'auto'
                      }}>
                        {items.map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, color: '#334155' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                              {item.name || item.productName || item.product_name || 'Item'}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: 10, color: '#64748b' }}>
                              x{item.quantity || item.qty || 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Row 5: Total Amount */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 'auto',
                      paddingTop: 6,
                      borderTop: '1px solid #f1f5f9',
                    }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Total Amount
                      </span>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>
                        {money(histOrderTotal(order), sym)}
                      </span>
                    </div>

                    {/* Row 6: Action Buttons Bar */}
                    {!isCancelled && (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: canCancelOrder ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)',
                          gap: 4,
                          marginTop: 2
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handlePrintBill(order)}
                          title="Print Bill"
                          style={{
                            padding: '5px 4px',
                            borderRadius: 5,
                            border: '1px solid #fed7aa',
                            background: '#fff7ed',
                            color: '#ea580c',
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 3,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <FaPrint size={9} /> Print
                        </button>

                        <button
                          type="button"
                          title="Download PDF Invoice"
                          onClick={async () => {
                            try {
                              const full = await loadFullOrder(order.id);
                              await downloadInvoicePdf(full || order);
                            } catch (err) {
                              notify('error', 'Failed to generate invoice: ' + (err.message || 'Unknown error'));
                            }
                          }}
                          style={{
                            padding: '5px 4px',
                            borderRadius: 5,
                            border: '1px solid #e2e8f0',
                            background: '#f8fafc',
                            color: '#334155',
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 3,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <FaFileInvoice size={9} /> Invoice
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingOrder(order)}
                          title="Edit Order"
                          style={{
                            padding: '5px 4px',
                            borderRadius: 5,
                            border: '1px solid #e2e8f0',
                            background: '#f8fafc',
                            color: '#334155',
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 3,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <FaEdit size={9} /> Edit
                        </button>

                        {canCancelOrder && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCancelReason('');
                              setCancelOrder(order);
                            }}
                            title="Cancel Order"
                            style={{
                              padding: '5px 4px',
                              borderRadius: 5,
                              border: '1px solid #fecaca',
                              background: '#fef2f2',
                              color: '#dc2626',
                              fontSize: 10,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 3,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            <FaTimesCircle size={9} /> Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </HistBoardCard>
                );
              })}
            </HistBoardGrid>
          ) : (
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
                  {displayedOrders.map(order => {
                    const date = histOrderTime(order);
                    const items = toDisplayItems(order);
                    const renderKey = histOrderIdentity(order) || `order:${date.getTime()}`;
                    const tone = histStatusTone(order);
                    const colors = histStatusBadgeColors(tone);
                    const isCancelled = String(order?.orderStatus || order?.order_status || '').toUpperCase() === 'CANCELLED' || String(order?.orderStatus || order?.order_status || '').toUpperCase() === 'VOID';

                    return (
                      <HistRow key={renderKey}>
                        <td>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <HistOrderLink onClick={async () => {
                              try {
                                const full = await loadFullOrder(order.id);
                                setViewingDoc({ order: full || order, type: 'order' });
                              } catch {
                                setViewingDoc({ order, type: 'order' });
                              }
                            }}>
                              {order.orderNo || order.order_no || `#${String(order.id).slice(0, 8)}`}
                            </HistOrderLink>
                            {Boolean(order.dailyBillNo && (order.orderNo || order.order_no) && String(order.dailyBillNo) !== String(order.orderNo || order.order_no)) && (
                              <span style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: '#64748b',
                                background: '#f1f5f9',
                                border: '1px solid #e2e8f0',
                                padding: '1px 5px',
                                borderRadius: 4,
                                letterSpacing: '0.02em',
                              }} title="Daily Bill / Token Sequence">
                                #{order.dailyBillNo}
                              </span>
                            )}
                          </div>
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
                            {!isCancelled && (
                              <>
                                <HistActionBtn type="button" onClick={() => handlePrintBill(order)} title="Print Bill">
                                  <FaPrint style={{ fontSize: 10, color: '#f97316' }} /> Print
                                </HistActionBtn>

                                <HistActionBtn
                                  type="button"
                                  $tone="orange"
                                  title="Download PDF Invoice"
                                  onClick={async () => {
                                    try {
                                      const full = await loadFullOrder(order.id);
                                      await downloadInvoicePdf(full || order);
                                    } catch (err) {
                                      notify('error', 'Failed to generate invoice: ' + (err.message || 'Unknown error'));
                                    }
                                  }}
                                >
                                  <FaFileInvoice style={{ fontSize: 10 }} /> Invoice
                                </HistActionBtn>

                                <HistActionBtn type="button" onClick={() => setEditingOrder(order)} title="Edit Order">
                                  <FaEdit style={{ fontSize: 10, color: '#475569' }} /> Edit
                                </HistActionBtn>

                                {canCancelOrder && (
                                  <HistActionBtn
                                    type="button"
                                    $tone="red"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCancelReason('');
                                      setCancelOrder(order);
                                    }}
                                    title="Cancel Order"
                                  >
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
          )}

          {/* Proper Pagination of 20 orders at a time (Completed & Cancelled history tabs) */}
          {isHistoryTab && historyPage.totalElements > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderTop: '1px solid #f1f5f9',
              background: '#ffffff',
              flexWrap: 'wrap',
              gap: 12,
            }}>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
                Showing <strong>{historyPage.number * 20 + 1}</strong>–<strong>{Math.min((historyPage.number + 1) * 20, historyPage.totalElements)}</strong> of <strong>{historyPage.totalElements}</strong> orders
              </span>

              <HistPager style={{ margin: 0 }}>
                <HistPagerBtn
                  disabled={historyLoading || historyPage.number <= 0}
                  onClick={() => fetchHistoryOrders(Math.max(0, historyPage.number - 1))}
                  title="Previous page (20 orders)"
                >
                  Previous
                </HistPagerBtn>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', padding: '0 4px' }}>
                  Page {historyPage.totalPages ? historyPage.number + 1 : 0} of {historyPage.totalPages}
                </span>
                <HistPagerBtn
                  disabled={historyLoading || !historyPage.totalPages || historyPage.number >= historyPage.totalPages - 1}
                  onClick={() => fetchHistoryOrders(historyPage.number + 1)}
                  title="Next page (20 orders)"
                >
                  Next
                </HistPagerBtn>
              </HistPager>
            </div>
          )}

        </HistoryShell>

        {/* Document Viewer Popup */}
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
            onOrderUpdated={() => {
              fetchHistoryOrders(historyPage.number || 0);
            }}
          />
        )}

        {/* Cancellation Confirmation Modal */}
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

        {/* Kot / Bill Thermal Print */}
        {printOrder && (
          <KotPrint
            order={printOrder}
            kind={printKind}
            autoPrint={true}
            onClose={() => setPrintOrder(null)}
          />
        )}

      </PageContainer>
    </DashboardLayout>
  );
}
