import "@/styles/globals.css";
import Head from 'next/head';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { NotificationProvider } from '../context/NotificationContext';
import SubscriptionGate from '../components/SubscriptionGate';
import GlobalUI from '../components/GlobalUI';
import PwaLifecycle from '../components/PwaLifecycle';
import CloudPrintStation from '../components/CloudPrintStation';
import PushNotificationBridge from '../components/PushNotificationBridge';

function GlobalPrintStation() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return null;
  return <CloudPrintStation />;
}

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <NotificationProvider>
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        </Head>
        <SubscriptionGate>
          <Component {...pageProps} />
          <GlobalPrintStation />
        </SubscriptionGate>
        <PwaLifecycle />
        <GlobalUI />
        <PushNotificationBridge />
      </NotificationProvider>
    </AuthProvider>
  );
}
