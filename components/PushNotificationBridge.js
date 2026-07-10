import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getFCMToken } from '../lib/firebase/messaging';
import { detectPushPlatform, getStoredPreference } from '../lib/push/tokenStore';
import api from '../utils/api';
import { playSoundAlert, startDeliveryAlarm, stopDeliveryAlarm } from '../utils/audio';
import { Capacitor } from '@capacitor/core';

export default function PushNotificationBridge() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;

    const initPush = async () => {
      if (process.env.NEXT_PUBLIC_API_URL) {
        document.cookie = `api_url=${encodeURIComponent(process.env.NEXT_PUBLIC_API_URL)}; path=/; max-age=31536000; SameSite=Lax`;
      }
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

  // Listen to native push notification events for custom sound and Accept/Decline action buttons
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let receivedListener = null;
    let actionListener = null;

    const setupNativePush = async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        // 1. Create channels for Android custom sounds.
        // Once created, these channels register sound files located in res/raw (without file extension)
        const channels = [
          {
            id: 'channel_kitchen',
            name: 'Kitchen Orders',
            description: 'Notifications for new kitchen/dine-in orders',
            sound: 'kitchen',
            importance: 5, // High
            visibility: 1, // Public
            vibration: true,
          },
          {
            id: 'channel_takeaway',
            name: 'Takeaway Orders',
            description: 'Notifications for new takeaway/parcel orders',
            sound: 'takeaway',
            importance: 5, // High
            visibility: 1, // Public
            vibration: true,
          },
          {
            id: 'channel_delivery',
            name: 'Delivery Orders',
            description: 'Notifications for new delivery orders',
            sound: 'delivery',
            importance: 5, // High
            visibility: 1, // Public
            vibration: true,
          },
          {
            id: 'channel_settle',
            name: 'Settled Orders',
            description: 'Notifications for settled orders',
            sound: 'settle',
            importance: 5, // High
            visibility: 1, // Public
            vibration: true,
          },
        ];

        for (const channel of channels) {
          await PushNotifications.createChannel(channel);
        }
        console.log('[PushBridge] Native notification channels verified/created.');

        // 2. Register native action category for Delivery orders (adds Accept/Decline buttons)
        await PushNotifications.registerActionTypes({
          types: [
            {
              id: 'DELIVERY_ACTIONS',
              actions: [
                {
                  id: 'accept',
                  title: 'Accept',
                  foreground: true,
                },
                {
                  id: 'decline',
                  title: 'Decline',
                  foreground: true,
                },
              ],
            },
          ],
        });
        console.log('[PushBridge] Native delivery action categories registered.');

        // 3. Play sounds for push notifications received while the app is in the foreground
        receivedListener = await PushNotifications.addListener(
          'pushNotificationReceived',
          (notification) => {
            console.log('[PushBridge] Native foreground notification received:', notification);
            const data = notification.data || {};
            const category = String(data.category || '').toUpperCase();
            const orderId = String(data.orderId || data.order_id || 'generic');
            const type = String(data.type || 'new_order').toLowerCase();

            // Play sound (loop for Delivery, play once for others)
            if (category === 'DELIVERY') {
              startDeliveryAlarm(orderId);
            } else {
              playSoundAlert(type, category);
            }
          }
        );

        // 4. Handle user interactions with native push notifications (button clicks & taps)
        actionListener = await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          async (action) => {
            console.log('[PushBridge] Native push action performed:', action);
            const data = action.notification?.data || {};
            const orderId = String(data.orderId || data.order_id || '');

            // Silence the delivery alarm if ringing
            if (orderId) {
              stopDeliveryAlarm(orderId);
            }

            if (action.actionId === 'accept' && orderId) {
              try {
                await api.patch(`/api/v1/orders/${orderId}/status?status=CONFIRMED`);
                console.log('[PushBridge] Successfully accepted order natively:', orderId);
              } catch (err) {
                console.error('[PushBridge] Failed to accept order natively:', err);
              }
            } else if (action.actionId === 'decline' && orderId) {
              try {
                await api.post(`/api/v1/orders/${orderId}/cancel`, {
                  reason: 'Declined via push notification',
                });
                console.log('[PushBridge] Successfully declined order natively:', orderId);
              } catch (err) {
                console.error('[PushBridge] Failed to decline order natively:', err);
              }
            }

            // Always navigate to the orders page upon notification interaction
            if (typeof window !== 'undefined') {
              window.location.href = '/owner/orders';
            }
          }
        );

      } catch (err) {
        console.error('[PushBridge] Failed to initialize native push config:', err);
      }
    };

    setupNativePush();

    return () => {
      if (receivedListener) receivedListener.remove();
      if (actionListener) actionListener.remove();
    };
  }, []);

  return null;
}
