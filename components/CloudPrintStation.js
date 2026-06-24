import { useEffect, useState, useRef } from 'react';
import { FaPrint } from 'react-icons/fa';
import { claimAndPrintCloudJobs, isPrintStationEnabled } from '../utils/cloudPrintStation';
import { isNativePrintServicePaired } from '../utils/printServiceClient';

export default function CloudPrintStation({ onJobsChanged }) {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [lastCount, setLastCount] = useState(0);
  const localPrintActiveRef = useRef(false);

  useEffect(() => {
    const refresh = () => setEnabled(isNativePrintServicePaired() || isPrintStationEnabled());
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
      }, 10000); // 10s cooldown safety buffer
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
    let timerId = null;
    let running = false;

    const tick = async () => {
      if (!alive || running) return;
      // Skip this tick if a local print job is in progress
      if (localPrintActiveRef.current) {
        if (alive) timerId = window.setTimeout(tick, 2000);
        return;
      }
      running = true;
      try {
        setStatus('Checking');
        const jobs = await claimAndPrintCloudJobs(3);
        if (!alive) return;
        setLastCount(jobs.length);
        setStatus(jobs.length ? 'Printed' : 'Idle');
        if (jobs.length) onJobsChanged?.();
      } catch {
        if (alive) setStatus('Waiting');
      } finally {
        running = false;
        if (alive) timerId = window.setTimeout(tick, 5000);
      }
    };

    timerId = window.setTimeout(tick, 1000);

    return () => {
      alive = false;
      if (timerId) window.clearTimeout(timerId);
    };
  }, [enabled, onJobsChanged]);

  if (!enabled) return null;

  return (
    <div className="cloud-print-station" title="This device is listening for cloud print jobs">
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
        }
      `}</style>
    </div>
  );
}

