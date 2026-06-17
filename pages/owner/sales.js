import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import styled, { keyframes } from 'styled-components';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { formatTzDate, getBusinessNow } from '../../utils/timezoneUtils';
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
import { isNativePrintServicePaired } from '../../utils/printServiceClient';
import { ensureOfflineSequenceLeases, isMainOfflineBillingDevice } from '../../utils/offlineSequences';
import DocumentViewerPopup from '../../components/purchasing/DocumentViewerPopup';

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
  return isPrintStationEnabled() || isNativePrintServicePaired();
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

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

// Inline native spinner handles hydration phase beautifully



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

    &:hover {
      border-color: #f97316;
    }

    &:focus {
      border-color: #ea580c;
      box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.08), 0 2px 6px rgba(0,0,0,0.02);
    }
  }
`;

const TopNewOrderBtn = styled.button`
  height: 38px;
  padding: 0 20px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
  color: white;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(234, 88, 12, 0.25);
  transition: all 0.25s;
  white-space: nowrap;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(234, 88, 12, 0.35);
  }

  &:active {
    transform: translateY(0);
  }
`;

const HistoryToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  background: white;
  border: 1px solid #e2e8f0;
  border-top: 3px solid #f97316;
  border-radius: 12px;
  padding: 6px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);

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

  /* Dates sub-container */
  .hist-dates {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;

    .premium-dt-picker {
      width: 220px !important;
    }
  }

  .h-filter-sep {
    font-size: 11px;
    font-weight: 800;
    color: #cbd5e1;
    margin: 0 2px;
  }

  /* Style triggers inside dates and nice-selects */
  .dt-trigger,
  .nice-select-trigger {
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

  .dt-trigger:hover,
  .nice-select-trigger:hover {
    border-color: #f97316 !important;
    background: #fff7ed !important;
  }

  .dt-trigger.active,
  .dt-trigger:focus,
  .nice-select-trigger.open,
  .nice-select-trigger:focus {
    border-color: #ea580c !important;
    background: white !important;
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.08) !important;
  }

  /* Force nice select specific constraints */
  .nice-select,
  .nice-select-wrapper {
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

      .premium-dt-picker {
        flex: 1;
        width: auto !important;
      }
    }

    .nice-select,
    .nice-select-wrapper {
      width: 100% !important;
      max-width: none !important;
    }
  }
`;

const HistoryShell = styled.section`
  padding: 0 24px 96px;
  animation: ${fadeIn} 0.25s ease-out;

  @media (max-width: 720px) {
    padding: 0 16px 96px;
  }
`;

const HistoryTitle = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;

  strong {
    color: #0f172a;
    font-size: 16px;
    font-weight: 900;
  }

  span {
    color: #64748b;
    font-size: 11px;
    font-weight: 700;
  }
`;

const RefreshButton = styled.button`
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #475569;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    border-color: #f97316;
    background: #fff7ed;
    color: #f97316;
  }

  &:disabled {
    opacity: 0.6;
    cursor: wait;
  }
`;

const HistoryControls = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;

  @media (max-width: 720px) {
    width: 100%;
    justify-content: flex-start;
  }
`;

const HistoryField = styled.label`
  display: grid;
  gap: 4px;
  flex: ${props => props.$wide ? '1 1 240px' : '0 0 auto'};
  min-width: ${props => props.$wide ? '200px' : '0'};
  color: #64748b;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;

  input {
    width: 100%;
    height: 30px;
    min-height: 30px;
    border: 1.5px solid #e2e8f0;
    border-radius: 12px;
    padding: 0 10px;
    color: #1e293b;
    font-size: 11px;
    font-weight: 700;
    background: #f8fafc;
    transition: all 0.15s ease;

    &:hover {
      border-color: #f97316;
      background: #fff7ed;
    }

    &:focus {
      outline: none;
      border-color: #ea580c;
      background: white;
      box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.08);
    }
  }

  .premium-dt-picker {
    width: 220px !important;
  }

  .premium-dt-picker .dt-trigger {
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
    width: 100%;
  }

  .premium-dt-picker .dt-trigger:hover {
    border-color: #f97316 !important;
    background: #fff7ed !important;
  }

  .premium-dt-picker .dt-trigger.active,
  .premium-dt-picker .dt-trigger:focus-within {
    border-color: #ea580c !important;
    background: #fff !important;
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.08) !important;
  }

  .premium-dt-picker .dt-input {
    font-size: 11px !important;
    font-weight: 700 !important;
    color: #1e293b !important;
  }

  @media (max-width: 520px) {
    width: 100%;
  }
`;

const HistorySearchInput = styled.div`
  position: relative;

  svg {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
    font-size: 11px;
    pointer-events: none;
  }

  input {
    padding-left: 28px !important;
  }
`;

const HistoryActionButton = styled.button`
  height: 30px;
  min-height: 30px;
  border-radius: 12px;
  border: none;
  background: ${props => props.$primary ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' : '#f1f5f9'};
  color: ${props => props.$primary ? 'white' : '#475569'};
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  padding: 0 16px;
  transition: all 0.25s;
  box-shadow: ${props => props.$primary ? '0 4px 10px rgba(234, 88, 12, 0.2)' : 'none'};

  &:hover {
    transform: translateY(-1px);
    box-shadow: ${props => props.$primary ? '0 6px 14px rgba(234, 88, 12, 0.3)' : 'none'};
  }

  &:active {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.6;
    cursor: wait;
    transform: none;
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

const HistTableWrap = styled.div`
  width: 100%;
  background: #fff;
  border-radius: 20px;
  border: 1px solid #f1f5f9;
  overflow-x: auto;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04);
  margin-top: 8px;
  margin-bottom: 24px;
`;

const HistTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 960px;
  text-align: left;
  font-family: inherit;

  thead {
    background: linear-gradient(180deg, #f8fafc, #f1f5f9);
  }

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
    border-left-color: #f97316;
    td {
      background: #fafbff;
    }
  }
`;

const OrderNoLink = styled.code`
  font-family: monospace;
  font-size: 12px;
  font-weight: 800;
  color: #FF7A00;
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
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: ${props => props.$tone === 'green' ? '#15803d' : props.$tone === 'blue' ? '#0369a1' : '#ea580c'};
  background: ${props => props.$tone === 'green' ? '#f0fdf4' : props.$tone === 'blue' ? '#f0f9ff' : '#fff7ed'};
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.$tone === 'green' ? '#dcfce7' : props.$tone === 'blue' ? '#e0f2fe' : '#ffedd5'};
  }

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

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));

  @media (max-width: 600px) {
    align-items: flex-end;
    padding: 0;
  }
`;

const ModalContent = styled.div`
  background: white;
  padding: 24px;
  border-radius: 16px;
  max-width: 420px;
  width: 90%;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #0f172a;

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
    color: #0f172a;
  }

  p {
    color: #334155;
  }

  textarea {
    width: 100%;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid #cbd5e1;
    font-family: inherit;
    font-size: 13px;
    resize: none;
    box-sizing: border-box;
    color: #0f172a;
    background-color: #ffffff;

    &:focus {
      outline: none;
      border-color: #3b82f6;
    }
  }
`;

const ActionBtn = styled.button`
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 800;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-family: 'Outfit', sans-serif;
  border: none;
  outline: none;

  background: ${props => {
    if (props.$variant === 'success') return 'linear-gradient(135deg, #10b981, #059669)';
    if (props.$variant === 'danger') return 'linear-gradient(135deg, #ef4444, #dc2626)';
    if (props.$variant === 'warning') return 'linear-gradient(135deg, #f59e0b, #d97706)';
    if (props.$variant === 'info') return 'linear-gradient(135deg, #06b6d4, #0891b2)';
    return '#ffffff';
  }};

  color: ${props => {
    if (props.$variant && props.$variant !== 'secondary') return '#ffffff';
    return '#334155';
  }};

  border: ${props => {
    if (props.$variant && props.$variant !== 'secondary') return 'none';
    return '1px solid #e2e8f0';
  }};

  box-shadow: ${props => {
    if (props.$variant === 'success') return '0 2px 8px rgba(16, 185, 129, 0.15)';
    if (props.$variant === 'danger') return '0 2px 8px rgba(239, 68, 68, 0.15)';
    if (props.$variant === 'warning') return '0 2px 8px rgba(245, 158, 11, 0.15)';
    if (props.$variant === 'info') return '0 2px 8px rgba(6, 182, 212, 0.15)';
    return '0 1px 3px rgba(15, 23, 42, 0.02)';
  }};

  &:hover {
    transform: translateY(-1.5px);
    background: ${props => {
      if (props.$variant === 'success') return 'linear-gradient(135deg, #059669, #047857)';
      if (props.$variant === 'danger') return 'linear-gradient(135deg, #dc2626, #b91c1c)';
      if (props.$variant === 'warning') return 'linear-gradient(135deg, #d97706, #b45309)';
      if (props.$variant === 'info') return 'linear-gradient(135deg, #0891b2, #0369a1)';
      return '#f8fafc';
    }};
    border-color: ${props => {
      if (props.$variant && props.$variant !== 'secondary') return 'none';
      return '#cbd5e1';
    }};
    box-shadow: ${props => {
      if (props.$variant === 'success') return '0 4px 12px rgba(16, 185, 129, 0.25)';
      if (props.$variant === 'danger') return '0 4px 12px rgba(239, 68, 68, 0.25)';
      if (props.$variant === 'warning') return '0 4px 12px rgba(245, 158, 11, 0.25)';
      if (props.$variant === 'info') return '0 4px 12px rgba(6, 182, 212, 0.25)';
      return '0 2px 6px rgba(15, 23, 42, 0.05)';
    }};
  }

  &:active {
    transform: scale(0.96) translateY(0);
    box-shadow: ${props => {
      if (props.$variant === 'success') return '0 2px 8px rgba(16, 185, 129, 0.2)';
      if (props.$variant === 'danger') return '0 2px 8px rgba(239, 68, 68, 0.2)';
      if (props.$variant === 'warning') return '0 2px 8px rgba(245, 158, 11, 0.2)';
      if (props.$variant === 'info') return '0 2px 8px rgba(6, 182, 212, 0.2)';
      return '0 1px 3px rgba(15, 23, 42, 0.05)';
    }};
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
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
    status: '',
    terminalId: '',
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

export default function Sales() {
  return <SalesContent />;
}

function SalesContent() {
  const router = useRouter();
  const { timezone, orgId, userRole, switchBranch } = useAuth();
  const [tables, setTables] = useState([]);
  const [floorOrders, setFloorOrders] = useState([]);
  const [historyOrders, setHistoryOrders] = useState([]);
  const [historyPage, setHistoryPage] = useState({ number: 0, size: 20, totalPages: 0, totalElements: 0 });
  const [historyFilters, setHistoryFilters] = useState(() => defaultHistoryRange(timezone));
  const [branches, setBranches] = useState([]);
  const [terminals, setTerminals] = useState([]);

  useEffect(() => {
    if (userRole === 'SUPER_ADMIN') {
      api.get('/api/v1/organizations')
        .then(resp => {
          if (resp.data.success) {
            setBranches(resp.data.data || []);
          }
        })
        .catch(err => console.error("Failed to fetch branches in sales page:", err));
    }
  }, [userRole]);

  useEffect(() => {
    api.get('/api/v1/terminals')
      .then(resp => {
        if (resp.data.success) {
          setTerminals(resp.data.data || []);
        }
      })
      .catch(err => console.error("Failed to fetch terminals in sales page:", err));
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
      const cached = localStorage.getItem('cafeqr_sales_config');
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
  }, []);
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
    } catch (error) {
      if (!isKnownOffline() && error?.message !== 'Network Error') {
        console.warn('Failed to load credit configuration', error?.message || error);
      }
      setCreditCustomers([]);
      setConfig((current) => current || {
        tableManagementEnabled: true,
        defaultBillingUiMode: 'counter',
        creditEnabled: false,
      });
    }
  }, []);

  const handleCreditCustomerCreated = useCallback((customer) => {
    if (!customer?.id) return;
    setCreditCustomers((current) => {
      const next = [customer, ...current.filter((item) => String(item.id) !== String(customer.id))];
      return next.sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
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
          status: filters.status || undefined,
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
    setCreditCustomers([]);
    setOrdersLoading(false);
  }, [orgId]);

  useEffect(() => {
    const previousOrgId = historyOrgScopeRef.current;
    historyOrgScopeRef.current = orgId;
    if (previousOrgId === orgId || activeView !== 'history') return;
    fetchHistoryOrders(0);
  }, [activeView, fetchHistoryOrders, orgId]);

  // ── Browser Back-button interception ──────────────────────────────────────
  // When the user enters billing or order_type, push a dummy history entry so
  // the browser Back button doesn't navigate away from the page. On popstate
  // we handle navigation in-app instead.
  useEffect(() => {
    if (!config?.tableManagementEnabled) return;
    if (activeView === 'billing' || activeView === 'order_type') {
      // Push a sentinel so the browser has something to "go back" to without
      // leaving the sales page.
      window.history.pushState({ cafeqrView: activeView }, '');
    }
  }, [activeView, config?.tableManagementEnabled]);

  useEffect(() => {
    if (!config?.tableManagementEnabled) return;

    const handlePopState = (e) => {
      // If we popped a sentinel state, intercept and handle in-app.
      if (e.state?.cafeqrView) {
        // Re-push so subsequent back presses are also caught.
        window.history.pushState({ cafeqrView: activeView }, '');
      }

      if (activeView === 'billing') {
        if (!isKnownOffline()) {
          fetchTables();
          fetchOrders();
        }
        setSelectedTable(null);
        setPendingOrderType(null);
        setActiveView('order_type');
      } else if (activeView === 'order_type') {
        setActiveView('history');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeView, config?.tableManagementEnabled, fetchOrders, fetchTables]);
  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!historyFiltersTouchedRef.current) return;
    const delayDebounceFn = setTimeout(() => {
      fetchHistoryOrders(0, historyFilters);
    }, 400);

    return () => clearTimeout(delayDebounceFn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyFilters.q, fetchHistoryOrders]);

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
        fetchTables();
        fetchOrders();
        fetchCreditConfig();
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
      fetchCreditConfig();
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
  }, [fetchTables, fetchOrders, fetchCreditConfig, loadOfflineOrderState, orgId]);

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



  const historyQueuedOrders = useMemo(() => (
    queuedOrders.filter((order) => matchesSelectedBranch(order, orgId))
  ), [orgId, queuedOrders]);

  const historyDisplayOrders = useMemo(() => {
    let filtered = mergeOrdersWithQueued(historyOrders, historyQueuedOrders)
      .map((order) => attachPrintJobs(order, printJobsByOrder));

    if (historyFilters.status) {
      filtered = filtered.filter(order => {
        const orderStatus = String(order?.orderStatus || order?.order_status || '').toUpperCase();
        const paymentStatus = String(order?.paymentStatus || order?.payment_status || '').toUpperCase();
        if (historyFilters.status === 'PAID') {
          return paymentStatus === 'PAID';
        }
        return orderStatus === historyFilters.status;
      });
    }

    if (historyFilters.terminalId) {
      filtered = filtered.filter(order => {
        const termId = String(order?.terminalId || order?.terminal_id || '');
        return termId === historyFilters.terminalId;
      });
    }

    return filtered;
  }, [historyOrders, historyQueuedOrders, printJobsByOrder, historyFilters.status, historyFilters.terminalId]);

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

  const handleOrderCreated = useCallback(async (order, kind) => {
    const printKind = resolveCreatedPrintKind(order, kind);
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
        setPrintKind(printKind === 'settle' ? 'bill' : printKind);
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

    if (printKind === 'settle') {
      setPaymentOrder(order);
      return; // PaymentDialog will handle the rest
    }

    // Online order: if this device is a print station, print immediately locally
    if (isPrintStationEnabled() || isNativePrintServicePaired()) {
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
      fetchOrders();
      fetchTables();
      fetchCreditConfig();
      loadOfflineOrderState();
    }
  }, [fetchCreditConfig, fetchOrders, fetchTables, hasAccountingImpact, loadOfflineOrderState, publishAccountingRefresh, showToast]);

  const handleNewOrder = () => {
    if (!orgId) {
      showToast('Select a branch before creating a sale.', 'error');
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
  }, [showToast]);

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
          setPrintOrder({ ...order, _manualPrint: true });
          setPrintKind(kind);
          showToast(kind === 'kot' ? 'Offline KOT sent to printer' : 'Offline bill sent to printer');
        } else {
          showToast('This is a provisional offline order. Print from the main device after sync.', 'error');
        }
        return;
      }

      if (!isPrintStationEnabled() && !isNativePrintServicePaired()) {
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
        await handlePrintOrder(settledOrder, 'bill');
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
      if (payload?.updatedOrder) {
        await api.put(`/api/v1/orders/${paymentOrder.id}`, {
          ...payload.updatedOrder,
          ...(localBillPrint ? { skipAutoPrintKinds: ['BILL'] } : {}),
        });
      }
      const endpoint = payload?.paymentMethod === 'CREDIT'
        ? `/api/v1/orders/${paymentOrder.id}/complete-credit`
        : `/api/v1/orders/${paymentOrder.id}/settle`;
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
      const settledOrder = data.data || paymentOrder;
      // Immediately update local state so table reverts to AVAILABLE
      setFloorOrders((current) => current.map((item) =>
        item.id === settledOrder.id ? { ...item, ...settledOrder } : item
      ));
      showToast(payload?.paymentMethod === 'CREDIT' ? 'Order completed as credit' : 'Order settled successfully');
      setPaymentOrder(null);
      publishAccountingRefresh(payload?.paymentMethod === 'CREDIT' ? 'order-credit-completed' : 'order-settled', settledOrder);
      await handlePrintOrder(settledOrder, 'bill');
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
    setEditSaving(true);
    try {
      const { data } = await api.put(`/api/v1/orders/${editingOrder.id}`, payload);
      const savedOrder = data.data || payload;
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
      // Always refresh history orders to get the latest state from server
      fetchHistoryOrders(historyPage.number || 0);
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
      hideTitle={activeView === 'order_type' || activeView === 'billing'}
      noPadding={activeView === 'order_type' || activeView === 'billing'}
    >
      <PageContainer>
        {activeView === 'history' && (
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
              if (nextFilters.q === historyFilters.q) {
                fetchHistoryOrders(0, nextFilters);
              }
            }}
            onApplyFilters={() => fetchHistoryOrders(0)}
            onPrint={handlePrintOrder}
            onSettle={handleSettleOrder}
            onEdit={handleEditOrder}
            onCancel={handleCancelHistoryOrder}
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

        {activeView === 'order_type' && (
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

        {activeView === 'billing' && selectedTable && (
          <CounterSale
            initialTable={selectedTable}
            interfaceMode={billingUi}
            onOrderCreated={handleOrderCreated}
            onCreditCustomerCreated={handleCreditCustomerCreated}
            config={config}
            initialCreditCustomers={creditCustomers}
            onBack={() => {
              if (!isKnownOffline()) {
                fetchTables();
                fetchOrders();
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
            onPay={handleSettleOrder}
            onMove={handleMoveOrder}
            onEditTable={handleEditTableSettings}
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
            currencySymbol={money(0).replace(/[0-9.,\s]/g, '') || '₹'}
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
              fetchOrders?.();
              fetchHistoryOrders?.(historyPage?.number || 0);
            }}
          />
        )}

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
  onRefresh,
  onPageChange,
  onFilterChange,
  onApplyFilters,
  onPrint,
  onSettle,
  onEdit,
  onCancel,
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
          {userRole === 'SUPER_ADMIN' && branches.length > 0 && (
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
                      <strong>{money(orderTotal(order))}</strong>
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
                        {String(order?.orderStatus || order?.order_status || '').toUpperCase() !== 'CANCELLED' &&
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
