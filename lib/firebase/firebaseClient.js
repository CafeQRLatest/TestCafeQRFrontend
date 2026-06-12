import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};

function ensureClientApp() {
  if (typeof window === 'undefined') return null;
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export const firebaseApp = ensureClientApp();

export async function getMessagingIfSupported() {
  if (typeof window === 'undefined') return null;
  try {
    const supported = await isSupported();
    if (!supported) {
      console.warn('[push:web] Firebase messaging isSupported() returned false.');
      return null;
    }
    const app = firebaseApp ?? ensureClientApp();
    if (!app) return null;
    return getMessaging(app);
  } catch (e) {
    console.warn('[push:web] getMessagingIfSupported error:', e);
    return null;
  }
}
