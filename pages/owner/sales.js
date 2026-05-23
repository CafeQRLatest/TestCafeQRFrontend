import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import styled, { keyframes } from 'styled-components';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { formatTzDate, getBusinessNow } from '../../utils/timezoneUtils';
import DashboardLayout from '../../components/DashboardLayout';
import {
  FaUtensils, FaShoppingBag, FaHistory, FaTh, FaList, FaCashRegister,
  FaReceipt, FaPrint, FaSync, FaFire, FaWallet, FaCheck, FaExclamationCircle,
  FaKeyboard, FaSearch
} from 'react-icons/fa';
import { PageContainer, POSHeader, HeaderTitle, ModeSwitchGroup, ModeSwitchBtn } from '../../components/PremiumPOSUI';
import CounterSale from '../../components/CounterSale';
import KotPrint from '../../components/KotPrint';
import CloudPrintStation from '../../components/CloudPrintStation';
import TablePopover from '../../components/TablePopover';
import PaymentDialog from '../../components/PaymentDialog';
import EditOrderPanel from '../../components/EditOrderPanel';
import { toDisplayItems } from '../../utils/printUtils';
import { isKnownOffline } from '../../utils/networkState';
import { publishAccountingDataChanged } from '../../utils/accountingRealtime';
import { getQueuedOfflineOrders, getRecentPrintJobs } from '../../utils/offlineStore';
import { enqueueCloudPrintJob, fetchCloudPrintJobs, isPrintStationEnabled, markCloudPrintJobPrinted } from '../../utils/cloudPrintStation';
import { ensureOfflineSequenceLeases, isMainOfflineBillingDevice } from '../../utils/offlineSequences';

const TABLE_STATUS_META = {
  AVAILABLE: { label: 'AVAILABLE', bg: '#ffffff', fg: '#0f172a', border: '#e2e8f0', soft: '#f8fafc', accent: '#64748b' },
  OCCUPIED: { label: 'OCCUPIED', bg: '#ef4444', fg: '#ffffff', border: '#dc2626', soft: 'rgba(255,255,255,0.18)', accent: '#ffffff' },
  BILLED: { label: 'BILLED', bg: '#10b981', fg: '#ffffff', border: '#059669', soft: 'rgba(255,255,255,0.18)', accent: '#ffffff' },
  RESERVED: { label: 'RESERVED', bg: '#3b82f6', fg: '#ffffff', border: '#2563eb', soft: 'rgba(255,255,255,0.18)', accent: '#ffffff' },
  CLEANING: { label: 'CLEANING', bg: '#f59e0b', fg: '#111827', border: '#d97706', soft: 'rgba(255,255,255,0.24)', accent: '#111827' },
  MAINTENANCE: { label: 'HOLD', bg: '#64748b', fg: '#ffffff', border: '#475569', soft: 'rgba(255,255,255,0.18)', accent: '#ffffff' },
};

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

  @media (max-width: 780px) {
    width: 100%;
    justify-content: flex-start;
  }
`;

const SalesHeader = styled(POSHeader)`
  gap: 16px;
  flex-wrap: wrap;

  @media (max-width: 780px) {
    align-items: flex-start;
    padding: 14px 16px;
    margin-bottom: 18px;
  }
`;

const SalesHeaderTitle = styled(HeaderTitle)`
  min-width: 0;

  @media (max-width: 520px) {
    width: 100%;
    font-size: 20px;
  }
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
    padding: 0 16px;
    margin-bottom: 18px;
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

  @media (max-width: 520px) {
    width: 100%;
    gap: 8px;
  }
`;

const StatPill = styled.div`
  padding: 8px 14px;
  background: ${props => props.$bg || (props.$tone === 'green' ? '#f0fdf4' : props.$tone === 'orange' ? '#fff7ed' : '#f1f5f9')};
  border-radius: 12px;
  font-size: 13px;
  font-weight: 800;
  color: ${props => props.$color || (props.$tone === 'green' ? '#16a34a' : props.$tone === 'orange' ? '#ea580c' : '#475569')};

  @media (max-width: 520px) {
    flex: 1 1 140px;
    text-align: center;
  }
`;

const LegendRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 0 24px 20px;

  @media (max-width: 720px) {
    padding: 0 16px 16px;
  }
`;

const LegendItem = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
`;

const LegendDot = styled.span`
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: ${props => props.$color};
  border: 1px solid ${props => props.$border || props.$color};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
  padding: 0 24px 24px;

  @media (max-width: 720px) {
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 12px;
    padding: 0 16px 90px;
  }

  @media (max-width: 380px) {
    grid-template-columns: 1fr;
  }
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 24px 24px;

  @media (max-width: 720px) {
    padding: 0 16px 90px;
  }
`;

const TableCard = styled.button`
  background: ${props => tableStatusMeta(props.$status).bg};
  color: ${props => tableStatusMeta(props.$status).fg};
  border-radius: 24px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid ${props => tableStatusMeta(props.$status).border};
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  text-align: center;
  font: inherit;
  min-width: 0;

  &:hover {
    transform: translateY(-6px);
    box-shadow: 0 18px 24px -12px rgba(15, 23, 42, 0.18);
    border-color: ${props => normalizeTableStatus(props.$status) === 'AVAILABLE' ? '#94a3b8' : tableStatusMeta(props.$status).border};
  }

  @media (max-width: 720px) {
    border-radius: 18px;
    padding: 18px 14px;
    gap: 12px;

    &:hover {
      transform: none;
    }
  }
`;

const TableRow = styled(TableCard)`
  width: 100%;
  flex-direction: row;
  justify-content: space-between;
  text-align: left;
  padding: 18px 20px;

  @media (max-width: 520px) {
    align-items: flex-start;
    flex-wrap: wrap;
  }
`;

const TableIcon = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: ${props => tableStatusMeta(props.$status).soft};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${props => tableStatusMeta(props.$status).accent};
  font-size: 26px;
  font-weight: 900;
  flex: 0 0 auto;

  @media (max-width: 520px) {
    width: 52px;
    height: 52px;
    border-radius: 16px;
    font-size: 22px;
  }
`;

const StatusPill = styled.div`
  padding: 6px 14px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: ${props => normalizeTableStatus(props.$status) === 'AVAILABLE' ? '#f1f5f9' : 'rgba(255,255,255,0.2)'};
  color: ${props => normalizeTableStatus(props.$status) === 'AVAILABLE' ? '#475569' : tableStatusMeta(props.$status).fg};
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
  color: inherit;
  overflow-wrap: anywhere;
`;

const TableCapacity = styled.div`
  font-size: 13px;
  color: inherit;
  opacity: 0.75;
  font-weight: 600;
`;

const ActiveOrderHint = styled.div`
  font-size: 12px;
  font-weight: 800;
  color: inherit;
  background: rgba(255,255,255,0.24);
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
    right: 16px;
    bottom: 16px;
    padding: 14px 20px;
    border-radius: 18px;
  }

  @media (max-width: 420px) {
    left: 16px;
    right: 16px;
    justify-content: center;
  }
`;

const HistoryShell = styled.section`
  padding: 0 24px 96px;
  animation: ${fadeIn} 0.25s ease-out;

  @media (max-width: 720px) {
    padding: 0 16px 96px;
  }
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
    padding: 14px;
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

const HistoryControls = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;

  @media (max-width: 720px) {
    width: 100%;
    justify-content: flex-start;
  }
`;

const HistoryField = styled.label`
  display: grid;
  gap: 5px;
  flex: ${props => props.$wide ? '1 1 300px' : '0 0 auto'};
  min-width: ${props => props.$wide ? '260px' : '0'};
  color: #64748b;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;

  input {
    width: 100%;
    min-height: 42px;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 0 10px;
    color: #0f172a;
    font-size: 12px;
    font-weight: 800;
  }

  @media (max-width: 520px) {
    width: 100%;
  }
`;

const HistorySearchInput = styled.div`
  position: relative;

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
    padding-left: 34px;
  }
`;

const HistoryActionButton = styled.button`
  min-height: 42px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: ${props => props.$primary ? '#f97316' : '#f8fafc'};
  color: ${props => props.$primary ? 'white' : '#475569'};
  padding: 0 14px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: wait;
  }
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

const HistoryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
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
  min-width: 0;
`;

const OrderTop = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;

  @media (max-width: 420px) {
    flex-direction: column;
  }
`;

const OrderNo = styled.div`
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  font-weight: 900;
  color: #0f172a;
  overflow-wrap: anywhere;
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

  @media (max-width: 420px) {
    text-align: left;
  }
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

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
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
    overflow-wrap: anywhere;
  }
`;

const OrderActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
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

  @media (max-width: 520px) {
    width: calc(100% - 32px);
    justify-content: center;
    text-align: center;
  }
`;

const money = (value, symbol = '₹') => `${symbol}${Number(value || 0).toFixed(2)}`;

function orderTotal(order) {
  return Number(order?.grandTotal ?? order?.grand_total ?? order?.totalAmount ?? order?.total_amount ?? 0);
}

function isAllBranchesScope(orgId) {
  const value = String(orgId || '').trim();
  return !value || value === '0';
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
  };
}

function localInputToIso(value) {
  if (!value) return undefined;
  const date = new Date(`${value}:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
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

export default function Sales() {
  return <SalesContent />;
}

function SalesContent() {
  const { timezone, orgId } = useAuth();
  const [tables, setTables] = useState([]);
  const [floorOrders, setFloorOrders] = useState([]);
  const [historyOrders, setHistoryOrders] = useState([]);
  const [historyPage, setHistoryPage] = useState({ number: 0, size: 20, totalPages: 0, totalElements: 0 });
  const [historyFilters, setHistoryFilters] = useState(() => defaultHistoryRange(timezone));
  const [queuedOrders, setQueuedOrders] = useState([]);
  const [printJobsByOrder, setPrintJobsByOrder] = useState({});
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [popoverTable, setPopoverTable] = useState(null);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [actionBusy, setActionBusy] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const [activeView, setActiveView] = useState('tables');
  const [billingUi, setBillingUi] = useState('standard');
  const [printOrder, setPrintOrder] = useState(null);
  const [printKind, setPrintKind] = useState('bill');
  const [toast, setToast] = useState(null);
  const tablesInFlightRef = useRef(false);
  const ordersInFlightRef = useRef(false);
  const historyInFlightRef = useRef(false);
  const historyFiltersTouchedRef = useRef(false);
  const historyOrgScopeRef = useRef(orgId);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    if (historyFiltersTouchedRef.current) return;
    setHistoryFilters(defaultHistoryRange(timezone));
  }, [timezone]);

  const loadOfflineOrderState = useCallback(async () => {
    try {
      const [queued, jobs, cloudJobs] = await Promise.all([
        getQueuedOfflineOrders(),
        getRecentPrintJobs(300),
        isKnownOffline() ? Promise.resolve([]) : fetchCloudPrintJobs().catch(() => []),
      ]);
      setQueuedOrders(queued);
      setPrintJobsByOrder(buildPrintJobMap([...(jobs || []), ...(cloudJobs || [])]));
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
    try {
      const res = await api.get('/api/v1/orders/sales/live');
      setFloorOrders(res.data.data || []);
    } catch (e) {
      if (e?.code === 'OFFLINE_CACHE_MISS') {
        showToast('Open order history once online to prepare offline data.', 'error');
      } else if (!isKnownOffline() && e?.message !== 'Network Error') {
        console.error('Failed to fetch live sale orders', e);
        showToast('Failed to load active orders', 'error');
      }
    } finally {
      await loadOfflineOrderState();
      ordersInFlightRef.current = false;
    }
  }, [loadOfflineOrderState, showToast]);

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
      setHistoryPage({
        number: payload.number || 0,
        size: payload.size || historyPage.size || 20,
        totalPages: payload.totalPages || 0,
        totalElements: payload.totalElements || 0,
      });
    } catch (e) {
      if (e?.code === 'OFFLINE_CACHE_MISS') {
        showToast('Open order history once online to prepare offline data.', 'error');
      } else if (!isKnownOffline() && e?.message !== 'Network Error') {
        console.error('Failed to fetch order history', e);
        showToast(e?.response?.data?.message || 'Failed to load order history', 'error');
      }
    } finally {
      historyInFlightRef.current = false;
      setOrdersLoading(false);
    }
  }, [historyFilters, historyPage.size, showToast]);

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
    setLoading(true);
    setOrdersLoading(false);
  }, [orgId]);

  useEffect(() => {
    const previousOrgId = historyOrgScopeRef.current;
    historyOrgScopeRef.current = orgId;
    if (previousOrgId === orgId || activeView !== 'history') return;
    fetchHistoryOrders(0);
  }, [activeView, fetchHistoryOrders, orgId]);

  useEffect(() => {
    fetchTables();
    fetchOrders();
    loadOfflineOrderState();

    let intervalId = null;
    let refreshTimerId = null;

    const startPolling = () => {
      if (intervalId || isKnownOffline()) return;
      intervalId = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
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
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
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

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runRefresh();
      }
    };

    startPolling();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('cafeqr-network-state', handleNetworkState);
    window.addEventListener('cafeqr-sync-queue-changed', handleQueueChanged);
    window.addEventListener('cafeqr-print-jobs-changed', handleQueueChanged);
    window.addEventListener('cafeqr-sync-complete', runRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      if (refreshTimerId) window.clearTimeout(refreshTimerId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('cafeqr-network-state', handleNetworkState);
      window.removeEventListener('cafeqr-sync-queue-changed', handleQueueChanged);
      window.removeEventListener('cafeqr-print-jobs-changed', handleQueueChanged);
      window.removeEventListener('cafeqr-sync-complete', runRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchTables, fetchOrders, loadOfflineOrderState, orgId]);

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

  const tableStatusCounts = useMemo(() => (
    tables.reduce((counts, table) => {
      const status = resolveTableOrderState(table, getActiveOrderForTable(table)).status;
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {})
  ), [getActiveOrderForTable, tables]);

  const floorDisplayOrders = useMemo(() => {
    return mergeOrdersWithQueued(floorOrders, queuedOrders)
      .map((order) => attachPrintJobs(order, printJobsByOrder));
  }, [floorOrders, queuedOrders, printJobsByOrder]);

  const historyQueuedOrders = useMemo(() => (
    queuedOrders.filter((order) => matchesSelectedBranch(order, orgId))
  ), [orgId, queuedOrders]);

  const historyDisplayOrders = useMemo(() => {
    return mergeOrdersWithQueued(historyOrders, historyQueuedOrders)
      .map((order) => attachPrintJobs(order, printJobsByOrder));
  }, [historyOrders, historyQueuedOrders, printJobsByOrder]);

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

  const handleOrderCreated = useCallback((order, kind) => {
    setFloorOrders((current) => {
      const orderId = order?.id || order?.offlineOperationId || order?.orderNo;
      const filtered = current.filter((item) => {
        const itemId = item?.id || item?.offlineOperationId || item?.orderNo;
        return itemId !== orderId;
      });
      return [order, ...filtered];
    });

    if (order?.offline) {
      if (isMainOfflineBillingDevice()) {
        setPrintOrder(order);
        // If it's a final offline sale, treat as bill so it prints locally.
        setPrintKind(kind === 'settle' ? 'bill' : kind);
      }
      setQueuedOrders((current) => mergeOrdersWithQueued(current, [order]));
      loadOfflineOrderState();
      showToast(
        isMainOfflineBillingDevice()
          ? 'Offline final sale saved on this main device and sent to printer.'
          : 'Offline sale queued as provisional. It will sync when internet returns.'
      );
      return;
    }

    if (kind === 'settle') {
      setPaymentOrder(order);
      return; // PaymentDialog will handle the rest
    }

    // Online order: if this device is a print station, print immediately locally
    if (isPrintStationEnabled()) {
      setPrintOrder(order);
      setPrintKind(kind);
      showToast(kind === 'kot' ? 'KOT created — printing now...' : 'Bill created — printing now...');
    } else {
      showToast(
        kind === 'kot'
          ? 'KOT created. Main print station will print when online.'

          : 'Bill created. Main print station will print when online.'
      );
    }

    if (kind === 'bill' || hasAccountingImpact(order)) {
      publishAccountingRefresh('order-created', order);
    }

    if (!isKnownOffline()) {
      fetchOrders();
      fetchTables();
      loadOfflineOrderState();
    }
  }, [fetchOrders, fetchTables, hasAccountingImpact, loadOfflineOrderState, publishAccountingRefresh, showToast]);

  const handleCounterSale = () => {
    if (!orgId) {
      showToast('Select a branch before creating a counter sale.', 'error');
      return;
    }
    setSelectedTable({ tableNumber: 'COUNTER', id: null });
  };

  const refreshSalesState = useCallback(() => {
    fetchOrders();
    fetchTables();
    if (activeView === 'history') {
      fetchHistoryOrders(historyPage.number || 0);
    }
    loadOfflineOrderState();
  }, [activeView, fetchHistoryOrders, fetchOrders, fetchTables, historyPage.number, loadOfflineOrderState]);

  const loadFullOrder = async (orderId) => {
    const { data } = await api.get(`/api/v1/orders/${orderId}`);
    return data.data;
  };

  const handlePrintOrder = async (order, kind) => {
    try {
      if (order?.offline) {
        if (isMainOfflineBillingDevice()) {
          setPrintOrder(order);
          setPrintKind(kind);
          showToast(kind === 'kot' ? 'Offline KOT sent to printer' : 'Offline bill sent to printer');
        } else {
          showToast('This is a provisional offline order. Print from the main device after sync.', 'error');
        }
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
      const { data } = await api.post(`/api/v1/orders/${order.id}/bill`);
      const billedOrder = data.data || order;
      setFloorOrders((current) => current.map((item) => item.id === billedOrder.id ? { ...item, ...billedOrder } : item));
      showToast('Bill generated for the table');
      setPopoverTable(null);
      publishAccountingRefresh('order-billed', billedOrder);
      await handlePrintOrder(billedOrder, 'bill');
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
    setPaymentOrder(order);
    setPopoverTable(null);
  };

  const handleConfirmPayment = async (payload) => {
    if (!paymentOrder) return;
    setActionBusy('settle');
    try {
      const { data } = await api.post(`/api/v1/orders/${paymentOrder.id}/settle`, payload);
      const settledOrder = data.data || paymentOrder;
      // Immediately update local state so table reverts to AVAILABLE
      setFloorOrders((current) => current.map((item) =>
        item.id === settledOrder.id ? { ...item, ...settledOrder } : item
      ));
      showToast('Order settled successfully');
      setPaymentOrder(null);
      publishAccountingRefresh('order-settled', settledOrder);
      await handlePrintOrder(settledOrder, 'bill');
      refreshSalesState();
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
    setEditSaving(true);
    try {
      const { data } = await api.put(`/api/v1/orders/${editingOrder.id}`, payload);
      const savedOrder = data.data || payload;
      setFloorOrders((current) => [savedOrder, ...current.filter((order) => order.id !== editingOrder.id)]);
      showToast('Order updated');
      setEditingOrder(null);
      if (hasAccountingImpact(savedOrder)) {
        publishAccountingRefresh('order-updated', savedOrder);
      }
      refreshSalesState();
    } catch (e) {
      console.error('Failed to update order', e);
      showToast('Failed to update order', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  const handleEditTableSettings = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/owner/table-management';
    }
  };

  const renderTable = (table, asRow = false) => {
    const activeOrder = getActiveOrderForTable(table);
    const tableState = resolveTableOrderState(table, activeOrder);
    const displayStatus = tableState.status;
    const Card = asRow ? TableRow : TableCard;
    return (
      <Card key={table.id} $status={displayStatus} onClick={() => setPopoverTable(table)}>
        <TableIcon $status={displayStatus}>{table.tableNumber}</TableIcon>
        <TableMeta>
          <TableNumber>Table {table.tableNumber}</TableNumber>
          <TableCapacity>{table.seatingCapacity} Seats • {table.section || 'Indoor'}</TableCapacity>
          {activeOrder && <ActiveOrderHint>{statusText(activeOrder)} • {money(orderTotal(activeOrder))}</ActiveOrderHint>}
        </TableMeta>
        <StatusPill $status={displayStatus}>{tableState.label}</StatusPill>
      </Card>
    );
  };

  return (
    <DashboardLayout title="Sales">
      <PageContainer>
        <SalesHeader>
          <SalesHeaderTitle>
            <FaCashRegister color="#ea580c" /> POS Terminal
          </SalesHeaderTitle>
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
              <ModeSwitchBtn $active={activeView === 'history'} onClick={() => { setActiveView('history'); fetchHistoryOrders(0); }}>
                <FaHistory /> Order History
              </ModeSwitchBtn>
            </ModeSwitchGroup>
          </HeaderActions>
        </SalesHeader>

        {activeView === 'tables' ? (
          <>
            <SectionHeader>
              <SectionTitle>
                <FaUtensils color="#94a3b8" /> Table Management
              </SectionTitle>
              <StatsRow>
                <StatPill $bg="#fee2e2" $color="#dc2626">Occupied: {tableStatusCounts.OCCUPIED || 0}</StatPill>
                <StatPill $bg="#dbeafe" $color="#2563eb">Reserved: {tableStatusCounts.RESERVED || 0}</StatPill>
                <StatPill $bg="#e2e8f0" $color="#475569">Hold: {tableStatusCounts.MAINTENANCE || 0}</StatPill>
                <StatPill $bg="#dcfce7" $color="#059669">Billed: {tableStatusCounts.BILLED || 0}</StatPill>
                <StatPill>Available: {tableStatusCounts.AVAILABLE || 0}</StatPill>
                <StatPill>Open Orders: {floorDisplayOrders.filter(isOpenOrder).length}</StatPill>
              </StatsRow>
            </SectionHeader>

            <LegendRow>
              {Object.entries(TABLE_STATUS_META).map(([status, meta]) => (
                <LegendItem key={status}>
                  <LegendDot $color={meta.bg} $border={meta.border} />
                  {meta.label.charAt(0) + meta.label.slice(1).toLowerCase()}
                </LegendItem>
              ))}
            </LegendRow>

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
            orders={historyDisplayOrders}
            page={historyPage}
            filters={historyFilters}
            loading={ordersLoading}
            timezone={timezone}
            onRefresh={() => fetchHistoryOrders(historyPage.number || 0)}
            onPageChange={(page) => fetchHistoryOrders(page)}
            onFilterChange={(nextFilters) => {
              historyFiltersTouchedRef.current = true;
              setHistoryFilters(nextFilters);
            }}
            onApplyFilters={() => fetchHistoryOrders(0)}
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

        {popoverTable && (
          <TablePopover
            table={popoverTable}
            order={popoverOrder}
            availableTables={availableMoveTables}
            canStartOrder={popoverTableState.canStartOrder}
            blockedMessage={popoverTableState.blockedMessage}
            busy={Boolean(actionBusy)}
            onClose={() => setPopoverTable(null)}
            onStartOrder={handleOpenTableOrder}
            onBill={handleBillOrder}
            onKot={handleKotOrder}
            onEdit={handleEditOrder}
            onCancel={handleCancelOrder}
            onPay={handleSettleOrder}
            onMove={handleMoveOrder}
            onEditTable={handleEditTableSettings}
          />
        )}

        {paymentOrder && (
          <PaymentDialog
            order={paymentOrder}
            loading={actionBusy === 'settle'}
            onClose={() => setPaymentOrder(null)}
            onConfirm={handleConfirmPayment}
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
  onRefresh,
  onPageChange,
  onFilterChange,
  onApplyFilters,
  onPrint,
  onSettle,
}) {
  const pageNumber = page?.number || 0;
  const totalPages = page?.totalPages || 0;
  const totalElements = page?.totalElements ?? orders.length;

  return (
    <HistoryShell>
      <HistoryToolbar>
        <HistoryTitle>
          <strong>Order History</strong>
          <span>{totalElements} sale order{totalElements === 1 ? '' : 's'} in the selected range</span>
        </HistoryTitle>
        <HistoryControls>
          <HistoryField $wide>
            Search
            <HistorySearchInput>
              <FaSearch />
              <input
                type="search"
                value={filters.q || ''}
                placeholder="Search order, invoice, payment, customer, phone, table"
                onChange={(event) => onFilterChange({ ...filters, q: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onApplyFilters();
                  }
                }}
              />
            </HistorySearchInput>
          </HistoryField>
          <HistoryField>
            From
            <input
              type="datetime-local"
              value={filters.from}
              onChange={(event) => onFilterChange({ ...filters, from: event.target.value })}
            />
          </HistoryField>
          <HistoryField>
            To
            <input
              type="datetime-local"
              value={filters.to}
              onChange={(event) => onFilterChange({ ...filters, to: event.target.value })}
            />
          </HistoryField>
          <HistoryActionButton type="button" $primary onClick={onApplyFilters} disabled={loading}>
            Apply
          </HistoryActionButton>
          <RefreshButton onClick={onRefresh} disabled={loading} title="Refresh orders">
            <FaSync className={loading ? 'spin' : ''} />
          </RefreshButton>
        </HistoryControls>
      </HistoryToolbar>

      {orders.length === 0 ? (
        <EmptyState>
          <FaReceipt />
          <strong>{filters.q?.trim() ? 'No matching orders' : 'No orders yet'}</strong>
          <span>{filters.q?.trim() ? 'Try another search or widen the date range.' : 'New KOT and settled sales will appear here immediately.'}</span>
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
            const kotPrintWaiting = ['PENDING', 'CLAIMED', 'RETRY'].includes(order.printJobs?.kot?.status);
            const billPrintWaiting = ['PENDING', 'CLAIMED', 'RETRY'].includes(order.printJobs?.bill?.status);
            return (
              <OrderCard key={renderKey} $tone={orderStatusTone(order)}>
                <OrderTop>
                  <div>
                    <OrderNo>{order.orderNo || order.order_no || `#${String(order.id).slice(0, 8)}`}</OrderNo>
                    <OrderSub>{formatTzDate(date, timezone, { format: 'short' })}</OrderSub>
                  </div>
                  <OrderAmount>{money(orderTotal(order))}</OrderAmount>
                </OrderTop>

                {(order.offline || order.syncStatus === 'CONFLICT' || kotPrintFailed || billPrintFailed || kotPrintWaiting || billPrintWaiting) && (
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
                    {kotPrintWaiting && (
                      <OrderBadge>KOT waiting for printer</OrderBadge>
                    )}
                    {billPrintWaiting && (
                      <OrderBadge>Bill waiting for printer</OrderBadge>
                    )}
                  </OrderBadges>
                )}

                <OrderInfo>
                  <InfoPill>
                    <span>Status</span>
                    <strong>{statusText(order)}</strong>
                  </InfoPill>
                  <InfoPill>
                    <span>Customer</span>
                    <strong>{customerLabel(order)}</strong>
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
                  <InfoPill>
                    <span>Method</span>
                    <strong>{paymentMethodLabel(order)}</strong>
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
