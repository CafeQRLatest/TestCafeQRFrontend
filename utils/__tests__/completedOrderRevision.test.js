import { completedOrderPaymentChanged, isCompletedOrder } from '../completedOrderRevision';

const completed = (overrides = {}) => ({
  orderStatus: 'COMPLETED',
  paymentMethod: 'CASH',
  totalDiscountAmount: 0,
  roundOffAmount: 0,
  ...overrides,
});

describe('completedOrderPaymentChanged', () => {
  test('only the payment type changed on a completed order -> revision', () => {
    expect(completedOrderPaymentChanged(completed(), { paymentMethod: 'ONLINE', discountAmount: 0, roundOffAmount: 0 })).toBe(true);
  });

  test('same payment type and totals -> no revision', () => {
    expect(completedOrderPaymentChanged(completed(), { paymentMethod: 'CASH', discountAmount: 0, roundOffAmount: 0 })).toBe(false);
  });

  test('payment type compared case-insensitively', () => {
    expect(completedOrderPaymentChanged(completed({ paymentMethod: 'cash' }), { paymentMethod: 'CASH' })).toBe(false);
  });

  test('discount change on a completed order -> revision', () => {
    expect(completedOrderPaymentChanged(completed(), { paymentMethod: 'CASH', discountAmount: 50 })).toBe(true);
  });

  test('round-off change on a completed order -> revision', () => {
    expect(completedOrderPaymentChanged(completed(), { paymentMethod: 'CASH', roundOffAmount: 1.5 })).toBe(true);
  });

  test('split payment with the same methods is not a payment-type change', () => {
    const order = completed({ paymentMethod: 'CASH, ONLINE' });
    const payload = {
      paymentMethod: 'MIXED',
      paymentSplits: [{ paymentMethod: 'ONLINE', amount: 10 }, { paymentMethod: 'CASH', amount: 5 }],
    };
    expect(completedOrderPaymentChanged(order, payload)).toBe(false);
  });

  test('split payment that adds a new method is a change', () => {
    const order = completed({ paymentMethod: 'CASH' });
    const payload = {
      paymentMethod: 'MIXED',
      paymentSplits: [{ paymentMethod: 'CASH', amount: 5 }, { paymentMethod: 'ONLINE', amount: 10 }],
    };
    expect(completedOrderPaymentChanged(order, payload)).toBe(true);
  });

  test('open (not completed) orders never trigger a revision from this helper', () => {
    const open = { orderStatus: 'KITCHEN', paymentMethod: 'CASH' };
    expect(completedOrderPaymentChanged(open, { paymentMethod: 'ONLINE' })).toBe(false);
  });

  test('PAID status counts as completed', () => {
    expect(isCompletedOrder({ order_status: 'PAID' })).toBe(true);
    expect(isCompletedOrder({ orderStatus: 'KITCHEN' })).toBe(false);
  });
});
