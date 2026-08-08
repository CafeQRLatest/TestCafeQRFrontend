import api from '../utils/api';

/**
 * Module-level Promise cache scoped by orgId.
 * Caching a Promise (not raw data) means concurrent requests while the first
 * fetch is in-flight all share the same Promise and never fire duplicate requests.
 *
 * @type {Map<string, Promise<Array>>}
 */
const paymentTypesCache = new Map();

/**
 * Fetch sales payment types, using the per-org Promise cache.
 *
 * @param {string|number|null} orgId - Organization identifier for tenant isolation.
 *   Pass null/undefined for single-tenant setups; falls back to 'default'.
 * @param {object} options - Optional axios request config (e.g. signal).
 * @returns {Promise<Array>} Resolves with the list of payment type records.
 */
export function fetchSalesPaymentTypes(orgId, options = {}) {
  const key = orgId != null ? String(orgId) : 'default';

  if (!paymentTypesCache.has(key)) {
    paymentTypesCache.set(
      key,
      api
        .get('/api/v1/payment-types', {
          ...options,
          params: {
            ...(options.params || {}),
            applicableFor: 'SALES',
          },
        })
        .then(({ data }) => data.data || [])
        .catch((err) => {
          // Invalidate so the next mount retries instead of caching a failure.
          paymentTypesCache.delete(key);
          throw err;
        })
    );
  }

  return paymentTypesCache.get(key);
}

/**
 * Invalidate the payment types cache for a specific org (or all orgs).
 * Useful in tests or after admin changes to payment method configuration.
 *
 * @param {string|number|null} orgId - Pass null to clear all orgs.
 */
export function resetPaymentTypesCache(orgId = null) {
  if (orgId == null) {
    paymentTypesCache.clear();
  } else {
    paymentTypesCache.delete(String(orgId));
  }
}
