import api from '../../utils/api';

export const fetchConfigurations = () => 
  api.get('/api/v1/configurations');

export const fetchCustomers = () => 
  api.get('/api/v1/credit/customers');

export const createCustomer = (payload) => 
  api.post('/api/v1/credit/customers', payload);

export const updateCustomer = (id, payload) => 
  api.put(`/api/v1/credit/customers/${id}`, payload);

export const suspendCustomer = (id) => 
  api.post(`/api/v1/credit/customers/${id}/suspend`);

export const reactivateCustomer = (id) => 
  api.post(`/api/v1/credit/customers/${id}/reactivate`);

export const fetchCustomerOrders = (id, page = 0, size = 50, partnerType = 'CUSTOMER') => 
  api.get(`/api/v1/credit/customers/${id}/orders`, { params: { page, size, partnerType } });

export const fetchCustomerPayments = (id, page = 0, size = 50, partnerType = 'CUSTOMER') => 
  api.get(`/api/v1/credit/customers/${id}/payments`, { params: { page, size, partnerType } });

export const recordPayment = (id, payload, options = {}) => {
  const idempotencyKey = options.idempotencyKey || `credit_pay_${id}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  return api.post(`/api/v1/credit/customers/${id}/payments`, payload, {
    headers: {
      'Idempotency-Key': idempotencyKey,
      ...(options.headers || {})
    }
  });
};
