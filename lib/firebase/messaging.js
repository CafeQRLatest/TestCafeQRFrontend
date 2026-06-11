import { getMessagingIfSupported } from './firebaseClient';
import { getToken, onMessage } from 'firebase/messaging';
import { setStoredPushToken } from '../push/tokenStore';

const isDev = process.env.NODE_ENV !== 'production';
const FCM_SW_VERSION = '20260612-1';

let cachedVapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';
let foregroundListenerBound = false;
let warnedMissingVapid = false;

async function ensureMessagingServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const swUrl = `/firebase-messaging-sw.js?v=${encodeURIComponent(FCM_SW_VERSION)}`;
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) {
      const scriptUrl =
        existing.active?.scriptURL ||
        existing.waiting?.scriptURL ||
        existing.installing?.scriptURL ||
        '';
      const isMessagingSw = scriptUrl.includes('/firebase-messaging-sw.js');
      const hasCurrentVersion = scriptUrl.includes(`v=${FCM_SW_VERSION}`);

      if (!isMessagingSw || !hasCurrentVersion) {
        await existing.unregister().catch(() => { });
        return await navigator.serviceWorker.register(swUrl, { scope: '/' });
      }

      await existing.update().catch(() => { });
      return existing;
    }
    return await navigator.serviceWorker.register(swUrl, { scope: '/' });
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

    // Dispatch to custom React PushBanner component
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('new-order-push', { detail: payload }));
    }

    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;

      const title = payload?.data?.title || payload?.notification?.title || 'New Order';
      const body = payload?.data?.body || payload?.notification?.body || 'You have a new order.';
      const itemsSummary = String(payload?.data?.itemsSummary || '').trim();
      const orderId = payload?.data?.orderId || '';
      const options = {
        body: itemsSummary ? `${body}\n${itemsSummary}` : body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: orderId ? `new-order-${orderId}` : 'new-order',
        data: payload?.data || {},
      };

      try {
        const reg = await navigator.serviceWorker.getRegistration('/');
        if (reg) {
          await reg.showNotification(title, options);
          return;
        }
      } catch { }

      // Fallback
      new Notification(title, options);
    } catch (e) {
      console.warn('[push:web] foreground notification failed:', e?.message || e);
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

    const messaging = await getMessagingIfSupported(registration);
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
