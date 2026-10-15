import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { FaPrint } from 'react-icons/fa';
import Cookies from 'js-cookie';
import { claimAndPrintCloudJobs, isPrintStationEnabled, checkPrintPulse } from '../utils/cloudPrintStation';
import { isNativePrintServicePaired } from '../utils/printServiceClient';
import { getApiUrl } from '../utils/api';

export default function CloudPrintStation({ onJobsChanged }) {
  const router = useRouter();
  const isPosPage = router?.pathname?.includes('/pos-sales') || router?.pathname?.includes('/sales');
  const [enabled, setEnabled] = useState(false);
  const [widgetVisible, setWidgetVisible] = useState(true);
  const [status, setStatus] = useState('Idle');
  const [lastCount, setLastCount] = useState(0);
  const localPrintActiveRef = useRef(false);

  useEffect(() => {
    const refresh = () => {
      setEnabled(isPrintStationEnabled());
      setWidgetVisible(typeof window !== 'undefined' && window.localStorage.getItem('CAFEQR_HIDE_PRINT_WIDGET') !== '1');
    };
    refresh();
    window.addEventListener('cafeqr-print-station-config-changed', refresh);
    return () => window.removeEventListener('cafeqr-print-station-config-changed', refresh);
  }, []);

  // Pause polling while a local KotPrint is active to avoid duplicate prints
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let doneTimeoutId = null;

    const handleActive = () => {
      if (doneTimeoutId) clearTimeout(doneTimeoutId);
      localPrintActiveRef.current = true;
    };
    const handleDone = () => {
      if (doneTimeoutId) clearTimeout(doneTimeoutId);
      doneTimeoutId = setTimeout(() => {
        localPrintActiveRef.current = false;
      }, 2000); // 2s cooldown safety buffer
    };

    window.addEventListener('cafeqr-local-print-active', handleActive);
    window.addEventListener('cafeqr-local-print-done', handleDone);

    return () => {
      if (doneTimeoutId) clearTimeout(doneTimeoutId);
      window.removeEventListener('cafeqr-local-print-active', handleActive);
      window.removeEventListener('cafeqr-local-print-done', handleDone);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    let alive = true;
    let pulseTimerId = null;
    let claimTimerId = null;
    let running = false;
    let eventSource = null;
    let isLeader = false;
    let lockReleaseResolve = null;
    const sseConnectedRef = { current: false };
    const lastVersionRef = { current: 0 };

    const triggerClaim = async () => {
      if (!alive || running || !isLeader) return;
      if (localPrintActiveRef.current) {
        if (alive) claimTimerId = window.setTimeout(triggerClaim, 1000);
        return;
      }
      running = true;
      let claimedCount = 0;
      try {
        setStatus('Checking');
        const jobs = await claimAndPrintCloudJobs(3);
        if (!alive) return;
        claimedCount = jobs ? jobs.length : 0;
        setLastCount(claimedCount);
        setStatus(claimedCount ? 'Printed' : (sseConnectedRef.current ? 'Live' : 'Idle'));
        if (claimedCount) onJobsChanged?.();
      } catch {
        if (!alive) return;
        setStatus(sseConnectedRef.current ? 'Live' : 'Waiting');
      } finally {
        running = false;
        if (alive && isLeader) {
          if (claimedCount > 0) {
            claimTimerId = window.setTimeout(triggerClaim, 300);
          }
        }
      }
    };

    const pulseCheck = async () => {
      if (!alive || !isLeader) return;
      try {
        const res = await checkPrintPulse(lastVersionRef.current);
        if (!alive) return;
        if (res && typeof res.version === 'number') {
          if (res.hasNew || res.version > lastVersionRef.current) {
            lastVersionRef.current = res.version;
            triggerClaim();
          } else {
            lastVersionRef.current = res.version;
          }
        }
      } catch {
      } finally {
        if (alive && isLeader) {
          const isTabHidden = typeof document !== 'undefined' && document.visibilityState !== 'visible';
          const delay = isTabHidden ? 10000 : 3000;
          pulseTimerId = window.setTimeout(pulseCheck, delay);
        }
      }
    };

    const startWorker = () => {
      isLeader = true;
      setStatus(sseConnectedRef.current ? 'Live' : 'Idle');

      // 1. Establish SSE stream for instant push
      try {
        const baseUrl = getApiUrl();
        const token = Cookies.get('access_token') || Cookies.get('token') || (typeof window !== 'undefined' ? window.localStorage.getItem('access_token') : null);
        const sseUrl = `${baseUrl}/api/v1/print-jobs/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;

        eventSource = new EventSource(sseUrl, { withCredentials: true });

        eventSource.addEventListener('init', () => {
          if (!alive) return;
          sseConnectedRef.current = true;
          setStatus('Live');
          triggerClaim();
        });

        eventSource.addEventListener('NEW_JOB', () => {
          if (!alive) return;
          triggerClaim();
        });

        eventSource.onerror = () => {
          if (!alive) return;
          sseConnectedRef.current = false;
          setStatus('Waiting');
        };
      } catch (e) {
        console.warn('[CloudPrintStation] SSE stream unavailable:', e);
        sseConnectedRef.current = false;
      }

      // 2. Start zero-database in-memory pulse loop
      pulseCheck();
    };

    // Tab Leader Election using Web Locks API
    if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
      navigator.locks.request('cafeqr_print_station_leader', async () => {
        if (!alive) return;
        startWorker();
        await new Promise((resolve) => {
          lockReleaseResolve = resolve;
        });
      }).catch(() => {
        if (alive && !isLeader) {
          startWorker();
        }
      });
    } else {
      startWorker();
    }

    // Instant Wakeup Handlers
    const handleWakeup = () => {
      if (alive && isLeader) {
        triggerClaim();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && alive && isLeader) {
        if (pulseTimerId) window.clearTimeout(pulseTimerId);
        pulseCheck();
      }
    };
    const handleOnline = () => {
      if (alive && isLeader) {
        if (pulseTimerId) window.clearTimeout(pulseTimerId);
        pulseCheck();
      }
    };

    window.addEventListener('cafeqr-cloud-print-wakeup', handleWakeup);
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      alive = false;
      if (lockReleaseResolve) lockReleaseResolve();
      if (pulseTimerId) window.clearTimeout(pulseTimerId);
      if (claimTimerId) window.clearTimeout(claimTimerId);
      if (eventSource) eventSource.close();
      window.removeEventListener('cafeqr-cloud-print-wakeup', handleWakeup);
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
    };
  }, [enabled, onJobsChanged]);

  if (!enabled) return null;
  if (!widgetVisible) return null;

  return (
    <div className={`cloud-print-station ${isPosPage ? 'pos-mode' : ''}`} title="This device is listening for cloud print jobs">
      <FaPrint />
      <span>Print station: {status}</span>
      {lastCount > 0 && <strong>{lastCount}</strong>}
      <style jsx>{`
        .cloud-print-station {
          position: fixed;
          right: 22px;
          bottom: 88px;
          z-index: 90;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 12px;
          border-radius: 8px;
          border: 1px solid #dbeafe;
          background: #eff6ff;
          color: #075985;
          font-size: 12px;
          font-weight: 800;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
          pointer-events: none;
        }
        .cloud-print-station.pos-mode {
          right: auto;
          left: 16px;
          bottom: 16px;
        }
        .cloud-print-station strong {
          min-width: 20px;
          height: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: #0ea5e9;
          color: white;
          font-size: 11px;
        }
        @media (max-width: 700px) {
          .cloud-print-station {
            right: 12px;
            bottom: 108px;
            max-width: calc(100vw - 24px);
          }
          .cloud-print-station.pos-mode {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

