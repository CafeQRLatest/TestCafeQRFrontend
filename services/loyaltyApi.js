import api from '../utils/api';

// ─── Programs ─────────────────────────────────────────────────────────────────

export function fetchLoyaltyPrograms() {
  return api.get('/api/v1/loyalty/programs').then(({ data }) => data.data ?? data);
}

export function createLoyaltyProgram(payload) {
  return api.post('/api/v1/loyalty/programs', payload).then(({ data }) => data.data ?? data);
}

export function updateLoyaltyProgram(id, payload) {
  const body = { id, ...payload };
  return api.put(`/api/v1/loyalty/programs/${id}`, body).then(({ data }) => data.data ?? data);
}

// ─── Customer Loyalty ─────────────────────────────────────────────────────────

export function fetchCustomerLoyalty(customerId) {
  return api.get(`/api/v1/loyalty/customers/${customerId}`).then(({ data }) => data.data ?? data);
}

export function fetchCustomerTransactions(customerId, page = 0, size = 50) {
  return api
    .get(`/api/v1/loyalty/customers/${customerId}/transactions`, {
      params: { page, size },
    })
    .then(({ data }) => data.data ?? data);
}

