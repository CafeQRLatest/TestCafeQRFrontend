const DB_NAME = 'cafeqr-offline';
const DB_VERSION = 1;

const RESPONSE_STORE = 'apiResponses';
const QUEUE_STORE = 'syncQueue';
const META_STORE = 'syncMetadata';
const ENTITY_STORE = 'entities';

const isBrowser = () => typeof window !== 'undefined' && typeof indexedDB !== 'undefined';

let dbPromise;

function openOfflineDb() {
  if (!isBrowser()) {
    return Promise.resolve(null);
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(RESPONSE_STORE)) {
        db.createObjectStore(RESPONSE_STORE, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const queue = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        queue.createIndex('status', 'status', { unique: false });
        queue.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(ENTITY_STORE)) {
        const entities = db.createObjectStore(ENTITY_STORE, { keyPath: 'storeKey' });
        entities.createIndex('collection', 'collection', { unique: false });
        entities.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function runStore(storeName, mode, callback) {
  return openOfflineDb().then((db) => {
    if (!db) {
      return undefined;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const result = callback(store);

      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function stableJson(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (value instanceof URLSearchParams) {
    return stableJson(Object.fromEntries(value.entries()));
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }

  return `{${Object.keys(value).sort().map((key) => `${key}:${stableJson(value[key])}`).join(',')}}`;
}

function normalizeUrl(config = {}) {
  const rawUrl = config.url || '';
  try {
    const url = new URL(rawUrl, config.baseURL || window.location.origin);
    return `${url.origin}${url.pathname}`;
  } catch {
    return `${config.baseURL || ''}${rawUrl}`;
  }
}

function contextKey(config = {}) {
  const headers = config.headers || {};
  const clientId = headers['X-Client-ID'] || headers['x-client-id'] || '0';
  const orgId = headers['X-Org-ID'] || headers['x-org-id'] || '0';
  const terminalId = headers['X-Terminal-ID'] || headers['x-terminal-id'] || '0';
  return `${clientId}:${orgId}:${terminalId}`;
}

export function getApiCacheKey(config = {}) {
  const method = (config.method || 'get').toUpperCase();
  return [
    method,
    normalizeUrl(config),
    stableJson(config.params),
    contextKey(config),
  ].join('|');
}

function normalizePath(config = {}) {
  const rawUrl = config.url || '';
  try {
    return new URL(rawUrl, config.baseURL || window.location.origin).pathname;
  } catch {
    return rawUrl.split('?')[0];
  }
}

export function isOfflineCacheableGet(config = {}) {
  const method = (config.method || 'get').toLowerCase();
  if (method !== 'get' || config.skipOfflineCache) {
    return false;
  }

  const path = normalizePath(config);
  return path.startsWith('/api/v1/')
    && !path.startsWith('/api/v1/auth/')
    && !path.startsWith('/api/v1/debug/')
    && !path.startsWith('/api/v1/sync/');
}

export function isOfflineQueueableMutation(config = {}) {
  const method = (config.method || 'get').toLowerCase();
  if (!['post', 'put', 'patch', 'delete'].includes(method) || config.skipOfflineQueue) {
    return false;
  }

  const path = normalizePath(config);
  return path.startsWith('/api/v1/')
    && !path.startsWith('/api/v1/auth/')
    && !path.startsWith('/api/v1/debug/')
    && !path.startsWith('/api/v1/sync/')
    && !path.startsWith('/api/v1/public/')
    && !path.includes('/payment');
}

export async function cacheApiResponse(config, data) {
  if (!isOfflineCacheableGet(config)) {
    return;
  }

  const record = {
    key: getApiCacheKey(config),
    url: normalizeUrl(config),
    path: normalizePath(config),
    params: config.params || null,
    context: contextKey(config),
    data,
    cachedAt: new Date().toISOString(),
  };

  await runStore(RESPONSE_STORE, 'readwrite', (store) => store.put(record));
}

export async function getCachedApiResponse(config) {
  if (!isOfflineCacheableGet(config)) {
    return null;
  }

  const key = getApiCacheKey(config);
  const record = await runStore(RESPONSE_STORE, 'readonly', (store) => requestToPromise(store.get(key)));
  return record || null;
}

function parsePayload(data) {
  if (data == null || data === '') {
    return null;
  }
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
}

function getEntityName(path) {
  const parts = path.split('/').filter(Boolean);
  const apiIndex = parts.indexOf('v1');
  return apiIndex >= 0 ? parts[apiIndex + 1] || 'unknown' : parts[0] || 'unknown';
}

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function enqueueOfflineMutation(config) {
  if (!isOfflineQueueableMutation(config)) {
    return null;
  }

  const path = normalizePath(config);
  const payload = parsePayload(config.data);
  const id = config.offlineOperationId || createId();
  const now = new Date().toISOString();

  const record = {
    id,
    operationId: id,
    method: (config.method || 'post').toUpperCase(),
    url: config.url || path,
    path,
    params: config.params || null,
    entity: getEntityName(path),
    payload,
    status: 'PENDING',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };

  await runStore(QUEUE_STORE, 'readwrite', (store) => store.put(record));
  return record;
}

export async function getQueuedOperations() {
  const records = await runStore(QUEUE_STORE, 'readonly', async (store) => {
    const all = await requestToPromise(store.getAll());
    return all || [];
  });

  return (records || [])
    .filter((item) => item.status !== 'SYNCED')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export async function markOperationSynced(id, result) {
  await runStore(QUEUE_STORE, 'readwrite', async (store) => {
    const current = await requestToPromise(store.get(id));
    if (!current) return;
    current.status = 'SYNCED';
    current.result = result || null;
    current.updatedAt = new Date().toISOString();
    store.put(current);
  });
}

export async function markOperationFailed(id, errorMessage) {
  await runStore(QUEUE_STORE, 'readwrite', async (store) => {
    const current = await requestToPromise(store.get(id));
    if (!current) return;
    current.status = 'PENDING';
    current.attempts = (current.attempts || 0) + 1;
    current.lastError = errorMessage || 'Sync failed';
    current.updatedAt = new Date().toISOString();
    store.put(current);
  });
}

export async function getSyncMetadata(key) {
  const record = await runStore(META_STORE, 'readonly', (store) => requestToPromise(store.get(key)));
  return record?.value;
}

export async function setSyncMetadata(key, value) {
  await runStore(META_STORE, 'readwrite', (store) => store.put({
    key,
    value,
    updatedAt: new Date().toISOString(),
  }));
}

export async function upsertEntities(collection, items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  await runStore(ENTITY_STORE, 'readwrite', (store) => {
    items.forEach((item) => {
      if (!item || !item.id) return;
      store.put({
        storeKey: `${collection}:${item.id}`,
        collection,
        id: item.id,
        data: item,
        updatedAt: new Date().toISOString(),
      });
    });
  });
}

export async function getEntities(collection) {
  return runStore(ENTITY_STORE, 'readonly', async (store) => {
    const index = store.index('collection');
    const records = await requestToPromise(index.getAll(collection));
    return (records || []).map((record) => record.data);
  }) || [];
}

export function isProbablyOfflineError(error) {
  return !!error?.config && !error.response;
}

export async function getPendingSyncCount() {
  const records = await runStore(QUEUE_STORE, 'readonly', async (store) => {
    const index = store.index('status');
    const items = await requestToPromise(index.getAll('PENDING'));
    return items || [];
  });
  return (records || []).length;
}

export async function getConflictEntries() {
  const records = await runStore(QUEUE_STORE, 'readonly', async (store) => {
    const index = store.index('status');
    const items = await requestToPromise(index.getAll('CONFLICT'));
    return items || [];
  });
  return (records || []).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function markOperationConflict(id, errorMessage) {
  await runStore(QUEUE_STORE, 'readwrite', async (store) => {
    const current = await requestToPromise(store.get(id));
    if (!current) return;
    current.status = 'CONFLICT';
    current.lastError = errorMessage || 'Sync conflict';
    current.updatedAt = new Date().toISOString();
    store.put(current);
  });
}

export async function markOperationPending(id) {
  await runStore(QUEUE_STORE, 'readwrite', async (store) => {
    const current = await requestToPromise(store.get(id));
    if (!current) return;
    current.status = 'PENDING';
    current.attempts = 0;
    current.updatedAt = new Date().toISOString();
    store.put(current);
  });
}

export async function discardSyncQueueEntry(id) {
  await runStore(QUEUE_STORE, 'readwrite', (store) => store.delete(id));
}

export async function getLastSyncTime() {
  return getSyncMetadata('lastSyncTime');
}

export async function setLastSyncTime(time) {
  return setSyncMetadata('lastSyncTime', time || new Date().toISOString());
}
