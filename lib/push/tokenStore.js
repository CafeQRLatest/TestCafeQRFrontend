import { Capacitor } from '@capacitor/core';

export const PUSH_TOKEN_KEY = 'fcmtoken';
const LEGACY_PUSH_TOKEN_KEY = 'fcm_token';
const PUSH_ALERTS_DISABLED_KEY = 'push_alerts_disabled';

export function getStoredPushToken() {
  if (typeof window === 'undefined') return null;
  const primary = localStorage.getItem(PUSH_TOKEN_KEY);
  if (primary) return primary;
  const legacy = localStorage.getItem(LEGACY_PUSH_TOKEN_KEY);
  return legacy || null;
}

export function setStoredPushToken(token) {
  if (typeof window === 'undefined') return;
  const value = String(token || '').trim();
  if (!value) return;
  localStorage.setItem(PUSH_TOKEN_KEY, value);
  localStorage.setItem(LEGACY_PUSH_TOKEN_KEY, value);
}

export function clearStoredPushToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PUSH_TOKEN_KEY);
  localStorage.removeItem(LEGACY_PUSH_TOKEN_KEY);
}

export function detectPushPlatform() {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') return 'android';
  return 'web';
}

export function arePushAlertsDisabled() {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(PUSH_ALERTS_DISABLED_KEY) === '1';
}

export function setPushAlertsDisabled(disabled) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PUSH_ALERTS_DISABLED_KEY, disabled ? '1' : '0');
}

// Preference Category helpers
export function getStoredPreference(key, defaultValue = true) {
  if (typeof window === 'undefined') return defaultValue;
  const val = localStorage.getItem(key);
  if (val === null) return defaultValue;
  return val === '1';
}

export function setStoredPreference(key, value) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, value ? '1' : '0');
}
