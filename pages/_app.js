import "@/styles/globals.css";
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { NotificationProvider } from '../context/NotificationContext';
import SubscriptionGate from '../components/SubscriptionGate';
import GlobalUI from '../components/GlobalUI';
import PwaLifecycle from '../components/PwaLifecycle';
import PushNotificationBridge from '../components/PushNotificationBridge';
import AppUpdateBridge from '../components/AppUpdateBridge';

export default function App({ Component, pageProps }) {
  const router = useRouter();

  useEffect(() => {
    console.log('[App Router] Current route:', router.pathname, 'query:', router.query);
    const handleRouteStart = (url) => console.log('[App Router] Navigation starting to:', url);
    const handleRouteComplete = (url) => console.log('[App Router] Navigation completed to:', url);
    const handleRouteError = (err, url) => console.error('[App Router] Navigation error to:', url, err);

    router.events.on('routeChangeStart', handleRouteStart);
    router.events.on('routeChangeComplete', handleRouteComplete);
    router.events.on('routeChangeError', handleRouteError);

    return () => {
      router.events.off('routeChangeStart', handleRouteStart);
      router.events.off('routeChangeComplete', handleRouteComplete);
      router.events.off('routeChangeError', handleRouteError);
    };
  }, [router]);

  return (
    <AuthProvider>
      <NotificationProvider>
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        </Head>
        <SubscriptionGate>
          <Component {...pageProps} />
        </SubscriptionGate>
        <PwaLifecycle />
        <GlobalUI />
        <PushNotificationBridge />
        <AppUpdateBridge />
      </NotificationProvider>
    </AuthProvider>
  );
}
