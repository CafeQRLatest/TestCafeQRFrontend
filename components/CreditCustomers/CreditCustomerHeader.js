import React from 'react';
import { FaUserFriends, FaTruck, FaPlus } from 'react-icons/fa';

export default function CreditCustomerHeader({ 
  mode = 'customers', 
  onModeChange, 
  onNewCustomer, 
  onNewVendor,
  showVendors = true,
}) {
  const isVendorMode = showVendors && mode === 'vendors';

  return (
    <div className="credit-head">
      <div className="credit-title-area">
        <h1>{isVendorMode ? 'Credit Vendors' : 'Credit Customers'}</h1>
        <p className="subtitle">
          {isVendorMode 
            ? 'Manage vendor ledger balances, purchase bills, and settlements' 
            : 'Manage customer ledger balances and payments'}
        </p>
      </div>

      {/* Top Mode Switcher Slider — Only shown when Purchase Module is ON */}
      {showVendors && (
        <div className="credit-mode-slider">
          <button 
            type="button"
            className={`slider-btn ${mode === 'customers' ? 'active' : ''}`} 
            onClick={() => onModeChange && onModeChange('customers')}
          >
            <FaUserFriends /> Customers
          </button>
          <button 
            type="button"
            className={`slider-btn ${mode === 'vendors' ? 'active' : ''}`} 
            onClick={() => onModeChange && onModeChange('vendors')}
          >
            <FaTruck /> Vendors
          </button>
        </div>
      )}

      <button className="primary" onClick={isVendorMode ? onNewVendor : onNewCustomer}>
        <FaPlus /> {isVendorMode ? 'New Vendor' : 'New Customer'}
      </button>
    </div>
  );
}
