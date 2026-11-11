// Shared helpers for India GST register exports (CSV + multi-sheet Excel).
// Used by the Sales & Invoices tab; rows come from /api/v1/reports/sales-gst-register.

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
export const num = (v) => (v === null || v === undefined || v === '' ? '' : Number(v));
export const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/** Downloads rows as UTF-8 CSV (with BOM so Excel shows ₹ and non-ASCII names correctly). */
export function downloadCsv(columns, rows, filename) {
  const header = columns.map(([h]) => csvCell(h)).join(',');
  const body = rows.map((r) => columns.map(([, fn]) => csvCell(fn(r))).join(','));
  const blob = new Blob(['﻿' + [header, ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Writes an .xlsx with one sheet per { name, data, widths? } entry (empty sheets are skipped). */
export async function downloadWorkbook(sheets, filename) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  sheets.filter((s) => s.data && s.data.length).forEach(({ name, data, widths }) => {
    const ws = XLSX.utils.json_to_sheet(data);
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  XLSX.writeFile(wb, filename);
}

export const toObjects = (columns, rows) =>
  rows.map((r) => Object.fromEntries(columns.map(([h, fn]) => [h, fn(r)])));

export const columnWidths = (columns) => columns.map(([h]) => Math.max(12, h.length + 2));

/** Groups rows by key and sums the listed numeric fields; `init` builds the first object for a group. */
export function groupSum(rows, keyFn, init, sums) {
  const map = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, { ...init(r), ...Object.fromEntries(Object.keys(sums).map((f) => [f, 0])) });
    const g = map.get(k);
    Object.entries(sums).forEach(([field, fn]) => { g[field] = round2(g[field] + Number(fn(r) || 0)); });
  });
  return [...map.values()];
}
