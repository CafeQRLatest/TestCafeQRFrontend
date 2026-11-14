import {
  buildTaxBreakdown,
  validateTaxRateComponents,
  hasValidComponents,
  componentColumns,
  normalizeTaxRates,
  splitTaxReportRows,
} from './taxSplit';

const RATES = [
  { id: 't5', name: 'GST 5%', value: 5, components: [{ name: 'CGST', value: 2.5 }, { name: 'SGST', value: 2.5 }] },
  { id: 't18', name: 'GST 18%', value: 18, components: [{ name: 'CGST', value: 9 }, { name: 'SGST', value: 9 }] },
  { id: 't12', name: 'GST 12%', value: 12 },
];

describe('taxSplit', () => {
  test('split off → one line per rate with the global label', () => {
    const res = buildTaxBreakdown({
      lines: [{ taxRate: 5, taxAmount: 10, taxableAmount: 200 }],
      taxRates: RATES, splitEnabled: false, taxLabel: 'GST',
    });
    expect(res.isSplit).toBe(false);
    expect(res.summaryLines).toEqual([{ name: 'GST', rate: 5, amount: 10, label: 'GST 5%' }]);
  });

  test('split on → components named from settings, amounts add up exactly', () => {
    const res = buildTaxBreakdown({
      lines: [
        { taxRate: 5, taxAmount: 10.01, taxableAmount: 200.2 },
        { tax_rate: 18, tax_amount: 36, taxable_amount: 200 },
      ],
      taxRates: RATES, splitEnabled: true, taxLabel: 'GST',
    });
    expect(res.isSplit).toBe(true);
    expect(res.groups[0].components).toEqual([
      { name: 'CGST', rate: 2.5, amount: 5.01 },
      { name: 'SGST', rate: 2.5, amount: 5 },
    ]);
    expect(res.summaryLines.map(s => s.label)).toEqual(['CGST 2.5%', 'SGST 2.5%', 'CGST 9%', 'SGST 9%']);
    const sum = res.summaryLines.reduce((s, l) => s + l.amount, 0);
    expect(sum).toBeCloseTo(46.01, 2);
  });

  test('rate without components stays a single line even when split is on', () => {
    const res = buildTaxBreakdown({
      lines: [{ taxRate: 12, taxAmount: 12, taxableAmount: 100 }],
      taxRates: RATES, splitEnabled: true, taxLabel: 'VAT',
    });
    expect(res.isSplit).toBe(false);
    expect(res.summaryLines[0].label).toBe('VAT 12%');
  });

  test('custom component names (non-GST) are used as-is', () => {
    const res = buildTaxBreakdown({
      lines: [{ taxRate: 7, taxAmount: 7, taxableAmount: 100 }],
      taxRates: [{ id: 'x', value: 7, components: [{ name: 'VAT', value: 5 }, { name: 'Tourism Levy', value: 2 }] }],
      splitEnabled: true, taxLabel: 'Tax',
    });
    expect(res.summaryLines.map(s => [s.label, s.amount])).toEqual([['VAT 5%', 5], ['Tourism Levy 2%', 2]]);
  });

  test('falls back to bill total when lines carry no tax', () => {
    const res = buildTaxBreakdown({
      lines: [{ taxRate: 18 }], totalTax: 18, taxRates: RATES, splitEnabled: true, taxLabel: 'GST',
    });
    expect(res.summaryLines.map(s => s.amount)).toEqual([9, 9]);
  });

  test('invalid components (do not add up) are ignored', () => {
    const bad = [{ id: 'b', value: 18, components: [{ name: 'A', value: 9 }, { name: 'B', value: 8 }] }];
    expect(hasValidComponents(normalizeTaxRates(bad)[0])).toBe(false);
    expect(validateTaxRateComponents(bad)).toHaveLength(1);
    const res = buildTaxBreakdown({ lines: [{ taxRate: 18, taxAmount: 18 }], taxRates: bad, splitEnabled: true, taxLabel: 'GST' });
    expect(res.summaryLines[0].label).toBe('GST 18%');
  });

  test('respects 3 decimal currencies', () => {
    const res = buildTaxBreakdown({
      lines: [{ taxRate: 5, taxAmount: 0.125 }], taxRates: RATES, splitEnabled: true, taxLabel: 'GST', decimals: 3,
    });
    expect(res.groups[0].components.map(c => c.amount)).toEqual([0.063, 0.062]);
  });

  test('componentColumns lists distinct names in order', () => {
    const res = buildTaxBreakdown({
      lines: [{ taxRate: 5, taxAmount: 5 }, { taxRate: 12, taxAmount: 12 }],
      taxRates: RATES, splitEnabled: true, taxLabel: 'GST',
    });
    expect(componentColumns(res.groups)).toEqual(['CGST', 'SGST']);
  });
});

describe('splitTaxReportRows', () => {
  test('adds configured components to rate-wise report rows', () => {
    const rows = splitTaxReportRows(
      [{ taxRate: 18, taxableAmount: 1000, totalTax: 180 }, { taxRate: 12, taxableAmount: 100, totalTax: 12 }],
      { taxRates: RATES, taxSplitEnabled: true }
    );
    expect(rows[0].components).toEqual([{ name: 'CGST', rate: 9, amount: 90 }, { name: 'SGST', rate: 9, amount: 90 }]);
    expect(rows[1].components).toEqual([]);
  });

  test('no components when split is off (snake_case config)', () => {
    const rows = splitTaxReportRows([{ taxRate: 18, taxableAmount: 1000, totalTax: 180 }], { tax_rates: RATES, tax_split_enabled: false });
    expect(rows[0].components).toEqual([]);
  });
});
