import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../../context/AuthContext';
import { useNotification } from '../../../context/NotificationContext';
import { calculateOrderTotals } from '../../../utils/orderCalculations';
import { 
  isCustomersModuleEnabled, 
  isDiscountModuleEnabled, 
  isKitchenModuleEnabled 
} from '../../../utils/moduleVisibility';

// ── V2: Use the new single-call bootstrap ──
import usePosSaleBootstrap from './usePosSaleBootstrap';

// ── Reuse existing CounterSale hooks ──
import useCart from '../../CounterSale/hooks/useCart';
import usePosProductCatalog from './usePosProductCatalog';
import usePosCustomerSelection from './usePosCustomerSelection';
import useDiscounts from '../../CounterSale/hooks/useDiscounts';
import useOrderSubmission from '../../CounterSale/hooks/useOrderSubmission';

// ── V2: Use new API for customer save + product refresh ──
import { saveCustomer, createSaleOrder } from '../services/posSaleApi';
import { cartKeyFor, withoutDiscounts } from '../../CounterSale/domain/cart';
import { extractUniqueCategories } from '../../CounterSale/domain/products';

/**
 * POS Sale V2 Controller Hook
 * 
 * This is architecturally identical to useCounterSaleController but uses:
 * 1. usePosSaleBootstrap (single-call bootstrap from /api/v1/pos/sale/bootstrap)
 * 2. V2 API service for order creation (/api/v1/pos/sale/orders)
 * 
 * All other hooks (cart, catalog, customer, discounts, submission) are
 * reused from the existing CounterSale module — zero duplication.
 * 
 * The returned state shape is 100% compatible with CounterSaleContainer
 * so the same visual components render identically.
 */
export default function usePosSaleController({
  onBack,
  initialTable,
  onOrderCreated,
  onCreditCustomerCreated,
  interfaceMode = 'counter',
  config: propConfig = null,
  initialCreditCustomers = null,
  initialBootstrap = null
}) {
  const { notify } = useNotification();
  const router = useRouter();
  const { timezone, orgId } = useAuth();

  // 1. V2 Bootstrap / Sales Screen Details — single API call replaces 5-7 waterfall requests
  const bootstrap = usePosSaleBootstrap({
    orgId,
    propConfig,
    initialCreditCustomers,
    initialBootstrap
  });

  const {
    products,
    config,
    allCustomers,
    setAllCustomers,
    creditCustomers,
    setCreditCustomers,
    defaultPricelistId,
    categories,
    categoryBeans,
    tables,
    paymentModes,
    loading,
    loadError
  } = bootstrap;

  const customersEnabled = isCustomersModuleEnabled(config);
  const discountsEnabled = isDiscountModuleEnabled(config);
  const kitchenEnabled = isKitchenModuleEnabled(config);
  const sym = config?.currencySymbol || '₹';

  // 2. Cart Operations (reused from CounterSale)
  const cartHook = useCart({ notify });
  const {
    cart,
    setCart,
    orderNote,
    setOrderNote,
    variantProduct,
    setVariantProduct,
    variantLoading,
    variablePriceProduct,
    setVariablePriceProduct,
    productCartQuantity,
    baseProductCartLine,
    variantQuantityMap,
    currentVariantQuantities,
    addToCart,
    addVariantToCart,
    addVariablePriceToCart,
    syncVariantCart,
    updateQty,
    decrementProduct,
    incrementProduct,
    setProductQty,
    setItemDescription,
  } = cartHook;

  // 3. Catalog Keyset Filtering & Pagination (V2)
  const catalogHook = usePosProductCatalog({
    initialProducts: products,
    trendingProductIds: bootstrap.trendingProductIds || [],
    config,
    categoryBeans: categoryBeans || []
  });

  const {
    activeCat,
    setActiveCat,
    dietFilter,
    setDietFilter,
    search,
    setSearch,
    productPage,
    setProductPage,
    productListingOn,
    handleToggleProductListing,
    visibleProducts,
    paginatedProducts,
    standardMatches,
    addFromStandardSearch,
    PRODUCT_PAGE_SIZE
  } = catalogHook;

  // 4. Customer & Credit Picker (V2 On-Demand Fast Search)
  const customerHook = usePosCustomerSelection({
    creditCustomers,
    customersEnabled,
    config,
    sym
  });

  const {
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
    customerAge,
    setCustomerAge,
    selectedCustomerId,
    setSelectedCustomerId,
    selectedCustomer,
    setSelectedCustomer,
    selectedCustomers,
    setSelectedCustomers,
    showCustomerDropdown,
    setShowCustomerDropdown,
    selectedCreditCustomerId,
    setSelectedCreditCustomerId,
    isCreditSale,
    setIsCreditSale,
    showNewCreditCustomer,
    setShowNewCreditCustomer,
    toggleCreditSale,
    selectCustomer,
    removeCustomer,
    handleCustomerKeyDown,
    handleCreditCustomerCreated,
    filteredCustomers,
    selectedCreditCustomer,
    creditCustomerOptions,
    getCreditLimitWarning,
    getCustomerSelectionsList,
    clearCustomerSelection
  } = customerHook;

  // 5. Discounts (reused from CounterSale)
  const discounts = useDiscounts();
  const {
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
  } = discounts;

  // 6. Order Submission (reused from CounterSale — uses V2 API via overridden createOrder)
  const submission = useOrderSubmission({ timezone, createOrderFn: createSaleOrder });
  const {
    processing,
    showSettleDialog,
    setShowSettleDialog,
    orderDateTime,
    setOrderDateTime,
    isDateTimeManuallyEdited,
    setIsDateTimeManuallyEdited,
    handleSubmitOrder
  } = submission;

  const [orderMode, setOrderMode] = useState(() => {
    if (config && isKitchenModuleEnabled(config)) {
      return 'kitchen';
    }
    return 'settle';
  });

  const modeInitializedRef = useRef(false);
  useEffect(() => {
    if (config && !modeInitializedRef.current) {
      setOrderMode(isKitchenModuleEnabled(config) ? 'kitchen' : 'settle');
      modeInitializedRef.current = true;
    }
  }, [config]);

  const isTakeawayOrder = initialTable?.orderType === 'TAKEAWAY' || router?.query?.mode === 'TAKEAWAY';
  const isDeliveryOrder = initialTable?.orderType === 'DELIVERY' || router?.query?.mode === 'DELIVERY';
  const isDineInOrder = !isTakeawayOrder && !isDeliveryOrder;

  const hideKitchenForTakeaway = isTakeawayOrder && (config?.takeawayHideKitchenMode === true || config?.pm_takeaway_hide_kitchen === true);
  const hideKitchenForDineIn = isDineInOrder && (config?.dineInHideKitchenMode === true || config?.pm_dinein_hide_kitchen === true);

  const activeOrderMode = (hideKitchenForTakeaway || hideKitchenForDineIn) ? 'settle' : (kitchenEnabled ? orderMode : 'settle');

  const THEME = activeOrderMode === 'kitchen'
    ? { main: '#f97316', dark: '#ea580c', soft: '#fff7ed' }
    : { main: '#16a34a', dark: '#15803d', soft: '#ecfdf3' };

  // Zoom level
  const [zoomLevel, setZoomLevel] = useState(1.0);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedZoom = localStorage.getItem('pos_zoom_level');
      if (savedZoom) {
        const val = parseFloat(savedZoom);
        if (val >= 0.8 && val <= 1.4) {
          setZoomLevel(val);
        }
      }
    }
  }, []);

  // Reset current sale state when switching table / order type (while preserving catalog & categories in memory)
  const currentTableKey = initialTable ? `${initialTable.id || ''}-${initialTable.tableNumber || ''}-${initialTable.orderType || ''}` : '';
  const prevTableKeyRef = useRef(currentTableKey);

  useEffect(() => {
    if (prevTableKeyRef.current !== currentTableKey) {
      prevTableKeyRef.current = currentTableKey;
      setCart([]);
      setOrderNote('');
      clearCustomerSelection();
      handleClearAllDiscounts();
      setShowSettleDialog(false);
      setVariantProduct(null);
      setVariablePriceProduct(null);
    }
  }, [currentTableKey, setCart, setOrderNote, clearCustomerSelection, handleClearAllDiscounts, setShowSettleDialog, setVariantProduct, setVariablePriceProduct]);

  const handleZoom = useCallback((delta) => {
    setZoomLevel(prev => {
      const next = Number(Math.min(1.4, Math.max(0.8, prev + delta)).toFixed(1));
      localStorage.setItem('pos_zoom_level', String(next));
      return next;
    });
  }, []);

  // Sync local discounts when opening modal
  useEffect(() => {
    if (showDiscountModal) {
      syncLocalDiscounts(cart, cartKeyFor);
    }
  }, [showDiscountModal, cart, syncLocalDiscounts]);

  // Clear discounts if module disabled or when in kitchen mode
  useEffect(() => {
    if (!discountsEnabled || activeOrderMode === 'kitchen') {
      setShowDiscountModal(false);
      setDiscountType('amount');
      setDiscountValue(0);
      setLocalOrderDiscountType('amount');
      setLocalOrderDiscountValue(0);
      setLocalDiscounts({});
      setCart(prev => {
        const hasDiscount = prev.some(item => (item.discount_percent > 0) || (item.discount_amount > 0) || item.discount);
        return hasDiscount ? prev.map(withoutDiscounts) : prev;
      });
    }
  }, [discountsEnabled, activeOrderMode, setCart, setLocalDiscounts, setDiscountType, setDiscountValue, setLocalOrderDiscountType, setLocalOrderDiscountValue, setShowDiscountModal]);

  // Derived calculations
  const totals = useMemo(() => {
    if (!config) return { subtotal: 0, tax: 0, total: 0 };
    const discountsActive = discountsEnabled && activeOrderMode === 'settle';
    const cartForTotals = discountsActive ? cart : cart.map(withoutDiscounts);
    const orderDiscount = discountsActive ? { type: discountType, value: discountValue } : { type: 'amount', value: 0 };
    
    return calculateOrderTotals(
      cartForTotals.map(i => ({
        ...i,
        id: cartKeyFor(i),
        productId: i.productId || i.id,
        name: i.displayName || i.name,
        quantity: i.qty,
        tax_rate: (i.taxRate !== undefined && i.taxRate !== null && i.taxRate !== '') ? Number(i.taxRate) : null,
        is_packaged_good: i.isPackagedGood === true || i.is_packaged_good === true || i.is_packaged === true,
        is_packaged: i.isPackagedGood === true || i.is_packaged_good === true || i.is_packaged === true
      })),
      orderDiscount,
      { 
        tax_enabled: config.taxEnabled,
        default_tax_rate: (() => {
          if (!config.taxEnabled) return 0;
          const rates = config.taxRates || [];
          const def = rates.find(r => r.id === config.taxDefaultId);
          return def ? parseFloat(def.value) || 0 : (rates[0] ? parseFloat(rates[0].value) || 0 : 0);
        })(),
        prices_include_tax: config.pricesIncludeTax,
        currencyDecimalPlaces: config.currencyDecimalPlaces,
        round_off_config: {
          round_off_enabled: Boolean(config.roundOffEnabled),
          round_off_mode: String(config.roundOffMode || 'AUTOMATIC').toUpperCase(),
          round_off_auto_factor: Number(config.roundOffAutoFactor ?? 1)
        }
      }
    );
  }, [cart, config, discountType, discountValue, discountsEnabled, activeOrderMode]);

  const roundOffPreview = useMemo(() => {
    if (!config?.roundOffEnabled || config?.roundOffMode !== 'automatic') return 0;
    const base = totals.total_inc_tax || 0;
    const factor = Number(config.roundOffAutoFactor ?? 1);
    if (factor <= 0) return 0;
    const rounded = Math.round(base / factor) * factor;
    return Number((rounded - base).toFixed(config?.currencyDecimalPlaces ?? 2));
  }, [config, totals]);

  const creditLimitWarning = useMemo(() => {
    return getCreditLimitWarning(totals?.total_inc_tax || 0);
  }, [getCreditLimitWarning, totals?.total_inc_tax]);

  const cartItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  }, [cart]);

  const cartCountLabel = `${cartItemCount} Item${cartItemCount === 1 ? '' : 's'}`;

  const handleCompleteSettle = useCallback(() => {
    if (cart.length === 0 || processing) return;
    setShowSettleDialog(true);
  }, [cart.length, processing, setShowSettleDialog]);

  const [selectedProductForPopup, setSelectedProductForPopup] = useState(null);
  const [popupViewOnly, setPopupViewOnly] = useState(false);

  const handleEditProductFromCart = useCallback((item) => {
    const productId = item.productId || item.id;
    const fullProduct = products.find(p => String(p.id) === String(productId));
    if (fullProduct) {
      setSelectedProductForPopup(fullProduct);
      setPopupViewOnly(true);
    }
  }, [products]);

  // Order placement (same logic as CounterSale — uses handleSubmitOrder which calls createOrder)
  const handlePlaceOrder = useCallback(async (paymentPayload = null) => {
    let primaryCustomer = null;
    let customerSelections = [];

    try {
      const isCreditPayment = paymentPayload?.paymentMethod === 'CREDIT';

      if (customersEnabled && !isCreditPayment) {
        if (isCreditSale && selectedCreditCustomer) {
          primaryCustomer = {
            id: selectedCreditCustomer.linkedCustomerId || null,
            name: selectedCreditCustomer.name || null,
            phone: selectedCreditCustomer.phone || null,
          };
          customerSelections = [primaryCustomer];
        } else if (config?.allowMultipleCustomersPerOrder) {
          const resolvedList = [];
          for (const c of selectedCustomers) {
            if (String(c.id).startsWith('temp-')) {
              const saved = await saveCustomer({
                name: c.name.trim(),
                phone: c.phone ? c.phone.trim() : null,
                pricelistId: defaultPricelistId,
                isactive: 'Y'
              });
              resolvedList.push({ id: saved.id, name: saved.name, phone: saved.phone });
            } else {
              resolvedList.push({ id: c.id, name: c.name, phone: c.phone });
            }
          }
          if (customerName.trim()) {
            const saved = await saveCustomer({
              name: customerName.trim(),
              phone: customerPhone ? customerPhone.trim() : null,
              pricelistId: defaultPricelistId,
              isactive: 'Y'
            });
            resolvedList.push({ id: saved.id, name: saved.name, phone: saved.phone });
          }
          customerSelections = resolvedList;
          primaryCustomer = resolvedList[0] || null;
        } else {
          if (selectedCustomerId && String(selectedCustomerId).startsWith('temp-')) {
            const saved = await saveCustomer({
              name: customerName.trim(),
              phone: customerPhone ? customerPhone.trim() : null,
              pricelistId: defaultPricelistId,
              isactive: 'Y'
            });
            primaryCustomer = { id: saved.id, name: saved.name, phone: saved.phone };
            customerSelections = [primaryCustomer];
          } else if (selectedCustomerId) {
            primaryCustomer = { id: selectedCustomerId, name: customerName, phone: customerPhone };
            customerSelections = [primaryCustomer];
          } else if (customerName.trim()) {
            const saved = await saveCustomer({
              name: customerName.trim(),
              phone: customerPhone ? customerPhone.trim() : null,
              pricelistId: defaultPricelistId,
              isactive: 'Y'
            });
            primaryCustomer = { id: saved.id, name: saved.name, phone: saved.phone };
            customerSelections = [primaryCustomer];
          }
        }
      }

      // Fallback: if no customer was selected on the cart but one was entered in the PaymentDialog
      if (!primaryCustomer && paymentPayload) {
        if (paymentPayload.customerId || paymentPayload.customerName || paymentPayload.customerPhone) {
          if (!paymentPayload.customerId && (paymentPayload.customerName?.trim() || paymentPayload.customerPhone?.trim())) {
            try {
              const saved = await saveCustomer({
                name: paymentPayload.customerName?.trim() || 'Guest',
                phone: paymentPayload.customerPhone ? paymentPayload.customerPhone.trim() : null,
                pricelistId: defaultPricelistId,
                isactive: 'Y'
              });
              primaryCustomer = { id: saved.id, name: saved.name, phone: saved.phone };
            } catch (err) {
              console.warn('Could not auto-save customer before order placement:', err);
              primaryCustomer = {
                id: null,
                name: paymentPayload.customerName || null,
                phone: paymentPayload.customerPhone || null,
              };
            }
          } else {
            primaryCustomer = {
              id: paymentPayload.customerId || null,
              name: paymentPayload.customerName || null,
              phone: paymentPayload.customerPhone || null,
            };
          }
          customerSelections = [primaryCustomer];
        }
      }

      const rememberTrending = (items) => {
        if (typeof window === 'undefined') return;
        try {
          const stored = JSON.parse(window.localStorage.getItem('cafeqr_recent_product_ids') || '[]');
          const next = [
            ...items.map((item) => String(item.productId || item.id)).filter(Boolean),
            ...stored,
          ].filter((value, index, list) => list.indexOf(value) === index).slice(0, 24);
          window.localStorage.setItem('cafeqr_recent_product_ids', JSON.stringify(next));
        } catch (err) {
          console.warn('Failed to save trending items:', err);
        }
      };

      await handleSubmitOrder({
        paymentPayload,
        orgId,
        cart: activeOrderMode === 'kitchen' ? cart.map(withoutDiscounts) : cart,
        setCart,
        orderNote,
        setOrderNote,
        totals,
        discountType: activeOrderMode === 'kitchen' ? 'amount' : discountType,
        discountValue: activeOrderMode === 'kitchen' ? 0 : discountValue,
        customersEnabled,
        primaryCustomer,
        customerSelections,
        isCreditSale,
        selectedCreditCustomerId,
        selectedCreditCustomer,
        orderMode: activeOrderMode,
        kitchenEnabled,
        config,
        initialTable,
        onOrderCreated,
        onBack,
        rememberTrending,
        notify,
        clearCustomerSelection
      });
    } catch (err) {
      notify('error', 'Failed to place order: ' + (err.response?.data?.message || err.message));
    }
  }, [
    customersEnabled, isCreditSale, selectedCreditCustomer, config,
    selectedCustomers, customerName, customerPhone, selectedCustomerId,
    defaultPricelistId, handleSubmitOrder, orgId, cart, setCart, orderNote,
    setOrderNote, totals, discountType, discountValue, activeOrderMode,
    kitchenEnabled, initialTable, onOrderCreated, onBack, notify
  ]);

  const handleApplyDiscountsWrapper = useCallback(() => {
    handleApplyDiscounts(setCart, cartKeyFor, discountsEnabled);
  }, [handleApplyDiscounts, setCart, discountsEnabled]);

  const handleClearAllDiscountsWrapper = useCallback(() => {
    handleClearAllDiscounts(discountsEnabled);
  }, [handleClearAllDiscounts, discountsEnabled]);

  const refreshProductsList = useCallback(async (updatedProduct = null) => {
    try {
      if (updatedProduct) {
        // Fast in-place local update: ZERO network calls
        const updatedProductId = String(updatedProduct.id);
        const newPrice = Number(updatedProduct.price || 0);

        bootstrap.setProducts(prevProducts => {
          const list = Array.isArray(prevProducts) ? prevProducts : [];
          const exists = list.some(p => String(p.id) === updatedProductId);
          const nextList = exists
            ? list.map(p => String(p.id) === updatedProductId ? { ...p, ...updatedProduct } : p)
            : [...list, updatedProduct];

          const sorted = nextList.sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' })
          );
          const cats = extractUniqueCategories(sorted);
          bootstrap.setCategories(cats);
          return sorted;
        });

        setCart(prevCart => prevCart.map(item => {
          if (String(item.productId || item.id) === updatedProductId) {
            if (!item.variantId) {
              return {
                ...item,
                price: newPrice,
                name: updatedProduct.name,
                displayName: updatedProduct.name
              };
            } else {
              const pricing = (updatedProduct.variantPricings || []).find(vp => String(vp.variantOption?.id || vp.variantOptionId || '') === String(item.variantId));
              if (pricing) {
                const variantPrice = Number(pricing.overridePrice ?? pricing.additionalPrice ?? item.price ?? 0);
                const displayName = `${updatedProduct.name} (${pricing.variantOption?.name || pricing.variantOption?.label || item.variantName})`;
                return {
                  ...item,
                  price: variantPrice,
                  name: displayName,
                  displayName
                };
              }
            }
          }
          return item;
        }));
        return;
      }

      // Fallback: Full network refresh only when no specific product was provided
      const { fetchSalesScreenDetails } = await import('../services/posSaleApi');
      const freshBootstrap = await fetchSalesScreenDetails();
      if (!freshBootstrap) return;

      const pList = freshBootstrap.products || [];
      const sortedProducts = [...pList].sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' })
      );
      bootstrap.setProducts(sortedProducts);
      
      const cats = extractUniqueCategories(sortedProducts);
      bootstrap.setCategories(cats);
    } catch (err) {
      console.warn("Failed to refresh product list:", err);
    }
  }, [bootstrap, setCart]);

  const startNewProductForPopup = useCallback((initialData = null) => {
    const isEvent = Boolean(initialData && (initialData.nativeEvent || initialData.target || typeof initialData.stopPropagation === 'function' || initialData._reactName));
    const safeData = (!isEvent && initialData && typeof initialData === 'object') ? initialData : {};
    const hasBarcode = Boolean(safeData.barcode);
    setSelectedProductForPopup({
      name: '',
      price: '',
      categoryName: activeCat !== 'ALL' ? activeCat : '',
      isActive: true,
      hasVariants: false,
      productType: 'VEG',
      isPackagedGood: hasBarcode,
      ...safeData
    });
    setPopupViewOnly(false);
  }, [activeCat]);

  // ── Return exact same shape as useCounterSaleController ──
  return {
    bootstrap: {
      products,
      categories,
      categoryBeans,
      tables,
      paymentModes,
      loading,
      loadError,
      config,
      allCustomers,
      defaultPricelistId,
      refreshProductsList,
      startNewProductForPopup,
      metadataWarnings: bootstrap.metadataWarnings
    },
    catalog: {
      activeCat, setActiveCat,
      dietFilter, setDietFilter,
      search, setSearch,
      productPage, setProductPage,
      productListingOn,
      handleToggleProductListing,
      visibleProducts,
      paginatedProducts,
      standardMatches,
      addFromStandardSearch: (p, ref) => addFromStandardSearch(p, addToCart, ref),
      PRODUCT_PAGE_SIZE,
      hasMore: catalogHook.hasMore,
      loadingProducts: catalogHook.loadingProducts,
      loadingMore: catalogHook.loadingMore,
      onNextPage: catalogHook.onNextPage,
      onPrevPage: catalogHook.onPrevPage,
    },
    cart: {
      items: cart,
      setCart,
      orderNote, setOrderNote,
      variantProduct, setVariantProduct,
      variantLoading,
      variablePriceProduct, setVariablePriceProduct,
      productCartQuantity,
      baseProductCartLine,
      variantQuantityMap,
      currentVariantQuantities,
      addToCart,
      addVariantToCart,
      addVariablePriceToCart,
      syncVariantCart,
      updateQty,
      decrementProduct,
      incrementProduct,
      setProductQty,
      setItemDescription,
      cartKeyFor,
      totals,
      roundOffPreview,
      cartItemCount,
      cartCountLabel,
      handleEditProductFromCart
    },
    customer: {
      name: customerName,
      customerName: customerName,
      setName: setCustomerName,
      phone: customerPhone,
      customerPhone: customerPhone,
      setPhone: setCustomerPhone,
      age: customerAge,
      setAge: setCustomerAge,
      selectedId: selectedCustomerId,
      setSelectedId: setSelectedCustomerId,
      selectedCustomerId: selectedCustomerId,
      selectedCustomer: selectedCustomer,
      setSelectedCustomer: setSelectedCustomer,
      selectedCustomers,
      setSelectedCustomers,
      showDropdown: showCustomerDropdown,
      setShowDropdown: setShowCustomerDropdown,
      creditCustomers,
      setCreditCustomers,
      selectedCreditCustomerId,
      setSelectedCreditCustomerId,
      isCreditSale,
      setIsCreditSale,
      showNewCreditCustomer,
      setShowNewCreditCustomer,
      toggleCreditSale,
      selectCustomer,
      removeCustomer,
      handleCustomerKeyDown,
      handleCreditCustomerCreated: (c) => handleCreditCustomerCreated(c, setCreditCustomers, onCreditCustomerCreated),
      filteredCustomers,
      selectedCreditCustomer,
      creditCustomerOptions,
      creditLimitWarning,
      buildCustomerSelections: getCustomerSelectionsList,
      customersEnabled
    },
    discounts: {
      type: discountType,
      setType: setDiscountType,
      value: discountValue,
      setValue: setDiscountValue,
      showModal: showDiscountModal,
      setShowModal: setShowDiscountModal,
      localDiscounts,
      setLocalDiscounts,
      localOrderDiscountType,
      setLocalOrderDiscountType,
      localOrderDiscountValue,
      setLocalOrderDiscountValue,
      modalTab: discountModalTab,
      setModalTab: setDiscountModalTab,
      handleApplyDiscounts: handleApplyDiscountsWrapper,
      handleClearAllDiscounts: handleClearAllDiscountsWrapper,
      discountsEnabled
    },
    order: {
      mode: orderMode,
      setMode: setOrderMode,
      activeOrderMode,
      processing,
      showSettleDialog,
      setShowSettleDialog,
      orderDateTime,
      setOrderDateTime,
      isDateTimeManuallyEdited,
      setIsDateTimeManuallyEdited,
      handleCompleteSettle,
      handlePlaceOrder,
      kitchenEnabled,
      hideKitchenForTakeaway,
      hideKitchenForDineIn
    },
    ui: {
      zoomLevel,
      handleZoom,
      THEME,
      sym,
      notify,
      selectedProductForPopup,
      setSelectedProductForPopup,
      popupViewOnly,
      setPopupViewOnly
    }
  };
}
