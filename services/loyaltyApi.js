import api from '../utils/api';

// Cache stores
let cachedPrograms = null;
let programsExpiry = 0;
const customerLoyaltyCache = new Map(); // customerId -> { data, expiry }

const CACHE_TTL_PROGRAMS = 5 * 60 * 1000; // 5 mins
const CACHE_TTL_CUSTOMER = 2 * 60 * 1000; // 2 mins

// Helper to retry a function with delay
async function withRetry(fn, retries = 2, delayMs = 1000) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < retries) {
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastError;
}

// ─── Programs ─────────────────────────────────────────────────────────────────

export function fetchLoyaltyPrograms(forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && cachedPrograms && now < programsExpiry) {
    return Promise.resolve(cachedPrograms);
  }

  return withRetry(() => api.get('/api/v1/loyalty/programs'))
    .then(({ data }) => {
      const result = data.data ?? data;
      cachedPrograms = result;
      programsExpiry = Date.now() + CACHE_TTL_PROGRAMS;
      return result;
    });
}

export function createLoyaltyProgram(payload) {
  cachedPrograms = null;
  return api.post('/api/v1/loyalty/programs', payload).then(({ data }) => data.data ?? data);
}

export function updateLoyaltyProgram(id, payload) {
  cachedPrograms = null;
  const body = { id, ...payload };
  return api.put(`/api/v1/loyalty/programs/${id}`, body).then(({ data }) => data.data ?? data);
}

// ─── Customer Loyalty ─────────────────────────────────────────────────────────

export function fetchCustomerLoyalty(customerId, forceFresh = false) {
  if (!customerId || String(customerId).startsWith('temp-')) {
    return Promise.resolve(null);
  }

  const key = String(customerId);
  const now = Date.now();
  const cached = customerLoyaltyCache.get(key);

  if (!forceFresh && cached && now < cached.expiry) {
    return Promise.resolve(cached.data);
  }

  return withRetry(() => api.get(`/api/v1/loyalty/customers/${customerId}`))
    .then(({ data }) => {
      const result = data.data ?? data;
      customerLoyaltyCache.set(key, {
        data: result,
        expiry: Date.now() + CACHE_TTL_CUSTOMER,
      });
      return result;
    });
}

export function prefetchCustomerLoyalty(customerId) {
  if (!customerId || String(customerId).startsWith('temp-')) return;
  // Trigger fetch and cache programs & customer loyalty non-blockingly
  fetchLoyaltyPrograms().catch(() => {});
  fetchCustomerLoyalty(customerId).catch(() => {});
}

export function invalidateCustomerLoyalty(customerId) {
  if (customerId) {
    customerLoyaltyCache.delete(String(customerId));
  } else {
    customerLoyaltyCache.clear();
  }
}

export function fetchCustomerTransactions(customerId, page = 0, size = 50) {
  return api
    .get(`/api/v1/loyalty/customers/${customerId}/transactions`, {
      params: { page, size },
    })
    .then(({ data }) => data.data ?? data);
}
