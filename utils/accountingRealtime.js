export const ACCOUNTING_REALTIME_EVENT = 'cafeqr:accounting-data-changed';

const CHANNEL_NAME = 'cafeqr-accounting-realtime';
const STORAGE_KEY = 'cafeqr-accounting-data-changed';
const MAX_SEEN_EVENTS = 50;

function makePayload(detail = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    source: 'unknown',
    at: Date.now(),
    ...detail
  };
}

export function publishAccountingDataChanged(detail = {}) {
  if (typeof window === 'undefined') return;

  const payload = makePayload(detail);
  window.dispatchEvent(new CustomEvent(ACCOUNTING_REALTIME_EVENT, { detail: payload }));

  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore browsers or modes that block storage access.
  }

  if ('BroadcastChannel' in window) {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(payload);
      channel.close();
    } catch {
      // Storage and same-tab events still cover the common local workflows.
    }
  }
}

export function subscribeAccountingDataChanged(callback) {
  if (typeof window === 'undefined' || typeof callback !== 'function') return () => {};

  const seen = [];
  const handlePayload = (payload = {}) => {
    if (payload.id) {
      if (seen.includes(payload.id)) return;
      seen.push(payload.id);
      if (seen.length > MAX_SEEN_EVENTS) seen.shift();
    }
    callback(payload);
  };

  const handleEvent = (event) => handlePayload(event.detail || {});
  const handleStorage = (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      handlePayload(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed storage events from older app versions.
    }
  };

  let channel = null;
  const handleMessage = (event) => handlePayload(event.data || {});

  window.addEventListener(ACCOUNTING_REALTIME_EVENT, handleEvent);
  window.addEventListener('storage', handleStorage);

  if ('BroadcastChannel' in window) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener('message', handleMessage);
    } catch {
      channel = null;
    }
  }

  return () => {
    window.removeEventListener(ACCOUNTING_REALTIME_EVENT, handleEvent);
    window.removeEventListener('storage', handleStorage);
    if (channel) {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    }
  };
}
