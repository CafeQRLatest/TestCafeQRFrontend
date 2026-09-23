import { useState, useEffect, useRef } from 'react';
import * as api from '../services/posSaleApi';
import httpApi from '../../../utils/api';
import { extractUniqueCategories } from '../../CounterSale/domain/products';
import { getPosCachedBootstrap, savePosCachedBootstrap } from '../services/posIndexedDb';

// Organization-scoped cache to persist bootstrap across mounts (session RAM)
const sessionBootstrapCache = new Map();

function isAbortError(err) {
  return (
    err?.name === 'CanceledError' ||
    err?.name === 'AbortError' ||
    err?.code === 'ERR_CANCELED'
  );
}

function formatSortedCategories(list) {
  if (!Array.isArray(list) || list.length === 0) return ['ALL'];
  const names = list.map(c => (typeof c === 'string' ? c : c?.name)).filter(Boolean);
  const sortedUnique = Array.from(new Set(names)).sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
  );
  return ['ALL', ...sortedUnique];
}

function sortCategoryBeans(list) {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) =>
    String(a?.name || a || '').localeCompare(String(b?.name || b || ''), undefined, { numeric: true, sensitivity: 'base' })
  );
}

function sortProducts(products) {
  if (!Array.isArray(products) || products.length === 0) return [];
  return [...products].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );
}

/**
 * Applies bootstrap data to all React state setters.
 * Shared by both IndexedDB hydration and API refresh paths.
 */
function hydrateStateFromBootstrap(bootstrap, setters, initialCreditCustomersRef, controller) {
  if (!bootstrap) return;

  const {
    setProducts, setCategoryBeans, setCategories, setTables,
    setPaymentModes, setConfig, setDefaultPricelistId,
    setAllCustomers, setCreditCustomers, setNextCursor, setHasMore,
  } = setters;

  // Products
  const sortedProducts = sortProducts(bootstrap.products);
  setProducts(sortedProducts);
  setNextCursor(bootstrap.nextCursor || null);
  setHasMore(Boolean(bootstrap.hasMore));

  // Categories
  if (bootstrap.categories && bootstrap.categories.length > 0) {
    const sortedBeans = sortCategoryBeans(bootstrap.categories);
    setCategoryBeans(sortedBeans);
    setCategories(formatSortedCategories(sortedBeans));
  } else {
    setCategoryBeans([]);
    setCategories(extractUniqueCategories(sortedProducts));
  }

  // Tables
  setTables(bootstrap.tables || []);

  // Payment Modes
  setPaymentModes(bootstrap.paymentModes || []);

  // Configuration
  const effectiveConfig = bootstrap.configuration || bootstrap.configurations;
  if (effectiveConfig) {
    setConfig(effectiveConfig);
  }

  // Pricelists
  const pricelists = bootstrap.pricelists || [];
  if (pricelists.length > 0) {
    const defPricelist =
      pricelists.find((p) => p.isDefault === true || p.is_default === true) || pricelists[0];
    if (defPricelist) {
      setDefaultPricelistId(defPricelist.id);
    }
  }

  // Customers
  if (bootstrap.customers) {
    setAllCustomers(bootstrap.customers);
  }

  // Credit Customers
  if (initialCreditCustomersRef?.current && initialCreditCustomersRef.current.length > 0) {
    setCreditCustomers(initialCreditCustomersRef.current);
  } else if (bootstrap.creditCustomers && bootstrap.creditCustomers.length > 0) {
    setCreditCustomers(bootstrap.creditCustomers);
  }

  return effectiveConfig;
}

/**
 * POS Sale V2 Bootstrap Hook
 *
 * Three-tier caching with Stale-While-Revalidate (SWR):
 *   1. Session RAM cache (instant on re-mount within same tab session)
 *   2. IndexedDB persistent cache (instant 0ms cold-start on browser reopen)
 *   3. API fetch (background revalidation, persists to IndexedDB + session RAM)
 */
export default function usePosSaleBootstrap({ orgId, propConfig, initialCreditCustomers, initialBootstrap = null }) {
  const orgKey = String(orgId || '');

  // Pre-seed cache if initialBootstrap is supplied from page
  if (initialBootstrap && !sessionBootstrapCache.has(orgKey)) {
    sessionBootstrapCache.set(orgKey, initialBootstrap);
  }

  const cached = initialBootstrap || sessionBootstrapCache.get(orgKey);

  const [products, setProducts] = useState(() => {
    if (!cached?.products) return [];
    return sortProducts(cached.products);
  });
  const [categoryBeans, setCategoryBeans] = useState(() => sortCategoryBeans(cached?.categories));
  const [categories, setCategories] = useState(() => {
    if (cached?.categories && cached.categories.length > 0) {
      return formatSortedCategories(cached.categories);
    }
    if (cached?.products && cached.products.length > 0) {
      return extractUniqueCategories(cached.products);
    }
    return ['ALL'];
  });
  const [tables, setTables] = useState(() => cached?.tables || []);
  const [paymentModes, setPaymentModes] = useState(() => cached?.paymentModes || []);
  const [config, setConfig] = useState(
    () => propConfig || cached?.configuration || cached?.configurations || null
  );
  const [allCustomers, setAllCustomers] = useState(() => cached?.customers || []);
  const [creditCustomers, setCreditCustomers] = useState(() => {
    if (Array.isArray(initialCreditCustomers)) return initialCreditCustomers;
    return cached?.creditCustomers || [];
  });
  const [defaultPricelistId, setDefaultPricelistId] = useState(() => {
    const pl = cached?.pricelists || [];
    const def = pl.find((p) => p.isDefault === true || p.is_default === true) || pl[0];
    return def?.id || null;
  });
  const [nextCursor, setNextCursor] = useState(() => cached?.nextCursor || null);
  const [hasMore, setHasMore] = useState(() => Boolean(cached?.hasMore));
  const [loading, setLoading] = useState(() => !cached);
  const [loadError, setLoadError] = useState('');
  const [metadataWarnings, setMetadataWarnings] = useState([]);

  const propConfigRef = useRef(propConfig);
  const initialCreditCustomersRef = useRef(initialCreditCustomers);
  const hasConsumedInitialRef = useRef(Boolean(initialBootstrap));

  useEffect(() => {
    propConfigRef.current = propConfig;
  }, [propConfig]);

  useEffect(() => {
    initialCreditCustomersRef.current = initialCreditCustomers;
  }, [initialCreditCustomers]);

  // Shared setters object for hydrateStateFromBootstrap
  const stateSetters = {
    setProducts, setCategoryBeans, setCategories, setTables,
    setPaymentModes, setConfig, setDefaultPricelistId,
    setAllCustomers, setCreditCustomers, setNextCursor, setHasMore,
  };

  // Single-call bootstrap with 3-tier SWR (Session RAM → IndexedDB → API)
  useEffect(() => {
    // If initialBootstrap was already provided and loaded by parent, bypass duplicate network call
    if (hasConsumedInitialRef.current) {
      hasConsumedInitialRef.current = false;
      return;
    }

    const controller = new AbortController();
    let active = true;

    const currentCached = sessionBootstrapCache.get(orgKey);

    // Internet Check: If device is offline, block POS screen immediately
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLoadError('No internet connection. POS requires an active network connection to operate.');
      setProducts([]);
      setLoading(false);
      return;
    }

    // If no session RAM cache, try IndexedDB first for instant cold-start
    if (!currentCached) {
      setLoadError('');
      setMetadataWarnings([]);

      // Phase 1: Instantly hydrate from IndexedDB (0ms perceived load)
      getPosCachedBootstrap(orgKey).then((idbData) => {
        if (!active) return;

        // Double check internet status before rendering cached data
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setLoadError('No internet connection. POS requires an active network connection to operate.');
          setProducts([]);
          setLoading(false);
          return;
        }

        if (idbData) {
          // Hydrate state from persistent IndexedDB cache immediately
          hydrateStateFromBootstrap(idbData, stateSetters, initialCreditCustomersRef);
          sessionBootstrapCache.set(orgKey, idbData);
          setLoading(false);
        } else {
          // No IndexedDB cache — show loading state
          setProducts([]);
          setCategoryBeans([]);
          setCategories(['ALL']);
          setTables([]);
          setPaymentModes([]);
          setAllCustomers([]);
          setCreditCustomers(
            Array.isArray(initialCreditCustomersRef.current)
              ? initialCreditCustomersRef.current
              : []
          );
          setDefaultPricelistId(null);
          setLoading(true);
        }
      }).catch(() => {
        // IndexedDB unavailable — fall through to API
        if (active) setLoading(true);
      });
    } else {
      setLoadError('');
      setMetadataWarnings([]);
    }

    // Phase 2: Background API revalidation (always runs to keep data fresh)
    const revalidateFromApi = async () => {
      const signalOption = { signal: controller.signal };

      try {
        const bootstrap = await api.fetchSalesScreenDetails(signalOption);

        if (!active || !bootstrap) return;

        // Update session RAM cache
        sessionBootstrapCache.set(orgKey, bootstrap);

        // Hydrate React state with fresh data
        const effectiveConfig = hydrateStateFromBootstrap(
          bootstrap, stateSetters, initialCreditCustomersRef, controller
        );

        // Credit customers fallback
        if (
          (!initialCreditCustomersRef.current || initialCreditCustomersRef.current.length === 0) &&
          (!bootstrap.creditCustomers || bootstrap.creditCustomers.length === 0) &&
          effectiveConfig?.creditEnabled
        ) {
          try {
            const { data } = await httpApi.get('/api/v1/credit/customers', {
              params: { status: 'ACTIVE' },
              signal: controller.signal
            });
            if (active && data?.data) {
              setCreditCustomers(data.data);
            }
          } catch (_) {}
        }

        setLoading(false);

        // Phase 3: Persist fresh data to IndexedDB for next cold-start
        savePosCachedBootstrap(orgKey, bootstrap).catch(() => {});

      } catch (err) {
        if (!active || isAbortError(err)) return;

        console.error('Failed to bootstrap POS Sale V2 data (network/server error):', err);
        // Internet or backend is unreachable: Block POS screen even if IndexedDB has old data
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        setLoadError(
          isOffline
            ? 'No internet connection. POS requires an active network connection to operate.'
            : 'Unable to connect to server. Please check your network connection and try again.'
        );
        // Clear products and session cache so stale data is not displayed
        setProducts([]);
        sessionBootstrapCache.delete(orgKey);
        setLoading(false);
      }
    };

    revalidateFromApi();

    return () => {
      active = false;
      controller.abort();
    };
  }, [orgKey]);

  // Sync propConfig updates passively
  useEffect(() => {
    if (propConfig) {
      setConfig(propConfig);
    }
  }, [propConfig]);

  // Sync initialCreditCustomers updates passively
  useEffect(() => {
    if (initialCreditCustomers) {
      setCreditCustomers(initialCreditCustomers);
    }
  }, [initialCreditCustomers]);

  const refreshCategories = async () => {
    try {
      const resp = await httpApi.get('/api/v1/products/categories');
      if (resp.data?.success && Array.isArray(resp.data?.data)) {
        const catList = resp.data.data.filter(c => c && c.isActive !== false);
        const sortedBeans = sortCategoryBeans(catList);
        setCategoryBeans(sortedBeans);
        setCategories(formatSortedCategories(sortedBeans));
      }
    } catch (err) {
      console.warn("Failed to refresh categories:", err);
    }
  };

  const refreshBootstrap = async () => {
    try {
      sessionBootstrapCache.delete(orgKey);
      const bootstrap = await api.fetchSalesScreenDetails();
      if (bootstrap) {
        sessionBootstrapCache.set(orgKey, bootstrap);
        if (bootstrap.categories && bootstrap.categories.length > 0) {
          const sortedBeans = sortCategoryBeans(bootstrap.categories);
          setCategoryBeans(sortedBeans);
          setCategories(formatSortedCategories(sortedBeans));
        }
        if (bootstrap.products) {
          setProducts(sortProducts(bootstrap.products));
        }
        if (bootstrap.tables) {
          setTables(bootstrap.tables);
        }
        // Persist refreshed data to IndexedDB
        savePosCachedBootstrap(orgKey, bootstrap).catch(() => {});
      }
    } catch (err) {
      console.warn("Failed to refresh bootstrap:", err);
    }
  };

  return {
    products,
    setProducts,
    nextCursor,
    hasMore,
    config,
    allCustomers,
    setAllCustomers,
    creditCustomers,
    setCreditCustomers,
    defaultPricelistId,
    categories,
    setCategories,
    categoryBeans,
    setCategoryBeans,
    tables,
    paymentModes,
    loading,
    loadError,
    metadataWarnings,
    refreshCategories,
    refreshBootstrap,
  };
}

