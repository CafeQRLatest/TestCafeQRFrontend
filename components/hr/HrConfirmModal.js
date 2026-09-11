import React from 'react';
import { FaExclamationTriangle, FaTimes, FaUserSlash, FaCheckCircle, FaInfoCircle } from 'react-icons/fa';

export default function HrConfirmModal({
  isOpen,
  onClose,
  title,
  message,
  type = 'confirm', // 'confirm' | 'error' | 'warning' | 'info'
  confirmText = 'OK',
  cancelText = 'Cancel',
  onConfirm,
  showCancel = true,
  confirmVariant = 'danger' // 'danger' | 'primary' | 'warning'
}) {
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    else onClose();
  };

  const renderIcon = () => {
    if (type === 'error') {
      return (
        <div className="icon-wrapper error">
          <FaExclamationTriangle />
        </div>
      );
    }
    if (type === 'warning') {
      return (
        <div className="icon-wrapper warning">
          <FaExclamationTriangle />
        </div>
      );
    }
    if (type === 'info') {
      return (
        <div className="icon-wrapper info">
          <FaInfoCircle />
        </div>
      );
    }
    // confirm
    return (
      <div className={`icon-wrapper ${confirmVariant}`}>
        <FaUserSlash />
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card glass-panel" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose} aria-label="Close">
          <FaTimes />
        </button>

        <div className="modal-content">
          {renderIcon()}
          
          <h3 className="modal-title">{title}</h3>
          <p className="modal-message">{message}</p>

          <div className="modal-actions">
            {showCancel && (
              <button type="button" className="btn-cancel" onClick={onClose}>
                {cancelText}
              </button>
            )}
            <button
              type="button"
              className={`btn-confirm ${confirmVariant}`}
              onClick={handleConfirm}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          padding: 16px;
          animation: fadeIn 0.2s ease-out;
        }

        .modal-card {
          width: 100%;
          max-width: 440px;
          background: #ffffff;
          border-radius: 20px;
          padding: 28px 24px 24px;
          position: relative;
          box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25);
          border: 1px solid rgba(226, 232, 240, 0.8);
          animation: zoomIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .close-btn {
          position: absolute;
          top: 16px;
          right: 16px;
          background: #f1f5f9;
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #64748b;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .close-btn:hover {
          background: #e2e8f0;
          color: #0f172a;
        }

        .modal-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .icon-wrapper {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          margin-bottom: 16px;
        }

        .icon-wrapper.error, .icon-wrapper.danger {
          background: #fef2f2;
          color: #ef4444;
          border: 1px solid #fecaca;
        }

        .icon-wrapper.warning {
          background: #fffbeb;
          color: #f59e0b;
          border: 1px solid #fde68a;
        }

        .icon-wrapper.info, .icon-wrapper.primary {
          background: #eff6ff;
          color: #3b82f6;
          border: 1px solid #bfdbfe;
        }

        .modal-title {
          margin: 0 0 8px;
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          letter-spacing: -0.01em;
        }

        .modal-message {
          margin: 0 0 24px;
          font-size: 14px;
          line-height: 1.55;
          color: #475569;
          word-break: break-word;
        }

        .modal-actions {
          display: flex;
          gap: 12px;
          width: 100%;
          justify-content: center;
        }

        .btn-cancel {
          flex: 1;
          padding: 12px 18px;
          border-radius: 12px;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          color: #475569;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-cancel:hover {
          background: #f1f5f9;
          color: #1e293b;
        }

        .btn-confirm {
          flex: 1;
          padding: 12px 18px;
          border-radius: 12px;
          border: none;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          color: #ffffff;
          transition: all 0.15s ease;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .btn-confirm.danger {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        }
        .btn-confirm.danger:hover {
          box-shadow: 0 6px 16px rgba(239, 68, 68, 0.35);
          transform: translateY(-1px);
        }

        .btn-confirm.primary {
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
        }
        .btn-confirm.primary:hover {
          box-shadow: 0 6px 16px rgba(249, 115, 22, 0.35);
          transform: translateY(-1px);
        }

        .btn-confirm.warning {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes zoomIn {
          from { opacity: 0; transform: scale(0.94); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
