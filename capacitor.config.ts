import type { CapacitorConfig } from '@capacitor/cli';

const isProd = process.env.APP_ENV === 'prod' || process.env.NEXT_PUBLIC_APP_ENV === 'prod';

const config: CapacitorConfig = {
  appId: isProd ? 'com.cafeqr.app' : 'com.cafeqr.app.test',
  appName: isProd ? 'Cafe QR POS' : 'Test Cafe QR POS',
  webDir: 'out',
  loggingBehavior: 'debug',
  server: {
    androidScheme: 'https',
    hostname: isProd ? 'pos.cafeqr.in' : 'cafe-test-qr-frontend.vercel.app',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;

