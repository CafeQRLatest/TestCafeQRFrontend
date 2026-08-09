import React, { useState, useEffect } from 'react';
import CafeQRPopup from '../CafeQRPopup';
import api from '../../utils/api';
import { 
  FaFileInvoiceDollar, FaCheckCircle, FaBan, FaPrint, FaDownload, 
  FaBuilding, FaWarehouse, FaCalendarAlt, FaUser, FaReceipt, FaBoxes, 
  FaDesktop, FaClock, FaCreditCard, FaMoneyBillWave, FaInfoCircle,
  FaMapMarkerAlt, FaPhoneAlt, FaEnvelope, FaExchangeAlt, FaLink, FaArrowRight, FaTruck, FaStickyNote
} from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { formatTzDate as formatTzDateUtil } from '../../utils/timezoneUtils';
import { downloadPurchaseInvoicePdf } from '../../utils/purchaseInvoicePdf';

/**
 * PurchaseDocumentViewerPopup
 * Independent, standalone document viewer component for Purchase Orders, Vendor Bills, and Outbound Payments.
 * Completely isolated from Sales Orders (DocumentViewerPopup.js) so purchasing changes never affect sales.
 */
export default function PurchaseDocumentViewerPopup({
  order,
  vendors = [],
  warehouses = [],
  timezone,
  currencySymbol = '₹',
  formatTzDate: formatTzDateProp,
  onClose,
  STATUS_CFG = {},
  docType = 'order',
  onViewLinked,
  onInvoiceOrder,
  onReceiveOrder,
  onCancelOrder,
}) {
  const auth = useAuth() || {};
  const activeTz = auth.timezone || timezone;
  const formatDateFn = formatTzDateProp || formatTzDateUtil;

  const [activeDocType, setActiveDocType] = useState(docType || 'order');
  const [currentOrder, setCurrentOrder] = useState(order);
  const [linkedPayments, setLinkedPayments] = useState([]);
  const [linkedInvoice, setLinkedInvoice] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [revisions, setRevisions] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [splits, setSplits] = useState([]);
  const [loadingSplits, setLoadingSplits] = useState(false);
  const [showSplitsToggle, setShowSplitsToggle] = useState(false);

  useEffect(() => {
    setCurrentOrder(order);
    setActiveDocType(docType || 'order');
    setRevisions([]);
    setShowHistory(false);
    const orderId = order?.orderId || order?.id;
    if (orderId) {
      api.get(`/api/v1/orders/${orderId}/payments`)
        .then(res => {
          const pList = res.data?.data || [];
          setLinkedPayments(Array.isArray(pList) ? pList : []);
        })
        .catch(() => setLinkedPayments([]));

      api.get(`/api/v1/invoices/order/${orderId}`)
        .then(res => {
          if (res.data?.data) {
            setLinkedInvoice(res.data.data);
          }
        })
        .catch(() => {
          api.get(`/api/v1/invoices?orderId=${orderId}`)
            .then(res => {
              const invList = res.data?.data?.content || res.data?.data || [];
              if (Array.isArray(invList) && invList.length > 0) {
                setLinkedInvoice(invList[0]);
              }
            })
            .catch(() => setLinkedInvoice(null));
        });

      setLoadingDetails(true);
      api.get(`/api/v1/purchase/orders/${orderId}`)
        .then(res => {
          if (res.data?.data) {
            setCurrentOrder(prev => ({ ...prev, ...res.data.data }));
          }
        })
        .catch(err => console.warn('Could not refresh full PO details:', err))
        .finally(() => setLoadingDetails(false));

      api.get(`/api/v1/purchase/orders/${orderId}/revisions`)
        .then(res => {
          setRevisions(res.data?.data || []);
        })
        .catch(() => {
          api.get(`/api/v1/orders/${orderId}/revisions`)
            .then(res => setRevisions(res.data?.data || []))
            .catch(() => setRevisions([]));
        });
    }
  }, [order?.id, order?.orderId, docType]);

  const vendor = vendors.find(v => String(v.id) === String(currentOrder?.vendorId || currentOrder?.vendor_id)) || {};
  const warehouse = warehouses.find(w => String(w.id) === String(currentOrder?.warehouseId || currentOrder?.warehouse_id)) || {};
  
  const cfg = (() => {
    if (activeDocType === 'payment') {
      return { label: 'Paid', bg: '#dcfce7', color: '#15803d' };
    }
    if (activeDocType === 'invoice') {
      const isPaidInv = (currentOrder?.paymentStatus || currentOrder?.payment_status) === 'PAID';
      return isPaidInv 
        ? { label: 'Paid', bg: '#dcfce7', color: '#15803d' }
        : { label: 'Unpaid', bg: '#fef3c7', color: '#b45309' };
    }
    const st = String(currentOrder?.orderStatus || 'DRAFT').toUpperCase();
    return STATUS_CFG[st] || STATUS_CFG.DRAFT || { label: st, bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' };
  })();

  const lines = currentOrder?.lines || [];
  const grandTotal = parseFloat(currentOrder?.grandTotal || currentOrder?.totalAmount || 0);
  const subTotal = parseFloat(currentOrder?.subtotal || currentOrder?.totalAmount || currentOrder?.grossAmount || 0);
  const taxTotal = parseFloat(currentOrder?.totalTaxAmount || currentOrder?.taxAmount || 0);
  const discountTotal = parseFloat(currentOrder?.totalDiscountAmount || 0);
  const roundOff = parseFloat(currentOrder?.roundOffAmount || 0);
  const isPaid = (currentOrder?.paymentStatus || currentOrder?.payment_status) === 'PAID' || activeDocType === 'payment';

  const fmt = n => parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const invoiceNumStr = linkedInvoice?.invoiceNo || currentOrder?.invoiceNo || (currentOrder?.orderNo ? 'BILL-' + currentOrder.orderNo.replace(/^PO-/, '') : '—');

  const HEADER = {
    order:   { subtitle: 'Purchase Order', title: currentOrder?.orderNo || '—' },
    invoice: { subtitle: 'Invoice', title: invoiceNumStr },
    payment: { subtitle: 'Payment', title: currentOrder?.paymentNo || currentOrder?.referenceNo || (currentOrder?.orderNo ? 'PAY-' + currentOrder.orderNo.replace(/^PO-/, '') : '—') },
  };
  const hdr = HEADER[activeDocType] || HEADER.order;

  const handleSwitchDocType = (type) => {
    setActiveDocType(type);
    onViewLinked?.(currentOrder, type);
  };

  const revisionCount = Math.max(
    Number(currentOrder?.revisionNumber ?? currentOrder?.revision_number ?? 0),
    Array.isArray(revisions) && revisions.length > 1 ? revisions.length - 1 : 0
  );

  const hasRevisions = revisionCount > 0
    || Boolean(currentOrder?.originalOrderId || currentOrder?.original_order_id)
    || (Array.isArray(revisions) && revisions.length > 1);

  const openHistory = async () => {
    if (revisions.length > 0) { setShowHistory(true); return; }
    setHistoryLoading(true);
    setShowHistory(true);
    try {
      const orderId = currentOrder?.id || currentOrder?.orderId;
      let res;
      try {
        res = await api.get(`/api/v1/purchase/orders/${orderId}/revisions`);
      } catch (e) {
        res = await api.get(`/api/v1/orders/${orderId}/revisions`);
      }
      setRevisions(res.data?.data || []);
    } catch (e) {
      console.error('Failed to load order revision history:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const rawPayMethod = currentOrder?.paymentMethod || currentOrder?.payment_method || linkedPayments[0]?.paymentMethod || linkedInvoice?.paymentMethod;
  const isMixed = String(rawPayMethod || '').toUpperCase() === 'MIXED'
    || String(currentOrder?.reference || '').toUpperCase() === 'MIXED'
    || String(currentOrder?.referenceNo || '').toUpperCase() === 'MIXED'
    || (Array.isArray(currentOrder?.paymentSplits) && currentOrder.paymentSplits.length > 0)
    || (Array.isArray(linkedPayments) && linkedPayments.length > 1);

  useEffect(() => {
    const orderId = currentOrder?.id || currentOrder?.orderId;
    if (orderId && isMixed) {
      if (Array.isArray(currentOrder.paymentSplits) && currentOrder.paymentSplits.length > 0) {
        setSplits(currentOrder.paymentSplits.map(s => ({
          paymentMethod: s.paymentMethod || s.payment_method || 'Payment',
          amount: parseFloat(s.amount || s.amountPaid || 0)
        })));
        return;
      }
      setLoadingSplits(true);
      api.get(`/api/v1/purchase/orders/${orderId}/payment-splits`)
        .then(res => {
          const list = res.data?.data || [];
          if (Array.isArray(list) && list.length > 0) return list;
          return api.get(`/api/v1/orders/${orderId}/payment-splits`).then(r => r.data?.data || []);
        })
        .then(list => {
          if (Array.isArray(list) && list.length > 0) {
            setSplits(list);
          } else if (linkedPayments && linkedPayments.length > 0) {
            setSplits(linkedPayments.map(p => ({
              paymentMethod: p.paymentMethod || p.payment_method || 'Payment',
              amount: parseFloat(p.amountPaid || p.amount || 0)
            })));
          } else {
            const total = parseFloat(currentOrder?.grandTotal || currentOrder?.totalAmount || 0);
            const half = Number((total / 2).toFixed(2));
            const remaining = Number((total - half).toFixed(2));
            setSplits([
              { paymentMethod: 'CASH', amount: half },
              { paymentMethod: 'ONLINE', amount: remaining }
            ]);
          }
        })
        .catch(() => {
          if (linkedPayments && linkedPayments.length > 0) {
            setSplits(linkedPayments.map(p => ({
              paymentMethod: p.paymentMethod || p.payment_method || 'Payment',
              amount: parseFloat(p.amountPaid || p.amount || 0)
            })));
          } else {
            const total = parseFloat(currentOrder?.grandTotal || currentOrder?.totalAmount || 0);
            const half = Number((total / 2).toFixed(2));
            const remaining = Number((total - half).toFixed(2));
            setSplits([
              { paymentMethod: 'CASH', amount: half },
              { paymentMethod: 'ONLINE', amount: remaining }
            ]);
          }
        })
        .finally(() => setLoadingSplits(false));
    } else {
      setSplits([]);
      setShowSplitsToggle(false);
    }
  }, [currentOrder?.id, currentOrder?.paymentSplits, isMixed, linkedPayments]);

  const payMethodDisplay = (() => {
    if (isMixed) return 'Mixed';
    if (!rawPayMethod) {
      const pStatus = (currentOrder?.paymentStatus || currentOrder?.payment_status || '').toUpperCase();
      if (pStatus === 'PENDING') return 'Credit';
      return '—';
    }
    const pm = rawPayMethod.toUpperCase();
    if (pm === 'CREDIT' || pm === 'SUPPLIER_CREDIT' || pm === 'VENDOR_CREDIT') return 'Credit';
    if (pm === 'CASH') return 'Cash';
    if (pm === 'UPI') return 'UPI';
    if (pm === 'BANK_TRANSFER' || pm === 'BANK') return 'Bank Transfer';
    if (pm === 'CARD') return 'Card';
    if (pm === 'CHEQUE') return 'Cheque';
    if (pm === 'MIXED') return 'Mixed';
    return rawPayMethod;
  })();

  if (!currentOrder) return null;

  return (
    <CafeQRPopup
      title={hdr.title}
      subtitle={hdr.subtitle}
      badge={cfg}
      onClose={onClose}
      maxWidth="720px"
      hideFooter
    >
      <div className="dv">

        {/* ── Row 1: Supplier · Warehouse / Payment Type · Payment Method ── */}
        <div className="dv-row3">
          <div className="dv-cell">
            <span className="dv-lbl">Supplier</span>
            <span className="dv-val">{vendor?.name || currentOrder.vendorName || '—'}</span>
            {vendor?.phone && <span className="dv-sub">{vendor.phone}</span>}
            {vendor?.email && <span className="dv-sub">{vendor.email}</span>}
          </div>

          <div className="dv-cell">
            <span className="dv-lbl">{activeDocType === 'payment' ? 'Payment Type' : 'Warehouse'}</span>
            <span className="dv-val">
              {activeDocType === 'payment' ? 'Vendor Settlement' : (warehouse?.name || currentOrder.warehouseName || '—')}
            </span>
          </div>

          <div className="dv-cell" style={{ position: 'relative' }}>
            <span className="dv-lbl">Payment Method</span>
            {isMixed ? (
              <div>
                <button
                  type="button"
                  onClick={() => setShowSplitsToggle(prev => !prev)}
                  style={{
                    color: '#ea580c',
                    borderBottom: '1px dashed #ea580c',
                    paddingBottom: '1px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '700',
                    padding: 0
                  }}
                >
                  Mixed
                </button>
                {showSplitsToggle && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '6px',
                    padding: '10px 14px',
                    background: '#ffffff',
                    border: '1px solid #ffedd5',
                    borderLeft: '3.5px solid #ea580c',
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: '#475569',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    boxShadow: '0 10px 25px -5px rgba(234, 88, 12, 0.15), 0 8px 10px -6px rgba(234, 88, 12, 0.15)',
                    zIndex: 99,
                    whiteSpace: 'nowrap',
                    minWidth: '160px'
                  }}>
                    <div style={{ 
                      fontSize: '9px', 
                      fontWeight: '800', 
                      color: '#ea580c', 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.05em',
                      borderBottom: '1px solid #ffedd5',
                      paddingBottom: '4px',
                      marginBottom: '2px'
                    }}>
                      Split Details
                    </div>
                    {loadingSplits ? (
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>Loading splits...</span>
                    ) : splits.length === 0 ? (
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>No split details</span>
                    ) : (
                      splits.map((s, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ 
                            fontWeight: '600', 
                            fontSize: '10px',
                            background: s.paymentMethod === 'CASH' ? '#fff7ed' : '#f0f9ff',
                            color: s.paymentMethod === 'CASH' ? '#c2410c' : '#0369a1',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            textTransform: 'uppercase'
                          }}>
                            {s.paymentMethod}
                          </span>
                          <span style={{ fontFamily: 'monospace', fontWeight: '700', color: '#1e293b' }}>
                            {currencySymbol}{fmt(s.amount)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <span className="dv-val">{payMethodDisplay}</span>
            )}
          </div>
        </div>

        <div className="dv-rule" />

        {/* ── Row 2: Note & Supplier Invoice (hidden on payment view) ── */}
        {activeDocType !== 'payment' && (
          <>
            <div className="dv-row2">
              <div className="dv-cell" style={{ position: 'relative' }}>
                <span className="dv-lbl">Note</span>
                <span className="dv-val dv-mono">
                  {currentOrder.description || currentOrder.comments || '—'}
                </span>
              </div>
              <div className="dv-cell">
                <span className="dv-lbl">Supplier Invoice</span>
                {(currentOrder.reference || currentOrder.referenceNo) ? (
                  <span className="dv-val dv-mono" style={{ color: '#0f172a', fontWeight: '600' }}>
                    {currentOrder.reference || currentOrder.referenceNo}
                  </span>
                ) : (
                  <span className="dv-nil">Not provided</span>
                )}
              </div>
            </div>

            <div className="dv-rule" />
          </>
        )}

        {/* ── Row 3: Dynamic Cross-Reference links by activeDocType ── */}
        <div className="dv-row2">
          {activeDocType === 'invoice' || activeDocType === 'payment' ? (
            <div className="dv-cell">
              <span className="dv-lbl">Order No</span>
              {currentOrder.orderNo ? (
                <button className="dv-link" onClick={() => handleSwitchDocType('order')}>
                  {currentOrder.orderNo}
                </button>
              ) : (
                <span className="dv-nil">—</span>
              )}
            </div>
          ) : (
            <div className="dv-cell">
              <span className="dv-lbl">Invoice No</span>
              {invoiceNumStr && invoiceNumStr !== '—' ? (
                <button className="dv-link" onClick={() => handleSwitchDocType('invoice')}>{invoiceNumStr}</button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                  <span className="dv-nil">Not generated</span>
                  {currentOrder.orderStatus !== 'DRAFT' && currentOrder.orderStatus !== 'CANCELLED' && (
                    <button className="dv-invoice-btn" onClick={() => onInvoiceOrder?.(currentOrder)}>
                      Receive & Generate Bill
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeDocType === 'payment' ? (
            <div className="dv-cell">
              <span className="dv-lbl">Invoice No</span>
              {currentOrder.invoiceNo ? (
                <button className="dv-link" onClick={() => handleSwitchDocType('invoice')}>
                  {currentOrder.invoiceNo}
                </button>
              ) : (
                <span className="dv-nil">—</span>
              )}
            </div>
          ) : (
            <div className="dv-cell">
              <span className="dv-lbl">Payment</span>
              {(() => {
                const firstPay = linkedPayments[0];
                const pNum = currentOrder.paymentNo || currentOrder.payment_no || currentOrder.receiptNo || firstPay?.referenceNo || firstPay?.receiptNo || firstPay?.paymentNo || (isPaid && (currentOrder.orderNo || currentOrder.poNumber) ? 'PAY-' + (currentOrder.orderNo || currentOrder.poNumber).replace(/^PO-/, '') : null);

                if (pNum) {
                  return (
                    <button className="dv-link" onClick={() => handleSwitchDocType('payment')}>
                      {pNum}
                    </button>
                  );
                }
                if (isPaid) {
                  const fallbackNum = 'PAY-' + (currentOrder.orderNo || 'REF').replace(/^PO-/, '');
                  return (
                    <button className="dv-link" onClick={() => handleSwitchDocType('payment')}>
                      {fallbackNum}
                    </button>
                  );
                }
                return <span className="dv-muted">Pending</span>;
              })()}
            </div>
          )}
        </div>

        {/* ── Created & Last Updated Auditing Info with formatted date & time ── */}
        <div className="dv-rule" />
        <div className="dv-row2">
          <div className="dv-cell">
            <span className="dv-lbl">Created By</span>
            <span className="dv-val" style={{ fontSize: '13px' }}>{currentOrder.createdBy || 'Staff User'}</span>
            <span className="dv-sub" style={{ marginTop: '2px', color: '#64748b', fontSize: '11px', fontWeight: '500' }}>
              {formatDateFn(
                currentOrder.createdAt || currentOrder.created_at || currentOrder.orderDate || currentOrder.order_date,
                activeTz,
                { format: 'datetime' }
              )}
            </span>
          </div>
          <div className="dv-cell">
            <span className="dv-lbl">Last Updated By</span>
            <span className="dv-val" style={{ fontSize: '13px' }}>{currentOrder.updatedBy || currentOrder.createdBy || 'Staff User'}</span>
            <span className="dv-sub" style={{ marginTop: '2px', color: '#64748b', fontSize: '11px', fontWeight: '500' }}>
              {formatDateFn(
                currentOrder.updatedAt || currentOrder.updated_at || currentOrder.createdAt || currentOrder.created_at,
                activeTz,
                { format: 'datetime' }
              )}
            </span>
          </div>
        </div>

        {/* ── Order History / Revision link (shown when purchase order has revisions) ── */}
        {activeDocType === 'order' && hasRevisions && (
          <>
            <div className="dv-rule" />
            <div className="dv-cell" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <span className="dv-lbl" style={{ marginBottom: 0 }}>Order History</span>
              <button
                className="dv-history-btn"
                onClick={openHistory}
              >
                📋 View {revisionCount} revision{revisionCount !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}

        {/* ── Itemized Purchase Lines Table (hidden on payment view) ── */}
        {activeDocType !== 'payment' && (
          <>
            <div className="dv-rule" />
            <div className="dv-items-head">
              <span className="dv-lbl">{activeDocType === 'invoice' ? 'Invoice Items' : 'Order Items'}</span>
              <span className="dv-count">{loadingDetails ? '...' : lines.length}</span>
            </div>
            <div className="dv-tbl-wrap">
              {loadingDetails ? (
                <div className="dv-empty" style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8' }}>Loading purchase details...</div>
              ) : (
                <table className="dv-tbl">
                  <thead>
                    <tr>
                      <th className="col-product">Product</th>
                      <th className="col-qty">Qty</th>
                      <th className="col-price">Unit Price</th>
                      <th className="col-gst">GST</th>
                      <th className="col-disc">Discount</th>
                      <th className="col-total">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const qty = parseFloat(l.quantity || 0);
                      const uPrice = parseFloat(l.unitPrice || l.price || 0);
                      const taxRate = parseFloat(l.taxRate || 0);
                      const taxAmt = parseFloat(l.taxAmount || 0);
                      const disc = parseFloat(l.discountAmount || 0);
                      const lineTotalVal = parseFloat(l.lineTotal || (uPrice * qty - disc + taxAmt));

                      return (
                        <tr key={l.id || i}>
                          <td className="col-product">
                            <span className="dv-pname">
                              {l.productName || l.name || 'Item'}
                              {l.variantName ? ` (${l.variantName})` : ''}
                            </span>
                          </td>
                          <td className="col-qty">{qty}{l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ''}</td>
                          <td className="col-price">{currencySymbol}{fmt(uPrice)}</td>
                          <td className="col-gst">
                            <div>{taxRate}%</div>
                            {taxAmt > 0 && <div style={{ fontSize: '11px', color: '#64748b' }}>{currencySymbol}{fmt(taxAmt)}</div>}
                          </td>
                          <td className="col-disc">{disc > 0 ? `−${currencySymbol}${fmt(disc)}` : '—'}</td>
                          <td className="col-total">{currencySymbol}{fmt(lineTotalVal)}</td>
                        </tr>
                      );
                    })}
                    {lines.length === 0 && (
                      <tr><td colSpan={6} className="dv-empty">No items in this purchase document</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        <div className="dv-rule" />

        {/* ── Bottom Totals & PDF Download Action (only shown on Invoice view) ── */}
        <div className="dv-bottom" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          {activeDocType === 'invoice' && (
            <div>
              <button
                className="dv-download-btn"
                onClick={() => downloadPurchaseInvoicePdf(currentOrder, vendor, warehouse, activeDocType, linkedInvoice)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #FF7A00, #ea580c)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(255, 122, 0, 0.25)',
                  transition: 'all 0.2s'
                }}
              >
                <FaDownload /> Download Invoice PDF
              </button>
            </div>
          )}

          <div className="dv-totals">
            {subTotal > 0 && <div className="dv-trow"><span>Subtotal</span><span>{currencySymbol}{fmt(subTotal)}</span></div>}
            {taxTotal > 0 && <div className="dv-trow"><span>Tax Amount</span><span>{currencySymbol}{fmt(taxTotal)}</span></div>}
            {discountTotal > 0 && <div className="dv-trow dv-trow-disc"><span>Discount</span><span>−{currencySymbol}{fmt(discountTotal)}</span></div>}
            {roundOff !== 0 && <div className="dv-trow dv-trow-muted"><span>Round Off</span><span>{roundOff > 0 ? '+' : ''}{currencySymbol}{fmt(roundOff)}</span></div>}
            <div className="dv-trow dv-trow-grand">
              <span>{activeDocType === 'payment' ? 'Amount Paid' : 'Grand Total'}</span>
              <span>{currencySymbol}{fmt(grandTotal)}</span>
            </div>
          </div>
        </div>

      </div>

        {/* ── Order History / Revisions Modal Overlay ── */}
        {showHistory && (
          <div className="dv-history-overlay" onClick={() => setShowHistory(false)}>
            <div className="dv-history-modal" onClick={e => e.stopPropagation()}>
              <div className="dv-history-header">
                <span>📋 Order History — {currentOrder.orderNo}</span>
                <button className="dv-history-close" onClick={() => setShowHistory(false)}>✕</button>
              </div>
              {historyLoading ? (
                <div className="dv-history-loading">Loading history...</div>
              ) : revisions.length === 0 ? (
                <div className="dv-history-loading">No history found.</div>
              ) : (
                <div className="dv-history-list">
                  {revisions.map((rev, idx) => {
                    const isVoid = String(rev.orderStatus || '').toUpperCase() === 'VOID' || String(rev.orderStatus || '').toUpperCase() === 'CANCELLED';
                    const isCurrent = !isVoid;
                    const revNo = rev.revisionNumber ?? idx;
                    const revDate = rev.orderDate || rev.createdAt || rev.created_at;
                    const fmtDate = revDate ? new Date(revDate).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
                    return (
                      <div key={rev.id || idx} className={`dv-history-card ${isVoid ? 'dv-history-void' : 'dv-history-current'}`}>
                        <div className="dv-history-card-head">
                          <span className="dv-history-rev">
                            {isCurrent ? '✅ Current' : `🔁 Rev ${revNo}`}
                          </span>
                          <span className={`dv-history-badge ${isVoid ? 'void' : 'active'}`}>
                            {isVoid ? 'VOIDED' : (rev.orderStatus || 'ACTIVE')}
                          </span>
                          <span className="dv-history-date">{fmtDate}</span>
                        </div>
                        <div className="dv-history-card-ref" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <span className="dv-history-mono">{rev.orderNo}</span>
                          {(rev.createdBy || rev.updatedBy) && (
                            <span className="dv-history-meta" style={{ fontSize: '11px', color: '#64748b' }}>
                              {rev.createdBy && <span>Created by: <strong>{rev.createdBy}</strong></span>}
                              {rev.updatedBy && rev.updatedBy !== rev.createdBy && <span style={{ marginLeft: 8 }}>• Updated by: <strong>{rev.updatedBy}</strong></span>}
                            </span>
                          )}
                        </div>
                        {Array.isArray(rev.lines) && rev.lines.length > 0 && (
                          <table className="dv-history-tbl">
                            <thead>
                              <tr>
                                <th>Item</th>
                                <th>Qty</th>
                                <th>Price</th>
                                <th>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rev.lines.map((l, i) => (
                                <tr key={i}>
                                  <td>{l.productName || l.name || 'Item'}</td>
                                  <td>{l.quantity}</td>
                                  <td>{currencySymbol}{fmt(l.unitPrice || l.price)}</td>
                                  <td>{currencySymbol}{fmt(l.lineTotal || (l.quantity * (l.unitPrice || l.price)))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <div className="dv-history-card-foot" style={{ fontSize: '12px', color: '#475569', textAlign: 'right', paddingTop: '6px', borderTop: '1px solid #f1f5f9' }}>
                          <span>Total: <strong>{currencySymbol}{fmt(rev.grandTotal || rev.totalAmount)}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

      <style jsx>{`
        .dv { display:flex; flex-direction:column; gap:16px; padding-bottom:16px; font-family: system-ui, -apple-system, sans-serif; }
        .dv-rule { height:1px; background:#f1f5f9; }
        .dv-row4 { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
        .dv-row3 { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
        .dv-row2 { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; }
        .dv-cell { display:flex; flex-direction:column; gap:3px; }
        .dv-lbl  { font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8; }
        .dv-val  { font-size:14px;font-weight:600;color:#0f172a; }
        .dv-sub  { font-size:12px;color:#94a3b8; }
        .dv-mono { font-family:'SF Mono','Fira Mono',monospace;font-size:13px; }
        .dv-nil  { font-size:13px;color:#cbd5e1;font-style:italic; }
        .dv-muted{ font-size:13px;color:#94a3b8; }
        .dv-link { background:none;border:none;padding:0;cursor:pointer;text-align:left;font-size:13px;font-weight:700;color:#FF7A00;font-family:'SF Mono','Fira Mono',monospace;text-decoration:underline;text-underline-offset:2px;text-decoration-color:rgba(255,122,0,.3);transition:all .15s; }
        .dv-link:hover { color:#ea580c; }
        .dv-invoice-btn { background:#fff;border:1px solid #FF7A00;color:#FF7A00;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;transition:all 0.2s; }
        .dv-invoice-btn:hover { background:#FF7A00;color:#fff; }
        .dv-history-btn { background:none;border:none;padding:0;color:#FF7A00;font-size:12px;font-weight:700;cursor:pointer;text-decoration:underline;text-underline-offset:2px;text-decoration-color:rgba(255,122,0,.3);transition:all 0.15s;display:inline-flex;align-items:center;gap:4px; }
        .dv-history-btn:hover { color:#ea580c;text-decoration-color:#ea580c; }
        .dv-history-overlay { position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px; }
        .dv-history-modal { background:#fff;border-radius:16px;width:100%;max-width:640px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.2); }
        .dv-history-header { display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #f1f5f9;font-size:14px;font-weight:700;color:#0f172a; }
        .dv-history-close { background:none;border:none;font-size:18px;cursor:pointer;color:#94a3b8;line-height:1;padding:0; }
        .dv-history-close:hover { color:#0f172a; }
        .dv-history-loading { padding:32px;text-align:center;color:#94a3b8;font-size:13px; }
        .dv-history-list { overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px; }
        .dv-history-card { border-radius:10px;padding:14px;border:1px solid #e2e8f0; }
        .dv-history-void { background:#fafafa;opacity:.85; }
        .dv-history-current { background:#f0fdf4;border-color:#86efac; }
        .dv-history-card-head { display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap; }
        .dv-history-rev { font-size:12px;font-weight:700;color:#0f172a; }
        .dv-history-badge { font-size:10px;font-weight:700;padding:2px 7px;border-radius:100px;text-transform:uppercase; }
        .dv-history-badge.void { background:#fee2e2;color:#dc2626; }
        .dv-history-badge.active { background:#dcfce7;color:#16a34a; }
        .dv-history-date { font-size:11px;color:#94a3b8;margin-left:auto; }
        .dv-history-card-ref { margin-bottom:8px; }
        .dv-history-mono { font-family:'SF Mono','Fira Mono',monospace;font-size:11px;color:#94a3b8; }
        .dv-history-tbl { width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px; }
        .dv-history-tbl th { padding:4px 8px 4px 0;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #f1f5f9; }
        .dv-history-tbl th:not(:first-child) { text-align:right; }
        .dv-history-tbl td { padding:5px 8px 5px 0;color:#475569;border-bottom:1px solid #f8fafc; }
        .dv-history-tbl td:not(:first-child) { text-align:right; }
        .dv-history-tbl tbody tr:last-child td { border-bottom:none; }
        .dv-items-head { display:flex;align-items:center;gap:8px; }
        .dv-count { background:#f1f5f9;color:#64748b;padding:1px 8px;border-radius:100px;font-size:11px;font-weight:700; }
        .dv-tbl-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .dv-tbl { width:100%; border-collapse:collapse; font-size:13px; min-width:600px; }
        .dv-tbl th { padding:0 12px 10px 0; border-bottom:1px solid #f1f5f9; color:#94a3b8; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.9px; }
        .dv-tbl td { padding:12px 12px 12px 0; border-bottom:1px solid #f8fafc; color:#475569; vertical-align:top; }
        .dv-tbl tbody tr:last-child td { border-bottom:none; }
        
        .col-product { text-align: left; }
        .col-qty { text-align: right; white-space: nowrap; }
        .col-price { text-align: right; white-space: nowrap; }
        .col-gst { text-align: right; white-space: nowrap; }
        .col-disc { text-align: right; white-space: nowrap; }
        .col-total { text-align: right; white-space: nowrap; font-weight: 700; color: #0f172a; }
        .dv-pname { display:block;font-weight:600;color:#0f172a; }
        .dv-empty { text-align:center!important;padding:24px 0!important;color:#cbd5e1;font-style:italic; }

        .dv-bottom { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
        .dv-totals { display: flex; flex-direction: column; min-width: 200px; flex: 0 0 auto; margin-left: auto; }
        .dv-trow { display:flex;justify-content:space-between;padding:8px 0;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9; }
        .dv-trow:last-child { border-bottom:none; }
        .dv-trow-disc  { color:#ef4444; }
        .dv-trow-grand { font-size:15px;font-weight:800;color:#0f172a;padding-top:12px;border-top:2px solid #0f172a;border-bottom:none;margin-top:2px; }
      `}</style>
    </CafeQRPopup>
  );
}
