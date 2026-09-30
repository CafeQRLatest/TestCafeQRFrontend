import api from '../utils/api';

/**
 * Isolated API service for QR Code scanning, table session, and ordering flow.
 */
export const qrOrderService = {
  /**
   * Fetches table metadata and active open tab session (if any).
   */
  async fetchTableSession(clientId, orgId, tableId) {
    const res = await api.get(`/api/v1/public/menu/${clientId}/${orgId || 'null'}/table/${tableId}`);
    return res.data;
  },

  /**
   * Fetches the full active digital menu for the branch.
   */
  async fetchMenu(clientId, orgId) {
    const res = await api.get(`/api/v1/public/menu/${clientId}/${orgId || 'null'}`);
    return res.data;
  },

  /**
   * Submits a new order or appends to an existing table order tab.
   */
  async submitOrder(clientId, orgId, payload) {
    const res = await api.post(`/api/v1/public/menu/${clientId}/${orgId || 'null'}/order`, payload);
    return res.data;
  },

  /**
   * Sends OTP for guest customer verification.
   */
  async sendOtp(identifier) {
    const res = await api.post('/api/v1/public/customer/send-otp', { identifier });
    return res.data;
  },

  /**
   * Verifies OTP and registers/logs in guest customer.
   */
  async verifyOtp(payload) {
    const res = await api.post('/api/v1/public/customer/verify-otp', payload);
    return res.data;
  }
};

export default qrOrderService;
