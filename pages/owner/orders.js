// pages/owner/orders.js

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import styled, { keyframes } from 'styled-components';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import { PageContainer } from '../../components/PremiumPOSUI';
import {
  FaReceipt, FaPrint, FaCheck, FaExclamationCircle,
  FaSearch, FaEdit, FaTimes, FaFire, FaHistory, FaCheckCircle, FaChevronRight, FaTimesCircle,
  FaUtensils, FaShoppingBag, FaTruck, FaArrowLeft, FaArrowRight, FaClock,
  FaUser, FaPhoneAlt, FaMapMarkerAlt
} from 'react-icons/fa';
import PaymentDialog from '../../components/PaymentDialog';
import KotPrint from '../../components/KotPrint';
import EditOrderPanel from '../../components/EditOrderPanel';
import { toDisplayItems } from '../../utils/printUtils';
import DocumentViewerPopup from '../../components/purchasing/DocumentViewerPopup';
import { formatTzDate, getBusinessNow } from '../../utils/timezoneUtils';
import NiceSelect from '../../components/NiceSelect';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';

const slideIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const TABLE_STATUS_CUBE = {
  DRAFT: { bg: '#ef4444', label: 'New' },
  CONFIRMED: { bg: '#ef4444', label: 'New' },
  IN_PROGRESS: { bg: '#f97316', label: 'Cooking' },
  READY: { bg: '#3b82f6', label: 'Ready' },
  BILLED: { bg: '#eab308', label: 'Billed' },
  COMPLETED: { bg: '#22c55e', label: 'Paid' },
  CANCELLED: { bg: '#94a3b8', label: 'Cancelled' },
};

const TABLE_CUBE_LEGEND = [
  { bg: '#ef4444', label: 'New / Occupied' },
  { bg: '#eab308', label: 'Billed' },
];

function tableCubeColor(status) {
  return TABLE_STATUS_CUBE[String(status || 'CONFIRMED').toUpperCase()] || TABLE_STATUS_CUBE.CONFIRMED;
}

// ─── Sales History Helpers ───────────────────────────────────────────────────

const money = (value) => `\u20b9${Number(value || 0).toFixed(2)}`;

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

function defaultHistoryRange(timezone) {
  const now = getBusinessNow(timezone);
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  return { from: toDateTimeInputValue(from), to: toDateTimeInputValue(to), q: '', status: '' };
}

function localInputToIso(value) {
  if (!value) return undefined;
  const date = new Date(`${value}:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const OrdersWrap = styled.div`
  padding: 16px 0 32px;
  animation: ${slideIn} 0.3s ease-out;
  font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
  position: relative;
  min-height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
`;

const OrdersHeader = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px 16px;
  border-bottom: 1px solid #e2e8f0;
  position: relative;

  @media (max-width: 900px) {
    padding: 0 16px 12px;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;
  }
`;

const SegmentedWrapper = styled.div`
  display: flex;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 14px;
  border: 1px solid #cbd5e1;
  box-shadow: inset 0 2px 4px rgba(15, 23, 42, 0.05);

  @media (max-width: 900px) {
    width: 100%;
    justify-content: space-between;
  }
`;

const SegmentBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: 10px;
  border: none;
  font-family: 'Outfit', sans-serif;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  background: ${props => props.$active ? 'white' : 'transparent'};
  color: ${props => props.$active ? props.$accent : '#64748b'};
  box-shadow: ${props => props.$active ? '0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -1px rgba(15, 23, 42, 0.03)' : 'none'};
  transition: all 0.2s ease-in-out;

  &:hover {
    color: ${props => props.$active ? props.$accent : '#0f172a'};
  }

  span.badge {
    background: ${props => props.$active ? props.$accent + '15' : '#e2e8f0'};
    color: ${props => props.$active ? props.$accent : '#64748b'};
    padding: 1px 6px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 800;
  }

  @media (max-width: 600px) {
    padding: 6px 10px;
    font-size: 11px;
    gap: 4px;
    span.badge { font-size: 9px; padding: 1px 4px; }
  }
`;

const SliderViewport = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const SliderTrack = styled.div`
  display: flex;
  gap: 24px;
  overflow-x: auto;
  padding: 24px;
  scroll-behavior: smooth;
  flex: 1;
  align-items: flex-start;
  
  &::-webkit-scrollbar {
    height: 8px;
  }
  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 9999px;
  }

  @media (max-width: 600px) {
    gap: 16px;
    padding: 16px;
  }
`;

const SliderArrow = styled.button`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px solid #cbd5e1;
  background: white;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  z-index: 10;
  transition: all 0.2s;

  &:hover {
    background: #f8fafc;
    color: #3b82f6;
    border-color: #94a3b8;
    transform: translateY(-50%) scale(1.08);
  }

  &:disabled {
    opacity: 0;
    cursor: not-allowed;
    pointer-events: none;
  }

  @media (max-width: 900px) {
    display: none;
  }
`;

const LeftArrow = styled(SliderArrow)`
  left: 16px;
`;

const RightArrow = styled(SliderArrow)`
  right: 16px;
`;

const TableCubePanel = styled.div`
  width: 100%;
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 18px;
`;

const TableCubeLegend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: center;
  padding: 2px 0;

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #64748b;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .swatch {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }
`;

const TableCubeGrid = styled.div`
  display: flex;
  align-content: flex-start;
  align-items: flex-start;
  gap: 10px;
  flex-wrap: wrap;

  @media (max-width: 600px) {
    padding: 16px;
    gap: 10px;
  }
`;

const TableOrderCube = styled.div`
  width: 56px;
  height: 56px;
  border: 1px solid ${props => props.$bg || '#94a3b8'};
  border-radius: 12px;
  background: ${props => props.$bg || '#94a3b8'};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: none;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
  position: relative;
  overflow: hidden;

  &:hover {
    transform: scale(1.12);
    box-shadow: 0 0 0 3px ${props => props.$ring || 'rgba(148, 163, 184, 0.35)'}, 0 4px 12px ${props => props.$shadow || 'rgba(15, 23, 42, 0.16)'};
  }

  .table-no {
    font-size: 12px;
    font-weight: 800;
    line-height: 1;
    max-width: 52px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: white;
    text-align: center;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  }

  @media (max-width: 600px) {
    width: 56px;
    height: 56px;
    border-radius: 12px;
  }
`;

const ErrorCard = styled.div`
  background: #fef2f2;
  border: 1px solid #fca5a5;
  color: #b91c1c;
  padding: 12px 16px;
  border-radius: 12px;
  margin: 16px 24px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 600;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #94a3b8;
  padding: 64px 32px;
  text-align: center;
  gap: 12px;

  svg {
    font-size: 48px;
    color: #cbd5e1;
  }

  strong {
    font-size: 16px;
    color: #64748b;
  }

  span {
    font-size: 13px;
    max-width: 320px;
  }
`;

// ─── History Table Styled Components ─────────────────────────────────────────

const HistoryShell = styled.section`
  padding: 0 24px 48px;
  display: flex;
  flex-direction: column;
  flex: 1;
  @media (max-width: 720px) { padding: 0 12px 48px; }
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
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);
  @media (max-width: 720px) { flex-direction: column; align-items: stretch; padding: 10px; }
`;

const HistFilterWrap = styled.div`
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
    .premium-dt-picker { width: 200px !important; }
  }
  .h-filter-sep { font-size: 11px; font-weight: 800; color: #cbd5e1; margin: 0 2px; }
  .nice-select, .nice-select-wrapper { flex-shrink: 0; min-width: 110px !important; max-width: 130px !important; }
  .dt-trigger, .nice-select-trigger {
    border: 1.5px solid #e2e8f0 !important; border-radius: 12px !important;
    background: #f8fafc !important; height: 30px !important; font-size: 11px !important;
    padding: 0 10px !important; display: flex !important; align-items: center !important;
  }
  .dt-trigger:hover, .nice-select-trigger:hover { border-color: #f97316 !important; background: #fff7ed !important; }
  .nice-select-trigger span { font-size: 11px !important; font-weight: 700 !important; color: #1e293b !important; }
  @media (max-width: 720px) { flex-direction: column; align-items: stretch; gap: 8px;
    .hist-dates { width: 100%; .premium-dt-picker { flex: 1; width: auto !important; } }
    .nice-select, .nice-select-wrapper { width: 100% !important; max-width: none !important; }
  }
`;

const HistSearchBox = styled.div`
  position: relative; flex: 1; min-width: 180px;
  svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 12px; pointer-events: none; }
  input {
    width: 100%; height: 34px; padding-left: 30px; border: 1.5px solid #e2e8f0;
    border-radius: 12px; font-size: 12px; font-weight: 600; color: #1e293b;
    background: white; outline: none; box-sizing: border-box;
    &:focus { border-color: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,0.08); }
  }
`;

const HistTableWrap = styled.div`
  width: 100%; background: #fff; border-radius: 20px; border: 1px solid #f1f5f9;
  overflow-x: auto; box-shadow: 0 4px 24px rgba(0,0,0,0.04); margin-top: 8px; margin-bottom: 16px;
`;

const HistTable = styled.table`
  width: 100%; border-collapse: collapse; min-width: 860px; text-align: left; font-family: inherit;
  thead { background: linear-gradient(180deg, #f8fafc, #f1f5f9); }
  th { padding: 8px 12px; font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #e8edf5; white-space: nowrap; }
  td { padding: 8px 12px; border-bottom: 1px solid #f8fafc; color: #334155; font-size: 13px; vertical-align: middle; white-space: nowrap; }
`;

const HistRow = styled.tr`
  transition: all 0.15s ease; border-left: 3px solid transparent;
  &:hover { border-left-color: #f97316; td { background: #fafbff; } }
`;

const HistOrderLink = styled.code`
  font-family: monospace; font-size: 12px; font-weight: 800; color: #f97316;
  text-decoration: underline; cursor: pointer; background: transparent !important;
  padding: 0 !important; border: none !important;
`;

const HistRowDate = styled.div`
  display: flex; flex-direction: column; gap: 2px;
  .rd-d { font-size: 11px; font-weight: 700; color: #1e293b; }
  .rd-t { font-size: 9px; font-weight: 500; color: #94a3b8; }
`;

const HistItemsPill = styled.span`
  background: #f1f5f9; color: #64748b; padding: 3px 8px;
  border-radius: 6px; font-size: 11px; font-weight: 800;
`;

const HistStatusBadge = styled.span`
  display: inline-flex; align-items: center; padding: 4px 10px;
  border-radius: 9999px; font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.02em; border: 1px solid;
`;

const HistActionGroup = styled.div`
  display: flex; align-items: center; gap: 8px; justify-content: center;
`;

const HistActionBtn = styled.button`
  height: 28px; border-radius: 8px; border: 1px solid #e2e8f0;
  background: #f8fafc; color: #475569; font-size: 11px; font-weight: 700;
  cursor: pointer; padding: 0 12px; display: inline-flex; align-items: center; gap: 5px;
  transition: all 0.15s;
  &:hover { background: #f97316; color: white; border-color: #ea580c; }
`;

const HistPager = styled.div`
  display: flex; align-items: center; justify-content: center;
  gap: 12px; margin-top: 12px; color: #475569; font-size: 12px; font-weight: 900;
`;

const HistPagerBtn = styled.button`
  height: 30px; border-radius: 12px; border: none;
  background: #f1f5f9; color: #475569; font-size: 11px; font-weight: 800;
  cursor: pointer; padding: 0 16px; transition: all 0.25s;
  &:hover { background: #f97316; color: white; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const OrdersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
  padding: 16px;
  width: 100%;
  box-sizing: border-box;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
    gap: 12px;
    padding: 12px;
  }
`;

const TokenGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 24px;
  align-content: flex-start;
  align-items: flex-start;
`;

const TokenCube = styled.div`
  width: 76px;
  height: 76px;
  border: 1px solid ${props => props.$bg || '#94a3b8'};
  border-radius: 14px;
  background: ${props => props.$bg || '#94a3b8'};
  color: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  padding: 6px;
  box-sizing: border-box;

  &:hover {
    transform: scale(1.1);
    box-shadow: 0 0 0 3px ${props => props.$ring || 'rgba(148, 163, 184, 0.35)'}, 0 6px 16px ${props => props.$shadow || 'rgba(15, 23, 42, 0.16)'};
  }

  .token-no {
    font-size: 13px;
    font-weight: 900;
    line-height: 1.1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  }

  .token-name {
    font-size: 9px;
    font-weight: 700;
    margin-top: 4px;
    opacity: 0.9;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.15);
  }
`;

const KotCard = styled.div`
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.03), 0 1px 2px rgba(15, 23, 42, 0.01);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  overflow: visible;
  position: relative;
  border: 1px solid rgba(226, 232, 240, 0.7);

  &:hover {
    box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.02);
    transform: translateY(-4px);
  }
`;

const CardHeader = styled.div`
  padding: 10px 14px;
  background: ${props => {
    if (props.$type === 'takeaway') return 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)';
    if (props.$type === 'delivery') return 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)';
    return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
  }};
  color: white;
  border-top-left-radius: 13px;
  border-top-right-radius: 13px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;

  /* Circular ticket cutouts */
  &::after, &::before {
    content: '';
    position: absolute;
    bottom: -8px;
    width: 16px;
    height: 16px;
    background: #f8fafc;
    border-radius: 50%;
    z-index: 2;
  }
  &::before { left: -8px; }
  &::after { right: -8px; }

  .meta {
    display: flex;
    flex-direction: column;
    gap: 2px;

    strong {
      font-size: 13.5px;
      font-weight: 900;
      letter-spacing: -0.01em;
      color: white;
    }

    span.type {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 9px;
      font-weight: 800;
      color: white;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.3);
      padding: 1px 6px;
      border-radius: 99px;
      width: fit-content;
    }
  }

  .time-group {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;

    span.time {
      font-size: 10.5px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.85);
    }

    span.elapsed {
      font-size: 8px;
      font-weight: 800;
      color: ${props => props.$isLate ? '#ef4444' : '#64748b'};
      background: ${props => props.$isLate ? '#fef2f2' : '#f1f5f9'};
      padding: 1px 6px;
      border-radius: 99px;
      display: flex;
      align-items: center;
      gap: 2px;
    }

    span.status-pill {
      font-size: 8.5px;
      font-weight: 800;
      padding: 1px 6px;
      border-radius: 99px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: white;
      background: rgba(255, 255, 255, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.35);
    }
  }
`;

const TicketDivider = styled.div`
  height: 0;
  border-bottom: 1.5px dashed #edf2f7;
  position: relative;
  z-index: 1;
  background: white;
  margin: 0;
`;

const CustomerBar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: #f8fafc;
  border-bottom: 1px solid #edf2f7;
  padding: 6px 12px;
  font-size: 11px;
  
  .cust-header {
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: 700;
    color: #1e293b;
    
    svg {
      color: #64748b;
      font-size: 11px;
    }
  }

  .cust-phone {
    display: flex;
    align-items: center;
    gap: 4px;
    color: #64748b;
    font-size: 10px;
    font-weight: 600;

    svg {
      color: #94a3b8;
      font-size: 10px;
    }
  }

  .cust-address {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    color: #64748b;
    font-size: 10px;
    font-weight: 600;
    margin-top: 1px;
    line-height: 1.2;

    svg {
      color: #94a3b8;
      font-size: 10px;
      margin-top: 1px;
      flex-shrink: 0;
    }
  }
`;

const CardBody = styled.div`
  padding: 10px 14px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #ffffff;

  .item-row {
    display: flex;
    align-items: center;
    font-size: 12.5px;
    font-weight: 700;
    color: #1e293b;
    line-height: 1.4;
    padding: 5px 0;
    border-bottom: 1px dashed #edf2f7;
    transition: all 0.15s;
    cursor: pointer;
    user-select: none;

    &:last-child {
      border-bottom: none;
    }

    &.checked {
      opacity: 0.45;
      text-decoration: line-through;
      
      span.qty {
        background: #f1f5f9;
        color: #94a3b8;
        border-color: #cbd5e1;
      }
    }

    &:hover:not(.checked) {
      padding-left: 3px;
      color: #3b82f6;
    }

    span.qty {
      background: #eff6ff;
      color: #2563eb;
      padding: 1px 6px;
      border-radius: 5px;
      font-size: 10px;
      font-weight: 800;
      margin-right: 8px;
      flex-shrink: 0;
      min-width: 24px;
      text-align: center;
      letter-spacing: 0.02em;
      border: 1px solid #dbeafe;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    span.checkbox {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 13px;
      height: 13px;
      border: 1.5px solid #cbd5e1;
      border-radius: 3px;
      margin-right: 6px;
      flex-shrink: 0;
      transition: all 0.15s;
      
      svg {
        font-size: 8px;
        color: white;
        display: none;
      }
    }

    &.checked span.checkbox {
      background: #22c55e;
      border-color: #22c55e;
      svg {
        display: block;
      }
    }

    span.name {
      flex: 1;
    }
  }
`;

const CardFooter = styled.div`
  padding: 8px 12px;
  background: linear-gradient(135deg, #f8fafc, #f0f4ff);
  border-top: 1px solid #edf2f7;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;

  .price {
    font-size: 16px;
    font-weight: 900;
    color: #0f172a;
    letter-spacing: -0.02em;
    display: flex;
    align-items: baseline;
    gap: 1px;
  }

  .actions {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    justify-content: flex-end;
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

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
    color: #0f172a;
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

    &:focus {
      outline: none;
      border-color: #3b82f6;
    }
  }
`;

const OrderDetailsModal = styled(ModalContent)`
  background: white;
  width: 95%;
  max-width: 340px;
  border-radius: 16px;
  border-top: 4px solid ${props => props.$accent || '#f97316'};
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  margin: 0 auto;
  max-height: 90vh;
  
  .detail-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: white;
    color: #0f172a;
    border-bottom: 1px solid #f1f5f9;
  }

  .detail-title {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .detail-title h3 {
    margin: 0;
    color: #0f172a;
    font-size: 16px;
    font-weight: 900;
  }

  .detail-sub {
    color: #0284c7;
    font-size: 11px;
    font-weight: 850;
    text-transform: uppercase;
  }

  .detail-status-chip {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    padding: 2px 8px;
    border-radius: 999px;
    background: ${props => props.$accent || '#f97316'}15;
    color: ${props => props.$accent || '#f97316'};
    font-size: 10px;
    font-weight: 900;
  }

  .close-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: #f8fafc;
    color: #64748b;
    cursor: pointer;
    font-size: 12px;
  }

  .detail-body {
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: white;
    flex: 1;
    overflow-y: auto;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
    background: #f8fafc;
    border: 1px solid #f1f5f9;
    padding: 8px;
    border-radius: 10px;
  }

  .meta-box {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .meta-box span {
    color: #64748b;
    font-size: 8px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .meta-box strong {
    color: #0f172a;
    font-size: 11px;
    font-weight: 850;
  }

  .detail-items {
    display: flex;
    flex-direction: column;
    gap: 0;
    max-height: 180px;
    overflow-y: auto;
  }

  .detail-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 5px 0;
    border-bottom: 1px solid #eef2f7;
  }

  .detail-item .qty {
    background: #e0f2fe;
    color: #0284c7;
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 10px;
    font-weight: 850;
  }

  .line-main {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .detail-item .name {
    color: #1e293b;
    font-size: 12px;
    font-weight: 800;
  }

  .line-meta {
    color: #64748b;
    font-size: 9.5px;
    font-weight: 700;
  }

  .line-total {
    color: #0f172a;
    font-size: 12.5px;
    font-weight: 900;
  }

  .detail-footer {
    padding: 10px 14px;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .price-breakdown {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .breakdown-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #475569;
    font-size: 11.5px;
    font-weight: 700;
  }

  .breakdown-row.discount {
    color: #ef4444;
  }

  .breakdown-divider {
    height: 1px;
    background: #e2e8f0;
    margin: 2px 0;
  }

  .breakdown-row.total {
    color: #0f172a;
    font-size: 15px;
    font-weight: 950;
  }

  .detail-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }

  .actions-row-primary {
    width: 100%;
  }

  .actions-grid-secondary {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }

  .detail-actions ${ActionBtn} {
    padding: 6px 12px;
    font-size: 11px;
    border-radius: 8px;
  }

`;

export default function OrdersPage() {
  const router = useRouter();
  const { timezone, orgId, userRole, switchBranch } = useAuth();
  const sliderRef = useRef(null);
  const historyFiltersTouchedRef = useRef(false);

  const [activeSegment, setActiveSegment] = useState('table');
  const [liveOrders, setLiveOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── History tab state ──
  const [historyOrders, setHistoryOrders] = useState([]);
  const [historyPage, setHistoryPage] = useState({ number: 0, size: 20, totalPages: 0, totalElements: 0 });
  const [historyFilters, setHistoryFilters] = useState(() => defaultHistoryRange('Asia/Kolkata'));
  const [historyLoading, setHistoryLoading] = useState(false);
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
  const [creditCustomers, setCreditCustomers] = useState([]);
  const [actionBusy, setActionBusy] = useState(null);

  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const liveRes = await api.get('/api/v1/orders/sales/live');
      setLiveOrders(liveRes.data?.data || []);
    } catch (e) {
      console.error('Failed to load orders', e);
      setError('Failed to fetch orders: ' + (e.response?.data?.message || e.message));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistoryOrders = useCallback(async (page = 0, filters = historyFilters) => {
    setHistoryLoading(true);
    try {
      const params = {
        page,
        size: 20,
        ...(filters.q?.trim() ? { q: filters.q.trim() } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.from ? { fromDate: localInputToIso(filters.from) } : {}),
        ...(filters.to ? { toDate: localInputToIso(filters.to) } : {}),
        ...(filters.terminalId ? { terminalId: filters.terminalId } : {}),
        ...(filters.branchId ? { orgId: filters.branchId } : {}),
      };
      const res = await api.get('/api/v1/orders/history', { params });
      const data = res.data?.data || {};
      setHistoryOrders(data.content || []);
      setHistoryPage({
        number: data.number || 0,
        size: data.size || 20,
        totalPages: data.totalPages || 0,
        totalElements: data.totalElements || 0,
      });
    } catch (e) {
      console.error('Failed to fetch order history', e);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyFilters]);

  // Handle ?tab=completed query param from navigation
  useEffect(() => {
    if (router.query.tab === 'completed') {
      setActiveSegment('completed');
      fetchHistoryOrders(0);
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
  useEffect(() => {
    if (!historyFiltersTouchedRef.current) return;
    const t = setTimeout(() => fetchHistoryOrders(0, historyFilters), 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyFilters.q]);

  useEffect(() => {
    api.get('/api/v1/configurations')
      .then(res => setConfig(res.data?.data || {}))
      .catch(console.error);
    api.get('/api/v1/credit/customers', { params: { status: 'ACTIVE' } })
      .then(res => setCreditCustomers(res.data?.data || []))
      .catch(console.error);
    api.get('/api/v1/terminals')
      .then(res => setTerminals(res.data?.data || []))
      .catch(console.error);
    if (userRole === 'SUPER_ADMIN') {
      api.get('/api/v1/organizations')
        .then(res => setBranches(res.data?.data || []))
        .catch(console.error);
    }
  }, [userRole]);

  useEffect(() => {
    if (config && config.tableManagementEnabled === false && activeSegment === 'table') {
      setActiveSegment('parcel');
    }
  }, [config, activeSegment]);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 12000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const updateStatus = async (id, nextStatus) => {
    try {
      setActionBusy(id);
      await api.patch(`/api/v1/orders/${id}/status`, null, {
        params: { status: nextStatus },
      });
      await loadOrders();
    } catch (e) {
      alert('Failed to update status: ' + (e.response?.data?.message || e.message));
    } finally {
      setActionBusy(null);
    }
  };

  const triggerCancelOrder = async () => {
    if (!cancelOrder) return;
    try {
      setActionBusy(cancelOrder.id);
      await api.post(`/api/v1/orders/${cancelOrder.id}/cancel`, {
        reason: cancelReason,
      });
      setCancelOrder(null);
      setCancelReason('');
      await loadOrders();
    } catch (e) {
      alert('Failed to cancel order: ' + (e.response?.data?.message || e.message));
    } finally {
      setActionBusy(null);
    }
  };

  const handleSaveEditedOrder = async (editedPayload) => {
    try {
      await api.put(`/api/v1/orders/${editingOrder.id}`, editedPayload);
      setEditingOrder(null);
      await loadOrders();
    } catch (e) {
      alert('Failed to update order: ' + (e.response?.data?.message || e.message));
    }
  };

  const handleConfirmPayment = async (settlementPayload) => {
    if (!paymentOrder) return;
    try {
      const url = settlementPayload?.paymentMethod === 'CREDIT'
        ? `/api/v1/orders/${paymentOrder.id}/complete-credit`
        : `/api/v1/orders/${paymentOrder.id}/settle`;
      await api.post(url, settlementPayload);
      setPaymentOrder(null);
      await loadOrders();
    } catch (e) {
      alert('Payment settlement failed: ' + (e.response?.data?.message || e.message));
    }
  };

  const handlePrintKot = (order) => {
    setPrintKind('kot');
    setPrintOrder(order);
  };

  const handlePrintBill = async (order) => {
    setPrintKind('bill');
    setPrintOrder(order);
  };

  const slideLeft = () => {
    sliderRef.current?.scrollBy({ left: -400, behavior: 'smooth' });
  };

  const slideRight = () => {
    sliderRef.current?.scrollBy({ left: 400, behavior: 'smooth' });
  };

  const tableOrders = liveOrders.filter(o => o.tableNumber != null || o.fulfillmentType === 'DINE_IN');
  const parcelOrders = liveOrders.filter(o => o.fulfillmentType === 'TAKEAWAY' || o.fulfillmentType === 'PARCEL');
  const deliveryOrders = liveOrders.filter(o => o.fulfillmentType === 'DELIVERY');

  let activeList = [];
  if (activeSegment === 'table') activeList = [...tableOrders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  else if (activeSegment === 'parcel') activeList = [...parcelOrders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  else if (activeSegment === 'delivery') activeList = [...deliveryOrders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

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

  return (
    <DashboardLayout title="Kitchen Display System">
      <PageContainer>
        <OrdersWrap>
          <OrdersHeader>
            {/* Invisible spacer that matches button width to keep tabs centered */}
            <div style={{ minWidth: 130 }} />

            <SegmentedWrapper>
              {config?.tableManagementEnabled !== false && (
                <SegmentBtn $active={activeSegment === 'table'} $accent="#16a34a" onClick={() => setActiveSegment('table')}>
                  <FaUtensils /> Table <span className="badge">{tableOrders.length}</span>
                </SegmentBtn>
              )}
              <SegmentBtn $active={activeSegment === 'parcel'} $accent="#ea580c" onClick={() => setActiveSegment('parcel')}>
                <FaShoppingBag /> Takeaway <span className="badge">{parcelOrders.length}</span>
              </SegmentBtn>
              {config?.onlineDeliveryEnabled && (
                <SegmentBtn $active={activeSegment === 'delivery'} $accent="#0284c7" onClick={() => setActiveSegment('delivery')}>
                  <FaTruck /> Delivery <span className="badge">{deliveryOrders.length}</span>
                </SegmentBtn>
              )}
              <SegmentBtn $active={activeSegment === 'completed'} $accent="#475569" onClick={() => setActiveSegment('completed')}>
                <FaHistory /> Completed
              </SegmentBtn>
            </SegmentedWrapper>

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
                            <TableOrderCube key={order.id} role="button" tabIndex={0} $bg={cube.bg} $ring={`${cube.bg}55`} $shadow={`${cube.bg}44`} onClick={() => setSelectedTableOrder(order)}>
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
                          onClick={() => setSelectedTableOrder(order)}
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

                  {userRole === 'SUPER_ADMIN' && branches.length > 0 && (
                    <NiceSelect
                      className="nice-select"
                      options={[
                        { value: '', label: 'All Branches' },
                        ...branches.map(b => ({ value: b.id, label: b.name }))
                      ]}
                      value={historyFilters.branchId || ''}
                      onChange={(val) => {
                        historyFiltersTouchedRef.current = true;
                        const f = { ...historyFilters, branchId: val };
                        setHistoryFilters(f);
                        fetchHistoryOrders(0, f);
                        const branch = branches.find(b => String(b.id) === String(val));
                        if (branch) switchBranch(branch.id, branch.name);
                        else switchBranch(null, null);
                      }}
                    />
                  )}

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
                      { value: 'DRAFT', label: 'Draft' },
                      { value: 'BILLED', label: 'Billed' },
                      { value: 'COMPLETED', label: 'Completed' },
                      { value: 'PAID', label: 'Paid' },
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
                      onChange={(e) => { historyFiltersTouchedRef.current = true; setHistoryFilters(f => ({ ...f, q: e.target.value })); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); fetchHistoryOrders(0); } }}
                    />
                  </HistSearchBox>
                </HistFilterWrap>
              </HistoryToolbar>

              {historyOrders.length === 0 ? (
                <EmptyState style={{ flex: 'none', padding: '48px 32px' }}>
                  <FaReceipt />
                  <strong>{historyFilters.q?.trim() ? 'No matching orders' : 'No orders found'}</strong>
                  <span>{historyFilters.q?.trim() ? 'Try a different search or date range.' : 'Completed and paid orders will appear here.'}</span>
                </EmptyState>
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
                      {historyOrders.map(order => {
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
                            <td><strong>{money(histOrderTotal(order))}</strong></td>
                            <td>
                              <HistStatusBadge style={{ background: colors.bg, color: colors.color, borderColor: colors.border }}>
                                {histStatusText(order)}
                              </HistStatusBadge>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <HistActionGroup>
                                <HistActionBtn type="button" onClick={() => handlePrintBill(order)}>
                                  <FaPrint style={{ fontSize: 10 }} /> Print
                                </HistActionBtn>
                                <HistActionBtn type="button" onClick={() => setEditingOrder(order)}>
                                  <FaEdit style={{ fontSize: 10 }} /> Edit
                                </HistActionBtn>
                              </HistActionGroup>
                            </td>
                          </HistRow>
                        );
                      })}
                    </tbody>
                  </HistTable>
                </HistTableWrap>
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
              currencySymbol={'₹'}
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
                  <button className="close-btn" onClick={() => setSelectedTableOrder(null)}><FaTimes /></button>
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
                        unitPrice ? `\u20b9${unitPrice.toFixed(2)} each` : null,
                      ].filter(Boolean);

                      return (
                        <div key={i} className="detail-item">
                          <span className="qty">{qty}×</span>
                          <div className="line-main">
                            <span className="name">{displayName}</span>
                            <span className="line-meta">
                              {metaParts.join(' - ')}
                              {discount > 0 && <span className="discount"> - Discount &#8377;{discount.toFixed(2)}</span>}
                              {tax > 0 && <span className="tax"> - Tax &#8377;{tax.toFixed(2)}</span>}
                            </span>
                          </div>
                          <span className="line-total">&#8377;{lineTotal.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="detail-footer">
                  <div className="price-breakdown">
                    <div className="breakdown-row">
                      <span>Subtotal</span>
                      <span>&#8377;{Number(selectedTableOrder.totalAmount || selectedTableOrder.total_amount || 0).toFixed(2)}</span>
                    </div>
                    {Number(selectedTableOrder.totalDiscountAmount || selectedTableOrder.total_discount_amount || 0) > 0 && (
                      <div className="breakdown-row discount">
                        <span>Discount</span>
                        <span>-&#8377;{Number(selectedTableOrder.totalDiscountAmount || selectedTableOrder.total_discount_amount || 0).toFixed(2)}</span>
                      </div>
                    )}
                    {Number(selectedTableOrder.totalTaxAmount || selectedTableOrder.total_tax_amount || 0) > 0 && (
                      <div className="breakdown-row">
                        <span>Tax</span>
                        <span>&#8377;{Number(selectedTableOrder.totalTaxAmount || selectedTableOrder.total_tax_amount || 0).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="breakdown-divider" />
                    <div className="breakdown-row total">
                      <span>Total</span>
                      <span>&#8377;{(() => {
                        const sub = Number(selectedTableOrder.totalAmount || selectedTableOrder.total_amount || 0);
                        const tax = Number(selectedTableOrder.totalTaxAmount || selectedTableOrder.total_tax_amount || 0);
                        const disc = Number(selectedTableOrder.totalDiscountAmount || selectedTableOrder.total_discount_amount || 0);
                        const dbGrand = Number(selectedTableOrder.grandTotal || selectedTableOrder.grand_total || 0);
                        if (Math.abs(dbGrand - sub) < 0.05 && tax > 0.05) {
                          return (sub + tax - disc).toFixed(2);
                        }
                        return (dbGrand || sub || 0).toFixed(2);
                      })()}</span>
                    </div>
                  </div>

                  <div className="detail-actions">
                    <div className="actions-row-primary">
                      <ActionBtn $variant="success" style={{ width: '100%', padding: '6px 12px', fontSize: '11px' }} onClick={() => {
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
                        handlePrintBill(selectedTableOrder);
                        updateStatus(selectedTableOrder.id, 'BILLED');
                        setSelectedTableOrder(null);
                      }}>
                        <FaReceipt /> Bill
                      </ActionBtn>
                      <ActionBtn $variant="danger" onClick={() => {
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
            />
          )}

          {printOrder && (
            <KotPrint
              order={printOrder}
              kind={printKind}
              autoPrint={true}
              onClose={() => setPrintOrder(null)}
            />
          )}
        </OrdersWrap>
      </PageContainer>
    </DashboardLayout>
  );
}
