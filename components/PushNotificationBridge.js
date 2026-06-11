import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getFCMToken } from '../lib/firebase/messaging';
import { detectPushPlatform, getStoredPreference } from '../lib/push/tokenStore';
import api from '../utils/api';

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

  return null;
}
