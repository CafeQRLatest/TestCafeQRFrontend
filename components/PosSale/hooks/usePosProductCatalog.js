import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PRODUCT_PAGE_SIZE } from '../../CounterSale/domain/counterSale.constants';
import { filterAndSearchProducts, getStandardMatches } from '../../CounterSale/domain/products';
import { isVegProduct } from '../../CounterSale/domain/cart';
import { fetchPosProducts } from '../services/posSaleApi';

/**
 * High-Performance POS Product Catalog Hook (V2)
 * 
 * Provides instant zero-latency client-side filtering for category, search, and diet filters,
 * with hybrid server-side cursor pagination support for large catalogs (>50 products).
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

  // Server-side paginated products list (used when initialProducts is empty or server keyset is active)
  const [serverProducts, setServerProducts] = useState([]);
  const [cursors, setCursors] = useState([]);
  const [serverHasMore, setServerHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Request sequence counter to avoid out-of-order race conditions
  const requestIdRef = useRef(0);
  const initialFetchDoneRef = useRef(false);

  // Active pool of products: prefer initialProducts if available, otherwise serverProducts
  const poolProducts = useMemo(() => {
    if (Array.isArray(initialProducts) && initialProducts.length > 0) {
      return initialProducts;
    }
    return serverProducts;
  }, [initialProducts, serverProducts]);

  // Fetch page with sequence protection and cursor (for server-paginated catalogs)
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
      setServerProducts(items);
      setServerHasMore(Boolean(result.hasMore));
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

  // Fetch page 0 on mount only if initialProducts were not supplied
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

  // Filter products by category, search text, and diet filter
  const visibleProducts = useMemo(() => {
    return filterAndSearchProducts({
      products: poolProducts,
      activeCat,
      dietFilter,
      search,
      trendingProductIds
    });
  }, [poolProducts, activeCat, dietFilter, search, trendingProductIds]);

  // Paginated visible products slice
  const paginatedProducts = useMemo(() => {
    const start = productPage * PRODUCT_PAGE_SIZE;
    return visibleProducts.slice(start, start + PRODUCT_PAGE_SIZE);
  }, [visibleProducts, productPage]);

  // Calculate hasMore accurately
  const hasMore = useMemo(() => {
    if (hasInitialProducts) {
      return (productPage + 1) * PRODUCT_PAGE_SIZE < visibleProducts.length;
    }
    return serverHasMore;
  }, [hasInitialProducts, productPage, visibleProducts.length, serverHasMore]);

  // Reset page index on filter updates
  useEffect(() => {
    setProductPage(0);
  }, [activeCat, dietFilter, search]);

  // Reset and fetch page 0 when category changes
  const handleCategoryChange = useCallback((newCat) => {
    setActiveCat(newCat);
    setProductPage(0);
    if (!hasInitialProducts) {
      setCursors([]);
      loadProductPage({ cat: newCat, query: search, cursor: null, pageIndex: 0 });
    }
  }, [search, loadProductPage, hasInitialProducts]);

  // Debounced search handler
  const debounceSearchRef = useRef(null);
  const handleSearchChange = useCallback((newSearch) => {
    setSearch(newSearch);
    setProductPage(0);
    if (!hasInitialProducts) {
      if (debounceSearchRef.current) {
        clearTimeout(debounceSearchRef.current);
      }
      debounceSearchRef.current = setTimeout(() => {
        setCursors([]);
        loadProductPage({ cat: activeCat, query: newSearch, cursor: null, pageIndex: 0 });
      }, 250);
    }
  }, [activeCat, loadProductPage, hasInitialProducts]);

  // Next page navigation
  const handleNextPage = useCallback(() => {
    if (hasInitialProducts) {
      if ((productPage + 1) * PRODUCT_PAGE_SIZE < visibleProducts.length) {
        setProductPage(p => p + 1);
      }
    } else {
      const nextCursor = cursors[productPage + 1];
      if (serverHasMore && nextCursor) {
        loadProductPage({ cat: activeCat, query: search, cursor: nextCursor, pageIndex: productPage + 1 });
      }
    }
  }, [hasInitialProducts, productPage, visibleProducts.length, cursors, serverHasMore, activeCat, search, loadProductPage]);

  // Prev page navigation
  const handlePrevPage = useCallback(() => {
    if (productPage > 0) {
      if (hasInitialProducts) {
        setProductPage(p => p - 1);
      } else {
        const prevCursor = productPage === 1 ? null : cursors[productPage - 1];
        loadProductPage({ cat: activeCat, query: search, cursor: prevCursor, pageIndex: productPage - 1 });
      }
    }
  }, [hasInitialProducts, productPage, cursors, activeCat, search, loadProductPage]);

  // Standard matches for autocomplete search box
  const standardMatches = useMemo(() => {
    return getStandardMatches(poolProducts, search);
  }, [poolProducts, search]);

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
    paginatedProducts,
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
