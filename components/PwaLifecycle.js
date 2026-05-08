import { useEffect, useState } from 'react';
import { bootstrapOfflineData, registerOfflineSyncListeners } from '../utils/offlineSync';

export default function PwaLifecycle() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const cleanupSync = registerOfflineSyncListeners();
    if (document.cookie.includes('access_token=') && navigator.onLine) {
      bootstrapOfflineData().catch((error) => {
        if (error?.message !== 'Network Error') {
          console.warn('[Offline Sync] Initial bootstrap failed:', error?.message || error);
        }
      });
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
      cleanupSync?.();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

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
