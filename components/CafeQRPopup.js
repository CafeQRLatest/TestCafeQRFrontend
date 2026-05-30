import React from 'react';
import { FaTimes } from 'react-icons/fa';

export default function CafeQRPopup({ 
  title, 
  subtitle,
  badge,
  onClose, 
  onSave, 
  onCancel, 
  saveLabel = 'Save', 
  cancelLabel = 'Cancel', 
  isSaving = false, 
  children,
  maxWidth = '650px',
  icon: Icon,
  hideFooter = false
}) {
  const overlayRef = React.useRef(null);
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  return (
    <div className="cafeqr-popup-overlay" onClick={handleOverlayClick} ref={overlayRef}>
      <div className="cafeqr-popup-content" style={{ '--popup-max-width': maxWidth }}>
        <div className="cafeqr-popup-header">
          <div className="header-left">
            {Icon && <div className="header-icon"><Icon /></div>}
            <div className="header-title-block">
              {subtitle && <span className="header-subtitle">{subtitle}</span>}
              <h3>{title}</h3>
            </div>
          </div>
          <div className="header-right">
            {badge && (
              <span
                className="header-badge"
                style={{ color: badge.color, background: badge.bg || `${badge.color}15` }}
              >
                {badge.label}
              </span>
            )}
            <button className="close-btn" onClick={onClose} aria-label="Close">
              <FaTimes />
            </button>
          </div>
        </div>

        <div className="cafeqr-popup-body">
          {children}
        </div>

        {!hideFooter && (
          <div className="cafeqr-popup-footer">
            <button 
              className="popup-btn-secondary" 
              onClick={onCancel || onClose} 
              disabled={isSaving}
            >
              {cancelLabel}
            </button>
            {onSave && (
              <button 
                className="popup-btn-primary" 
                onClick={onSave} 
                disabled={isSaving}
              >
                {isSaving ? 'Processing...' : saveLabel}
              </button>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .cafeqr-popup-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
          /* No animation as per user request */
        }

        .cafeqr-popup-content {
          background: white;
          width: min(100%, var(--popup-max-width));
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          max-height: calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
          border: 1px solid #e2e8f0;
          border-top: 3px solid #f97316;
        }

        .cafeqr-popup-header {
          padding: 16px 24px;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: relative;
          gap: 12px;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 16px;
          min-width: 0;
          flex: 1;
        }

        .header-title-block {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .header-subtitle {
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #94a3b8;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .header-badge {
          padding: 3px 11px;
          border-radius: 100px;
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 0.2px;
          white-space: nowrap;
        }

        .header-icon {
          width: 40px;
          height: 40px;
          background: #fdf2f2;
          color: #FF7A00;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }

        .cafeqr-popup-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
          overflow-wrap: anywhere;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 20px;
          color: #94a3b8;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
          border-radius: 50%;
          transition: 0.2s;
        }

        .close-btn:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        .cafeqr-popup-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }

        .cafeqr-popup-footer {
          padding: 16px 24px;
          border-top: 1px solid #f1f5f9;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          background: #fff;
          padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
        }

        .popup-btn-secondary {
          padding: 12px 24px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          background: white;
          font-weight: 700;
          color: #64748b;
          cursor: pointer;
          transition: 0.2s;
        }

        .popup-btn-secondary:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }

        .popup-btn-primary {
          background: #FF7A00;
          color: white;
          border: none;
          padding: 12px 28px;
          border-radius: 12px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(255, 122, 0, 0.2);
          transition: 0.2s;
        }

        .popup-btn-primary:hover {
          background: #ea580c;
          transform: translateY(-1px);
        }

        .popup-btn-primary:disabled, .popup-btn-secondary:disabled {
          background: #cbd5e1;
          box-shadow: none;
          cursor: not-allowed;
          transform: none;
        }

        @media (max-width: 600px) {
          .cafeqr-popup-overlay {
            align-items: flex-end;
            padding: 0;
          }
          .cafeqr-popup-content {
            width: 100%;
            max-height: calc(100dvh - env(safe-area-inset-top, 0px));
            border-radius: 22px 22px 0 0;
          }
          .cafeqr-popup-header {
            padding: 16px 20px;
          }
          .header-icon {
            width: 32px;
            height: 32px;
            font-size: 16px;
          }
          .cafeqr-popup-body {
            padding: 20px;
          }
          .cafeqr-popup-footer {
            padding: 16px 20px;
            padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
            display: grid;
            grid-template-columns: 1fr;
          }
          .popup-btn-primary, .popup-btn-secondary {
            padding: 10px 16px;
            font-size: 13px;
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
