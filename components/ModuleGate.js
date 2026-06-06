import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { FaLock, FaCog } from 'react-icons/fa';
import DashboardLayout from './DashboardLayout';
import api from '../utils/api';
import { getModuleLabelForPath, isRouteVisibleForConfig } from '../utils/moduleVisibility';

export default function ModuleGate({ children }) {
  const router = useRouter();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get('/api/v1/configurations')
      .then((resp) => {
        if (alive && resp.data?.success) {
          setConfig(resp.data.data || {});
        }
      })
      .catch(() => {
        if (alive) setConfig(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return null;
  if (isRouteVisibleForConfig(router.pathname, config)) return children;

  const moduleLabel = getModuleLabelForPath(router.pathname);

  return (
    <DashboardLayout title={moduleLabel} showBack>
      <div className="module-disabled">
        <div className="disabled-card">
          <div className="disabled-icon"><FaLock /></div>
          <h2>{moduleLabel} is disabled</h2>
          <p>Enable this module from System Configurations to use this page.</p>
          <button type="button" onClick={() => router.push('/owner/configurations')}>
            <FaCog /> Open Settings
          </button>
        </div>
      </div>
      <style jsx>{`
        .module-disabled {
          min-height: calc(100dvh - 150px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 16px;
        }
        .disabled-card {
          width: min(460px, 100%);
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 32px;
          text-align: center;
          box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
        }
        .disabled-icon {
          width: 56px;
          height: 56px;
          margin: 0 auto 18px;
          border-radius: 14px;
          background: #fff7ed;
          color: #f97316;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
        }
        h2 {
          margin: 0 0 8px;
          color: #0f172a;
          font-size: 22px;
          font-weight: 900;
        }
        p {
          margin: 0 0 22px;
          color: #64748b;
          font-size: 14px;
          font-weight: 600;
        }
        button {
          border: none;
          border-radius: 10px;
          background: #f97316;
          color: white;
          padding: 12px 18px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 10px 20px rgba(249, 115, 22, 0.25);
        }
      `}</style>
    </DashboardLayout>
  );
}
