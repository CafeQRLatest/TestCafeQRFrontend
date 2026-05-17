import api from './api';
import Cookies from 'js-cookie';
import {
  cacheApiResponse,
  getSyncMetadata,
  getQueuedOperations,
  markOperationFailed,
  markOperationConflict,
  markOperationSynced,
  setSyncMetadata,
  setLastSyncTime,
  upsertEntities,
} from './offlineStore';
import {
  canAttemptNetworkProbe,
  getOfflineReasonFromError,
  isKnownOffline,
  markConnectionLost,
  markConnectionOnline,
} from './networkState';

let syncInFlight = false;
let reconnectInFlight = null;

function emitSyncEvent(name, detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function isOnline() {
  return !isKnownOffline();
}

function isPageVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

function unwrapData(response) {
  return response?.data?.data ?? response?.data ?? null;
}

function tenantHeaders() {
  return {
    'X-Client-ID': Cookies.get('clientId') || '0',
    'X-Org-ID': Cookies.get('orgId') || '0',
    'X-Terminal-ID': Cookies.get('terminalId') || '0',
  };
}

async function seedApiCache(path, data) {
  await cacheApiResponse({
    method: 'get',
    url: path,
    baseURL: process.env.NEXT_PUBLIC_API_URL || '',
    headers: tenantHeaders(),
  }, {
    success: true,
    data,
  });
}

async function seedBootstrapApiCaches(data) {
  const products = data.products || [];
  const categories = data.categories || [];
  const uoms = data.uoms || [];
  const variantGroups = data.variantGroups || [];
  const tables = data.tables || [];
  const saleOrders = (data.orders || []).filter((order) => {
    const type = String(order?.orderType || order?.order_type || '').toUpperCase();
    return !type || type === 'SALE';
  });

  await Promise.all([
    seedApiCache('/api/v1/products', products),
    seedApiCache('/api/v1/products/categories', categories),
    seedApiCache('/api/v1/products/uoms', uoms),
    seedApiCache('/api/v1/products/variants/groups', variantGroups),
    seedApiCache('/api/v1/tables/active', tables),
    seedApiCache('/api/v1/orders/sales/live', saleOrders),
    seedApiCache('/api/v1/orders/type/SALE', saleOrders),
    seedApiCache('/api/v1/configurations', data.configuration || null),
  ]);
}

async function applyOfflineSnapshot(data, options = {}) {
  if (!data) {
    return null;
  }

  const products = data.products || [];
  const categories = data.categories || [];
  const uoms = data.uoms || [];
  const variantGroups = data.variantGroups || [];
  const tables = data.tables || [];
  const orders = data.orders || [];

  await Promise.all([
    upsertEntities('products', products),
    upsertEntities('categories', categories),
    upsertEntities('uoms', uoms),
    upsertEntities('variantGroups', variantGroups),
    upsertEntities('tables', tables),
    upsertEntities('orders', orders),
    seedBootstrapApiCaches({
      products,
      categories,
      uoms,
      variantGroups,
      tables,
      orders,
      configuration: data.configuration || null,
    }),
    setSyncMetadata('lastChangeCursor', data.serverTime || new Date().toISOString()),
    options.bootstrap
      ? setSyncMetadata('lastBootstrapAt', data.serverTime || new Date().toISOString())
      : Promise.resolve(),
  ]);

  return data;
}

export async function bootstrapOfflineData(options = {}) {
  const forceProbe = Boolean(options.forceProbe);
  if (!forceProbe && !isOnline()) {
    return null;
  }

  const response = await api.get('/api/v1/sync/bootstrap', {
    skipOfflineCache: true,
    skipOfflineQueue: true,
    skipAuthRedirect: true,
    backgroundSync: true,
    allowOfflineProbe: forceProbe,
  });
  const data = unwrapData(response);

  if (!data) {
    return null;
  }

  return applyOfflineSnapshot(data, { bootstrap: true });
}

export async function refreshOfflineChanges(options = {}) {
  const forceProbe = Boolean(options.forceProbe);
  if (!forceProbe && !isOnline()) {
    return null;
  }

  const since = await getSyncMetadata('lastChangeCursor');
  if (!since) {
    return bootstrapOfflineData(options);
  }

  const response = await api.get('/api/v1/sync/changes', {
    params: { since },
    skipOfflineCache: true,
    skipOfflineQueue: true,
    skipAuthRedirect: true,
    backgroundSync: true,
    allowOfflineProbe: forceProbe,
  });
  const data = unwrapData(response);
  const snapshot = data?.snapshot || data;

  if (!snapshot) {
    return null;
  }

  return applyOfflineSnapshot(snapshot);
}

export async function syncQueuedOperations() {
  if (syncInFlight || !isOnline()) {
    return { skipped: true };
  }

  syncInFlight = true;

  try {
    const operations = await getQueuedOperations();
    if (!operations.length) {
      return { pushed: 0 };
    }

    // Split into legacy batch operations and direct native endpoint operations
    const legacyEntities = ['products', 'categories', 'uoms', 'variantGroups', 'variants', 'tables', 'orders', 'configurations'];
    const batchOperations = operations.filter(op => legacyEntities.includes(op.entity) || !op.entity || op.entity === 'unknown');
    const directOperations = operations.filter(op => !batchOperations.includes(op));

    let pushedCount = 0;
    const results = [];

    // 1. Process batch operations via the unified /sync/push endpoint
    if (batchOperations.length > 0) {
      const response = await api.post(
        '/api/v1/sync/push',
        { operations: batchOperations },
        {
          skipOfflineCache: true,
          skipOfflineQueue: true,
          skipAuthRedirect: true,
          backgroundSync: true,
        }
      );

      const data = unwrapData(response);
      const batchResults = data?.results || [];

      await Promise.all(batchResults.map((result) => {
        if (result.success) {
          return markOperationSynced(result.operationId, result);
        }
        if (result.status === 'REJECTED' || result.status === 'FAILED') {
          return markOperationConflict(result.operationId, result.message);
        }
        return markOperationFailed(result.operationId, result.message);
      }));

      pushedCount += batchOperations.length;
      results.push(...batchResults);
      
      if (data?.serverTime) {
        await setSyncMetadata('lastSuccessfulSyncAt', data.serverTime);
      }
    }

    // 2. Process secondary entity operations directly against their native REST endpoints
    for (const op of directOperations) {
      try {
        const res = await api.request({
          method: op.method,
          url: op.url,
          data: op.payload,
          headers: { 'Idempotency-Key': op.operationId },
          skipOfflineCache: true,
          skipOfflineQueue: true,
          skipAuthRedirect: true,
          backgroundSync: true,
        });
        
        const data = unwrapData(res);
        await markOperationSynced(op.id, data);
        results.push({ operationId: op.operationId, success: true, data });
        pushedCount++;
      } catch (err) {
        const status = err.response?.status;
        const msg = err.response?.data?.message || err.message;
        
        // 4xx errors (except 409 conflict/idempotency hit) are validation/business errors -> conflict drawer
        const offlineReason = getOfflineReasonFromError(err);
        if (offlineReason) {
          markConnectionLost(offlineReason);
          await markOperationFailed(op.id, 'Network unavailable');
          results.push({ operationId: op.operationId, success: false, status: 'PENDING', message: 'Network unavailable' });
        } else if (status >= 400 && status < 500 && status !== 409) {
          await markOperationConflict(op.id, msg);
          results.push({ operationId: op.operationId, success: false, status: 'CONFLICT', message: msg });
        } else {
          await markOperationFailed(op.id, msg);
          results.push({ operationId: op.operationId, success: false, status: 'FAILED', message: msg });
        }
      }
    }

    await setLastSyncTime();
    emitSyncEvent('cafeqr-sync-complete', { pushed: pushedCount, results });

    return { pushed: pushedCount, results };
  } finally {
    syncInFlight = false;
  }
}

export async function reconnectAndSync() {
  if (!canAttemptNetworkProbe()) {
    return { skipped: true, offline: true };
  }

  if (reconnectInFlight) {
    return reconnectInFlight;
  }

  reconnectInFlight = (async () => {
    try {
      const changes = await refreshOfflineChanges({ forceProbe: true });
      markConnectionOnline();
      const syncResult = await syncQueuedOperations();
      return { changed: Boolean(changes), sync: syncResult };
    } catch (error) {
      if (error?.response) {
        markConnectionOnline();
        const status = error.response.status;
        if (status === 401 || status === 403) {
          return { skipped: true, authBlocked: true, status };
        }
      }

      const offlineReason = getOfflineReasonFromError(error);
      if (offlineReason) {
        markConnectionLost(offlineReason);
      }
      throw error;
    } finally {
      reconnectInFlight = null;
    }
  })();

  return reconnectInFlight;
}

export function registerOfflineSyncListeners() {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let consecutiveFailures = 0;
  let intervalId = null;

  const run = () => {
    if (!isPageVisible()) return;
    if (!isOnline()) return;
    syncQueuedOperations()
      .then((result) => {
        if (!result?.skipped) consecutiveFailures = 0;
      })
      .catch((error) => {
        if (error?.code === 'OFFLINE_REQUEST_SKIPPED') {
          return;
        }
        const offlineReason = getOfflineReasonFromError(error);
        if (offlineReason) {
          markConnectionLost(offlineReason);
        } else if (error?.message !== 'Network Error') {
          console.warn('[Offline Sync] Sync attempt failed:', error?.message || error);
        }
        consecutiveFailures += 1;
      });
  };

  const probeThenRun = () => {
    if (!isPageVisible()) return Promise.resolve({ skipped: true, hidden: true });
    return reconnectAndSync()
      .then((result) => {
        if (result?.skipped) return;
        consecutiveFailures = 0;
      })
      .catch((error) => {
        if (error?.code === 'OFFLINE_REQUEST_SKIPPED') {
          return;
        }
        const offlineReason = getOfflineReasonFromError(error);
        if (offlineReason) {
          markConnectionLost(offlineReason);
        } else if (error?.response?.status !== 401 && error?.response?.status !== 403) {
          console.warn('[Offline Sync] Reconnect probe failed:', error?.message || error);
        }
        consecutiveFailures += 1;
      });
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible') {
      return;
    }

    if (isOnline()) {
      consecutiveFailures = 0;
      run();
    } else if (canAttemptNetworkProbe()) {
      probeThenRun();
    }
  };

  const handleOnline = () => {
    probeThenRun();
  };

  const handleNetworkState = (event) => {
    if (!event?.detail?.offline) {
      consecutiveFailures = 0;
      run();
    }
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('cafeqr-network-state', handleNetworkState);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Adaptive interval: backs off when failures stack up (max 5 min)
  const BASE_INTERVAL = 60000;
  const tick = () => {
    if (!isPageVisible()) {
      intervalId = window.setTimeout(tick, BASE_INTERVAL);
      return;
    }
    if (isOnline()) {
      run();
    } else if (canAttemptNetworkProbe()) {
      probeThenRun();
    }
    const backoff = Math.min(BASE_INTERVAL * Math.pow(2, consecutiveFailures), 300000);
    intervalId = window.setTimeout(tick, backoff);
  };

  if (isOnline()) {
    run();
  } else if (canAttemptNetworkProbe()) {
    probeThenRun();
  }
  intervalId = window.setTimeout(tick, BASE_INTERVAL);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('cafeqr-network-state', handleNetworkState);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (intervalId) window.clearTimeout(intervalId);
  };
}
