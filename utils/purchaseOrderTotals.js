// Totals for a purchase order shown in the shared DocumentViewerPopup.
//
// Purchase orders do not use the sales meaning of totalAmount. The backend
// (PurchaseOrderCommandService.recalculateTotals) stores:
//   totalAmount         = Σ qty × unitPrice              (gross, before discount and tax)
//   totalDiscountAmount = Σ line discount
//   totalTaxAmount      = Σ line tax                    (whatever the tenant's tax regime produced)
//   grandTotal          = totalAmount − discount + tax
// and no round off of its own. So round off is only the residual
//   grandTotal − (net + tax), with net = gross − discount,
// which is 0 for every PO today and never equals the tax.

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const has = (v) => v !== undefined && v !== null && v !== '';

const roundTo = (v, decimals) => {
  const f = Math.pow(10, decimals);
  return Math.round((v + Number.EPSILON) * f) / f;
};

export function isPurchaseDocument(doc) {
  if (!doc) return false;
  const type = String(doc.orderType || doc.order_type || '').toUpperCase();
  if (type === 'PURCHASE') return true;
  if (type === 'SALE') return false;
  const no = String(doc.orderNo || doc.order_no || '').toUpperCase();
  return Boolean(doc.poNumber || doc.vendorId || doc.vendor_id || no.startsWith('PO-'));
}

export function computePurchaseOrderTotals(doc = {}, lines = [], decimals = 2) {
  const d = doc || {};
  const ls = Array.isArray(lines) ? lines : [];

  const lineGross = ls.reduce((s, l) => s + num(l.quantity) * num(l.unitPrice ?? l.price), 0);
  const lineDisc = ls.reduce((s, l) => s + num(l.discountAmount ?? l.discount_amount), 0);
  const lineTax = ls.reduce((s, l) => s + num(l.taxAmount ?? l.tax_amount), 0);

  const headerGross = d.totalAmount ?? d.total_amount;
  const headerDisc = d.totalDiscountAmount ?? d.total_discount_amount;
  const headerTax = d.totalTaxAmount ?? d.total_tax_amount ?? d.taxAmount ?? d.tax_amount;

  const gross = has(headerGross) && (num(headerGross) > 0 || ls.length === 0) ? num(headerGross) : lineGross;
  const discount = has(headerDisc) ? num(headerDisc) : lineDisc;
  const tax = has(headerTax) ? num(headerTax) : lineTax;

  const subtotal = roundTo(gross - discount, decimals);
  const expected = roundTo(subtotal + tax, decimals);
  const storedGrand = num(d.grandTotal ?? d.grand_total);
  const grandTotal = storedGrand > 0 ? storedGrand : expected;

  let roundOff = roundTo(grandTotal - expected, decimals);
  if (Math.abs(roundOff) < 0.5 / Math.pow(10, decimals)) roundOff = 0;

  return {
    subtotal,
    tax: roundTo(tax, decimals),
    discount: roundTo(discount, decimals),
    // Only show a separate Gross row when a discount sits between gross and subtotal.
    gross: discount > 0 ? roundTo(gross, decimals) : 0,
    grandTotal: Math.max(0, grandTotal),
    roundOff,
  };
}
