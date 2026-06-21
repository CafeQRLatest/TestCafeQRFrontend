import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../utils/api';
import { isMenuVisibleForConfig } from '../../utils/moduleVisibility';
import {
  FaChartLine, FaCreditCard, FaBoxes, FaBookOpen, FaBalanceScale,
  FaCashRegister, FaFileInvoice, FaTable, FaBuilding, FaUserFriends,
  FaArrowRight, FaShoppingCart, FaDatabase, FaUsers, FaWifi, FaRecycle,
  FaCalculator, FaReceipt, FaCog, FaIdBadge, FaCrown, FaChartBar
} from 'react-icons/fa';

export default function MainMenuPage() {
  return <MainMenuContent />;
}

function MainMenuContent() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [assignedMenus, setAssignedMenus] = useState([]);
  const [config, setConfig] = useState(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (isAuthenticated) fetchAssignedMenus();
  }, [isAuthenticated]);

  const fetchAssignedMenus = async () => {
    try {
      const resp = await api.get('/api/v1/users/menus');
      if (resp.data.success) setAssignedMenus(resp.data.data || []);
      const configResp = await api.get('/api/v1/configurations').catch(() => null);
      if (configResp?.data?.success) setConfig(configResp.data.data || null);
    } catch (err) {
      console.error('Failed to fetch menus:', err);
    } finally {
      setFetching(false);
    }
  };

  const iconMap = {
    'Organization':       { name: 'Organization & Team',  desc: 'Branch & team management',      icon: <FaBuilding />,     color: '#6366f1', bg: '#eef2ff', cat: 'Settings'    },
    'Subscription':       { name: 'Subscription',         desc: 'Billing & plans',               icon: <FaCreditCard />,   color: '#f59e0b', bg: '#fffbeb', cat: 'Settings'    },
    'Dashboard':          { name: 'Overview',             desc: 'Live business analytics',       icon: <FaChartLine />,    color: '#f97316', bg: '#fff7ed', cat: 'Operations'  },
    'Product Management': { name: 'Products',             desc: 'Menu & price management',       icon: <FaBookOpen />,     color: '#3b82f6', bg: '#eff6ff', cat: 'Operations'  },
    'Sales':              { name: 'POS',                  desc: 'Point of sale terminal',        icon: <FaCashRegister />, color: '#10b981', bg: '#f0fdf4', cat: 'Operations'  },
    'Table Management':   { name: 'Table Management',     desc: 'Dine-in floor plan',            icon: <FaTable />,        color: '#f97316', bg: '#fff7ed', cat: 'Operations'  },
    'Billing & Reports':  { name: 'Reports & Billing',    desc: 'Invoices & tax reports',        icon: <FaFileInvoice />,  color: '#8b5cf6', bg: '#faf5ff', cat: 'Insights',   url: '/owner/reports' },
    'Reports & Billing':  { name: 'Reports & Billing',    desc: 'Tax & invoices',                icon: <FaCalculator />,   color: '#3b82f6', bg: '#eff6ff', cat: 'Insights',   url: '/owner/reports' },
    'Billing & Reports':  { name: 'Reports & Billing',    desc: 'Tax & invoices',                icon: <FaCalculator />,   color: '#3b82f6', bg: '#eff6ff', cat: 'Insights',   url: '/owner/reports' },
    'Stock':              { name: 'Stock & Inventory',    desc: 'Manage inventory & stock',      icon: <FaBoxes />,        color: '#ea580c', bg: '#fff7ed', cat: 'Operations'  },
    'Accounting':         { name: 'Accounting',           desc: 'Journal & ledgers',             icon: <FaBalanceScale />, color: '#10b981', bg: '#f0fdf4', cat: 'Insights'    },
    'Credit Customers':   { name: 'Credit Customers',     desc: 'Customer credit ledger',        icon: <FaUsers />,        color: '#14b8a6', bg: '#f0fdfa', cat: 'Insights'    },
    'Document Sequences': { name: 'Document Sequences',   desc: 'Invoice numbering',             icon: <FaFileInvoice />,  color: '#3b82f6', bg: '#eff6ff', cat: 'Account'    },
    'Purchase Orders':    { name: 'Purchase Orders',      desc: 'Vendor PO management',          icon: <FaShoppingCart />, color: '#8b5cf6', bg: '#f5f3ff', cat: 'Operations' },
    'Partners':           { name: 'Partners',             desc: 'B2B Integrations',              icon: <FaUserFriends />,  color: '#f59e0b', bg: '#fffbeb', cat: 'Account'    },
    'Data Backup':        { name: 'Data Backup',          desc: 'Export & archive',              icon: <FaDatabase />,     color: '#10b981', bg: '#f0fdf4', cat: 'Account'    },
    'Waste Management':   { name: 'Waste Management',     desc: 'Track & reduce food waste',     icon: <FaRecycle />,      color: '#84cc16', bg: '#f7fee7', cat: 'Operations'  },
    'Expenses':           { name: 'Expenses & Bills',     desc: 'Track outgoing cash',           icon: <FaReceipt />,      color: '#f43f5e', bg: '#fff1f2', cat: 'Insights'    },
    'Configurations':     { name: 'Settings',             desc: 'Global settings',               icon: <FaCog />,          color: '#64748b', bg: '#f8fafc', cat: 'Account'    },
    'Point of Sale':      { name: 'POS',                  desc: 'Point of sale terminal',        icon: <FaCashRegister />, color: '#10b981', bg: '#f0fdf4', cat: 'Operations', url: '/owner/sales' },
    'Customers':          { name: 'Customers',            desc: 'Client CRM & profiles',         icon: <FaIdBadge />,      color: '#3b82f6', bg: '#eff6ff', cat: 'Customers' },
    'Loyalty':            { name: 'Loyalty',              desc: 'Reward points & tiers',         icon: <FaCrown />,        color: '#f59e0b', bg: '#fffbeb', cat: 'Customers' },
    'Analytics':          { name: 'Analytics',            desc: 'Business intelligence',         icon: <FaChartBar />,     color: '#8b5cf6', bg: '#f5f3ff', cat: 'Insights' },
    'Sales_Insight':      { name: 'Sales',                desc: 'Sales performance',             icon: <FaChartLine />,    color: '#06b6d4', bg: '#ecfeff', cat: 'Insights' },
  };

  const categoryOrder = ['Operations', 'Insights', 'Customers', 'Account'];

  const hasPointOfSale = assignedMenus.some(menu => menu.name === 'Point of Sale');
  const allowedMenus = assignedMenus.filter(m => {
    if (m.parentId || m.parent_id || m.name === 'Offline Sync Center') return false;
    if (m.name === 'Sales' && hasPointOfSale) return false;
    return isMenuVisibleForConfig(m, config);
  });

  // Deduplicate by resolved name to avoid showing same item twice
  const seenNames = new Set();
  const filteredItems = [];
  allowedMenus.forEach(m => {
    const cfg = iconMap[m.name] || {};
    const resolvedName = cfg.name || m.name;
    if (seenNames.has(resolvedName)) return;
    seenNames.add(resolvedName);
    filteredItems.push({
      title: resolvedName,
      desc:  cfg.desc  || m.description || '',
      href:  cfg.url   || m.url,
      icon:  cfg.icon  || <FaBuilding />,
      color: cfg.color || '#64748b',
      bg:    cfg.bg    || '#f8fafc',
      cat:   cfg.cat   || 'Operations',
    });
  });

  filteredItems.push({
    title: 'Offline Sync',
    desc:  'Manage offline queue & sync',
    href:  '/owner/offline-sync',
    icon:  <FaWifi />,
    color: '#f59e0b',
    bg:    '#fffbeb',
    cat:   'Settings',
  });

  // Group by category
  const grouped = {};
  categoryOrder.forEach(c => { grouped[c] = []; });
  filteredItems.forEach(item => {
    const c = categoryOrder.includes(item.cat) ? item.cat : 'Operations';
    grouped[c].push(item);
  });

  if (authLoading || fetching) {
    return (
      <div className="loading-screen">
        <div className="loading-ring" />
        <style jsx>{`
          .loading-screen { height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8fafc; }
          .loading-ring { width: 32px; height: 32px; border: 2.5px solid #e2e8f0; border-top-color: #f97316; border-radius: 50%; animation: spin 0.7s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <DashboardLayout title="Business Suite">
      <div className="menu-wrap">
        {categoryOrder.map(cat => {
          const items = grouped[cat];
          if (!items || items.length === 0) return null;
          return (
            <div key={cat} className="cat-block">

              {/* Minimal section divider */}
              <div className="section-rule">
                <span className="section-label">{cat}</span>
                <div className="rule-line" />
              </div>

              {/* Grid of cards */}
              <div className="card-grid">
                {items.map((item, i) => (
                  <Link
                    href={item.href}
                    key={i}
                    className="m-card"
                    style={{ '--c': item.color, '--cbg': item.bg }}
                  >
                    <div className="m-icon">
                      {item.icon}
                    </div>
                    <div className="m-text">
                      <span className="m-title">{item.title}</span>
                      <span className="m-desc">{item.desc}</span>
                    </div>
                    <FaArrowRight className="m-arrow" />
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .menu-wrap {
          display: flex;
          flex-direction: column;
          gap: 28px;
          max-width: 1200px;
          margin: 0 auto;
          padding-bottom: 32px;
        }

        /* ─── Section divider ─── */
        .section-rule {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }
        .section-label {
          font-size: 10.5px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #94a3b8;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .rule-line {
          flex: 1;
          height: 1px;
          background: #e2e8f0;
        }

        /* ─── Grid ─── */
        .card-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }

        /* ─── Card ─── */
        .m-card {
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 13px 15px;
          background: #fff;
          border: 1px solid #f1f5f9;
          border-radius: 12px;
          text-decoration: none;
          transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s;
          position: relative;
          overflow: hidden;
        }
        .m-card:hover {
          border-color: var(--c);
          box-shadow: 0 4px 16px -6px rgba(0,0,0,0.08);
          transform: translateY(-1px);
        }

        /* ─── Icon ─── */
        .m-icon {
          width: 38px;
          height: 38px;
          border-radius: 9px;
          background: var(--cbg);
          color: var(--c);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
          transition: background 0.18s, color 0.18s;
        }
        .m-card:hover .m-icon {
          background: var(--c);
          color: #fff;
        }

        /* ─── Text ─── */
        .m-text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .m-title {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .m-desc {
          font-size: 11px;
          color: #94a3b8;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ─── Arrow ─── */
        .m-arrow {
          font-size: 10px;
          color: #cbd5e1;
          flex-shrink: 0;
          transition: color 0.18s, transform 0.18s;
        }
        .m-card:hover .m-arrow {
          color: var(--c);
          transform: translateX(2px);
        }

        /* ─── Responsive ─── */
        @media (max-width: 1024px) {
          .card-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 768px) {
          .card-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .card-grid { grid-template-columns: 1fr; gap: 6px; }
          .m-card { padding: 11px 13px; gap: 11px; }
          .m-icon { width: 34px; height: 34px; font-size: 14px; border-radius: 8px; }
          .m-title { font-size: 12.5px; }
        }
      `}</style>
    </DashboardLayout>
  );
}
