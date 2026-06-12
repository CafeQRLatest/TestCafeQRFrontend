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

    // Dispatch to custom React PushBanner component
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('new-order-push', { detail: payload }));
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
