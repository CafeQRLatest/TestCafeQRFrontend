import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PRODUCT_PAGE_SIZE } from '../../CounterSale/domain/counterSale.constants';
import { filterAndSearchProducts, getStandardMatches } from '../../CounterSale/domain/products';
import { fetchPosProducts } from '../services/posSaleApi';

/**
 * High-Performance POS Product Catalog Hook (V2)
 * 
 * Implements server-side keyset cursor pagination (50 products per page),
 * with fast category switching, debounced search, and multi-page navigation.
 */
export default function usePosProductCatalog({
  initialProducts = [],
  initialNextCursor = null,
  initialHasMore = false,
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

  // Server-side loaded products for the current page
  const [serverProducts, setServerProducts] = useState(() => initialProducts || []);
  const [cursors, setCursors] = useState(() => [null, initialNextCursor]);
  const [serverHasMore, setServerHasMore] = useState(() => Boolean(initialHasMore));
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Request sequence counter to discard stale out-of-order responses
  const requestIdRef = useRef(0);

  // Update initial products when bootstrap changes or updates
  const initialProductsLoadedRef = useRef(false);
  useEffect(() => {
    if (!initialProductsLoadedRef.current && initialProducts && initialProducts.length > 0) {
      initialProductsLoadedRef.current = true;
      setServerProducts(initialProducts);
      setCursors([null, initialNextCursor]);
      setServerHasMore(Boolean(initialHasMore));
    }
  }, [initialProducts, initialNextCursor, initialHasMore]);

  // Resolve Category ID or Name for server query
  const resolveCategoryParam = useCallback((cat) => {
    if (!cat || cat === 'ALL') return undefined;
    const found = (categoryBeans || []).find(
      b => b && (b.id === cat || String(b.name || '').toLowerCase() === String(cat).toLowerCase())
    );
    return found?.id || cat;
  }, [categoryBeans]);

  // Load product page via Server Keyset Cursor API
  const loadProductPage = useCallback(async ({ cat = activeCat, query = search, cursor = null, pageIndex = 0 }) => {
    const currentRequestId = ++requestIdRef.current;
    if (pageIndex === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const resolvedCategory = resolveCategoryParam(cat);
      const result = await fetchPosProducts({
        categoryId: resolvedCategory,
        search: query ? query.trim() : undefined,
        limit: PRODUCT_PAGE_SIZE || 50,
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
  }, [activeCat, search, resolveCategoryParam]);

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

  // Category Selection: Triggers server fetch for page 0 of that category
  const handleCategoryChange = useCallback((newCat) => {
    setActiveCat(newCat);
    setProductPage(0);
    setCursors([]);
    loadProductPage({ cat: newCat, query: search, cursor: null, pageIndex: 0 });
  }, [search, loadProductPage]);

  // Search Input Change: Debounced server fetch for page 0
  const debounceSearchRef = useRef(null);
  const handleSearchChange = useCallback((newSearch) => {
    setSearch(newSearch);
    setProductPage(0);
    if (debounceSearchRef.current) {
      clearTimeout(debounceSearchRef.current);
    }
    debounceSearchRef.current = setTimeout(() => {
      setCursors([]);
      loadProductPage({ cat: activeCat, query: newSearch, cursor: null, pageIndex: 0 });
    }, 250);
  }, [activeCat, loadProductPage]);

  // Next page navigation: loads next 50 products using keyset cursor
  const handleNextPage = useCallback(() => {
    const nextCursor = cursors[productPage + 1];
    if (serverHasMore && nextCursor) {
      loadProductPage({ cat: activeCat, query: search, cursor: nextCursor, pageIndex: productPage + 1 });
    }
  }, [productPage, cursors, serverHasMore, activeCat, search, loadProductPage]);

  // Prev page navigation: loads previous page using cached cursor
  const handlePrevPage = useCallback(() => {
    if (productPage > 0) {
      const prevCursor = productPage === 1 ? null : cursors[productPage - 1];
      loadProductPage({ cat: activeCat, query: search, cursor: prevCursor, pageIndex: productPage - 1 });
    }
  }, [productPage, cursors, activeCat, search, loadProductPage]);

  // Visible products on the current page (filtered by diet filter if active)
  const visibleProducts = useMemo(() => {
    if (dietFilter === 'ALL') {
      return serverProducts;
    }
    return filterAndSearchProducts({
      products: serverProducts,
      activeCat: 'ALL', // category is already queried on server
      dietFilter,
      search: '', // search is already queried on server
      trendingProductIds
    });
  }, [serverProducts, dietFilter, trendingProductIds]);

  const paginatedProducts = visibleProducts;

  // Standard matches for autocomplete search box
  const standardMatches = useMemo(() => {
    return getStandardMatches(serverProducts, search);
  }, [serverProducts, search]);

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
    PRODUCT_PAGE_SIZE: PRODUCT_PAGE_SIZE || 50,
    hasMore: serverHasMore,
    loadingProducts: loading,
    loadingMore,
    onNextPage: handleNextPage,
    onPrevPage: handlePrevPage,
  };
}
