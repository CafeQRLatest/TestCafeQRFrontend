import React from 'react';
import Link from 'next/link';
import DashboardLayout from '../../components/DashboardLayout';
import { FaBalanceScale, FaBuilding, FaMicrochip, FaUsers, FaArrowRight, FaTools, FaMoneyBillWave, FaTags, FaWarehouse, FaCreditCard } from 'react-icons/fa';

export default function OrganizationPage() {
  return <OrganizationContent />;
}

function OrganizationContent() {
  const organizationMenus = [
    { name: 'Client Management',    url: '/admin/client-profile',         desc: 'Enterprise details & global settings',          icon: <FaBuilding />,      color: '#6366f1', bg: '#eef2ff' },
    { name: 'Branch Management',    url: '/admin/organization-details',   desc: 'Branches, locations & operating hours',         icon: <FaBuilding />,      color: '#8b5cf6', bg: '#faf5ff' },
    { name: 'Terminal Management',  url: '/admin/terminals',              desc: 'POS counter & ordering points',                 icon: <FaMicrochip />,     color: '#f59e0b', bg: '#fffbeb' },
    { name: 'Device Management',    url: '/admin/devices',                desc: 'Hardware inventory & device linking',           icon: <FaTools />,         color: '#ec4899', bg: '#fdf2f8' },
    { name: 'Staff & Permissions',  url: '/admin/users',                  desc: 'User access control & role management',         icon: <FaUsers />,         color: '#10b981', bg: '#f0fdf4' },
    { name: 'Warehouse Management', url: '/admin/warehouses',             desc: 'Manage storage locations & distribution',       icon: <FaWarehouse />,     color: '#06b6d4', bg: '#f0f9ff' },
    { name: 'Currency Masters',     url: '/owner/currencies',             desc: 'Multi-currency setup & exchange rates',         icon: <FaMoneyBillWave />, color: '#14b8a6', bg: '#f0fdfa' },
    { name: 'Price List Masters',   url: '/owner/pricelists',             desc: 'Sales & purchase pricing with versioning',      icon: <FaTags />,          color: '#f97316', bg: '#fff7ed' },
    { name: 'Payment Types',        url: '/owner/payment-types',          desc: 'Payment methods for sales, purchases & expenses', icon: <FaCreditCard />,   color: '#6366f1', bg: '#eef2ff' },
  ];

  return (
    <DashboardLayout title="Organization Management" showBack={false}>
      <div className="menu-wrap">

        <div className="section-rule">
          <span className="section-label">Modules</span>
          <div className="rule-line" />
        </div>

        <div className="card-grid">
          {organizationMenus.map((item, i) => (
            <Link href={item.url} key={i} legacyBehavior>
              <a
                className="m-card"
                style={{ '--c': item.color, '--cbg': item.bg }}
              >
                <div className="m-icon">{item.icon}</div>
                <div className="m-text">
                  <span className="m-title">{item.name}</span>
                  <span className="m-desc">{item.desc}</span>
                </div>
                <FaArrowRight className="m-arrow" />
              </a>
            </Link>
          ))}
        </div>
      </div>

      <style jsx>{`
        .menu-wrap {
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-width: 1080px;
          margin: 0 auto;
          padding-bottom: 32px;
        }
        .section-rule {
          display: flex;
          align-items: center;
          gap: 10px;
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
        .card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
          gap: 8px;
        }
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
        }
        .m-card:hover {
          border-color: var(--c);
          box-shadow: 0 4px 16px -6px rgba(0,0,0,0.08);
          transform: translateY(-1px);
        }
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
