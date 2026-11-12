import { computePurchaseOrderTotals, isPurchaseDocument } from '../purchaseOrderTotals';

// Purchase orders follow the backend recalculation in PurchaseOrderCommandService.recalculateTotals:
// totalAmount = Σ qty × unitPrice (pre-tax, pre-discount), grandTotal = totalAmount − discount + tax.
// Round off must only ever be the residual after net + tax, never the tax itself.

describe('computePurchaseOrderTotals', () => {
  it('₹70 + 8% GST shows no round off and grand total 75.60 (summary row, no lines)', () => {
    const t = computePurchaseOrderTotals({
      totalAmount: 70, totalTaxAmount: 5.6, totalDiscountAmount: 0, grandTotal: 75.6, roundOffAmount: null,
    }, [], 2);
    expect(t.subtotal).toBeCloseTo(70, 2);
    expect(t.tax).toBeCloseTo(5.6, 2);
    expect(t.roundOff).toBe(0);
    expect(t.grandTotal).toBeCloseTo(75.6, 2);
  });

  it('same PO after the full fetch with lines', () => {
    const t = computePurchaseOrderTotals({
      orderType: 'PURCHASE', totalAmount: 70, totalTaxAmount: 5.6, totalDiscountAmount: 0, grandTotal: 75.6,
    }, [{ quantity: 1, unitPrice: 70, taxRate: 8, taxAmount: 5.6, discountAmount: 0, lineTotal: 75.6 }], 2);
    expect(t.subtotal).toBeCloseTo(70, 2);
    expect(t.roundOff).toBe(0);
    expect(t.grandTotal).toBeCloseTo(75.6, 2);
  });

  it('multi-line PO with discount and mixed rates', () => {
    const lines = [
      { quantity: 2, unitPrice: 100, discountAmount: 10, taxAmount: 9.5, lineTotal: 199.5 },
      { quantity: 3, unitPrice: 33.33, discountAmount: 0, taxAmount: 18, lineTotal: 117.99 },
      { quantity: 1, unitPrice: 50, discountAmount: 0, taxAmount: 0, lineTotal: 50 },
    ];
    const t = computePurchaseOrderTotals({
      totalAmount: 349.99, totalDiscountAmount: 10, totalTaxAmount: 27.5, grandTotal: 367.49,
    }, lines, 2);
    expect(t.gross).toBeCloseTo(349.99, 2);
    expect(t.discount).toBeCloseTo(10, 2);
    expect(t.subtotal).toBeCloseTo(339.99, 2);
    expect(t.tax).toBeCloseTo(27.5, 2);
    expect(t.roundOff).toBe(0);
    expect(t.grandTotal).toBeCloseTo(367.49, 2);
  });

  it('reports a real rounding difference when the grand total was rounded', () => {
    const t = computePurchaseOrderTotals({
      totalAmount: 34.94, totalTaxAmount: 1.75, totalDiscountAmount: 0, grandTotal: 37,
    }, [], 2);
    expect(t.roundOff).toBeCloseTo(0.31, 2);
    expect(t.subtotal + t.tax + t.roundOff).toBeCloseTo(t.grandTotal, 2);
  });

  it('falls back to lines when header totals are missing', () => {
    const t = computePurchaseOrderTotals({}, [
      { quantity: 1, unitPrice: 70, taxAmount: 5.6, discountAmount: 0 },
    ], 2);
    expect(t.subtotal).toBeCloseTo(70, 2);
    expect(t.tax).toBeCloseTo(5.6, 2);
    expect(t.grandTotal).toBeCloseTo(75.6, 2);
    expect(t.roundOff).toBe(0);
  });

  it('untaxed PO with zero decimals currency', () => {
    const t = computePurchaseOrderTotals({ totalAmount: 1000, totalTaxAmount: 0, grandTotal: 1000 }, [], 0);
    expect(t.roundOff).toBe(0);
    expect(t.grandTotal).toBe(1000);
  });
});

describe('isPurchaseDocument', () => {
  it('detects purchase orders by type, number or vendor', () => {
    expect(isPurchaseDocument({ orderType: 'PURCHASE' })).toBe(true);
    expect(isPurchaseDocument({ orderNo: 'PO-2026-0000082-KKD' })).toBe(true);
    expect(isPurchaseDocument({ vendorId: 'abc' })).toBe(true);
  });
  it('does not treat sales orders as purchases', () => {
    expect(isPurchaseDocument({ orderType: 'SALE', orderNo: 'SO-1' })).toBe(false);
    expect(isPurchaseDocument({ orderNo: 'SO-1' })).toBe(false);
    expect(isPurchaseDocument(null)).toBe(false);
  });
});
