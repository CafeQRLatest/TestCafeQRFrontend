import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getFCMToken } from '../lib/firebase/messaging';
import { detectPushPlatform, getStoredPreference } from '../lib/push/tokenStore';
import api from '../utils/api';
import { playSoundAlert, startDeliveryAlarm, stopDeliveryAlarm } from '../utils/audio';

export default function PushNotificationBridge() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;

    const initPush = async () => {
      try {
        // Retrieve current token silently (requestPermission = false)
        const token = await getFCMToken({ requestPermission: false });
        if (!token) {
          console.log('[PushBridge] No push notification token registered yet or permission not granted.');
          return;
        }

        // Get stored category preferences
        const notifyKitchen = getStoredPreference('push_notify_kitchen', true);
        const notifyTakeaway = getStoredPreference('push_notify_takeaway', true);
        const notifyDelivery = getStoredPreference('push_notify_delivery', true);
        const notifySettled = getStoredPreference('push_notify_settled', true);

        // Register token with backend
        await api.post('/api/v1/push/subscribe', {
          deviceToken: token,
          platform: detectPushPlatform(),
          notifyKitchen,
          notifyTakeaway,
          notifyDelivery,
          notifySettled
        });
        console.log('[PushBridge] Successfully synced device token with backend.');
      } catch (err) {
        console.warn('[PushBridge] Failed to register push token:', err?.message || err);
      }
    };

    // Wait slightly for app shell to mount
    const timer = setTimeout(initPush, 3000);
    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  // Listen to service worker push events for sound playing and multi-tab deduplication
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleSWMessage = (event) => {
      if (!event.data) return;

      const { type, payload, orderId } = event.data;

      // Handle custom sound playback
      if (type === 'new-order-push') {
        const detail = payload || {};
        const soundOrderId = detail.orderId || 'generic';
        
        // Multi-Tab Deduplication Guard:
        // Use localStorage timestamp to verify if this order's sound has already been triggered in another tab recently.
        const lastPlayedKey = `cafeqr_sound_played_${soundOrderId}`;
        const lastPlayedTime = localStorage.getItem(lastPlayedKey);
        const now = Date.now();
        
        if (lastPlayedTime && (now - Number(lastPlayedTime)) < 4000) {
          console.log(`[PushBridge] Sound alert for order ${soundOrderId} already played in another tab.`);
          return;
        }
        
        localStorage.setItem(lastPlayedKey, String(now));

        // Play sound (loop for Delivery, play once for Kitchen/Takeaway/Settle)
        const category = String(detail.category || '').toUpperCase();
        if (category === 'DELIVERY') {
          startDeliveryAlarm(soundOrderId);
        } else {
          playSoundAlert(detail.type, detail.category);
        }
      }

      // Stop alarm signal received from service worker when notification is dismissed or clicked
      if (type === 'stop-order-alarm') {
        const alarmOrderId = orderId || event.data.orderId;
        if (alarmOrderId) {
          stopDeliveryAlarm(alarmOrderId);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    };
  }, []);

  return null;
}
