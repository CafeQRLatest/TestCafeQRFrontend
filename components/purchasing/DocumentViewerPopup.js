import React from 'react';
import CafeQRPopup from '../CafeQRPopup';
import api from '../../utils/api';
import { calculateOrderTotals } from '../../utils/orderCalculations';
import { FaUser, FaPhoneAlt, FaEnvelope, FaMapMarkerAlt, FaStickyNote, FaTruck } from 'react-icons/fa';

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
      displayName: (() => {
        const base = line.productName || line.product_name || line.name || 'Item';
        const variant = line.variantName || line.variant_name || '';
        return variant ? `${base} (${variant})` : base;
      })(),
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
  const taxEnabled = config ? !!config.taxEnabled : true;
  const [localDiscounts, setLocalDiscounts] = React.useState({});
  const [localOrderDiscountType, setLocalOrderDiscountType] = React.useState('amount');
  const [localOrderDiscountValue, setLocalOrderDiscountValue] = React.useState(0);
  const [updating, setUpdating] = React.useState(false);

  const [showHistory, setShowHistory] = React.useState(false);
  const [revisions, setRevisions] = React.useState([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  const [currentOrder, setCurrentOrder] = React.useState(order);
  React.useEffect(() => { setCurrentOrder(order); setRevisions([]); setShowHistory(false); }, [order]);

  const [invoiceData, setInvoiceData] = React.useState(null);
  React.useEffect(() => {
    if (docType === 'invoice' && currentOrder?.id) {
      setInvoiceData(null);
      api.get(`/api/v1/invoices/order/${currentOrder.id}`)
        .then(res => {
          if (res.data?.data) {
            setInvoiceData(res.data.data);
          }
        })
        .catch(err => {
          console.error('Failed to fetch invoice for order:', err);
        });
    } else {
      setInvoiceData(null);
    }
  }, [docType, currentOrder?.id]);

  const activeLines = React.useMemo(() => {
    if (docType === 'invoice' && invoiceData) {
      return invoiceData.lines || [];
    }
    return currentOrder?.lines || [];
  }, [docType, invoiceData, currentOrder?.lines]);

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
  }, [showDiscount, currentOrder]);

  const handleApplyDiscounts = async () => {
    try {
      setUpdating(true);
      const dp = config?.currencyDecimalPlaces ?? 2;
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
        currencyDecimalPlaces: config?.currencyDecimalPlaces,
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
          tax_rate: (line.taxRate !== undefined && line.taxRate !== null && line.taxRate !== '') ? Number(line.taxRate) : ((line.tax_rate !== undefined && line.tax_rate !== null && line.tax_rate !== '') ? Number(line.tax_rate) : null),
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
        const gstEnabled = Boolean(config?.taxEnabled);
        const taxRatePct = Number(processed.tax_rate || 0);
        const isInclusive = gstEnabled && (processed.is_packaged_good || Boolean(config?.pricesIncludeTax));
        const discType = original.discount?.type;
        const matchedRate = (config?.taxRates || []).find(r => parseFloat(r.value) === taxRatePct);
        const taxCode = gstEnabled && taxRatePct > 0 ? (matchedRate?.code || `GST_${taxRatePct}`) : null;
        const taxName = gstEnabled && taxRatePct > 0 ? (matchedRate?.name || `GST ${taxRatePct}%`) : null;
        const qty = Number(processed.quantity || 1);
        const unitPrice = Number(processed.unit_price || original.price || 0);
        return {
          ...original,
          quantity: processed.quantity,
          unitPrice: processed.unit_price,
          taxRate: processed.tax_rate,
          taxAmount: processed.tax_amount,
          discountAmount: processed.discount_amount,
          lineTotal: processed.line_total,
          // GST enrichment fields (V1_110)
          grossLineAmount:        Number((unitPrice * qty).toFixed(dp)),
          unitPriceExTax:         Number((processed.unit_price_ex_tax || processed.unit_price_ex_tax_orig || 0).toFixed(dp + 2)),
          taxableAmount:          Number((processed.taxable_amount || 0).toFixed(dp)),
          taxType:                isInclusive ? 'INCLUSIVE' : (gstEnabled && taxRatePct > 0 ? 'EXCLUSIVE' : 'NONE'),
          taxSnapshotRate:        taxRatePct,
          taxCode,
          taxName,
          manualDiscountAmount:   discType !== 'percent' ? Number((processed.line_discount_face || 0).toFixed(dp)) : null,
          manualDiscountPercent:  discType === 'percent' ? Number((original.discount?.value || 0).toFixed(dp + 2)) : null,
          allocatedOrderDiscount: Number((processed.order_discount_share || 0).toFixed(dp)),
        };
      });

      const updatedOrderPayload = {
        ...currentOrder,
        grandTotal: calculatedData.total_amount,
        totalTaxAmount: calculatedData.total_tax,
        totalAmount: calculatedData.total_inc_tax,
        totalDiscountAmount: calculatedData.discount_amount,
        // GST Discount Engine order-level fields (V1_110)
        grossAmount: Number((calculatedData.gross_face_total || 0).toFixed(dp)),
        orderDiscountType: orderDisc.type === 'percent' ? 'PERCENT' : 'AMOUNT',
        orderDiscountValue: Number(orderDisc.value || 0),
        discountSource: currentOrder.discountSource || 'MANUAL',
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

    if (docType === 'invoice' && invoiceData) {
      const hasGstTotals = invoiceData.taxableAmount !== null && invoiceData.taxableAmount !== undefined && 
                           invoiceData.totalTaxAmount !== null && invoiceData.totalTaxAmount !== undefined;
      
      if (hasGstTotals) {
        return {
          subtotal: parseFloat(invoiceData.taxableAmount || invoiceData.taxable_amount || 0),
          tax: parseFloat(invoiceData.totalTaxAmount || invoiceData.total_tax_amount || 0),
          discount: parseFloat(invoiceData.totalDiscountAmount || invoiceData.total_discount_amount || 0),
          grandTotal: parseFloat(invoiceData.totalAmount || invoiceData.total_amount || 0),
          gross: parseFloat(invoiceData.grossAmount || invoiceData.gross_amount || 0),
          roundOff: parseFloat(invoiceData.roundOffAmount || invoiceData.round_off_amount || 0)
        };
      }
    }

    const activeDoc = (docType === 'invoice' && invoiceData) ? invoiceData : currentOrder;
    let subtotal = 0, taxTotal = 0;
    const discountTotal = parseFloat(activeDoc.totalDiscountAmount || activeDoc.total_discount_amount || 0);
    const roundOff = parseFloat(activeDoc.roundOffAmount || activeDoc.round_off_amount || 0);
    let grandTotal = 0;
    let hasTaxableAmount = false;

    const lines = activeLines;
    if (lines.length > 0) {
      lines.forEach(l => {
        const qty = parseFloat(l.quantity || 0);
        const uPrice = parseFloat(l.unitPrice || l.price || 0);
        const lTaxAmount = parseFloat(l.taxAmount || l.tax_amount || 0);
        const lLineTotal = parseFloat(l.lineTotal || l.line_total || (uPrice * qty));
        // Prefer taxableAmount (authoritative post-discount base) when available.
        // This avoids the face-discount vs base-discount inflation issue for exclusive GST products.
        const lTaxableAmount = parseFloat(l.taxableAmount || l.taxable_amount || 0);
        if (lTaxableAmount > 0) {
          // Exclusive product: taxableAmount is the base after ALL discounts; lineTotal = taxable + tax
          // Inclusive product: taxableAmount is the base, lineTotal = lineTotal (face)
          hasTaxableAmount = true;
          subtotal += lTaxableAmount;
          taxTotal += lTaxAmount;
        } else {
          // Fallback for old records without taxableAmount
          const lDiscAmount = parseFloat(l.discountAmount || l.discount_amount || 0);
          const expectedInclTotal = (uPrice * qty) - lDiscAmount;
          const expectedExclTotal = expectedInclTotal + lTaxAmount;
          const isInclusive = Math.abs(lLineTotal - expectedInclTotal) < Math.abs(lLineTotal - expectedExclTotal);
          if (isInclusive) { subtotal += (lLineTotal - lTaxAmount); taxTotal += lTaxAmount; }
          else { subtotal += (uPrice * qty - lDiscAmount); taxTotal += lTaxAmount; }
        }
      });
      if (hasTaxableAmount) {
        grandTotal = subtotal + taxTotal + roundOff;
        subtotal = grandTotal - taxTotal + discountTotal - roundOff;
      } else {
        grandTotal = subtotal + taxTotal - discountTotal + roundOff;
      }
    } else {
      subtotal = parseFloat(activeDoc.totalAmount || activeDoc.total_amount || 0);
      taxTotal = parseFloat(activeDoc.totalTaxAmount || activeDoc.total_tax_amount || 0);
      grandTotal = parseFloat(activeDoc.grandTotal || activeDoc.grand_total || activeDoc.totalAmount || 0);
      // For orders without lines loaded yet, check if database columns indicate new GST engine
      const hasGstFlag = activeDoc.grossAmount > 0 || activeDoc.gross_amount > 0;
      if (hasGstFlag) {
        hasTaxableAmount = true;
        subtotal = grandTotal - taxTotal + discountTotal - roundOff;
      } else if (Math.abs(grandTotal - subtotal) < 0.05 && taxTotal > 0.05) {
        grandTotal = subtotal + taxTotal - discountTotal + roundOff;
      }
    }

    const dbGrandTotal  = parseFloat(activeDoc.grandTotal  || activeDoc.grand_total  || 0);
    const dbTotalTax    = parseFloat(activeDoc.totalTaxAmount || activeDoc.total_tax_amount || 0);
    const dbSubtotal    = parseFloat(activeDoc.totalAmount  || activeDoc.total_amount  || 0);
    const dbGrossAmount = parseFloat(activeDoc.grossAmount  || activeDoc.gross_amount  || 0);
    const dbRoundOff    = parseFloat(activeDoc.roundOffAmount || activeDoc.round_off_amount || 0);
    const dbGrandTotalIsMissingTax = !hasTaxableAmount && Math.abs(dbGrandTotal - dbSubtotal) < 0.05 && dbTotalTax > 0.05;
    if (dbGrandTotal > 0 && !dbGrandTotalIsMissingTax) {
      const displaySubtotal = hasTaxableAmount 
        ? (dbGrandTotal - dbTotalTax + discountTotal - dbRoundOff)
        : dbSubtotal;
      return { subtotal: displaySubtotal, tax: dbTotalTax, discount: discountTotal, grandTotal: dbGrandTotal, gross: dbGrossAmount, roundOff: dbRoundOff };
    }

    return { subtotal, tax: taxTotal, discount: discountTotal, grandTotal: Math.max(0, grandTotal), gross: dbGrossAmount, roundOff: roundOff };
  }, [currentOrder, docType, invoiceData, activeLines]);

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
  const fmt = n => parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

  const hasRevisions = Number(currentOrder.revisionNumber ?? currentOrder.revision_number ?? 0) > 0
    || Boolean(currentOrder.originalOrderId || currentOrder.original_order_id);

  const openHistory = async () => {
    if (revisions.length > 0) { setShowHistory(true); return; }
    setHistoryLoading(true);
    setShowHistory(true);
    try {
      const res = await api.get(`/api/v1/orders/${currentOrder.id}/revisions`);
      setRevisions(res.data?.data || []);
    } catch (e) {
      console.error('Failed to load order history', e);
    } finally {
      setHistoryLoading(false);
    }
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
            <span className="dv-val">
              {formatTzDate(
                (docType === 'invoice' && invoiceData)
                  ? (invoiceData.invoiceDate || invoiceData.invoice_date)
                  : (currentOrder.orderDate || currentOrder.order_date || currentOrder.createdAt || currentOrder.created_at),
                timezone,
                { format: 'date' }
              )}
            </span>
            <span className="dv-sub">
              {formatTzDate(
                (docType === 'invoice' && invoiceData)
                  ? (invoiceData.invoiceDate || invoiceData.invoice_date)
                  : (currentOrder.orderDate || currentOrder.order_date || currentOrder.createdAt || currentOrder.created_at),
                timezone,
                { format: 'time' }
              )}
            </span>
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

        {/* ── Created/Updated auditing info ── */}
        {(currentOrder.createdBy || currentOrder.updatedBy) && (
          <>
            <div className="dv-rule" />
            <div className="dv-row2">
              {currentOrder.createdBy && (
                <div className="dv-cell">
                  <span className="dv-lbl">Created By</span>
                  <span className="dv-val" style={{ fontSize: '13px' }}>{currentOrder.createdBy}</span>
                </div>
              )}
              {currentOrder.updatedBy && (
                <div className="dv-cell">
                  <span className="dv-lbl">Last Updated By</span>
                  <span className="dv-val" style={{ fontSize: '13px' }}>{currentOrder.updatedBy}</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Order History link (shown when order has been edited/revised) ── */}
        {docType === 'order' && hasRevisions && (
          <>
            <div className="dv-rule" />
            <div className="dv-cell" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <span className="dv-lbl" style={{ marginBottom: 0 }}>Order History</span>
              <button
                className="dv-history-btn"
                onClick={openHistory}
              >
                📋 View {Number(currentOrder.revisionNumber ?? 0)} revision{Number(currentOrder.revisionNumber ?? 0) !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}

        {/* ── comments ── */}
        {currentOrder.description && (() => {
          const details = parseDeliveryDetails(currentOrder.description);
          if (details) {
            return (
              <>
                <div className="dv-rule" />
                <div className="dv-cell">
                  <span className="dv-lbl" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0284c7' }}>
                    <FaTruck /> Delivery Details
                  </span>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '12px',
                    background: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    borderRadius: '8px',
                    padding: '12px',
                    marginTop: '6px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#0c4a6e' }}>
                      <FaUser style={{ color: '#0284c7' }} />
                      <span><strong>Name:</strong> {details.name || 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#0c4a6e' }}>
                      <FaPhoneAlt style={{ color: '#0284c7' }} />
                      <span><strong>Phone:</strong> {details.phone || 'N/A'}</span>
                    </div>
                    {details.email && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#0c4a6e' }}>
                        <FaEnvelope style={{ color: '#0284c7' }} />
                        <span><strong>Email:</strong> {details.email}</span>
                      </div>
                    )}
                    {details.address && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: '#0c4a6e', gridColumn: '1 / -1' }}>
                        <FaMapMarkerAlt style={{ color: '#0284c7', marginTop: '2px' }} />
                        <span><strong>Address:</strong> {details.address}</span>
                      </div>
                    )}
                    {details.note && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        fontSize: '12px',
                        color: '#78350f',
                        background: '#fffbeb',
                        border: '1px solid #fde68a',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        gridColumn: '1 / -1',
                        marginTop: '4px'
                      }}>
                        <FaStickyNote style={{ color: '#d97706', marginTop: '2px' }} />
                        <span><strong>Note:</strong> {details.note}</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          }
          return (
            <>
              <div className="dv-rule" />
              <div className="dv-cell">
                <span className="dv-lbl">Comments</span>
                <span className="dv-comment">{currentOrder.description}</span>
              </div>
            </>
          );
        })()}

        {/* ── Order History Modal ── */}
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
                    const isVoid = String(rev.orderStatus || '').toUpperCase() === 'VOID';
                    const isCurrent = !isVoid;
                    const revNo = rev.revisionNumber ?? idx;
                    const revDate = rev.orderDate || rev.createdAt || rev.created_at;
                    const fmtDate = revDate ? new Date(revDate).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
                    return (
                      <div key={rev.id} className={`dv-history-card ${isVoid ? 'dv-history-void' : 'dv-history-current'}`}>
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
                              {rev.lines.map((l, li) => {
                                const baseName = l.productName || l.name || '—';
                                const variantName = l.variantName || l.variant_name || '';
                                const displayName = variantName ? `${baseName} (${variantName})` : baseName;
                                return (
                                <tr key={l.id || li}>
                                  <td>{displayName}</td>
                                  <td>{parseFloat(l.quantity || 0)}</td>
                                  <td>₹{parseFloat(l.unitPrice || 0).toFixed(2)}</td>
                                  <td>₹{parseFloat(l.lineTotal || 0).toFixed(2)}</td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                        <div className="dv-history-total">
                          Grand Total: <strong>₹{parseFloat(rev.grandTotal ?? rev.grand_total ?? 0).toFixed(2)}</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {docType !== 'payment' && (
          <>
            <div className="dv-rule" />
            <div className="dv-items-head">
              <span className="dv-lbl">{docType === 'invoice' ? 'Invoice Items' : 'Order Items'}</span>
              <span className="dv-count">{activeLines.length}</span>
            </div>
            <div className="dv-tbl-wrap">
              <table className="dv-tbl">
                <thead>
                  <tr>
                    <th>Product</th><th>Qty</th><th>Unit Price</th>{taxEnabled && <th>GST</th>}<th>Discount</th><th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {activeLines.map((l, i) => (
                    <tr key={l.id || i}>
                      <td>
                        <span className="dv-pname">
                          {(() => {
                            const base = l.productName || l.name || '—';
                            const variant = l.variantName || l.variant_name || '';
                            return variant ? `${base} (${variant})` : base;
                          })()}
                        </span>
                        {(l.productCode || l.product_code) && <span className="dv-pcode">{l.productCode || l.product_code}</span>}

                      </td>
                      <td>{parseFloat(l.quantity || 0)}{l.unitOfMeasure && <span className="dv-uom"> {l.unitOfMeasure}</span>}</td>
                      <td>
                        {currencySymbol}{fmt(l.unitPrice || l.price)}
                        {taxEnabled && (l.unitPriceExTax || l.unit_price_ex_tax) && parseFloat(l.taxRate || l.tax_rate || 0) > 0 && (
                          <span className="dv-ex-tax"> (ex: {currencySymbol}{fmt(l.unitPriceExTax || l.unit_price_ex_tax)})</span>
                        )}
                      </td>
                      {taxEnabled && (
                        <td>
                          {parseFloat(l.taxRate || l.tax_rate || 0)}%
                          {(l.taxName || l.tax_name) && <span className="dv-uom"> {l.taxName || l.tax_name}</span>}
                        </td>
                      )}
                      <td>
                        {(() => {
                          const grossLine = parseFloat(l.grossLineAmount || l.gross_line_amount || 0) ||
                            (parseFloat(l.unitPrice || l.price || 0) * parseFloat(l.quantity || 0));
                          const taxableAmt = parseFloat(l.taxableAmount || l.taxable_amount || 0);
                          const taxRate = parseFloat(l.taxRate || l.tax_rate || 0);
                          const isPackaged = l.isPackagedGood || l.is_packaged_good || l.isPackaged || l.is_packaged;
                          const gstEnabled = taxEnabled && taxRate > 0;
                          const isInclusive = gstEnabled && (isPackaged || Boolean(config?.pricesIncludeTax));
                          
                          // Base discount = gross (before disc) minus taxable base (after all discounts)
                          // This is the correct GST-invoice discount: reduction applied to the taxable base
                          let displayDisc = 0;
                          if (taxableAmt > 0 && grossLine > 0) {
                            if (isInclusive) {
                              // For inclusive: gross face = grossLine, taxable base = taxableAmt
                              // displayed as face = discBase * (1 + rate)
                              const discBase = grossLine / (1 + taxRate / 100) - taxableAmt;
                              displayDisc = discBase * (1 + taxRate / 100); // back to face for display
                            } else {
                              // For exclusive: gross base = grossLine, taxable = taxableAmt (both exclusive)
                              displayDisc = grossLine - taxableAmt;
                            }
                          } else {
                            // Fallback: use stored discountAmount
                            displayDisc = parseFloat(l.discountAmount || l.discount_amount || 0);
                          }
                          
                          return displayDisc > 0.005 ? (
                            <span className="dv-disc">
                              −{currencySymbol}{fmt(displayDisc)}
                            </span>
                          ) : '—';
                        })()}
                      </td>
                      <td className="dv-line-tot">
                        {currencySymbol}{fmt(l.lineTotal || l.line_total || (parseFloat(l.price || l.unitPrice || 0) * parseFloat(l.quantity || 0)))}
                      </td>
                    </tr>
                  ))}
                  {activeLines.length === 0 && (
                    <tr><td colSpan={taxEnabled ? 6 : 5} className="dv-empty">No items in this document</td></tr>
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
            {parseFloat(calculated.gross || 0) > 0 && parseFloat(calculated.discount || 0) > 0 && (
              <div className="dv-trow dv-trow-muted"><span>Gross Amount</span><span>{currencySymbol}{fmt(calculated.gross)}</span></div>
            )}
            <div className="dv-trow"><span>Subtotal</span><span>{currencySymbol}{fmt(calculated.subtotal)}</span></div>
            {taxEnabled && (
              <div className="dv-trow"><span>Tax</span><span>{currencySymbol}{fmt(calculated.tax)}</span></div>
            )}
            {parseFloat(calculated.discount || 0) > 0 && (
              <div className="dv-trow dv-trow-disc">
                <span>
                  Discount

                </span>
                <span>−{currencySymbol}{fmt(calculated.discount)}</span>
              </div>
            )}
            {parseFloat(calculated.roundOff || 0) !== 0 && (
              <div className="dv-trow dv-trow-muted">
                <span>Round Off</span>
                <span>{parseFloat(calculated.roundOff) > 0 ? '+' : ''}{currencySymbol}{fmt(calculated.roundOff)}</span>
              </div>
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
                            <small>{currencySymbol}{item.price.toFixed(config?.currencyDecimalPlaces ?? 2)} × {item.qty}</small>
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
        .dv-history-total { font-size:12px;color:#475569;text-align:right;padding-top:6px;border-top:1px solid #f1f5f9; }
        .dv-history-total strong { color:#0f172a;font-size:13px; }
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

        /* GST enrichment badges */
        .dv-tax-badge {
          display:inline-block;margin-top:2px;padding:1px 5px;
          background:#f0fdf4;border:1px solid #86efac;color:#16a34a;
          border-radius:4px;font-size:10px;font-weight:700;font-family:monospace;
        }
        .dv-ex-tax { font-size:10px;color:#94a3b8;display:block;margin-top:1px; }
        .dv-alloc-disc { font-size:10px;color:#f97316;display:block;margin-top:1px; }
        .dv-source-badge {
          display:inline-block;margin-left:6px;padding:1px 6px;
          background:#fef3c7;border:1px solid #fcd34d;color:#92400e;
          border-radius:4px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;vertical-align:middle;
        }
        .dv-trow-muted { color:#94a3b8 !important; font-size:12px !important; }


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
