import { useState, useCallback } from 'react';

export default function useDiscounts() {
  const [discountType, setDiscountType] = useState('amount'); // 'amount' | 'percentage'
  const [discountValue, setDiscountValue] = useState(0);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [localDiscounts, setLocalDiscounts] = useState({});
  const [localOrderDiscountType, setLocalOrderDiscountType] = useState('amount');
  const [localOrderDiscountValue, setLocalOrderDiscountValue] = useState(0);
  const [discountModalTab, setDiscountModalTab] = useState('line'); // 'line' | 'total'

  const syncLocalDiscounts = useCallback((cart, cartKeyFor) => {
    const initial = {};
    if (Array.isArray(cart)) {
      cart.forEach(item => {
        const key = typeof cartKeyFor === 'function' ? cartKeyFor(item) : item.cartKey;
        if (item.discount_percent > 0) {
          initial[key] = { type: 'percentage', value: item.discount_percent };
        } else if (item.discount_amount > 0) {
          initial[key] = { type: 'amount', value: item.discount_amount };
        } else if (item.discount) {
          initial[key] = { type: item.discount.type || 'amount', value: item.discount.value || 0 };
        } else {
          initial[key] = { type: 'amount', value: 0 };
        }
      });
    }
    setLocalDiscounts(initial);
    setLocalOrderDiscountType(discountType || 'amount');
    setLocalOrderDiscountValue(discountValue || 0);
    setDiscountModalTab('line');
  }, [discountType, discountValue]);

  const handleApplyDiscounts = useCallback((setCart, cartKeyFor, discountsEnabled) => {
    if (!discountsEnabled) return;

    if (typeof setCart === 'function') {
      setCart(prev => prev.map(item => {
        const key = typeof cartKeyFor === 'function' ? cartKeyFor(item) : item.cartKey;
        const disc = localDiscounts[key];
        if (disc) {
          if (disc.type === 'percentage' || disc.type === 'percent') {
            return {
              ...item,
              discount_percent: disc.value,
              discount_amount: 0,
              discount: { type: 'percent', value: disc.value }
            };
          } else {
            return {
              ...item,
              discount_percent: 0,
              discount_amount: disc.value,
              discount: { type: 'amount', value: disc.value }
            };
          }
        }
        return item;
      }));
    }
    setDiscountType(localOrderDiscountType);
    setDiscountValue(localOrderDiscountValue);
    setShowDiscountModal(false);
  }, [localDiscounts, localOrderDiscountType, localOrderDiscountValue]);

  const handleClearAllDiscounts = useCallback((discountsEnabled) => {
    if (!discountsEnabled) return;

    setLocalDiscounts(prev => {
      const next = {};
      Object.keys(prev).forEach(key => {
        next[key] = { type: 'amount', value: 0 };
      });
      return next;
    });
    setLocalOrderDiscountType('amount');
    setLocalOrderDiscountValue(0);
  }, []);

  return {
    discountType,
    setDiscountType,
    discountValue,
    setDiscountValue,
    showDiscountModal,
    setShowDiscountModal,
    localDiscounts,
    setLocalDiscounts,
    localOrderDiscountType,
    setLocalOrderDiscountType,
    localOrderDiscountValue,
    setLocalOrderDiscountValue,
    discountModalTab,
    setDiscountModalTab,
    syncLocalDiscounts,
    handleApplyDiscounts,
    handleClearAllDiscounts
  };
}
