import { useCallback } from 'react';
import { formatTzDate } from '../utils/timezoneUtils';

/**
 * Custom hook providing memory-safe CSV and Excel export utilities for expenses.
 * Accepts an options object so callers don't depend on positional argument order.
 *
 * @param {{ categories: Array, timezone: string }} opts
 */
export function useExpenseExport({ categories = [], timezone } = {}) {
  const exportToCSV = useCallback((data = []) => {
    if (!data.length) return;
    const headers = 'Date,Document No,Category,Description,Payment Mode,Amount';
    const rows = data.map(r => {
      const cat = categories.find(c => String(c.id) === String(r.categoryId));
      const date = formatTzDate(new Date(r.expenseDate), timezone, { format: 'datetime' });
      const desc = (r.description || '').replace(/"/g, '""');
      return `"${date}",${r.referenceNumber || ''},"${cat?.name || r.categoryName || ''}","${desc}",${r.paymentMethod},${r.amount}`;
    });
    const blob = new Blob([[headers, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `expenses_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); // prevent browser memory leak
  }, [categories, timezone]);

  const exportToExcel = useCallback(async (data = []) => {
    if (!data.length) return;
    try {
      const { utils, writeFile } = await import('xlsx');
      const rows = data.map(r => {
        const cat = categories.find(c => String(c.id) === String(r.categoryId));
        return {
          Date:          formatTzDate(r.expenseDate, timezone, { format: 'datetime' }),
          'Document No': r.referenceNumber,
          Category:      cat?.name || r.categoryName,
          Description:   r.description,
          'Payment Mode': r.paymentMethod,
          Amount:        r.amount
        };
      });
      const wb = utils.book_new();
      utils.book_append_sheet(wb, utils.json_to_sheet(rows), 'Expenses');
      writeFile(wb, `expenses_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      console.error('Excel export failed:', e);
    }
  }, [categories, timezone]);

  return { exportToCSV, exportToExcel };
}
