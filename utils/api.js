import axios from 'axios';
import Cookies from 'js-cookie';
import {
  cacheApiResponse,
  enqueueOfflineMutation,
  getCachedApiResponse,
  isOfflineCacheableGet,
  isOfflineQueueableMutation,
  isProbablyOfflineError,
} from './offlineStore';
import {
  getOfflineReasonFromError,
  isKnownOffline,
  markConnectionLost,
  markConnectionOnline,
} from './networkState';
import { getFrontendCookieOptions } from './cookieOptions';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true, 
});

const AUTH_COOKIE_NAMES = [
  'access_token',
  'refresh_token',
  'userRole',
  'userEmail',
  'userId',
  'firstName',
  'lastName',
  'clientId',
  'clientName',
  'orgId',
  'orgName',
  'terminalId',
  'terminalName',
  'subscriptionStatus',
  'subscriptionExpiryDate',
  'currency',
  'country',
  'timezone',
];

const clearAuthCookies = () => {
  AUTH_COOKIE_NAMES.forEach((name) => {
    Cookies.remove(name, { path: '/' });
  });
};

const createOfflineCacheMissError = (config) => {
  const error = new Error('Offline data is not prepared on this device yet. Open this screen once while online.');
  error.code = 'OFFLINE_CACHE_MISS';
  error.offline = true;
  error.config = config;
  return error;
};

const createOfflineSkippedError = (config) => {
  const error = new Error('Connection is offline. Background request skipped.');
  error.code = 'OFFLINE_REQUEST_SKIPPED';
  error.offline = true;
  error.config = config;
  return error;
};

const createOfflineId = (prefix = 'offline') => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createOfflineOrderNo = (id) => `OFFLINE-${String(id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase() || Date.now()}`;

const buildOfflineMutationResponse = (config, queued) => {
  const payload = queued.payload && typeof queued.payload === 'object' ? queued.payload : {};
  const offlineId = payload.id || queued.offlineId || queued.id || createOfflineId();
  const createdAt = queued.createdAt || new Date().toISOString();
  const isOrderMutation = queued.entity === 'orders' || String(queued.path || '').includes('/orders');

  const data = {
    ...payload,
    id: offlineId,
    offlineOperationId: queued.id,
    offline: true,
    createdAt: payload.createdAt || createdAt,
    updatedAt: payload.updatedAt || createdAt,
  };

  if (isOrderMutation) {
    data.orderNo = payload.orderNo || createOfflineOrderNo(queued.id);
    data.invoiceNo = payload.invoiceNo || payload.offlineInvoiceNo;
    data.paymentNo = payload.paymentNo || payload.offlinePaymentNo;
    data.status = payload.status || 'PENDING_SYNC';
    data.syncStatus = 'QUEUED';
  }

  return {
    data: {
      success: true,
      message: 'Saved offline. This change will sync when internet returns.',
      data,
      offline: true,
    },
    status: 202,
    statusText: 'Accepted Offline',
    headers: {},
    config,
    request: null,
    offline: true,
  };
};

const installOfflineAdapterIfNeeded = async (config) => {
  if (!isKnownOffline()) {
    return config;
  }

  if (config.backgroundSync && !config.allowOfflineProbe) {
    config.adapter = async () => {
      throw createOfflineSkippedError(config);
    };
    return config;
  }

  if (isOfflineCacheableGet(config)) {
    const cached = await getCachedApiResponse(config).catch(() => null);
    config.adapter = async () => {
      if (cached) {
        return {
          data: cached.data,
          status: 200,
          statusText: 'OK (offline cache)',
          headers: {},
          config,
          request: null,
          offline: true,
          cachedAt: cached.cachedAt,
        };
      }

      throw createOfflineCacheMissError(config);
    };
    return config;
  }

  if (isOfflineQueueableMutation(config)) {
    const queued = await enqueueOfflineMutation(config);
    config.adapter = async () => buildOfflineMutationResponse(config, queued);
  }

  return config;
};

// Request interceptor: Attach context meta-data headers and Bearer token
api.interceptors.request.use(
  async (config) => {
    config.headers = config.headers || {};

    // Attach JWT access token as Authorization header (cross-domain safe)
    const accessToken = Cookies.get('access_token');
    if (accessToken) {
      config.headers['Authorization'] = `Bearer ${accessToken}`;
    }
    
    // Read context from cookies (synced in AuthContext)
    config.headers['X-Client-ID'] = Cookies.get('clientId') || '0';
    config.headers['X-Org-ID'] = Cookies.get('orgId') || '0';
    config.headers['X-Terminal-ID'] = Cookies.get('terminalId') || '0';
    config.headers['X-User-ID'] = Cookies.get('userId') || '0';
    config.headers['X-User-Email'] = Cookies.get('userEmail') || '';
    config.headers['X-User-Role'] = Cookies.get('userRole') || '';
    config.headers['X-Client-Name'] = Cookies.get('clientName') || '';
    config.headers['X-Org-Name'] = Cookies.get('orgName') || '';
    config.headers['X-Terminal-Name'] = Cookies.get('terminalName') || '';
    config.headers['X-Currency'] = Cookies.get('currency') || 'INR';
    config.headers['X-Country'] = Cookies.get('country') || '';

    return installOfflineAdapterIfNeeded(config);
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

/**
 * Enterprise-grade Response Interceptor
 * 
 * Handles 401 (Unauthorized) and 403 (Forbidden) responses by attempting
 * a silent token refresh using the HttpOnly refresh_token cookie.
 * 
 * Key features:
 * - Queues concurrent failed requests during refresh to avoid duplicate refreshes
 * - Retries all queued requests after a successful refresh
 * - Redirects to /login only if the refresh itself fails
 * - Skips refresh attempts for auth endpoints (to prevent infinite loops)
 */
api.interceptors.response.use(
  (response) => {
    if (!response.offline) {
      markConnectionOnline();
    }

    if (!response.offline) {
      cacheApiResponse(response.config, response.data).catch((error) => {
        console.warn('[Offline Cache] Unable to cache API response:', error?.message || error);
      });
    }

    return response;
  },
  async (error) => {
    if (error?.code === 'OFFLINE_REQUEST_SKIPPED') {
      return Promise.reject(error);
    }

    if (error?.code === 'OFFLINE_CACHE_MISS') {
      return Promise.reject(error);
    }

    const originalRequest = error.config;
    const status = error.response?.status;
    const offlineReason = getOfflineReasonFromError(error);

    if (error.response) {
      markConnectionOnline();
    }

    if (offlineReason) {
      markConnectionLost(offlineReason);
    }

    if (isProbablyOfflineError(error) && originalRequest) {
      const cached = await getCachedApiResponse(originalRequest).catch(() => null);
      if (cached) {
        return {
          data: cached.data,
          status: 200,
          statusText: 'OK (offline cache)',
          headers: {},
          config: originalRequest,
          request: error.request,
          offline: true,
          cachedAt: cached.cachedAt,
        };
      }

      if (isOfflineQueueableMutation(originalRequest)) {
        const queued = await enqueueOfflineMutation(originalRequest);
        if (queued) {
          return buildOfflineMutationResponse(originalRequest, queued);
        }
      }
    }

    // Background sync must never cause foreground auth redirect loops.
    if ((status === 401 || status === 403) && (originalRequest?.skipAuthRedirect || originalRequest?.backgroundSync)) {
      return Promise.reject(error);
    }

    // Only attempt refresh for 401/403 and NOT for auth endpoints (prevents infinite loop)
    const isAuthEndpoint = originalRequest?.url?.includes('/api/v1/auth/');
    const isRefreshable = originalRequest
      && (status === 401 || status === 403)
      && !originalRequest._retry
      && !isAuthEndpoint
      && !originalRequest.skipAuthRedirect
      && !originalRequest.backgroundSync;

    if (!isRefreshable) {
      return Promise.reject(error);
    }

    // If already refreshing, queue this request
    if (isRefreshing) {
      return new Promise(function (resolve, reject) {
        failedQueue.push({ resolve, reject });
      })
        .then(() => {
          return api(originalRequest);
        })
        .catch((err) => {
          return Promise.reject(err);
        });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      // Attempt to refresh the token using the stored refresh_token
      const refreshToken = Cookies.get('refresh_token');
      const refreshResponse = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh`,
        {},
        { 
          withCredentials: true,
          headers: refreshToken ? { 'Authorization': `Bearer ${refreshToken}` } : {}
        }
      );

      // Store the new tokens from the response
      if (refreshResponse.data?.data?.accessToken) {
        Cookies.set('access_token', refreshResponse.data.data.accessToken, getFrontendCookieOptions());
      }
      if (refreshResponse.data?.data?.refreshToken) {
        Cookies.set('refresh_token', refreshResponse.data.data.refreshToken, getFrontendCookieOptions());
      }

      // Success: process queued requests
      processQueue(null);

      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError);
      
      // Refresh failed => session truly expired, redirect to login
      console.error('[Auth] Token refresh failed, redirecting to login:', refreshError?.response?.data?.message || refreshError.message);
      clearAuthCookies();

      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
