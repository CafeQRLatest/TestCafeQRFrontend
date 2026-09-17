import { renderHook, act } from '@testing-library/react';
import useOrderSubmission from '../useOrderSubmission';
import { createOrder } from '../../services/counterSaleApi';
import { isKnownOffline } from '../../../../utils/networkState';
import { allocateOfflineSequence, isMainOfflineBillingDevice } from '../../../../utils/offlineSequences';

// Mock the print utility components to avoid loading their code, which relies on global fetch/window APIs
jest.mock('../../../../utils/cloudPrintStation', () => ({
  isAndroidPrintStationEnabled: jest.fn(() => false),
  localPrintWillHandleKind: jest.fn(() => false)
}));

jest.mock('../../../../utils/printServiceClient', () => ({
  isNativePrintServicePaired: jest.fn(() => false)
}));

// Mock the API and utilities
jest.mock('../../services/counterSaleApi', () => ({
  createOrder: jest.fn()
}));

jest.mock('../../domain/orderPayload', () => ({
  buildOrderPayload: jest.fn((args) => ({
    orgId: args.orgId,
    cart: args.cart,
    totals: args.totals,
    discountType: args.discountType,
    discountValue: args.discountValue,
    selectedCreditCustomerId: args.selectedCreditCustomerId,
    orderDate: args.parsedDate,
    initialTable: args.initialTable,
    paymentPayload: args.paymentPayload
  }))
}));

jest.mock('../../../../utils/networkState', () => ({
  isKnownOffline: jest.fn(() => false)
}));

jest.mock('../../../../utils/offlineSequences', () => ({
  allocateOfflineSequence: jest.fn(),
  ensureOfflineSequenceLeases: jest.fn(() => Promise.resolve()),
  isMainOfflineBillingDevice: jest.fn(() => true)
}));

describe('useOrderSubmission Hook - Idempotency & Concurrency', () => {
  let mockNotify, mockSetCart, defaultArgs;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNotify = jest.fn();
    mockSetCart = jest.fn();
    isKnownOffline.mockReturnValue(false);
    isMainOfflineBillingDevice.mockReturnValue(true);

    defaultArgs = {
      paymentPayload: null,
      orgId: 'org-abc',
      cart: [{ id: 'item-1', price: 10, qty: 2 }],
      setCart: mockSetCart,
      totals: { total_amount: 20 },
      discountType: 'amount',
      discountValue: 0,
      customersEnabled: false,
      primaryCustomer: null,
      customerSelections: [],
      isCreditSale: false,
      selectedCreditCustomerId: null,
      selectedCreditCustomer: null,
      orderMode: 'settle',
      kitchenEnabled: false,
      config: {},
      initialTable: { tableNumber: 'COUNTER' },
      onOrderCreated: jest.fn(),
      onBack: jest.fn(),
      rememberTrending: jest.fn(),
      notify: mockNotify
    };
  });

  test('double-click submission sends exactly one request', async () => {
    let resolveOrder;
    const promise = new Promise((resolve) => { resolveOrder = resolve; });
    createOrder.mockReturnValue(promise);

    const { result } = renderHook(() => useOrderSubmission({ timezone: 'UTC' }));

    // Trigger two submissions concurrently (simulating double click)
    let submit1, submit2;
    act(() => {
      submit1 = result.current.handleSubmitOrder(defaultArgs);
      submit2 = result.current.handleSubmitOrder(defaultArgs);
    });

    // Resolve order creation
    await act(async () => {
      resolveOrder({ success: true, data: { id: 'order-123', orderNo: 'SO-100' } });
      await Promise.all([submit1, submit2]);
    });

    // Expect only one API call to have fired
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  test('timeout / failure + retry reuses the exact same idempotency key and offline numbers', async () => {
    // 1st Attempt: Fail with a network timeout
    createOrder.mockRejectedValueOnce(new Error('Timeout'));

    // Enable offline context to verify sequence preservation on retry
    isKnownOffline.mockReturnValue(true);
    let seqCounter = 100;
    allocateOfflineSequence.mockImplementation((type) => {
      if (type === 'SALE_ORDER') return `SO-${seqCounter++}`;
      if (type === 'CUSTOMER_INVOICE') return `INV-${seqCounter++}`;
      if (type === 'INBOUND_PAYMENT') return `PAY-${seqCounter++}`;
      return 'SEQ-001';
    });

    const { result } = renderHook(() => useOrderSubmission({ timezone: 'UTC' }));

    // Run first submit attempt
    await act(async () => {
      await result.current.handleSubmitOrder(defaultArgs);
    });

    expect(createOrder).toHaveBeenCalledTimes(1);
    const firstCallPayload = createOrder.mock.calls[0][0];
    const firstCallHeaders = createOrder.mock.calls[0][1].headers;
    const firstIdempotencyKey = firstCallHeaders['Idempotency-Key'];

    expect(firstIdempotencyKey).toBeDefined();
    expect(firstCallPayload.sourceLocalRef).toBe(firstIdempotencyKey);
    expect(firstCallPayload.orderNo).toBe('SO-100');

    // 2nd Attempt (Retry): Settle successfully
    createOrder.mockResolvedValueOnce({ success: true, data: { id: 'order-123' } });

    // Run retry attempt
    await act(async () => {
      await result.current.handleSubmitOrder(defaultArgs);
    });

    expect(createOrder).toHaveBeenCalledTimes(2);
    const secondCallPayload = createOrder.mock.calls[1][0];
    const secondCallHeaders = createOrder.mock.calls[1][1].headers;
    const secondIdempotencyKey = secondCallHeaders['Idempotency-Key'];

    // Verify key and offline sequence numbers match exactly
    expect(secondIdempotencyKey).toBe(firstIdempotencyKey);
    expect(secondCallPayload.sourceLocalRef).toBe(firstIdempotencyKey);
    expect(secondCallPayload.orderNo).toBe('SO-100');
  });

  test('changing cart / customer / payment details generates a brand new key', async () => {
    // 1st Attempt: Fail
    createOrder.mockRejectedValueOnce(new Error('Timeout'));

    const { result } = renderHook(() => useOrderSubmission({ timezone: 'UTC' }));

    await act(async () => {
      await result.current.handleSubmitOrder(defaultArgs);
    });

    const firstCallHeaders = createOrder.mock.calls[0][1].headers;
    const firstIdempotencyKey = firstCallHeaders['Idempotency-Key'];

    // 2nd Attempt: Modify cart contents (Fingerprint should mismatch, triggering a new key)
    createOrder.mockResolvedValueOnce({ success: true, data: { id: 'order-456' } });
    const modifiedArgs = {
      ...defaultArgs,
      cart: [{ id: 'item-2', price: 15, qty: 1 }] // changed item
    };

    await act(async () => {
      await result.current.handleSubmitOrder(modifiedArgs);
    });

    expect(createOrder).toHaveBeenCalledTimes(2);
    const secondCallHeaders = createOrder.mock.calls[1][1].headers;
    const secondIdempotencyKey = secondCallHeaders['Idempotency-Key'];

    expect(secondIdempotencyKey).not.toBe(firstIdempotencyKey);
  });

  test('automatic clock ticking does NOT generate a new idempotency key', async () => {
    createOrder.mockRejectedValueOnce(new Error('Timeout'));

    const { result } = renderHook(() => useOrderSubmission({ timezone: 'UTC' }));

    // First run with ticking enabled (default)
    await act(async () => {
      await result.current.handleSubmitOrder(defaultArgs);
    });

    const firstIdempotencyKey = createOrder.mock.calls[0][1].headers['Idempotency-Key'];

    // Wait a tick and simulate ticker update (orderDateTime updates automatically)
    act(() => {
      result.current.setOrderDateTime('2026-07-05T22:45:00Z');
    });

    // Retry with unchanged cart
    createOrder.mockResolvedValueOnce({ success: true, data: { id: 'order-789' } });
    await act(async () => {
      await result.current.handleSubmitOrder(defaultArgs);
    });

    const secondIdempotencyKey = createOrder.mock.calls[1][1].headers['Idempotency-Key'];

    // Verify key remains reused despite clock tick
    expect(secondIdempotencyKey).toBe(firstIdempotencyKey);
  });

  test('successful order submission clears the transaction state', async () => {
    createOrder.mockResolvedValueOnce({ success: true, data: { id: 'order-123' } });

    const { result } = renderHook(() => useOrderSubmission({ timezone: 'UTC' }));

    await act(async () => {
      await result.current.handleSubmitOrder(defaultArgs);
    });

    const firstCallHeaders = createOrder.mock.calls[0][1].headers;
    const firstIdempotencyKey = firstCallHeaders['Idempotency-Key'];

    // Place another identical order afterwards (first succeeded, so state should be cleared)
    createOrder.mockResolvedValueOnce({ success: true, data: { id: 'order-456' } });
    await act(async () => {
      await result.current.handleSubmitOrder(defaultArgs);
    });

    const secondCallHeaders = createOrder.mock.calls[1][1].headers;
    const secondIdempotencyKey = secondCallHeaders['Idempotency-Key'];

    // Verify a brand new key is issued because state cleared after success
    expect(secondIdempotencyKey).not.toBe(firstIdempotencyKey);
  });

  test('unsuccessful API order (success: false) throws an error and notifies the cashier', async () => {
    createOrder.mockResolvedValueOnce({ success: false, message: 'Invalid payment options' });

    const { result } = renderHook(() => useOrderSubmission({ timezone: 'UTC' }));

    await act(async () => {
      await result.current.handleSubmitOrder(defaultArgs);
    });

    expect(mockNotify).toHaveBeenCalledWith('error', 'Failed to place order: Invalid payment options');
  });
});
