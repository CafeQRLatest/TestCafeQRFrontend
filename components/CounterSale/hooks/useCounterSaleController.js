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

import useCounterSaleBootstrap from './useCounterSaleBootstrap';
import useCart from './useCart';
import useProductCatalog from './useProductCatalog';
import useCustomerSelection from './useCustomerSelection';
import useDiscounts from './useDiscounts';
import useOrderSubmission from './useOrderSubmission';

import { saveCustomer, fetchProducts } from '../services/counterSaleApi';
import { cartKeyFor, withoutDiscounts } from '../domain/cart';
import { extractUniqueCategories } from '../domain/products';

export default function useCounterSaleController({
  onBack,
  initialTable,
  onOrderCreated,
  onCreditCustomerCreated,
  interfaceMode = 'counter',
  config: propConfig = null,
  initialCreditCustomers = null
}) {
  const { notify } = useNotification();
  const router = useRouter();
  const { timezone, orgId } = useAuth();

  // 1. Bootstrap Core Data
  const bootstrap = useCounterSaleBootstrap({
    orgId,
    propConfig,
    initialCreditCustomers
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
    loading,
    loadError
  } = bootstrap;

  const customersEnabled = isCustomersModuleEnabled(config);
  const discountsEnabled = isDiscountModuleEnabled(config);
  const kitchenEnabled = isKitchenModuleEnabled(config);
  const sym = config?.currencySymbol || '₹';

  // 2. Cart Operations
  const cartHook = useCart({ notify });
  const {
    cart,
    setCart,
    variantProduct,
    setVariantProduct,
    variantLoading,
    productCartQuantity,
    baseProductCartLine,
    variantQuantityMap,
    currentVariantQuantities,
    addToCart,
    addVariantToCart,
    syncVariantCart,
    updateQty,
    decrementProduct,
    incrementProduct,
    setProductQty,
  } = cartHook;

  // 3. Catalog Filtering & Autocomplete
  const catalogHook = useProductCatalog({
    products,
    trendingProductIds: bootstrap.trendingProductIds || [],
    config
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

  // 4. Customer & Credit Picker
  const customerHook = useCustomerSelection({
    allCustomers,
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
    getCustomerSelectionsList
  } = customerHook;

  // 5. Discounts State Manager
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

  // 6. Order Submission Hook
  const submission = useOrderSubmission({ timezone });
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

  const activeOrderMode = kitchenEnabled ? orderMode : 'settle';

  const THEME = activeOrderMode === 'kitchen'
    ? { main: '#f97316', dark: '#ea580c', soft: '#fff7ed' }
    : { main: '#16a34a', dark: '#15803d', soft: '#ecfdf3' };

  // Sync zoom level
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

  // Passively clear discounts if discounts module is disabled
  useEffect(() => {
    if (!discountsEnabled) {
      setShowDiscountModal(false);
      setDiscountType('amount');
      setDiscountValue(0);
      setLocalOrderDiscountType('amount');
      setLocalOrderDiscountValue(0);
      setLocalDiscounts({});
      setCart(prev => prev.map(withoutDiscounts));
    }
  }, [discountsEnabled, setCart, setLocalDiscounts, setDiscountType, setDiscountValue, setLocalOrderDiscountType, setLocalOrderDiscountValue, setShowDiscountModal]);

  // Derived calculations
  const totals = useMemo(() => {
    if (!config) return { subtotal: 0, tax: 0, total: 0 };
    const cartForTotals = discountsEnabled ? cart : cart.map(withoutDiscounts);
    const orderDiscount = discountsEnabled ? { type: discountType, value: discountValue } : { type: 'amount', value: 0 };
    
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
      }
    );
  }, [cart, config, discountType, discountValue, discountsEnabled]);

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

  // Complete settle flow dialog
  const handleCompleteSettle = useCallback(() => {
    if (cart.length === 0 || processing) return;
    setShowSettleDialog(true);
  }, [cart.length, processing, setShowSettleDialog]);

  // Edit items modal
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

  // Coordinates order placing
  const handlePlaceOrder = useCallback(async (paymentPayload = null) => {
    let primaryCustomer = null;
    let customerSelections = [];

    try {
      if (customersEnabled) {
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
        cart,
        setCart,
        totals,
        discountType,
        discountValue,
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
        notify
      });
    } catch (err) {
      notify('error', 'Failed to place order: ' + (err.response?.data?.message || err.message));
    }
  }, [
    customersEnabled,
    isCreditSale,
    selectedCreditCustomer,
    config,
    selectedCustomers,
    customerName,
    customerPhone,
    selectedCustomerId,
    defaultPricelistId,
    handleSubmitOrder,
    orgId,
    cart,
    setCart,
    totals,
    discountType,
    discountValue,
    activeOrderMode,
    kitchenEnabled,
    initialTable,
    onOrderCreated,
    onBack,
    notify
  ]);

  const handleApplyDiscountsWrapper = useCallback(() => {
    handleApplyDiscounts(setCart, cartKeyFor, discountsEnabled);
  }, [handleApplyDiscounts, setCart, discountsEnabled]);

  const handleClearAllDiscountsWrapper = useCallback(() => {
    handleClearAllDiscounts(discountsEnabled);
  }, [handleClearAllDiscounts, discountsEnabled]);

  const refreshProductsList = useCallback(async (updatedProduct = null) => {
    try {
      const pList = await fetchProducts();
      const sortedProducts = [...pList].sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' })
      );
      bootstrap.setProducts(sortedProducts);
      
      const cats = extractUniqueCategories(sortedProducts);
      bootstrap.setCategories(cats);

      if (updatedProduct) {
        const updatedProductId = String(updatedProduct.id);
        const newPrice = Number(updatedProduct.price || 0);
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
      }
    } catch (err) {
      console.warn("Failed to refresh product list:", err);
    }
  }, [bootstrap]);

  const startNewProductForPopup = useCallback(() => {
    setSelectedProductForPopup({
      name: '',
      price: '',
      categoryName: activeCat !== 'ALL' ? activeCat : '',
      isActive: true,
      hasVariants: false,
      productType: 'VEG'
    });
    setPopupViewOnly(false);
  }, [activeCat]);

  return {
    bootstrap: {
      products,
      categories,
      loading,
      loadError,
      config,
      defaultPricelistId,
      refreshProductsList,
      startNewProductForPopup,
      metadataWarnings: bootstrap.metadataWarnings
    },
    catalog: {
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
      addFromStandardSearch: (p, ref) => addFromStandardSearch(p, addToCart, ref),
      PRODUCT_PAGE_SIZE
    },
    cart: {
      items: cart,
      setCart,
      variantProduct,
      setVariantProduct,
      variantLoading,
      productCartQuantity,
      baseProductCartLine,
      variantQuantityMap,
      currentVariantQuantities,
      addToCart,
      addVariantToCart,
      syncVariantCart,
      updateQty,
      decrementProduct,
      incrementProduct,
      setProductQty,
      cartKeyFor,
      totals,
      roundOffPreview,
      cartItemCount,
      cartCountLabel,
      handleEditProductFromCart
    },
    customer: {
      name: customerName,
      setName: setCustomerName,
      phone: customerPhone,
      setPhone: setCustomerPhone,
      age: customerAge,
      setAge: setCustomerAge,
      selectedId: selectedCustomerId,
      setSelectedId: setSelectedCustomerId,
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
      kitchenEnabled
    },
    ui: {
      zoomLevel,
      handleZoom,
      THEME,
      sym,
      selectedProductForPopup,
      setSelectedProductForPopup,
      popupViewOnly,
      setPopupViewOnly
    }
  };
}
