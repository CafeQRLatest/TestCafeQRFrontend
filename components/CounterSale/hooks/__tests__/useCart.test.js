import { renderHook, act } from '@testing-library/react';
import useCart from '../useCart';
import { fetchProductDetails } from '../../services/counterSaleApi';

// Mock the API service
jest.mock('../../services/counterSaleApi', () => ({
  fetchProductDetails: jest.fn()
}));

describe('useCart Hook - Variant Selection & Caching', () => {
  let mockNotify;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNotify = jest.fn();
  });

  test('caches variant detail request Promises to prevent concurrent duplicates', async () => {
    let resolveDetails;
    const promise = new Promise((resolve) => {
      resolveDetails = resolve;
    });

    fetchProductDetails.mockReturnValue(promise);

    const { result } = renderHook(() => useCart({ notify: mockNotify }));

    const product = { id: 'prod-123', name: 'Coffee', hasVariants: true };

    // Fire two variant requests concurrently
    let p1, p2;
    act(() => {
      p1 = result.current.addToCart(product);
      p2 = result.current.addToCart(product);
    });

    // Resolve the promise
    await act(async () => {
      resolveDetails({ id: 'prod-123', variants: [{ id: 'v1', name: 'Large' }] });
      await Promise.all([p1, p2]);
    });

    // Expect the API to be called exactly once
    expect(fetchProductDetails).toHaveBeenCalledTimes(1);
    expect(fetchProductDetails).toHaveBeenCalledWith('prod-123');

    // Confirm state has correct variants loaded
    expect(result.current.variantProduct).toEqual({
      id: 'prod-123',
      name: 'Coffee',
      hasVariants: true,
      variants: [{ id: 'v1', name: 'Large' }],
      categoryName: undefined
    });
  });

  test('prevents out-of-order details responses from overwriting newer selections (request sequence)', async () => {
    let resolveProductA, resolveProductB;
    const promiseA = new Promise((resolve) => { resolveProductA = resolve; });
    const promiseB = new Promise((resolve) => { resolveProductB = resolve; });

    // Mock API to return different promises depending on ID
    fetchProductDetails.mockImplementation((id) => {
      if (id === 'prod-A') return promiseA;
      if (id === 'prod-B') return promiseB;
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useCart({ notify: mockNotify }));

    const productA = { id: 'prod-A', name: 'Coffee A', hasVariants: true };
    const productB = { id: 'prod-B', name: 'Tea B', hasVariants: true };

    // Cashier clicks A (slow request starts)
    act(() => {
      result.current.addToCart(productA);
    });

    // Cashier immediately clicks B (fast request starts)
    act(() => {
      result.current.addToCart(productB);
    });

    // B resolves first
    await act(async () => {
      resolveProductB({ id: 'prod-B', variants: [{ id: 'vb', name: 'Green' }] });
      await promiseB;
    });

    // Expect the current active variant product to be product B
    expect(result.current.variantProduct).not.toBeNull();
    expect(result.current.variantProduct.id).toBe('prod-B');

    // Slower A resolves afterwards
    await act(async () => {
      resolveProductA({ id: 'prod-A', variants: [{ id: 'va', name: 'Espresso' }] });
      await promiseA;
    });

    // Product A's resolve should be ignored since B was selected last (sequence check)
    expect(result.current.variantProduct.id).toBe('prod-B');
    expect(result.current.variantProduct.variants[0].name).toBe('Green');
  });

  test('opens variant selector first when product has both variants and isVariablePrice: true', async () => {
    fetchProductDetails.mockResolvedValue({
      id: 'prod-chicken-65',
      variants: [
        { id: 'v-qtr', name: 'QUARTER', price: 150 },
        { id: 'v-half', name: 'HALF', price: 250 }
      ]
    });

    const { result } = renderHook(() => useCart({ notify: mockNotify }));

    const product = {
      id: 'prod-chicken-65',
      name: 'Chicken 65',
      hasVariants: true,
      isVariablePrice: true,
      price: 150
    };

    await act(async () => {
      await result.current.addToCart(product);
    });

    // Should NOT open variablePriceProduct directly
    expect(result.current.variablePriceProduct).toBeNull();
    // Should load and open variantProduct
    expect(result.current.variantProduct).not.toBeNull();
    expect(result.current.variantProduct.id).toBe('prod-chicken-65');
  });

  test('addVariantToCart for variable price product opens VariablePriceModal with variant metadata', async () => {
    fetchProductDetails.mockResolvedValue({
      id: 'prod-chicken-65',
      variants: [{ id: 'v-qtr', name: 'QUARTER', price: 150 }]
    });

    const { result } = renderHook(() => useCart({ notify: mockNotify }));

    const product = {
      id: 'prod-chicken-65',
      name: 'Chicken 65',
      hasVariants: true,
      isVariablePrice: true,
      price: 150
    };

    await act(async () => {
      await result.current.addToCart(product);
    });

    // User selects the QUARTER variant
    act(() => {
      result.current.addVariantToCart({
        id: 'v-qtr',
        label: 'QUARTER',
        price: 150
      });
    });

    // Variant selector should close, variablePriceProduct should open for QUARTER
    expect(result.current.variantProduct).toBeNull();
    expect(result.current.variablePriceProduct).toEqual(expect.objectContaining({
      productId: 'prod-chicken-65',
      variantId: 'v-qtr',
      variantName: 'QUARTER',
      displayName: 'Chicken 65 (QUARTER)',
      price: 150,
      qty: 1
    }));

    // Cart should not have any items yet
    expect(result.current.cart).toHaveLength(0);

    // Cashier confirms custom price of 175
    act(() => {
      result.current.addVariablePriceToCart(result.current.variablePriceProduct, 175, 1);
    });

    // Item should now be in cart with custom price and variant metadata
    expect(result.current.cart).toHaveLength(1);
    expect(result.current.cart[0]).toEqual(expect.objectContaining({
      productId: 'prod-chicken-65',
      variantId: 'v-qtr',
      variantName: 'QUARTER',
      displayName: 'Chicken 65 (QUARTER)',
      price: 175,
      is_custom_price: true,
      qty: 1
    }));
  });
});

