import { useState, useCallback } from 'react';

const DISCOUNT_UNIT_STORAGE_KEY = 'pos_discount_unit_pref';

const getSavedDiscountUnit = () => {
  if (typeof window === 'undefined') return 'amount';
  try {
    const saved = localStorage.getItem(DISCOUNT_UNIT_STORAGE_KEY);
    return saved === 'percentage' || saved === 'amount' ? saved : 'amount';
  } catch (e) {
    return 'amount';
  }
};

const saveDiscountUnit = (type) => {
  if (typeof window === 'undefined') return;
  try {
    if (type === 'percentage' || type === 'amount') {
      localStorage.setItem(DISCOUNT_UNIT_STORAGE_KEY, type);
    }
  } catch (e) {}
};

export default function useDiscounts() {
  const [discountType, setDiscountType] = useState(() => getSavedDiscountUnit()); // 'amount' | 'percentage'
  const [discountValue, setDiscountValue] = useState(0);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [localDiscounts, setLocalDiscounts] = useState({});
  const [localOrderDiscountType, setLocalOrderDiscountTypeState] = useState(() => getSavedDiscountUnit());
  const [localOrderDiscountValue, setLocalOrderDiscountValue] = useState(0);
  const [discountModalTab, setDiscountModalTab] = useState('total'); // 'total' | 'line'

  const setLocalOrderDiscountType = useCallback((type) => {
    setLocalOrderDiscountTypeState(type);
    saveDiscountUnit(type);
  }, []);

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
    const preferredUnit = getSavedDiscountUnit();
    const effectiveType = (discountValue > 0 && discountType) ? discountType : preferredUnit;
    setLocalOrderDiscountTypeState(effectiveType);
    setLocalOrderDiscountValue(discountValue || 0);
    setDiscountModalTab('total');
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
    const preferredUnit = getSavedDiscountUnit();
    setLocalOrderDiscountType(preferredUnit);
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
