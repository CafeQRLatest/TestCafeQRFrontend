import React from 'react';
import { FaTimes } from 'react-icons/fa';

/**
 * ActiveTabDrawer — slide-over on the CUSTOMER'S phone showing items already ordered.
 * STRICTLY READ-ONLY: No delete, no edit, no quantity change.
 * Only the POS operator can modify active orders.
 */
export default function ActiveTabDrawer({ isOpen, onClose, activeOrder, brandColor }) {
  if (!activeOrder) return null;

  const lines = activeOrder.lines || [];
  const total = activeOrder.grandTotal || 0;

  return (
    <>
      <div className={`atd-overlay ${isOpen ? 'open' : ''}`} onClick={onClose}>
        <div className="atd-drawer" onClick={e => e.stopPropagation()}>
          <div className="atd-drag-handle" />

          {/* Header */}
          <div className="atd-header">
            <div className="atd-header-info">
              <span className="atd-header-label">Current Tab</span>
              <span className="atd-header-order-no">{activeOrder.orderNo}</span>
            </div>
            <button className="atd-close" onClick={onClose} type="button">
              <FaTimes />
            </button>
          </div>

          {/* Items List — READ-ONLY */}
          <div className="atd-items">
            {lines.length === 0 ? (
              <div className="atd-empty">
                <p>No items in this tab yet.</p>
              </div>
            ) : (
              lines.map((line, idx) => (
                <div key={line.id || idx} className="atd-item">
                  <div className="atd-item-info">
                    <span className="atd-item-name">{line.productName || 'Item'}</span>
                    {line.categoryName && (
                      <span className="atd-item-cat">{line.categoryName}</span>
                    )}
                  </div>
                  <div className="atd-item-right">
                    <span className="atd-item-qty">×{Number(line.quantity || 1)}</span>
                    <span className="atd-item-total">₹{Number(line.lineTotal || 0).toFixed(2)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="atd-footer">
            <div className="atd-total-row">
              <span>Tab Total</span>
              <span className="atd-total-amount">₹{Number(total).toFixed(2)}</span>
            </div>

            <div className="atd-notice">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>Items already sent to the kitchen cannot be modified. Add new items from the menu.</span>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .atd-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.5);
          backdrop-filter: blur(4px);
          z-index: 55;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s;
          display: flex;
          align-items: flex-end;
        }
        .atd-overlay.open {
          opacity: 1;
          pointer-events: auto;
        }

        .atd-drawer {
          width: 100%;
          max-height: min(80dvh, 620px);
          background: white;
          border-radius: 28px 28px 0 0;
          display: flex;
          flex-direction: column;
          transform: translateY(100%);
          transition: transform 0.4s cubic-bezier(0.2, 1, 0.2, 1);
          box-shadow: 0 -20px 40px rgba(0, 0, 0, 0.1);
        }
        .atd-overlay.open .atd-drawer {
          transform: translateY(0);
        }

        @media (min-width: 768px) {
          .atd-overlay {
            align-items: stretch;
            justify-content: flex-end;
          }
          .atd-drawer {
            width: min(420px, 100vw);
            max-height: 100dvh;
            height: 100dvh;
            border-radius: 32px 0 0 32px;
            transform: translateX(100%);
          }
          .atd-overlay.open .atd-drawer {
            transform: translateX(0);
          }
          .atd-drag-handle {
            display: none;
          }
        }

        .atd-drag-handle {
          width: 40px;
          height: 4px;
          background: #cbd5e1;
          border-radius: 4px;
          margin: 12px auto 0;
        }

        .atd-header {
          padding: 20px clamp(16px, 5vw, 24px);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          border-bottom: 1px solid #f1f5f9;
        }

        .atd-header-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .atd-header-label {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #10b981;
          line-height: 1;
          margin-bottom: 4px;
        }

        .atd-header-order-no {
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .atd-close {
          background: #f1f5f9;
          border: none;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          color: #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: 0.2s;
          flex-shrink: 0;
        }
        .atd-close:active {
          background: #e2e8f0;
        }

        .atd-items {
          padding: 16px clamp(16px, 5vw, 24px);
          overflow-y: auto;
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .atd-empty {
          text-align: center;
          padding: 40px 20px;
          color: #94a3b8;
          font-size: 14px;
        }

        .atd-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 14px 0;
          border-bottom: 1px solid #f8fafc;
          min-width: 0;
        }
        .atd-item:last-child {
          border-bottom: none;
        }

        .atd-item-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
        }

        .atd-item-name {
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.3;
          overflow-wrap: anywhere;
        }

        .atd-item-cat {
          font-size: 11px;
          font-weight: 600;
          color: #94a3b8;
          margin-top: 2px;
        }

        .atd-item-right {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .atd-item-qty {
          font-size: 13px;
          font-weight: 700;
          color: #64748b;
          background: #f1f5f9;
          padding: 3px 8px;
          border-radius: 6px;
        }

        .atd-item-total {
          font-size: 14px;
          font-weight: 800;
          color: #0f172a;
          min-width: 60px;
          text-align: right;
        }

        .atd-footer {
          padding: 20px clamp(16px, 5vw, 24px);
          padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px));
          background: #f8fafc;
          border-top: 1px solid #f1f5f9;
        }

        .atd-total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
          margin-bottom: 16px;
        }

        .atd-total-amount {
          color: #10b981;
        }

        .atd-notice {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 14px;
          background: rgba(59, 130, 246, 0.06);
          border: 1px solid rgba(59, 130, 246, 0.12);
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
          color: #64748b;
          line-height: 1.5;
        }

        .atd-notice svg {
          flex-shrink: 0;
          color: #3b82f6;
          margin-top: 1px;
        }
      `}</style>
    </>
  );
}
