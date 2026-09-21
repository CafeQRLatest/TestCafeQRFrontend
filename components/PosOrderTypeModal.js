/**
 * OrderTypeSelectorModal.js
 * High-performance Order Type & Live Orders Selector for POS (V2).
 * Strictly displays LIVE ORDERS only for Kitchen/Dine-in, Takeaway, and Delivery.
 */
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import {
  FaChair,
  FaUtensils,
  FaShoppingBag,
  FaTruck,
  FaPlus,
  FaReceipt,
  FaClock,
  FaCheckCircle,
  FaPrint,
  FaFileInvoice,
  FaEdit,
  FaTimesCircle,
  FaTimes,
  FaCreditCard,
  FaSyncAlt,
  FaUser,
  FaPhoneAlt,
  FaMapMarkerAlt,
  FaThLarge,
  FaList,
  FaColumns,
  FaVolumeUp, 
  FaVolumeMute,
  FaSearch,
  FaChevronLeft,
  FaChevronRight,
  FaChevronDown,
  FaChevronUp,
  FaHistory,
  FaBell,
  FaBellSlash,
  FaExchangeAlt
} from 'react-icons/fa';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { formatTzDate } from '../utils/timezoneUtils';
import { downloadInvoicePdf } from '../utils/invoicePdf';
import {
  isAndroidPrintStationEnabled,
  markCloudPrintJobPrinted,
  isPrintStationEnabled,
  enqueueCloudPrintJob,
  localPrintWillHandleKind,
} from '../utils/cloudPrintStation';
import PaymentDialog from './PaymentDialog';
import KotPrint from './KotPrint';
import EditOrderPanel from './EditOrderPanel';
import { isKitchenModuleEnabled } from '../utils/moduleVisibility';
import { getFCMToken } from '../lib/firebase/messaging';
import {
  getStoredPushToken,
  arePushAlertsDisabled
} from '../lib/push/tokenStore';

/* ─── Helpers ──────────────────────────────────────────────────────── */

const money = (value, symbol = '₹') => `${symbol}${Number(value || 0).toFixed(2)}`;

const getItemLineTotal = (item) => {
  if (!item) return 0;
  const qty = Number(item.quantity ?? item.qty ?? 1) || 1;
  if (item.lineTotal != null && !isNaN(Number(item.lineTotal)) && Number(item.lineTotal) > 0) {
    return Number(item.lineTotal);
  }
  if (item.grossLineAmount != null && !isNaN(Number(item.grossLineAmount)) && Number(item.grossLineAmount) > 0) {
    return Number(item.grossLineAmount);
  }
  if (item.line_total != null && !isNaN(Number(item.line_total)) && Number(item.line_total) > 0) {
    return Number(item.line_total);
  }
  if (item.totalPrice != null && !isNaN(Number(item.totalPrice)) && Number(item.totalPrice) > 0) {
    return Number(item.totalPrice);
  }
  if (item.total != null && !isNaN(Number(item.total)) && Number(item.total) > 0) {
    return Number(item.total);
  }
  if (item.amount != null && !isNaN(Number(item.amount)) && Number(item.amount) > 0) {
    return Number(item.amount);
  }
  const unit = Number(item.unitPrice ?? item.unit_price ?? item.price ?? item.itemPrice ?? item.item_price ?? item.rate ?? 0);
  return unit * qty;
};

const getItemUnitPrice = (item) => {
  if (!item) return 0;
  if (item.unitPrice != null && !isNaN(Number(item.unitPrice)) && Number(item.unitPrice) > 0) {
    return Number(item.unitPrice);
  }
  if (item.unit_price != null && !isNaN(Number(item.unit_price)) && Number(item.unit_price) > 0) {
    return Number(item.unit_price);
  }
  if (item.price != null && !isNaN(Number(item.price)) && Number(item.price) > 0) {
    return Number(item.price);
  }
  if (item.itemPrice != null && !isNaN(Number(item.itemPrice)) && Number(item.itemPrice) > 0) {
    return Number(item.itemPrice);
  }
  if (item.item_price != null && !isNaN(Number(item.item_price)) && Number(item.item_price) > 0) {
    return Number(item.item_price);
  }
  if (item.rate != null && !isNaN(Number(item.rate)) && Number(item.rate) > 0) {
    return Number(item.rate);
  }
  const total = getItemLineTotal(item);
  const qty = Number(item.quantity ?? item.qty ?? 1) || 1;
  return total / qty;
};

function calculateKotDeltaJs(oldOrder, newOrder) {
  const oldLines = oldOrder?.lines || oldOrder?.orderLines || oldOrder?.order_items || [];
  const newLines = newOrder?.lines || newOrder?.orderLines || newOrder?.order_items || [];

  const getLineKey = (line) => {
    const pId = line.productId || line.product_id || line.name || line.productName || line.id || '';
    const vId = line.variantId || line.variant_id || 'base';
    return `${pId}:${vId}`;
  };

  const oldQtyMap = new Map();
  const oldLineMap = new Map();
  oldLines.forEach(line => {
    const key = getLineKey(line);
    oldQtyMap.set(key, (oldQtyMap.get(key) || 0) + Number(line.quantity || line.qty || 0));
    if (!oldLineMap.has(key)) {
      oldLineMap.set(key, line);
    }
  });

  const newQtyMap = new Map();
  const newLineMap = new Map();
  newLines.forEach(line => {
    const key = getLineKey(line);
    newQtyMap.set(key, (newQtyMap.get(key) || 0) + Number(line.quantity || line.qty || 0));
    if (!newLineMap.has(key)) {
      newLineMap.set(key, line);
    }
  });

  const addedLines = [];
  const removedLines = [];

  newQtyMap.forEach((newQty, key) => {
    const oldQty = oldQtyMap.get(key) || 0;
    if (newQty > oldQty) {
      const line = newLineMap.get(key);
      const catName = line.categoryName || line.category_name || (typeof line.category === 'string' ? line.category : line.category?.name) || line.product?.category_name || '';
      const catId = line.categoryId || line.category_id || line.category?.id || line.product?.category_id || '';
      addedLines.push({
        ...line,
        categoryName: catName,
        category_name: catName,
        categoryId: catId,
        category_id: catId,
        quantity: newQty - oldQty,
        qty: newQty - oldQty
      });
    }
  });

  oldQtyMap.forEach((oldQty, key) => {
    const newQty = newQtyMap.get(key) || 0;
    if (oldQty > newQty) {
      const line = oldLineMap.get(key);
      const catName = line.categoryName || line.category_name || (typeof line.category === 'string' ? line.category : line.category?.name) || line.product?.category_name || '';
      const catId = line.categoryId || line.category_id || line.category?.id || line.product?.category_id || '';
      removedLines.push({
        ...line,
        categoryName: catName,
        category_name: catName,
        categoryId: catId,
        category_id: catId,
        quantity: oldQty - newQty,
        qty: oldQty - newQty
      });
    }
  });

  return { addedLines, removedLines };
}

const OPEN_ORDER_STATUSES = new Set([
  'DRAFT',
  'CONFIRMED',
  'KITCHEN',
  'IN_PROGRESS',
  'READY',
  'OUT_FOR_DELIVERY',
  'BILLED'
]);

function isLiveOrder(order) {
  if (!order) return false;
  const status = String(order.orderStatus || order.order_status || order.status || '').toUpperCase();
  if (status === 'COMPLETED' || status === 'CANCELLED' || status === 'VOID' || status === 'CLOSED') {
    return false;
  }
  return true;
}

function timeAgo(dateString) {
  if (!dateString) return '';
  let strVal = String(dateString);
  if (typeof dateString === 'string' && dateString.length >= 19 && dateString.includes('T') && !dateString.includes('Z') && !dateString.match(/[+-]\d{2}:\d{2}$/)) {
    strVal = dateString + 'Z';
  }
  const now = new Date();
  const date = new Date(strVal);
  if (isNaN(date.getTime())) return '';
  const diffMinutes = Math.floor((now - date) / (1000 * 60));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes === 1) return '1 min ago';
  if (diffMinutes < 60) return `${diffMinutes} mins ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours === 1) return '1 hr ago';
  return `${diffHours} hrs ago`;
}

function formatOrderTime(dateString, tz = null) {
  if (!dateString) return '';
  try {
    const formatted = formatTzDate(dateString, tz, { format: 'time' });
    return formatted === '—' ? '' : formatted;
  } catch (e) {
    return '';
  }
}


/* ─── Table status color map ────────────────────────────────────────── */
const STATUS_CUBE = {
  AVAILABLE:   { bg: '#ffffff', fg: '#0f172a', border: '#10b981', label: 'Available' },
  OCCUPIED:    { bg: '#ef4444', fg: '#ffffff', border: '#dc2626', label: 'Occupied' },
  BILLED:      { bg: '#10b981', fg: '#ffffff', border: '#059669', label: 'Billed' },
  RESERVED:    { bg: '#3b82f6', fg: '#ffffff', border: '#2563eb', label: 'Reserved' },
  MAINTENANCE: { bg: '#64748b', fg: '#ffffff', border: '#475569', label: 'Hold' },
};

function cubeColor(status) {
  return STATUS_CUBE[String(status || 'AVAILABLE').toUpperCase()] || STATUS_CUBE.AVAILABLE;
}

function orderCubeStyle(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'BILLED') {
    return { bg: '#10b981', fg: '#ffffff', border: '#059669', label: 'Billed' };
  }
  // All active/cooking/ready orders use red as occupied
  return { bg: '#ef4444', fg: '#ffffff', border: '#dc2626', label: 'Occupied' };
}

function orderStatusBadgeStyle(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'BILLED') {
    return { bg: '#ecfdf5', color: '#047857', border: '#86efac' };
  }
  if (s === 'READY') {
    return { bg: '#f0fdf4', color: '#15803d', border: '#86efac' };
  }
  if (s === 'KITCHEN' || s === 'CONFIRMED') {
    return { bg: '#fff7ed', color: '#c2410c', border: '#fdba74' };
  }
  if (s === 'IN_PROGRESS' || s === 'OUT_FOR_DELIVERY') {
    return { bg: '#fff7ed', color: '#c2410c', border: '#fdba74' };
  }
  return { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' };
}



/* ─── Live Order Board Subcomponent (Vertical List & Responsive Cards) ─── */
function LiveOrderBoardView({
  ordersList = [],
  sym = '₹',
  actionBusy,
  canCancelOrder,
  timezone = null,
  onSelectOrder,
  onPrintKot,
  onPrintBill,
  onDownloadInvoice,
  onUpdateStatus,
  onSettleOrder,
  onEditOrder,
  onCancelOrder,
  onChangeTable,
  onNewOrder,
  newOrderLabel = '+ New Order',
}) {
  return (
    <div style={S.boardWrap}>
      {/* Board Header */}
      <div style={S.boardHeader}>
        <span style={S.boardCountText}>
          Live Orders (<strong>{ordersList.length}</strong>)
        </span>
      </div>

      {/* Multi-column responsive cards grid */}
        <div className="board-card-grid" style={S.boardCardGrid}>
          {/* First Card: + New Takeaway / + New Delivery button card inside the board grid */}
          {onNewOrder && (
            <div
              className="board-new-order-card"
              style={{
                minHeight: 200,
                border: '2px dashed #f97316',
                background: '#ffffff',
                borderRadius: 12,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                cursor: 'pointer',
                padding: '20px 14px',
                boxSizing: 'border-box',
                transition: 'all 0.18s ease',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
              }}
              onClick={onNewOrder}
              title={newOrderLabel}
            >
              <div style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(249, 115, 22, 0.35)',
              }}>
                <FaPlus size={20} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#ea580c', letterSpacing: '-0.01em' }}>
                  {newOrderLabel}
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#64748b', marginTop: 3 }}>
                  Start new order
                </div>
              </div>
            </div>
          )}

          {ordersList.map(order => {
            const statusBadge = orderStatusBadgeStyle(order.orderStatus);
            const isTable = Boolean(order.tableNumber);
            const s = String(order.orderStatus || '').toUpperCase();
            const isBilled = s === 'BILLED';
            const itemCount = Array.isArray(order.lines) ? order.lines.reduce((acc, l) => acc + (l.quantity || 1), 0) : 0;

            return (
              <div
                key={order.id}
                className="board-list-card"
                style={{
                  ...S.boardCard,
                  background: '#ffffff',
                  border: isBilled ? '1.5px solid #86efac' : '1.5px solid #fed7aa',
                  boxShadow: isBilled 
                    ? '0 4px 12px rgba(16, 185, 129, 0.08), 0 1px 3px rgba(0,0,0,0.03)' 
                    : '0 4px 12px rgba(249, 115, 22, 0.08), 0 1px 3px rgba(0,0,0,0.03)',
                  borderRadius: 12,
                  padding: '10px 11px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                  height: '100%',
                  boxSizing: 'border-box',
                }}
                onClick={() => onSelectOrder && onSelectOrder(order)}
              >
                {/* ── Section 1: Header (Token / Table + Status + Time) ── */}
                <div className="board-card-header" style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: 7,
                  borderBottom: '1px solid #f1f5f9',
                }}>
                  {(() => {
                    const tokenNo = order.dailyBillNo || order.orderNo || order.order_no || String(order.id).slice(0, 8);
                    const cleanToken = String(tokenNo).replace(/^[#\s]+/, '');

                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="board-card-token" style={{
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: '#0f172a',
                          background: '#f1f5f9',
                          border: '1px solid #e2e8f0',
                          padding: '2px 8px',
                          borderRadius: 6,
                          letterSpacing: '0.02em',
                        }}>
                          #{cleanToken}
                        </span>
                        {isTable && (
                          <span
                            className="board-card-table"
                            style={{
                              background: isBilled ? '#ecfdf5' : '#ffedd5',
                              color: isBilled ? '#065f46' : '#9a3412',
                              border: isBilled ? '1.5px solid #10b981' : '1.5px solid #f97316',
                              fontSize: 13.5,
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: 7,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              whiteSpace: 'nowrap',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                              cursor: onChangeTable && !['COMPLETED', 'CANCELLED', 'VOID'].includes(String(order.orderStatus || '').toUpperCase()) ? 'pointer' : 'default',
                              transition: 'all 0.15s ease'
                            }}
                            onClick={(e) => {
                              if (onChangeTable && !['COMPLETED', 'CANCELLED', 'VOID'].includes(String(order.orderStatus || '').toUpperCase())) {
                                e.stopPropagation();
                                onChangeTable(order);
                              }
                            }}
                            title={onChangeTable && !['COMPLETED', 'CANCELLED', 'VOID'].includes(String(order.orderStatus || '').toUpperCase()) ? `Click to change table (Current: Table ${order.tableNumber})` : `Table ${order.tableNumber}`}
                          >
                            <FaChair size={12} style={{ opacity: 0.9, flexShrink: 0 }} />
                            <span>{order.tableNumber}</span>
                            {onChangeTable && !['COMPLETED', 'CANCELLED', 'VOID'].includes(String(order.orderStatus || '').toUpperCase()) && (
                              <FaExchangeAlt size={9} style={{ opacity: 0.7, marginLeft: 2, flexShrink: 0 }} />
                            )}
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span className="board-card-status" style={{
                      ...S.cardStatusBadge,
                      background: isBilled 
                        ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
                        : 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                      color: isBilled ? '#ffffff' : '#c2410c',
                      border: isBilled ? '1px solid #059669' : '1px solid #fdba74',
                      fontWeight: 700,
                      fontSize: 9.5,
                      padding: '2px 8px',
                      borderRadius: 14,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3.5,
                    }}>
                      {isBilled ? (
                        <>
                          <FaCheckCircle size={8.5} />
                          <span>BILLED</span>
                        </>
                      ) : (
                        <>
                          <span style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: '#ea580c',
                            display: 'inline-block',
                          }} />
                          <span>{String(order.orderStatus || '').toUpperCase() === 'KITCHEN' ? 'ORDERED' : String(order.orderStatus || 'ORDERED').replace(/_/g, ' ')}</span>
                        </>
                      )}
                    </span>
                    <span className="board-card-time" style={{
                      ...S.cardTimeBadge,
                      fontSize: 10,
                      fontWeight: 500,
                      color: '#64748b',
                      background: '#f8fafc',
                      padding: '2px 6px',
                      borderRadius: 5,
                      border: '1px solid #e2e8f0',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                    }}>
                      <FaClock size={8.5} style={{ color: isBilled ? '#10b981' : '#f97316' }} />
                      {formatOrderTime(order.orderDate || order.order_date || order.createdAt || order.updatedAt, timezone)}
                    </span>
                  </div>
                </div>

                {/* Optional Customer Info row (Phone / Customer Name) */}
                {(order.customerPhone || order.customerName) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: '#64748b', padding: '0 2px' }}>
                    {order.customerName && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600, color: '#334155' }}>
                        <FaUser size={8} style={{ color: '#94a3b8' }} />
                        {order.customerName}
                      </span>
                    )}
                    {order.customerPhone && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <FaPhoneAlt size={8} style={{ color: '#94a3b8' }} />
                        {order.customerPhone}
                      </span>
                    )}
                  </div>
                )}

                {order.deliveryAddress && (
                  <div style={S.cardAddress}>
                    <FaMapMarkerAlt size={9} style={{ color: '#0284c7', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {order.deliveryAddress}
                    </span>
                  </div>
                )}

                {/* ── Section 2: Full Itemized Lines List ── */}
                {Array.isArray(order.lines) && order.lines.length > 0 && (
                  <div className="board-card-items-box" style={{
                    ...S.boardItemsBox,
                    background: '#f8fafc',
                    borderRadius: 8,
                    border: '1px solid #eef2f6',
                    padding: '6px 8px',
                    margin: 0,
                    gap: 4,
                    maxHeight: 80,
                  }}>
                    {order.lines.map((item, idx) => (
                      <div key={idx} className="board-card-item-row" style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 11,
                        lineHeight: 1.3,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, maxWidth: '72%' }}>
                          <span className="board-card-item-qty" style={{
                            background: '#e2e8f0',
                            color: '#1e293b',
                            fontSize: 9.5,
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: 4,
                            flexShrink: 0,
                          }}>
                            {item.quantity || item.qty || 1}x
                          </span>
                          <span className="board-card-item-name" style={{
                            color: '#1e293b',
                            fontWeight: 600,
                            fontSize: 11.5,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {item.productName || item.itemName || item.name || 'Item'}
                          </span>
                        </div>
                        <span className="board-card-item-price" style={{
                          color: '#334155',
                          fontWeight: 700,
                          fontSize: 11.5,
                          flexShrink: 0,
                          marginLeft: 4,
                        }}>
                          {money(getItemLineTotal(item), sym)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Special Notes / Instructions */}
                {(order.notes || order.remarks || order.specialInstructions) && (
                  <div className="board-card-note-alert" style={{
                    ...S.boardNoteAlert,
                    borderRadius: 6,
                    padding: '3px 8px',
                    fontSize: 10.5,
                  }}>
                    <strong>Note:</strong> {order.notes || order.remarks || order.specialInstructions}
                  </div>
                )}

                {/* ── Section 3: Summary & Total Amount ── */}
                <div className="board-card-summary-row" style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 6,
                  borderTop: '1px solid #f1f5f9',
                  marginTop: 1,
                }}>
                  <span className="board-card-item-count" style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: '#64748b',
                    background: '#f1f5f9',
                    padding: '2px 8px',
                    borderRadius: 12,
                    border: '1px solid #e2e8f0'
                  }}>
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span className="board-card-total-label" style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Total</span>
                    <span className="board-card-total-amount" style={{
                      fontSize: 16.5,
                      fontWeight: 800,
                      color: isBilled ? '#047857' : '#0f172a',
                      letterSpacing: '-0.02em',
                    }}>
                      {money(order.grandTotal, sym)}
                    </span>
                  </div>
                </div>

                {/* ── Section 4: Action Buttons (Always Pinned to Bottom) ── */}
                <div className="board-card-actions" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  alignItems: 'stretch',
                  marginTop: 'auto',
                  paddingTop: 8,
                  borderTop: '1px solid #f8fafc',
                }} onClick={e => e.stopPropagation()}>
                  {/* Row 1: Auxiliary action buttons (Bill, KOT, Invoice, Edit, Cancel) */}
                  <div className={`board-card-aux-row ${!canCancelOrder ? 'four-cols' : ''}`} style={{
                    display: 'grid',
                    gridTemplateColumns: canCancelOrder ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)',
                    gap: 4,
                    width: '100%'
                  }}>
                    <button
                      type="button"
                      className="pos-action-bar-btn"
                      style={{
                        ...S.actionBarBtn,
                        height: 29,
                        padding: '0 3px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        border: '1px solid #e2e8f0',
                        gap: 3,
                        letterSpacing: '-0.01em',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                      }}
                      onClick={() => onPrintBill && onPrintBill(order)}
                      title="Print Bill"
                    >
                      <FaPrint size={10.5} style={{ color: '#0284c7', flexShrink: 0 }} />
                      <span>Bill</span>
                    </button>

                    <button
                      type="button"
                      className="pos-action-bar-btn"
                      style={{
                        ...S.actionBarBtn,
                        height: 29,
                        padding: '0 3px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        border: '1px solid #e2e8f0',
                        gap: 3,
                        letterSpacing: '-0.01em',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                      }}
                      onClick={() => onPrintKot && onPrintKot(order)}
                      title="Print KOT"
                    >
                      <FaUtensils size={10.5} style={{ color: '#ea580c', flexShrink: 0 }} />
                      <span>KOT</span>
                    </button>

                    <button
                      type="button"
                      className="pos-action-bar-btn"
                      style={{
                        ...S.actionBarBtn,
                        height: 29,
                        padding: '0 3px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        border: '1px solid #e2e8f0',
                        gap: 3,
                        letterSpacing: '-0.01em',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                      }}
                      onClick={async () => {
                        if (onDownloadInvoice) {
                          await onDownloadInvoice(order);
                        } else {
                          try {
                            await downloadInvoicePdf(order);
                          } catch (e) {
                            console.error(e);
                          }
                        }
                      }}
                      title="Download Invoice PDF"
                    >
                      <FaFileInvoice size={10.5} style={{ color: '#7c3aed', flexShrink: 0 }} />
                      <span>Invoice</span>
                    </button>

                    <button
                      type="button"
                      className="pos-action-bar-btn"
                      style={{
                        ...S.actionBarBtn,
                        height: 29,
                        padding: '0 3px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        border: '1px solid #e2e8f0',
                        gap: 3,
                        letterSpacing: '-0.01em',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                      }}
                      onClick={() => onEditOrder && onEditOrder(order)}
                      title="Edit Order"
                    >
                      <FaEdit size={10.5} style={{ color: '#0d9488', flexShrink: 0 }} />
                      <span>Edit</span>
                    </button>

                    {canCancelOrder && (
                      <button
                        type="button"
                        className="pos-action-bar-btn pos-action-bar-btn-cancel"
                        style={{
                          ...S.actionBarBtnCancel,
                          height: 29,
                          padding: '0 3px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          border: '1px solid #fecdd3',
                          gap: 3,
                          letterSpacing: '-0.01em',
                          boxShadow: '0 1px 2px rgba(225,29,72,0.04)'
                        }}
                        onClick={() => onCancelOrder && onCancelOrder(order)}
                        title="Cancel Order"
                      >
                        <FaTimesCircle size={10.5} style={{ color: '#e11d48', flexShrink: 0 }} />
                        <span>Cancel</span>
                      </button>
                    )}
                  </div>

                  {/* Row 2: Prominent Centered Settle Payment Button */}
                  <div className="board-card-settle-wrap" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                    <button
                      type="button"
                      className="pos-settle-primary-btn"
                      style={{
                        ...S.actionBtnPrimaryCentered,
                        height: 35,
                        padding: '0 14px',
                        borderRadius: 9,
                        fontSize: 12.5,
                        fontWeight: 700,
                        gap: 6,
                        width: '100%',
                        background: isBilled 
                          ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
                          : 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)',
                        boxShadow: isBilled 
                          ? '0 2px 6px rgba(16, 185, 129, 0.3)' 
                          : '0 2px 6px rgba(234, 88, 12, 0.3)',
                        cursor: 'pointer'
                      }}
                      onClick={() => onSettleOrder && onSettleOrder(order)}
                      title="Settle Payment"
                    >
                      <FaCreditCard size={13} style={{ flexShrink: 0 }} />
                      <span>Settle Payment</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
    </div>
  );
}

const LiveOrderBoardSlider = LiveOrderBoardView;

/* ─── Main Component ─────────────────────────────────────────────────── */
export default function PosOrderTypeModal({
  tables = [],
  config = null,
  onSelect,
  onClose,
  onRefreshTables,
  onPrintOrder
}) {
  const router = useRouter();
  const { orgId, timezone, canCancelOrder, hasModule } = useAuth();
  const { notify } = useNotification();

  const isTableConfigOn = Boolean(config?.tableManagementEnabled ?? config?.tableEnabled);
  const isDeliveryConfigOn = Boolean(config?.onlineDeliveryEnabled ?? config?.pm_online_delivery ?? false);
  const isKitchenEnabled = Boolean(
    config?.sendToKitchenEnabled !== false &&
    (isKitchenModuleEnabled(config) || (hasModule ? hasModule('KOT', orgId) : true))
  );

  // Sound Alerts state
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Push Notifications state
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifyKitchen, setNotifyKitchen] = useState(true);
  const [notifyTakeaway, setNotifyTakeaway] = useState(true);
  const [notifyDelivery, setNotifyDelivery] = useState(true);
  const [notifySettled, setNotifySettled] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('cafeqr_sound_enabled');
      setSoundEnabled(stored !== 'false');
      
      const notifPref = localStorage.getItem('cafeqr_notifications_enabled');
      const isDisabled = notifPref === 'false' || arePushAlertsDisabled();
      setNotifEnabled(!isDisabled && (notifPref === 'true' || !!getStoredPushToken()));
      setNotifyKitchen(localStorage.getItem('push_notify_kitchen') !== '0');
      setNotifyTakeaway(localStorage.getItem('push_notify_takeaway') !== '0');
      setNotifyDelivery(localStorage.getItem('push_notify_delivery') !== '0');
      setNotifySettled(localStorage.getItem('push_notify_settled') !== '0');
    }
  }, []);

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
        console.warn('Failed to sync preferences:', err);
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
          await updatePushPreferences({
            kitchen: notifyKitchen,
            takeaway: notifyTakeaway,
            delivery: notifyDelivery,
            settled: notifySettled
          });
          notify('success', 'Push notifications enabled!');
        } else {
          notify('error', 'Push permission denied or unsupported');
        }
      } catch (err) {
        console.error(err);
        notify('error', 'Failed to enable push notifications');
      }
    } else {
      setNotifEnabled(false);
      localStorage.setItem('cafeqr_notifications_enabled', 'false');
      notify('info', 'Push notifications disabled on this device');
    }
  };

  const handleToggleSound = (enable) => {
    setSoundEnabled(enable);
    if (typeof window !== 'undefined') {
      localStorage.setItem('cafeqr_sound_enabled', String(enable));
    }
    if (enable) {
      try {
        const audio = new Audio('/sounds/kitchen.mp3');
        audio.volume = 0.35;
        audio.play().catch(() => {});
      } catch (_) {}
    }
  };

  const [activeType, setActiveType] = useState(() => (isTableConfigOn ? 'TABLE' : 'TAKEAWAY'));
  const [viewMode, setViewMode] = useState('board'); // Always 'board' by default in New Sales
  const [hoveredTable, setHoveredTable] = useState(null);
  const [floorFilter, setFloorFilter] = useState('ALL');

  // Active Tables state (ensures tables are loaded whether passed via prop or not)
  const [activeTables, setActiveTables] = useState(() => (Array.isArray(tables) ? tables : []));
  const [loadingTables, setLoadingTables] = useState(false);

  const fetchActiveTables = useCallback(async () => {
    try {
      setLoadingTables(true);
      const res = await api.get('/api/v1/tables/active');
      const list = res.data?.data || [];
      if (Array.isArray(list) && isMountedRef.current) {
        setActiveTables(list);
      }
    } catch (err) {
      console.warn('Failed to load active tables in PosOrderTypeModal:', err?.message || err);
    } finally {
      if (isMountedRef.current) {
        setLoadingTables(false);
      }
    }
  }, []);

  useEffect(() => {
    if (Array.isArray(tables) && tables.length > 0) {
      return;
    }
    fetchActiveTables();
  }, [tables, fetchActiveTables]);

  useEffect(() => {
    if (Array.isArray(tables) && tables.length > 0) {
      setActiveTables(tables);
    }
  }, [tables]);

  // Set initial activeType once when configuration loads (without overriding user selection)
  const hasInitializedTypeRef = useRef(false);
  useEffect(() => {
    if (!hasInitializedTypeRef.current && config) {
      hasInitializedTypeRef.current = true;
      if (!isTableConfigOn) {
        setActiveType('TAKEAWAY');
      }
    } else if (config && activeType === 'DELIVERY' && !isDeliveryConfigOn) {
      setActiveType(isTableConfigOn ? 'TABLE' : 'TAKEAWAY');
    }
  }, [isTableConfigOn, isDeliveryConfigOn, config, activeType]);

  // Live Orders state (Strictly live orders only)
  const [liveOrders, setLiveOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [creditCustomers, setCreditCustomers] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);

  useEffect(() => {
    if (activeType === 'COMPLETED') {
      api.post('/api/v2/sales/dashboard', { status: 'COMPLETED', page: 0, size: 30 })
        .then(res => {
          const list = res.data?.data?.orders?.content || [];
          if (isMountedRef.current) {
            setCompletedOrders(list);
          }
        })
        .catch(() => {});
    }
  }, [activeType]);

  // Detail & Action Modals state
  const [selectedLiveOrder, setSelectedLiveOrder] = useState(null);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [cancelOrder, setCancelOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionBusy, setActionBusy] = useState(null);
  const [printOrder, setPrintOrder] = useState(null);
  const [printKind, setPrintKind] = useState('bill');

  // Change Table state (for transferring live table orders)
  const [changeTableOrder, setChangeTableOrder] = useState(null);
  const [changeTableSearch, setChangeTableSearch] = useState('');
  const [changeTableFloor, setChangeTableFloor] = useState('ALL');
  const [changeTableBusy, setChangeTableBusy] = useState(false);

  const handleLocalPrintDone = useCallback(() => {
    const printedOrder = printOrder;
    const printedKind = printKind;
    setPrintOrder(null);
    if (printedOrder?.id) {
      markCloudPrintJobPrinted(printedOrder, printedKind).catch(() => {});
    }
  }, [printOrder, printKind]);

  // Available tables filtering state
  const [tableSearch, setTableSearch] = useState('');

  const sym = config?.currencySymbol || '₹';
  const isMountedRef = useRef(true);

  // Fetch Live Orders
  const fetchLiveOrders = useCallback(async () => {
    try {
      setLoadingOrders(true);
      const res = await api.get('/api/v1/orders/sales/live');
      if (isMountedRef.current) {
        // Strictly filter to live orders only
        const raw = res.data?.data || [];
        const onlyLive = raw.filter(isLiveOrder);
        setLiveOrders(onlyLive);
      }
    } catch (err) {
      console.warn('Failed to fetch live sales orders:', err?.message || err);
    } finally {
      if (isMountedRef.current) {
        setLoadingOrders(false);
      }
    }
  }, []);

  // Fetch credit customers if credit is enabled
  useEffect(() => {
    if (config?.creditEnabled) {
      api.get('/api/v1/credit/customers', { params: { status: 'ACTIVE' } })
        .then(res => setCreditCustomers(res.data?.data || []))
        .catch(() => {});
    }
  }, [config?.creditEnabled]);

  // Polling for live orders every 10 seconds
  useEffect(() => {
    isMountedRef.current = true;
    fetchLiveOrders();

    const interval = setInterval(() => {
      fetchLiveOrders();
    }, 10000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchLiveOrders]);

  // Partition Live Orders by Fulfillment Type
  const { kitchenOrders, tableOrders, takeawayOrders, deliveryOrders, tableOrderMap } = useMemo(() => {
    const kitchen = [];
    const tableList = [];
    const takeaway = [];
    const delivery = [];
    const tableMap = new Map();

    for (const order of liveOrders) {
      const type = String(order.fulfillmentType || order.fulfillment_type || order.orderType || order.order_type || '').toUpperCase();
      const status = String(order.orderStatus || order.order_status || order.status || '').toUpperCase();
      const tableId = order.tableId || order.table_id;
      const tableNumber = order.tableNumber || order.table_number;
      const hasTable = tableNumber != null || tableId != null;

      if (tableId) {
        const idStr = String(tableId).trim().toLowerCase();
        tableMap.set(idStr, order);
        tableMap.set(String(tableId), order);
      }
      if (tableNumber) {
        const tRaw = String(tableNumber).trim();
        const tLower = tRaw.toLowerCase();
        tableMap.set(tLower, order);
        tableMap.set(tRaw, order);
        const stripped = tLower.replace(/^(table\s*|t)/i, '').trim();
        if (stripped) {
          tableMap.set(stripped, order);
          tableMap.set(`t${stripped}`, order);
          tableMap.set(`table ${stripped}`, order);
        }
      }

      // 1. Kitchen Orders (Live orders cooking/preparing/ready, or active dine-in table orders)
      const isCooking = status === 'KITCHEN' || status === 'IN_PROGRESS' || status === 'READY';
      if (isCooking || hasTable || type === 'DINE_IN') {
        kitchen.push(order);
      }

      // 2. Table / Dine In Orders
      if (hasTable || type === 'DINE_IN') {
        tableList.push(order);
      }

      // 3. Takeaway Orders
      if (type === 'TAKEAWAY' || type === 'PARCEL' || (!hasTable && type !== 'DELIVERY' && type !== 'DINE_IN')) {
        takeaway.push(order);
      }

      // 4. Delivery Orders
      if (type === 'DELIVERY') {
        delivery.push(order);
      }
    }

    return {
      kitchenOrders: kitchen,
      tableOrders: tableList,
      takeawayOrders: takeaway,
      deliveryOrders: delivery,
      tableOrderMap: tableMap
    };
  }, [liveOrders]);

  // Tabs configuration with live order counts
  const orderTabs = useMemo(() => {
    const tabs = [];

    if (isTableConfigOn) {
      tabs.push({
        key: 'TABLE',
        icon: <FaChair />,
        label: 'Dine in',
        accent: '#f97316',
        badge: tableOrders.length
      });
    }

    if (isKitchenEnabled) {
      tabs.push({
        key: 'KITCHEN',
        icon: <FaUtensils />,
        label: 'Kitchen Orders',
        accent: '#ea580c',
        badge: kitchenOrders.length
      });
    }

    tabs.push({
      key: 'TAKEAWAY',
      icon: <FaShoppingBag />,
      label: 'Takeaway',
      accent: '#10b981',
      badge: takeawayOrders.length
    });

    if (isDeliveryConfigOn) {
      tabs.push({
        key: 'DELIVERY',
        icon: <FaTruck />,
        label: 'Delivery',
        accent: '#3b82f6',
        badge: deliveryOrders.length
      });
    }

    return tabs;
  }, [isTableConfigOn, isKitchenEnabled, isDeliveryConfigOn, tableOrders.length, kitchenOrders.length, takeawayOrders.length, deliveryOrders.length]);

  // Group tables by floor
  const floors = useMemo(() => {
    return [...new Set(activeTables.map(t => t.floor).filter(Boolean))];
  }, [activeTables]);

  // Filter & sort tables
  const filteredTables = useMemo(() => {
    const list = floorFilter === 'ALL'
      ? [...activeTables]
      : activeTables.filter(t => t.floor === floorFilter);

    // Industry-standard natural alphanumeric sort:
    // 1. Group by alphabetic prefix (e.g., O, T, VIP, etc.)
    // 2. Sort groups alphabetically
    // 3. Sort numerically within each group
    // Result: O1, O2, O3, ..., T1, T2, T3, ..., VIP1, VIP2, ...
    return list.sort((a, b) => {
      const aStr = String(a.tableNumber || '');
      const bStr = String(b.tableNumber || '');
      const aMatch = aStr.match(/^([A-Za-z]*)\s*(\d+)(.*)$/);
      const bMatch = bStr.match(/^([A-Za-z]*)\s*(\d+)(.*)$/);

      if (aMatch && bMatch) {
        const prefixA = (aMatch[1] || '').toUpperCase();
        const prefixB = (bMatch[1] || '').toUpperCase();
        if (prefixA !== prefixB) return prefixA.localeCompare(prefixB);
        const numA = parseInt(aMatch[2], 10);
        const numB = parseInt(bMatch[2], 10);
        if (numA !== numB) return numA - numB;
        return (aMatch[3] || '').localeCompare(bMatch[3] || '');
      }

      // Fallback: natural locale compare
      return aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [activeTables, floorFilter]);

  // Helper to reliably find the active order for a given table
  const resolveActiveOrderForTable = useCallback((table) => {
    if (!table) return null;
    const tId = String(table.id || '').trim().toLowerCase();
    const tNum = String(table.tableNumber || '').trim();
    const tNumLower = tNum.toLowerCase();
    const stripped = tNumLower.replace(/^(table\s*|t)/i, '').trim();

    let order = (table.id && (tableOrderMap.get(tId) || tableOrderMap.get(String(table.id))))
      || tableOrderMap.get(tNumLower)
      || tableOrderMap.get(tNum)
      || (stripped ? tableOrderMap.get(stripped) : null)
      || (stripped ? tableOrderMap.get(`t${stripped}`) : null)
      || (stripped ? tableOrderMap.get(`table ${stripped}`) : null);

    if (!order && liveOrders?.length > 0) {
      order = liveOrders.find(o => {
        const oTId = String(o.tableId || o.table_id || '').trim().toLowerCase();
        const oTNum = String(o.tableNumber || o.table_number || '').trim().toLowerCase();
        const oStripped = oTNum.replace(/^(table\s*|t)/i, '').trim();
        return (tId && oTId === tId)
          || (tNumLower && oTNum === tNumLower)
          || (stripped && oStripped && stripped === oStripped);
      });
    }
    return order || null;
  }, [tableOrderMap, liveOrders]);

  // Available tables (tables with no active live order, ready for new dine-in guests)
  const availableTables = useMemo(() => {
    return filteredTables.filter(table => {
      // Must be active
      if (table.isactive === 'N' || table.is_active === 'N' || table.isActive === false || table.is_active === false) {
        return false;
      }

      // Status must strictly be AVAILABLE
      const status = String(table.status || 'AVAILABLE').toUpperCase();
      if (status !== 'AVAILABLE') {
        return false;
      }

      const activeOrder = resolveActiveOrderForTable(table);
      if (activeOrder) return false;
      return true;
    });
  }, [filteredTables, resolveActiveOrderForTable]);

  // Searched & Filtered available tables (by quick search query)
  const searchedAvailableTables = useMemo(() => {
    if (!tableSearch.trim()) return availableTables;
    const q = tableSearch.trim().toLowerCase();
    return availableTables.filter(t => {
      const num = String(t.tableNumber || '').toLowerCase();
      return num.includes(q) || `table ${num}`.includes(q) || `t${num}`.includes(q);
    });
  }, [availableTables, tableSearch]);

  // Available tables for moving/transferring a specific table order
  const availableMoveTables = useMemo(() => {
    if (!changeTableOrder) return [];
    const currentTableNum = String(changeTableOrder.tableNumber || '').trim().toLowerCase();
    const currentTableId = String(changeTableOrder.tableId || '').trim().toLowerCase();

    return activeTables.filter(table => {
      if (table.isactive === 'N' || table.is_active === 'N' || table.isActive === false || table.is_active === false) {
        return false;
      }
      const status = String(table.status || 'AVAILABLE').toUpperCase();
      if (status !== 'AVAILABLE') {
        return false;
      }
      const tId = String(table.id || '').trim().toLowerCase();
      const tNum = String(table.tableNumber || '').trim().toLowerCase();

      // Exclude current table
      if (tId && currentTableId && tId === currentTableId) return false;
      if (tNum && currentTableNum && tNum === currentTableNum) return false;

      // Exclude tables with active live orders
      const activeOrder = resolveActiveOrderForTable(table);
      if (activeOrder && String(activeOrder.id) !== String(changeTableOrder.id)) {
        return false;
      }

      return true;
    });
  }, [changeTableOrder, activeTables, resolveActiveOrderForTable]);

  // Filtered available move tables (by search query and floor)
  const filteredMoveTables = useMemo(() => {
    let list = changeTableFloor === 'ALL'
      ? [...availableMoveTables]
      : availableMoveTables.filter(t => t.floor === changeTableFloor);

    if (changeTableSearch.trim()) {
      const q = changeTableSearch.trim().toLowerCase();
      list = list.filter(t => {
        const num = String(t.tableNumber || '').toLowerCase();
        return num.includes(q) || `table ${num}`.includes(q) || `t${num}`.includes(q);
      });
    }

    return list.sort((a, b) => {
      const aStr = String(a.tableNumber || '');
      const bStr = String(b.tableNumber || '');
      const aMatch = aStr.match(/^([A-Za-z]*)\s*(\d+)(.*)$/);
      const bMatch = bStr.match(/^([A-Za-z]*)\s*(\d+)(.*)$/);
      if (aMatch && bMatch) {
        const prefixA = (aMatch[1] || '').toUpperCase();
        const prefixB = (bMatch[1] || '').toUpperCase();
        if (prefixA !== prefixB) return prefixA.localeCompare(prefixB);
        const numA = parseInt(aMatch[2], 10);
        const numB = parseInt(bMatch[2], 10);
        if (numA !== numB) return numA - numB;
        return (aMatch[3] || '').localeCompare(bMatch[3] || '');
      }
      return aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [availableMoveTables, changeTableFloor, changeTableSearch]);

  // Handle table change / transfer execution
  const handleMoveTable = async (order, targetTable) => {
    if (!order || !targetTable) return;
    setChangeTableBusy(true);
    try {
      await api.post(`/api/v1/orders/${order.id}/move-table`, {
        tableId: targetTable.id,
        tableNumber: targetTable.tableNumber,
      });
      notify('success', `Order moved to Table ${targetTable.tableNumber}`);
      setChangeTableOrder(null);
      setChangeTableSearch('');
      setChangeTableFloor('ALL');
      if (selectedLiveOrder && String(selectedLiveOrder.id) === String(order.id)) {
        setSelectedLiveOrder(prev => prev ? { ...prev, tableId: targetTable.id, tableNumber: targetTable.tableNumber } : null);
      }
      fetchLiveOrders();
      fetchActiveTables();
      onRefreshTables?.();
    } catch (err) {
      notify('error', 'Failed to move table: ' + (err.response?.data?.message || err.message));
    } finally {
      setChangeTableBusy(false);
    }
  };

  // Table click handler:
  // - Available tables -> start new order
  // - Billed or Occupied tables -> open order details modal (from which user can click "Settle Payment")
  const handleTableClick = async (table) => {
    const tableStatus = String(table.status || 'AVAILABLE').toUpperCase();
    let activeOrder = resolveActiveOrderForTable(table);

    // If table is billed or occupied, or has an active order
    if (tableStatus === 'BILLED' || tableStatus === 'OCCUPIED' || activeOrder) {
      if (activeOrder) {
        setPaymentOrder(null);
        setSelectedLiveOrder(activeOrder);
        return;
      }

      // If active order not yet in local state, fetch fresh live orders
      try {
        setActionBusy('fetch_order');
        const res = await api.get('/api/v1/orders/sales/live');
        const freshOrders = res.data?.data || [];
        const validLive = freshOrders.filter(isLiveOrder);
        setLiveOrders(validLive);

        const tId = String(table.id || '').trim().toLowerCase();
        const tNum = String(table.tableNumber || '').trim();
        const tNumLower = tNum.toLowerCase();
        const stripped = tNumLower.replace(/^(table\s*|t)/i, '').trim();

        const matched = validLive.find(o => {
          const oTId = String(o.tableId || o.table_id || '').trim().toLowerCase();
          const oTNum = String(o.tableNumber || o.table_number || '').trim().toLowerCase();
          const oStripped = oTNum.replace(/^(table\s*|t)/i, '').trim();
          return (tId && oTId === tId)
            || (tNumLower && oTNum === tNumLower)
            || (stripped && oStripped && stripped === oStripped);
        });

        if (matched) {
          setPaymentOrder(null);
          setSelectedLiveOrder(matched);
          return;
        }
      } catch (err) {
        console.warn('Failed to fetch table live order:', err);
      } finally {
        setActionBusy(null);
      }

      notify('info', `Table ${table.tableNumber} is marked ${tableStatus}, but has no active order to settle.`);
      return;
    }

    // Available table -> Start new order
    onSelect({ orderType: 'TABLE', table });
  };

  // Start a fresh new takeaway order
  const handleStartNewTakeaway = () => {
    onSelect({ orderType: 'TAKEAWAY', table: null });
  };

  // Start a fresh new delivery order
  const handleStartNewDelivery = () => {
    onSelect({ orderType: 'DELIVERY', table: null });
  };

  // Generic New Order Click (Header "+ New Order" button)
  const handleNewOrderClick = () => {
    if (activeType === 'TAKEAWAY') {
      onSelect?.({ orderType: 'TAKEAWAY', table: null });
    } else if (activeType === 'DELIVERY') {
      onSelect?.({ orderType: 'DELIVERY', table: null });
    } else if (activeType === 'TABLE') {
      const firstAvail = availableTables[0];
      if (firstAvail) {
        handleTableClick(firstAvail);
      } else {
        notify('info', 'No dining tables are currently available.');
      }
    } else {
      // Completed or other tab -> default to takeaway order
      onSelect?.({ orderType: 'TAKEAWAY', table: null });
    }
  };

  // Print Bill handler
  const handlePrintBill = async (order) => {
    let activeOrder = order;
    const orderId = order.id || order.orderId;
    const currentStatus = String(order?.orderStatus || order?.order_status || '').toUpperCase();

    // If order is not yet billed/completed/paid, call backend to mark as BILLED
    if (orderId && !['BILLED', 'COMPLETED', 'PAID', 'CANCELLED', 'VOID'].includes(currentStatus)) {
      try {
        const res = await api.post(`/api/v1/orders/${orderId}/bill`);
        if (res.data?.data) {
          activeOrder = res.data.data;
        }
        notify('success', 'Order billed successfully');
        fetchLiveOrders();
        onRefreshTables?.();
      } catch (e) {
        console.warn('Bill command notice:', e?.response?.data?.message || e.message);
      }
    } else if (orderId) {
      try {
        const res = await api.get(`/api/v1/orders/${orderId}`);
        if (res.data?.data) {
          activeOrder = res.data.data;
        }
      } catch (err) {
        console.warn('Failed to load full order for print:', err);
      }
    }

    if (typeof onPrintOrder === 'function') {
      onPrintOrder(activeOrder, 'bill');
      return;
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
      markCloudPrintJobPrinted(activeOrder, 'bill').catch(() => {});
    }
  };

  // Print KOT handler
  const handlePrintKot = async (order) => {
    if (typeof onPrintOrder === 'function') {
      onPrintOrder(order, 'kot');
      return;
    }
    let activeOrder = order;
    const orderId = order.id || order.orderId;
    if (orderId) {
      try {
        const res = await api.get(`/api/v1/orders/${orderId}`);
        if (res.data?.data) {
          activeOrder = res.data.data;
        }
      } catch (err) {
        console.warn('Failed to load full order for KOT print:', err);
      }
    }
    if (!localPrintWillHandleKind('kot')) {
      try {
        await enqueueCloudPrintJob(activeOrder, 'kot');
        notify('success', 'KOT print job enqueued to print station');
      } catch (e) {
        notify('error', 'Failed to queue print job: ' + (e.response?.data?.message || e.message));
      }
      return;
    }
    setPrintKind('kot');
    setPrintOrder({ ...activeOrder, _manualPrint: true });
    if (activeOrder?.id) {
      markCloudPrintJobPrinted(activeOrder, 'kot').catch(() => {});
    }
  };

  // Update order operational status (e.g. READY, OUT_FOR_DELIVERY)
  const handleUpdateStatus = async (orderId, nextStatus) => {
    setActionBusy(orderId);
    try {
      await api.patch(`/api/v1/orders/${orderId}/status?status=${nextStatus}`);
      notify('success', `Order status updated to ${nextStatus.replace(/_/g, ' ')}`);
      fetchLiveOrders();
      onRefreshTables?.();
    } catch (err) {
      notify('error', 'Failed to update order status: ' + (err.response?.data?.message || err.message));
    } finally {
      setActionBusy(null);
    }
  };

  // Cancel order handler
  const handleTriggerCancel = async () => {
    if (!cancelOrder) return;
    setActionBusy(cancelOrder.id);
    try {
      await api.post(`/api/v1/orders/${cancelOrder.id}/cancel`, {
        reason: cancelReason || 'Order cancelled from POS V2'
      });
      notify('success', 'Order cancelled successfully');
      setCancelOrder(null);
      setSelectedLiveOrder(null);
      fetchLiveOrders();
      onRefreshTables?.();
    } catch (e) {
      notify('error', 'Failed to cancel order: ' + (e.response?.data?.message || e.message));
    } finally {
      setActionBusy(null);
    }
  };

  // Settle payment confirm handler
  const handleConfirmPayment = async (settlementPayload) => {
    if (!paymentOrder) return;
    setActionBusy('settle');
    try {
      let settleId = paymentOrder.id;
      if (settlementPayload?.updatedOrder) {
        const orderPayload = {
          ...settlementPayload.updatedOrder,
          paymentStatus: 'PENDING'
        };
        const putRes = await api.patch(`/api/v1/orders/${paymentOrder.id}`, orderPayload);
        const newId = putRes?.data?.data?.id;
        if (newId) settleId = newId;
      }

      const payloadToSend = {
        ...settlementPayload,
        ...(settlementPayload?.paymentMethod === 'CREDIT' ? { roundOffAmount: 0 } : {}),
        skipAutoPrintKinds: [...(settlementPayload.skipAutoPrintKinds || []), 'bill'],
        // Forward customer attachment from PaymentDialog (if cashier selected a customer)
        ...(settlementPayload.customerId ? { customerId: settlementPayload.customerId } : {}),
        ...(settlementPayload.customerName ? { customerName: settlementPayload.customerName } : {}),
        ...(settlementPayload.customerPhone ? { customerPhone: settlementPayload.customerPhone } : {}),
      };

      const url = payloadToSend.paymentMethod === 'CREDIT'
        ? `/api/v1/orders/${settleId}/complete-credit`
        : `/api/v1/orders/${settleId}/settle`;

      await api.post(url, payloadToSend);
      notify('success', 'Payment settled successfully');
      setPaymentOrder(null);
      setSelectedLiveOrder(null);
      fetchLiveOrders();
      onRefreshTables?.();
    } catch (e) {
      notify('error', 'Payment settlement failed: ' + (e.response?.data?.message || e.message));
    } finally {
      setActionBusy(null);
    }
  };

  /* ─── Render Order Box Grid (Same cube boxes as kitchen/tables) ─── */
  const renderOrderBoxGrid = (ordersList, orderType) => {
    const isTakeaway = orderType === 'TAKEAWAY';
    const isDelivery = orderType === 'DELIVERY';
    const isKitchen = orderType === 'KITCHEN';

    const onNewClick = isTakeaway ? handleStartNewTakeaway : (isDelivery ? handleStartNewDelivery : handleNewOrderClick);

    return (
      <div className="pos-cube-grid" style={S.cubeGrid}>
        {/* "+ New" Action Cube (Identical 60x60 cube as tables) */}
        {!isKitchen && (
          <button
            type="button"
            className="pos-table-cube pos-new-cube"
            title={`Start a new ${isTakeaway ? 'takeaway' : 'delivery'} order`}
            style={{
              ...S.cube,
              background: '#ffffff',
              border: '1.5px dashed #cbd5e1',
              boxShadow: 'none',
              cursor: 'pointer'
            }}
            onClick={onNewClick}
          >
            <FaPlus size={13} style={{ color: '#ea580c', marginBottom: 2 }} />
            <span style={{ fontSize: 10, fontWeight: 800, color: '#ea580c' }}>New</span>
          </button>
        )}

        {/* Live Order Cubes (Same 60x60 cube boxes as kitchen/tables: Red=Occupied, Green=Billed) */}
        {ordersList.map(order => {
          const statusStyle = orderCubeStyle(order.orderStatus);
          const orderNum = order.tableNumber
            ? `T${order.tableNumber}`
            : (order.dailyBillNo || order.orderNo?.slice?.(-4) || String(order.id).slice(-4));
          const isHov = hoveredTable === order.id;

          return (
            <button
              key={order.id}
              type="button"
              className="pos-table-cube"
              style={{
                ...S.cube,
                background: statusStyle.bg,
                border: `1.5px solid ${isHov ? '#ffffff' : statusStyle.border}`,
                boxShadow: isHov ? '0 8px 20px rgba(0,0,0,0.25)' : 'none',
                transform: isHov ? 'scale(1.08)' : 'scale(1)',
                cursor: 'pointer'
              }}
              onClick={() => setSelectedLiveOrder(order)}
              onMouseEnter={() => setHoveredTable(order.id)}
              onMouseLeave={() => setHoveredTable(null)}
              title={`Order #${orderNum} — ${statusStyle.label}${order.customerName ? ` (${order.customerName})` : ''} · ${money(order.grandTotal, sym)} (Click to view)`}
            >
              <span className="pos-table-num" style={{
                ...S.cubeNum,
                color: statusStyle.fg,
                fontSize: String(orderNum).length > 3 ? 12 : 14,
                textShadow: '0 1px 2px rgba(0,0,0,0.3)'
              }}>
                {order.tableNumber ? `T${order.tableNumber}` : `#${orderNum}`}
              </span>
              {order.customerName && (
                <span style={{
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.92)',
                  maxWidth: 52,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontWeight: 600,
                  marginTop: 1
                }}>
                  {order.customerName}
                </span>
              )}
              {/* Pulsing Live Dot */}
              <span style={S.tableLiveDot} />
            </button>
          );
        })}
      </div>
    );
  };

  /* ─── Render Live Orders in Grid View (fallback alias) ─── */
  const renderLiveOrderGrid = (ordersList) => renderOrderBoxGrid(ordersList, activeType);

  /* ─── Render Live Orders in Board View (All order cards with full details & buttons) ─── */
  const renderLiveOrderBoard = (ordersList, customOrderType) => {
    const currentType = customOrderType || activeType;
    const isTakeawayOrDelivery = currentType === 'TAKEAWAY' || currentType === 'DELIVERY';
    const onNewOrder = isTakeawayOrDelivery
      ? (currentType === 'DELIVERY' ? handleStartNewDelivery : handleStartNewTakeaway)
      : null;
    const newOrderLabel = currentType === 'DELIVERY' ? '+ New Delivery' : '+ New Takeaway';

    if ((!ordersList || ordersList.length === 0) && !onNewOrder) {
      return (
        <div style={S.emptyStateBox}>
          <FaUtensils size={36} style={{ color: '#cbd5e1' }} />
          <div style={S.emptyTitle}>No Active Orders</div>
          <div style={S.emptySub}>Active live orders will appear here with full line items and quick actions.</div>
        </div>
      );
    }

    return (
      <LiveOrderBoardSlider
        ordersList={ordersList || []}
        sym={sym}
        actionBusy={actionBusy}
        canCancelOrder={canCancelOrder}
        timezone={timezone}
        onNewOrder={onNewOrder}
        newOrderLabel={newOrderLabel}
        onSelectOrder={setSelectedLiveOrder}
        onPrintKot={handlePrintKot}
        onPrintBill={handlePrintBill}
        onDownloadInvoice={async (order) => {
          try {
            await downloadInvoicePdf(order);
          } catch (e) {
            notify('error', 'Failed to download invoice: ' + e.message);
          }
        }}
        onUpdateStatus={handleUpdateStatus}
        onSettleOrder={(order) => {
          setSelectedLiveOrder(null);
          setPaymentOrder(order);
        }}
        onEditOrder={(order) => {
          setSelectedLiveOrder(null);
          setEditingOrder(order);
        }}
        onCancelOrder={(order) => {
          setSelectedLiveOrder(null);
          setCancelReason('');
          setCancelOrder(order);
        }}
        onChangeTable={setChangeTableOrder}
      />
    );
  };

  return (
    <div className="pos-order-modal-root" style={S.overlay}>
      {/* ── Top Control Bar (matching POS V2 screenshot) ── */}
      <div className="pos-top-control-bar" style={S.controlBar}>
        {/* 1. Far Left: Audio Sound Alert Toggle Buttons */}
        <div className="pos-sound-toggle-group" style={S.soundToggleGroup}>
          <button
            type="button"
            style={soundEnabled ? S.soundBtnActiveGreen : S.soundBtnInactive}
            onClick={() => handleToggleSound(true)}
            title="Sound Alerts: ON"
          >
            <FaVolumeUp size={15} style={{ color: soundEnabled ? '#059669' : '#94a3b8' }} />
          </button>
          <button
            type="button"
            style={!soundEnabled ? S.soundBtnActiveMute : S.soundBtnInactive}
            onClick={() => handleToggleSound(false)}
            title="Sound Alerts: MUTED"
          >
            <FaVolumeMute size={15} style={{ color: !soundEnabled ? '#dc2626' : '#94a3b8' }} />
          </button>

          {/* Push Notification Toggles */}
          <button
            type="button"
            style={{
              ...S.soundBtnInactive,
              background: notifEnabled ? '#0ea5e9' : '#ffffff',
              color: notifEnabled ? '#ffffff' : '#94a3b8',
              borderColor: notifEnabled ? '#0ea5e9' : '#e2e8f0',
              marginLeft: 6
            }}
            onClick={toggleNotif}
            title={notifEnabled ? "Disable Push Notifications" : "Enable Push Notifications"}
          >
            {notifEnabled ? <FaBell size={15} /> : <FaBellSlash size={15} />}
          </button>
          
          {notifEnabled && (
            <>
              <button
                type="button"
                style={{
                  ...S.soundBtnInactive,
                  background: notifyKitchen ? '#16a34a' : '#ffffff',
                  color: notifyKitchen ? '#ffffff' : '#94a3b8',
                  borderColor: notifyKitchen ? '#16a34a' : '#e2e8f0',
                  fontSize: 12,
                  fontWeight: 'bold',
                }}
                onClick={toggleKitchenPref}
                title={notifyKitchen ? "Disable Kitchen Push Alerts" : "Enable Kitchen Push Alerts"}
              >
                Kit
              </button>
              <button
                type="button"
                style={{
                  ...S.soundBtnInactive,
                  background: notifyTakeaway ? '#ea580c' : '#ffffff',
                  color: notifyTakeaway ? '#ffffff' : '#94a3b8',
                  borderColor: notifyTakeaway ? '#ea580c' : '#e2e8f0',
                  fontSize: 12,
                  fontWeight: 'bold',
                }}
                onClick={toggleTakeawayPref}
                title={notifyTakeaway ? "Disable Takeaway Push Alerts" : "Enable Takeaway Push Alerts"}
              >
                Tak
              </button>
              <button
                type="button"
                style={{
                  ...S.soundBtnInactive,
                  background: notifyDelivery ? '#0284c7' : '#ffffff',
                  color: notifyDelivery ? '#ffffff' : '#94a3b8',
                  borderColor: notifyDelivery ? '#0284c7' : '#e2e8f0',
                  fontSize: 12,
                  fontWeight: 'bold',
                }}
                onClick={toggleDeliveryPref}
                title={notifyDelivery ? "Disable Delivery Push Alerts" : "Enable Delivery Push Alerts"}
              >
                Del
              </button>
              <button
                type="button"
                style={{
                  ...S.soundBtnInactive,
                  background: notifySettled ? '#8b5cf6' : '#ffffff',
                  color: notifySettled ? '#ffffff' : '#94a3b8',
                  borderColor: notifySettled ? '#8b5cf6' : '#e2e8f0',
                  fontSize: 12,
                  fontWeight: 'bold',
                }}
                onClick={toggleSettledPref}
                title={notifySettled ? "Disable Settled Push Alerts" : "Enable Settled Push Alerts"}
              >
                Set
              </button>
            </>
          )}
        </div>

        {/* 2. Center: Segmented Order Filter Tabs */}
        <div className="pos-segmented-container" style={S.segmentedContainer}>
          {isTableConfigOn && (
            <button
              type="button"
              className="pos-segmented-tab"
              style={activeType === 'TABLE' ? S.segmentedTabActive : S.segmentedTab}
              onClick={() => setActiveType('TABLE')}
            >
              <FaUtensils size={13} style={{ marginRight: 7, color: activeType === 'TABLE' ? '#0f172a' : '#64748b' }} />
              <span>Table</span>
              <span className="pos-tab-badge" style={activeType === 'TABLE' ? S.tabCountBadgeActive : S.tabCountBadge}>
                {tableOrders.length}
              </span>
            </button>
          )}

          <button
            type="button"
            className="pos-segmented-tab"
            style={activeType === 'TAKEAWAY' ? S.segmentedTabActive : S.segmentedTab}
            onClick={() => setActiveType('TAKEAWAY')}
          >
            <FaShoppingBag size={13} style={{ marginRight: 7, color: activeType === 'TAKEAWAY' ? '#0f172a' : '#64748b' }} />
            <span>Takeaway</span>
            <span className="pos-tab-badge" style={activeType === 'TAKEAWAY' ? S.tabCountBadgeActive : S.tabCountBadge}>
              {takeawayOrders.length}
            </span>
          </button>

          {isDeliveryConfigOn && (
            <button
              type="button"
              className="pos-segmented-tab"
              style={activeType === 'DELIVERY' ? S.segmentedTabActive : S.segmentedTab}
              onClick={() => setActiveType('DELIVERY')}
            >
              <FaTruck size={13} style={{ marginRight: 7, color: activeType === 'DELIVERY' ? '#0f172a' : '#64748b' }} />
              <span>Delivery</span>
              <span className="pos-tab-badge" style={activeType === 'DELIVERY' ? S.tabCountBadgeActive : S.tabCountBadge}>
                {deliveryOrders.length}
              </span>
            </button>
          )}
        </div>

        {/* 3. Right: View Mode Toggle & Orange New Order Button */}
        <div className="pos-right-ctrl-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="pos-viewmode-toggle-box" style={S.viewModeToggleBox}>
            <button
              type="button"
              style={viewMode === 'standard' ? S.viewModeBtnActive : S.viewModeBtnInactive}
              onClick={() => setViewMode('standard')}
            >
              Standard
            </button>
            <button
              type="button"
              style={viewMode === 'board' ? S.viewModeBtnActive : S.viewModeBtnInactive}
              onClick={() => setViewMode('board')}
            >
              Board
            </button>
          </div>
        </div>
      </div>

      {/* ── Tab Content Container ── */}
      <div className="pos-content-body" style={S.contentBody}>

        {/* ── 1. KITCHEN / DINE IN TAB ── */}
        {activeType === 'TABLE' && (
          <div style={S.tabPane}>
            {viewMode === 'board' ? (
              <div className="pos-board-split-wrap" style={S.boardTableSplitWrap}>
                {/* LEFT SIDE: Available Tables Vertical Sidebar with Tiny White Boxes (Table Name Only) */}
                <div className="pos-board-left-sidebar" style={S.boardLeftTablesSidebar}>
                  <div className="pos-board-left-tables-header" style={S.boardLeftTablesHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={S.boardLeftTablesTitle}>
                        <FaChair size={13} style={{ color: '#059669', marginRight: 6 }} />
                        Tables
                      </span>
                      <span style={S.boardAvailableTablesBadge}>
                        {availableTables.length} Free
                      </span>
                    </div>

                    {/* Quick Search Table Input */}
                    <div className="pos-table-search-wrap-left" style={S.tableSearchWrapLeft}>
                      <FaSearch size={11} style={{ color: '#94a3b8', marginLeft: 8 }} />
                      <input
                        type="text"
                        placeholder="Search table #..."
                        value={tableSearch}
                        onChange={e => setTableSearch(e.target.value)}
                        style={S.tableSearchInputLeft}
                      />
                      {tableSearch && (
                        <button
                          type="button"
                          onClick={() => setTableSearch('')}
                          style={S.clearSearchBtn}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Floor Filter (if multiple floors) */}
                    {floors.length > 1 && (
                      <div style={S.floorRowCompact}>
                        <button
                          type="button"
                          style={S.floorPillCompact(floorFilter === 'ALL')}
                          onClick={() => setFloorFilter('ALL')}
                        >
                          All
                        </button>
                        {floors.map(f => (
                          <button
                            key={f}
                            type="button"
                            style={S.floorPillCompact(floorFilter === f)}
                            onClick={() => setFloorFilter(f)}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Tiny White Boxes Grid (Table Name Only) */}
                  <div className="pos-board-tiny-boxes-grid hide-board-scrollbar" style={S.boardTinyBoxesGrid}>
                    {searchedAvailableTables.length > 0 ? (
                      searchedAvailableTables.map(table => (
                        <button
                          key={table.id}
                          type="button"
                          className="tiny-table-box"
                          style={S.tinyTableBox}
                          onClick={() => handleTableClick(table)}
                          title={`Table ${table.tableNumber}${table.seatingCapacity ? ` (${table.seatingCapacity} seats)` : ''} - Click to start order`}
                        >
                          {table.tableNumber}
                        </button>
                      ))
                    ) : (
                      <div style={S.noTablesLeftText}>
                        {tableSearch ? `No table "${tableSearch}"` : 'All occupied'}
                      </div>
                    )}
                  </div>
                </div>

                {/* RIGHT SIDE: Live Orders in Board Mode */}
                <div className="pos-board-right-orders" style={S.boardRightOrdersPanel}>
                  {tableOrders.length === 0 ? (
                    <div style={S.emptyStateBox}>
                      <FaChair size={36} style={{ color: '#cbd5e1' }} />
                      <div style={S.emptyTitle}>No Active Dine-in Orders</div>
                      <div style={S.emptySub}>
                        {availableTables.length > 0
                          ? 'Select an available table on the left to begin an order.'
                          : 'Switch to Standard view or click "+ New Order" to start.'}
                      </div>
                    </div>
                  ) : (
                    renderLiveOrderBoard(tableOrders)
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Table Toolbar */}
                <div className="pos-table-toolbar" style={S.tableToolbar}>
                  <div className="pos-legend" style={S.legend}>
                    {Object.entries(STATUS_CUBE).map(([k, v]) => (
                      <span key={k} className="pos-legend-item" style={S.legendItem}>
                        <span className="pos-legend-dot" style={{ ...S.legendDot, background: v.bg, border: `1px solid ${v.border || 'transparent'}` }} />
                        {v.label}
                      </span>
                    ))}
                  </div>
                  {floors.length > 1 && (
                    <div style={S.floorRow}>
                      <button
                        style={S.floorPill(floorFilter === 'ALL')}
                        onClick={() => setFloorFilter('ALL')}
                      >
                        All Floors
                      </button>
                      {floors.map(f => (
                        <button
                          key={f}
                          style={S.floorPill(floorFilter === f)}
                          onClick={() => setFloorFilter(f)}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Table Grid (Box view as tables) */}
                {loadingTables && activeTables.length === 0 ? (
                  <div style={{ ...S.emptyStateBox, padding: '32px 16px' }}>
                    <div style={{
                      width: 24,
                      height: 24,
                      border: '3px solid #e2e8f0',
                      borderTopColor: '#f97316',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite'
                    }} />
                    <div style={S.emptyTitle}>Loading Available Tables...</div>
                  </div>
                ) : filteredTables.length === 0 ? (
                  <div style={{ ...S.emptyStateBox, padding: '32px 16px' }}>
                    <FaChair size={30} style={{ color: '#cbd5e1' }} />
                    <div style={S.emptyTitle}>No Available Tables</div>
                    <div style={S.emptySub}>No active dining tables found. You can start a Takeaway order or configure tables in settings.</div>
                  </div>
                ) : (
                  <div className="pos-cube-grid" style={S.cubeGrid}>
                    {filteredTables.map(table => {
                      const activeOrder = resolveActiveOrderForTable(table);
                      const hasOrder = Boolean(activeOrder);
                      const status = String(table.status || 'AVAILABLE').toUpperCase();
                      let cube = cubeColor(status);
                      if (hasOrder) {
                        const s = String(activeOrder.orderStatus || '').toUpperCase();
                        cube = s === 'BILLED'
                          ? { bg: '#10b981', fg: '#ffffff', border: '#059669', label: 'Billed' }
                          : { bg: '#ef4444', fg: '#ffffff', border: '#dc2626', label: 'Occupied' };
                      }
                      const isOccupiedOrBilled = status === 'BILLED' || status === 'OCCUPIED' || hasOrder;
                      const isAvail = status === 'AVAILABLE' && !hasOrder;
                      const isHov = hoveredTable === table.id;

                      return (
                        <button
                          key={table.id}
                          className="pos-table-cube"
                          title={`Table ${table.tableNumber} — ${cube.label}${isOccupiedOrBilled ? ' (Click to view order / settle)' : ' (Click to start order)'}`}
                          style={{
                            ...S.cube,
                            background: isHov
                              ? (isAvail ? '#fff7ed' : cube.bg)
                              : (isAvail ? '#ffffff' : cube.bg),
                            border: `1.5px solid ${isHov ? '#f97316' : (cube.border || '#cbd5e1')}`,
                            boxShadow: isHov ? '0 8px 20px rgba(0,0,0,0.1)' : 'none',
                            transform: isHov ? 'scale(1.08)' : 'scale(1)',
                            cursor: 'pointer'
                          }}
                          onClick={() => handleTableClick(table)}
                          onMouseEnter={() => setHoveredTable(table.id)}
                          onMouseLeave={() => setHoveredTable(null)}
                        >
                          <span className="pos-table-num" style={{
                            ...S.cubeNum,
                            color: isAvail ? '#0f172a' : cube.fg || 'white',
                            textShadow: isAvail ? 'none' : '0 1px 2px rgba(0,0,0,0.25)'
                          }}>
                            {table.tableNumber}
                          </span>
                          {hasOrder && (
                            <span className="pos-table-live-dot" style={S.tableLiveDot} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── KITCHEN ORDERS TAB (LIVE ONLY) ── */}
        {activeType === 'KITCHEN' && (
          <div style={S.tabPane}>
            {viewMode === 'board' ? (
              kitchenOrders.length === 0 ? (
                <div style={S.emptyStateBox}>
                  <FaUtensils size={36} style={{ color: '#cbd5e1' }} />
                  <div style={S.emptyTitle}>No Live Kitchen Orders</div>
                  <div style={S.emptySub}>Active orders sent to the kitchen will be displayed here in real time.</div>
                </div>
              ) : (
                renderLiveOrderBoard(kitchenOrders)
              )
            ) : (
              <>
                {/* Status Legend (Red: Occupied, Green: Billed) */}
                <div style={S.tableToolbar}>
                  <div style={S.legend}>
                    <span style={S.legendItem}>
                      <span style={{ ...S.legendDot, background: '#ef4444', border: '1px solid #dc2626' }} />
                      Occupied
                    </span>
                    <span style={S.legendItem}>
                      <span style={{ ...S.legendDot, background: '#10b981', border: '1px solid #059669' }} />
                      Billed
                    </span>
                  </div>
                </div>

                {kitchenOrders.length === 0 ? (
                  <div style={S.emptyStateBox}>
                    <FaUtensils size={36} style={{ color: '#cbd5e1' }} />
                    <div style={S.emptyTitle}>No Live Kitchen Orders</div>
                    <div style={S.emptySub}>Active orders sent to the kitchen will be displayed here in real time.</div>
                  </div>
                ) : (
                  renderOrderBoxGrid(kitchenOrders, 'KITCHEN')
                )}
              </>
            )}
          </div>
        )}

        {/* ── 2. TAKEAWAY TAB ── */}
        {activeType === 'TAKEAWAY' && (
          <div style={S.tabPane}>
            {viewMode === 'board' ? (
              renderLiveOrderBoard(takeawayOrders, 'TAKEAWAY')
            ) : (
              <>
                {/* Status Legend (Red: Occupied, Green: Billed, White: New Order) */}
                <div className="pos-table-toolbar" style={S.tableToolbar}>
                  <div className="pos-legend" style={S.legend}>
                    <span className="pos-legend-item" style={S.legendItem}>
                      <span style={{ ...S.legendDot, background: '#ef4444', border: '1px solid #dc2626' }} />
                      Occupied
                    </span>
                    <span className="pos-legend-item" style={S.legendItem}>
                      <span style={{ ...S.legendDot, background: '#10b981', border: '1px solid #059669' }} />
                      Billed
                    </span>
                    <span className="pos-legend-item" style={S.legendItem}>
                      <span style={{ ...S.legendDot, background: '#ffffff', border: '1.5px dashed #cbd5e1' }} />
                      New Order
                    </span>
                  </div>
                </div>

                {renderOrderBoxGrid(takeawayOrders, 'TAKEAWAY')}
              </>
            )}
          </div>
        )}

        {/* ── 3. DELIVERY TAB ── */}
        {activeType === 'DELIVERY' && isDeliveryConfigOn && (
          <div style={S.tabPane}>
            {viewMode === 'board' ? (
              renderLiveOrderBoard(deliveryOrders, 'DELIVERY')
            ) : (
              <>
                {/* Status Legend */}
                <div className="pos-table-toolbar" style={S.tableToolbar}>
                  <div className="pos-legend" style={S.legend}>
                    <span className="pos-legend-item" style={S.legendItem}>
                      <span style={{ ...S.legendDot, background: '#ef4444', border: '1px solid #dc2626' }} />
                      Occupied
                    </span>
                    <span className="pos-legend-item" style={S.legendItem}>
                      <span style={{ ...S.legendDot, background: '#10b981', border: '1px solid #059669' }} />
                      Billed
                    </span>
                    <span className="pos-legend-item" style={S.legendItem}>
                      <span style={{ ...S.legendDot, background: '#ffffff', border: '1.5px dashed #cbd5e1' }} />
                      New Order
                    </span>
                  </div>
                </div>

                {renderOrderBoxGrid(deliveryOrders, 'DELIVERY')}
              </>
            )}
          </div>
        )}

      </div>

      {/* ── Live Order Details Modal ── */}
      {selectedLiveOrder && (
        <div style={S.modalBackdrop} onClick={() => setSelectedLiveOrder(null)}>
          <div className="pos-modal-dialog-responsive" style={S.modalDialog} onClick={e => e.stopPropagation()}>
            <div className="pos-modal-header-responsive" style={S.modalHeader}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
                {/* Primary Title Row: Token Badge, Main Title (Table / Order Type), Status Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {selectedLiveOrder.dailyBillNo && (
                    <span style={S.tokenHeaderBadge} title="Daily Token / Bill Number">
                      #{selectedLiveOrder.dailyBillNo}
                    </span>
                  )}
                  <span style={S.modalMainTitle}>
                    {selectedLiveOrder.tableNumber ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          background: '#fff7ed',
                          color: '#c2410c',
                          border: '1.5px solid #fdba74',
                          padding: '3px 10px',
                          borderRadius: 8,
                          cursor: !['COMPLETED', 'CANCELLED', 'VOID'].includes(String(selectedLiveOrder.orderStatus || '').toUpperCase()) ? 'pointer' : 'default',
                          fontSize: 14,
                          fontWeight: 800,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={() => {
                          if (!['COMPLETED', 'CANCELLED', 'VOID'].includes(String(selectedLiveOrder.orderStatus || '').toUpperCase())) {
                            setChangeTableOrder(selectedLiveOrder);
                          }
                        }}
                        title={!['COMPLETED', 'CANCELLED', 'VOID'].includes(String(selectedLiveOrder.orderStatus || '').toUpperCase()) ? 'Click to change table' : `Table ${selectedLiveOrder.tableNumber}`}
                      >
                        <FaChair size={14} style={{ color: '#ea580c', opacity: 0.9 }} />
                        <span>Table {String(selectedLiveOrder.tableNumber).replace(/^t/i, '')}</span>
                        {!['COMPLETED', 'CANCELLED', 'VOID'].includes(String(selectedLiveOrder.orderStatus || '').toUpperCase()) && (
                          <FaExchangeAlt size={10} style={{ opacity: 0.75, marginLeft: 2 }} />
                        )}
                      </span>
                    ) : (
                      selectedLiveOrder.fulfillmentType || 'Takeaway'
                    )}
                  </span>

                  {(() => {
                    const s = String(selectedLiveOrder.orderStatus || 'ACTIVE').toUpperCase();
                    const isBilled = s === 'BILLED';
                    const isReady = s === 'READY';
                    const label = s === 'KITCHEN' ? 'ORDERED' : s.replace(/_/g, ' ');
                    const bg = isBilled ? '#ecfdf5' : (isReady ? '#f0fdf4' : '#fff7ed');
                    const color = isBilled ? '#047857' : (isReady ? '#15803d' : '#c2410c');
                    const border = isBilled ? '#a7f3d0' : (isReady ? '#86efac' : '#fed7aa');
                    const dot = isBilled ? '#10b981' : (isReady ? '#22c55e' : '#ea580c');
                    return (
                      <span style={{
                        ...S.modalStatusPill,
                        background: bg,
                        color: color,
                        border: `1px solid ${border}`
                      }}>
                        <span className="pos-status-pulse-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: dot, display: 'inline-block', boxShadow: `0 0 6px ${dot}` }} />
                        {label}
                      </span>
                    );
                  })()}
                </div>

                {/* Subtitle: Clean metadata row with Order ID, Time, Customer */}
                <div style={S.modalSubtitleRow}>
                  <span style={S.modalOrderRefText} title="Order Reference">
                    Order #{selectedLiveOrder.orderNo || selectedLiveOrder.order_no || String(selectedLiveOrder.id).slice(0, 8)}
                  </span>
                  <span style={{ color: '#cbd5e1' }}>•</span>
                  <span style={S.modalTimeText}>
                    <FaClock size={10} style={{ opacity: 0.7, marginRight: 4 }} />
                    {formatOrderTime(selectedLiveOrder.orderDate || selectedLiveOrder.order_date || selectedLiveOrder.createdAt || selectedLiveOrder.updatedAt, timezone)}
                  </span>
                  {(selectedLiveOrder.customerName || selectedLiveOrder.customerPhone) && (
                    <>
                      <span style={{ color: '#cbd5e1' }}>•</span>
                      <span style={S.modalCustomerText}>
                        <FaUser size={10} style={{ opacity: 0.7, marginRight: 4 }} />
                        {selectedLiveOrder.customerName || 'Guest'}
                        {selectedLiveOrder.customerPhone ? ` (${selectedLiveOrder.customerPhone})` : ''}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                className="pos-modal-close-btn"
                style={S.modalCloseIcon}
                onClick={() => setSelectedLiveOrder(null)}
                title="Close (Esc)"
              >
                <FaTimes size={15} />
              </button>
            </div>

            <div className="pos-modal-body-responsive" style={S.modalBody}>
              {/* Items List */}
              <div style={S.orderItemsBox}>
                <div className="pos-order-items-header-res" style={S.orderItemsHeader}>
                  <span style={{ textAlign: 'left' }}>Item</span>
                  <span style={{ textAlign: 'center' }}>Qty</span>
                  <span style={{ textAlign: 'right' }}>Price</span>
                  <span style={{ textAlign: 'right' }}>Total</span>
                </div>

                <div style={S.orderItemsList} className="hide-board-scrollbar">
                  {(selectedLiveOrder.lines || []).map((item, idx) => (
                    <div key={idx} className="pos-modal-item-row pos-order-item-row-res" style={S.orderItemRow}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, overflow: 'hidden' }}>
                        <span style={S.itemNameText}>{item.productName || item.itemName || item.name || 'Item'}</span>
                        {item.notes && <span style={S.itemNotesText}>{item.notes}</span>}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <span style={S.itemQtyBadge}>{item.quantity || item.qty || 1}</span>
                      </div>
                      <span style={S.itemUnitPriceText}>{money(getItemUnitPrice(item), sym)}</span>
                      <span style={S.itemTotalText}>{money(getItemLineTotal(item), sym)}</span>
                    </div>
                  ))}
                </div>

                <div style={S.orderTotalRow}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={S.orderTotalLabel}>Grand Total</span>
                    <span style={S.orderTotalSubtext}>
                      {(selectedLiveOrder.lines || []).reduce((sum, l) => sum + Number(l.quantity || 1), 0)} items
                    </span>
                  </div>
                  <span style={S.orderGrandTotalVal}>{money(selectedLiveOrder.grandTotal, sym)}</span>
                </div>
              </div>
            </div>

            {/* Modal Actions Footer: Clean 2-Row Professional Layout */}
            <div className="pos-order-modal-footer" style={S.modalFooter}>
              {/* Row 1: Auxiliary Tools Toolbar (Bill, KOT, Invoice, Edit, Cancel) arranged neatly at top */}
              <div className="pos-modal-aux-grid" style={S.modalAuxGrid}>
                <button
                  type="button"
                  className="pos-action-bar-btn"
                  style={S.actionBarBtn}
                  onClick={() => handlePrintBill(selectedLiveOrder)}
                  title="Print Bill"
                >
                  <FaPrint size={13} style={{ color: '#0284c7' }} />
                  <span>Bill</span>
                </button>
                <button
                  type="button"
                  className="pos-action-bar-btn"
                  style={S.actionBarBtn}
                  onClick={() => handlePrintKot(selectedLiveOrder)}
                  title="Print KOT"
                >
                  <FaUtensils size={13} style={{ color: '#ea580c' }} />
                  <span>KOT</span>
                </button>
                <button
                  type="button"
                  className="pos-action-bar-btn"
                  style={S.actionBarBtn}
                  onClick={async () => {
                    try {
                      await downloadInvoicePdf(selectedLiveOrder);
                    } catch (e) {
                      notify('error', 'Failed to download invoice: ' + e.message);
                    }
                  }}
                  title="Download Invoice PDF"
                >
                  <FaFileInvoice size={13} style={{ color: '#7c3aed' }} />
                  <span>Invoice</span>
                </button>
                <button
                  type="button"
                  className="pos-action-bar-btn"
                  style={S.actionBarBtn}
                  onClick={() => {
                    const orderToEdit = selectedLiveOrder;
                    setSelectedLiveOrder(null);
                    setEditingOrder(orderToEdit);
                  }}
                  title="Edit Order"
                >
                  <FaEdit size={13} style={{ color: '#0d9488' }} />
                  <span>Edit</span>
                </button>
                {canCancelOrder && (
                  <button
                    type="button"
                    className="pos-action-bar-btn pos-action-bar-btn-cancel"
                    style={S.actionBarBtnCancel}
                    onClick={() => {
                      const orderToCancel = selectedLiveOrder;
                      setSelectedLiveOrder(null);
                      setCancelReason('');
                      setCancelOrder(orderToCancel);
                    }}
                    title="Cancel Order"
                  >
                    <FaTimesCircle size={13} style={{ color: '#e11d48' }} />
                    <span>Cancel</span>
                  </button>
                )}
              </div>

              {/* Row 2: Prominent Centered Settle Payment Button */}
              <div className="pos-modal-settle-wrap" style={S.modalSettleWrap}>
                <button
                  type="button"
                  className="pos-settle-primary-btn"
                  style={S.actionBtnPrimaryCentered}
                  onClick={() => {
                    const orderToSettle = selectedLiveOrder;
                    setSelectedLiveOrder(null);
                    setPaymentOrder(orderToSettle);
                  }}
                >
                  <FaCreditCard size={17} />
                  <span>Settle Payment</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Settlement Dialog ── */}
      {paymentOrder && (
        <div style={{ position: 'relative', zIndex: 10005 }}>
          <PaymentDialog
            order={paymentOrder}
            loading={actionBusy === 'settle'}
            config={config}
            creditCustomers={creditCustomers}
            allowCustomerSelection={true}
            onClose={() => {
              setPaymentOrder(null);
            }}
            onConfirm={handleConfirmPayment}
            themeColor="orange"
          />
        </div>
      )}

      {/* ── Edit Order Panel ── */}
      {editingOrder && (
        <div style={{ position: 'relative', zIndex: 10005 }}>
          <EditOrderPanel
            order={editingOrder}
            onClose={() => {
              setEditingOrder(null);
            }}
            onSave={async (updatedOrder, originalOrder) => {
              try {
                const localKotPrint = typeof localPrintWillHandleKind === 'function' ? localPrintWillHandleKind('kot') : true;
                const payloadWithSkip = {
                  ...updatedOrder,
                  skipAutoPrintKinds: Array.from(new Set([
                    ...(updatedOrder.skipAutoPrintKinds || []),
                    ...(localKotPrint ? ['KOT'] : [])
                  ]))
                };
                const res = await api.patch(`/api/v1/orders/${editingOrder.id}`, payloadWithSkip);
                notify('success', 'Order updated successfully');
                const savedOrder = res?.data?.data;
                if (localKotPrint && savedOrder?.id) {
                  markCloudPrintJobPrinted({ id: savedOrder.id }, 'kot').catch(() => null);
                }
                if (localKotPrint && savedOrder) {
                  const baseOrder = originalOrder || editingOrder;
                  const { addedLines, removedLines } = calculateKotDeltaJs(baseOrder, savedOrder);
                  if (addedLines.length > 0 || removedLines.length > 0) {
                    setPrintOrder({
                      ...savedOrder,
                      lines: addedLines,
                      removed_items: removedLines,
                      removedItems: removedLines,
                      is_edited: true,
                      isEdited: true,
                    });
                    setPrintKind('kot');
                  }
                }
                setEditingOrder(null);
                setSelectedLiveOrder(null);
                fetchLiveOrders();
              } catch (e) {
                notify('error', 'Failed to update order: ' + (e.response?.data?.message || e.message));
              }
            }}
          />
        </div>
      )}

      {/* ── Kot / Bill Thermal Print ── */}
      {printOrder && (
        <KotPrint
          order={printOrder}
          kind={printKind}
          autoPrint={true}
          onPrint={handleLocalPrintDone}
          onClose={() => setPrintOrder(null)}
        />
      )}

      {/* ── Cancellation Modal ── */}
      {cancelOrder && (
        <div style={S.modalBackdrop} onClick={() => {
          setSelectedLiveOrder(cancelOrder);
          setCancelOrder(null);
        }}>
          <div style={S.confirmDialog} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 8px 0', color: '#0f172a' }}>
              Cancel Order #{cancelOrder.orderNo || cancelOrder.order_no || cancelOrder.dailyBillNo || String(cancelOrder.id).slice(0, 8)}?
            </h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 14px 0' }}>
              Are you sure you want to cancel this live order? This will void active items and release any assigned table.
            </p>
            <textarea
              style={S.reasonTextarea}
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Enter reason for cancellation..."
              rows={3}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                type="button"
                style={S.actionBtnSecondary}
                onClick={() => {
                  setSelectedLiveOrder(cancelOrder);
                  setCancelOrder(null);
                }}
              >
                Keep Order
              </button>
              <button
                type="button"
                style={{
                  ...S.actionBtnDangerConfirm,
                  ...((!cancelReason.trim() || actionBusy === cancelOrder.id) ? {
                    opacity: 0.5,
                    cursor: 'not-allowed',
                    background: '#94a3b8'
                  } : {})
                }}
                onClick={handleTriggerCancel}
                disabled={!cancelReason.trim() || actionBusy === cancelOrder.id}
              >
                {actionBusy === cancelOrder.id ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change Table Modal (Transfer Live Order to New Table) ── */}
      {changeTableOrder && (
        <div
          style={{ ...S.modalBackdrop, zIndex: 10010 }}
          onClick={() => {
            if (!changeTableBusy) {
              setChangeTableOrder(null);
              setChangeTableSearch('');
              setChangeTableFloor('ALL');
            }
          }}
        >
          <div
            className="pos-modal-dialog-responsive"
            style={{
              ...S.modalDialog,
              maxWidth: 520,
              borderRadius: 18,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              position: 'relative'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#ffffff'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: '#fff7ed',
                  border: '1px solid #fed7aa',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ea580c',
                  flexShrink: 0
                }}>
                  <FaExchangeAlt size={14} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#0f172a' }}>
                    Change Table
                  </h3>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Order #{changeTableOrder.dailyBillNo || changeTableOrder.orderNo || changeTableOrder.order_no || String(changeTableOrder.id).slice(0, 8)} · Currently at <strong style={{ color: '#ea580c' }}>Table {changeTableOrder.tableNumber}</strong>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="pos-modal-close-btn"
                style={S.modalCloseIcon}
                disabled={changeTableBusy}
                onClick={() => {
                  setChangeTableOrder(null);
                  setChangeTableSearch('');
                  setChangeTableFloor('ALL');
                }}
                title="Close"
              >
                <FaTimes size={15} />
              </button>
            </div>

            {/* Modal Search and Filters */}
            <div style={{ padding: '14px 20px 10px 20px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                background: '#ffffff',
                border: '1.5px solid #e2e8f0',
                borderRadius: 10,
                padding: '6px 12px',
                gap: 8,
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              }}>
                <FaSearch size={13} style={{ color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Search available table #..."
                  value={changeTableSearch}
                  onChange={e => setChangeTableSearch(e.target.value)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    fontSize: 13,
                    color: '#0f172a',
                    fontWeight: 500,
                    background: 'transparent'
                  }}
                  autoFocus
                />
                {changeTableSearch && (
                  <button
                    type="button"
                    onClick={() => setChangeTableSearch('')}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: 12,
                      padding: 2
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Floor Filter pills if multiple floors exist */}
              {floors.length > 1 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  <button
                    type="button"
                    style={{
                      padding: '4px 10px',
                      borderRadius: 100,
                      border: `1px solid ${changeTableFloor === 'ALL' ? '#0f172a' : '#e2e8f0'}`,
                      background: changeTableFloor === 'ALL' ? '#0f172a' : '#ffffff',
                      color: changeTableFloor === 'ALL' ? '#ffffff' : '#64748b',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                    onClick={() => setChangeTableFloor('ALL')}
                  >
                    All Floors
                  </button>
                  {floors.map(f => (
                    <button
                      key={f}
                      type="button"
                      style={{
                        padding: '4px 10px',
                        borderRadius: 100,
                        border: `1px solid ${changeTableFloor === f ? '#0f172a' : '#e2e8f0'}`,
                        background: changeTableFloor === f ? '#0f172a' : '#ffffff',
                        color: changeTableFloor === f ? '#ffffff' : '#64748b',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                      onClick={() => setChangeTableFloor(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tables Grid */}
            <div style={{
              padding: '16px 20px',
              maxHeight: '340px',
              overflowY: 'auto',
              minHeight: '160px'
            }}>
              {filteredMoveTables.length > 0 ? (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
                  gap: 10
                }}>
                  {filteredMoveTables.map(targetTable => (
                    <button
                      key={targetTable.id}
                      type="button"
                      disabled={changeTableBusy}
                      onClick={() => handleMoveTable(changeTableOrder, targetTable)}
                      className="pos-move-table-cell"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '12px 6px',
                        background: '#ffffff',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: 12,
                        cursor: changeTableBusy ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        gap: 4
                      }}
                      title={`Transfer to Table ${targetTable.tableNumber}${targetTable.seatingCapacity ? ` (${targetTable.seatingCapacity} seats)` : ''}`}
                    >
                      <FaChair size={15} style={{ color: '#059669', opacity: 0.85 }} />
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                        {targetTable.tableNumber}
                      </span>
                      {targetTable.floor && (
                        <span style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 600 }}>
                          {targetTable.floor}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '36px 16px',
                  color: '#94a3b8',
                  textAlign: 'center',
                  gap: 8
                }}>
                  <FaChair size={28} style={{ opacity: 0.4 }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>
                    {changeTableSearch ? `No tables matching "${changeTableSearch}"` : 'No other tables currently available'}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    Only unassigned, available tables can be selected.
                  </div>
                </div>
              )}
            </div>

            {/* Footer / Cancel */}
            <div style={{
              padding: '12px 20px',
              background: '#f8fafc',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
                {filteredMoveTables.length} available {filteredMoveTables.length === 1 ? 'table' : 'tables'}
              </span>
              <button
                type="button"
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                disabled={changeTableBusy}
                onClick={() => {
                  setChangeTableOrder(null);
                  setChangeTableSearch('');
                  setChangeTableFloor('ALL');
                }}
              >
                Cancel
              </button>
            </div>

            {/* Loading Overlay when busy */}
            {changeTableBusy && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(255, 255, 255, 0.88)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 18,
                zIndex: 10,
                gap: 10
              }}>
                <div style={{
                  width: 28,
                  height: 28,
                  border: '3px solid #fdba74',
                  borderTopColor: '#ea580c',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#c2410c' }}>
                  Moving order to table...
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        .pos-move-table-cell:hover {
          border-color: #f97316 !important;
          background: #fff7ed !important;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.15) !important;
        }
        .board-card-table:hover {
          filter: brightness(0.96);
          transform: translateY(-1px);
          box-shadow: 0 3px 8px rgba(249, 115, 22, 0.22) !important;
        }
        @keyframes _ots_in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .hide-board-scrollbar {
          -ms-overflow-style: none !important;
          scrollbar-width: none !important;
        }
        .hide-board-scrollbar::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
        }
        .pos-table-cube {
          border-radius: 16px !important;
        }
        .pos-sound-toggle-group button {
          border-radius: 50% !important;
        }
        .pos-viewmode-toggle-box {
          border-radius: 9999px !important;
        }
        .pos-viewmode-toggle-box button {
          border-radius: 9999px !important;
        }
        .pos-segmented-container {
          border-radius: 9999px !important;
        }
        .pos-segmented-container .pos-segmented-tab {
          border-radius: 9999px !important;
        }
        .pos-tab-badge {
          border-radius: 9999px !important;
        }
        .pos-header-new-order-btn {
          border-radius: 9999px !important;
        }
        .board-list-card {
          border-radius: 16px !important;
        }
        .card-table-pill, .card-status-pill, .card-token-wrap span, .board-items-toggle-btn {
          border-radius: 9999px !important;
        }
        .tiny-table-box {
          border-radius: 10px !important;
        }
        .board-aux-btn, .board-settle-btn, .board-icon-btn, .board-danger-btn {
          border-radius: 10px !important;
        }

        .avail-table-pill:hover {
          background: #ecfdf5 !important;
          border-color: #059669 !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2) !important;
        }
        .avail-table-pill:active {
          transform: translateY(0);
        }
        .board-list-card {
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .board-list-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04) !important;
        }
        .board-aux-btn {
          transition: all 0.15s ease !important;
        }
        .board-aux-btn:hover {
          background: #f8fafc !important;
          border-color: #cbd5e1 !important;
          transform: translateY(-1px);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
        }
        .board-aux-btn:active {
          transform: translateY(0);
        }
        .board-ready-btn:hover {
          background: #dcfce7 !important;
          border-color: #059669 !important;
          transform: translateY(-1px);
        }
        .board-settle-btn {
          transition: all 0.15s ease !important;
        }
        .board-settle-btn:hover {
          filter: brightness(1.08);
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25) !important;
        }
        .board-settle-btn:active {
          transform: translateY(0);
        }
        .board-icon-btn {
          transition: all 0.15s ease !important;
        }
        .board-icon-btn:hover {
          background: #f0f9ff !important;
          border-color: #38bdf8 !important;
          transform: translateY(-1px);
          box-shadow: 0 2px 6px rgba(2, 132, 199, 0.12);
        }
        .board-icon-btn:active {
          transform: translateY(0);
        }
        .board-danger-btn {
          transition: all 0.15s ease !important;
        }
        .board-danger-btn:hover {
          background: #fee2e2 !important;
          border-color: #f87171 !important;
          transform: translateY(-1px);
          box-shadow: 0 2px 6px rgba(225, 29, 72, 0.15);
        }
        .board-danger-btn:active {
          transform: translateY(0);
        }
        .board-arrow-btn {
          transition: all 0.15s ease !important;
        }
        .board-arrow-btn:hover {
          background: #f8fafc !important;
          border-color: #94a3b8 !important;
          transform: translateY(-1px);
        }
        .board-arrow-btn:active {
          transform: translateY(0);
        }
        .start-takeaway-btn:hover {
          filter: brightness(1.08);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4) !important;
        }
        .start-takeaway-btn:active {
          transform: translateY(0);
        }
        .start-delivery-btn:hover {
          filter: brightness(1.08);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4) !important;
        }
        .start-delivery-btn:active {
          transform: translateY(0);
        }
        .pos-modal-close-btn:hover {
          background: #e2e8f0 !important;
          color: #0f172a !important;
          transform: rotate(90deg) scale(1.05);
        }
        .pos-modal-close-btn:active {
          transform: rotate(90deg) scale(0.95);
        }
        .pos-modal-item-row {
          transition: background 0.15s ease;
        }
        .pos-modal-item-row:hover {
          background: #f8fafc;
        }
        .pos-action-bar-btn {
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .pos-action-bar-btn:hover {
          background: #f8fafc !important;
          border-color: #cbd5e1 !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05) !important;
        }
        .pos-action-bar-btn-cancel:hover {
          background: #ffe4e6 !important;
          border-color: #fda4af !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(225, 29, 72, 0.12) !important;
        }
        .pos-action-bar-btn:active,
        .pos-action-bar-btn-cancel:active {
          transform: translateY(0);
        }
        .pos-settle-primary-btn:hover {
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%) !important;
          box-shadow: 0 4px 14px rgba(249, 115, 22, 0.28) !important;
          transform: translateY(-1px);
        }
        .pos-settle-primary-btn:active,
        .pos-footer-action-btn:active,
        .pos-footer-action-btn-danger:active {
          transform: translateY(0);
        }

        /* Mobile / Narrow Screen Responsive Adjustments */
        @media (max-width: 520px) {
          .pos-order-modal-footer {
            padding: 12px 14px !important;
            gap: 10px !important;
          }
          .pos-modal-aux-grid {
            grid-template-columns: repeat(5, 1fr) !important;
            gap: 4px !important;
          }
          .pos-modal-aux-grid .pos-action-bar-btn {
            flex-direction: column !important;
            padding: 7px 2px !important;
            font-size: 10.5px !important;
            gap: 3px !important;
            border-radius: 10px !important;
          }
          .pos-settle-primary-btn {
            padding: 11px 16px !important;
            font-size: 14px !important;
            border-radius: 12px !important;
          }
          .pos-modal-dialog-responsive {
            max-width: 96vw !important;
            border-radius: 16px !important;
          }
          .pos-modal-header-responsive {
            padding: 14px 16px !important;
          }
          .pos-modal-body-responsive {
            padding: 12px 14px !important;
          }
          .pos-order-items-header-res,
          .pos-order-item-row-res {
            grid-template-columns: minmax(0, 1fr) 34px 54px 62px !important;
            padding: 8px 8px !important;
            font-size: 11.5px !important;
          }
        }
        .tiny-table-box:hover {
          background: #ecfdf5 !important;
          border-color: #059669 !important;
          color: #047857 !important;
          transform: translateY(-1px);
          box-shadow: 0 3px 8px rgba(16, 185, 129, 0.25) !important;
        }
        .tiny-table-box:active {
          transform: translateY(0);
          background: #dcfce7 !important;
          border-color: #047857 !important;
        }
        .board-new-order-card:hover {
          background: #ffffff !important;
          border-color: #ea580c !important;
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(249, 115, 22, 0.16) !important;
        }
        .board-new-order-card:active {
          transform: translateY(0);
          box-shadow: 0 2px 6px rgba(249, 115, 22, 0.12) !important;
        }
        .spin-icon {
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* ── Responsive Mobile & Tablet Rules for POS V2 ── */
        @media (max-width: 860px) {
          .pos-order-modal-root {
            height: calc(100dvh - 60px) !important;
            max-height: calc(100dvh - 60px) !important;
            overflow-x: hidden !important;
          }
          .pos-top-control-bar {
            flex-wrap: wrap !important;
            padding: 8px 12px !important;
            gap: 8px !important;
            min-height: auto !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .pos-sound-toggle-group {
            order: 1 !important;
            flex-shrink: 0 !important;
          }
          .pos-sound-toggle-group button {
            width: 34px !important;
            height: 34px !important;
            border-radius: 50% !important;
          }
          .pos-right-ctrl-group {
            order: 2 !important;
            margin-left: auto !important;
            flex-shrink: 0 !important;
            gap: 6px !important;
          }
          .pos-viewmode-toggle-box {
            border-radius: 9999px !important;
          }
          .pos-viewmode-toggle-box button {
            padding: 5px 12px !important;
            font-size: 12px !important;
            border-radius: 9999px !important;
          }
          .pos-header-new-order-btn {
            height: 30px !important;
            padding: 0 12px !important;
            font-size: 11.5px !important;
            border-radius: 9999px !important;
          }
          .pos-segmented-container {
            order: 3 !important;
            width: 100% !important;
            display: flex !important;
            margin: 2px 0 0 0 !important;
            padding: 3px !important;
            box-sizing: border-box !important;
            border-radius: 9999px !important;
          }
          .pos-segmented-container .pos-segmented-tab {
            flex: 1 1 0 !important;
            min-width: 0 !important;
            padding: 7px 4px !important;
            font-size: 12px !important;
            justify-content: center !important;
            border-radius: 9999px !important;
          }
          .pos-segmented-container .pos-segmented-tab svg {
            margin-right: 4px !important;
            flex-shrink: 0 !important;
          }
          .pos-tab-badge {
            margin-left: 4px !important;
            padding: 1px 6px !important;
            font-size: 10px !important;
            flex-shrink: 0 !important;
            border-radius: 9999px !important;
          }
          .pos-content-body {
            padding: 10px 12px 70px 12px !important;
            overflow-x: hidden !important;
          }
          .pos-board-split-wrap {
            flex-direction: column !important;
            gap: 10px !important;
            min-height: auto !important;
            width: 100% !important;
          }
          .pos-board-left-sidebar {
            width: 100% !important;
            position: static !important;
            max-height: none !important;
            box-sizing: border-box !important;
            padding: 10px 12px !important;
            margin-bottom: 8px !important;
            border-radius: 14px !important;
            gap: 8px !important;
            background: #ffffff !important;
            border: 1px solid #e2e8f0 !important;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03) !important;
          }
          .pos-board-left-tables-header {
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 8px !important;
            padding-bottom: 8px !important;
            border-bottom: 1px solid #f1f5f9 !important;
          }
          .pos-board-left-tables-header > div:first-child {
            width: 100% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
          }
          .pos-table-search-wrap-left {
            width: 100% !important;
            flex: none !important;
            height: 34px !important;
            background: #f8fafc !important;
            border-radius: 9999px !important;
            border: 1px solid #cbd5e1 !important;
            padding: 2px 10px !important;
            box-sizing: border-box !important;
          }
          .pos-board-tiny-boxes-grid {
            display: grid !important;
            grid-template-columns: repeat(auto-fill, minmax(50px, 1fr)) !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            max-height: 84px !important;
            gap: 6px !important;
            padding: 2px 1px !important;
            width: 100% !important;
            box-sizing: border-box !important;
            -webkit-overflow-scrolling: touch !important;
          }
          .pos-board-tiny-boxes-grid .tiny-table-box {
            width: 100% !important;
            height: 34px !important;
            font-size: 12px !important;
            font-weight: 700 !important;
            border-radius: 8px !important;
            border: 1.5px solid #10b981 !important;
            background: #ffffff !important;
            color: #0f172a !important;
          }
          .pos-board-tiny-boxes-grid .tiny-table-box:active {
            background: #ecfdf5 !important;
            transform: scale(0.96) !important;
          }
          .pos-board-right-orders {
            width: 100% !important;
            box-sizing: border-box !important;
          }
          /* Board Mode Cards & List Responsiveness */
          .board-card-grid {
            grid-template-columns: 1fr !important;
            gap: 8px !important;
            width: 100% !important;
            padding-bottom: 20px !important;
          }
          .board-list-card {
            padding: 6px 8px !important;
            border-radius: 9px !important;
            gap: 3.5px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .board-card-header {
            padding-bottom: 3.5px !important;
          }
          .board-card-token {
            font-size: 9.5px !important;
            padding: 1px 5px !important;
            border-radius: 4px !important;
          }
          .board-card-table {
            font-size: 9.5px !important;
            padding: 1px 5px !important;
            border-radius: 4px !important;
          }
          .board-card-status {
            font-size: 8px !important;
            padding: 1px 5px !important;
          }
          .board-card-time {
            font-size: 8.5px !important;
            padding: 1px 4px !important;
          }
          .board-card-items-box {
            max-height: 44px !important;
            padding: 2.5px 5px !important;
            border-radius: 5px !important;
            gap: 1.5px !important;
          }
          .board-card-item-row {
            font-size: 9.5px !important;
            line-height: 1.2 !important;
          }
          .board-card-item-qty {
            font-size: 7.5px !important;
            padding: 0 3px !important;
            border-radius: 2px !important;
          }
          .board-card-item-name {
            font-size: 9.5px !important;
          }
          .board-card-item-price {
            font-size: 9.5px !important;
          }
          .board-card-note-alert {
            padding: 1px 5px !important;
            font-size: 9px !important;
            border-radius: 4px !important;
          }
          .board-card-summary-row {
            padding-top: 3px !important;
            margin-top: 0 !important;
          }
          .board-card-item-count {
            font-size: 8.5px !important;
            padding: 1px 5px !important;
          }
          .board-card-total-label {
            font-size: 9px !important;
          }
          .board-card-total-amount {
            font-size: 12.5px !important;
            font-weight: 800 !important;
          }
          .board-card-actions {
            display: flex !important;
            flex-direction: column !important;
            gap: 3px !important;
            width: 100% !important;
            margin-top: auto !important;
            padding-top: 3px !important;
          }
          .board-card-aux-row {
            display: grid !important;
            grid-template-columns: repeat(5, 1fr) !important;
            gap: 2.5px !important;
            width: 100% !important;
          }
          .board-card-aux-row.four-cols {
            grid-template-columns: repeat(4, 1fr) !important;
          }
          .board-card-aux-row .pos-action-bar-btn {
            display: inline-flex !important;
            flex-direction: row !important;
            align-items: center !important;
            justify-content: center !important;
            height: 23px !important;
            font-size: 9px !important;
            font-weight: 600 !important;
            padding: 0 2px !important;
            border-radius: 5px !important;
            gap: 2px !important;
            white-space: nowrap !important;
            box-sizing: border-box !important;
          }
          .board-card-aux-row .pos-action-bar-btn svg {
            width: 8.5px !important;
            height: 8.5px !important;
            flex-shrink: 0 !important;
            margin: 0 !important;
            vertical-align: middle !important;
          }
          .board-card-aux-row .pos-action-bar-btn span {
            display: inline-block !important;
            line-height: 1 !important;
          }
          .board-card-settle-wrap {
            width: 100% !important;
          }
          .pos-settle-primary-btn {
            display: inline-flex !important;
            flex-direction: row !important;
            align-items: center !important;
            justify-content: center !important;
            height: 26px !important;
            font-size: 11px !important;
            font-weight: 700 !important;
            padding: 0 8px !important;
            border-radius: 6px !important;
            gap: 4px !important;
            width: 100% !important;
          }
          .pos-settle-primary-btn svg {
            width: 10px !important;
            height: 10px !important;
            flex-shrink: 0 !important;
            margin: 0 !important;
            vertical-align: middle !important;
          }
          .board-new-order-card {
            min-height: 90px !important;
            padding: 10px !important;
            flex-direction: row !important;
            gap: 10px !important;
          }

          .board-row-single-line {
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 8px !important;
            width: 100% !important;
            box-sizing: border-box !important;
            overflow-x: visible !important;
          }
          /* Line 1: Table, Status, Token, Time, Customer */
          .board-row-left {
            display: flex !important;
            flex-wrap: nowrap !important;
            align-items: center !important;
            gap: 6px !important;
            width: 100% !important;
            min-width: 0 !important;
          }
          .card-table-pill {
            padding: 3px 8px !important;
            font-size: 11.5px !important;
            flex-shrink: 0 !important;
          }
          .card-status-pill {
            padding: 2px 6px !important;
            font-size: 10px !important;
            flex-shrink: 0 !important;
          }
          .card-token-wrap {
            flex-shrink: 0 !important;
          }
          .card-token-wrap span {
            font-size: 10px !important;
            padding: 1px 4px !important;
          }
          .card-time-pill {
            font-size: 10.5px !important;
            margin-left: auto !important;
            white-space: nowrap !important;
            flex-shrink: 0 !important;
          }
          .card-customer-pill {
            font-size: 10.5px !important;
            max-width: 85px !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
          }

          /* Line 2: Items Toggle on left, Grand Total on right */
          .board-row-price-box {
            margin-left: 0 !important;
            width: 100% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 5px 0 2px 0 !important;
            border-top: 1px dashed #f1f5f9 !important;
          }
          .board-items-toggle-btn {
            font-size: 11.5px !important;
            padding: 2px 7px !important;
          }

          /* Line 3: Action Buttons all in one row */
          .board-list-btn-group {
            width: 100% !important;
            display: flex !important;
            flex-wrap: nowrap !important;
            gap: 5px !important;
            justify-content: space-between !important;
            padding-top: 6px !important;
            border-top: 1px solid #f1f5f9 !important;
          }
          .board-list-btn-group button {
            flex: 1 1 0 !important;
            min-width: 0 !important;
            height: 32px !important;
            font-size: 11px !important;
            padding: 0 4px !important;
            justify-content: center !important;
          }
          .board-list-btn-group .board-arrow-btn {
            display: none !important;
          }
        }

        @media (max-width: 640px) {
          .pos-content-body {
            padding: 6px 8px 60px 8px !important;
          }
          .pos-top-control-bar {
            padding: 5px 6px !important;
            gap: 4px !important;
            justify-content: space-between !important;
          }
          .pos-sound-toggle-group {
            order: 1 !important;
            gap: 3px !important;
            flex-wrap: nowrap !important;
          }
          .pos-sound-toggle-group button {
            width: 25px !important;
            height: 25px !important;
            min-width: 25px !important;
            border-radius: 50% !important;
            font-size: 9px !important;
            margin-left: 0 !important;
          }
          .pos-sound-toggle-group button svg {
            width: 11px !important;
            height: 11px !important;
          }
          .pos-right-ctrl-group {
            order: 2 !important;
            gap: 4px !important;
            flex-shrink: 0 !important;
          }
          .pos-viewmode-toggle-box {
            padding: 2px !important;
            border-radius: 9999px !important;
          }
          .pos-viewmode-toggle-box button {
            padding: 3px 6px !important;
            font-size: 9.5px !important;
            border-radius: 9999px !important;
          }
          .pos-header-new-order-btn {
            height: 26px !important;
            padding: 0 10px !important;
            font-size: 10px !important;
            border-radius: 9999px !important;
          }
          .pos-segmented-container {
            order: 3 !important;
            width: 100% !important;
            justify-content: center !important;
            padding: 2px !important;
            border-radius: 9999px !important;
            margin-top: 1px !important;
          }
          }
          .pos-segmented-container .pos-segmented-tab {
            padding: 4px 6px !important;
            font-size: 11px !important;
            border-radius: 9999px !important;
          }
          .pos-segmented-container .pos-segmented-tab svg {
            margin-right: 3px !important;
            font-size: 10px !important;
          }
          .pos-tab-badge {
            margin-left: 3px !important;
            padding: 1px 5px !important;
            font-size: 9px !important;
            border-radius: 9999px !important;
          }
          .pos-table-toolbar {
            gap: 4px !important;
            margin-bottom: 4px !important;
            width: 100% !important;
          }
          .pos-legend {
            gap: 3px 8px !important;
            margin-bottom: 4px !important;
            width: 100% !important;
          }
          .pos-legend-item {
            font-size: 9.5px !important;
            gap: 3px !important;
          }
          .pos-legend-dot {
            width: 6px !important;
            height: 6px !important;
            min-width: 6px !important;
          }

          /* Curvy, sleek 5-column table grid on mobile */
          .pos-cube-grid {
            display: grid !important;
            grid-template-columns: repeat(5, 1fr) !important;
            gap: 5px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .pos-cube-grid .pos-table-cube {
            width: 100% !important;
            height: 38px !important;
            min-height: 38px !important;
            max-height: 38px !important;
            border-radius: 14px !important; /* Beautiful curvy edges */
            box-sizing: border-box !important;
            padding: 0 !important;
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            justify-content: center !important;
            transform: none !important;
            box-shadow: none !important;
          }
          .pos-cube-grid .pos-table-cube .pos-table-num {
            font-size: 12px !important;
            font-weight: 700 !important;
          }
          .pos-cube-grid .pos-table-cube .pos-table-live-dot {
            width: 5px !important;
            height: 5px !important;
            top: 4px !important;
            right: 4px !important;
          }
          .pos-cube-grid .pos-new-cube {
            border-radius: 14px !important;
            flex-direction: row !important;
            gap: 3px !important;
          }
          .pos-cube-grid .pos-new-cube svg {
            margin-bottom: 0 !important;
          }
          .pos-cube-grid .pos-new-cube span {
            font-size: 10.5px !important;
            font-weight: 700 !important;
          }
          .board-list-btn-group button {
            height: 28px !important;
            font-size: 10.5px !important;
            padding: 0 4px !important;
            border-radius: 10px !important;
          }
        }

        @media (max-width: 340px) {
          .pos-cube-grid {
            grid-template-columns: repeat(4, 1fr) !important;
            gap: 4px !important;
          }
          .pos-cube-grid .pos-table-cube {
            height: 36px !important;
            min-height: 36px !important;
            max-height: 36px !important;
            border-radius: 12px !important;
          }
          .pos-cube-grid .pos-table-cube .pos-table-num {
            font-size: 11px !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────── */
const S = {
  overlay: {
    background: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    flex: 1,
    width: '100%',
    maxWidth: '100vw',
    height: 'calc(100vh - 60px)',
    maxHeight: 'calc(100dvh - 60px)',
    overflow: 'hidden',
    boxSizing: 'border-box',
    animation: '_ots_in 0.24s cubic-bezier(0.16,1,0.3,1)',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  /* ── Top Control Bar matching screenshot ── */
  controlBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 24px',
    background: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    flexShrink: 0,
    gap: 16,
    flexWrap: 'wrap',
    minHeight: 60,
    width: '100%',
    boxSizing: 'border-box',
  },
  soundToggleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  soundBtnActiveGreen: {
    width: 38,
    height: 38,
    borderRadius: '50%',
    border: '1.5px solid #10b981',
    background: '#ecfdf5',
    color: '#059669',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
  },
  soundBtnInactive: {
    width: 38,
    height: 38,
    borderRadius: '50%',
    border: '1.5px solid #e2e8f0',
    background: '#ffffff',
    color: '#94a3b8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
  },
  soundBtnActiveMute: {
    width: 38,
    height: 38,
    borderRadius: '50%',
    border: '1.5px solid #ef4444',
    background: '#fef2f2',
    color: '#dc2626',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
  },
  segmentedContainer: {
    display: 'flex',
    alignItems: 'center',
    background: '#edf2f7',
    borderRadius: 9999,
    padding: '4px',
    gap: 2,
    border: '1px solid #e2e8f0',
  },
  segmentedTab: {
    display: 'flex',
    alignItems: 'center',
    padding: '7px 16px',
    borderRadius: 9999,
    border: 'none',
    background: 'transparent',
    color: '#475569',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
    outline: 'none',
  },
  segmentedTabActive: {
    display: 'flex',
    alignItems: 'center',
    padding: '7px 16px',
    borderRadius: 9999,
    border: 'none',
    background: '#ffffff',
    color: '#0f172a',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
    outline: 'none',
  },
  tabCountBadge: {
    background: '#cbd5e1',
    color: '#334155',
    borderRadius: 9999,
    padding: '2px 8px',
    fontSize: 11,
    fontWeight: 700,
    marginLeft: 7,
  },
  tabCountBadgeActive: {
    background: '#e2e8f0',
    color: '#0f172a',
    borderRadius: 9999,
    padding: '2px 8px',
    fontSize: 11,
    fontWeight: 800,
    marginLeft: 7,
  },
  viewModeToggleBox: {
    display: 'flex',
    alignItems: 'center',
    background: '#edf2f7',
    borderRadius: 9999,
    padding: '3px',
    border: '1px solid #e2e8f0',
  },
  viewModeBtnActive: {
    padding: '7px 18px',
    borderRadius: 9999,
    border: 'none',
    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(234, 88, 12, 0.3)',
    transition: 'all 0.15s ease',
    outline: 'none',
  },
  viewModeBtnInactive: {
    padding: '7px 18px',
    borderRadius: 9999,
    border: 'none',
    background: 'transparent',
    color: '#64748b',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
  },
  barDivider: {
    width: 1,
    height: 28,
    background: '#cbd5e1',
  },
  newOrderHeaderBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '9px 20px',
    borderRadius: 9999,
    border: 'none',
    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 10px rgba(249, 115, 22, 0.35)',
    transition: 'all 0.15s ease',
    flexShrink: 0,
    outline: 'none',
  },
  headerAuxBtn: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: '1px solid #e2e8f0',
    background: '#f8fafc',
    color: '#64748b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    flexShrink: 0,
    outline: 'none',
  },

  contentBody: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '16px 20px',
    boxSizing: 'border-box',
    width: '100%',
  },
  tabPane: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },

  /* Hero Action Button for Takeaway & Delivery */
  heroActionCard: (accent) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '16px 20px',
    borderRadius: 14,
    border: `2px dashed ${accent}`,
    background: 'white',
    cursor: 'pointer',
    textAlign: 'left',
    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
    transition: 'all 0.15s ease',
  }),
  heroIconWrap: (accent) => ({
    width: 44,
    height: 44,
    borderRadius: 12,
    background: `${accent}18`,
    color: accent,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }),
  heroContent: {
    display: 'flex',
    flexDirection: 'column',
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: '#0f172a',
  },
  heroSubtitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#64748b',
    marginTop: 2,
  },

  /* Table picker styles */
  tableToolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontWeight: 600,
    color: '#64748b',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
  },
  floorRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  floorPill: (active) => ({
    padding: '4px 10px',
    borderRadius: 100,
    border: `1px solid ${active ? '#0f172a' : '#e2e8f0'}`,
    background: active ? '#0f172a' : 'white',
    color: active ? 'white' : '#64748b',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
  }),
  cubeGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignContent: 'flex-start',
    width: '100%',
    boxSizing: 'border-box',
  },
  cube: {
    width: 60,
    height: 60,
    borderRadius: 16,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
    flexShrink: 0,
    position: 'relative',
  },
  cubeNum: {
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  tableLiveDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#ffffff',
    position: 'absolute',
    top: 5,
    right: 5,
  },

  /* Sections & Live Grids */
  sectionBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 8,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: '#0f172a',
    letterSpacing: '-0.02em',
  },
  sectionBadge: {
    padding: '2px 8px',
    borderRadius: 10,
    background: '#e2e8f0',
    color: '#334155',
    fontSize: 11,
    fontWeight: 800,
  },
  viewToggleWrap: {
    display: 'flex',
    alignItems: 'center',
    background: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
    border: '1px solid #e2e8f0',
  },
  viewToggleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 10px',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: '#64748b',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  viewToggleBtnActive: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 10px',
    borderRadius: 6,
    border: 'none',
    background: 'white',
    color: '#ea580c',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  smallOrangeBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    color: 'white',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(249, 115, 22, 0.25)',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
  },
  boardContainer: {
    width: '100%',
  },
  boardWrap: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    gap: 8,
    boxSizing: 'border-box',
  },
  boardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '2px 2px 6px 2px',
  },
  boardCountText: {
    fontSize: 13,
    fontWeight: 700,
    color: '#334155',
  },
  layoutToggleBox: {
    display: 'flex',
    alignItems: 'center',
    background: '#e2e8f0',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  layoutToggleBtnActive: {
    padding: '4px 10px',
    borderRadius: 6,
    border: 'none',
    background: 'white',
    color: '#0f172a',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    transition: 'all 0.15s ease',
  },
  layoutToggleBtnInactive: {
    padding: '4px 10px',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: '#64748b',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    transition: 'all 0.15s ease',
  },

  /* Available Tables Split Container & Vertical Left Sidebar in Board Mode */
  boardTableSplitWrap: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
    width: '100%',
    boxSizing: 'border-box',
    minHeight: 460,
  },
  boardLeftTablesSidebar: {
    width: 220,
    flexShrink: 0,
    background: '#ffffff',
    borderRadius: 16,
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
    padding: '12px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    boxSizing: 'border-box',
    position: 'sticky',
    top: 0,
    maxHeight: 'calc(100vh - 170px)',
  },
  boardLeftTablesHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    paddingBottom: 4,
    borderBottom: '1px solid #f1f5f9',
  },
  boardLeftTablesTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: '#0f172a',
    letterSpacing: '-0.02em',
    display: 'flex',
    alignItems: 'center',
  },
  boardAvailableTablesBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: '#047857',
    background: '#ecfdf5',
    border: '1px solid #a7f3d0',
    padding: '2px 8px',
    borderRadius: 9999,
  },
  tableSearchWrapLeft: {
    display: 'flex',
    alignItems: 'center',
    background: '#f8fafc',
    borderRadius: 9999,
    border: '1px solid #cbd5e1',
    padding: '2px 10px',
    height: 32,
    width: '100%',
    boxSizing: 'border-box',
  },
  tableSearchInputLeft: {
    flex: 1,
    border: 'none',
    background: 'transparent',
    fontSize: 12,
    fontWeight: 600,
    color: '#0f172a',
    padding: '4px 6px',
    outline: 'none',
    minWidth: 0,
  },
  clearSearchBtn: {
    border: 'none',
    background: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: 11,
    padding: '0 4px',
    display: 'flex',
    alignItems: 'center',
  },
  floorRowCompact: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    overflowX: 'auto',
    paddingBottom: 2,
    width: '100%',
  },
  floorPillCompact: (active) => ({
    padding: '3px 10px',
    borderRadius: 9999,
    border: active ? '1px solid #10b981' : '1px solid #e2e8f0',
    background: active ? '#ecfdf5' : '#ffffff',
    color: active ? '#047857' : '#64748b',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  }),
  boardTinyBoxesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 6,
    overflowY: 'auto',
    padding: '3px 1px',
    flex: 1,
    alignContent: 'flex-start',
  },
  tinyTableBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    background: '#ffffff',
    border: '1.5px solid #10b981',
    borderRadius: 10,
    color: '#0f172a',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.12s ease',
    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
    padding: '0 2px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    outline: 'none',
    boxSizing: 'border-box',
  },
  noTablesLeftText: {
    gridColumn: '1 / -1',
    fontSize: 11.5,
    color: '#94a3b8',
    textAlign: 'center',
    padding: '20px 4px',
    fontStyle: 'italic',
  },
  boardRightOrdersPanel: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },

  boardListContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    width: '100%',
    boxSizing: 'border-box',
    paddingBottom: 24,
  },
  boardListCard: {
    background: 'white',
    borderRadius: 16,
    padding: '12px 18px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
    transition: 'all 0.15s ease',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    width: '100%',
    boxSizing: 'border-box',
  },
  boardRowSingleLine: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    width: '100%',
    boxSizing: 'border-box',
    flexWrap: 'wrap',
  },
  boardRowLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    flexShrink: 0,
  },
  boardRowBillNo: {
    fontSize: 14,
    fontWeight: 600,
    color: '#0f172a',
    letterSpacing: '-0.01em',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  boardRowTime: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 12,
    fontWeight: 500,
    color: '#64748b',
    whiteSpace: 'nowrap',
  },
  boardRowCustomer: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 12,
    fontWeight: 500,
    color: '#334155',
    maxWidth: 160,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  boardRowPriceBox: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    marginLeft: 'auto',
  },
  boardRowItemCount: {
    fontSize: 12,
    fontWeight: 500,
    color: '#64748b',
  },
  boardRowGrandTotal: {
    fontSize: 16.5,
    fontWeight: 600,
    color: '#0f172a',
    letterSpacing: '-0.01em',
  },
  boardRowArrowBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    borderRadius: 8,
    border: '1.5px solid #cbd5e1',
    background: '#ffffff',
    color: '#475569',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    outline: 'none',
    flexShrink: 0,
  },
  boardRowArrowBtnActive: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    borderRadius: 8,
    border: '1.5px solid #f97316',
    background: '#fff7ed',
    color: '#ea580c',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: '0 1px 2px rgba(249,115,22,0.15)',
    outline: 'none',
    flexShrink: 0,
  },
  boardRowExpandedDrawer: {
    borderTop: '1px solid #f1f5f9',
    paddingTop: 10,
    marginTop: 4,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    animation: '_ots_in 0.18s cubic-bezier(0.16,1,0.3,1)',
  },
  boardExpandedItemsWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  boardListColMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 190,
    maxWidth: 240,
    flexShrink: 0,
  },
  boardListColItems: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 200,
  },
  boardListItemsWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  boardListItemPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    padding: '3px 8px',
    fontSize: 11,
  },
  boardListNote: {
    background: '#fffbeb',
    border: '1px solid #fef3c7',
    color: '#92400e',
    borderRadius: 5,
    padding: '2px 6px',
    fontSize: 10,
    lineHeight: 1.25,
    display: 'inline-block',
  },
  boardListColActions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
  boardListPriceBox: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
  },
  boardListBtnGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  boardCardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 305px))',
    justifyContent: 'start',
    gap: 14,
    width: '100%',
    boxSizing: 'border-box',
    paddingBottom: 24,
  },
  boardSliderWrap: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    gap: 6,
  },
  boardSliderHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 2px',
  },
  boardSliderCount: {
    fontSize: 12,
    fontWeight: 600,
    color: '#475569',
  },
  boardSlideNavGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  boardSlideArrowBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    borderRadius: 6,
    border: '1px solid #cbd5e1',
    background: 'white',
    color: '#334155',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  boardSlideTrack: {
    display: 'flex',
    gap: 10,
    overflowX: 'auto',
    scrollBehavior: 'smooth',
    scrollSnapType: 'x proximity',
    padding: '4px 2px 10px 2px',
    width: '100%',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  },
  boardColumn: {
    background: '#f8fafc',
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 440,
    maxHeight: 'calc(100vh - 240px)',
  },
  boardColumnHeader: {
    padding: '12px 14px',
    background: 'white',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  boardColumnTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: '#0f172a',
    letterSpacing: '-0.01em',
  },
  boardColumnBadge: {
    padding: '2px 7px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 800,
  },
  boardColumnBody: {
    padding: 12,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    flex: 1,
  },
  boardEmptySlot: {
    padding: '36px 16px',
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: 500,
    border: '1px dashed #e2e8f0',
    borderRadius: 10,
    marginTop: 12,
  },
  boardCard: {
    width: '100%',
    background: 'white',
    borderRadius: 10,
    padding: '8px 10px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    boxSizing: 'border-box',
  },
  cardLinesBox: {
    margin: '4px 0',
    padding: '6px 8px',
    background: '#f8fafc',
    borderRadius: 6,
    border: '1px solid #f1f5f9',
    color: '#334155',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  liveGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 12,
  },
  liveCard: {
    background: 'white',
    borderRadius: 14,
    padding: '14px 16px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTablePill: {
    padding: '3px 8px',
    borderRadius: 6,
    background: '#fff7ed',
    color: '#ea580c',
    fontSize: 11,
    fontWeight: 800,
  },
  cardStatusBadge: {
    padding: '2px 7px',
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 800,
    textTransform: 'uppercase',
    border: '1px solid transparent',
  },
  cardOrderNo: {
    fontSize: 14,
    fontWeight: 800,
    color: '#0f172a',
  },
  cardCustomer: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 12,
    fontWeight: 600,
    color: '#334155',
  },
  cardItemsSummary: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: 500,
  },
  cardBottom: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 8,
    borderTop: '1px dashed #e2e8f0',
  },
  cardTotal: {
    fontSize: 15,
    fontWeight: 800,
    color: '#0f172a',
  },
  cardActionBtn: {
    padding: '5px 12px',
    borderRadius: 8,
    border: 'none',
    background: '#f8fafc',
    color: '#0f172a',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
  },

  /* Table-like Box View Styles (for All Order Types) */
  boxGridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
    gap: 14,
    padding: '4px 0',
    width: '100%',
  },
  newActionCube: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 120,
    borderRadius: 14,
    border: '2px dashed #f97316',
    background: '#fff7ed',
    color: '#ea580c',
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    outline: 'none',
    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
  },
  newActionIconCircle: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
  },
  newActionCubeLabel: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '-0.01em',
  },
  orderBoxCube: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: 120,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'solid',
    padding: '10px 10px 8px 10px',
    cursor: 'pointer',
    transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
    outline: 'none',
    textAlign: 'left',
    boxSizing: 'border-box',
  },
  orderBoxTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  orderBoxStatusBadge: {
    fontSize: 9,
    fontWeight: 800,
    textTransform: 'uppercase',
    padding: '2px 5px',
    borderRadius: 5,
    letterSpacing: '0.02em',
  },
  orderBoxTime: {
    fontSize: 10,
    fontWeight: 600,
    color: '#64748b',
  },
  orderBoxCenter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '6px 0',
    textAlign: 'center',
  },
  orderBoxNumber: {
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
  },
  orderBoxCustomer: {
    fontSize: 11,
    fontWeight: 600,
    color: '#475569',
    marginTop: 2,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  orderBoxBottomRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 6,
    borderTop: '1px dashed rgba(0,0,0,0.08)',
  },
  orderBoxItemsCount: {
    fontSize: 10,
    fontWeight: 600,
    color: '#64748b',
  },
  orderBoxTotal: {
    fontSize: 12,
    fontWeight: 800,
  },

  /* Enhanced Board View Styles (Full Details & Direct Buttons) */
  cardTimeBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 10,
    fontWeight: 600,
    color: '#64748b',
  },
  cardAddress: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    color: '#0369a1',
    background: '#f0f9ff',
    padding: '3px 8px',
    borderRadius: 6,
    border: '1px solid #e0f2fe',
    margin: '2px 0',
  },
  boardItemsBox: {
    background: '#f8fafc',
    borderRadius: 6,
    border: '1px solid #f1f5f9',
    padding: '3px 6px',
    margin: '2px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    maxHeight: 72,
    overflowY: 'auto',
  },
  boardItemLine: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 10.5,
  },
  boardItemQtyBadge: {
    background: '#e2e8f0',
    color: '#334155',
    fontSize: 9,
    fontWeight: 800,
    padding: '0 4px',
    borderRadius: 3,
    flexShrink: 0,
  },
  boardItemNameText: {
    color: '#1e293b',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  boardItemPriceText: {
    color: '#475569',
    fontWeight: 700,
    fontSize: 10,
    flexShrink: 0,
    marginLeft: 4,
  },
  boardNoteAlert: {
    background: '#fffbeb',
    border: '1px solid #fef3c7',
    color: '#92400e',
    borderRadius: 5,
    padding: '2px 6px',
    fontSize: 10,
    lineHeight: 1.25,
  },
  boardTotalRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTop: '1px dashed #e2e8f0',
    marginTop: 2,
  },
  boardItemCountLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: '#64748b',
  },
  boardCardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingTop: 4,
    borderTop: '1px solid #f1f5f9',
    flexWrap: 'wrap',
  },
  boardAuxBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '7px 13px',
    borderRadius: 8,
    border: '1.5px solid #cbd5e1',
    background: '#ffffff',
    color: '#1e293b',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    outline: 'none',
    whiteSpace: 'nowrap',
  },
  boardReadyBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '7px 14px',
    borderRadius: 8,
    border: '1.5px solid #10b981',
    background: '#ecfdf5',
    color: '#047857',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: '0 1px 2px rgba(16,185,129,0.12)',
    outline: 'none',
    whiteSpace: 'nowrap',
  },
  boardSettleBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '7px 16px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(249,115,22,0.3)',
    transition: 'all 0.15s ease',
    outline: 'none',
    whiteSpace: 'nowrap',
  },
  boardIconBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '7px 13px',
    borderRadius: 8,
    border: '1.5px solid #cbd5e1',
    background: '#ffffff',
    color: '#0284c7',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    outline: 'none',
    whiteSpace: 'nowrap',
  },
  boardDangerBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '7px 13px',
    borderRadius: 8,
    border: '1.5px solid #fecaca',
    background: '#fef2f2',
    color: '#dc2626',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: '0 1px 2px rgba(220,38,38,0.05)',
    outline: 'none',
    whiteSpace: 'nowrap',
  },

  /* Empty State */
  emptyStateBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    background: 'white',
    borderRadius: 14,
    border: '1px dashed #cbd5e1',
    textAlign: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: '#334155',
  },
  emptySub: {
    fontSize: 12,
    color: '#64748b',
    maxWidth: 360,
  },

  /* Modals */
  /* Modals */
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.32)',
    backdropFilter: 'blur(5px)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalDialog: {
    background: '#ffffff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 560,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 20px 45px -15px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.03)',
    animation: '_ots_in 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  modalHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #f1f5f9',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    background: '#ffffff',
  },
  modalTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  tokenHeaderBadge: {
    background: '#f8fafc',
    color: '#475569',
    fontSize: 12,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 9999,
    border: '1px solid #e2e8f0',
    display: 'inline-flex',
    alignItems: 'center',
  },
  modalMainTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: '#0f172a',
    letterSpacing: '-0.01em',
    display: 'inline-flex',
    alignItems: 'center',
  },
  modalSubtitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'wrap',
    marginTop: 3,
    fontSize: 12,
    color: '#94a3b8',
  },
  modalOrderRefText: {
    fontWeight: 500,
    color: '#64748b',
  },
  modalTimeText: {
    display: 'inline-flex',
    alignItems: 'center',
    fontWeight: 500,
    color: '#64748b',
  },
  modalCustomerText: {
    display: 'inline-flex',
    alignItems: 'center',
    fontWeight: 500,
    color: '#64748b',
  },
  modalOrderNumberWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  modalOrderNumber: {
    fontSize: 17,
    fontWeight: 800,
    color: '#0f172a',
    letterSpacing: '-0.02em',
  },
  modalDailyBillBadge: {
    background: '#f8fafc',
    color: '#334155',
    fontSize: 12,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 9999,
    border: '1px solid #e2e8f0',
  },
  modalStatusPill: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '3px 9px',
    borderRadius: 9999,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  },
  modalSubtitleChips: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  metaPillDineIn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: '#eff6ff',
    color: '#1d4ed8',
    border: '1px solid #bfdbfe',
    fontSize: 12,
    fontWeight: 600,
    padding: '3px 9px',
    borderRadius: 8,
  },
  metaPillTakeaway: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: '#f0fdf4',
    color: '#15803d',
    border: '1px solid #bbf7d0',
    fontSize: 12,
    fontWeight: 600,
    padding: '3px 9px',
    borderRadius: 8,
  },
  metaPillDelivery: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: '#faf5ff',
    color: '#7e22ce',
    border: '1px solid #e9d5ff',
    fontSize: 12,
    fontWeight: 600,
    padding: '3px 9px',
    borderRadius: 8,
  },
  metaPillTime: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    background: '#f8fafc',
    color: '#64748b',
    border: '1px solid #e2e8f0',
    fontSize: 11.5,
    fontWeight: 500,
    padding: '3px 8px',
    borderRadius: 8,
  },
  metaPillCustomer: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: '#f8fafc',
    color: '#475569',
    border: '1px solid #e2e8f0',
    fontSize: 11.5,
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: 8,
  },
  modalCloseIcon: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: '#f8fafc',
    border: '1px solid #f1f5f9',
    color: '#64748b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
  modalBody: {
    padding: '16px 20px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    background: '#ffffff',
  },
  orderItemsBox: {
    border: '1px solid #f1f5f9',
    borderRadius: 14,
    overflow: 'hidden',
    background: '#ffffff',
  },
  orderItemsHeader: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2fr) 42px 75px 80px',
    padding: '9px 16px',
    background: '#fafbfc',
    borderBottom: '1px solid #f1f5f9',
    fontSize: 11,
    fontWeight: 600,
    color: '#94a3b8',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  orderItemsList: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 260,
    overflowY: 'auto',
  },
  orderItemRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2fr) 42px 75px 80px',
    padding: '11px 16px',
    borderBottom: '1px solid #f8fafc',
    fontSize: 13,
    alignItems: 'center',
  },
  itemNameText: {
    fontWeight: 600,
    color: '#1e293b',
    fontSize: 13.5,
  },
  itemNotesText: {
    fontSize: 11.5,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  itemQtyBadge: {
    background: '#f8fafc',
    border: '1px solid #f1f5f9',
    color: '#475569',
    fontWeight: 600,
    fontSize: 12,
    padding: '2px 7px',
    borderRadius: 6,
    display: 'inline-block',
  },
  itemUnitPriceText: {
    textAlign: 'right',
    color: '#94a3b8',
    fontWeight: 500,
    fontSize: 12.5,
  },
  itemTotalText: {
    textAlign: 'right',
    fontWeight: 600,
    color: '#0f172a',
    fontSize: 13.5,
  },
  orderTotalRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '13px 16px',
    background: '#ffffff',
    borderTop: '1px solid #f1f5f9',
  },
  orderTotalLabel: {
    fontSize: 13.5,
    fontWeight: 600,
    color: '#334155',
  },
  orderTotalSubtext: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: 500,
  },
  orderGrandTotalVal: {
    fontSize: 19,
    fontWeight: 700,
    color: '#ea580c',
    letterSpacing: '-0.01em',
  },
  modalFooter: {
    padding: '14px 20px',
    borderTop: '1px solid #f1f5f9',
    background: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  modalAuxGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 6,
    width: '100%',
  },
  actionBarBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '8px 6px',
    borderRadius: 10,
    border: '1px solid #e2e8f0',
    background: '#ffffff',
    color: '#475569',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
  },
  actionBarBtnCancel: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '8px 6px',
    borderRadius: 10,
    border: '1px solid #fecdd3',
    background: '#fff5f5',
    color: '#e11d48',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
  },
  modalSettleWrap: {
    display: 'flex',
    justifyContent: 'center',
    width: '100%',
  },
  actionBtnPrimaryCentered: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: '10px 20px',
    borderRadius: 12,
    border: 'none',
    background: 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 3px 10px rgba(249, 115, 22, 0.22)',
    letterSpacing: '0.01em',
    transition: 'all 0.15s ease',
  },
  footerLeft: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  footerRight: {
    display: 'flex',
    gap: 8,
  },
  actionBtnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '9px 15px',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    background: '#ffffff',
    color: '#334155',
    fontSize: 12.5,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
    transition: 'all 0.15s ease',
  },
  actionBtnDanger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '9px 15px',
    borderRadius: 12,
    border: '1px solid #fecdd3',
    background: '#fff1f2',
    color: '#e11d48',
    fontSize: 12.5,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  actionBtnDangerConfirm: {
    padding: '9px 18px',
    borderRadius: 12,
    border: 'none',
    background: '#dc2626',
    color: 'white',
    fontSize: 12.5,
    fontWeight: 800,
    cursor: 'pointer',
  },
  actionBtnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 22px',
    borderRadius: 12,
    border: 'none',
    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(249, 115, 22, 0.38)',
    letterSpacing: '0.01em',
    transition: 'all 0.15s ease',
  },
  confirmDialog: {
    background: 'white',
    borderRadius: 18,
    padding: '22px',
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
  },
  reasonTextarea: {
    width: '100%',
    padding: '11px 14px',
    border: '1.5px solid #e2e8f0',
    borderRadius: 12,
    fontSize: 13,
    color: '#0f172a',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },

  /* Order Type Hero Starter Cards */
  orderTypeHeroCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 18px',
    borderRadius: 12,
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
    marginBottom: 4,
    gap: 16,
    flexWrap: 'wrap',
  },
  heroIconCircleGreen: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: '#ecfdf5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroIconCircleBlue: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: '#f0f9ff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroCardTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: '#0f172a',
    letterSpacing: '-0.02em',
  },
  heroCardSub: {
    fontSize: 11,
    fontWeight: 500,
    color: '#64748b',
    marginTop: 2,
  },
  startTakeawayBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '8px 18px',
    borderRadius: 9,
    border: 'none',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
    transition: 'all 0.15s ease',
  },
  startDeliveryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '8px 18px',
    borderRadius: 9,
    border: 'none',
    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
    transition: 'all 0.15s ease',
  },
};
