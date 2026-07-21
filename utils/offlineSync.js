import api, { getApiUrl } from './api';
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
let lastKnownPendingCount = 0;

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
    baseURL: getApiUrl() || '',
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
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem('cafeqr_offline_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.autoSyncEnabled === false) {
          console.info('[Offline Sync] Sync disabled via configurations.');
          return { skipped: true, disabled: true };
        }
      }
    } catch (e) {}
  }

  if (syncInFlight || !isOnline()) {
    return { skipped: true };
  }

  syncInFlight = true;

  try {
    const operations = await getQueuedOperations();
    if (!operations.length) {
      console.info('[Offline Sync] Queue empty — nothing to push.');
      lastKnownPendingCount = 0;
      return { pushed: 0 };
    }

    console.info(`[Offline Sync] Starting push of ${operations.length} queued operations.`);

    // Split into legacy batch operations and direct native endpoint operations
    const legacyEntities = ['products', 'categories', 'uoms', 'variantGroups', 'variants', 'tables', 'orders', 'configurations'];
    const batchOperations = operations.filter(op => legacyEntities.includes(op.entity) || !op.entity || op.entity === 'unknown');
    const directOperations = operations.filter(op => !batchOperations.includes(op));

    let pushedCount = 0;
    const results = [];

    // 1. Process batch operations via the unified /sync/push endpoint
    if (batchOperations.length > 0) {
      console.info(`[Offline Sync] Pushing ${batchOperations.length} batch operations to /sync/push`);
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

      console.info(`[Offline Sync] Server returned ${batchResults.length} results for batch push.`);

      for (const result of batchResults) {
        const opId = result.operationId;
        try {
          if (result.success) {
            await markOperationSynced(opId, result);
            console.info(`[Offline Sync]   ✓ ${opId} synced.`);
          } else if (result.status === 'REJECTED' || result.status === 'FAILED_PERMANENT' || result.status === 'SKIPPED_DEPENDENCY') {
            // Permanent failures — mark as conflict so user can review/discard
            await markOperationConflict(opId, result.message);
            console.warn(`[Offline Sync]   ✗ ${opId} permanent failure (${result.status}): ${result.message}`);
          } else {
            // FAILED_RETRYABLE or any other status — keep retrying
            await markOperationFailed(opId, result.message);
            console.warn(`[Offline Sync]   ⚠ ${opId} retryable failure (${result.status}): ${result.message}`);
          }
        } catch (markErr) {
          console.error(`[Offline Sync]   ✗ Failed to update IndexedDB status for ${opId}:`, markErr);
        }
      }

      pushedCount += batchOperations.length;
      results.push(...batchResults);
      
      if (data?.serverTime) {
        await setSyncMetadata('lastSuccessfulSyncAt', data.serverTime);
      }
    }

    // 2. Process secondary entity operations directly against their native REST endpoints
    for (const op of directOperations) {
      try {
        console.info(`[Offline Sync] Direct push: ${op.method} ${op.url}`);
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
        console.info(`[Offline Sync]   ✓ ${op.operationId} synced.`);
      } catch (err) {
        const status = err.response?.status;
        const msg = err.response?.data?.message || err.message;
        console.warn(`[Offline Sync]   ✗ ${op.operationId} error (HTTP ${status || 'N/A'}): ${msg}`);
        
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
    lastKnownPendingCount = results.filter(r => !r.success).length;
    console.info(`[Offline Sync] Push complete. Pushed=${pushedCount}, Remaining=${lastKnownPendingCount}`);
    emitSyncEvent('cafeqr-sync-complete', { pushed: pushedCount, results });

    return { pushed: pushedCount, results };
  } finally {
    syncInFlight = false;
  }
}

export async function reconnectAndSync() {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem('cafeqr_offline_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.autoSyncEnabled === false) {
          return { skipped: true, disabled: true };
        }
      }
    } catch (e) {}
  }

  if (!canAttemptNetworkProbe()) {
    return { skipped: true, offline: true };
  }

  if (reconnectInFlight) {
    return reconnectInFlight;
  }

  reconnectInFlight = (async () => {
    try {
      // Step 1: Always attempt to push queued operations first
      const syncResult = await syncQueuedOperations();

      // Step 2: Try to pull changes after pushing enqueued changes
      let changes = null;
      try {
        changes = await refreshOfflineChanges({ forceProbe: true });
        markConnectionOnline();
      } catch (changesError) {
        console.warn('[Offline Sync] Failed to pull changes after push:', changesError?.message);
        if (changesError?.response) {
          // Got a response — server is reachable, we're online
          markConnectionOnline();
        } else {
          const offlineReason = getOfflineReasonFromError(changesError);
          if (offlineReason) {
            markConnectionLost(offlineReason);
          }
        }
      }

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

  // Fix 5: Warn user before closing tab/app when there are pending sync operations
  const handleBeforeUnload = (e) => {
    if (lastKnownPendingCount > 0) {
      e.preventDefault();
      e.returnValue = `You have ${lastKnownPendingCount} unsent offline orders. Closing now may result in data loss.`;
      return e.returnValue;
    }
  };
  window.addEventListener('beforeunload', handleBeforeUnload);

  // Track pending count from queue change events for the beforeunload guard
  const trackPending = async () => {
    try {
      const ops = await getQueuedOperations();
      lastKnownPendingCount = ops.length;
    } catch (_) {}
  };
  window.addEventListener('cafeqr-sync-queue-changed', trackPending);
  trackPending(); // initial count

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('cafeqr-network-state', handleNetworkState);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('cafeqr-sync-queue-changed', trackPending);
    if (intervalId) window.clearTimeout(intervalId);
  };
}
