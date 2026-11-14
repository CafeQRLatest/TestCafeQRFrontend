import { calculateOrderTotals } from './orderCalculations';

describe('orderCalculations.js - Authoritative Order Calculation Engine', () => {

  test('TC-01: Pure exclusive items, no discount, no GST', () => {
    const profile = {
      tax_enabled: false,
      prices_include_tax: false,
      currencyDecimalPlaces: 2
    };
    const items = [
      {
        price: 100.00,
        quantity: 2,
        tax_rate: 5.00,
        is_packaged: false
      }
    ];
    const res = calculateOrderTotals(items, { type: 'amount', value: 0 }, profile);

    expect(res.gross_amount).toBe(200.00);
    expect(res.taxable_amount).toBe(200.00);
    expect(res.total_tax).toBe(0.00);
    expect(res.grand_total).toBe(200.00);
  });

  test('TC-02: Pure exclusive items, GST, no discount', () => {
    const profile = {
      tax_enabled: true,
      default_tax_rate: 18.00,
      prices_include_tax: false,
      currencyDecimalPlaces: 2
    };
    const items = [
      {
        price: 100.00,
        quantity: 2,
        tax_rate: 18.00,
        is_packaged: false
      }
    ];
    const res = calculateOrderTotals(items, { type: 'amount', value: 0 }, profile);

    // gross_amount = customer-visible inclusive-equivalent: 100 * 2 * 1.18 = 236
    expect(res.gross_amount).toBe(236.00);
    expect(res.taxable_amount).toBe(200.00);
    expect(res.total_tax).toBe(36.00);
    expect(res.grand_total).toBe(236.00);
  });

  test('TC-03: Exclusive items, amount order discount', () => {
    const profile = {
      tax_enabled: true,
      default_tax_rate: 18.00,
      prices_include_tax: false,
      currencyDecimalPlaces: 2
    };
    const items = [
      {
        price: 100.00,
        quantity: 2,
        tax_rate: 18.00,
        is_packaged: false
      }
    ];
    const res = calculateOrderTotals(items, { type: 'amount', value: 20 }, profile);

    // Face discount = 20.00.
    // Ex-tax discount share = 20 / 1.18 = 16.95.
    // Taxable base = 200 - 16.95 = 183.05.
    // Tax = 183.05 * 18% = 32.95.
    // Grand total = 183.05 + 32.95 = 216.00.
    // gross_amount = inclusive-equivalent before any discount: 200 * 1.18 = 236
    expect(res.gross_amount).toBe(236.00);
    expect(res.taxable_amount).toBe(183.05);
    expect(res.total_tax).toBe(32.95);
    expect(res.grand_total).toBe(216.00);
    expect(res.order_discount_display_amount).toBe(20.00);
  });

  test('TC-04: Exclusive items, percent order discount', () => {
    const profile = {
      tax_enabled: true,
      default_tax_rate: 18.00,
      prices_include_tax: false,
      currencyDecimalPlaces: 2
    };
    const items = [
      {
        price: 100.00,
        quantity: 2,
        tax_rate: 18.00,
        is_packaged: false
      }
    ];
    const res = calculateOrderTotals(items, { type: 'percent', value: 10 }, profile);

    // gross_amount = inclusive-equivalent before any discount: 200 * 1.18 = 236
    expect(res.gross_amount).toBe(236.00);
    expect(res.taxable_amount).toBe(180.00);
    expect(res.total_tax).toBe(32.40);
    expect(res.grand_total).toBe(212.40);
  });

  test('TC-05: Mixed exclusive + inclusive, amount order discount', () => {
    const profile = {
      tax_enabled: true,
      default_tax_rate: 18.00,
      prices_include_tax: false,
      currencyDecimalPlaces: 2
    };
    const items = [
      {
        price: 100.00,
        quantity: 1,
        tax_rate: 18.00,
        is_packaged: false
      },
      {
        price: 118.00,
        quantity: 1,
        tax_rate: 18.00,
        is_packaged: true // inclusive
      }
    ];
    const res = calculateOrderTotals(items, { type: 'amount', value: 20 }, profile);

    // Symmetric allocation: both lines get 10.00 off and total 108.00. The discounted exclusive
    // line derives tax from its face total so 236 - 20 = 216.00 exactly (no 1-cent drift).
    expect(res.grand_total).toBe(216);
    expect(res.processed_items[0].line_total).toBe(108);
    expect(res.processed_items[0].tax_amount).toBe(16.47);
    expect(res.processed_items[0].allocated_order_discount).toBe(8.47);
    expect(res.processed_items[1].allocated_order_discount).toBe(8.47);
  });

  test('TC-06: Mixed exclusive + inclusive, percent order discount', () => {
    const profile = {
      tax_enabled: true,
      default_tax_rate: 18.00,
      prices_include_tax: false,
      currencyDecimalPlaces: 2
    };
    const items = [
      {
        price: 100.00,
        quantity: 1,
        tax_rate: 18.00,
        is_packaged: false
      },
      {
        price: 118.00,
        quantity: 1,
        tax_rate: 18.00,
        is_packaged: true
      }
    ];
    const res = calculateOrderTotals(items, { type: 'percent', value: 10 }, profile);

    expect(res.processed_items[0].line_total).toBe(106.20);
    expect(res.processed_items[1].line_total).toBe(106.20);
    expect(res.grand_total).toBe(212.40);
  });

  test('TC-07: Amount discount capped at total throws error', () => {
    const profile = {
      tax_enabled: true,
      default_tax_rate: 18.00,
      prices_include_tax: false,
      currencyDecimalPlaces: 2
    };
    const items = [
      {
        price: 100.00,
        quantity: 1,
        tax_rate: 18.00,
        is_packaged: false
      }
    ];
    expect(() => {
      calculateOrderTotals(items, { type: 'amount', value: 200 }, profile);
    }).toThrow();
  });

  test('TC-08: Line discount + order discount combined', () => {
    const profile = {
      tax_enabled: true,
      default_tax_rate: 18.00,
      prices_include_tax: false,
      currencyDecimalPlaces: 2
    };
    const items = [
      {
        price: 100.00,
        quantity: 1,
        tax_rate: 18.00,
        is_packaged: false,
        discount: { type: 'amount', value: 10 }
      }
    ];
    const res = calculateOrderTotals(items, { type: 'amount', value: 9 }, profile);

    expect(res.grand_total).toBe(99.00);
  });

  test('TC-09: Round-off automatic', () => {
    const profile = {
      tax_enabled: true,
      prices_include_tax: false,
      currencyDecimalPlaces: 2,
      round_off_config: {
        round_off_enabled: true,
        round_off_mode: 'automatic',
        round_off_auto_factor: 1
      }
    };
    const items = [
      {
        price: 100.50,
        quantity: 1,
        tax_rate: 0,
        is_packaged: false
      }
    ];
    const res = calculateOrderTotals(items, { type: 'amount', value: 0 }, profile);

    expect(res.total_before_round_off).toBe(100.50);
    expect(res.round_off_amount).toBe(0.50);
    expect(res.grand_total).toBe(101.00);
  });

  test('TC-10: Round-off manual', () => {
    const profile = {
      tax_enabled: true,
      prices_include_tax: false,
      currencyDecimalPlaces: 2,
      round_off_config: {
        round_off_enabled: true,
        round_off_mode: 'manual',
        round_off_manual_value: -0.50
      }
    };
    const items = [
      {
        price: 100.50,
        quantity: 1,
        tax_rate: 0,
        is_packaged: false
      }
    ];
    const res = calculateOrderTotals(items, { type: 'amount', value: 0 }, profile);

    expect(res.total_before_round_off).toBe(100.50);
    expect(res.round_off_amount).toBe(-0.50);
    expect(res.grand_total).toBe(100.00);
  });
});
