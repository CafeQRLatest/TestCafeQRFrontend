import { useState, useEffect, useRef } from 'react';
import * as api from '../services/posSaleApi';
import httpApi from '../../../utils/api';
import { extractUniqueCategories } from '../../CounterSale/domain/products';

// Organization-scoped cache to persist bootstrap across mounts
const sessionBootstrapCache = new Map();

function isAbortError(err) {
  return (
    err?.name === 'CanceledError' ||
    err?.name === 'AbortError' ||
    err?.code === 'ERR_CANCELED'
  );
}

/**
 * POS Sale V2 Bootstrap Hook
 * 
 * Single-call bootstrap that fetches all POS data from /api/v1/pos/sale/sales-screen-details
 * instead of firing multiple separate API requests.
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
    return [...cached.products].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' })
    );
  });
  const [categoryBeans, setCategoryBeans] = useState(() => cached?.categories || []);
  const [categories, setCategories] = useState(() => {
    if (cached?.categories && cached.categories.length > 0) {
      const names = cached.categories.map(c => typeof c === 'string' ? c : c.name).filter(Boolean);
      return ['ALL', ...new Set(names)];
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

  // Single-call bootstrap with SWR
  useEffect(() => {
    // If initialBootstrap was already provided and loaded by parent, bypass duplicate network call
    if (hasConsumedInitialRef.current) {
      hasConsumedInitialRef.current = false;
      return;
    }

    const controller = new AbortController();
    let active = true;

    const currentCached = sessionBootstrapCache.get(orgKey);
    if (!currentCached) {
      // Clear state only on fresh un-cached mount
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
    setLoadError('');
    setMetadataWarnings([]);

    const loadData = async () => {
      const signalOption = { signal: controller.signal };

      try {
        // ── SINGLE API CALL fetches sales screen details ──
        const bootstrap = await api.fetchSalesScreenDetails(signalOption);

        if (!active || !bootstrap) return;

        // Cache the bootstrap for SWR on re-mount
        sessionBootstrapCache.set(orgKey, bootstrap);

        // ── Products (sorted alphabetically) ──
        const productList = bootstrap.products || [];
        const sortedProducts = [...productList].sort((a, b) =>
          String(a.name || '').localeCompare(String(b.name || ''), undefined, {
            numeric: true,
            sensitivity: 'base',
          })
        );
        setProducts(sortedProducts);

        // ── Categories ──
        if (bootstrap.categories && bootstrap.categories.length > 0) {
          setCategoryBeans(bootstrap.categories);
          const names = bootstrap.categories.map(c => typeof c === 'string' ? c : c.name).filter(Boolean);
          setCategories(['ALL', ...new Set(names)]);
        } else {
          setCategoryBeans([]);
          setCategories(extractUniqueCategories(sortedProducts));
        }

        // ── Tables ──
        setTables(bootstrap.tables || []);

        // ── Payment Modes ──
        setPaymentModes(bootstrap.paymentModes || []);

        // ── Configuration ──
        const effectiveConfig = bootstrap.configuration || bootstrap.configurations;
        if (effectiveConfig) {
          setConfig(effectiveConfig);
        }

        // ── Pricelists ──
        const pricelists = bootstrap.pricelists || [];
        if (pricelists.length > 0) {
          const defPricelist =
            pricelists.find(
              (p) => p.isDefault === true || p.is_default === true
            ) || pricelists[0];
          if (defPricelist) {
            setDefaultPricelistId(defPricelist.id);
          }
        }

        // ── Customers ──
        if (bootstrap.customers) {
          setAllCustomers(bootstrap.customers);
        }

        // ── Credit Customers (prefer prop if provided) ──
        if (initialCreditCustomersRef.current && initialCreditCustomersRef.current.length > 0) {
          setCreditCustomers(initialCreditCustomersRef.current);
        } else if (bootstrap.creditCustomers && bootstrap.creditCustomers.length > 0) {
          setCreditCustomers(bootstrap.creditCustomers);
        } else if (effectiveConfig?.creditEnabled) {
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
      } catch (err) {
        if (!active || isAbortError(err)) return;

        console.error('Failed to bootstrap POS Sale V2 data', err);
        setLoadError('Failed to load POS data. Please refresh and try again.');
        setLoading(false);
      }
    };

    loadData();

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
        setCategoryBeans(catList);
        const names = catList.map(c => c.name).filter(Boolean);
        setCategories(['ALL', ...new Set(names)]);
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
          setCategoryBeans(bootstrap.categories);
          const names = bootstrap.categories.map(c => typeof c === 'string' ? c : c.name).filter(Boolean);
          setCategories(['ALL', ...new Set(names)]);
        }
        if (bootstrap.products) {
          const sortedProducts = [...bootstrap.products].sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''), undefined, {
              numeric: true,
              sensitivity: 'base',
            })
          );
          setProducts(sortedProducts);
        }
        if (bootstrap.tables) {
          setTables(bootstrap.tables);
        }
      }
    } catch (err) {
      console.warn("Failed to refresh bootstrap:", err);
    }
  };

  return {
    products,
    setProducts,
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
