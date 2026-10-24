import { uomPrecisionOf, roundQty, parseQty, formatQty, qtyInputStep } from '../quantity';

describe('quantity domain tests', () => {
  test('uomPrecisionOf reads camelCase, snake_case and nested uom, defaulting to 0', () => {
    expect(uomPrecisionOf({ uomPrecision: 3 })).toBe(3);
    expect(uomPrecisionOf({ uom_precision: 2 })).toBe(2);
    expect(uomPrecisionOf({ uom: { uomPrecision: 1 } })).toBe(1);
    expect(uomPrecisionOf({})).toBe(0);
    expect(uomPrecisionOf({ uomPrecision: -1 })).toBe(0);
    expect(uomPrecisionOf({ uomPrecision: 4 })).toBe(4);
    expect(uomPrecisionOf({ uomPrecision: 9 })).toBe(4);
  });

  test('roundQty keeps the UOM precision', () => {
    expect(roundQty(1.23456, 3)).toBe(1.235);
    expect(roundQty(2.7, 0)).toBe(3);
    expect(roundQty('abc', 2)).toBe(0);
  });

  test('parseQty accepts decimal comma and rejects negatives or blanks', () => {
    expect(parseQty('0,5', 3)).toBe(0.5);
    expect(parseQty('0.125', 3)).toBe(0.125);
    expect(parseQty('-2', 3)).toBe(0);
    expect(parseQty('', 3)).toBe(0);
    expect(parseQty('1.9', 0)).toBe(2);
  });

  test('formatQty shows the value with exactly the UOM precision', () => {
    expect(formatQty(2, 3)).toBe('2.000');
    expect(formatQty(0.25, 2)).toBe('0.25');
    expect(formatQty(3, 0)).toBe('3');
    expect(formatQty(1.5, 0)).toBe('1.5');
    expect(formatQty(8.679, 5)).toBe('8.67900');
    expect(formatQty(2.5549999999999997, 4)).toBe('2.5550');
    expect(formatQty(2.5549999999999997, 0)).toBe('2.555');
  });

  test('qtyInputStep follows precision', () => {
    expect(qtyInputStep(0)).toBe(1);
    expect(qtyInputStep(3)).toBeCloseTo(0.001);
  });
});
