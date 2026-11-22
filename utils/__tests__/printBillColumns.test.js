import { buildReceiptText } from '../printUtils';

// Strip ESC/GS control sequences so we can inspect the printed text rows.
const plain = (s) => String(s).replace(/\x1b[\s\S]/g, '').replace(/\x1d!/g, '').replace(/\x00/g, '');

function itemRow(receiptText, name) {
  return plain(receiptText)
    .split(/\r?\n/)
    .find((l) => l.includes(name));
}

describe('bill item rows keep 5-digit amounts intact', () => {
  const order = {
    items: [{ name: 'Dal', price: 12345.5, quantity: 1, lineTotal: 12345.5 }],
  };
  const bill = { grandTotal: 12345.5, totalAmount: 12345.5 };

  test.each([32, 48])('%i-column receipt shows 12345.50 in full', (cols) => {
    const profile = { receipt_cols: cols, currency_decimals: 2 };
    const text = buildReceiptText(order, bill, profile);
    const row = itemRow(text, 'Dal');
    expect(row).toBeDefined();
    expect(row.trimEnd().endsWith('12345.50')).toBe(true);
    expect(row).not.toContain(' 2345.50');
    expect(row.trimEnd().length).toBeLessThanOrEqual(cols);
  });
});
