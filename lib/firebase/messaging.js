import { getMessagingIfSupported } from './firebaseClient';
import { getToken, onMessage } from 'firebase/messaging';
import { setStoredPushToken } from '../push/tokenStore';

const isDev = process.env.NODE_ENV !== 'production';
const FCM_SW_VERSION = '20260614-1';

let cachedVapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';
let foregroundListenerBound = false;
let warnedMissingVapid = false;

async function ensureMessagingServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const swUrl = `/firebase-messaging-sw.js?v=${encodeURIComponent(FCM_SW_VERSION)}`;
    // Register with a specific scope to prevent conflicts with the main PWA service worker
    const reg = await navigator.serviceWorker.register(swUrl, { scope: '/firebase-cloud-messaging-push-scope' });
    await reg.update().catch(() => {});
    return reg;
  } catch (e) {
    console.warn('[push:web] service worker registration failed:', e?.message || e);
    return null;
  }
}

async function resolveVapidKey() {
  if (cachedVapidKey) return cachedVapidKey;
  if (typeof window === 'undefined') return '';
  try {
    const resp = await fetch('/api/push/web-config');
    if (!resp.ok) return '';
    const json = await resp.json();
    const key = String(json?.vapidKey || '').trim();
    if (key) cachedVapidKey = key;
    return key;
  } catch {
    return '';
  }
}

function attachForegroundNotificationHandler(messaging) {
  if (foregroundListenerBound || typeof window === 'undefined') return;
  foregroundListenerBound = true;

  onMessage(messaging, async (payload) => {
    console.log('[push:web] Foreground message received:', payload);

    if (typeof window === 'undefined') return;

    // Sound playing is now handled globally via service worker message broadcast in PushNotificationBridge to prevent duplication


    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
      const notification = payload.notification && typeof payload.notification === 'object'
        ? payload.notification
        : {};

      const title = String(data.title || notification.title || 'New Order');
      const body = String(data.body || notification.body || 'You have a new order.');
      const orderId = String(data.orderId || data.order_id || '');
      const itemsSummary = String(data.itemsSummary || payload.itemsSummary || '').trim();
      const url = data.url || payload?.fcmOptions?.link || '/owner/orders';
      const displayBody = (itemsSummary && !body.includes(itemsSummary)) ? `${body}\n${itemsSummary}` : body;

      const category = String(data.category || '').toUpperCase();

      const options = {
        body: displayBody,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: orderId ? `new-order-${orderId}` : 'new-order',
        requireInteraction: true,
        data: { url, orderId }
      };

      if (category === 'DELIVERY') {
        options.actions = [
          { action: 'accept', title: 'Accept' },
          { action: 'decline', title: 'Decline' }
        ];
      }

      const showFallback = () => {
        try {
          const notif = new Notification(title, options);
          notif.onclick = (e) => {
            e.preventDefault();
            window.focus();
            if (url) {
              window.location.href = url;
            }
            notif.close();
          };
        } catch (err) {
          console.warn('[push:web] Fallback Notification constructor failed:', err);
        }
      };

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration('/firebase-cloud-messaging-push-scope').then(reg => {
          if (reg) {
            reg.showNotification(title, options).catch(err => {
              console.warn('[push:web] SW showNotification failed, trying fallback:', err);
              showFallback();
            });
          } else {
            navigator.serviceWorker.getRegistration().then(fallbackReg => {
              if (fallbackReg) {
                fallbackReg.showNotification(title, options).catch(() => showFallback());
              } else {
                showFallback();
              }
            }).catch(() => showFallback());
          }
        }).catch(() => {
          showFallback();
        });
      } else {
        showFallback();
      }
    }
  });
}

export async function getFCMToken({ requestPermission = false } = {}) {
  if (typeof window === 'undefined') return null;
  if (!('Notification' in window)) return null;

  try {
    const registration = await ensureMessagingServiceWorker();

    const currentPermission = Notification.permission;
    const permission = requestPermission
      ? await Notification.requestPermission()
      : currentPermission;

    if (permission !== 'granted') return null;

    const vapidKey = await resolveVapidKey();
    if (!vapidKey) {
      if (!warnedMissingVapid) {
        warnedMissingVapid = true;
        console.warn('[push:web] NEXT_PUBLIC_FIREBASE_VAPID_KEY is missing');
      }
      return null;
    }

    const messaging = await getMessagingIfSupported();
    if (!messaging) return null;

    attachForegroundNotificationHandler(messaging);

    if (!registration) {
      console.warn('[push:web] No service worker registration available for FCM');
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (token) setStoredPushToken(token);
    return token || null;
  } catch (e) {
    console.error('[push:web] getToken failed:', e?.message || e);
    return null;
  }
}
