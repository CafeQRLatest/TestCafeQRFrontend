// Helpers for the backend's non-stock sales policy = WARNING.
// The backend rejects with 409 / "STOCK_WARNING: a; b" until the request is
// resent with confirmStockWarning: true.

export function isStockWarningError(err) {
  const data = err?.response?.data;
  return err?.response?.status === 409 ||
    (data?.message && String(data.message).startsWith('STOCK_WARNING:')) ||
    (Array.isArray(data?.warnings) && data.warnings.length > 0);
}

export function getStockWarningLines(err) {
  const data = err?.response?.data;
  if (Array.isArray(data?.warnings) && data.warnings.length > 0) return data.warnings;
  const rawMsg = data?.message || err?.message || '';
  return String(rawMsg).replace('STOCK_WARNING:', '').split(';').map(s => s.trim()).filter(Boolean);
}

// Shows the shared confirm dialog; resolves true if the user chose to continue.
export function confirmStockWarning(showConfirm, err, actionText = 'save the order anyway') {
  if (typeof showConfirm !== 'function') return Promise.resolve(false);
  const formatted = getStockWarningLines(err).map(w => `• ${w}`).join('\n');
  return new Promise(resolve => {
    showConfirm({
      title: '⚠️ Stock Shortage Warning',
      message: `${formatted || 'One or more items have insufficient stock.'}\n\nDo you want to continue and ${actionText}?`,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      type: 'warning',
    });
  });
}
