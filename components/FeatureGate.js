import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/router';
import { FaCrown, FaArrowRight } from 'react-icons/fa';

export default function FeatureGate({ module, children, fallback }) {
  const { hasModule, isAuthenticated } = useAuth();
  const router = useRouter();

  if (!isAuthenticated) return null;

  const moduleNamesFriendly = {
    KOT: 'Kitchen Order Ticket (KOT)',
    INVENTORY: 'Inventory & Purchase ERP',
    CRM: 'Customer CRM & Loyalty',
    CREDIT_LEDGER: 'Credit Ledger (Udhaar)',
    TABLE_QR: 'Table QR Ordering',
    MENU_IMAGES: 'Menu Images & Rich UI',
    ONLINE_DELIVERY: 'Online Delivery (Direct)'
  };

  const friendlyName = moduleNamesFriendly[module] || module;

  if (hasModule(module)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <div className="gate-container">
      <div className="gate-card">
        <span className="gate-tag"><FaCrown /> PREMIUM ADD-ON</span>
        <h3>Unlock {friendlyName}</h3>
        <p>
          This module is currently inactive for your branch. Activate it instantly in your Billing Center to streamline operations, reduce wastage, and scale your restaurant.
        </p>
        <button className="gate-btn" onClick={() => router.push('/subscription')}>
          Explore Add-ons <FaArrowRight />
        </button>
      </div>

      <style jsx>{`
        .gate-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          padding: 40px 20px;
          background: #f8fafc;
          border-radius: 24px;
          border: 1px dashed #cbd5e1;
          margin: 20px 0;
        }
        .gate-card {
          max-width: 480px;
          text-align: center;
          padding: 40px;
          background: white;
          border-radius: 20px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.04);
          border: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .gate-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 800;
          color: #f97316;
          background: #fff7ed;
          padding: 6px 14px;
          border-radius: 100px;
          border: 1px solid #ffedd5;
          letter-spacing: 1px;
          margin-bottom: 20px;
        }
        h3 {
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
          margin: 0 0 12px;
          letter-spacing: -0.5px;
        }
        p {
          font-size: 14px;
          line-height: 1.6;
          color: #64748b;
          margin: 0 0 28px;
        }
        .gate-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 14px 28px;
          background: #f97316;
          color: white;
          font-size: 14px;
          font-weight: 800;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 14px rgba(249, 115, 22, 0.2);
        }
        .gate-btn:hover {
          background: #ea580c;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(249, 115, 22, 0.3);
        }
        @media (max-width: 480px) {
          .gate-container { padding: 20px 10px; min-height: auto; }
          .gate-card { padding: 24px 16px; }
          h3 { font-size: 18px; }
          p { font-size: 13px; margin-bottom: 20px; }
        }
      `}</style>
    </div>
  );
}
