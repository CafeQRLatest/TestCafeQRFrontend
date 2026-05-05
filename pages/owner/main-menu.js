import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../utils/api';
import { 
  FaCamera, FaReceipt, FaTags, FaFilter, FaUsers, FaCog, FaChartLine, FaCreditCard, FaUserFriends, FaShoppingCart, FaChair, FaChartBar,
  FaArrowRight,
  FaBuilding,
  FaBoxes,
  FaBookOpen,
  FaCashRegister,
  FaFileInvoice
} from 'react-icons/fa';

export default function MainMenuPage() {
  return <MainMenuContent />;
}

function MainMenuContent() {
  const { userRole, loading: authLoading, isAuthenticated } = useAuth();
  const [assignedMenus, setAssignedMenus] = useState([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      fetchAssignedMenus();
    }
  }, [isAuthenticated]);

  const fetchAssignedMenus = async () => {
    try {
      const resp = await api.get('/api/v1/users/menus');
      if (resp.data.success) {
        setAssignedMenus(resp.data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard permissions:", err);
    } finally {
      setFetching(false);
    }
  };

  // Icon and color map by menu name
  const iconMap = {
    "Organization":     { icon: <FaBuilding />,    color: "#6366f1" },
    "Subscription":     { icon: <FaCreditCard />,   color: "#f59e0b" },
    "Dashboard":        { icon: <FaChartLine />,    color: "#f97316" },
    "Product Management":  { icon: <FaBookOpen />,     color: "#3b82f6" },
    "Sales":            { icon: <FaChartBar />,     color: "#10b981" },
    "Billing & Reports":{ icon: <FaFileInvoice />,  color: "#8b5cf6" },
    "Reports & Billing":{ icon: <FaFileInvoice />,  color: "#8b5cf6" },
    "Stock":            { icon: <FaBoxes />,       color: "#ea580c" },
    "Table Management": { icon: <FaChair />,       color: "#f97316" },
    "Document Sequences":{ icon: <FaFileInvoice />, color: "#6366f1" },
  };

  // Only show PARENT menus and Filter out Point of Sale
  const parentMenus = assignedMenus.filter(m => (!m.parentId && !m.parent_id) && m.name !== "Point of Sale");

  // Map parent menus to display items
  const filteredItems = parentMenus.map(m => ({
    title: m.name,
    desc: m.description || '',
    href: m.url,
    icon: iconMap[m.name]?.icon || <FaBuilding />,
    color: iconMap[m.name]?.color || "#64748b"
  }));

  if (authLoading || fetching) {
    return (
      <div className="loading-permissions">
        <div className="loader-box">
           <div className="spinner"></div>
           <p>Initializing Business Suite...</p>
        </div>
        <style jsx>{`
          .loading-permissions { height: 100vh; display: flex; align-items: center; justify-content: center; background: #f1f5f9; font-family: 'Plus Jakarta Sans', sans-serif; }
          .loader-box { text-align: center; }
          .spinner { width: 40px; height: 40px; border: 4px solid #e2e8f0; border-top-color: #f97316; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; }
          @keyframes spin { to { transform: rotate(360deg); } }
          p { color: #64748b; font-weight: 600; font-size: 15px; }
        `}</style>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <DashboardLayout title="Business Suite">
        <div className="dense-grid">
           {filteredItems.map((item, idx) => (
             <Link href={item.href} key={idx} className="menu-box">
                <div className="box-icon" style={{ background: `${item.color}15`, color: item.color }}>
                  {item.icon}
                </div>
                <div className="box-content">
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </div>
                <FaArrowRight className="box-arrow" />
             </Link>
           ))}
        </div>

      <style jsx>{`
        .dense-grid {
           display: grid;
           grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
           gap: 16px;
        }
        @media (max-width: 640px) {
           .dense-grid { grid-template-columns: 1fr; }
        }

        .menu-box {
          background: white;
          padding: 24px;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          gap: 20px;
          text-decoration: none;
          transition: border-color 0.2s;
        }
        .menu-box:hover {
          border-color: #f97316;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }

        .box-icon {
          width: 52px; height: 52px;
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          font-size: 22px;
          flex-shrink: 0;
        }

        .box-content h3 { margin: 0; font-size: 16px; font-weight: 800; color: #0f172a; }
        .box-content p { margin: 4px 0 0; font-size: 13px; color: #64748b; line-height: 1.4; font-weight: 500; }

        .box-arrow {
          margin-left: auto;
          color: #cbd5e1;
          font-size: 14px;
        }
        .menu-box:hover .box-arrow { color: #f97316; }

        @media (max-width: 480px) {
           .menu-box { padding: 16px; gap: 16px; }
           .box-icon { width: 44px; height: 44px; font-size: 18px; }
           .box-content h3 { font-size: 15px; }
           .box-content p { font-size: 12px; }
        }
      `}</style>
    </DashboardLayout>
  );
}
