import React, { useState, useEffect, useRef } from 'react';
import { 
  FaWhatsapp, 
  FaQrcode, 
  FaCheckCircle, 
  FaSyncAlt, 
  FaUnlink, 
  FaPaperPlane, 
  FaMobileAlt, 
  FaShieldAlt, 
  FaSpinner, 
  FaExclamationTriangle,
  FaFileInvoiceDollar
} from 'react-icons/fa';
import api from '../../utils/api';

export default function WhatsAppGatewayCard({ orgId, orgName }) {
  const [gatewayStatus, setGatewayStatus] = useState('CHECKING'); // 'CHECKING' | 'CONNECTED' | 'SCAN_QR' | 'DISCONNECTED'
  const [qrCodeUrl, setQrCodeUrl] = useState(null);
  const [connectedUser, setConnectedUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState({ text: '', type: '' });
  const pollTimerRef = useRef(null);

  const sessionId = orgId && orgId !== '0' ? `org_${orgId}` : undefined;

  const fetchStatus = async () => {
    try {
      const params = sessionId ? { sessionId } : {};
      const res = await api.get('/api/v1/whatsapp/status', { params });
      const data = res.data?.data || res.data || {};
      
      const st = data.status || 'DISCONNECTED';
      setGatewayStatus(st);
      setConnectedUser(data.user || null);

      if (st === 'SCAN_QR' || data.hasQr) {
        fetchQr();
      } else {
        setQrCodeUrl(null);
      }
    } catch (err) {
      setGatewayStatus('DISCONNECTED');
      setQrCodeUrl(null);
      setConnectedUser(null);
    }
  };

  const fetchQr = async () => {
    try {
      const params = sessionId ? { sessionId } : {};
      const res = await api.get('/api/v1/whatsapp/qr', { params });
      const data = res.data?.data || res.data || {};
      if (data.qr) {
        setQrCodeUrl(data.qr);
      }
    } catch (err) {
      console.warn('Failed to fetch WhatsApp QR', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    // Poll status every 4 seconds to detect when user scans the QR code
    pollTimerRef.current = setInterval(() => {
      fetchStatus();
    }, 4000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [sessionId]);

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to unlink this WhatsApp number? Customers will not receive WhatsApp bills until re-linked.')) {
      return;
    }
    setLoading(true);
    setFeedbackMsg({ text: '', type: '' });
    try {
      await api.post('/api/v1/whatsapp/disconnect', { sessionId });
      setGatewayStatus('DISCONNECTED');
      setConnectedUser(null);
      setQrCodeUrl(null);
      setFeedbackMsg({ text: 'WhatsApp unlinked successfully. You can now link a new number.', type: 'success' });
      fetchStatus();
    } catch (err) {
      setFeedbackMsg({ text: 'Failed to unlink WhatsApp session.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSendTest = async (e) => {
    e.preventDefault();
    if (!testPhone || testPhone.trim().length < 10) {
      setFeedbackMsg({ text: 'Please enter a valid 10-digit mobile number.', type: 'error' });
      return;
    }
    setTestSending(true);
    setFeedbackMsg({ text: '', type: '' });
    try {
      const res = await api.post('/api/v1/whatsapp/test', { phone: testPhone.trim(), sessionId });
      const data = res.data?.data || res.data || {};
      if (data.success !== false) {
        setFeedbackMsg({ text: `✓ Test receipt sent successfully to +${testPhone}!`, type: 'success' });
        setTestPhone('');
      } else {
        setFeedbackMsg({ text: data.message || 'Failed to send test message.', type: 'error' });
      }
    } catch (err) {
      setFeedbackMsg({ text: err.response?.data?.message || 'Error sending test message.', type: 'error' });
    } finally {
      setTestSending(false);
    }
  };

  const isConnected = gatewayStatus === 'CONNECTED';
  const isScanQr = gatewayStatus === 'SCAN_QR' || !!qrCodeUrl;

  return (
    <div className="wa-gateway-container">
      {/* Header bar */}
      <div className="wa-card-header">
        <div className="wa-header-brand">
          <div className="wa-logo-box">
            <FaWhatsapp size={24} color="#ffffff" />
          </div>
          <div className="wa-header-text">
            <div className="wa-title-row">
              <h3>WhatsApp Digital Bill Delivery</h3>
              {orgName && (
                <span className="wa-branch-pill">
                  📍 {orgName}
                </span>
              )}
              <span className={`wa-status-pill ${gatewayStatus.toLowerCase()}`}>
                <span className="wa-pulse-dot" />
                {gatewayStatus === 'CHECKING' && 'Checking...'}
                {gatewayStatus === 'CONNECTED' && 'Connected & Active'}
                {gatewayStatus === 'SCAN_QR' && 'Ready to Scan'}
                {gatewayStatus === 'DISCONNECTED' && 'Offline / Unlinked'}
              </span>
            </div>
            <p>Automatically sends branded tax invoices to customer WhatsApp numbers upon order settlement free of cost.</p>
          </div>
        </div>
        <button 
          className="wa-refresh-btn" 
          onClick={() => { setLoading(true); fetchStatus().finally(() => setLoading(false)); }}
          title="Refresh status"
          disabled={loading}
        >
          <FaSyncAlt className={loading ? 'spinning' : ''} size={13} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Feedback banner */}
      {feedbackMsg.text && (
        <div className={`wa-alert-banner ${feedbackMsg.type}`}>
          {feedbackMsg.type === 'success' ? <FaCheckCircle size={14} /> : <FaExclamationTriangle size={14} />}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Main Content Body */}
      <div className="wa-card-body">
        {isConnected ? (
          /* ───────── STATE 1: CONNECTED ───────── */
          <div className="wa-connected-panel">
            <div className="wa-connected-details">
              <div className="wa-avatar-ring">
                <FaCheckCircle size={36} color="#10b981" />
              </div>
              <div className="wa-connected-info">
                <h4>WhatsApp Linked Successfully</h4>
                <div className="wa-meta-badge">
                  <span>Linked Number:</span>
                  <strong>+{connectedUser?.phone || 'Cafe QR Official'}</strong>
                </div>
                <p className="wa-desc">
                  Every order settled in POS Sales, Live Orders, or Credit Settlements with a customer phone will automatically receive a digital receipt.
                </p>
              </div>
            </div>

            {/* Test Send Form */}
            <div className="wa-test-box">
              <div className="wa-test-label">
                <FaPaperPlane size={12} color="#059669" />
                <span>Test WhatsApp Receipt:</span>
              </div>
              <form className="wa-test-form" onSubmit={handleSendTest}>
                <input 
                  type="tel"
                  placeholder="Enter 10-digit customer phone"
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  maxLength={13}
                  disabled={testSending}
                />
                <button type="submit" disabled={testSending || !testPhone.trim()} className="wa-btn-test">
                  {testSending ? <FaSpinner className="spinning" size={12} /> : <FaPaperPlane size={12} />}
                  <span>{testSending ? 'Sending...' : 'Send Test Bill'}</span>
                </button>
              </form>
            </div>

            {/* Unlink Action */}
            <div className="wa-disconnect-row">
              <button 
                type="button" 
                className="wa-btn-unlink" 
                onClick={handleDisconnect} 
                disabled={loading}
              >
                <FaUnlink size={12} />
                <span>Unlink / Switch Number</span>
              </button>
            </div>
          </div>
        ) : (
          /* ───────── STATE 2: SCAN QR OR CONNECTING ───────── */
          <div className="wa-setup-grid">
            {/* Left: Step-by-Step Instructions */}
            <div className="wa-instructions-panel">
              <h4 className="wa-step-title">
                <FaMobileAlt size={15} color="#25D366" />
                <span>Link Restaurant WhatsApp in 3 Easy Steps</span>
              </h4>
              <ol className="wa-steps-list">
                <li>
                  <span className="step-num">1</span>
                  <div className="step-content">
                    <strong>Open WhatsApp</strong> on the cafe's phone.
                  </div>
                </li>
                <li>
                  <span className="step-num">2</span>
                  <div className="step-content">
                    Tap <strong>Settings</strong> (iPhone) or <strong>⋮ More options</strong> (Android), then tap <strong>Linked Devices</strong>.
                  </div>
                </li>
                <li>
                  <span className="step-num">3</span>
                  <div className="step-content">
                    Tap <strong>Link a Device</strong> and point your camera at the QR code on the right.
                  </div>
                </li>
              </ol>

              <div className="wa-security-note">
                <FaShieldAlt size={14} color="#64748b" />
                <span>100% Free & Secure. Messages route directly through your restaurant's WhatsApp Web session with zero per-message charges.</span>
              </div>
            </div>

            {/* Right: Live QR Code Display */}
            <div className="wa-qr-display-panel">
              <div className="wa-qr-frame">
                {isScanQr && qrCodeUrl ? (
                  <div className="wa-qr-wrapper">
                    <img src={qrCodeUrl} alt="WhatsApp QR Code" className="wa-qr-img" />
                    <div className="wa-qr-scan-badge">
                      <FaQrcode size={12} />
                      <span>Scan to Connect</span>
                    </div>
                  </div>
                ) : (
                  <div className="wa-qr-placeholder">
                    <FaSpinner size={32} className="spinning" color="#25D366" />
                    <p className="wa-qr-loading-text">Generating QR code...</p>
                    <small>Ensure companion gateway is running on port 3005</small>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .wa-gateway-container {
          background: #ffffff;
          border-radius: 16px;
          border: 1.5px solid #e2e8f0;
          box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.04);
          overflow: hidden;
          margin-bottom: 24px;
          width: 100%;
          box-sizing: border-box;
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          transition: all 0.2s ease;
        }

        .wa-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 24px;
          background: linear-gradient(180deg, #fafbfc 0%, #f1f5f9 100%);
          border-bottom: 1.5px solid #e2e8f0;
          gap: 16px;
        }

        .wa-header-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          flex: 1;
          min-width: 0;
        }

        .wa-logo-box {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(37, 211, 102, 0.25);
        }

        .wa-header-text {
          flex: 1;
          min-width: 0;
        }

        .wa-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 3px;
        }

        .wa-title-row h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.01em;
        }

        .wa-header-text p {
          margin: 0;
          font-size: 12.5px;
          color: #64748b;
          line-height: 1.4;
        }

        .wa-branch-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 9px;
          border-radius: 6px;
          background: #e0f2fe;
          color: #0369a1;
          font-size: 11.5px;
          font-weight: 700;
          border: 1px solid #bae6fd;
        }

        .wa-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .wa-status-pill.connected {
          background: #ecfdf5;
          color: #059669;
          border: 1px solid #a7f3d0;
        }

        .wa-status-pill.scan_qr {
          background: #fffbeb;
          color: #d97706;
          border: 1px solid #fde68a;
        }

        .wa-status-pill.disconnected,
        .wa-status-pill.checking {
          background: #f1f5f9;
          color: #64748b;
          border: 1px solid #e2e8f0;
        }

        .wa-pulse-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: currentColor;
          display: inline-block;
          animation: wa-pulse 1.8s infinite;
        }

        @keyframes wa-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }

        .wa-refresh-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 9px;
          background: #ffffff;
          border: 1.5px solid #cbd5e1;
          color: #334155;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .wa-refresh-btn:hover {
          background: #f8fafc;
          border-color: #94a3b8;
          color: #0f172a;
        }

        .wa-alert-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 18px;
          font-size: 12.5px;
          font-weight: 600;
        }

        .wa-alert-banner.success {
          background: #ecfdf5;
          color: #065f46;
          border-bottom: 1px solid #a7f3d0;
        }

        .wa-alert-banner.error {
          background: #fef2f2;
          color: #991b1b;
          border-bottom: 1px solid #fecaca;
        }

        .wa-card-body {
          padding: 24px;
          box-sizing: border-box;
          width: 100%;
        }

        /* Responsive Setup Grid */
        .wa-setup-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(260px, 1fr);
          gap: 28px;
          align-items: center;
        }

        .wa-step-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 16px 0;
          font-size: 14.5px;
          font-weight: 800;
          color: #0f172a;
        }

        .wa-steps-list {
          list-style: none;
          padding: 0;
          margin: 0 0 20px 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .wa-steps-list li {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          font-size: 13px;
          color: #334155;
          line-height: 1.45;
        }

        .step-num {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #f1f5f9;
          color: #0f172a;
          font-weight: 800;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border: 1px solid #e2e8f0;
        }

        .step-content strong {
          color: #0f172a;
        }

        .wa-security-note {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 11.5px;
          color: #64748b;
          line-height: 1.4;
        }

        /* QR Frame */
        .wa-qr-display-panel {
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .wa-qr-frame {
          width: min(260px, 80vw);
          aspect-ratio: 1/1;
          background: #ffffff;
          border: 2px dashed #cbd5e1;
          border-radius: 16px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);
          position: relative;
        }

        .wa-qr-wrapper {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .wa-qr-img {
          width: 100%;
          height: 100%;
          max-width: 210px;
          max-height: 210px;
          object-fit: contain;
          border-radius: 8px;
        }

        .wa-qr-scan-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #f0fdf4;
          color: #166534;
          border: 1px solid #bbf7d0;
          border-radius: 100px;
          padding: 3px 10px;
          font-size: 11px;
          font-weight: 700;
        }

        .wa-qr-placeholder {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 16px;
        }

        .wa-qr-loading-text {
          margin: 0;
          font-size: 13px;
          font-weight: 700;
          color: #334155;
        }

        .wa-qr-placeholder small {
          font-size: 11px;
          color: #94a3b8;
          max-width: 180px;
        }

        /* Connected Panel */
        .wa-connected-panel {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .wa-connected-details {
          display: flex;
          align-items: center;
          gap: 16px;
          background: #f0fdf4;
          border: 1.5px solid #bbf7d0;
          border-radius: 14px;
          padding: 16px 20px;
        }

        .wa-avatar-ring {
          flex-shrink: 0;
        }

        .wa-connected-info h4 {
          margin: 0 0 4px 0;
          font-size: 15px;
          font-weight: 800;
          color: #065f46;
        }

        .wa-meta-badge {
          font-size: 12.5px;
          color: #047857;
          display: flex;
          gap: 6px;
          align-items: center;
          margin-bottom: 4px;
        }

        .wa-meta-badge strong {
          font-family: monospace;
          font-size: 13.5px;
        }

        .wa-desc {
          margin: 0;
          font-size: 12px;
          color: #047857;
          opacity: 0.9;
        }

        /* Test Box */
        .wa-test-box {
          background: #fafbfc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .wa-test-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          color: #334155;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }

        .wa-test-form {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .wa-test-form input {
          flex: 1;
          min-width: 0;
          padding: 9px 14px;
          border-radius: 8px;
          border: 1.5px solid #cbd5e1;
          font-size: 13px;
          outline: none;
          transition: border-color 0.2s;
        }

        .wa-test-form input:focus {
          border-color: #25D366;
          box-shadow: 0 0 0 3px rgba(37, 211, 102, 0.1);
        }

        .wa-btn-test {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 16px;
          border-radius: 8px;
          background: #10b981;
          color: #ffffff;
          border: none;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s;
          white-space: nowrap;
        }

        .wa-btn-test:hover:not(:disabled) {
          background: #059669;
        }

        .wa-btn-test:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .wa-disconnect-row {
          display: flex;
          justify-content: flex-end;
        }

        .wa-btn-unlink {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          border-radius: 8px;
          background: #ffffff;
          border: 1px solid #fca5a5;
          color: #dc2626;
          font-size: 11.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }

        .wa-btn-unlink:hover {
          background: #fef2f2;
          border-color: #ef4444;
        }

        .spinning {
          animation: wa-spin 1s linear infinite;
        }

        @keyframes wa-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* ───────── UNIVERSAL RESPONSIVE BREAKPOINTS ───────── */
        @media (max-width: 768px) {
          .wa-card-header {
            flex-direction: column;
            align-items: flex-start;
            padding: 14px 16px;
          }
          .wa-refresh-btn {
            align-self: flex-end;
            margin-top: -6px;
          }
          .wa-card-body {
            padding: 16px;
          }
          .wa-setup-grid {
            grid-template-columns: 1fr;
            gap: 20px;
          }
          .wa-qr-display-panel {
            order: -1; /* Display QR above instructions on mobile for fast scanning */
          }
          .wa-qr-frame {
            width: min(220px, 75vw);
          }
          .wa-connected-details {
            flex-direction: column;
            text-align: center;
            align-items: center;
          }
          .wa-test-form {
            flex-direction: column;
            align-items: stretch;
          }
          .wa-btn-test {
            justify-content: center;
          }
          .wa-disconnect-row {
            justify-content: center;
          }
        }

        @media (max-width: 400px) {
          .wa-header-brand {
            flex-direction: column;
            align-items: flex-start;
          }
          .wa-title-row h3 {
            font-size: 15px;
          }
          .wa-qr-frame {
            width: 100%;
            max-width: 200px;
          }
        }
      `}</style>
    </div>
  );
}
