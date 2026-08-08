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

  useEffect(() => {
    setCurrentOrder(order);
    setActiveDocType(docType || 'order');
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

      const hasLines = order?.lines && Array.isArray(order.lines) && order.lines.length > 0;
      if (!hasLines || !order?.createdBy) {
        setLoadingDetails(true);
        api.get(`/api/v1/purchase/orders/${orderId}`)
          .then(res => {
            if (res.data?.data) {
              setCurrentOrder(prev => ({ ...prev, ...res.data.data }));
            }
          })
          .catch(err => console.warn('Could not refresh full PO details:', err))
          .finally(() => setLoadingDetails(false));
      }
    }
  }, [order?.id, order?.orderId, docType]);

  if (!currentOrder) return null;

  const vendor = vendors.find(v => String(v.id) === String(currentOrder.vendorId || currentOrder.vendor_id)) || {};
  const warehouse = warehouses.find(w => String(w.id) === String(currentOrder.warehouseId || currentOrder.warehouse_id)) || {};
  
  const cfg = (() => {
    if (activeDocType === 'payment') {
      return { label: 'Paid', bg: '#dcfce7', color: '#15803d' };
    }
    if (activeDocType === 'invoice') {
      const isPaidInv = (currentOrder.paymentStatus || currentOrder.payment_status) === 'PAID';
      return isPaidInv 
        ? { label: 'Paid', bg: '#dcfce7', color: '#15803d' }
        : { label: 'Unpaid', bg: '#fef3c7', color: '#b45309' };
    }
    const st = String(currentOrder.orderStatus || 'DRAFT').toUpperCase();
    return STATUS_CFG[st] || STATUS_CFG.DRAFT || { label: st, bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' };
  })();

  const lines = currentOrder.lines || [];
  const grandTotal = parseFloat(currentOrder.grandTotal || currentOrder.totalAmount || 0);
  const subTotal = parseFloat(currentOrder.subtotal || currentOrder.totalAmount || currentOrder.grossAmount || 0);
  const taxTotal = parseFloat(currentOrder.totalTaxAmount || currentOrder.taxAmount || 0);
  const discountTotal = parseFloat(currentOrder.totalDiscountAmount || 0);
  const roundOff = parseFloat(currentOrder.roundOffAmount || 0);
  const isPaid = (currentOrder.paymentStatus || currentOrder.payment_status) === 'PAID' || activeDocType === 'payment';

  const fmt = n => parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const invoiceNumStr = linkedInvoice?.invoiceNo || currentOrder.invoiceNo || (currentOrder.orderNo ? 'BILL-' + currentOrder.orderNo.replace(/^PO-/, '') : '—');

  const HEADER = {
    order:   { subtitle: 'Purchase Order', title: currentOrder.orderNo || '—' },
    invoice: { subtitle: 'Invoice', title: invoiceNumStr },
    payment: { subtitle: 'Payment', title: currentOrder.paymentNo || currentOrder.referenceNo || (currentOrder.orderNo ? 'PAY-' + currentOrder.orderNo.replace(/^PO-/, '') : '—') },
  };
  const hdr = HEADER[activeDocType] || HEADER.order;

  const handleSwitchDocType = (type) => {
    setActiveDocType(type);
    onViewLinked?.(currentOrder, type);
  };

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

          <div className="dv-cell">
            <span className="dv-lbl">Payment Method</span>
            <span className="dv-val">{currentOrder.paymentMethod || currentOrder.payment_method || 'Cash'}</span>
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
