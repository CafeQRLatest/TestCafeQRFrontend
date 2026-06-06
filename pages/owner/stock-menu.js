import React from 'react';
import Link from 'next/link';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import {
  FaBoxes, FaExchangeAlt, FaBalanceScale, FaHistory,
  FaDollarSign, FaFileAlt, FaClipboardList, FaArrowRight
} from 'react-icons/fa';

const stockModules = [
  {
    title: 'Stock Overview',
    desc:  'Real-time inventory balances across warehouses',
    href:  '/owner/stock-overview',
    icon:  <FaBoxes />,
    color: '#f97316',
    bg:    '#fff7ed',
  },
  {
    title: 'Stock Transfer',
    desc:  'Move inventory between warehouse locations',
    href:  '/owner/stock-transfers',
    icon:  <FaExchangeAlt />,
    color: '#3b82f6',
    bg:    '#eff6ff',
  },
  {
    title: 'Stock Adjustment',
    desc:  'Audit corrections, wastage & damage logging',
    href:  '/owner/stock-adjustments',
    icon:  <FaBalanceScale />,
    color: '#8b5cf6',
    bg:    '#faf5ff',
  },
  {
    title: 'Stock Valuation',
    desc:  'Total inventory worth by warehouse & product',
    href:  '/owner/stock-valuation',
    icon:  <FaDollarSign />,
    color: '#10b981',
    bg:    '#f0fdf4',
  },
  {
    title: 'Transfer Reports',
    desc:  'Track all inter-warehouse movements & status',
    href:  '/owner/stock-transfer-reports',
    icon:  <FaFileAlt />,
    color: '#0ea5e9',
    bg:    '#f0f9ff',
  },
  {
    title: 'Adjustment Reports',
    desc:  'Complete audit trail of stock corrections',
    href:  '/owner/stock-adjustment-reports',
    icon:  <FaClipboardList />,
    color: '#ec4899',
    bg:    '#fdf2f8',
  },
  {
    title: 'Stock Ledger',
    desc:  'Immutable transaction history & event log',
    href:  '/owner/stock-history',
    icon:  <FaHistory />,
    color: '#6366f1',
    bg:    '#eef2ff',
  },
];

export default function StockMenuPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']}>
      <DashboardLayout title="Stock Management">
        <div className="menu-wrap">

          {/* Section divider */}
          <div className="section-rule">
            <span className="section-label">Modules</span>
            <div className="rule-line" />
          </div>

          {/* Card grid */}
          <div className="card-grid">
            {stockModules.map((mod, i) => (
              <Link
                href={mod.href}
                key={i}
                className="m-card"
                style={{ '--c': mod.color, '--cbg': mod.bg }}
              >
                <div className="m-icon">{mod.icon}</div>
                <div className="m-text">
                  <span className="m-title">{mod.title}</span>
                  <span className="m-desc">{mod.desc}</span>
                </div>
                <FaArrowRight className="m-arrow" />
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

          /* ─── Section divider ─── */
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

          /* ─── Grid ─── */
          .card-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
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
          @media (max-width: 640px) {
            .card-grid { grid-template-columns: 1fr; gap: 6px; }
            .m-card { padding: 11px 13px; gap: 11px; }
            .m-icon { width: 34px; height: 34px; font-size: 14px; border-radius: 8px; }
            .m-title { font-size: 12.5px; }
          }
        `}</style>
      </DashboardLayout>
    </RoleGate>
  );
}
