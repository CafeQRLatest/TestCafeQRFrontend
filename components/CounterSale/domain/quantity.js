// Quantity helpers driven by the product's UOM precision (decimal places).
// Precision 0 keeps the legacy whole-number behaviour for products without a UOM.

export const MAX_UOM_PRECISION = 4;

export function uomPrecisionOf(item) {
  const raw = item?.uomPrecision ?? item?.uom_precision ?? item?.uom?.uomPrecision ?? 0;
  const precision = Number.parseInt(raw, 10);
  if (!Number.isFinite(precision) || precision < 0) return 0;
  return Math.min(precision, MAX_UOM_PRECISION);
}

export function roundQty(value, precision) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** precision;
  return Math.round(n * factor) / factor;
}

export function parseQty(raw, precision) {
  if (raw === '' || raw === null || raw === undefined) return 0;
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return roundQty(n, precision);
}

// Pads to the UOM precision. A value with more decimals than the precision (e.g. a legacy
// line stored before UOM precision existed) is shown as-is rather than rounded away.
// True while the typed text has no more decimals than the UOM precision allows.
export function withinPrecision(raw, precision) {
  return (String(raw).replace(',', '.').split('.')[1] || '').length <= precision;
}

export function formatQty(value, precision) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return '0';
  // Remove floating-point noise (e.g. 2.5549999999999997 -> 2.555) before deciding on decimals.
  const n = roundQty(raw, 6);
  const decimals = (String(n).split('.')[1] || '').length;
  if (decimals > precision) return String(n);
  return n.toFixed(precision);
}

export function qtyInputStep(precision) {
  return precision > 0 ? 10 ** -precision : 1;
}
