import React from 'react';
import { useNotification } from '../context/NotificationContext';
import { 
  FaCheckCircle, FaExclamationCircle, FaTimes, 
  FaExclamationTriangle, FaInfoCircle 
} from 'react-icons/fa';

export default function GlobalUI() {
  const { notifications, modal, closeModal } = useNotification();

  return (
    <>
      <div className="global-toast-container">
        {notifications.map(n => (
          <div key={n.id} className={`custom-toast ${n.type}`}>
            <div className="toast-icon">
              {n.type === 'success' ? <FaCheckCircle /> : 
               n.type === 'error' ? <FaExclamationCircle /> : 
               n.type === 'warning' ? <FaExclamationTriangle /> : <FaInfoCircle />}
            </div>
            <div className="toast-content">{n.message}</div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => modal.onCancel()}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-body">
              <div className="modal-icon-small">
                {modal.type === 'error' ? <FaExclamationCircle className="error" /> : 
                 modal.type === 'info' ? <FaInfoCircle className="info" /> : 
                 modal.type === 'success' ? <FaCheckCircle className="success" /> :
                 <FaExclamationTriangle className="warning" />}
              </div>
              <h3>{modal.title}</h3>
              <p>{modal.message}</p>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => modal.onCancel()}>Cancel</button>
              <button className={`btn-confirm ${modal.type || 'warning'}`} onClick={() => modal.onConfirm()}>
                Proceed
              </button>
            </div>
            <button className="modal-close-x" onClick={() => modal.onCancel()}><FaTimes /></button>
          </div>
        </div>
      )}

      <style jsx global>{`
        .global-toast-container {
          position: fixed;
          top: 32px;
          right: 32px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 12px;
          pointer-events: none;
        }

        .custom-toast {
          padding: 14px 20px;
          background: #0f172a;
          color: white;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          animation: slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          pointer-events: auto;
          min-width: 280px;
          max-width: 400px;
        }

        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        .custom-toast.success { border-left: 3px solid #10b981; }
        .custom-toast.error { border-left: 3px solid #ef4444; }
        .custom-toast.warning { border-left: 3px solid #f97316; }

        .toast-icon { font-size: 18px; }
        .success .toast-icon { color: #10b981; }
        .error .toast-icon { color: #ef4444; }
        .warning .toast-icon { color: #f97316; }

        .toast-content { font-size: 13px; font-weight: 600; }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.05);
          backdrop-filter: blur(6px);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .modal-box {
          background: white;
          width: 100%;
          max-width: 360px;
          border-radius: 20px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
          border: 1px solid #e2e8f0;
          border-top: 3px solid #f97316;
          animation: popUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @keyframes popUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .modal-body {
          padding: 32px 24px 24px;
          text-align: center;
        }

        .modal-icon-small { font-size: 32px; margin-bottom: 16px; opacity: 0.8; }
        .modal-icon-small .warning { color: #f97316; }
        .modal-icon-small .error { color: #ef4444; }
        .modal-icon-small .info { color: #3b82f6; }
        .modal-icon-small .success { color: #10b981; }

        .modal-body h3 { 
          margin: 0 0 8px; 
          font-size: 16px; 
          font-weight: 800; 
          color: #0f172a; 
          letter-spacing: -0.3px;
        }

        .modal-body p { 
          margin: 0; 
          font-size: 13px; 
          color: #94a3b8; 
          line-height: 1.5; 
          font-weight: 500;
        }

        .modal-footer {
          padding: 0 24px 24px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .btn-cancel {
          padding: 10px;
          border-radius: 12px;
          border: 1px solid #f1f5f9;
          background: #fff;
          color: #94a3b8;
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
          transition: 0.2s;
        }
        .btn-cancel:hover { background: #f8fafc; color: #64748b; border-color: #e2e8f0; }

        .btn-confirm {
          padding: 10px;
          border-radius: 12px;
          color: white;
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
          transition: 0.2s;
        }
        .btn-confirm.warning { background: #f97316; border: 1px solid #ea580c; }
        .btn-confirm.warning:hover { background: #ea580c; transform: translateY(-1px); }
        
        .btn-confirm.error { background: #ef4444; border: 1px solid #dc2626; }
        .btn-confirm.error:hover { background: #dc2626; transform: translateY(-1px); }
        
        .btn-confirm.success { background: #10b981; border: 1px solid #059669; }
        .btn-confirm.success:hover { background: #059669; transform: translateY(-1px); }

        .modal-close-x {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 24px;
          height: 24px;
          border: none;
          background: #f8fafc;
          color: #cbd5e1;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: 0.2s;
          font-size: 10px;
        }
        .modal-close-x:hover { background: #f1f5f9; color: #ef4444; }
      `}</style>
    </>
  );
}
