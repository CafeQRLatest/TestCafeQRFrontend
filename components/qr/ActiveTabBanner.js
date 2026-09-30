import React from 'react';

/**
 * ActiveTabBanner — shown on the CUSTOMER'S mobile phone when an active order/tab
 * already exists on the scanned table. Strictly informational.
 */
export default function ActiveTabBanner({ orderNo, itemCount, grandTotal, brandColor, onViewTab }) {
  if (!orderNo) return null;

  return (
    <>
      <div className="active-tab-banner" style={{ '--atb-color': brandColor || '#f97316' }}>
        <div className="atb-left">
          <div className="atb-pulse-dot" />
          <div className="atb-info">
            <span className="atb-label">Active Tab</span>
            <span className="atb-order-no">{orderNo}</span>
          </div>
        </div>
        <div className="atb-right">
          <span className="atb-summary">
            {itemCount} item{itemCount !== 1 ? 's' : ''} • ₹{Number(grandTotal || 0).toFixed(2)}
          </span>
          <button className="atb-view-btn" onClick={onViewTab} type="button">
            View Tab
          </button>
        </div>
      </div>

      <style jsx>{`
        .active-tab-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px clamp(12px, 4vw, 20px);
          margin: 0;
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.03) 100%);
          border-bottom: 1px solid rgba(16, 185, 129, 0.15);
          animation: atbSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes atbSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .atb-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .atb-pulse-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #10b981;
          flex-shrink: 0;
          position: relative;
          box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
          animation: atbPulse 2s ease-in-out infinite;
        }

        @keyframes atbPulse {
          0%, 100% { box-shadow: 0 0 4px rgba(16, 185, 129, 0.4); transform: scale(1); }
          50% { box-shadow: 0 0 12px rgba(16, 185, 129, 0.7); transform: scale(1.15); }
        }

        .atb-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .atb-label {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #10b981;
          line-height: 1;
          margin-bottom: 2px;
        }

        .atb-order-no {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .atb-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .atb-summary {
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          white-space: nowrap;
          display: none;
        }

        @media (min-width: 400px) {
          .atb-summary {
            display: inline;
          }
        }

        .atb-view-btn {
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.25);
          color: #059669;
          padding: 6px 14px;
          border-radius: 100px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .atb-view-btn:active {
          background: #10b981;
          color: white;
          border-color: #10b981;
        }
      `}</style>
    </>
  );
}
