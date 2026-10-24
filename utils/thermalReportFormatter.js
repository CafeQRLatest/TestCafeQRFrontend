// utils/thermalReportFormatter.js
import { formatTzDate } from './timezoneUtils';
import { formatQty, uomPrecisionOf } from '../components/CounterSale/domain/quantity';

// Helper to pad strings
function center(str, width) {
  if (str.length > width) return str.substring(0, width);
  const pad = Math.floor((width - str.length) / 2);
  return ' '.repeat(pad) + str;
}

function right(str, width) {
  if (str.length > width) return str.substring(0, width);
  return str.padStart(width);
}

function left(str, width) {
  if (str.length > width) return str.substring(0, width);
  return str.padEnd(width);
}

// Helper for two-column rows (Label on left, value on right)
function rowTwoCols(label, val, width) {
  if (label.length + val.length + 1 > width) {
    // Label is too long, truncate it
    label = label.substring(0, width - val.length - 1);
  }
  return label + ' '.repeat(width - label.length - val.length) + val;
}

// Helper to wrap text without truncating long names
function wrapText(str, width) {
  if (!str) return [''];
  const text = String(str).trim();
  if (text.length <= width) return [text];

  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const w of words) {
    if (!current) {
      if (w.length <= width) {
        current = w;
      } else {
        let remaining = w;
        while (remaining.length > width) {
          lines.push(remaining.substring(0, width));
          remaining = remaining.substring(width);
        }
        current = remaining;
      }
    } else {
      if ((current + ' ' + w).length <= width) {
        current += ' ' + w;
      } else {
        lines.push(current);
        if (w.length <= width) {
          current = w;
        } else {
          let remaining = w;
          while (remaining.length > width) {
            lines.push(remaining.substring(0, width));
            remaining = remaining.substring(width);
          }
          current = remaining;
        }
      }
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

export function buildThermalReportText(tabKey, data, config, timezone, dateRange, options = {}) {
  const W = parseInt(config?.print_cols || '32', 10);
  const dashes = '-'.repeat(W);
  const lines = [];
  const sym = config?.currencySymbol || '';

  const formatAmount = (amt) => {
    return Number(amt || 0).toLocaleString('en-IN', { minimumFractionDigits: config?.currencyDecimalPlaces ?? 2, maximumFractionDigits: config?.currencyDecimalPlaces ?? 2 });
  };

  // Header
  lines.push(center('REPORTS & BILLING', W));
  
  if (dateRange) {
    const sd = formatTzDate(dateRange.start, timezone, { format: 'short' });
    const ed = formatTzDate(dateRange.end, timezone, { format: 'short' });
    lines.push(center(`${sd} to ${ed}`, W));
  }
  lines.push(dashes);

  if (tabKey === 'summary') {
    lines.push(center('SALES SUMMARY', W));
    lines.push(dashes);
    if (!data) {
      lines.push('No data');
    } else {
      const billedTotal = Number(data.grandTotal || 0);
      const discounts = Number(data.totalDiscount || 0);
      const tax = Number(data.totalTax || 0);
      const roundOff = Number(data.totalRoundOff || 0);
      const netSales = billedTotal - tax - roundOff;
      const grossSales = netSales + discounts;

      lines.push(rowTwoCols('Billed Total:', `${sym} ${formatAmount(billedTotal)}`, W));
      if (config?.discountEnabled !== false) {
        lines.push(rowTwoCols('Gross Sales:', `${sym} ${formatAmount(grossSales)}`, W));
      }
      lines.push(rowTwoCols('Net Sales:', `${sym} ${formatAmount(netSales)}`, W));
      lines.push(rowTwoCols('Total Orders:', String(data.totalOrders), W));
      lines.push(rowTwoCols('Avg Order Value:', `${sym} ${formatAmount(data.avgOrderValue)}`, W));
      lines.push(rowTwoCols('Items Sold:', String(data.itemsSold), W));
      if (config?.taxEnabled !== false) {
        lines.push(rowTwoCols('Tax:', `${sym} ${formatAmount(tax)}`, W));
      }
      if (config?.discountEnabled !== false) {
        lines.push(rowTwoCols('Discounts:', `${sym} ${formatAmount(discounts)}`, W));
      }
      if (config?.roundOffEnabled !== false) {
        lines.push(rowTwoCols('Round Off:', `${sym} ${formatAmount(roundOff)}`, W));
      }
    }
  }

  else if (tabKey === 'items') {
    lines.push(center('ITEM SALES REPORT', W));
    if (options?.category && options.category !== 'ALL') {
      lines.push(center(`CATEGORY: ${String(options.category).toUpperCase()}`, W));
    } else {
      lines.push(center('CATEGORY: ALL', W));
    }
    if (options?.sortLabel) {
      lines.push(center(`SORT: ${String(options.sortLabel).toUpperCase()}`, W));
    }
    lines.push(dashes);
    if (!data || data.length === 0) {
      lines.push('No item data');
    } else {
      // Columns: Item (grow), Qty(5), Rev(min 9, max 10)
      const qtyW = 5;
      const revW = Math.min(10, Math.max(9, Math.floor(W * 0.32)));
      const itemW = Math.max(8, W - qtyW - revW - 2); // -2 for spaces
      
      lines.push(left('ITEM', itemW) + ' ' + right('QTY', qtyW) + ' ' + right('REV', revW));
      lines.push(dashes);
      
      let calcQty = 0;
      let calcRev = 0;

      data.forEach(item => {
        const qVal = Number(item.quantitySold || 0);
        const rVal = Number(item.revenue || 0);
        calcQty += qVal;
        calcRev += rVal;

        const qFormatted = formatQty(qVal, uomPrecisionOf(item));
        const q = right(qFormatted, qtyW);
        const r = right(formatAmount(rVal), revW);

        const nameLines = wrapText(item.productName || 'Unknown Item', itemW);
        // First line with item name + QTY + REV
        lines.push(left(nameLines[0] || '', itemW) + ' ' + q + ' ' + r);
        // Subsequent lines for wrapped name without truncation
        for (let i = 1; i < nameLines.length; i++) {
          lines.push(left(nameLines[i], itemW));
        }
      });

      lines.push(dashes);
      const totalQty = options?.totalQty != null ? options.totalQty : calcQty;
      const totalQtyPrecision = options?.totalQtyPrecision ?? data.reduce((m, i) => Math.max(m, uomPrecisionOf(i)), 0);
      const totalRev = options?.totalAmount != null ? options.totalAmount : calcRev;
      const totalLabel = (options?.category && options.category !== 'ALL')
        ? `${String(options.category).toUpperCase()} TOTAL:`
        : 'TOTAL AMOUNT:';

      lines.push(rowTwoCols('ITEMS COUNT:', String(data.length), W));
      lines.push(rowTwoCols('TOTAL QTY:', formatQty(totalQty, totalQtyPrecision), W));
      lines.push(rowTwoCols(totalLabel, `${sym} ${formatAmount(totalRev)}`, W));
    }
  }

  else if (tabKey === 'payments') {
    lines.push(center('PAYMENT METHODS', W));
    lines.push(dashes);
    if (!data || data.length === 0) {
      lines.push('No payment data');
    } else {
      const methodW = Math.max(10, W - 18);
      lines.push(left('METHOD', methodW) + ' ' + right('TXNS', 6) + ' ' + right('AMOUNT', 10));
      lines.push(dashes);
      data.forEach(p => {
        const m = left(p.paymentMethod, methodW);
        const c = right(String(p.orderCount), 6);
        const a = right(formatAmount(p.totalAmount), 10);
        lines.push(m + ' ' + c + ' ' + a);
      });
    }
  }

  else if (tabKey === 'tax') {
    lines.push(center('TAX REPORT', W));
    lines.push(dashes);
    if (!data || data.length === 0) {
      lines.push('No tax data');
    } else {
      data.forEach(t => {
        lines.push(`Tax Slab: ${t.taxRate}%`);
        lines.push(rowTwoCols('  Taxable:', `${sym} ${formatAmount(t.taxableAmount)}`, W));
        lines.push(rowTwoCols('  CGST:', `${sym} ${formatAmount(t.cgst)}`, W));
        lines.push(rowTwoCols('  SGST:', `${sym} ${formatAmount(t.sgst)}`, W));
        lines.push(rowTwoCols('  Total Tax:', `${sym} ${formatAmount(t.totalTax)}`, W));
        lines.push(dashes);
      });
    }
  }
  
  else if (tabKey === 'hourly') {
    lines.push(center('HOURLY TRENDS', W));
    lines.push(dashes);
    if (!data || data.length === 0) {
      lines.push('No hourly data');
    } else {
      const timeW = 8;
      const countW = 6;
      const amtW = Math.max(10, W - timeW - countW - 2);
      
      lines.push(left('TIME', timeW) + ' ' + right('TXNS', countW) + ' ' + right('AMOUNT', amtW));
      lines.push(dashes);
      data.forEach(h => {
        // h.hour is like "14:00"
        let tStr = String(h.hour);
        const t = left(tStr, timeW);
        const c = right(String(h.orderCount), countW);
        const a = right(formatAmount(h.totalAmount), amtW);
        lines.push(t + ' ' + c + ' ' + a);
      });
    }
  }
  
  else if (tabKey === 'pnl') {
    lines.push(center('PROFIT & LOSS', W));
    lines.push(dashes);
    if (!data) {
      lines.push('No P&L data');
    } else {
      lines.push(center('--- REVENUE ---', W));
      lines.push(rowTwoCols('Gross Sales:', `${sym} ${formatAmount(data.revenue?.grossSales)}`, W));
      lines.push(rowTwoCols('Discounts:', `${sym} ${formatAmount(data.revenue?.discounts)}`, W));
      lines.push(rowTwoCols('Net Sales:', `${sym} ${formatAmount(data.revenue?.netSales)}`, W));
      lines.push('');
      lines.push(center('--- COGS ---', W));
      lines.push(rowTwoCols('Raw Material Cost:', `${sym} ${formatAmount(data.cogs?.materialCost)}`, W));
      lines.push(rowTwoCols('Gross Profit:', `${sym} ${formatAmount(data.cogs?.grossProfit)}`, W));
      lines.push('');
      lines.push(center('--- EXPENSES ---', W));
      lines.push(rowTwoCols('Operating Exp:', `${sym} ${formatAmount(data.expenses?.operatingExpenses)}`, W));
      lines.push(rowTwoCols('Payroll/HR:', `${sym} ${formatAmount(data.expenses?.payroll)}`, W));
      lines.push(rowTwoCols('Total Expenses:', `${sym} ${formatAmount(data.expenses?.totalExpenses)}`, W));
      lines.push(dashes);
      lines.push(rowTwoCols('NET PROFIT:', `${sym} ${formatAmount(data.netProfit)}`, W));
      lines.push(rowTwoCols('Margin:', `${Number(data.netProfitMargin || 0).toFixed(1)}%`, W));
    }
  }
  
  else if (tabKey === 'credit') {
    lines.push(center('CREDIT SALES', W));
    lines.push(dashes);
    if (!data) {
      lines.push('No credit data');
    } else {
      lines.push(rowTwoCols('New Credit Issued:', `${sym} ${formatAmount(data.creditSalesTotal)}`, W));
      lines.push(rowTwoCols('Payments Received:', `${sym} ${formatAmount(data.creditSettlementsTotal)}`, W));
      lines.push(rowTwoCols('Net Change:', `${sym} ${formatAmount(data.netCreditChange)}`, W));
    }
  }

  else {
    lines.push('Report not printable');
  }

  lines.push('');
  lines.push(center('*** END OF REPORT ***', W));
  lines.push('');
  lines.push('');
  
  return lines.join('\n');
}
