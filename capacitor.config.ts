import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cafeqr.app.test',
  appName: 'Test Cafe QR POS',
  webDir: 'out',
  server: {
    // ── Remote loading (current: Vercel | production: switch to Hostinger) ──
    // The APK loads the live web app, so code updates deploy instantly.
    // Offline capability is handled by the app's IndexedDB + offlineStore.js layer.
    //
    // For production launch, change this URL to your Hostinger domain:
    //   url: 'https://your-domain.hostinger.com',
    //   allowNavigation: ['your-domain.hostinger.com'],
    url: 'https://cafe-test-qr-frontend.vercel.app',
    androidScheme: 'https',
    allowNavigation: ['cafe-test-qr-frontend.vercel.app'],
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;

