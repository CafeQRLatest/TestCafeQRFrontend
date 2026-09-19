import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PRODUCT_PAGE_SIZE } from '../../CounterSale/domain/counterSale.constants';
import { getStandardMatches } from '../../CounterSale/domain/products';
import { isVegProduct } from '../../CounterSale/domain/cart';
import { fetchPosProducts } from '../services/posSaleApi';

/**
 * High-Performance POS Product Catalog Hook (V2)
 * 
 * Implements keyset/cursor pagination:
 * - Loads only 50 products initially (instead of dumping thousands)
 * - Fetches subsequent 50 products on demand via keyset pagination
 * - Anti-race condition request sequencing (requestIdRef)
 * - Debounces search (250ms)
 * - Bounded memory usage
 */
export default function usePosProductCatalog({
  initialProducts = [],
  trendingProductIds = [],
  config,
  categoryBeans = []
}) {
  const [activeCat, setActiveCat] = useState('ALL');
  const [dietFilter, setDietFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [productPage, setProductPage] = useState(0);
  const isCounterMode = config?.salesType === 'COUNTER' 
    || config?.defaultBillingUiMode === 'counter' 
    || config?.posProductListingEnabled === false;
  const [productListingOn, setProductListingOn] = useState(() => !isCounterMode);

  const hasInitialProducts = Array.isArray(initialProducts) && initialProducts.length > 0;

  // Server-side paginated products list
  const [products, setProducts] = useState(() => (hasInitialProducts ? initialProducts : []));
  const [cursors, setCursors] = useState([]); // Array of cursors: index 1 is cursor for page 1, etc.
  const [hasMore, setHasMore] = useState(() => (hasInitialProducts && initialProducts.length >= 50));
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Request sequence counter to avoid out-of-order race conditions
  const requestIdRef = useRef(0);
  const initialFetchDoneRef = useRef(false);

  // Keep in sync with initialProducts if they arrive later (e.g. async bootstrap completion)
  useEffect(() => {
    if (Array.isArray(initialProducts) && initialProducts.length > 0 && products.length === 0) {
      setProducts(initialProducts);
      if (initialProducts.length >= 50) {
        setHasMore(true);
      }
    }
  }, [initialProducts, products.length]);

  // Fetch page with sequence protection and cursor
  const loadProductPage = useCallback(async ({ cat = activeCat, query = search, cursor = null, pageIndex = 0 }) => {
    const currentRequestId = ++requestIdRef.current;
    if (pageIndex === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      let resolvedCategory = undefined;
      if (cat && cat !== 'ALL') {
        const found = (categoryBeans || []).find(
          b => b && (b.id === cat || String(b.name || '').toLowerCase() === String(cat).toLowerCase())
        );
        resolvedCategory = found?.id || cat;
      }

      const result = await fetchPosProducts({
        categoryId: resolvedCategory,
        search: query ? query.trim() : undefined,
        limit: 50,
        cursor: cursor || undefined
      });

      if (currentRequestId !== requestIdRef.current) {
        return; // Discard stale request
      }

      const items = result.items || [];
      setProducts(items);
      setHasMore(Boolean(result.hasMore));
      setProductPage(pageIndex);

      if (result.nextCursor) {
        setCursors(prev => {
          const next = [...prev];
          next[pageIndex + 1] = result.nextCursor;
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to load POS products page', err);
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [activeCat, search, categoryBeans]);

  // Fetch page 0 on mount only if initialProducts were not already supplied
  useEffect(() => {
    if (!initialFetchDoneRef.current) {
      initialFetchDoneRef.current = true;
      if (hasInitialProducts) {
        return;
      }
      const isCounter = config?.salesType === 'COUNTER' || config?.defaultBillingUiMode === 'counter';
      if (!isCounter) {
        loadProductPage({ cat: activeCat, query: search, cursor: null, pageIndex: 0 });
      }
    }
  }, [hasInitialProducts, loadProductPage, activeCat, search, config]);

  // Sync product listing visibility strictly from configuration
  useEffect(() => {
    if (config) {
      const isCounter = config?.salesType === 'COUNTER' 
        || config?.defaultBillingUiMode === 'counter' 
        || config?.posProductListingEnabled === false;
      setProductListingOn(!isCounter);
    }
  }, [config]);

  const handleToggleProductListing = useCallback((enabled) => {
    setProductListingOn(enabled);
  }, []);

  // Reset and fetch page 0 when category changes
  const handleCategoryChange = useCallback((newCat) => {
    setActiveCat(newCat);
    setCursors([]);
    setProductPage(0);
    loadProductPage({ cat: newCat, query: search, cursor: null, pageIndex: 0 });
  }, [search, loadProductPage]);

  // Debounced search handler
  const debounceSearchRef = useRef(null);
  const handleSearchChange = useCallback((newSearch) => {
    setSearch(newSearch);
    if (debounceSearchRef.current) {
      clearTimeout(debounceSearchRef.current);
    }
    debounceSearchRef.current = setTimeout(() => {
      setCursors([]);
      setProductPage(0);
      loadProductPage({ cat: activeCat, query: newSearch, cursor: null, pageIndex: 0 });
    }, 250);
  }, [activeCat, loadProductPage]);

  // Next page navigation
  const handleNextPage = useCallback(() => {
    const nextCursor = cursors[productPage + 1];
    if (hasMore && nextCursor) {
      loadProductPage({ cat: activeCat, query: search, cursor: nextCursor, pageIndex: productPage + 1 });
    }
  }, [cursors, productPage, hasMore, activeCat, search, loadProductPage]);

  // Prev page navigation
  const handlePrevPage = useCallback(() => {
    if (productPage > 0) {
      const prevCursor = productPage === 1 ? null : cursors[productPage - 1];
      loadProductPage({ cat: activeCat, query: search, cursor: prevCursor, pageIndex: productPage - 1 });
    }
  }, [cursors, productPage, activeCat, search, loadProductPage]);

  // Diet filter (client-side slice filter)
  const visibleProducts = useMemo(() => {
    if (dietFilter === 'ALL') return products;
    if (dietFilter === 'VEG') {
      return products.filter(p => isVegProduct(p));
    }
    if (dietFilter === 'TRENDING') {
      return Array.isArray(trendingProductIds) && trendingProductIds.length
        ? products.filter(p => trendingProductIds.includes(String(p.id)))
        : products.slice(0, 12);
    }
    return products;
  }, [products, dietFilter, trendingProductIds]);

  const standardMatches = useMemo(() => {
    return getStandardMatches(products, search);
  }, [products, search]);

  const addFromStandardSearch = useCallback(async (product, addToCart, searchRef) => {
    if (typeof addToCart === 'function') {
      await addToCart(product);
    }
    setSearch('');
    if (searchRef && searchRef.current) {
      searchRef.current.focus();
    }
  }, []);

  return {
    activeCat,
    setActiveCat: handleCategoryChange,
    dietFilter,
    setDietFilter,
    search,
    setSearch: handleSearchChange,
    productPage,
    setProductPage,
    productListingOn,
    setProductListingOn,
    handleToggleProductListing,
    visibleProducts,
    paginatedProducts: visibleProducts, // Each page is already 50 items from backend!
    standardMatches,
    addFromStandardSearch,
    PRODUCT_PAGE_SIZE,
    hasMore,
    loadingProducts: loading,
    loadingMore,
    onNextPage: handleNextPage,
    onPrevPage: handlePrevPage,
  };
}
