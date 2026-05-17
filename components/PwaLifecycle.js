import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import { refreshOfflineChanges, registerOfflineSyncListeners } from '../utils/offlineSync';
import { isKnownOffline } from '../utils/networkState';

const PUBLIC_ROUTE_PREFIXES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/subscription',
  '/menu',
  '/qr',
  '/public',
  '/customer-menu',
];

const isPublicRoute = (pathname = '') => {
  return PUBLIC_ROUTE_PREFIXES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
};

export default function PwaLifecycle() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState(null);
  const router = useRouter();
  const auth = useAuth();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    if ('serviceWorker' in navigator) {
      const shouldRegister = process.env.NODE_ENV === 'production'
        || window.location.search.includes('sw=1');

      if (shouldRegister) {
        navigator.serviceWorker.register('/service-worker.js').then((registration) => {
          if (registration.waiting) {
            setWaitingWorker(registration.waiting);
            setUpdateReady(true);
          }

          registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            if (!worker) return;

            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                setWaitingWorker(worker);
                setUpdateReady(true);
              }
            });
          });
        }).catch((error) => {
          console.warn('[PWA] Service worker registration failed:', error?.message || error);
        });
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || auth?.loading || isPublicRoute(router.pathname)) {
      return undefined;
    }

    const hasAccessToken = Boolean(Cookies.get('access_token'));
    const validClient = Boolean(auth?.clientId && auth.clientId !== '0');
    const validUser = Boolean(auth?.userId && auth.userId !== '0');
    const canRunSync = auth?.isAuthenticated && auth?.isActive && hasAccessToken && validClient && validUser;

    if (!canRunSync) {
      return undefined;
    }

    const cleanupSync = registerOfflineSyncListeners();
    if (!isKnownOffline()) {
      refreshOfflineChanges().catch((error) => {
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          return;
        }
        if (error?.message !== 'Network Error') {
          console.warn('[Offline Sync] Initial bootstrap failed:', error?.message || error);
        }
      });
    }

    return () => cleanupSync?.();
  }, [
    auth?.clientId,
    auth?.isActive,
    auth?.isAuthenticated,
    auth?.loading,
    auth?.userId,
    router.pathname,
  ]);

  const installApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
  };

  const applyUpdate = () => {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  };

  if (!installPrompt && !updateReady) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9999] mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg">
      <span className="font-semibold text-slate-800">
        {updateReady ? 'A new CafeQR version is ready.' : 'Install CafeQR for offline use.'}
      </span>
      <button
        type="button"
        onClick={updateReady ? applyUpdate : installApp}
        className="rounded-md bg-orange-500 px-3 py-2 text-xs font-bold text-white"
      >
        {updateReady ? 'Refresh' : 'Install'}
      </button>
    </div>
  );
}
