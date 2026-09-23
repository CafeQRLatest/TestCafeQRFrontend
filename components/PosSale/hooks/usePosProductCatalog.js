import { useState, useEffect, useMemo, useCallback } from 'react';
import { PRODUCT_PAGE_SIZE } from '../../CounterSale/domain/counterSale.constants';

function isSellableProduct(product) {
  if (!product || product.isActive === false || product.isactive === 'N') {
    return false;
  }
  return !(
    product.isIngredient === true ||
    product.is_ingredient === true ||
    String(product.isIngredient).toUpperCase() === 'Y' ||
    String(product.is_ingredient).toUpperCase() === 'Y'
  );
}

function createProductIndex(product) {
  const catName = String(product.categoryName || product.category?.name || '').trim().toLowerCase();
  const catId = String(product.categoryId || product.category?.id || '').trim().toLowerCase();
  const name = String(product.name || '').toLowerCase();
  const code = String(product.productCode || '').toLowerCase();
  const barcode = String(product.barcode || '').toLowerCase();
  const isVeg = product.productType === 'VEG' || product.product_type === 'VEG' || product.isVeg === true;

  return {
    product,
    idStr: String(product.id || ''),
    name,
    code,
    barcode,
    catName,
    catId,
    isVeg
  };
}

/**
 * In-memory POS product catalog.
 *
 * Products are loaded from the bootstrap/session cache.
 * Category, diet and search filtering are performed locally with an indexed
 * search cache without additional API requests.
 */
export default function usePosProductCatalog({
  initialProducts = [],
  trendingProductIds = [],
  config
}) {
  const [activeCat, setActiveCat] = useState('ALL');
  const [dietFilter, setDietFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [productPage, setProductPage] = useState(0);

  const isCounterMode = config?.salesType === 'COUNTER' 
    || config?.defaultBillingUiMode === 'counter' 
    || config?.posProductListingEnabled === false;
  const [productListingOn, setProductListingOn] = useState(() => !isCounterMode);

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

  // Category Selection: Instant in-memory switch
  const handleCategoryChange = useCallback((newCat) => {
    setActiveCat(newCat);
    setProductPage(0);
  }, []);

  // Diet Filter Selection: Instant in-memory switch
  const handleDietFilterChange = useCallback((newDiet) => {
    setDietFilter(newDiet);
    setProductPage(0);
  }, []);

  // Search Input Change: Instant in-memory filter
  const handleSearchChange = useCallback((newSearch) => {
    setSearch(newSearch);
    setProductPage(0);
  }, []);

  // ── O(1) Trending IDs Lookup Set ──
  const trendingIdSet = useMemo(() => {
    if (!Array.isArray(trendingProductIds) || trendingProductIds.length === 0) {
      return new Set();
    }
    return new Set(trendingProductIds.map(String));
  }, [trendingProductIds]);

  // ── Normalized Product Search Index ──
  // Pre-computes normalized strings once per catalog reference change
  const indexedProducts = useMemo(() => {
    if (!Array.isArray(initialProducts) || initialProducts.length === 0) return [];
    return initialProducts
      .filter(isSellableProduct)
      .map(createProductIndex);
  }, [initialProducts]);

  // Fast In-Memory Filtered Product Catalog
  const visibleProducts = useMemo(() => {
    if (indexedProducts.length === 0) return [];
    
    const term = String(search || '').trim().toLowerCase();
    const catStr = String(activeCat || 'ALL').trim().toLowerCase();
    const isAllCat = !catStr || catStr === 'all';

    const result = [];
    for (let i = 0; i < indexedProducts.length; i++) {
      const item = indexedProducts[i];
      
      // Category match
      if (!isAllCat && item.catName !== catStr && item.catId !== catStr) {
        continue;
      }

      // Search match (exact barcode match prioritized, then name/code substring)
      if (term) {
        const isBarcodeMatch = item.barcode && item.barcode === term;
        const isTextMatch = item.name.includes(term) || item.code.includes(term);
        if (!isBarcodeMatch && !isTextMatch) {
          continue;
        }
      }

      // Diet filter match
      if (dietFilter === 'VEG' && !item.isVeg) {
        continue;
      }

      if (dietFilter === 'TRENDING') {
        if (!trendingIdSet.has(item.idStr)) {
          continue;
        }
      }

      result.push(item.product);
    }
    return result;
  }, [indexedProducts, activeCat, dietFilter, search, trendingIdSet]);

  const pageSize = PRODUCT_PAGE_SIZE || 50;

  const paginatedProducts = useMemo(() => {
    const start = productPage * pageSize;
    return visibleProducts.slice(start, start + pageSize);
  }, [visibleProducts, productPage, pageSize]);

  const hasMore = (productPage + 1) * pageSize < visibleProducts.length;

  const handleNextPage = useCallback(() => {
    if (hasMore) {
      setProductPage((p) => p + 1);
    }
  }, [hasMore]);

  const handlePrevPage = useCallback(() => {
    setProductPage((p) => Math.max(0, p - 1));
  }, []);

  // Standard matches for autocomplete search box with early exit
  const standardMatches = useMemo(() => {
    const term = String(search || '').trim().toLowerCase();
    if (!term || indexedProducts.length === 0) return [];
    
    const matches = [];
    for (let i = 0; i < indexedProducts.length; i++) {
      const item = indexedProducts[i];
      if (item.barcode === term || item.name.includes(term) || item.code.includes(term)) {
        matches.push(item.product);
        if (matches.length >= 12) break; // early exit
      }
    }
    return matches;
  }, [indexedProducts, search]);

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
    setDietFilter: handleDietFilterChange,
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
    PRODUCT_PAGE_SIZE: pageSize,
    hasMore,
    loadingProducts: false,
    loadingMore: false,
    onNextPage: handleNextPage,
    onPrevPage: handlePrevPage,
  };
}



