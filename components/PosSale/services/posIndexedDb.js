/**
 * POS Sales IndexedDB Persistent Catalog Store
 *
 * Provides device-local persistence for the POS product catalog, categories,
 * configuration, payment modes, and tables. Data survives browser tab closes
 * and app restarts, enabling instant 0ms cold-start rendering.
 *
 * Scoped exclusively to New POS Sales (components/PosSale).
 */

const DB_NAME = 'pos_sales_db_v1';
const DB_VERSION = 1;
const STORE_NAME = 'bootstrap';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'orgId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves the persisted POS bootstrap data for the given orgId.
 * Returns null if no data is found or if IndexedDB is unavailable.
 */
export async function getPosCachedBootstrap(orgId) {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(String(orgId || ''));

      request.onsuccess = () => {
        const record = request.result;
        if (record && record.data) {
          resolve(record.data);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('POS IndexedDB read failed (graceful fallback):', err?.message);
    return null;
  }
}

/**
 * Atomically saves the POS bootstrap data for the given orgId.
 * Stores products, categories, configuration, payment modes, tables,
 * configurationVersion, and a savedAt timestamp for delta-sync checks.
 */
export async function savePosCachedBootstrap(orgId, bootstrapData) {
  try {
    if (!bootstrapData) return;
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const record = {
        orgId: String(orgId || ''),
        data: bootstrapData,
        savedAt: Date.now()
      };

      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('POS IndexedDB write failed (graceful fallback):', err?.message);
  }
}

/**
 * Clears the persisted POS bootstrap for the given orgId.
 * Used on branch switch or manual cache reset.
 */
export async function clearPosCachedBootstrap(orgId) {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(String(orgId || ''));
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('POS IndexedDB clear failed (graceful fallback):', err?.message);
  }
}

/**
 * Completely clears all cached bootstrap data from IndexedDB across all orgs,
 * and deletes the database.
 */
export async function clearAllPosCache() {
  try {
    if (typeof indexedDB === 'undefined') return;
    return new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(true);
    });
  } catch (err) {
    console.warn('POS IndexedDB clear all failed:', err?.message);
    return false;
  }
}

