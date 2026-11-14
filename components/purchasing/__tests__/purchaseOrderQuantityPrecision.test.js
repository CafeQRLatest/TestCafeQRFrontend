import { formatQty, uomPrecisionOf } from '../../CounterSale/domain/quantity';

describe('Purchase Order Quantity Precision', () => {
  const products = [
    { id: 'prod-litre', name: 'Milk', uomName: 'Litre', uomPrecision: 3 },
    { id: 'prod-kg', name: 'Flour', uomName: 'Kg', uomPrecision: 2 },
    { id: 'prod-pc', name: 'Cup', uomName: 'Pcs', uomPrecision: 0 },
  ];

  const resolvePrecision = (line, productMaster = products) => {
    return uomPrecisionOf(line) || uomPrecisionOf(productMaster.find(p => String(p.id) === String(line?.productId || line?.id))) || 0;
  };

  test('formats quantity with configured 3 decimal precision (Litre)', () => {
    const line = { productId: 'prod-litre', quantity: 2.5, uomPrecision: 3 };
    const prec = resolvePrecision(line);
    expect(prec).toBe(3);
    expect(formatQty(line.quantity, prec)).toBe('2.500');
  });

  test('falls back to Product Master when line uomPrecision is missing or 0', () => {
    const lineWithoutPrec = { productId: 'prod-litre', quantity: 1 };
    const prec1 = resolvePrecision(lineWithoutPrec);
    expect(prec1).toBe(3);
    expect(formatQty(lineWithoutPrec.quantity, prec1)).toBe('1.000');

    const lineWithZeroPrec = { productId: 'prod-litre', quantity: 1, uomPrecision: 0 };
    const prec2 = resolvePrecision(lineWithZeroPrec);
    expect(prec2).toBe(3);
    expect(formatQty(lineWithZeroPrec.quantity, prec2)).toBe('1.000');
  });

  test('formats whole numbers without decimals for precision 0 products', () => {
    const line = { productId: 'prod-pc', quantity: 5, uomPrecision: 0 };
    const prec = resolvePrecision(line);
    expect(prec).toBe(0);
    expect(formatQty(line.quantity, prec)).toBe('5');
  });

  test('formats 2 decimal places for kg products', () => {
    const line = { productId: 'prod-kg', quantity: 1.2, uomPrecision: 2 };
    const prec = resolvePrecision(line);
    expect(prec).toBe(2);
    expect(formatQty(line.quantity, prec)).toBe('1.20');
  });
});
