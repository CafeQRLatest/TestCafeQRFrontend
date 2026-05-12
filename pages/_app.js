import "@/styles/globals.css";
import Head from 'next/head';
import { AuthProvider } from '../context/AuthContext';
import { NotificationProvider } from '../context/NotificationContext';
import SubscriptionGate from '../components/SubscriptionGate';
import GlobalUI from '../components/GlobalUI';
import PwaLifecycle from '../components/PwaLifecycle';

export default function App({ Component, pageProps }) {
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
      </NotificationProvider>
    </AuthProvider>
  );
}
