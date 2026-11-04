// Decides whether confirming a settle/payment on an already-completed order changed anything
// that must be recorded as a revision. When it did, the caller PATCHes the order first; the
// backend then voids the old order, invoice and payments and creates a new revision, and the
// settle call runs on that new order.

const COMPLETED_STATUSES = ['COMPLETED', 'PAID'];
const AMOUNT_EPSILON = 0.005;

const normalize = (value) => String(value || '').trim().toUpperCase();

const amountsDiffer = (a, b) => Math.abs(Number(a || 0) - Number(b || 0)) >= AMOUNT_EPSILON;

const methodSet = (value) => [...new Set(
  String(value || '')
    .split(',')
    .map((part) => normalize(part))
    .filter(Boolean)
)].sort().join(',');

// The order list/edit state can carry a stale payment method (orders.payment_method), so the
// confirm step reads the live order first. The live order reports the active payment(s).
export async function fetchLiveOrderState(api, orderId) {
  if (!orderId) return null;
  try {
    const res = await api.get(`/api/v1/orders/${orderId}`);
    return res?.data?.data || null;
  } catch (_err) {
    return null;
  }
}

export function mergeLiveOrderState(order, live) {
  if (!live) return order;
  return {
    ...order,
    paymentMethod: live.paymentMethod ?? order.paymentMethod,
    totalDiscountAmount: live.totalDiscountAmount ?? order.totalDiscountAmount,
    roundOffAmount: live.roundOffAmount ?? order.roundOffAmount,
  };
}

export function isCompletedOrder(order) {
  return COMPLETED_STATUSES.includes(normalize(order?.orderStatus || order?.order_status));
}

export function completedOrderPaymentChanged(order, payload) {
  if (!isCompletedOrder(order) || !payload) return false;

  // Payment type. Split payments are compared by the set of methods used, so re-confirming
  // the same split does not count as a change.
  const originalMethods = methodSet(order.paymentMethod || order.payment_method);
  if (originalMethods) {
    const newMethods = normalize(payload.paymentMethod) === 'MIXED' && Array.isArray(payload.paymentSplits) && payload.paymentSplits.length > 0
      ? methodSet(payload.paymentSplits.map((split) => split.paymentMethod).join(','))
      : methodSet(payload.paymentMethod);
    if (newMethods && newMethods !== originalMethods) return true;
  }

  // Discount and round-off. Only compared when the payload carries the value.
  if (payload.discountAmount != null && amountsDiffer(payload.discountAmount, order.totalDiscountAmount)) return true;
  if (payload.roundOffAmount != null && amountsDiffer(payload.roundOffAmount, order.roundOffAmount)) return true;

  return false;
}
