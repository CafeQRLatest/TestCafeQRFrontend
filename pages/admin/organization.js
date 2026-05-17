import React from 'react';
import Link from 'next/link';
import DashboardLayout from '../../components/DashboardLayout';
import { FaBalanceScale, FaBuilding, FaMicrochip, FaUsers, FaArrowRight, FaTools, FaMoneyBillWave, FaTags, FaWarehouse } from 'react-icons/fa';

export default function OrganizationPage() {
  return (
    <OrganizationContent />
  );
}

function OrganizationContent() {
  const organizationMenus = [
    { 
      name: 'Client Management', 
      url: '/admin/client-profile', 
      description: 'Enterprise Details & Global Settings', 
      icon: <FaBuilding />, 
      color: "#6366f1" 
    },
    { 
      name: 'Branch Management', 
      url: '/admin/organization-details', 
      description: 'Branches, Locations & Operating Hours', 
      icon: <FaBuilding />, 
      color: "#8b5cf6" 
    },
    { 
        name: 'Terminal Management', 
        url: '/admin/terminals', 
        description: 'POS Counter & Ordering Points', 
        icon: <FaMicrochip />, 
        color: "#f59e0b" 
      },
    { 
      name: 'Device Management', 
      url: '/admin/devices', 
      description: 'Hardware Inventory & Device Linking', 
      icon: <FaTools />, 
      color: "#ec4899" 
    },
    { 
      name: 'Staff & Permissions', 
      url: '/admin/users', 
      description: 'User Access Control & Role Management', 
      icon: <FaUsers />, 
      color: "#10b981" 
    },
    { 
      name: 'Warehouse Management', 
      url: '/admin/warehouses', 
      description: 'Manage Storage Locations & Distribution Centers', 
      icon: <FaWarehouse />, 
      color: "#06b6d4" 
    },
    { 
      name: 'Currency Masters', 
      url: '/owner/currencies', 
      description: 'Multi-Currency Setup & Exchange Rates', 
      icon: <FaMoneyBillWave />, 
      color: "#14b8a6" 
    },
    { 
      name: 'Price List Masters', 
      url: '/owner/pricelists', 
      description: 'Sales & Purchase Pricing with Versioning', 
      icon: <FaTags />, 
      color: "#f97316" 
    },
    {
      name: 'Accounting Foundation',
      url: '/owner/accounting',
      description: 'Chart of Accounts, Journals & Ledgers',
      icon: <FaBalanceScale />,
      color: "#0f766e"
    }
  ];

  return (
    <DashboardLayout 
      title="Organization Management" 
      showBack={true}
    >
        <div className="dense-grid">
           {organizationMenus.map((item, idx) => {
             return (
               <Link href={item.url} key={idx} className="menu-box">
                  <div className="box-icon" style={{ background: `${item.color}15`, color: item.color }}>
                    {item.icon}
                  </div>
                  <div className="box-content">
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                  </div>
                  <FaArrowRight className="box-arrow" />
               </Link>
             );
           })}
        </div>

      <style jsx>{`
        .dense-grid {
           display: grid;
           grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
           gap: 20px;
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

        @media (max-width: 640px) {
           .dense-grid { grid-template-columns: 1fr; }
        }

        .empty-state {
          grid-column: 1 / -1;
          background: white;
          padding: 60px 20px;
          border-radius: 20px;
          text-align: center;
          border: 1px dashed #cbd5e1;
        }
        .empty-state h3 { color: #0f172a; margin-bottom: 8px; }
        .empty-state p { color: #64748b; margin-bottom: 24px; max-width: 400px; margin-inline: auto; font-size: 14px; }
        .retry-btn {
          background: #f97316;
          color: white;
          border: none;
          padding: 10px 24px;
          border-radius: 10px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s;
        }
        .retry-btn:hover { transform: scale(1.05); }
      `}</style>
    </DashboardLayout>
  );
}
