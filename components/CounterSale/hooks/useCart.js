import { useState, useCallback, useMemo, useRef } from 'react';
import { cartKeyFor, hasExtendedOptions } from '../domain/cart';
import { fetchProductDetails } from '../services/counterSaleApi';

export default function useCart({ notify }) {
  const [cart, setCart] = useState([]);
  const [orderNote, setOrderNote] = useState('');
  const [variantProduct, setVariantProduct] = useState(null);
  const [variantLoading, setVariantLoading] = useState(false);
  const [variablePriceProduct, setVariablePriceProduct] = useState(null);
  
  // In-memory product details cache (persists for the POS session mount)
  const productDetailsCacheRef = useRef(new Map());
  
  // Request sequence ID to prevent out-of-order state overwrites
  const variantRequestIdRef = useRef(0);
  
  // Compile memoized cart index map for O(1) lookups
  const cartIndex = useMemo(() => {
    const byProductId = new Map();

    for (const item of cart) {
      const productId = String(item.productId || item.id);
      let entry = byProductId.get(productId);

      if (!entry) {
        entry = {
          quantity: 0,
          baseLine: null,
          variantQuantities: {}
        };
        byProductId.set(productId, entry);
      }

      entry.quantity += Number(item.qty || 0);

      if (item.variantId) {
        entry.variantQuantities[String(item.variantId)] = Number(item.qty || 0);
      } else {
        entry.baseLine = item;
      }
    }

    return byProductId;
  }, [cart]);

  const productCartQuantity = useCallback((product) => {
    const productId = String(product?.id || product?.productId || '');
    return cartIndex.get(productId)?.quantity || 0;
  }, [cartIndex]);

  const baseProductCartLine = useCallback((product) => {
    const productId = String(product?.id || product?.productId || '');
    return cartIndex.get(productId)?.baseLine || null;
  }, [cartIndex]);

  const variantQuantityMap = useCallback((product) => {
    const productId = String(product?.id || product?.productId || '');
    return cartIndex.get(productId)?.variantQuantities || {};
  }, [cartIndex]);

  const addPreparedToCart = useCallback((product) => {
    setCart(prev => {
      const quantity = Math.max(1, Number(product.qty || 1));
      const prepared = {
        ...product,
        productId: product.productId || product.id,
        cartKey: cartKeyFor(product),
        displayName: product.displayName || product.name,
        qty: quantity,
      };
      const key = cartKeyFor(prepared);
      const exists = prev.find(item => cartKeyFor(item) === key);
      
      if (exists) {
        return prev.map(item => 
          cartKeyFor(item) === key ? { ...item, qty: Number(item.qty || 0) + quantity } : item
        );
      }
      return [...prev, prepared];
    });
  }, []);

  const openVariantSelector = useCallback(async (product) => {
    const requestId = ++variantRequestIdRef.current;
    const productId = String(product.id);
    const cache = productDetailsCacheRef.current;

    let request = cache.get(productId);

    if (!request) {
      request = fetchProductDetails(product.id)
        .catch(error => {
          cache.delete(productId);
          throw error;
        });
      cache.set(productId, request);
    }

    setVariantLoading(true);

    try {
      const details = await request;

      if (requestId !== variantRequestIdRef.current) {
        return;
      }

      setVariantProduct({
        ...product,
        ...(details || {}),
        categoryName: product.categoryName,
      });
    } catch (err) {
      if (requestId !== variantRequestIdRef.current) {
        return;
      }
      console.error('Failed to load product variants', err);
      notify('error', 'Unable to load item options. Please try again.');
    } finally {
      if (requestId === variantRequestIdRef.current) {
        setVariantLoading(false);
      }
    }
  }, [notify]);

  const addToCart = useCallback(async (product) => {
    // Variable price products: open the price modal instead of adding directly
    if (product.isVariablePrice) {
      setVariablePriceProduct(product);
      return;
    }
    if (hasExtendedOptions(product)) {
      await openVariantSelector(product);
      return;
    }
    addPreparedToCart({ 
      ...product, 
      cartKey: `${product.id}:base`, 
      productId: product.id, 
      displayName: product.name,
      description: null
    });
  }, [openVariantSelector, addPreparedToCart]);

  const addVariablePriceToCart = useCallback((product, customPrice, qty = 1) => {
    const uniqueKey = `${product.id}:vp_${Date.now()}`;
    for (let i = 0; i < qty; i++) {
      const entryKey = qty > 1 ? `${product.id}:vp_${Date.now()}_${i}` : uniqueKey;
      addPreparedToCart({
        ...product,
        productId: product.id,
        cartKey: entryKey,
        displayName: product.name,
        price: customPrice,
        is_custom_price: true,
        qty: 1,
        description: null
      });
    }
    setVariablePriceProduct(null);
  }, [addPreparedToCart]);

  const addVariantToCart = useCallback((variant, additionalItems = []) => {
    if (!variantProduct) return;
    if (variant) {
      const displayName = `${variantProduct.name} (${variant.label})`;
      addPreparedToCart({
        ...variantProduct,
        id: variantProduct.id,
        productId: variantProduct.id,
        variantId: variant.id,
        variantName: variant.label,
        name: displayName,
        displayName,
        price: variant.price,
        cartKey: `${variantProduct.id}:${variant.id}`,
        description: null
      });
    }

    if (Array.isArray(additionalItems) && additionalItems.length > 0) {
      additionalItems.forEach(item => addPreparedToCart(item));
    }

    setVariantProduct(null);
  }, [variantProduct, addPreparedToCart]);

  const syncVariantCart = useCallback((selectedVariants, additionalItems = []) => {
    if (!variantProduct) return;
    const productId = String(variantProduct.id);
    
    const nextVariantLines = (selectedVariants || [])
      .map((variant) => {
        const quantity = Math.max(0, Number(variant.quantity || 0));
        if (!quantity) return null;
        const displayName = `${variantProduct.name} (${variant.label})`;
        const key = `${variantProduct.id}:${variant.id}`;
        const existing = cart.find(item => cartKeyFor(item) === key);
        return {
          ...variantProduct,
          id: variantProduct.id,
          productId: variantProduct.id,
          variantId: variant.id,
          variantName: variant.label,
          name: displayName,
          displayName,
          price: variant.price,
          qty: quantity,
          cartKey: key,
          description: existing ? existing.description : null
        };
      })
      .filter(Boolean);

    setCart(prev => [
      ...prev.filter(item => !(String(item.productId || item.id) === productId && item.variantId)),
      ...nextVariantLines,
    ]);

    if (Array.isArray(additionalItems) && additionalItems.length > 0) {
      additionalItems.forEach(item => addPreparedToCart(item));
    }

    setVariantProduct(null);
  }, [variantProduct, addPreparedToCart]);

  const updateQty = useCallback((key, delta) => {
    setCart(prev => prev.map(item => {
      if (cartKeyFor(item) === String(key)) {
        return { ...item, qty: Math.max(0, Number(item.qty || 0) + delta) };
      }
      return item;
    }).filter(item => item.qty > 0));
  }, []);

  const decrementProduct = useCallback((event, product) => {
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    const line = baseProductCartLine(product);
    if (line) {
      updateQty(cartKeyFor(line), -1);
    }
  }, [baseProductCartLine, updateQty]);

  const incrementProduct = useCallback((event, product) => {
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    addPreparedToCart({ 
      ...product, 
      cartKey: `${product.id}:base`, 
      productId: product.id, 
      displayName: product.name,
      description: null
    });
  }, [addPreparedToCart]);

  const setProductQty = useCallback((product, newQty) => {
    const qty = Math.max(0, Number(newQty || 0));
    const key = `${product.id}:base`;
    setCart(prev => {
      if (qty === 0) {
        return prev.filter(item => cartKeyFor(item) !== key);
      }
      const exists = prev.find(item => cartKeyFor(item) === key);
      if (exists) {
        return prev.map(item =>
          cartKeyFor(item) === key ? { ...item, qty } : item
        );
      }
      return [...prev, {
        ...product,
        productId: product.id,
        cartKey: key,
        displayName: product.name,
        qty,
        description: null
      }];
    });
  }, []);

  const setItemDescription = useCallback((key, description) => {
    setCart(prev => prev.map(item =>
      cartKeyFor(item) === String(key)
        ? { ...item, description: description || null }
        : item
    ));
  }, []);

  const currentVariantQuantities = useMemo(() => {
    return variantProduct ? variantQuantityMap(variantProduct) : {};
  }, [variantProduct, variantQuantityMap]);

  return {
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
    addPreparedToCart,
  };
}
