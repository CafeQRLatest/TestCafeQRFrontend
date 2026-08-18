import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { CURRENT_TERMS_VERSION, TERMS_SUMMARY_POINTS } from '../utils/termsConfig';
import { FaShieldAlt, FaCheckCircle, FaExclamationCircle, FaExternalLinkAlt, FaPrint, FaFileContract } from 'react-icons/fa';

export default function TermsAcceptanceModal() {
  const { isAuthenticated, loading, termsAcceptedVersion, recordTermsAcceptance } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // If user is not logged in, or is still initializing, or has already accepted the current version, do not render
  if (loading || !isAuthenticated || termsAcceptedVersion === CURRENT_TERMS_VERSION) {
    return null;
  }

  const handleAccept = async () => {
    if (!agreed) {
      setError('Please check the box to confirm that you have read and agree to the terms.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await recordTermsAcceptance(CURRENT_TERMS_VERSION);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to record terms acceptance. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="terms-backdrop" role="dialog" aria-modal="true">
      <div className="terms-modal">
        {/* Top Header Badge */}
        <div className="terms-header">
          <div className="badge-row">
            <span className="compliance-badge">
              <FaShieldAlt className="icon-shield" /> MANDATORY POLICY UPDATE
            </span>
            <span className="version-badge">{CURRENT_TERMS_VERSION}</span>
          </div>
          <h2>Terms of Service & Hardware Policy</h2>
          <p className="header-subtitle">
            Please review and accept our updated terms of service, hardware warranty notice, and subscription policies to continue using CafeQR POS.
          </p>
        </div>

        {/* Scrollable Policy Highlights */}
        <div className="terms-body">
          <div className="warranty-callout">
            <div className="callout-icon">
              <FaPrint />
            </div>
            <div className="callout-text">
              <strong>Important Hardware Resale & Warranty Notice</strong>
              <span>
                CafeQR LLP acts as a reseller. All hardware warranties, service, and repairs for thermal printers are provided exclusively by the respective manufacturer (SHREYANS / Hoin) or authorized distributors.
              </span>
            </div>
          </div>

          <div className="points-grid">
            {TERMS_SUMMARY_POINTS.map((pt, idx) => (
              <div key={idx} className="point-card">
                <div className="point-title">
                  <FaCheckCircle className="check-icon" />
                  <h4>{pt.title}</h4>
                </div>
                <p>{pt.desc}</p>
              </div>
            ))}
          </div>

          <div className="external-link-row">
            <a
              href="https://cafeqr.in/#terms"
              target="_blank"
              rel="noopener noreferrer"
              className="terms-full-link"
            >
              <FaFileContract /> Read Full Legal Terms & Conditions on CafeQR.in <FaExternalLinkAlt className="ext-icon" />
            </a>
          </div>
        </div>

        {/* Action Footer */}
        <div className="terms-footer">
          <label className={`agree-checkbox ${agreed ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked);
                if (e.target.checked) setError(null);
              }}
              disabled={submitting}
            />
            <span className="checkbox-label">
              I have read, understood, and agree to the <strong>CafeQR Terms of Service</strong>, <strong>Hardware Warranty Disclaimer</strong>, and <strong>Privacy Policy</strong>.
            </span>
          </label>

          {error && (
            <div className="error-banner">
              <FaExclamationCircle />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleAccept}
            disabled={!agreed || submitting}
            className={`accept-btn ${submitting ? 'submitting' : ''}`}
          >
            {submitting ? 'RECORDING ACCEPTANCE...' : 'I AGREE & CONTINUE TO CAFEQR'}
          </button>
        </div>
      </div>

      <style jsx>{`
        .terms-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.3s ease-out;
        }

        .terms-modal {
          background: #ffffff;
          border-radius: 28px;
          width: 100%;
          max-width: 640px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);
          overflow: hidden;
          animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .terms-header {
          padding: 32px 32px 20px;
          border-bottom: 1px solid #f1f5f9;
          background: linear-gradient(180deg, #fafafa 0%, #ffffff 100%);
        }

        .badge-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }

        .compliance-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 800;
          color: #f97316;
          background: #fff7ed;
          border: 1px solid #ffedd5;
          padding: 4px 12px;
          border-radius: 999px;
          letter-spacing: 0.5px;
        }

        .version-badge {
          font-size: 11px;
          font-weight: 800;
          color: #64748b;
          background: #f1f5f9;
          padding: 4px 10px;
          border-radius: 999px;
        }

        h2 {
          font-size: 24px;
          font-weight: 800;
          color: #0f172a;
          margin: 0 0 8px;
          letter-spacing: -0.5px;
        }

        .header-subtitle {
          font-size: 13.5px;
          color: #64748b;
          margin: 0;
          line-height: 1.5;
        }

        .terms-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px 32px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .warranty-callout {
          display: flex;
          gap: 14px;
          background: #fffbeb;
          border: 1.5px solid #fef3c7;
          border-radius: 18px;
          padding: 16px;
          align-items: flex-start;
        }

        .callout-icon {
          width: 36px;
          height: 36px;
          background: #fde68a;
          color: #b45309;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
        }

        .callout-text {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .callout-text strong {
          font-size: 13px;
          font-weight: 800;
          color: #92400e;
        }

        .callout-text span {
          font-size: 12px;
          color: #78350f;
          line-height: 1.45;
        }

        .points-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }

        .point-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 14px 16px;
        }

        .point-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }

        .check-icon {
          font-size: 13px;
          color: #10b981;
          flex-shrink: 0;
        }

        .point-title h4 {
          font-size: 13px;
          font-weight: 700;
          color: #1e293b;
          margin: 0;
        }

        .point-card p {
          font-size: 12px;
          color: #64748b;
          margin: 0;
          line-height: 1.45;
          padding-left: 21px;
        }

        .external-link-row {
          text-align: center;
          padding: 8px 0;
        }

        .terms-full-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #f97316;
          font-size: 12.5px;
          font-weight: 700;
          text-decoration: none;
          padding: 8px 16px;
          background: #fff7ed;
          border-radius: 12px;
          transition: all 0.2s;
        }

        .terms-full-link:hover {
          background: #ffedd5;
          transform: translateY(-1px);
        }

        .ext-icon {
          font-size: 11px;
        }

        .terms-footer {
          padding: 20px 32px 28px;
          border-top: 1px solid #f1f5f9;
          background: #fafafa;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .agree-checkbox {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          cursor: pointer;
          user-select: none;
          background: #ffffff;
          border: 1.5px solid #e2e8f0;
          border-radius: 14px;
          padding: 12px 16px;
          transition: all 0.2s;
        }

        .agree-checkbox.checked {
          border-color: #f97316;
          background: #fffdfa;
          box-shadow: 0 4px 15px rgba(249, 115, 22, 0.08);
        }

        .agree-checkbox input {
          width: 18px;
          height: 18px;
          margin-top: 2px;
          accent-color: #f97316;
          cursor: pointer;
          flex-shrink: 0;
        }

        .checkbox-label {
          font-size: 12px;
          color: #475569;
          line-height: 1.45;
        }

        .checkbox-label strong {
          color: #0f172a;
        }

        .error-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #fef2f2;
          border: 1px solid #fee2e2;
          color: #dc2626;
          font-size: 12px;
          font-weight: 700;
          padding: 10px 14px;
          border-radius: 12px;
        }

        .accept-btn {
          width: 100%;
          padding: 16px;
          background: #f97316;
          color: #ffffff;
          border: none;
          border-radius: 16px;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.5px;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 10px 20px rgba(249, 115, 22, 0.25);
        }

        .accept-btn:hover:not(:disabled) {
          background: #ea580c;
          box-shadow: 0 15px 30px rgba(249, 115, 22, 0.35);
          transform: translateY(-2px);
        }

        .accept-btn:disabled {
          background: #cbd5e1;
          color: #94a3b8;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scaleUp {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }

        @media (max-width: 640px) {
          .terms-modal {
            max-height: 95vh;
            border-radius: 20px;
          }
          .terms-header, .terms-body, .terms-footer {
            padding: 20px 20px;
          }
          h2 {
            font-size: 20px;
          }
        }
      `}</style>
    </div>
  );
}
