import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cafeqr.app.test',
  appName: 'Test Cafe QR POS',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    hostname: 'cafe-test-qr-frontend.vercel.app',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;

