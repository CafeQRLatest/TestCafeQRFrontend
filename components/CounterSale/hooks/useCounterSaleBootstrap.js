import { useState, useEffect, useRef } from 'react';
import * as api from '../services/counterSaleApi';
import { extractUniqueCategories } from '../domain/products';

// Organization-scoped caches to persist configurations and pricelists across mounts
const sessionConfigCache = new Map();
const sessionPricelistCache = new Map();

// Test-only reset utility
export function resetBootstrapCaches() {
  sessionConfigCache.clear();
  sessionPricelistCache.clear();
}

function isAbortError(err) {
  return (
    err?.name === 'CanceledError' ||
    err?.name === 'AbortError' ||
    err?.code === 'ERR_CANCELED'
  );
}

function loadOptionalMetadata({
  request,
  active,
  onSuccess,
  onWarning,
  warningMessage
}) {
  return request
    .then(data => {
      if (active()) {
        onSuccess(data);
      }
    })
    .catch(err => {
      if (isAbortError(err)) {
        return;
      }
      console.warn(warningMessage, err);
      if (active()) {
        onWarning();
      }
    });
}

export default function useCounterSaleBootstrap({ orgId, propConfig, initialCreditCustomers }) {
  const orgKey = String(orgId || '');

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['ALL']);
  const [config, setConfig] = useState(
    () => propConfig || sessionConfigCache.get(orgKey) || null
  );
  const [allCustomers, setAllCustomers] = useState([]);
  const [creditCustomers, setCreditCustomers] = useState([]);
  const [defaultPricelistId, setDefaultPricelistId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  
  // Track metadata partial failures for diagnostic visibility
  const [metadataWarnings, setMetadataWarnings] = useState([]);

  const propConfigRef = useRef(propConfig);
  const initialCreditCustomersRef = useRef(initialCreditCustomers);

  useEffect(() => {
    propConfigRef.current = propConfig;
  }, [propConfig]);

  useEffect(() => {
    initialCreditCustomersRef.current = initialCreditCustomers;
  }, [initialCreditCustomers]);

  // Load core POS data
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    
    // Clear tenant-owned state immediately on orgKey transition to guarantee strict tenant isolation
    setProducts([]);
    setCategories(['ALL']);
    setAllCustomers([]);
    setCreditCustomers(
      Array.isArray(initialCreditCustomersRef.current)
        ? initialCreditCustomersRef.current
        : []
    );
    setDefaultPricelistId(null);
    setConfig(
      propConfigRef.current ||
      sessionConfigCache.get(orgKey) ||
      null
    );

    setLoading(true);
    setLoadError('');
    setMetadataWarnings([]);

    const loadData = async () => {
      const signalOption = { signal: controller.signal };
      const isActive = () => active;

      try {
        const currentPropConfig = propConfigRef.current;
        const currentCreditCustomers = initialCreditCustomersRef.current;

        // Core promise: always fetch products freshly
        const productsPromise = api.fetchProducts(signalOption);

        // Configuration handling with Stale-While-Revalidate (SWR) cache
        let configPromise = null;
        const cachedConfig = sessionConfigCache.get(orgKey);

        if (currentPropConfig) {
          sessionConfigCache.set(orgKey, currentPropConfig);
          configPromise = Promise.resolve(currentPropConfig);
        } else if (cachedConfig) {
          // SWR: Resolve from cache immediately, and revalidate in background
          setConfig(cachedConfig);
          
          api.fetchConfigurations(signalOption)
            .then(freshConfig => {
              if (active && freshConfig) {
                sessionConfigCache.set(orgKey, freshConfig);
                setConfig(freshConfig);
              }
            })
            .catch(() => null);
        } else {
          // No cache available, fetch synchronously
          configPromise = api.fetchConfigurations(signalOption)
            .then(freshConfig => {
              sessionConfigCache.set(orgKey, freshConfig);
              return freshConfig;
            })
            .catch(err => {
              if (isAbortError(err)) return null;
              console.warn('Bootstrap warnings: Failed to load configurations', err);
              return null;
            });
        }

        // Pricelist handling with Stale-While-Revalidate (SWR) cache
        let pricelistPromise = null;
        const cachedPricelists = sessionPricelistCache.get(orgKey);

        if (cachedPricelists) {
          // Resolve immediately from cache, and set default pricelist ID
          const defPricelist = cachedPricelists.find(p => p.isDefault === true || p.is_default === true) || cachedPricelists[0];
          if (defPricelist) {
            setDefaultPricelistId(defPricelist.id);
          }
          
          // Revalidate pricelists in background
          api.fetchPricelists(signalOption)
            .then(freshPricelists => {
              if (active && freshPricelists) {
                sessionPricelistCache.set(orgKey, freshPricelists);
                const nextDef = freshPricelists.find(p => p.isDefault === true || p.is_default === true) || freshPricelists[0];
                if (nextDef) setDefaultPricelistId(nextDef.id);
              }
            })
            .catch(() => null);
        } else {
          // Fetch synchronously if cache is empty
          pricelistPromise = api.fetchPricelists(signalOption)
            .then(freshPricelists => {
              sessionPricelistCache.set(orgKey, freshPricelists);
              return freshPricelists;
            })
            .catch(err => {
              if (isAbortError(err)) return [];
              console.warn('Bootstrap warnings: Failed to load pricelists', err);
              return [];
            });
        }

        // Start loading optional metadata immediately with rejection handlers attached
        // to prevent unhandled promise rejections on unmount/cancellation.
        const customersTask = loadOptionalMetadata({
          request: api.fetchCustomers(signalOption),
          active: isActive,
          onSuccess: setAllCustomers,
          onWarning: () => {
            setMetadataWarnings(prev => [
              ...prev,
              'Customers list could not be retrieved from the server.'
            ]);
          },
          warningMessage: 'Bootstrap warnings: Failed to load customers list'
        });

        const creditTask = currentCreditCustomers
          ? Promise.resolve().then(() => {
              if (active) {
                setCreditCustomers(currentCreditCustomers);
              }
            })
          : loadOptionalMetadata({
              request: api.fetchCreditCustomers(signalOption),
              active: isActive,
              onSuccess: setCreditCustomers,
              onWarning: () => {
                setMetadataWarnings(prev => [
                  ...prev,
                  'Credit customers could not be retrieved from the server.'
                ]);
              },
              warningMessage: 'Bootstrap warnings: Failed to load credit customers'
            });

        // Determine core promises we must block initial loading spinner on
        const corePromises = [productsPromise];
        if (configPromise) corePromises.push(configPromise);
        if (pricelistPromise) corePromises.push(pricelistPromise);

        // Await critical core configuration results to render POS ready immediately
        const coreResults = await Promise.all(corePromises);

        if (!active) return;

        // Map core results depending on which promises were queued synchronously
        const pList = coreResults[0];
        let nextConfig = currentPropConfig || cachedConfig;
        let pricelists = cachedPricelists;

        let resultIndex = 1;
        if (configPromise) {
          nextConfig = coreResults[resultIndex++];
        }
        if (pricelistPromise) {
          pricelists = coreResults[resultIndex++];
        }

        // Sort products alphabetically (immutable sort)
        const sortedProducts = [...pList].sort((a, b) => 
          String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' })
        );
        
        setProducts(sortedProducts);
        
        // Only set config at end of core load if configPromise was active
        if (configPromise) {
          setConfig(nextConfig);
        }

        // Find default pricelist if pricelistPromise was active
        if (pricelistPromise && pricelists) {
          const defPricelist = pricelists.find(p => p.isDefault === true || p.is_default === true) || pricelists[0];
          if (defPricelist) {
            setDefaultPricelistId(defPricelist.id);
          }
        }

        // Extract unique categories
        const cats = extractUniqueCategories(sortedProducts);
        setCategories(cats);

        // Terminate loading state as soon as critical dependencies resolve
        setLoading(false);

      } catch (err) {
        if (!active || isAbortError(err)) return;
        
        if (err?.code === 'OFFLINE_CACHE_MISS') {
          setLoadError('Offline POS data is not prepared on this device yet. Connect once, open POS, and wait for offline setup to finish.');
        } else {
          console.error('Failed to bootstrap counter sale data', err);
          setLoadError('Failed to load POS data. Please refresh and try again.');
        }
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
    loading,
    loadError,
    metadataWarnings
  };
}
