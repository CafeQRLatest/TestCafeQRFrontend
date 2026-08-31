import React, { useEffect, useState } from 'react';
import { FaGoogle, FaStar, FaTimes } from 'react-icons/fa';

export default function GoogleBusinessReviewBridge() {
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const checkGoogleBusinessMilestone = () => {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        
        // 1. Get active days
        let activeDays = [];
        try {
          const stored = localStorage.getItem('cafeqr_active_days');
          activeDays = stored ? JSON.parse(stored) : [];
        } catch (e) {
          activeDays = [];
        }

        // 2. Track today
        if (!activeDays.includes(todayStr)) {
          activeDays.push(todayStr);
          localStorage.setItem('cafeqr_active_days', JSON.stringify(activeDays));
        }

        // 3. Check if already prompted for Google Business Review
        const alreadyPrompted = localStorage.getItem('cafeqr_review_prompted_google_business');
        if (alreadyPrompted) return;

        // 4. Milestone: 10th Active Business Day (2 full business weeks)
        if (activeDays.length >= 10) {
          const currentHour = new Date().getHours();
          const isDaytime = currentHour >= 9 && currentHour < 21;

          if (isDaytime) {
            // Show modal after 3 seconds of loading
            const timer = setTimeout(() => {
              setShowModal(true);
            }, 3000);
            return () => clearTimeout(timer);
          }
        }
      } catch (error) {
        console.error('[GoogleBusinessReviewBridge] Error in review check:', error);
      }
    };

    checkGoogleBusinessMilestone();
  }, []);

  const handleReviewClick = () => {
    localStorage.setItem('cafeqr_review_prompted_google_business', 'true');
    setShowModal(false);
    window.open('https://g.page/r/CbYBpqFk3xOFEBM/review', '_blank', 'noopener,noreferrer');
  };

  const handleDismiss = () => {
    // Dismiss for now, will ask again in a week if not permanently closed
    localStorage.setItem('cafeqr_review_prompted_google_business', 'dismissed');
    setShowModal(false);
  };

  if (!showModal) return null;

  return (
    <div className="gb-modal-overlay" onClick={handleDismiss}>
      <div className="gb-modal-card" onClick={e => e.stopPropagation()}>
        <button className="gb-close-btn" onClick={handleDismiss} title="Close">
          <FaTimes />
        </button>

        <div className="gb-icon-header">
          <div className="gb-google-badge">
            <FaGoogle />
          </div>
          <div className="gb-stars-row">
            {[...Array(5)].map((_, i) => (
              <FaStar key={i} className="gb-star-icon" />
            ))}
          </div>
        </div>

        <h3>Help Cafe QR Grow!</h3>
        <p>
          You&apos;ve been using <strong>Cafe QR POS</strong> for over 2 weeks! Would you take 10 seconds to review us on our <strong>Google Business Profile</strong>?
        </p>

        <div className="gb-action-buttons">
          <button className="gb-review-btn" onClick={handleReviewClick}>
            <FaGoogle className="btn-icon" /> Review on Google
          </button>
          <button className="gb-later-btn" onClick={handleDismiss}>
            Maybe Later
          </button>
        </div>
      </div>

      <style jsx>{`
        .gb-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(6px);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.2s ease;
        }

        .gb-modal-card {
          background: #ffffff;
          width: 100%;
          max-width: 400px;
          border-radius: 24px;
          padding: 28px 24px;
          text-align: center;
          position: relative;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
          border: 1px solid #e2e8f0;
          animation: popUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .gb-close-btn {
          position: absolute;
          top: 14px;
          right: 14px;
          background: #f1f5f9;
          border: none;
          color: #94a3b8;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 12px;
          transition: 0.2s;
        }
        .gb-close-btn:hover { background: #e2e8f0; color: #0f172a; }

        .gb-icon-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
        }

        .gb-google-badge {
          width: 48px;
          height: 48px;
          background: #e8f0fe;
          color: #1a73e8;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
        }

        .gb-stars-row {
          display: flex;
          gap: 4px;
          color: #f59e0b;
          font-size: 16px;
        }

        h3 {
          margin: 0 0 8px;
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
        }

        p {
          margin: 0 0 24px;
          font-size: 13px;
          color: #64748b;
          line-height: 1.5;
        }

        .gb-action-buttons {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .gb-review-btn {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          background: #1a73e8;
          color: white;
          font-weight: 700;
          font-size: 14px;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 4px 12px rgba(26, 115, 232, 0.3);
          transition: 0.2s;
        }
        .gb-review-btn:hover { background: #1557b0; transform: translateY(-1px); }

        .gb-later-btn {
          width: 100%;
          padding: 10px;
          border-radius: 12px;
          background: transparent;
          color: #94a3b8;
          font-weight: 600;
          font-size: 13px;
          border: none;
          cursor: pointer;
          transition: 0.2s;
        }
        .gb-later-btn:hover { color: #475569; }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes popUp {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
