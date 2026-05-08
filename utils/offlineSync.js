import api from './api';
import {
  getQueuedOperations,
  markOperationFailed,
  markOperationConflict,
  markOperationSynced,
  setSyncMetadata,
  setLastSyncTime,
  upsertEntities,
} from './offlineStore';

let syncInFlight = false;

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function unwrapData(response) {
  return response?.data?.data ?? response?.data ?? null;
}

export async function bootstrapOfflineData() {
  if (!isOnline()) {
    return null;
  }

  const response = await api.get('/api/v1/sync/bootstrap', {
    skipOfflineCache: true,
    skipOfflineQueue: true,
  });
  const data = unwrapData(response);

  if (!data) {
    return null;
  }

  // Fetch secondary entities in parallel for full offline support
  const fetchSecondary = async (url) => {
    try {
      const res = await api.get(`${url}?size=1000`, { skipOfflineCache: false, skipOfflineQueue: true });
      const unwrapped = unwrapData(res);
      return Array.isArray(unwrapped?.content) ? unwrapped.content : (Array.isArray(unwrapped) ? unwrapped : []);
    } catch {
      return [];
    }
  };

  const [
    customers,
    vendors,
    expenses,
    expenseCategories,
    purchaseOrders,
    stockAdjustments,
    waste
  ] = await Promise.all([
    fetchSecondary('/api/v1/purchasing/customers'),
    fetchSecondary('/api/v1/purchasing/vendors'),
    fetchSecondary('/api/v1/expenses'),
    fetchSecondary('/api/v1/expense-categories'),
    fetchSecondary('/api/v1/purchasing/orders'),
    fetchSecondary('/api/v1/stock/adjustments'),
    fetchSecondary('/api/v1/waste')
  ]);

  await Promise.all([
    upsertEntities('products', data.products || []),
    upsertEntities('categories', data.categories || []),
    upsertEntities('uoms', data.uoms || []),
    upsertEntities('variantGroups', data.variantGroups || []),
    upsertEntities('tables', data.tables || []),
    upsertEntities('orders', data.orders || []),
    upsertEntities('customers', customers),
    upsertEntities('vendors', vendors),
    upsertEntities('expenses', expenses),
    upsertEntities('expenseCategories', expenseCategories),
    upsertEntities('purchaseOrders', purchaseOrders),
    upsertEntities('stockAdjustments', stockAdjustments),
    upsertEntities('waste', waste),
    setSyncMetadata('lastBootstrapAt', data.serverTime || new Date().toISOString()),
    setSyncMetadata('lastChangeCursor', data.serverTime || new Date().toISOString()),
  ]);

  return data;
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
        { skipOfflineCache: true, skipOfflineQueue: true }
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
        });
        
        const data = unwrapData(res);
        await markOperationSynced(op.id, data);
        results.push({ operationId: op.operationId, success: true, data });
        pushedCount++;
      } catch (err) {
        const status = err.response?.status;
        const msg = err.response?.data?.message || err.message;
        
        // 4xx errors (except 409 conflict/idempotency hit) are validation/business errors -> conflict drawer
        if (status >= 400 && status < 500 && status !== 409) {
          await markOperationConflict(op.id, msg);
          results.push({ operationId: op.operationId, success: false, status: 'CONFLICT', message: msg });
        } else {
          await markOperationFailed(op.id, msg);
          results.push({ operationId: op.operationId, success: false, status: 'FAILED', message: msg });
        }
      }
    }

    await setLastSyncTime();

    return { pushed: pushedCount, results };
  } finally {
    syncInFlight = false;
  }
}

export function registerOfflineSyncListeners() {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let consecutiveFailures = 0;
  let intervalId = null;

  const run = () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    syncQueuedOperations()
      .then((result) => {
        if (!result?.skipped) consecutiveFailures = 0;
      })
      .catch((error) => {
        if (error?.message !== 'Network Error') {
          console.warn('[Offline Sync] Sync attempt failed:', error?.message || error);
        }
        consecutiveFailures += 1;
      });
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      consecutiveFailures = 0;
      run();
    }
  };

  const handleOnline = () => {
    consecutiveFailures = 0;
    run();
  };

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Adaptive interval: backs off when failures stack up (max 5 min)
  const BASE_INTERVAL = 60000;
  const tick = () => {
    run();
    const backoff = Math.min(BASE_INTERVAL * Math.pow(2, consecutiveFailures), 300000);
    intervalId = window.setTimeout(tick, backoff);
  };
  // Initial run only if online
  if (navigator.onLine) {
    run();
  }
  intervalId = window.setTimeout(tick, BASE_INTERVAL);

  return () => {
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (intervalId) window.clearTimeout(intervalId);
  };
}
