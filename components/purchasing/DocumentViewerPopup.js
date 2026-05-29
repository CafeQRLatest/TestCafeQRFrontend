import React from 'react';
import CafeQRPopup from '../CafeQRPopup';

/**
 * DocumentViewerPopup
 *
 * Props:
 *  order, vendors, warehouses, timezone, currencySymbol, formatTzDate, onClose, STATUS_CFG
 *  docType: 'order' | 'invoice' | 'payment'   — controls header label & which fields are shown
 *  onViewLinked: (order, docType) => void      — called when user clicks invoice/payment link
 */
export default function DocumentViewerPopup({
  order,
  vendors = [],
  warehouses = [],
  timezone,
  currencySymbol,
  formatTzDate,
  onClose,
  STATUS_CFG,
  docType = 'order',
  onViewLinked,
  onInvoiceOrder,
}) {
  if (!order) return null;

  const isSale = order.orderType === 'SALE';
  const vendor    = !isSale && vendors ? vendors.find(v => String(v.id) === String(order.vendorId)) : null;
  const warehouse = !isSale && warehouses ? warehouses.find(w => String(w.id) === String(order.warehouseId)) : null;
  const cfg       = STATUS_CFG[order.orderStatus] || STATUS_CFG.DRAFT;
  const isPaid    = order.paymentStatus === 'PAID';
  const fmt       = n => parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  /* ── header config per docType ─────────────────────────────────────────── */
  const HEADER = {
    order:   { subtitle: isSale ? 'Sale Order' : 'Purchase Order', title: order.orderNo || order.order_no || '—' },
    invoice: { subtitle: 'Invoice',        title: order.invoiceNo || order.invoice_no || order.orderNo || order.order_no || '—' },
    payment: { subtitle: 'Payment',        title: order.paymentNo || order.orderNo || order.order_no || '—' },
  };
  const hdr = HEADER[docType] || HEADER.order;

  /* ── handle linked doc click ───────────────────────────────────────────── */
  const handleLinked = (type) => {
    onClose();                              // close this popup
    onViewLinked?.(order, type);            // parent opens the other one
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

        {/* ── supplier/customer · warehouse/table · date · method/terminal ── */}
        <div className="dv-row4">
          <div className="dv-cell">
            <span className="dv-lbl">{isSale ? 'Customer' : 'Supplier'}</span>
            <span className="dv-val">{isSale ? (order.customerName || order.customer?.name || '-') : (vendor?.name || '—')}</span>
            {!isSale && vendor?.phone && <span className="dv-sub">{vendor.phone}</span>}
            {!isSale && vendor?.email && <span className="dv-sub">{vendor.email}</span>}
            {isSale && (order.customerPhone || order.customer?.phone) && <span className="dv-sub">{order.customerPhone || order.customer?.phone}</span>}
          </div>
          <div className="dv-cell">
            <span className="dv-lbl">{isSale ? 'Table / Type' : 'Warehouse'}</span>
            <span className="dv-val">
              {isSale 
                ? (order.tableNumber || order.table_number
                    ? `Dine in (Table ${order.tableNumber || order.table_number})`
                    : (String(order.fulfillmentType || order.fulfillment_type || '').toUpperCase() === 'TAKEAWAY' 
                        ? 'Parcel' 
                        : String(order.fulfillmentType || order.fulfillment_type || '').toUpperCase() === 'DELIVERY'
                          ? 'Delivery'
                          : 'Dine in'))
                : (warehouse?.name || '—')}
            </span>
          </div>
          <div className="dv-cell">
            <span className="dv-lbl">Date</span>
            <span className="dv-val">{formatTzDate(order.orderDate || order.order_date || order.createdAt || order.created_at, timezone, { format: 'date' })}</span>
            <span className="dv-sub">{formatTzDate(order.orderDate || order.order_date || order.createdAt || order.created_at, timezone, { format: 'time' })}</span>
          </div>
          <div className="dv-cell">
            <span className="dv-lbl">{isSale ? 'Terminal' : 'Payment Method'}</span>
            <span className="dv-val">
              {isSale 
                ? (order.terminalCode || order.terminalName || order.terminal_code || '-') 
                : (order.paymentMethod || 'Credit')}
            </span>
          </div>
        </div>

        <div className="dv-rule" />

        {/* ── reference · cross-ref · payment ── */}
        <div className="dv-row3">
          <div className="dv-cell">
            <span className="dv-lbl">Reference</span>
            <span className="dv-val dv-mono">{order.reference || '—'}</span>
          </div>

          {/* Middle field: Invoice No when viewing PO; Order No when viewing Invoice or Payment */}
          <div className="dv-cell">
            {docType === 'order' ? (
              <>
                <span className="dv-lbl">Invoice No</span>
                {order.invoiceNo ? (
                  <button className="dv-link" onClick={() => handleLinked('invoice')}>
                    {order.invoiceNo}
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                    <span className="dv-nil">Not generated</span>
                    {order.orderStatus !== 'DRAFT' && order.orderStatus !== 'CANCELLED' && (
                      <button 
                        className="dv-invoice-btn"
                        onClick={() => onInvoiceOrder?.(order)}
                      >
                        Invoke Order
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <span className="dv-lbl">Order No</span>
                {order.orderNo ? (
                  <button className="dv-link" onClick={() => handleLinked('order')}>
                    {order.orderNo}
                  </button>
                ) : (
                  <span className="dv-nil">—</span>
                )}
              </>
            )}
          </div>

          <div className="dv-cell">
            {docType === 'payment' ? (
              <>
                <span className="dv-lbl">Invoice No</span>
                {order.invoiceNo ? (
                  <button className="dv-link" onClick={() => handleLinked('invoice')}>
                    {order.invoiceNo}
                  </button>
                ) : (
                  <span className="dv-nil">—</span>
                )}
              </>
            ) : (
              <>
                <span className="dv-lbl">Payment</span>
                {isPaid && order.paymentNo ? (
                  <button className="dv-link" onClick={() => handleLinked('payment')}>
                    {order.paymentNo}
                  </button>
                ) : (
                  <span className="dv-muted">Pending</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── comments ── */}
        {order.description && (
          <>
            <div className="dv-rule" />
            <div className="dv-cell">
              <span className="dv-lbl">Comments</span>
              <span className="dv-comment">{order.description}</span>
            </div>
          </>
        )}

        {docType !== 'payment' && (
          <>
            <div className="dv-rule" />

            {/* ── items ── */}
            <div className="dv-items-head">
              <span className="dv-lbl">
                {docType === 'invoice' ? 'Invoice Items' : 'Order Items'}
              </span>
              <span className="dv-count">{(order.lines || []).length}</span>
            </div>

            <div className="dv-tbl-wrap">
              <table className="dv-tbl">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Tax</th>
                    <th>Discount</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.lines || []).map((l, i) => (
                    <tr key={l.id || i}>
                      <td>
                        <span className="dv-pname">{l.productName || l.name || '—'}</span>
                        {(l.productCode || l.product_code) && <span className="dv-pcode">{l.productCode || l.product_code}</span>}
                      </td>
                      <td>
                        {parseFloat(l.quantity || 0)}
                        {l.unitOfMeasure && <span className="dv-uom"> {l.unitOfMeasure}</span>}
                      </td>
                      <td>{currencySymbol}{fmt(l.unitPrice || l.price)}</td>
                      <td>{parseFloat(l.taxRate || l.tax_rate || 0)}%</td>
                      <td>
                        {parseFloat(l.discountAmount || l.discount_amount || 0) > 0
                          ? <span className="dv-disc">−{currencySymbol}{fmt(l.discountAmount || l.discount_amount)}</span>
                          : '—'}
                      </td>
                      <td className="dv-line-tot">
                        {currencySymbol}
                        {fmt(l.lineTotal || l.line_total || ((parseFloat(l.price || l.unitPrice || 0)) * parseFloat(l.quantity || 0)))}
                      </td>
                    </tr>
                  ))}
                  {(!order.lines || order.lines.length === 0) && (
                    <tr>
                      <td colSpan="6" className="dv-empty">No items in this order</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="dv-rule" />

        {/* ── totals ── */}
        <div className="dv-totals">
          <div className="dv-trow"><span>Subtotal</span><span>{currencySymbol}{fmt(order.totalAmount)}</span></div>
          <div className="dv-trow"><span>Tax</span><span>{currencySymbol}{fmt(order.totalTaxAmount)}</span></div>
          {parseFloat(order.totalDiscountAmount || 0) > 0 && (
            <div className="dv-trow dv-trow-disc">
              <span>Discount</span><span>−{currencySymbol}{fmt(order.totalDiscountAmount)}</span>
            </div>
          )}
          <div className="dv-trow dv-trow-grand">
            <span>{docType === 'payment' ? 'Amount Paid' : 'Grand Total'}</span>
            <span>{currencySymbol}{fmt(order.grandTotal)}</span>
          </div>
        </div>

      </div>

      <style jsx>{`
        .dv { display: flex; flex-direction: column; gap: 16px; }
        .dv-rule { height: 1px; background: #f1f5f9; }

        .dv-row4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; }
        .dv-row3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }

        .dv-cell { display: flex; flex-direction: column; gap: 3px; }
        .dv-lbl  { font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8; }
        .dv-val  { font-size:14px;font-weight:600;color:#0f172a; }
        .dv-sub  { font-size:12px;color:#94a3b8; }
        .dv-mono { font-family:'SF Mono','Fira Mono',monospace;font-size:13px; }
        .dv-nil  { font-size:13px;color:#cbd5e1;font-style:italic; }
        .dv-muted{ font-size:13px;color:#94a3b8; }

        .dv-link {
          background:none;border:none;padding:0;cursor:pointer;text-align:left;
          font-size:13px;font-weight:700;color:#FF7A00;
          font-family:'SF Mono','Fira Mono',monospace;
          text-decoration:underline;text-underline-offset:2px;
          text-decoration-color:rgba(255,122,0,.3);transition:all .15s;
        }
        .dv-link:hover { color:#ea580c;text-decoration-color:#ea580c; }

        .dv-invoice-btn {
          background: #fff;
          border: 1px solid #FF7A00;
          color: #FF7A00;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .dv-invoice-btn:hover {
          background: #FF7A00;
          color: #fff;
        }

        .dv-comment { font-size:13.5px;color:#334155;line-height:1.65; }

        .dv-items-head { display:flex;align-items:center;gap:8px; }
        .dv-count { background:#f1f5f9;color:#64748b;padding:1px 8px;border-radius:100px;font-size:11px;font-weight:700; }

        .dv-tbl-wrap { overflow-x:auto; }
        .dv-tbl { width:100%;border-collapse:collapse;font-size:13px;min-width:480px; }
        .dv-tbl th {
          padding:0 12px 10px 0;text-align:left;
          font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:#94a3b8;
          border-bottom:1px solid #f1f5f9;white-space:nowrap;
        }
        .dv-tbl th:not(:first-child) { text-align:right; }
        .dv-tbl td { padding:12px 12px 12px 0;border-bottom:1px solid #f8fafc;color:#475569;vertical-align:middle; }
        .dv-tbl td:not(:first-child) { text-align:right; }
        .dv-tbl tbody tr:last-child td { border-bottom:none; }
        .dv-pname { display:block;font-weight:600;color:#0f172a; }
        .dv-pcode { display:block;font-size:11px;color:#94a3b8;font-family:monospace;margin-top:1px; }
        .dv-uom   { font-size:11px;color:#94a3b8; }
        .dv-disc  { color:#ef4444;font-weight:600; }
        .dv-line-tot { font-weight:700;color:#0f172a; }
        .dv-empty { text-align:center!important;padding:24px 0!important;color:#cbd5e1;font-style:italic; }

        .dv-totals { display:flex;flex-direction:column;align-self:flex-end;width:min(100%,240px); }
        .dv-trow { display:flex;justify-content:space-between;padding:8px 0;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9; }
        .dv-trow:last-child { border-bottom:none; }
        .dv-trow-disc  { color:#ef4444; }
        .dv-trow-grand { font-size:15px;font-weight:800;color:#0f172a;padding-top:12px;border-top:2px solid #0f172a;border-bottom:none;margin-top:2px; }

        @media(max-width:560px){
          .dv-row4{grid-template-columns:1fr 1fr;}
          .dv-row3{grid-template-columns:1fr 1fr;}
          .dv-totals{width:100%;}
        }
      `}</style>
    </CafeQRPopup>
  );
}
