// utils/printSalesReport.js
// Adapted from production - removed Capacitor dependency for web-only use
import { formatTzDate } from './timezoneUtils';

function center(str, width) {
  if (str.length > width) str = str.substring(0, width)
  const padding = Math.max(0, Math.floor((width - str.length) / 2))
  return ' '.repeat(padding) + str
}

function leftAlign(str, width) {
  if (str.length > width) return str.substring(0, width)
  return str.padEnd(width)
}

function rightAlign(str, width) {
  if (str.length > width) return str.substring(0, width)
  return str.padStart(width)
}

export async function printSalesReport(data, timezone) {
  const {
    range,
    summaryStats,
    salesData,
    paymentBreakdown,
    orderTypeBreakdown,
    taxBreakdown,
    hourlyBreakdown,
    categoryBreakdown,
    restaurantProfile
  } = data

  const W = 48
  const dashes = () => '='.repeat(W)
  const lines = []

  const restaurantName = (restaurantProfile?.restaurant_name || 'RESTAURANT').toUpperCase()
  lines.push(dashes())
  lines.push(center('SALES REPORT', W))
  lines.push(dashes())
  lines.push(center(restaurantName, W))
  lines.push('')
  lines.push(`Period: ${formatTzDate(range.start, timezone, { format: 'date' })} to`)
  lines.push(`        ${formatTzDate(range.end, timezone, { format: 'date' })}`)
  lines.push('')
  lines.push(dashes())

  lines.push('SUMMARY')
  lines.push(dashes())
  lines.push(`Total Orders: ${summaryStats.totalOrders}`)
  lines.push(`Total Revenue: ₹${summaryStats.totalRevenue.toFixed(2)}`)
  lines.push(`Avg Order: ₹${summaryStats.avgOrderValue.toFixed(2)}`)
  lines.push(`Items Sold: ${summaryStats.totalItems}`)
  lines.push(`Total Tax: ₹${summaryStats.totalTax.toFixed(2)}`)
  lines.push('')

  lines.push(dashes())
  lines.push('TAX BREAKDOWN')
  lines.push(dashes())
  if (taxBreakdown) {
    taxBreakdown.forEach(t => {
      lines.push(`${leftAlign(t.tax_type, 20)} ₹${t.amount.toFixed(2)}`)
    })
  }
  lines.push('')

  lines.push(dashes())
  lines.push('PAYMENT METHODS')
  lines.push(dashes())
  if (paymentBreakdown) {
    paymentBreakdown.forEach(p => {
      lines.push(`${leftAlign(p.payment_method, 20)} ${p.order_count} orders`)
      lines.push(`${' '.repeat(20)} ₹${p.total_amount.toFixed(2)} (${p.percentage}%)`)
    })
  }
  lines.push('')

  lines.push(dashes())
  lines.push('ORDER TYPES')
  lines.push(dashes())
  if (orderTypeBreakdown) {
    orderTypeBreakdown.forEach(o => {
      lines.push(`${leftAlign(o.order_type, 20)} ${o.order_count} orders`)
      lines.push(`${' '.repeat(20)} ₹${o.total_amount.toFixed(2)} (${o.percentage}%)`)
    })
  }
  lines.push('')

  lines.push(dashes())
  lines.push('TOP ITEMS')
  lines.push(dashes())
  if (salesData) {
    salesData.slice(0, 20).forEach((item, idx) => {
      lines.push(`${idx + 1}. ${leftAlign(item.item_name, 30)}`)
      lines.push(`   Qty: ${item.quantity_sold}  Rev: ₹${item.revenue.toFixed(2)}`)
    })
  }
  lines.push('')

  lines.push(dashes())
  lines.push('CATEGORIES')
  lines.push(dashes())
  if (categoryBreakdown) {
    categoryBreakdown.forEach(c => {
      lines.push(`${leftAlign(c.category, 25)} ${c.percentage}%`)
      lines.push(`${' '.repeat(25)} ₹${c.total_amount.toFixed(2)}`)
    })
  }
  lines.push('')

  if (hourlyBreakdown && hourlyBreakdown.length > 0) {
    lines.push(dashes())
    lines.push('HOURLY BREAKDOWN')
    lines.push(dashes())
    hourlyBreakdown.forEach(h => {
      lines.push(`${h.hour}  ${h.order_count} orders  ₹${h.total_amount.toFixed(2)}`)
    })
    lines.push('')
  }

  lines.push(dashes())
  lines.push(center('END OF REPORT', W))
  lines.push(dashes())
  lines.push('')

  const text = lines.join('\n');

  // Web Share API
  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ text })) {
    try {
      await navigator.share({ title: `Sales-Report-${Date.now()}`, text });
      return { success: true, method: 'web-share' };
    } catch (err) {
      console.log('Share cancelled or failed', err);
    }
  }

  // Fallback: download as .txt
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Sales-Report-${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { success: true, method: 'download' };
}
