/* global self, clients, importScripts */

const DEFAULT_ICON = '/icons/icon-192.png';
const DEFAULT_BADGE = '/icons/icon-192.png';
const DEFAULT_URL = '/owner/orders';

try {
  importScripts('/api/push/sw-config');
} catch (e) {
  console.warn('[fcm-sw] Failed to import scripts:', e);
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients?.claim?.() || Promise.resolve());
});

function parsePushData(event) {
  if (!event?.data) return {};
  try {
    return event.data.json() || {};
  } catch {
    try {
      const text = event.data.text();
      return text ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  }
}

async function getCookieValue(cookieName) {
  if (typeof self.cookieStore !== 'undefined') {
    try {
      const cookie = await self.cookieStore.get(cookieName);
      return cookie ? decodeURIComponent(cookie.value) : null;
    } catch (e) {
      console.warn(`[fcm-sw] Failed to read cookie ${cookieName}:`, e);
    }
  }
  return null;
}

async function getApiBaseUrl() {
  const config = self.__FIREBASE_SW_CONFIG;
  if (config && config.apiUrl) {
    return config.apiUrl.replace(/\/$/, '');
  }
  const cookieUrl = await getCookieValue('api_url');
  if (cookieUrl) {
    return cookieUrl.replace(/\/$/, '');
  }
  return self.location.origin;
}

async function getAccessToken() {
  return getCookieValue('access_token');
}

function normalizeUrl(rawUrl) {
  const candidate = String(rawUrl || '').trim();
  if (!candidate) return DEFAULT_URL;
  try {
    const normalized = new URL(candidate, self.location.origin);
    return `${normalized.pathname}${normalized.search}`;
  } catch {
    return DEFAULT_URL;
  }
}

function normalizePushPayload(raw) {
  const payload = raw && typeof raw === 'object' ? raw : {};
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const notification = payload.notification && typeof payload.notification === 'object'
    ? payload.notification
    : {};

  const title = String(data.title || notification.title || 'New Order');
  const body = String(data.body || notification.body || 'You have a new order.');
  const orderId = String(data.orderId || data.order_id || '');
  const restaurantId = String(data.restaurantId || data.restaurant_id || data.rid || '');
  const itemsSummary = String(data.itemsSummary || payload.itemsSummary || '').trim();
  const type = String(data.type || 'new_order').toLowerCase();
  const url = normalizeUrl(data.url || payload?.fcmOptions?.link || DEFAULT_URL);

  return {
    title,
    body,
    url,
    orderId,
    restaurantId,
    itemsSummary,
    type,
    data: {
      ...data,
      title,
      body,
      url,
      orderId,
      restaurantId,
      itemsSummary,
      type,
    },
  };
}

function buildNotificationOptions(detail) {
  const tag = detail.orderId ? `new-order-${detail.orderId}` : 'new-order';
  let body = detail.body;
  if (detail.itemsSummary && !body.includes(detail.itemsSummary)) {
    body = `${body}\n${detail.itemsSummary}`;
  }
  const type = String(detail.type || '').toLowerCase();
  const category = String(detail.data?.category || '').toUpperCase();
  let soundPath = '/sounds/kitchen.mp3';
  if (type === 'order_settled') {
    soundPath = '/sounds/settle.mp3';
  } else if (category === 'DELIVERY') {
    soundPath = '/sounds/delivery.mp3';
  } else if (category === 'TAKEAWAY' || category === 'PARCEL') {
    soundPath = '/sounds/takeaway.mp3';
  }

  const options = {
    body,
    icon: DEFAULT_ICON,
    badge: DEFAULT_BADGE,
    tag,
    silent: false,
    sound: soundPath,
    renotify: true,
    requireInteraction: true,
    vibrate: [220, 120, 220, 120, 220],
    data: {
      ...detail.data,
      url: detail.url,
      orderId: detail.orderId,
      restaurantId: detail.restaurantId,
      itemsSummary: detail.itemsSummary,
      type: detail.type,
    },
  };

  // Add Accept/Decline action buttons exclusively for Delivery orders
  if (category === 'DELIVERY') {
    options.actions = [
      { action: 'accept', title: 'Accept' },
      { action: 'decline', title: 'Decline' }
    ];
  }

  return options;
}

async function safeShowNotification(title, options) {
  try {
    await self.registration.showNotification(title || 'New Order', options || {});
  } catch (e) {
    console.warn('[fcm-sw] showNotification failed:', e?.message || e);
  }
}

async function postToClients(message) {
  try {
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      client.postMessage(message);
    }
  } catch (e) {
    console.warn('[fcm-sw] postToClients failed:', e?.message || e);
  }
}

self.addEventListener('push', (event) => {
  const raw = parsePushData(event);
  const detail = normalizePushPayload(raw);
  const options = buildNotificationOptions(detail);

  event.waitUntil(
    (async () => {
      await postToClients({ type: 'new-order-push', payload: detail });
      await safeShowNotification(detail.title, options);
    })()
  );
});

self.addEventListener('notificationclose', (event) => {
  const data = event?.notification?.data || {};
  event.waitUntil(
    postToClients({
      type: 'stop-order-alarm',
      orderId: String(data.orderId || ''),
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event?.notification?.data || {};
  const orderId = String(data.orderId || '');
  const relativeUrl = data.url || DEFAULT_URL;

  // Handle Accept Action
  if (event.action === 'accept' && orderId) {
    event.waitUntil(
      (async () => {
        try {
          await postToClients({ type: 'stop-order-alarm', orderId });
          const apiBaseUrl = await getApiBaseUrl();
          const token = await getAccessToken();
          const headers = {
            'Content-Type': 'application/json'
          };
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          const response = await fetch(`${apiBaseUrl}/api/v1/orders/${orderId}/status?status=CONFIRMED`, {
            method: 'PATCH',
            credentials: 'include',
            headers
          });
          if (!response.ok) {
            throw new Error(`Failed to accept order: ${response.status}`);
          }
          console.log('[fcm-sw] Successfully accepted order:', orderId);
          await postToClients({ type: 'order-updated', orderId, status: 'CONFIRMED' });
        } catch (e) {
          console.error('[fcm-sw] Error accepting order:', e);
        }
      })()
    );
    return;
  }

  // Handle Decline Action
  if (event.action === 'decline' && orderId) {
    event.waitUntil(
      (async () => {
        try {
          await postToClients({ type: 'stop-order-alarm', orderId });
          const apiBaseUrl = await getApiBaseUrl();
          const token = await getAccessToken();
          const headers = {
            'Content-Type': 'application/json'
          };
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          const response = await fetch(`${apiBaseUrl}/api/v1/orders/${orderId}/cancel`, {
            method: 'POST',
            credentials: 'include',
            headers,
            body: JSON.stringify({ reason: 'Declined via push notification' })
          });
          if (!response.ok) {
            throw new Error(`Failed to decline order: ${response.status}`);
          }
          console.log('[fcm-sw] Successfully declined order:', orderId);
          await postToClients({ type: 'order-updated', orderId, status: 'CANCELLED' });
        } catch (e) {
          console.error('[fcm-sw] Error declining order:', e);
        }
      })()
    );
    return;
  }

  // Default notification click behavior (focus and navigate)
  const urlToOpen = new URL(relativeUrl, self.location.origin).toString();

  event.waitUntil(
    (async () => {
      await postToClients({ type: 'stop-order-alarm', orderId });
      const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of list) {
        if ('focus' in c && c.url?.includes(self.location.origin)) {
          await c.focus();
          if (c.navigate) await c.navigate(urlToOpen);
          return;
        }
      }
      if (clients.openWindow) {
        await clients.openWindow(urlToOpen);
      }
    })()
  );
});
