import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';

import {
  FaBookOpen,
  FaCashRegister,
  FaFileInvoice,
  FaTimes,
  FaExclamationTriangle,
  FaArrowRight,
  FaShoppingBag,
  FaChartLine,
  FaWallet,
  FaBoxOpen,
  FaSignOutAlt,
  FaExpand,
  FaCompress,
  FaHdd,
  FaShieldAlt,
  FaBuilding,
  FaUsers,
  FaLock
} from 'react-icons/fa';
import DashboardLayout from '../components/DashboardLayout';
import api from '../utils/api';

function formatCurrency(n) {
  const num = Number(n || 0);
  return `₹${num.toFixed(2)}`;

import {
  FaBookOpen,
  FaCashRegister,
  FaFileInvoice,
  FaTimes,
  FaExclamationTriangle,
  FaArrowRight,
  FaShoppingBag,
  FaChartLine,
  FaWallet,
  FaBoxOpen,
  FaSignOutAlt,
  FaExpand,
  FaCompress,
  FaHdd,
  FaShieldAlt,
  FaBuilding,
  FaUsers,
  FaLock
} from 'react-icons/fa';
import DashboardLayout from '../components/DashboardLayout';
import api from '../utils/api';

function formatCurrency(n) {
  const num = Number(n || 0);
  return `₹${num.toFixed(2)}`;
}

export default function DashboardPage() {
  return <DashboardOverview />;
}
      });
    } else {
      document.exitFullscreen();
    }
  };
        </div>
      </div>
      <style jsx>{`
        .modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: fadeIn 0.2s; }
        .modal-content { background: white; width: 90%; max-width: 400px; border-radius: 24px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.2); }
        .modal-header { padding: 20px 24px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
        .modal-header h3 { margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; }
        .close-btn { background: none; border: none; font-size: 20px; color: #94a3b8; cursor: pointer; }
        .modal-body { padding: 32px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
        .info-item label { display: block; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px; }
        .info-item span { font-size: 16px; font-weight: 700; color: #1e293b; }
        .total-box { background: #f8fafc; padding: 20px; border-radius: 16px; text-align: center; border: 1px solid #e2e8f0; }
        .total-box label { font-size: 13px; color: #64748b; font-weight: 600; }
        .total-val { font-size: 32px; font-weight: 900; color: #f97316; margin-top: 4px; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
