import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

export default function AppUpdateBridge() {
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [availableVersion, setAvailableVersion] = useState('');

  useEffect(() => {
    // Only run on native Android / iOS devices
    if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;

    const checkAppUpdate = async () => {
      try {
        const { AppUpdate, AppUpdateAvailability } = await import('@capawesome/capacitor-app-update');
        const info = await AppUpdate.getAppUpdateInfo();
        console.log('[AppUpdateBridge] App update info:', info);

        // If an update is available on Google Play
        if (info.updateAvailability === AppUpdateAvailability.UPDATE_AVAILABLE) {
          setAvailableVersion(info.availableVersionName || '');
          
          // Try immediate native Google Play update flow
          if (info.immediateUpdateAllowed) {
            await AppUpdate.performImmediateUpdate();
          } else {
            // Fallback to custom modal if immediate update isn't directly allowed
            setShowUpdateModal(true);
          }
        }
      } catch (error) {
        console.error('[AppUpdateBridge] Failed to check for app updates:', error);
      }
    };

    checkAppUpdate();
  }, []);

  const openPlayStore = () => {
    if (typeof window !== 'undefined') {
      window.location.href = 'market://details?id=com.cafeqr.app';
    }
  };

  if (!showUpdateModal) return null;

  return (
    <div className="update-modal-overlay">
      <div className="update-modal-card">
        <div className="update-icon-badge">🚀</div>
        <h2>Update Required</h2>
        <p>
          A critical new version of <strong>Cafe QR POS</strong> {availableVersion ? `(v${availableVersion})` : ''} is available on the Google Play Store.
        </p>
        <p className="update-subtext">
          Please update your app to continue using the latest features and bug fixes.
        </p>
        <button className="btn-update-playstore" onClick={openPlayStore}>
          Update on Google Play
        </button>
      </div>

      <style jsx>{`
        .update-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(8px);
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .update-modal-card {
          background: white;
          width: 100%;
          max-width: 400px;
          border-radius: 24px;
          padding: 32px 24px;
          text-align: center;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          border: 1px solid #f1f5f9;
          animation: modalPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @keyframes modalPop {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .update-icon-badge {
          font-size: 48px;
          margin-bottom: 12px;
        }

        h2 {
          margin: 0 0 12px;
          font-size: 20px;
          font-weight: 800;
          color: #0f172a;
        }

        p {
          margin: 0 0 8px;
          font-size: 14px;
          color: #475569;
          line-height: 1.5;
        }

        .update-subtext {
          font-size: 12px;
          color: #94a3b8;
          margin-bottom: 24px;
        }

        .btn-update-playstore {
          width: 100%;
          padding: 14px;
          border-radius: 14px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          font-weight: 700;
          font-size: 15px;
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .btn-update-playstore:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(16, 185, 129, 0.45);
        }
      `}</style>
    </div>
  );
}
