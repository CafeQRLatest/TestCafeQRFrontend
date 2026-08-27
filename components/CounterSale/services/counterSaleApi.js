import api from '../../../utils/api';

export async function fetchProducts(options = {}) {
  const { data } = await api.get('/api/v1/products', options);
  return data.data || [];
}

export async function fetchConfigurations(options = {}) {
  const { data } = await api.get('/api/v1/configurations', options);
  return data.data || null;
}

export async function fetchCustomers(options = {}) {
  const { data } = await api.get('/api/v1/purchasing/customers', options);
  return data.data || [];
}

export async function fetchCreditCustomers(options = {}) {
  const { data } = await api.get('/api/v1/credit/customers', { 
    ...options, 
    params: { ...(options.params || {}), status: 'ACTIVE' } 
  });
  return data.data || [];
}

export async function fetchPricelists(options = {}) {
  const { data } = await api.get('/api/v1/purchasing/pricelists/type/SALE', options);
  return data.data || [];
}

export async function fetchCategories(options = {}) {
  const { data } = await api.get('/api/v1/products/categories', options);
  return data.data || [];
}

export async function fetchProductDetails(productId, options = {}) {
  const { data } = await api.get(`/api/v1/products/${productId}`, options);
  return data.data || null;
}

export async function saveCustomer(payload, options = {}) {
  const { data } = await api.post('/api/v1/purchasing/customers', payload, options);
  return data.data || null;
}

export async function createOrder(payload, options = {}) {
  const { data } = await api.post('/api/v1/orders', payload, options);
  return data;
}
