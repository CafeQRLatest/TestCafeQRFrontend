import React from 'react';
import { FaBook, FaCheck, FaWallet, FaUsers, FaTruck } from 'react-icons/fa';

export default function CreditCustomerKPIs({ mode = 'customers', totals, allocationMode, money }) {
  const isVendor = mode === 'vendors';

  return (
    <div className="rpt-kpi-grid">
      <div className="rpt-kpi" style={{ borderLeft: '4px solid #3b82f6' }}>
        <div className="rpt-kpi-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}>
          {isVendor ? <FaTruck /> : <FaUsers />}
        </div>
        <div className="rpt-kpi-data">
          <span className="rpt-kpi-label">{isVendor ? 'Active Vendors' : 'Active Customers'}</span>
          <span className="rpt-kpi-val">{totals.active}</span>
        </div>
      </div>
      <div className="rpt-kpi" style={{ borderLeft: '4px solid #dc2626' }}>
        <div className="rpt-kpi-icon" style={{ background: '#fee2e2', color: '#dc2626' }}><FaWallet /></div>
        <div className="rpt-kpi-data">
          <span className="rpt-kpi-label">{isVendor ? 'Total Owed to Vendors' : 'Total Owed'}</span>
          <span className={`rpt-kpi-val ${Number(totals.owed || 0) < 0 ? 'text-danger' : ''}`}>
            {money(totals.owed)}
          </span>
        </div>
      </div>
      <div className="rpt-kpi" style={{ borderLeft: '4px solid #0f766e' }}>
        <div className="rpt-kpi-icon" style={{ background: '#ccfbf1', color: '#0f766e' }}><FaBook /></div>
        <div className="rpt-kpi-data">
          <span className="rpt-kpi-label">Total Credit Life</span>
          <span className="rpt-kpi-val">{money(totals.lifetime)}</span>
        </div>
      </div>
      <div className="rpt-kpi" style={{ borderLeft: '4px solid #f97316' }}>
        <div className="rpt-kpi-icon" style={{ background: '#fff7ed', color: '#f97316' }}><FaCheck /></div>
        <div className="rpt-kpi-data">
          <span className="rpt-kpi-label">Allocation Mode</span>
          <span className="rpt-kpi-val">{allocationMode === 'MANUAL' ? 'Manual' : 'Oldest First'}</span>
        </div>
      </div>
    </div>
  );
}
