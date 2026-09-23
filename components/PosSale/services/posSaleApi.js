import api from '../../../utils/api';

// ─────────────────────────────────────────────────────────────
// POS Sale V2 API Service
// Talks to /api/v1/pos/sale/* endpoints (isolated from /api/v1/orders)
// ─────────────────────────────────────────────────────────────

/**
 * Fetches aggregated POS sales screen details in a single call.
 * GET /api/v1/pos/sale/sales-screen-details
 */
export async function fetchSalesScreenDetails(options = {}) {
  const { data } = await api.get('/api/v1/pos/sale/sales-screen-details', options);
  return data?.data || null;
}

// Backwards-compatibility alias
export const fetchBootstrap = fetchSalesScreenDetails;

/**
 * Loads a page of POS products using cursor keyset pagination (50 products per page).
 * Returns { items, nextCursor, hasMore } without downloading the full catalog.
 * GET /api/v1/pos/sale/products
 */
export async function fetchPosProducts(params = {}, options = {}) {
  const { data } = await api.get('/api/v1/pos/sale/products', {
    ...options,
    params: {
      limit: 50,
      ...(options.params || {}),
      ...params,
    },
  });
  return data?.data || { items: [], nextCursor: null, hasMore: false };
}

/**
 * Fast DB-level customer search matching name or phone.
 * Directly bounded by SQL limit (default 20, max 50).
 * GET /api/v1/pos/sale/customers/search
 */
export async function searchPosCustomers(search = '', limit = 20, options = {}) {
  const { data } = await api.get('/api/v1/pos/sale/customers/search', {
    ...options,
    params: {
      q: search || undefined,
      limit,
      ...(options.params || {}),
    },
  });
  return data?.data || [];
}

/**
 * Fetches sales-related configurations from the POS Sale query endpoint.
 * GET /api/v1/pos/sale/configurations
 */
export async function fetchSaleConfigurations(options = {}) {
  const { data } = await api.get('/api/v1/pos/sale/configurations', options);
  return data?.data || null;
}

/**
 * Fetches paginated sales history using lightweight projections.
 * Returns { items, page, size, hasMore } without expensive COUNT(*).
 * GET /api/v1/pos/sale/history
 */
export async function fetchSalesHistory(params = {}, options = {}) {
  const { data } = await api.get('/api/v1/pos/sale/history', {
    ...options,
    params: {
      ...(options.params || {}),
      ...params,
    },
  });
  return data?.data || { items: [], hasMore: false };
}

/**
 * Fetches currently open (non-completed) sale orders.
 * GET /api/v1/pos/sale/live
 */
export async function fetchLiveSales(options = {}) {
  const { data } = await api.get('/api/v1/pos/sale/live', options);
  return data?.data || { items: [], hasMore: false };
}

/**
 * Creates a new sale order via the V2 command endpoint.
 * Uses the same payload structure as the existing POST /api/v1/orders.
 * POST /api/v1/pos/sale/orders
 */
export async function createOrder(payload, options = {}) {
  const { data } = await api.post('/api/v1/pos/sale/orders', payload, options);
  return data;
}
export const createSaleOrder = createOrder;

/**
 * Fetches product details by ID (delegates to existing endpoint).
 * GET /api/v1/products/:id
 */
export async function fetchProductDetails(productId, options = {}) {
  const { data } = await api.get(`/api/v1/products/${productId}`, options);
  return data?.data || null;
}

/**
 * Saves a new customer (delegates to existing endpoint).
 * POST /api/v1/purchasing/customers
 */
export async function saveCustomer(payload, options = {}) {
  const { data } = await api.post('/api/v1/purchasing/customers', payload, options);
  return data?.data || null;
}

/**
 * Lightweight catalog sync check against server namespace versions.
 * Returns { stale, serverVersion, serverTimestamp }.
 * GET /api/v1/pos/sale/sync-check
 */
export async function checkCatalogSync(clientVersion, options = {}) {
  const { data } = await api.get('/api/v1/pos/sale/sync-check', {
    ...options,
    params: {
      version: clientVersion || undefined,
      ...(options.params || {}),
    },
  });
  return data?.data || { stale: true, serverVersion: 0 };
}

