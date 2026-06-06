import React from 'react';
import CafeQRPopup from '../CafeQRPopup';
import api from '../../utils/api';
import { calculateOrderTotals } from '../../utils/orderCalculations';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toCartItems = (lines) => {
  return (lines || []).map((line, index) => {
    const price = toNumber(line.unitPrice ?? line.unit_price ?? line.price ?? 0);
    const qty = toNumber(line.quantity ?? line.qty ?? 1) || 1;
    const key = line.cartKey || line.id || `${line.productId || 'line'}-${line.variantId || 'base'}-${index}`;

    const discPercent = line.discountPercent ?? line.discount_percent ?? 0;
    const discAmount = line.discountAmount ?? line.discount_amount ?? 0;

    let initialType = 'amount';
    let initialVal = 0;
    if (discPercent > 0) {
      initialType = 'percent';
      initialVal = discPercent;
    } else if (discAmount > 0) {
      initialVal = discAmount;
    } else if (line.discount) {
      initialType = line.discount.type || 'amount';
      initialVal = line.discount.value || 0;
    }

    return {
      ...line,
      cartKey: key,
      displayName: line.productName || line.product_name || line.name || 'Item',
      price,
      qty,
      discount_percent: initialType === 'percent' ? initialVal : 0,
      discount_amount: initialType === 'amount' ? initialVal : 0,
      discount: { type: initialType, value: initialVal },
    };
  });
};

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
  config = null,
  onOrderUpdated = null,
}) {
  const [showDiscount, setShowDiscount] = React.useState(false);
  const [discountTab, setDiscountTab] = React.useState('line'); // 'line' | 'total'
  const [localDiscounts, setLocalDiscounts] = React.useState({});
  const [localOrderDiscountType, setLocalOrderDiscountType] = React.useState('amount');
  const [localOrderDiscountValue, setLocalOrderDiscountValue] = React.useState(0);
  const [updating, setUpdating] = React.useState(false);

  const [currentOrder, setCurrentOrder] = React.useState(order);
  React.useEffect(() => { setCurrentOrder(order); }, [order]);

  // Load defaults when discount panel opens
  React.useEffect(() => {
    if (showDiscount && currentOrder) {
      const initial = {};
      const cartItems = toCartItems(currentOrder.lines);
      cartItems.forEach((item) => {
        const disc = item.discount || { type: 'amount', value: 0 };
        initial[item.cartKey] = {
          type: disc.type === 'percentage' || disc.type === 'percent' ? 'percentage' : 'amount',
          value: disc.value || 0,
        };
      });
      setLocalDiscounts(initial);
      const totalLineDisc = cartItems.reduce((sum, item) => sum + (item.discount_amount || 0), 0);
      const totalDisc = Number(currentOrder.totalDiscountAmount ?? currentOrder.total_discount_amount ?? 0);
      const ordDiscType = currentOrder.orderDiscount?.type || 'amount';
      // Only pre-fill the order-level (bill) discount value — never fall back to
      // totalDiscountAmount, which is line + bill combined and would double the discount.
      const ordDiscVal = currentOrder.orderDiscount?.value || Math.max(0, totalDisc - totalLineDisc);
      setLocalOrderDiscountType(ordDiscType === 'percent' ? 'percentage' : 'amount');
      setLocalOrderDiscountValue(ordDiscVal);
    }
  }, [showDiscount]);

  const handleApplyDiscounts = async () => {
    try {
      setUpdating(true);
      const items = toCartItems(currentOrder.lines || []);
      const updatedItems = items.map((item) => {
        const disc = localDiscounts[item.cartKey] || { type: 'amount', value: 0 };
        return {
          ...item,
          discount_percent: disc.type === 'percentage' ? disc.value : 0,
          discount_amount: disc.type === 'amount' ? disc.value : 0,
          discount: { type: disc.type === 'percentage' ? 'percent' : 'amount', value: disc.value },
        };
      });

      const configProfile = {
        gst_enabled: config?.taxEnabled,
        default_tax_rate: (() => {
          if (!config?.taxEnabled) return 0;
          const rates = config?.taxRates || [];
          const def = rates.find(r => r.id === config?.taxDefaultId);
          return def ? parseFloat(def.value) || 0 : (rates[0] ? parseFloat(rates[0].value) || 0 : 0);
        })(),
        prices_include_tax: config?.pricesIncludeTax,
        round_off_config: { round_off_enabled: config?.roundOffEnabled },
      };

      const orderDisc = {
        type: localOrderDiscountType === 'percentage' ? 'percent' : 'amount',
        value: localOrderDiscountValue,
      };

      const calculatedData = calculateOrderTotals(
        updatedItems.map((line) => ({
          id: line.cartKey,
          productId: line.productId,
          name: line.displayName,
          price: line.price,
          quantity: line.qty,
          tax_rate: line.taxRate || line.tax_rate || 0,
          is_packaged_good: line.isPackagedGood,
          is_packaged: line.isPackagedGood,
          discount_percent: line.discount_percent,
          discount_amount: line.discount_amount,
          discount: line.discount,
        })),
        orderDisc,
        configProfile
      );

      const processedLines = (calculatedData.processed_items || []).map((processed, idx) => {
        const original = updatedItems[idx];
        return {
          ...original,
          quantity: processed.quantity,
          unitPrice: processed.unit_price,
          taxRate: processed.tax_rate,
          taxAmount: processed.tax_amount,
          discountAmount: processed.discount_amount,
          lineTotal: processed.line_total,
        };
      });

      const updatedOrderPayload = {
        ...currentOrder,
        grandTotal: calculatedData.total_amount,
        totalTaxAmount: calculatedData.total_tax,
        totalAmount: calculatedData.total_inc_tax,
        totalDiscountAmount: calculatedData.discount_amount,
        lines: processedLines,
        orderDiscount: orderDisc,
      };

      const response = await api.put(`/api/v1/orders/${currentOrder.id}`, updatedOrderPayload);
      const savedOrder = response.data?.data || updatedOrderPayload;
      setCurrentOrder(savedOrder);
      setShowDiscount(false);
      onOrderUpdated?.(savedOrder);
    } catch (err) {
      console.error('Failed to update discounts:', err);
      alert('Error updating discounts. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const calculated = React.useMemo(() => {
    if (!currentOrder) return { subtotal: 0, tax: 0, discount: 0, grandTotal: 0 };
    let subtotal = 0, taxTotal = 0;
    const discountTotal = parseFloat(currentOrder.totalDiscountAmount || currentOrder.total_discount_amount || 0);
    const roundOff = parseFloat(currentOrder.roundOffAmount || currentOrder.round_off_amount || 0);
    let grandTotal = 0;

    const lines = currentOrder.lines || [];
    if (lines.length > 0) {
      lines.forEach(l => {
        const qty = parseFloat(l.quantity || 0);
        const uPrice = parseFloat(l.unitPrice || l.price || 0);
        const lTaxAmount = parseFloat(l.taxAmount || l.tax_amount || 0);
        const lDiscAmount = parseFloat(l.discountAmount || l.discount_amount || 0);
        const lTotal = parseFloat(l.lineTotal || l.line_total || (uPrice * qty));
        const expectedInclTotal = (uPrice * qty) - lDiscAmount;
        const expectedExclTotal = expectedInclTotal + lTaxAmount;
        const isInclusive = Math.abs(lTotal - expectedInclTotal) < Math.abs(lTotal - expectedExclTotal);
        if (isInclusive) { subtotal += (lTotal - lTaxAmount); taxTotal += lTaxAmount; }
        else { subtotal += (uPrice * qty - lDiscAmount); taxTotal += lTaxAmount; }
      });
      grandTotal = subtotal + taxTotal - discountTotal + roundOff;
    } else {
      subtotal = parseFloat(currentOrder.totalAmount || currentOrder.total_amount || 0);
      taxTotal = parseFloat(currentOrder.totalTaxAmount || currentOrder.total_tax_amount || 0);
      grandTotal = parseFloat(currentOrder.grandTotal || currentOrder.grand_total || currentOrder.totalAmount || 0);
      if (Math.abs(grandTotal - subtotal) < 0.05 && taxTotal > 0.05)
        grandTotal = subtotal + taxTotal - discountTotal + roundOff;
    }

    const dbGrandTotal = parseFloat(currentOrder.grandTotal || currentOrder.grand_total || 0);
    const dbTotalTax = parseFloat(currentOrder.totalTaxAmount || currentOrder.total_tax_amount || 0);
    const dbSubtotal = parseFloat(currentOrder.totalAmount || currentOrder.total_amount || 0);
    const dbGrandTotalIsMissingTax = Math.abs(dbGrandTotal - dbSubtotal) < 0.05 && dbTotalTax > 0.05;
    if (dbGrandTotal > 0 && !dbGrandTotalIsMissingTax)
      return { subtotal: dbSubtotal, tax: dbTotalTax, discount: discountTotal, grandTotal: dbGrandTotal };

    return { subtotal, tax: taxTotal, discount: discountTotal, grandTotal: Math.max(0, grandTotal) };
  }, [currentOrder]);

  const primaryCustomer = React.useMemo(() => {
    if (!currentOrder) return null;
    if (currentOrder.customer) return currentOrder.customer;
    if (Array.isArray(currentOrder.customers) && currentOrder.customers.length > 0) {
      return currentOrder.customers.find(c => c.primary) || currentOrder.customers[0];
    }
    if (currentOrder.customerName || currentOrder.customerPhone) {
      return { name: currentOrder.customerName, phone: currentOrder.customerPhone };
    }
    return null;
  }, [currentOrder]);

  if (!currentOrder) return null;

  const isSale = currentOrder.orderType === 'SALE';
  const vendor = !isSale && vendors ? vendors.find(v => String(v.id) === String(currentOrder.vendorId)) : null;
  const warehouse = !isSale && warehouses ? warehouses.find(w => String(w.id) === String(currentOrder.warehouseId)) : null;
  const cfg = STATUS_CFG[currentOrder.orderStatus] || STATUS_CFG.DRAFT;
  const isPaid = currentOrder.paymentStatus === 'PAID';
  const fmt = n => parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const HEADER = {
    order:   { subtitle: isSale ? 'Sale Order' : 'Purchase Order', title: currentOrder.orderNo || currentOrder.order_no || '—' },
    invoice: { subtitle: 'Invoice', title: currentOrder.invoiceNo || currentOrder.invoice_no || currentOrder.orderNo || currentOrder.order_no || '—' },
    payment: { subtitle: 'Payment', title: currentOrder.paymentNo || currentOrder.orderNo || currentOrder.order_no || '—' },
  };
  const hdr = HEADER[docType] || HEADER.order;

  const handleLinked = (type) => { onClose(); onViewLinked?.(currentOrder, type); };

  const canDiscount = isSale && docType === 'order'
    && currentOrder.orderStatus !== 'COMPLETED'
    && currentOrder.orderStatus !== 'CANCELLED'
    && currentOrder.orderStatus !== 'PAID';

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
          {(!isSale || config?.customersEnabled) && (
            <div className="dv-cell">
              <span className="dv-lbl">{isSale ? 'Customer' : 'Supplier'}</span>
              <span className="dv-val">{isSale ? (primaryCustomer?.name || '—') : (vendor?.name || '—')}</span>
              {!isSale && vendor?.phone && <span className="dv-sub">{vendor.phone}</span>}
              {!isSale && vendor?.email && <span className="dv-sub">{vendor.email}</span>}
              {isSale && primaryCustomer?.phone && <span className="dv-sub">{primaryCustomer.phone}</span>}
            </div>
          )}
          <div className="dv-cell">
            <span className="dv-lbl">{isSale ? 'Table / Type' : 'Warehouse'}</span>
            <span className="dv-val">
              {isSale
                ? (currentOrder.tableNumber || currentOrder.table_number
                    ? `Dine in (Table ${currentOrder.tableNumber || currentOrder.table_number})`
                    : (String(currentOrder.fulfillmentType || currentOrder.fulfillment_type || '').toUpperCase() === 'TAKEAWAY'
                        ? 'Takeaway'
                        : String(currentOrder.fulfillmentType || currentOrder.fulfillment_type || '').toUpperCase() === 'DELIVERY'
                          ? 'Delivery' : 'Dine in'))
                : (warehouse?.name || '—')}
            </span>
          </div>
          <div className="dv-cell">
            <span className="dv-lbl">Date</span>
            <span className="dv-val">{formatTzDate(currentOrder.orderDate || currentOrder.order_date || currentOrder.createdAt || currentOrder.created_at, timezone, { format: 'date' })}</span>
            <span className="dv-sub">{formatTzDate(currentOrder.orderDate || currentOrder.order_date || currentOrder.createdAt || currentOrder.created_at, timezone, { format: 'time' })}</span>
          </div>
          <div className="dv-cell">
            <span className="dv-lbl">{isSale ? 'Terminal' : 'Payment Method'}</span>
            <span className="dv-val">
              {isSale
                ? (currentOrder.terminalCode || currentOrder.terminalName || currentOrder.terminal_code || '-')
                : (currentOrder.paymentMethod || 'Credit')}
            </span>
          </div>
        </div>

        <div className="dv-rule" />

        {/* ── reference · cross-ref · payment ── */}
        <div className="dv-row3">
          <div className="dv-cell">
            <span className="dv-lbl">Reference</span>
            <span className="dv-val dv-mono">{currentOrder.reference || '—'}</span>
          </div>
          <div className="dv-cell">
            {docType === 'order' ? (
              <>
                <span className="dv-lbl">Invoice No</span>
                {currentOrder.invoiceNo ? (
                  <button className="dv-link" onClick={() => handleLinked('invoice')}>{currentOrder.invoiceNo}</button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                    <span className="dv-nil">Not generated</span>
                    {currentOrder.orderStatus !== 'DRAFT' && currentOrder.orderStatus !== 'CANCELLED' && (
                      <button className="dv-invoice-btn" onClick={() => onInvoiceOrder?.(currentOrder)}>Invoke Order</button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <span className="dv-lbl">Order No</span>
                {currentOrder.orderNo
                  ? <button className="dv-link" onClick={() => handleLinked('order')}>{currentOrder.orderNo}</button>
                  : <span className="dv-nil">—</span>}
              </>
            )}
          </div>
          <div className="dv-cell">
            {docType === 'payment' ? (
              <>
                <span className="dv-lbl">Invoice No</span>
                {currentOrder.invoiceNo
                  ? <button className="dv-link" onClick={() => handleLinked('invoice')}>{currentOrder.invoiceNo}</button>
                  : <span className="dv-nil">—</span>}
              </>
            ) : (
              <>
                <span className="dv-lbl">Payment</span>
                {isPaid && currentOrder.paymentNo
                  ? <button className="dv-link" onClick={() => handleLinked('payment')}>{currentOrder.paymentNo}</button>
                  : <span className="dv-muted">Pending</span>}
              </>
            )}
          </div>
        </div>

        {/* ── comments ── */}
        {currentOrder.description && (
          <>
            <div className="dv-rule" />
            <div className="dv-cell">
              <span className="dv-lbl">Comments</span>
              <span className="dv-comment">{currentOrder.description}</span>
            </div>
          </>
        )}

        {docType !== 'payment' && (
          <>
            <div className="dv-rule" />
            <div className="dv-items-head">
              <span className="dv-lbl">{docType === 'invoice' ? 'Invoice Items' : 'Order Items'}</span>
              <span className="dv-count">{(currentOrder.lines || []).length}</span>
            </div>
            <div className="dv-tbl-wrap">
              <table className="dv-tbl">
                <thead>
                  <tr>
                    <th>Product</th><th>Qty</th><th>Unit Price</th><th>Tax</th><th>Discount</th><th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(currentOrder.lines || []).map((l, i) => (
                    <tr key={l.id || i}>
                      <td>
                        <span className="dv-pname">{l.productName || l.name || '—'}</span>
                        {(l.productCode || l.product_code) && <span className="dv-pcode">{l.productCode || l.product_code}</span>}
                      </td>
                      <td>{parseFloat(l.quantity || 0)}{l.unitOfMeasure && <span className="dv-uom"> {l.unitOfMeasure}</span>}</td>
                      <td>{currencySymbol}{fmt(l.unitPrice || l.price)}</td>
                      <td>{parseFloat(l.taxRate || l.tax_rate || 0)}%</td>
                      <td>
                        {parseFloat(l.discountAmount || l.discount_amount || 0) > 0
                          ? <span className="dv-disc">−{currencySymbol}{fmt(l.discountAmount || l.discount_amount)}</span>
                          : '—'}
                      </td>
                      <td className="dv-line-tot">
                        {currencySymbol}{fmt(l.lineTotal || l.line_total || (parseFloat(l.price || l.unitPrice || 0) * parseFloat(l.quantity || 0)))}
                      </td>
                    </tr>
                  ))}
                  {(!currentOrder.lines || currentOrder.lines.length === 0) && (
                    <tr><td colSpan="6" className="dv-empty">No items in this order</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="dv-rule" />

        {/* ── totals + inline discount panel ── */}
        <div className="dv-bottom">

          {/* Totals column */}
          <div className="dv-totals">
            {canDiscount && (
              <button
                type="button"
                className={`dv-disc-btn ${showDiscount ? 'active' : ''}`}
                onClick={() => setShowDiscount(v => !v)}
              >
                {showDiscount ? 'Hide Discount' : 'Add Discount'}
                {!showDiscount && parseFloat(calculated.discount || 0) > 0 && ` (−${currencySymbol}${fmt(calculated.discount)})`}
              </button>
            )}
            <div className="dv-trow"><span>Subtotal</span><span>{currencySymbol}{fmt(calculated.subtotal)}</span></div>
            <div className="dv-trow"><span>Tax</span><span>{currencySymbol}{fmt(calculated.tax)}</span></div>
            {parseFloat(calculated.discount || 0) > 0 && (
              <div className="dv-trow dv-trow-disc"><span>Discount</span><span>−{currencySymbol}{fmt(calculated.discount)}</span></div>
            )}
            <div className="dv-trow dv-trow-grand">
              <span>{docType === 'payment' ? 'Amount Paid' : 'Grand Total'}</span>
              <span>{currencySymbol}{fmt(calculated.grandTotal)}</span>
            </div>
          </div>

          {/* Inline discount panel — slides in beside totals */}
          {showDiscount && (
            <div className="disc-panel">
              {/* Tabs */}
              <div className="disc-tabs">
                <button
                  type="button"
                  className={`disc-tab ${discountTab === 'line' ? 'active' : ''}`}
                  onClick={() => setDiscountTab('line')}
                >Item Discount</button>
                <button
                  type="button"
                  className={`disc-tab ${discountTab === 'total' ? 'active' : ''}`}
                  onClick={() => setDiscountTab('total')}
                >Bill Discount</button>
              </div>

              {/* Content */}
              <div className="disc-content">
                {discountTab === 'line' ? (
                  (!currentOrder.lines || currentOrder.lines.length === 0) ? (
                    <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>No items</div>
                  ) : (
                    toCartItems(currentOrder.lines).map(item => {
                      const key = item.cartKey;
                      const disc = localDiscounts[key] || { type: 'amount', value: 0 };
                      return (
                        <div className="disc-item" key={key}>
                          <div className="disc-item-name">
                            <span>{item.displayName}</span>
                            <small>{currencySymbol}{item.price.toFixed(2)} × {item.qty}</small>
                          </div>
                          <div className="disc-item-ctrl">
                            <div className="disc-inp-wrap">
                              <input
                                type="number" min="0"
                                max={disc.type === 'percentage' ? 100 : undefined}
                                value={disc.value || ''}
                                onChange={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setLocalDiscounts(prev => ({ ...prev, [key]: { ...prev[key], value: val } }));
                                }}
                                className="disc-inp"
                                placeholder="0"
                              />
                            </div>
                            <div className="disc-toggle">
                              <button
                                type="button"
                                className={`disc-tgl ${disc.type === 'amount' ? 'active' : ''}`}
                                onClick={() => setLocalDiscounts(prev => ({ ...prev, [key]: { ...prev[key], type: 'amount' } }))}
                              >₹</button>
                              <button
                                type="button"
                                className={`disc-tgl ${disc.type === 'percentage' ? 'active' : ''}`}
                                onClick={() => setLocalDiscounts(prev => ({ ...prev, [key]: { ...prev[key], type: 'percentage' } }))}
                              >%</button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )
                ) : (
                  <div className="disc-item" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: '12px', color: '#1e293b' }}>Total Discount</span>
                    <div className="disc-item-ctrl">
                      <div className="disc-inp-wrap">
                        <input
                          type="number" min="0"
                          max={localOrderDiscountType === 'percentage' ? 100 : undefined}
                          value={localOrderDiscountValue || ''}
                          onChange={e => setLocalOrderDiscountValue(parseFloat(e.target.value) || 0)}
                          className="disc-inp"
                          placeholder="0"
                        />
                      </div>
                      <div className="disc-toggle">
                        <button
                          type="button"
                          className={`disc-tgl ${localOrderDiscountType === 'amount' ? 'active' : ''}`}
                          onClick={() => setLocalOrderDiscountType('amount')}
                        >₹</button>
                        <button
                          type="button"
                          className={`disc-tgl ${localOrderDiscountType === 'percentage' ? 'active' : ''}`}
                          onClick={() => setLocalOrderDiscountType('percentage')}
                        >%</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="disc-actions">
                <button
                  type="button"
                  className="disc-clear"
                  onClick={() => {
                    setLocalDiscounts({});
                    setLocalOrderDiscountType('amount');
                    setLocalOrderDiscountValue(0);
                  }}
                >Clear</button>
                <button
                  type="button"
                  className="disc-apply"
                  disabled={updating}
                  onClick={handleApplyDiscounts}
                >{updating ? 'Saving…' : 'Apply'}</button>
              </div>
            </div>
          )}
        </div>

      </div>

      <style jsx>{`
        .dv { display:flex; flex-direction:column; gap:16px; }
        .dv-rule { height:1px; background:#f1f5f9; }
        .dv-row4 { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
        .dv-row3 { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
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
        .dv-comment { font-size:13.5px;color:#334155;line-height:1.65; }
        .dv-items-head { display:flex;align-items:center;gap:8px; }
        .dv-count { background:#f1f5f9;color:#64748b;padding:1px 8px;border-radius:100px;font-size:11px;font-weight:700; }
        .dv-tbl-wrap { overflow-x:auto; }
        .dv-tbl { width:100%;border-collapse:collapse;font-size:13px;min-width:480px; }
        .dv-tbl th { padding:0 12px 10px 0;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:#94a3b8;border-bottom:1px solid #f1f5f9;white-space:nowrap; }
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

        /* ── bottom area: totals + discount panel side by side ── */
        .dv-bottom {
          display: flex;
          gap: 16px;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .dv-totals {
          display: flex;
          flex-direction: column;
          min-width: 200px;
          flex: 0 0 auto;
          margin-left: auto;
        }
        .dv-trow { display:flex;justify-content:space-between;padding:8px 0;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9; }
        .dv-trow:last-child { border-bottom:none; }
        .dv-trow-disc  { color:#ef4444; }
        .dv-trow-grand { font-size:15px;font-weight:800;color:#0f172a;padding-top:12px;border-top:2px solid #0f172a;border-bottom:none;margin-top:2px; }

        .dv-disc-btn {
          display:inline-flex;align-items:center;justify-content:center;gap:6px;
          background:#fff7ed;border:1px solid #FF7A00;color:#ea580c;
          padding:6px 12px;border-radius:8px;font-size:11px;font-weight:700;
          cursor:pointer;transition:all 0.2s;margin-bottom:8px;width:100%;
        }
        .dv-disc-btn:hover, .dv-disc-btn.active { background:#FF7A00;color:#fff; }

        /* ── inline discount panel ── */
        .disc-panel {
          flex: 1;
          min-width: 240px;
          max-width: 320px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: slideIn 0.2s ease;
        }
        @keyframes slideIn {
          from { opacity:0; transform:translateX(12px); }
          to   { opacity:1; transform:translateX(0); }
        }

        .disc-tabs {
          display: flex;
          background: #f1f5f9;
          border-bottom: 1px solid #e2e8f0;
        }
        .disc-tab {
          flex: 1;
          padding: 9px 6px;
          border: none;
          background: transparent;
          color: #64748b;
          font-weight: 700;
          font-size: 11px;
          cursor: pointer;
          position: relative;
          transition: all 0.2s;
        }
        .disc-tab.active { color: #f97316; background: white; }
        .disc-tab.active::after {
          content: '';
          position: absolute;
          bottom: 0; left: 20%; right: 20%;
          height: 2px;
          background: #f97316;
          border-radius: 99px;
        }

        .disc-content {
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 220px;
          overflow-y: auto;
        }

        .disc-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          background: white;
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
        }
        .disc-item-name {
          flex: 1;
          min-width: 0;
        }
        .disc-item-name span {
          display: block;
          font-size: 11px;
          font-weight: 700;
          color: #1e293b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .disc-item-name small {
          font-size: 10px;
          color: #94a3b8;
          font-weight: 600;
        }
        .disc-item-ctrl {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-shrink: 0;
        }
        .disc-inp-wrap {
          background: white;
          border: 1.5px solid #cbd5e1;
          border-radius: 7px;
          padding: 2px 4px;
          height: 26px;
          display: flex;
          align-items: center;
          width: 52px;
          transition: border-color 0.2s;
        }
        .disc-inp-wrap:focus-within { border-color: #f97316; }
        .disc-inp {
          border: none;
          outline: none;
          width: 100%;
          font-size: 12px;
          font-weight: 700;
          text-align: right;
          color: #0f172a;
          background: transparent;
        }
        .disc-toggle {
          display: flex;
          background: #f1f5f9;
          border-radius: 6px;
          padding: 2px;
          gap: 1px;
        }
        .disc-tgl {
          border: none;
          background: transparent;
          color: #64748b;
          width: 22px;
          height: 22px;
          border-radius: 4px;
          font-weight: 800;
          font-size: 11px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }
        .disc-tgl.active { background: #f97316; color: white; }

        .disc-actions {
          display: flex;
          gap: 6px;
          padding: 10px;
          border-top: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .disc-clear {
          flex: 1;
          height: 32px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background: white;
          font-weight: 700;
          font-size: 11px;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s;
        }
        .disc-clear:hover { background: #f1f5f9; }
        .disc-apply {
          flex: 1.5;
          height: 32px;
          border-radius: 8px;
          border: none;
          background: linear-gradient(135deg,#f97316,#ea580c);
          color: white;
          font-weight: 700;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .disc-apply:hover { opacity: 0.9; }
        .disc-apply:disabled { opacity: 0.6; cursor: not-allowed; }

        @media(max-width:560px){
          .dv-row4 { grid-template-columns:1fr 1fr; }
          .dv-row3 { grid-template-columns:1fr 1fr; }
          .dv-bottom { flex-direction:column-reverse; }
          .dv-totals { margin-left:0; width:100%; }
          .disc-panel { max-width:100%; min-width:unset; }
        }
      `}</style>
    </CafeQRPopup>
  );
}
