import { renderHook, act } from '@testing-library/react';
import useDiscounts from '../useDiscounts';

describe('useDiscounts Hook', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  test('defaults to "total" tab on initial mount', () => {
    const { result } = renderHook(() => useDiscounts());
    expect(result.current.discountModalTab).toBe('total');
  });

  test('initializes discount unit from localStorage preference', () => {
    localStorage.setItem('pos_discount_unit_pref', 'percentage');
    const { result } = renderHook(() => useDiscounts());
    expect(result.current.localOrderDiscountType).toBe('percentage');
    expect(result.current.discountType).toBe('percentage');
  });

  test('updates and persists discount unit when setLocalOrderDiscountType is called', () => {
    const { result } = renderHook(() => useDiscounts());
    act(() => {
      result.current.setLocalOrderDiscountType('percentage');
    });
    expect(result.current.localOrderDiscountType).toBe('percentage');
    expect(localStorage.getItem('pos_discount_unit_pref')).toBe('percentage');

    act(() => {
      result.current.setLocalOrderDiscountType('amount');
    });
    expect(result.current.localOrderDiscountType).toBe('amount');
    expect(localStorage.getItem('pos_discount_unit_pref')).toBe('amount');
  });

  test('syncLocalDiscounts sets tab to "total" and restores order discount or saved preference', () => {
    localStorage.setItem('pos_discount_unit_pref', 'percentage');
    const { result } = renderHook(() => useDiscounts());

    act(() => {
      result.current.setDiscountModalTab('line');
      result.current.syncLocalDiscounts([], () => '');
    });

    expect(result.current.discountModalTab).toBe('total');
    expect(result.current.localOrderDiscountType).toBe('percentage');
  });

  test('syncLocalDiscounts preserves existing active order discount type if present', () => {
    localStorage.setItem('pos_discount_unit_pref', 'percentage');
    const { result } = renderHook(() => useDiscounts());

    act(() => {
      result.current.setDiscountType('amount');
      result.current.setDiscountValue(50);
    });

    act(() => {
      result.current.syncLocalDiscounts([], () => '');
    });

    expect(result.current.discountModalTab).toBe('total');
    expect(result.current.localOrderDiscountType).toBe('amount');
  });
});

